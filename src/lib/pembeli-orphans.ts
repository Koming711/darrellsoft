import { db } from '@/lib/db'
import type { Pembeli } from '@prisma/client'

/**
 * Pembeli "yatim" = baris Pembeli yang penggunaId menunjuk akun Pengguna yang
 * SUDAH DIHAPUS (bekas jalur hapus akun lama yang tidak ikut menghapus Pembeli
 * penaut). Baris hantu seperti ini memblokir nomor HP secara abadi di
 * pemeriksaan pendaftaran (409 "sudah terdaftar"), padahal akun aslinya sudah
 * tidak ada — kasus nyata: 081586900921 terblokir permanen.
 *
 * Aturan split (identik di semua endpoint cek nomor pendaftaran):
 * - penggunaId KOSONG          → mandiri/legacy (input manual admin) → TETAP memblokir
 * - penggunaId → Pengguna hidup → akun aktip                        → TETAP memblokir
 * - penggunaId → Pengguna hilang → YATIM                            → TIDAK memblokir
 */

export type PembeliSplit = {
  /** Baris sah — tetap memblokir pendaftaran (akun hidup / mandiri / legacy) */
  registered: Pembeli[]
  /** Baris yatim — tidak memblokir; sebaiknya dibersihkan */
  orphans: Pembeli[]
}

async function splitByPhone(variants: string[]): Promise<PembeliSplit> {
  const rows = await db.pembeli.findMany({ where: { nomorHP: { in: variants } } })
  const linkedIds = Array.from(
    new Set(rows.map((r) => r.penggunaId).filter((v): v is string => Boolean(v)))
  )
  const living = linkedIds.length
    ? await db.pengguna.findMany({ where: { id: { in: linkedIds } }, select: { id: true } })
    : []
  const livingIds = new Set(living.map((p) => p.id))
  const registered = rows.filter((r) => !r.penggunaId || livingIds.has(r.penggunaId))
  const orphans = rows.filter((r) => r.penggunaId && !livingIds.has(r.penggunaId))
  return { registered, orphans }
}

/**
 * Pisahkan baris Pembeli dengan nomor-nomor tersebut menjadi yang sah
 * (memblokir pendaftaran) vs yatim (tidak memblokir).
 */
export async function splitPembeliByPhone(variants: string[]): Promise<PembeliSplit> {
  return splitByPhone(variants)
}

/**
 * Hapus baris Pembeli yatim untuk nomor-nomor tersebut (data hantu peninggalan
 * akun yang sudah dihapus). Mengembalikan jumlah baris yang dihapus.
 */
export async function deleteOrphanPembeli(variants: string[]): Promise<number> {
  const { orphans } = await splitByPhone(variants)
  if (orphans.length === 0) return 0
  await db.pembeli.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } })
  return orphans.length
}
