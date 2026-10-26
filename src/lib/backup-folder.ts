import fs from 'fs'
import path from 'path'
import { db } from '@/lib/db'

/**
 * Folder penyimpanan file backup (halaman Pengaturan → Database).
 *
 * Selain salinan JSON yang selalu disimpan ke DATABASE (tabel BackupFile —
 * wajib, karena di Vercel filesystem read-only), setiap backup baru juga
 * ditulis sebagai file JSON ke folder yang ditentukan user di server
 * (best-effort: kalau filesystem tidak bisa ditulis, backup ke database
 * tetap jalan dan hanya folder yang dilewati).
 *
 * Setting key: `backup_folder` (SYSTEM/global, lihat settings-shared.ts).
 * Nilainya path RELATIF terhadap root project, mis. `backups` atau
 * `backups/harian`. Kosong = pakai default `backups`.
 */
export const BACKUP_FOLDER_SETTING_KEY = 'backup_folder'
export const DEFAULT_BACKUP_FOLDER = 'backups'

/**
 * Validasi & normalisasi input folder dari user.
 * Return path relatif yang aman, atau null kalau tidak valid
 * (absolute path, drive letter, atau mengandung `..`).
 */
export function sanitizeBackupFolder(raw: string): string | null {
  const v = (raw || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (!v) return DEFAULT_BACKUP_FOLDER
  if (v.length > 200) return null
  if (/^[a-zA-Z]:/.test(v)) return null // C:\... dsb.
  const segs = v.split('/').filter(Boolean)
  if (segs.length === 0) return DEFAULT_BACKUP_FOLDER
  for (const s of segs) {
    if (s === '.' || s === '..') return null // blok path traversal
  }
  return segs.join('/')
}

/** Baca folder backup dari Setting (global). Fallback ke default bila belum diatur/tidak valid. */
export async function getBackupFolder(): Promise<string> {
  try {
    const s = await db.setting.findUnique({ where: { key: BACKUP_FOLDER_SETTING_KEY } })
    return sanitizeBackupFolder(s?.value || '') || DEFAULT_BACKUP_FOLDER
  } catch {
    return DEFAULT_BACKUP_FOLDER
  }
}

/**
 * Tulis salinan backup (JSON string) ke folder yang ditentukan di server.
 * Folder dibuat otomatis bila belum ada. Tidak pernah melempar —
 * selalu return { ok, path? } atau { ok: false, error }.
 */
export async function saveBackupToFileSystem(
  fileName: string,
  content: string
): Promise<{ ok: boolean; path?: string; folder: string; error?: string }> {
  const folder = await getBackupFolder()
  try {
    const dir = path.join(process.cwd(), folder)
    await fs.promises.mkdir(dir, { recursive: true })
    const filePath = path.join(dir, fileName)
    await fs.promises.writeFile(filePath, content, 'utf-8')
    return { ok: true, path: filePath, folder }
  } catch (e) {
    return {
      ok: false,
      folder,
      error: e instanceof Error ? `${e.name}: ${e.message}` : 'unknown',
    }
  }
}
