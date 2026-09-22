/**
 * Format a number as Indonesian Rupiah currency.
 */
export function formatRupiah(amount: number): string {
  if (isNaN(amount)) return 'Rp0';
  return 'Rp' + Math.round(amount).toLocaleString('id-ID');
}

/**
 * Format a date string (YYYY-MM-DD) to a localized date format.
 * Pass `'en'` for English (e.g. "January 15, 2026"), `'id'` (default) for Indonesian (e.g. "15 Januari 2026").
 */
export function formatTanggal(dateStr: string, lang: 'id' | 'en' = 'id'): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr + 'T00:00:00');
    if (lang === 'en') {
      const monthsEn = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      return `${monthsEn[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    }
    const bulan = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const hari = date.getDate();
    const bln = bulan[date.getMonth()];
    const tahun = date.getFullYear();
    return `${hari} ${bln} ${tahun}`;
  } catch {
    return dateStr;
  }
}

/**
 * Format a date string (YYYY-MM-DD) as short numeric Indonesian style: d/m/yy.
 * Example: "2026-09-07" → "7/9/26". Used by Riwayat Invoice table.
 */
export function formatTanggalShort(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) return dateStr;
    const d = date.getDate();
    const m = date.getMonth() + 1;
    const yy = String(date.getFullYear()).slice(-2);
    return `${d}/${m}/${yy}`;
  } catch {
    return dateStr;
  }
}

/**
 * Format a date string (YYYY-MM-DD) as numeric Indonesian style: d/m/yyyy.
 * Example: "2026-06-06" → "6/6/2026". Used by Riwayat Surat Jalan table.
 */
export function formatTanggalFull(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) return dateStr;
    const d = date.getDate();
    const m = date.getMonth() + 1;
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
  } catch {
    return dateStr;
  }
}

/**
 * Get today's date in YYYY-MM-DD format.
 */
export function getTodayDate(): string {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Generate document number.
 */
export function generateDocNumber(prefix: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(4, '0');
  return `${prefix}/${y}/${seq}`;
}

// ===== Formatters for Master Barang / Master Pelanggan (versi lama) =====

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

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Persentase selisih `price` terhadap `base` (dibulatkan ke bilangan bulat).
 * Contoh: priceDelta(110000, 100000) -> 10; priceDelta(90000, 100000) -> -10.
 * Returns null bila base/price tidak valid (bukan angka / base 0) — pemanggil
 * mem-guard null sebelum render.
 */
export function priceDelta(price: number, base: number): number | null {
  if (!Number.isFinite(price) || !Number.isFinite(base) || base === 0) return null
  return Math.round(((price - base) / base) * 100)
}
