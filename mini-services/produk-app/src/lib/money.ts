// ============================================================
// Utilitas uang — murni (tanpa import Prisma), aman untuk client & server.
// Konvensi: uang ditransmisikan sebagai STRING desimal (mis. "4800.5").
// ============================================================

export type MoneyValue = string | number | null | undefined

/** Konversi nilai uang (string desimal / number) ke number untuk tampilan. */
export function toNumber(v: MoneyValue): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Format ke Rupiah: "Rp 4.800" atau "Rp 4.800,50" bila ada sen. */
export function formatRp(v: MoneyValue): string {
  const n = toNumber(v)
  const hasCents = Math.abs(n % 1) > 1e-9
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(n)
}

/** Format angka biasa gaya Indonesia: "4.800" / "4.800,5". */
export function formatNumberID(v: MoneyValue, maxDigits = 2): string {
  const n = toNumber(v)
  const hasFrac = Math.abs(n % 1) > 1e-9
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: hasFrac ? maxDigits : 0,
  }).format(n)
}

/** Format tanggal date-only (ISO string) ke "12 Jan 2025". */
export function formatDateID(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(d)
}

/** yyyy-mm-dd hari ini (zona Asia/Jakarta) untuk perbandingan periode. */
export function todayISO(): string {
  const now = new Date()
  const jakarta = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  return jakarta.toISOString().slice(0, 10)
}

/** Parse input pengguna menjadi string desimal ("4.800,50" -> "4800.5"). */
export function parseMoneyInput(raw: string): string | null {
  if (!raw) return null
  let s = raw.replace(/\s|rp|Rp|IDR/g, '').trim()
  if (!s) return null
  const hasDot = s.includes('.')
  const hasComma = s.includes(',')
  if (hasDot && hasComma) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (hasComma) {
    s = s.replace(/,/g, '.')
  } else if (hasDot) {
    // "5.000" (ribuan) vs "4800.5" (desimal)
    if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  return s
}

/** Tampilkan nilai uang (string desimal) sebagai teks input berformat ribuan. */
export function formatMoneyInput(v: MoneyValue): string {
  if (v === null || v === undefined || v === '') return ''
  const n = toNumber(v)
  if (!Number.isFinite(n)) return ''
  const hasFrac = Math.abs(n % 1) > 1e-9
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: hasFrac ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(n)
}

/** Hitung subtotal baris: qty × harga, dibulatkan ke 2 desimal. */
export function lineTotal(qty: MoneyValue, price: MoneyValue): number {
  return Math.round(toNumber(qty) * toNumber(price) * 100) / 100
}
