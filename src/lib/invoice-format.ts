/**
 * Helper format untuk modul Invoice (port dari modul InvoiceKu).
 * Semua fungsi aman dipakai di client & server.
 */

const idrFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** Format angka ke Rupiah, contoh: Rp150.000 */
export function formatIDR(n: number | null | undefined): string {
  return idrFormatter.format(Number(n ?? 0))
}

/** Format angka biasa gaya Indonesia, contoh: 2,5 */
export function formatNum(n: number | null | undefined, maxFrac = 2): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: maxFrac }).format(Number(n ?? 0))
}

/** Format tanggal singkat, contoh: 15 Jan 2025 */
export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '-'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Normalisasi nomor HP Indonesia ke format 62xxxxxxxxxx untuk wa.me */
export function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0')) digits = '62' + digits.slice(1)
  if (!digits.startsWith('62')) digits = '62' + digits
  return digits.length >= 9 && digits.length <= 16 ? digits : null
}
