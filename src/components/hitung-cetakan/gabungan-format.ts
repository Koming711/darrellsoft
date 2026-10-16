/**
 * gabungan-format — helper format Rupiah/pcs bersama untuk fitur Gabungan
 * Hitung Cetakan (format Indonesia, konsisten dengan dokumen lama).
 */

/** Format Rupiah bulat: Rp 1.234.567 */
export const fmtRp = (n: number) => `Rp ${Math.round(n || 0).toLocaleString('id-ID')}`

/** Format harga per pcs: 2 desimal bila < Rp1.000, bulat bila >= Rp1.000. */
export const fmtHargaPcs = (n: number) => {
  const v = Math.round((n || 0) * 100) / 100
  if (Math.abs(v) >= 1000) return `Rp ${Math.round(v).toLocaleString('id-ID')}`
  return `Rp ${v.toLocaleString('id-ID', { minimumFractionDigits: v % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })}`
}

/** Parse jumlah pesanan dari string — angka bulat pertama. */
export const parseJp = (s: unknown): number => {
  const v = parseInt(String(s ?? '').replace(/[^\d]/g, ''), 10)
  return isNaN(v) ? 0 : v
}
