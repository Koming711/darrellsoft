import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/server-auth'
import fs from 'fs'
import path from 'path'

const FS_MIGRATION_FLAG = 'backup_fs_migrated_v1'

/**
 * One-time migration: import legacy .json backup files from the backups/ folder
 * into the BackupFile table.
 *
 * Alasan: di Vercel filesystem-nya read-only & ephemeral, sehingga salinan backup
 * yang dulu ditulis ke folder backups/ tidak pernah tersimpan → Riwayat Backup
 * kosong dan hapus selalu gagal. Kini salinan backup disimpan di database
 * (lihat /api/database/backup & /api/database/auto-backup) dan daftar/hapus
 * dibaca dari database agar perilakunya identik di lokal & produksi.
 */
async function migrateFsBackupsOnce() {
  try {
    const flag = await db.setting.findUnique({ where: { key: FS_MIGRATION_FLAG } })
    if (flag) return

    const backupsDir = path.join(process.cwd(), 'backups')
    if (fs.existsSync(backupsDir)) {
      const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.json'))
      for (const f of files) {
        try {
          const existing = await db.backupFile.findUnique({ where: { fileName: f } })
          if (existing) continue
          const filePath = path.join(backupsDir, f)
          const stat = fs.statSync(filePath)
          const content = fs.readFileSync(filePath, 'utf-8')
          let tableCount = 0
          let rowCount = 0
          let createdAt: Date | undefined = undefined
          try {
            const parsed = JSON.parse(content)
            const dbData = parsed.database || {}
            tableCount = Object.keys(dbData).length
            rowCount = Object.values(dbData).reduce((acc: number, arr: any) => acc + (Array.isArray(arr) ? arr.length : 0), 0)
            if (parsed.timestamp) {
              const d = new Date(parsed.timestamp)
              if (!isNaN(d.getTime())) createdAt = d
            }
          } catch { /* file rusak → tetap diimpor dengan count 0 */ }
          await db.backupFile.create({
            data: {
              fileName: f,
              content,
              size: stat.size,
              tableCount,
              rowCount,
              ...(createdAt ? { createdAt } : {}),
            },
          })
        } catch { /* lewati satu file yang bermasalah */ }
      }
    }

    await db.setting.create({ data: { key: FS_MIGRATION_FLAG, value: new Date().toISOString() } })
  } catch (e) {
    console.warn('Migrasi backup folder ke database dilewati:', e instanceof Error ? e.name : 'unknown')
  }
}

// GET /api/database/backups — List saved backup files (visible to ALL logged-in users, not just admin)
export async function GET(req: NextRequest) {
  const err = requireAuth(req); if (err) return err;
  try {
    await migrateFsBackupsOnce()

    const rows = await db.backupFile.findMany({
      select: { fileName: true, size: true, tableCount: true, rowCount: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })

    const backups = rows.map(b => ({
      fileName: b.fileName,
      size: b.size,
      sizeFormatted: formatBytes(b.size),
      tableCount: b.tableCount,
      rowCount: b.rowCount,
      createdAt: b.createdAt.toISOString(),
      timestamp: b.createdAt.toISOString(),
    }))

    return NextResponse.json({ success: true, backups })
  } catch (error) {
    console.error('List backups error:', error)
    return NextResponse.json({ success: false, error: 'Gagal mengambil daftar backup' }, { status: 500 })
  }
}

// DELETE /api/database/backups?fileName=xxx — Delete a backup (same access as restore/backup: any logged-in user)
export async function DELETE(req: NextRequest) {
  const err = requireAuth(req); if (err) return err;
  try {
    const { searchParams } = new URL(req.url)
    const fileName = searchParams.get('fileName')
    if (!fileName) {
      return NextResponse.json({ error: 'fileName wajib diisi' }, { status: 400 })
    }

    // Best-effort: hapus juga file lama di folder backups/ (hanya relevan di lokal)
    try {
      const backupsDir = path.join(process.cwd(), 'backups')
      const filePath = path.join(backupsDir, path.basename(fileName))
      if (filePath.startsWith(backupsDir) && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch { /* Vercel FS read-only — diabaikan, record DB tetap dihapus */ }

    const deleted = await db.backupFile.deleteMany({ where: { fileName } })
    if (deleted.count > 0) {
      return NextResponse.json({ success: true, message: 'Backup berhasil dihapus' })
    }
    return NextResponse.json({ error: 'File tidak ditemukan' }, { status: 404 })
  } catch (error) {
    console.error('Delete backup error:', error)
    return NextResponse.json({ error: 'Gagal menghapus backup' }, { status: 500 })
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}
