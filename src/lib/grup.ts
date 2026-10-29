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

/** Validasi username unik lintas Pengguna & CalonPembeli (login identik). */
export async function isUsernameTerpakai(username: string, excludePenggunaId?: string): Promise<boolean> {
  const [pengguna, calon] = await Promise.all([
    db.pengguna.findFirst({
      where: { username, ...(excludePenggunaId ? { id: { not: excludePenggunaId } } : {}) },
      select: { id: true },
    }),
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
