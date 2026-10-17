/**
 * Nama file backup seragam untuk halaman Pengaturan Database:
 *   fullbackup-<user>-<dd.mm.yy>.xlsx  /  .json
 *
 * Contoh: fullbackup-admin-26.11.25.xlsx
 *
 * Catatan: format yang diminta "fullbackup-(user)-(dd/mm/yy)" memakai '/', tetapi
 * karakter '/' tidak boleh ada dalam nama file (di semua OS — akan dianggap folder),
 * sehingga pemisah tanggal dipakai titik: dd.mm.yy.
 * Tanggal mengikuti zona waktu Asia/Jakarta (WIB).
 */

const BACKUP_TIME_ZONE = 'Asia/Jakarta'

/** Bersihkan username agar aman dipakai sebagai bagian nama file. */
export function sanitizeUsernameForFile(username: string | null | undefined): string {
  const s = (username || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, '')
    .slice(0, 30)
  return s || 'user'
}

/** Tanggal backup format dd.mm.yy mengikuti zona waktu Asia/Jakarta. */
export function backupDateStamp(now: Date = new Date()): string {
  // en-GB → "dd/mm/yy"
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: BACKUP_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(now)
  return formatted.replace(/\//g, '.')
}

/** Nama dasar file backup (tanpa ekstensi): fullbackup-<user>-<dd.mm.yy> */
export function buildBackupBaseName(
  username: string | null | undefined,
  now: Date = new Date()
): string {
  return `fullbackup-${sanitizeUsernameForFile(username)}-${backupDateStamp(now)}`
}
