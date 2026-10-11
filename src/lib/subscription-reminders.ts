// /src/lib/subscription-reminders.ts
// Pengingat masa aktif langganan (aturan #8):
//   • 7 hari sebelum berakhir  → notifikasi "Berakhir dalam 7 Hari"
//   • 3 hari sebelum berakhir  → notifikasi "Berakhir dalam 3 Hari"
//   • masa aktif habis         → notifikasi "Langganan Telah Berakhir"
//     (fitur utama tetap dikunci via validUntil — aturan #9)
//
// IDEMPOTEN: setiap pengingat terikat pada pasangan (userId, plan, endDate).
// Sebelum membuat notifikasi, cek dulu apakah notifikasi dengan judul &
// referensi yang sama sudah ada — jadi sweep berkali-kali tidak menduplikasi.
// Setelah pelanggan memperpanjang (endDate berubah), pengingat baru akan
// dibuat lagi untuk periode baru secara otomatis.
//
// TRIGGER (dua titik agar tetap jalan tanpa cron):
//   1. GET /api/subscription/my                    → per-user (pelanggan membuka halaman)
//   2. GET /api/panel-admin/subscription-stats     → sweep global (throttle 3 menit)

import { db } from '@/lib/db'
import { emitRealtime } from '@/lib/realtime-notify'
import { DAY_MS, formatDate } from '@/lib/subscription'

const SWEEP_INTERVAL_MS = 3 * 60 * 1000 // sweep global maksimal 1x / 3 menit
let lastGlobalSweepAt = 0

export type ReminderKind = 'h7' | 'h3' | 'berakhir'

/**
 * Buang penanda internal [ref:...] dari body notifikasi sebelum ditampilkan
 * ke client (marker hanya untuk dedupe — jangan bocor ke UI).
 */
export function stripReminderRef(body: string): string {
  return body.replace(/\s*\[ref:[^\]]+\]\s*$/, '').trim()
}

const REMINDER_META: Record<ReminderKind, { title: string; days: number }> = {
  h7: { title: 'Pengingat: Langganan Berakhir dalam 7 Hari', days: 7 },
  h3: { title: 'Pengingat: Langganan Berakhir dalam 3 Hari', days: 3 },
  berakhir: { title: 'Langganan Telah Berakhir', days: 0 },
}

/**
 * Kirim pengingat untuk SATU langganan (idempoten).
 * dipanggil dari sweep global maupun per-user.
 * @returns jumlah notifikasi baru yang dibuat (0–3).
 */
async function remindOne(sub: {
  userId: string
  endDate: Date | null
  planName: string
  status: string
}): Promise<number> {
  if (!sub.userId || !sub.endDate) return 0
  // Ditangguhkan / dibatalkan tidak perlu pengingat otomatis
  if (sub.status === 'ditangguhkan' || sub.status === 'dibatalkan' || sub.status === 'belum_aktif') return 0

  const end = new Date(sub.endDate)
  if (isNaN(end.getTime())) return 0

  const daysLeft = Math.ceil((end.getTime() - Date.now()) / DAY_MS)

  // Tentukan pengingat yang relevan:
  //   - masih jauh dari berakhir (> 7 hari) → tidak ada
  //   - 4–7 hari            → pengingat 7 hari
  //   - 1–3 hari            → pengingat 7 hari (jika belum) + pengingat 3 hari
  //   - ≤ 0 (berakhir)      → pengingat 7 hari + 3 hari (jika belum) + notifikasi berakhir
  const kinds: ReminderKind[] = []
  if (daysLeft <= REMINDER_META.h7.days) kinds.push('h7')
  if (daysLeft <= REMINDER_META.h3.days && daysLeft > 0) kinds.push('h3')
  if (daysLeft <= 0) kinds.push('berakhir')
  if (kinds.length === 0) return 0

  // Referensi unik per periode langganan — endDate berubah (perpanjangan) → ref baru
  const refKey = `[ref:${sub.planName}:${end.toISOString().slice(0, 10)}]`
  let created = 0

  for (const kind of kinds) {
    const meta = REMINDER_META[kind]
    // Dedupe: notifikasi dengan judul + ref periode yang sama sudah ada → lewati
    const exists = await db.notification.findFirst({
      where: {
        userId: sub.userId,
        type: 'subscription',
        title: meta.title,
        body: { contains: refKey },
      },
      select: { id: true },
    })
    if (exists) continue

    let title = meta.title
    let body: string
    if (kind === 'berakhir') {
      body =
        `Masa aktif langganan ${sub.planName} Anda telah berakhir pada ${formatDate(end)}. ` +
        `Fitur utama terkunci sampai Anda memperpanjang langganan. ` +
        `Silakan lakukan pembayaran untuk mengaktifkan kembali akun Anda.`
    } else {
      body =
        `Masa aktif langganan ${sub.planName} Anda akan berakhir pada ${formatDate(end)} ` +
        `(tersisa ${daysLeft} hari). Perpanjang sekarang agar layanan tidak terputus.`
    }
    body = `${body} ${refKey}`

    const notif = await db.notification.create({
      data: {
        userId: sub.userId,
        title,
        body,
        type: 'subscription',
        link: '/langganan-saya',
      },
    })
    created++

    // Push realtime — fire & forget, gagal tidak masalah (ada polling)
    emitRealtime({
      type: 'subscription',
      title,
      body: body.replace(` ${refKey}`, ''),
      link: '/langganan-saya',
      userId: sub.userId,
    })
    void notif
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
 * /api/panel-admin/subscription-stats (admin membuka dashboard).
 * Throttle in-memory 3 menit agar tidak membebani DB tiap poll.
 */
export async function runExpiryReminderSweep(force = false): Promise<number> {
  const now = Date.now()
  if (!force && now - lastGlobalSweepAt < SWEEP_INTERVAL_MS) return 0
  lastGlobalSweepAt = now

  try {
    // Hanya langganan yang relevan: belum berakhir terlalu jauh & masih bermakna.
    // Ambil endDate dalam rentang luas (30 hari ke belakang s/d jauh ke depan)
    // supaya kasus "berakhir kemarin" tetap terjangkau notifikasi berakhirnya.
    const rangeStart = new Date(now - 30 * DAY_MS)
    const subs = await db.customerSubscription.findMany({
      where: { endDate: { gte: rangeStart } },
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
