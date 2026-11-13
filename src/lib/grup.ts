import { db } from '@/lib/db'
import { invalidateGroupCache } from '@/lib/server-auth'

/**
 * Helper domain GRUP PERUSAHAAN (multi-akun satu langganan).
 * Semua API grup memakai helper ini agar konsisten:
 * - keanggotaan: GrupAnggota (memberId = Pengguna.id | CalonPembeli.id)
 * - kuota: SubscriptionPlan.maxAccounts dari plan grup (fallback langganan owner)
 * - terpakai: anggota berstatus selain "keluar" (owner + anggota terdaftar,
 *   termasuk yang dinonaktifkan — sesuai aturan kuota)
 */
export type GrupClient = typeof db

export const GRUP_STATUS = {
  AKTIF: 'aktif',
  DINONAKTIFKAN: 'dinonaktifkan',
} as const

export const ANGGOTA_STATUS = {
  AKTIF: 'aktif',
  NONAKTIF: 'nonaktif',
  KELUAR: 'keluar',
} as const

/** Catat aktivitas penting ke tabel AuditLog (tidak pernah menggagalkan proses utama). */
export async function logGroupAudit(
  client: GrupClient,
  entry: {
    grupId?: string | null
    aktorId?: string
    aktorNama?: string
    aksi: string
    detail?: Record<string, unknown>
  }
): Promise<void> {
  try {
    await client.auditLog.create({
      data: {
        grupId: entry.grupId ?? null,
        aktorId: entry.aktorId ?? '',
        aktorNama: entry.aktorNama ?? '',
        aksi: entry.aksi,
        detail: JSON.stringify(entry.detail ?? {}),
      },
    })
  } catch (e) {
    console.error('logGroupAudit error:', e)
  }
}

/** Resolve grup + posisi user di dalamnya. Null bila user bukan anggota grup. */
export async function resolveGrupForUser(memberId: string) {
  if (!memberId) return null
  const anggota = await db.grupAnggota.findFirst({
    where: { memberId, status: { not: ANGGOTA_STATUS.KELUAR } },
    include: {
      grup: {
        include: {
          plan: { select: { id: true, name: true, maxAccounts: true, monthlyPrice: true } },
        },
      },
    },
  })
  if (!anggota) return null
  return { anggota, grup: anggota.grup }
}

/**
 * HAPUS PERMANEN grup perusahaan (aksi Super Admin — tombol Delete di
 * Panel Admin → Manajemen Grup). TIDAK BISA dibatalkan:
 * - Seluruh akun login anggota grup (owner + staf) DIHAPUS: Pengguna,
 *   Pembeli terkait, dan CustomerSubscription milik akun tsb.
 *   Admin/superadmin tidak pernah ikut terhapus (guard role).
 * - Keanggotaan (GrupAnggota) terhapus bersama grup (onDelete: Cascade).
 * - AuditLog grup dipertahankan (grupId → null via onDelete: SetNull)
 *   lalu entri baru 'grup_dihapus' ditulis (grupId null — riwayat tetap
 *   terbaca di Laporan Audit Panel Admin).
 * - Data dokumen perusahaan (invoice, riwayat hitungan, dst — kolom
 *   userId string biasa tanpa FK) TIDAK dihapus: menjadi arsip mati yang
 *   tidak bisa diakses siapa pun setelah akun dihapus.
 * - Riwayat tagihan & pembayaran langganan (SubscriptionInvoice/Payment)
 *   DIPERTAHANKAN sebagai arsip keuangan admin.
 */
export async function hapusGrupPermanen(
  grupId: string,
  aktor: { id: string; nama: string },
  catatan?: string,
): Promise<{ deletedAccounts: number; deletedMembers: number; kode: string; nama: string }> {
  const grup = await db.grup.findUnique({
    where: { id: grupId },
    include: { anggota: { select: { memberId: true, namaLengkap: true, peran: true, status: true } } },
  })
  if (!grup) throw new Error('Grup tidak ditemukan.')

  // Akun login yang melekat pada grup ini (semua status keanggotaan)
  const akunGrup = await db.pengguna.findMany({
    where: { grupId, role: { notIn: ['admin', 'superadmin'] } },
    select: { id: true },
  })
  const akunIds = akunGrup.map((a) => a.id)
  const anggotaTerdaftar = grup.anggota.length

  await db.$transaction(async (tx) => {
    if (akunIds.length > 0) {
      await tx.pembeli.deleteMany({ where: { penggunaId: { in: akunIds } } })
      // Langganan ikut akunnya — arsip keuangan (invoice & payment) dipertahankan
      await tx.customerSubscription.deleteMany({ where: { userId: { in: akunIds } } })
      await tx.pengguna.deleteMany({ where: { id: { in: akunIds } } })
    }
    // Hapus grup → GrupAnggota ikut terhapus (cascade), AuditLog.grupId → null
    await tx.grup.delete({ where: { id: grupId } })
  })

  // Audit DITULIS SETELAH grup terhapus (grupId null — entri lepas yang tetap terbaca)
  await logGroupAudit(db, {
    grupId: null,
    aktorId: aktor.id,
    aktorNama: aktor.nama,
    aksi: 'grup_dihapus',
    detail: {
      kode: grup.kode,
      nama: grup.nama,
      anggotaTerdaftar,
      akunDihapus: akunIds.length,
      ...(catatan?.trim() ? { catatan: catatan.trim() } : {}),
    },
  })

  invalidateGroupCache()

  return {
    deletedAccounts: akunIds.length,
    deletedMembers: anggotaTerdaftar,
    kode: grup.kode,
    nama: grup.nama,
  }
}

