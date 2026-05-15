import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin, getServerUser } from '@/lib/server-auth'
import fs from 'fs'
import path from 'path'

// This endpoint is called by the auto-backup cron job
export async function GET(request: NextRequest) {
  // Allow cron access via secret token (query param or header)
  const cronSecret = request.headers.get('x-cron-secret') || request.nextUrl.searchParams.get('cron_secret')
  if (cronSecret !== process.env.CRON_SECRET) {
    const err = requireAdmin(request); if (err) return err;
  }
  try {
    // Collect all data from all tables
    const [
      users,
      penggunas,
      posts,
      customers,
      papers,
      printingCosts,
      finishings,
      calonPembelis,
      pembelis,
      settings,
      riwayatCetakan,
    ] = await Promise.all([
      db.user.findMany(),
      db.pengguna.findMany(),
      db.post.findMany(),
      db.customer.findMany(),
      db.paper.findMany(),
      db.printingCost.findMany(),
      db.finishing.findMany(),
      db.calonPembeli.findMany(),
      db.pembeli.findMany(),
      db.setting.findMany(),
      db.riwayatCetakan.findMany(),
    ])

    const backup = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      autoBackup: true,
      database: {
        User: users,
        Pengguna: penggunas,
        Post: posts,
        Customer: customers,
        Paper: papers,
        PrintingCost: printingCosts,
        Finishing: finishings,
        CalonPembeli: calonPembelis,
        Pembeli: pembelis,
        Setting: settings,
        RiwayatCetakan: riwayatCetakan,
      },
    }

    // Save to file system
    const backupsDir = path.join(process.cwd(), 'backups')
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true })
    }

    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const fileName = `auto-backup-${dateStr}.json`
    const filePath = path.join(backupsDir, fileName)

    fs.writeFileSync(filePath, JSON.stringify(backup, null, 2), 'utf-8')

    // Clean up old auto backups (keep last 30)
    cleanupOldBackups(backupsDir, 'auto-backup-', 30)

    const totalRows = Object.values(backup.database).reduce((acc, arr) => acc + arr.length, 0)

    return NextResponse.json({
      success: true,
      message: `Auto backup berhasil: ${fileName} (${totalRows} records)`,
      fileName,
      totalRows,
      timestamp: backup.timestamp,
    })
  } catch (error) {
    console.error('Auto backup error:', error)
    return NextResponse.json(
      { success: false, error: 'Gagal melakukan auto backup' },
      { status: 500 }
    )
  }
}

function cleanupOldBackups(backupsDir: string, prefix: string, keepCount: number) {
  try {
    const files = fs.readdirSync(backupsDir)
      .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(backupsDir, f),
        mtime: fs.statSync(path.join(backupsDir, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime)

    // Delete files beyond the keep count
    for (let i = keepCount; i < files.length; i++) {
      fs.unlinkSync(files[i].path)
    }
  } catch {
    // silently fail cleanup
  }
}
