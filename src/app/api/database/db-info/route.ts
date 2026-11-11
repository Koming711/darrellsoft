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
 * GET /api/database/db-info
 * Info lokasi file database yang dijadikan sumber backup
 * (halaman Pengaturan → tab Database, kartu "Backup & Restore Penuh").
 *
 * - SQLite (lokal): path file .db + ukuran + waktu perubahan terakhir
 * - PostgreSQL (produksi Vercel): host + nama database (TANPA kredensial)
 * Ditambah lokasi penyimpanan salinan backup (tabel BackupFile + folder server).
 *
 * Keamanan: TIDAK pernah mengembalikan password/user dari DATABASE_URL.
 */
export async function GET(req: NextRequest) {
  const err = requireAuth(req); if (err) return err;
  try {
    const url = process.env.DATABASE_URL || ''
    const backupFolder = await getBackupFolder()
    const environment = process.env.VERCEL ? 'production' : 'local'

    if (url.startsWith('file:')) {
      // ===== SQLite =====
      let p = url.slice('file:'.length).split('?')[0]
      const absolutePath = path.isAbsolute(p) ? p : path.join(process.cwd(), p)
      // Tampilan relatif thd root project bila memungkinkan (lebih ringkas)
      const rel = path.relative(process.cwd(), absolutePath)
      const displayPath = rel && !rel.startsWith('..') ? rel : absolutePath

      let exists = false
      let size = 0
      let modified: string | null = null
      try {
        const st = fs.statSync(absolutePath)
        exists = true
        size = st.size
        modified = st.mtime.toISOString()
      } catch { /* file belum ada */ }

      return NextResponse.json({
        success: true,
        provider: 'sqlite',
        file: displayPath,
        absolutePath,
        exists,
        size,
        sizeFormatted: formatBytes(size),
        modified,
        backupFolder,
        environment,
      })
    }

    if (url.startsWith('postgres')) {
      // ===== PostgreSQL (Vercel/Supabase) — jangan bocorkan kredensial =====
      let host = ''
      let database = ''
      try {
        const u = new URL(url)
        host = u.hostname
        database = (u.pathname || '').replace(/^\//, '')
      } catch { /* URL tidak valid — biarkan kosong */ }
      return NextResponse.json({
        success: true,
        provider: 'postgresql',
        host,
        database,
        backupFolder,
        environment,
      })
    }

    return NextResponse.json({ success: true, provider: 'unknown', backupFolder, environment })
  } catch (error) {
    console.error('DB info error:', error)
    return NextResponse.json({ success: false, error: 'Gagal membaca info database' }, { status: 500 })
  }
}
