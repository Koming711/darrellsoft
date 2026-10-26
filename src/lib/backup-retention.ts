import { db } from '@/lib/db'

/**
 * Retensi Riwayat Backup (halaman Pengaturan → Database).
 *
 * Riwayat backup hanya menyimpan 10 file backup terakhir (FIFO):
 * - Backup ke-1 s/d ke-10 (terbaru) tampil.
 * - Saat backup baru masuk (ke-11), backup tertua (paling pertama) otomatis
 *   terhapus, sisanya bergeser — seperti antrean.
 *
 * Pembersihan dijalankan setiap kali backup dibuat (manual/auto) dan setiap
 * kali daftar riwayat dibuka — idempoten & murah.
 */
export const BACKUP_MAX_FILES = 10

/** Simpan hanya BACKUP_MAX_FILES backup terbaru; sisanya (tertua dulu) dihapus. Return jumlah yang terhapus. */
export async function pruneOldBackups(): Promise<number> {
  try {
    const olds = await db.backupFile.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: BACKUP_MAX_FILES,
      select: { id: true },
    })
    if (olds.length === 0) return 0
    await db.backupFile.deleteMany({ where: { id: { in: olds.map(o => o.id) } } })
    console.log(`Retensi backup: ${olds.length} backup terlama terhapus (maks ${BACKUP_MAX_FILES} file)`)
    return olds.length
  } catch (e) {
    // Jangan gagalkan backup/list hanya karena pembersihan gagal
    console.warn('Retensi backup dilewati:', e instanceof Error ? e.name : 'unknown')
    return 0
  }
}
