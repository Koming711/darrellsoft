// /src/lib/subscription-reminders.ts
// Pengingat masa aktif langganan (notifikasi otomatis Task 43):
//   • 7 hari sebelum berakhir → "MASA BERLANGGANAN SEGERA HABIS"
//   • 3 hari sebelum berakhir → "PENGINGAT PERPANJANGAN LANGGANAN"
//   • 1 hari sebelum berakhir → "PERINGATAN! LANGGANAN BESOK BERAKHIR"
//   • hari terakhir           → "HARI TERAKHIR BERLANGGANAN"
//   • setelah berakhir        → "MASA BERLANGGANAN TELAH HABIS"
//
// PENERIMA: pemilik langganan (Owner) + SELURUH anggota grupnya
// (GrupAnggota status != keluar). Grup lain TIDAK menerima notifikasi
// milik grup ini — penerima dihitung per langganan (isolasi per grup).
//
// IDEMPOTEN: setiap pengingat terikat pada pasangan (penerima, judul,
// [ref:plan:endDate]) — sweep berkali-kali tidak menduplikasi. Setelah
// Owner memperpanjang (endDate berubah), pengingat baru dibuat lagi untuk
// periode baru secara otomatis; pengingat periode lama tidak dikirim ulang.
//
// ZONA WAKTU: selisih hari memakai kalender tanggal Asia/Jakarta (UTC+7).
//
// TRIGGER (tiga titik agar tetap jalan tanpa browser terbuka):
//   1. GET /api/cron/subscription-reminders        → cron harian Vercel (utama)
//   2. GET /api/subscription/my                    → per-user (fallback pelanggan buka halaman)
//   3. GET /api/panel-admin/subscription-stats     → sweep global (throttle 3 menit)

import { db } from '@/lib/db'
import { fanoutNotification, stripRef } from '@/lib/notify-fanout'
import { DAY_MS, formatDate } from '@/lib/subscription'

const SWEEP_INTERVAL_MS = 3 * 60 * 1000 // sweep global maksimal 1x / 3 menit
let lastGlobalSweepAt = 0

export type ReminderKind = 'h7' | 'h3' | 'h1' | 'h0' | 'habis'

/**
 * Buang penanda internal [ref:...] dari body notifikasi sebelum ditampilkan
 * ke client (marker hanya untuk dedupe — jangan bocor ke UI).
 */
export function stripReminderRef(body: string): string {
  return stripRef(body)
}

