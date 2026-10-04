import { db } from '@/lib/db'

/**
 * Helper server untuk fitur Stock Bahan.
 * Dipakai bersama oleh /api/stock-bahan dan /api/stock-bahan/mutasi.
 */

/** Prefix nomor transaksi per jenis mutasi. */
export const NOMOR_PREFIX: Record<string, string> = {
  masuk: 'SM',
  keluar: 'SK',
  penyesuaian: 'SP',
}

/**
 * Nomor transaksi berurutan per user per jenis: SM-001, SK-001, SP-001, ...
 */
export async function nextNomorMutasi(
  userId: string | null,
  jenis: string
): Promise<string> {
  const prefix = NOMOR_PREFIX[jenis] || 'SM'
  const existing = await db.bahanMutasi.findMany({
    where: { userId, jenis },
    select: { nomor: true },
  })
  let maxNum = 0
  for (const m of existing) {
    const match = new RegExp(`^${prefix}-(\\d+)$`, 'i').exec(m.nomor)
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10))
  }
  return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`
}

/** Tanggal hari ini (yyyy-mm-dd) di zona Asia/Jakarta. */
export function todayJakarta(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
}

/**
 * Baca setting per-user "stock_izinkan_minus" — apakah stok boleh minus.
 * Default: false (stok tidak boleh minus).
 */
export async function isIzinkanMinus(userId: string | null): Promise<boolean> {
  if (!userId) return false
  const s = await db.userSetting.findUnique({
    where: { userId_key: { userId, key: 'stock_izinkan_minus' } },
  })
  return s?.value === 'true'
}

/**
 * Gabungkan catatan bebas + referensi PO menjadi satu field keterangan.
 * Format: "Ref PO: PO-xxx | catatan bebas"
 */
export function composeKeterangan(poRef: unknown, catatan: unknown): string {
  const parts: string[] = []
  const ref = poRef ? String(poRef).trim() : ''
  const note = catatan ? String(catatan).trim() : ''
  if (ref) parts.push(`Ref PO: ${ref}`)
  if (note) parts.push(note)
  return parts.join(' | ')
}

/**
 * Kebalikan composeKeterangan — pisahkan keterangan menjadi { poRef, catatan }.
 * "Ref PO: PO-xxx | catatan" → { poRef: "PO-xxx", catatan: "catatan" }
 */
export function splitKeterangan(keterangan: string): { poRef: string; catatan: string } {
  const ket = (keterangan || '').trim()
  const m = /^Ref PO:\s*(.+?)(?:\s*\|\s*(.*))?$/.exec(ket)
  if (m) {
    return { poRef: m[1].trim(), catatan: (m[2] || '').trim() }
  }
  return { poRef: '', catatan: ket }
}
