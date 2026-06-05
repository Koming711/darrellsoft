import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import fs from 'fs'
import path from 'path'

// GET /api/database/backups — List saved backup files
export async function GET(req: NextRequest) {
  const err = requireAdmin(req); if (err) return err;
  try {
    const backupsDir = path.join(process.cwd(), 'backups')
    if (!fs.existsSync(backupsDir)) {
      return NextResponse.json({ success: true, backups: [] })
    }

    const files = fs.readdirSync(backupsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(backupsDir, f)
        const stat = fs.statSync(filePath)
        return {
          fileName: f,
          size: stat.size,
          sizeFormatted: formatBytes(stat.size),
          createdAt: stat.birthtime.toISOString(),
          timestamp: stat.birthtime.toISOString(),
        }
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // Try to get table/row counts from each backup file
    const backupsWithCounts = files.map(b => {
      try {
        const filePath = path.join(backupsDir, b.fileName)
        const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
        const db = content.database || {}
        const tableCount = Object.keys(db).length
        const rowCount = Object.values(db).reduce((acc: number, arr: any) => acc + (Array.isArray(arr) ? arr.length : 0), 0)
        return { ...b, tableCount, rowCount }
      } catch {
        return { ...b, tableCount: 0, rowCount: 0 }
      }
    })

    return NextResponse.json({ success: true, backups: backupsWithCounts })
  } catch (error) {
    console.error('List backups error:', error)
    return NextResponse.json({ success: false, error: 'Gagal mengambil daftar backup' }, { status: 500 })
  }
}

// DELETE /api/database/backups?fileName=xxx — Delete a backup file
export async function DELETE(req: NextRequest) {
  const err = requireAdmin(req); if (err) return err;
  try {
    const { searchParams } = new URL(req.url)
    const fileName = searchParams.get('fileName')
    if (!fileName) {
      return NextResponse.json({ error: 'fileName wajib diisi' }, { status: 400 })
    }

    const backupsDir = path.join(process.cwd(), 'backups')
    const filePath = path.join(backupsDir, path.basename(fileName))

    // Security: ensure the file is within backups directory
    if (!filePath.startsWith(backupsDir)) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 })
    }

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      return NextResponse.json({ success: true, message: 'Backup berhasil dihapus' })
    } else {
      return NextResponse.json({ error: 'File tidak ditemukan' }, { status: 404 })
    }
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