/**
 * Hitung kuota & pemakaian grup.
 * Kuota: plan milik grup → fallback plan langganan owner → 1.
 */
export async function hitungKuota(grupId: string): Promise<{
  kuota: number
  terpakai: number
  sisa: number
}> {
  const grup = await db.grup.findUnique({
    where: { id: grupId },
    include: { plan: { select: { maxAccounts: true } } },
  })
  let kuota = grup?.plan?.maxAccounts ?? 0
  if (!kuota && grup?.ownerUserId) {
    const sub = await db.customerSubscription.findUnique({
      where: { userId: grup.ownerUserId },
      select: { plan: { select: { maxAccounts: true } } },
    })
    kuota = sub?.plan?.maxAccounts ?? 1
  }
  if (!kuota) kuota = 1

  const terpakai = await db.grupAnggota.count({
    where: { grupId, status: { not: ANGGOTA_STATUS.KELUAR } },
  })
  return { kuota, terpakai, sisa: Math.max(0, kuota - terpakai) }
}

/** Pesan kuota penuh (dipakai API + UI agar konsisten). */
export const PESAN_KUOTA_PENUH =
  'Kuota akun Anda sudah penuh. Hapus atau keluarkan anggota yang tidak digunakan, atau pilih paket dengan kuota lebih besar.'

/**
 * Cek username terpakai DI DALAM namespace grup tertentu.
 *
 * NAMESPACE TERPISAH (grup vs pengelola):
 * - Anggota grup LAIN / akun kelola pengguna boleh memakai username yang
 *   sama — masing-masing grup punya ruang nama sendiri.
 * - Yang dicadangkan di grup ini: (a) username anggota aktif grup yang sama,
 *   (b) username Owner grup (Pengguna maupun CalonPembeli) — Owner bagian
 *   dari grup, agar tidak ada dua akun login sama dalam satu grup.
 */
export async function isUsernameTerpakaiDiGrup(
  grupId: string,
  username: string,
  ownerUserId: string | null
): Promise<boolean> {
  const [anggotaGrup, ownerPengguna, ownerCalon] = await Promise.all([
    db.pengguna.findFirst({ where: { username, grupId }, select: { id: true } }),
    ownerUserId
      ? db.pengguna.findFirst({ where: { username, id: ownerUserId }, select: { id: true } })
      : Promise.resolve(null as { id: string } | null),
    ownerUserId
      ? db.calonPembeli.findFirst({ where: { username, id: ownerUserId }, select: { id: true } })
      : Promise.resolve(null as { id: string } | null),
  ])
  return !!anggotaGrup || !!ownerPengguna || !!ownerCalon
}

/**
 * Cek username terpakai di sisi PENGELOLA (akun tanpa grup: kelola pengguna,
 * akun konversi pembeli, dll) plus CalonPembeli (pendaftaran mandiri).
 * Anggota grup TIDAK menghalangi namespace pengelola — ruang nama terpisah.
 */
export async function isUsernameTerpakaiPengelola(username: string): Promise<boolean> {
  const [pengguna, calon] = await Promise.all([
    db.pengguna.findFirst({ where: { username, grupId: null }, select: { id: true } }),
    db.calonPembeli.findFirst({ where: { username }, select: { id: true } }),
  ])
  return !!pengguna || !!calon
}

/** Tanggal berlaku akun owner (validUntil / expiredDate) — dipakai utk anggota baru. */
export async function ownerValidUntil(grup: { ownerUserId: string | null }): Promise<Date | null> {
  if (!grup.ownerUserId) return null
  const pengguna = await db.pengguna.findUnique({
    where: { id: grup.ownerUserId },
    select: { validUntil: true },
  })
  if (pengguna) return pengguna.validUntil
  const calon = await db.calonPembeli.findUnique({
    where: { id: grup.ownerUserId },
    select: { expiredDate: true },
  })
  return calon?.expiredDate ?? null
}

export { invalidateGroupCache }
