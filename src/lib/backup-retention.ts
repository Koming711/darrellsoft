import { db } from '@/lib/db'

/**
 * Retensi Riwayat Backup (halaman Pengaturan → Database).
 *
 * Riwayat backup hanya menyimpan 7 hari terakhir (jendela bergulir):
 * - Hari 1–7: semua backup masih tampil.
 * - Hari ke-8: backup hari ke-1 terhapus otomatis, hari ke-2 menjadi yang
 *   tertua, backup baru menjadi hari ke-7, dst.
 *
 * Pembersihan dijalankan setiap kali backup dibuat (manual/auto) dan setiap
 * kali daftar riwayat dibuka — idempoten & murah (satu deleteMany).
 */
export const BACKUP_RETENTION_DAYS = 7

/** Hapus semua BackupFile yang lebih tua dari 7 hari. Return jumlah yang terhapus. */
export async function pruneOldBackups(): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const res = await db.backupFile.deleteMany({
      where: { createdAt: { lt: cutoff } },
    })
    if (res.count > 0) {
      console.log(`Retensi backup: ${res.count} backup > ${BACKUP_RETENTION_DAYS} hari terhapus`)
    }
    return res.count
  } catch (e) {
    // Jangan gagalkan backup/list hanya karena pembersihan gagal
    console.warn('Retensi backup dilewati:', e instanceof Error ? e.name : 'unknown')
    return 0
  }
}
