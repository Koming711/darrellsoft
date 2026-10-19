/**
 * Format mata uang & tanggal untuk alur langganan — implementasi manual agar
 * deterministik di server maupun browser (menghindari hydration mismatch).
 * Nama file dibedakan dari lib/format.ts (punya helper aplikasi lain).
 */

/** Format Rupiah: 150000 → "Rp150.000" */
export function formatRupiah(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  const isNeg = n < 0;
  const abs = Math.abs(Math.round(n));
  const s = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${isNeg ? "-" : ""}Rp${s}`;
}

/** Kode unik 3 digit: 7 → "007" */
export function formatUniqueCode(code: number | null | undefined): string {
  if (!code) return "-";
  return code.toString().padStart(3, "0");
}

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "-";
  return `${date.getDate()} ${BULAN[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "-";
  const hh = date.getHours().toString().padStart(2, "0");
  const mm = date.getMinutes().toString().padStart(2, "0");
  return `${date.getDate()} ${BULAN[date.getMonth()].slice(0, 3)} ${date.getFullYear()}, ${hh}.${mm}`;
}

/** Sisa hari (bulat ke atas), minimal 0. */
export function daysLeft(endDate: Date | string | null | undefined): number {
  if (!endDate) return 0;
  const end = typeof endDate === "string" ? new Date(endDate) : endDate;
  if (isNaN(end.getTime())) return 0;
  const diff = end.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

/** Label durasi: 30 → "30 hari", 365 → "1 tahun" */
export function formatDuration(days: number): string {
  if (days % 365 === 0 && days >= 365) {
    const y = days / 365;
    return `${y} tahun`;
  }
  if (days % 30 === 0 && days >= 30) {
    const m = days / 30;
    return `${m} bulan`;
  }
  return `${days} hari`;
}
