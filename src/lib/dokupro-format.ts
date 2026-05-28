/**
 * Format a number as Indonesian Rupiah currency.
 */
export function formatRupiah(amount: number): string {
  if (isNaN(amount)) return 'Rp0';
  return 'Rp' + Math.round(amount).toLocaleString('id-ID');
}

/**
 * Format a date string (YYYY-MM-DD) to Indonesian format.
 */
export function formatTanggal(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr + 'T00:00:00');
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
