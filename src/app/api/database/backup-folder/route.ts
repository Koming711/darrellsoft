import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server-auth'
import { getBackupFolder } from '@/lib/backup-folder'
import fs from 'fs'
import path from 'path'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

/**
 * GET /api/database/backup-folder
 * Daftar file di folder penyimpanan backup yang dipilih user
 * (Setting key `backup_folder`, default `backups`).
 * Dipakai tombol "Cari File" di kartu Folder Penyimpanan Backup.
 */
export async function GET(req: NextRequest) {
  const err = requireAuth(req); if (err) return err;
  try {
    const folder = await getBackupFolder()
    const dir = path.join(process.cwd(), folder)

    if (!fs.existsSync(dir)) {
      return NextResponse.json({ success: true, folder, exists: false, files: [] })
    }

    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    const files: Array<{ name: string; size: number; sizeFormatted: string; modified: string }> = []
    for (const e of entries) {
      if (!e.isFile()) continue
      try {
        const st = await fs.promises.stat(path.join(dir, e.name))
        files.push({
          name: e.name,
          size: st.size,
          sizeFormatted: formatBytes(st.size),
          modified: st.mtime.toISOString(),
        })
      } catch { /* lewati file bermasalah */ }
    }
    // Terbaru dulu
    files.sort((a, b) => b.modified.localeCompare(a.modified))

    return NextResponse.json({ success: true, folder, exists: true, files })
  } catch (error) {
    console.error('List backup folder files error:', error)
    return NextResponse.json({ success: false, error: 'Gagal membaca folder backup' }, { status: 500 })
  }
}
