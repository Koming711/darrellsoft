import { db } from '@/lib/db'

/**
 * Catat aktivitas penting (backup/restore/hapus backup/konfigurasi storage)
 * ke tabel AuditLog. TIDAK PERNAH menggagalkan proses utama — kegagalan log
 * hanya dicatat ke console.
 */
export async function logAudit(entry: {
  aktorId?: string
  aktorNama?: string
  aksi: string
  detail?: Record<string, unknown>
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        aktorId: entry.aktorId ?? '',
        aktorNama: entry.aktorNama ?? '',
        aksi: entry.aksi,
        detail: JSON.stringify(entry.detail ?? {}),
      },
    })
  } catch (e) {
    console.error('logAudit error:', e instanceof Error ? e.name : 'unknown')
  }
}