/** Kunci tanggal (yyyy-mm-dd) dalam zona waktu Asia/Jakarta (UTC+7, tanpa DST). */
function jakartaDateKey(d: Date): string {
  return new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** Selisih hari kalender (Jakarta) antara endDate dan hari ini. */
function calendarDaysLeft(end: Date): number {
  const today = Date.parse(`${jakartaDateKey(new Date())}T00:00:00Z`)
  const endDay = Date.parse(`${jakartaDateKey(end)}T00:00:00Z`)
  return Math.round((endDay - today) / DAY_MS)
}

/** Judul + isi tiap jenis pengingat (sesuai template notifikasi resmi). */
function reminderContent(
  kind: ReminderKind,
  ctx: { perusahaan: string; planName: string; endDate: Date }
): { title: string; body: string } {
  const { perusahaan, planName, endDate } = ctx
  switch (kind) {
    case 'h7':
      return {
        title: 'MASA BERLANGGANAN SEGERA HABIS',
        body:
          `Masa berlangganan Darrellsoft perusahaan ${perusahaan} akan berakhir dalam 7 hari lagi.\n\n` +
          `Paket: ${planName}\nTanggal Berakhir: ${formatDate(endDate)}\n\n` +
          `Silakan lakukan perpanjangan agar aplikasi tetap dapat digunakan tanpa gangguan.`,
      }
    case 'h3':
      return {
        title: 'PENGINGAT PERPANJANGAN LANGGANAN',
        body:
          `Masa berlangganan Darrellsoft Anda tersisa 3 hari lagi.\n\n` +
          `Segera lakukan perpanjangan agar layanan tetap aktif.`,
      }
    case 'h1':
      return {
        title: 'PERINGATAN! LANGGANAN BESOK BERAKHIR',
        body:
          `Masa berlangganan Darrellsoft Anda akan berakhir besok.\n\n` +
          `Segera lakukan pembayaran perpanjangan.`,
      }
    case 'h0':
      return {
        title: 'HARI TERAKHIR BERLANGGANAN',
        body:
          `Hari ini adalah hari terakhir masa aktif paket Darrellsoft Anda.\n\n` +
          `Segera perpanjang paket agar tidak kehilangan akses layanan.`,
      }
    case 'habis':
      return {
        title: 'MASA BERLANGGANAN TELAH HABIS',
        body:
          `Masa berlangganan Darrellsoft perusahaan ${perusahaan} sudah berakhir.\n\n` +
          `Silakan lakukan perpanjangan untuk mengaktifkan kembali layanan.`,
      }
  }
}

/**
 * Penerima notifikasi langganan milik `userId`: dirinya sendiri + seluruh
 * anggota grupnya (status != keluar). Tanpa grup → hanya dirinya.
 */
async function getSubscriptionRecipients(userId: string): Promise<{
  ids: string[]
  perusahaan: string
}> {
  const ids = new Set<string>([userId])
  let perusahaan = ''

  const anggota = await db.grupAnggota.findFirst({
    where: { memberId: userId, status: { not: 'keluar' } },
    include: { grup: { select: { nama: true } } },
  })
  if (anggota) {
    perusahaan = anggota.grup.nama || ''
    const rows = await db.grupAnggota.findMany({
      where: { grupId: anggota.grupId, status: { not: 'keluar' } },
      select: { memberId: true },
    })
    rows.forEach((r) => ids.add(r.memberId))
  }
  return { ids: Array.from(ids), perusahaan }
}

/**
 * Kirim pengingat untuk SATU langganan ke Owner + anggota grup (idempoten).
 * dipanggil dari cron harian, sweep global maupun per-user.
 * @returns jumlah notifikasi baru yang dibuat (0–5 × jumlah penerima).
 */
async function remindOne(sub: {
  userId: string
  endDate: Date | null
  planName: string
  status: string
}): Promise<number> {
  if (!sub.userId || !sub.endDate) return 0
  // Ditangguhkan / dibatalkan / belum aktif tidak perlu pengingat otomatis
  if (sub.status === 'ditangguhkan' || sub.status === 'dibatalkan' || sub.status === 'belum_aktif') return 0

  const end = new Date(sub.endDate)
  if (isNaN(end.getTime())) return 0

  const daysLeft = calendarDaysLeft(end)

  // Kumulatif agar tahan cron gagal sehari:
  //   dl<=7 → h7; dl<=3 → h3; dl<=1 → h1; dl==0 → hari terakhir; dl<0 → habis
  const kinds: ReminderKind[] = []
  if (daysLeft <= 7) kinds.push('h7')
  if (daysLeft <= 3) kinds.push('h3')
  if (daysLeft <= 1) kinds.push('h1')
  if (daysLeft === 0) kinds.push('h0')
  if (daysLeft < 0) kinds.push('habis')
  if (kinds.length === 0) return 0

  const rec = await getSubscriptionRecipients(sub.userId)
  const recipients = rec.ids
  let perusahaan = rec.perusahaan
  if (!perusahaan) {
    // Nama perusahaan fallback: nama pemilik langganan
    try {
      const pg = await db.pengguna.findUnique({
        where: { id: sub.userId },
        select: { namaLengkap: true },
      })
      const cl = pg
        ? null
        : await db.calonPembeli.findUnique({
            where: { id: sub.userId },
            select: { nama: true },
          })
      perusahaan = pg?.namaLengkap || cl?.nama || 'Anda'
    } catch {
      perusahaan = 'Anda'
    }
  }

  // Referensi unik per periode langganan — endDate berubah (perpanjangan) → ref baru;
  // pengingat periode lama otomatis tidak relevan lagi (tidak dikirim ulang).
  const refKey = `[ref:${sub.planName}:${end.toISOString().slice(0, 10)}]`
  let created = 0

  for (const kind of kinds) {
    const { title, body } = reminderContent(kind, {
      perusahaan,
      planName: sub.planName,
      endDate: end,
    })
    created += await fanoutNotification({
      userIds: recipients,
      title,
      body,
      refKey,
      type: 'subscription',
      link: '/langganan-saya',
    })
  }

  return created
}

/**
 * Sweep pengingat untuk SATU pelanggan — dipanggil dari /api/subscription/my.
 * Tidak throttled (query dedupe murah & menyasar 1 baris).
 */
export async function ensureExpiryRemindersForUser(userId: string): Promise<number> {
  try {
    const sub = await db.customerSubscription.findUnique({
      where: { userId },
      include: { plan: { select: { name: true } } },
    })
    if (!sub) return 0
    return await remindOne({
      userId: sub.userId,
      endDate: sub.endDate,
      planName: sub.plan?.name ?? 'Langganan',
      status: sub.status,
    })
  } catch (e) {
    console.error('ensureExpiryRemindersForUser error:', e)
    return 0
  }
}

/**
 * Sweep pengingat untuk SEMUA langganan — dipanggil dari
 * /api/cron/subscription-reminders (cron harian) dan
 * /api/panel-admin/subscription-stats (fallback admin membuka dashboard).
 * Throttle in-memory 3 menit agar tidak membebani DB tiap poll.
 */
export async function runExpiryReminderSweep(force = false): Promise<number> {
  const now = Date.now()
  if (!force && now - lastGlobalSweepAt < SWEEP_INTERVAL_MS) return 0
  lastGlobalSweepAt = now

  try {
    // Hanya langganan yang relevan: endDate dalam rentang luas (30 hari ke
    // belakang s/d 30 hari ke depan) supaya kasus "berakhir kemarin" tetap
    // terjangkau notifikasi habisnya, dan pengingat 7 hari terjangkau.
    const rangeStart = new Date(now - 30 * DAY_MS)
    const rangeEnd = new Date(now + 30 * DAY_MS)
    const subs = await db.customerSubscription.findMany({
      where: { endDate: { gte: rangeStart, lte: rangeEnd } },
      include: { plan: { select: { name: true } } },
    })

    let total = 0
    for (const sub of subs) {
      total += await remindOne({
        userId: sub.userId,
        endDate: sub.endDate,
        planName: sub.plan?.name ?? 'Langganan',
        status: sub.status,
      })
    }
    return total
  } catch (e) {
    console.error('runExpiryReminderSweep error:', e)
    return 0
  }
}
