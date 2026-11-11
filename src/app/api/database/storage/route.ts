import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, getServerUser } from '@/lib/server-auth'
import { getBackupFolder, sanitizeBackupFolder, DEFAULT_BACKUP_FOLDER } from '@/lib/backup-folder'
import { logAudit } from '@/lib/audit'
import fs from 'fs'
import path from 'path'

/**
 * Pengaturan Penyimpanan Database (halaman Pengaturan → tab Penyimpanan DB).
 *
 * Kejujuran platform: aplikasi berjalan di browser. Folder yang diatur di sini
 * adalah folder di SISI SERVER (relatif thd root project, default `backups/`)
 * tempat salinan backup ditulis best-effort — di Vercel filesystem read-only,
 * salinan otomatis disimpan ke tabel BackupFile (database) sebagai gantinya.
 * Untuk folder di komputer user (mis. D:/Darrellsoft/Backup) gunakan kartu
 * "Folder di Komputer" yang memakai File System Access API di sisi browser.
 *
 * GET    → info lengkap: folder, path server, jenis penyimpanan, status tulis,
 *          backup terakhir (tanggal + ukuran), jumlah backup tersimpan.
 * POST   { folder } → validasi (tulis-uji) lalu simpan konfigurasi.
 * DELETE → reset konfigurasi ke default (`backups`).
 */

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

/** Uji apakah folder bisa ditulis (mkdir + tulis + hapus file probe). Return null = OK. */
function probeWrite(dir: string): string | null {
  try {
    fs.mkdirSync(dir, { recursive: true })
    const probe = path.join(dir, `.storage-test-${Date.now()}`)
    fs.writeFileSync(probe, 'darrellsoft storage test')
    fs.unlinkSync(probe)
    return null
  } catch (e) {
    return e instanceof Error ? `${e.name}: ${e.message}` : 'unknown'
  }
}

export async function GET(req: NextRequest) {
  const err = requireAuth(req); if (err) return err;
  try {
    const user = getServerUser(req)
    const folder = await getBackupFolder()
    const serverPath = path.join(process.cwd(), folder)
    const writeError = probeWrite(serverPath)
    const writable = writeError === null

    const last = await db.backupFile.findFirst({
      where: user ? { userId: user.id } : undefined,
      orderBy: { createdAt: 'desc' },
      select: { fileName: true, size: true, createdAt: true },
    })
    const count = await db.backupFile.count({ where: user ? { userId: user.id } : undefined })

    return NextResponse.json({
      success: true,
      folder,
      serverPath,
      writable,
      writeError,
      storageType: writable ? 'server-folder' : 'database-only',
      isVercel: !!process.env.VERCEL,
      lastBackup: last
        ? { fileName: last.fileName, size: last.size, sizeFormatted: formatBytes(last.size), createdAt: last.createdAt.toISOString() }
        : null,
      backupsCount: count,
    })
  } catch (error) {
    console.error('Storage info error:', error)
    return NextResponse.json({ success: false, error: 'Gagal membaca info penyimpanan' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const err = requireAuth(req); if (err) return err;
  try {
    const user = getServerUser(req)
    const body = await req.json().catch(() => ({}))
    const folder = sanitizeBackupFolder(typeof body?.folder === 'string' ? body.folder : '')
    if (folder === null) {
      return NextResponse.json({
        success: false,
        error: 'Path tidak valid — gunakan path RELATIF (mis. backups atau backups/harian), tanpa "..", tanpa drive letter (D:/). Untuk folder di komputer Anda (D:/Darrellsoft/Database), pakai kartu "Folder di Komputer".',
      }, { status: 400 })
    }

    // Validasi lokasi: harus tersedia & dapat ditulis sebelum disimpan
    const dir = path.join(process.cwd(), folder)
    const writeError = probeWrite(dir)
    if (writeError) {
      return NextResponse.json({
        success: false,
        error: `Folder tidak dapat ditulis di server: ${writeError}`,
      }, { status: 400 })
    }

    await db.setting.upsert({
      where: { key: 'backup_folder' },
      update: { value: folder },
      create: { key: 'backup_folder', value: folder },
    })

    await logAudit({
      aktorId: user?.id,
      aksi: 'storage-config-save',
      detail: { folder, serverPath: dir },
    })

    return NextResponse.json({ success: true, folder, serverPath: dir, message: 'Lokasi penyimpanan berhasil disimpan' })
  } catch (error) {
    console.error('Storage save error:', error)
    return NextResponse.json({ success: false, error: 'Gagal menyimpan lokasi penyimpanan' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const err = requireAuth(req); if (err) return err;
  try {
    const user = getServerUser(req)
    await db.setting.deleteMany({ where: { key: 'backup_folder' } })
    await logAudit({ aktorId: user?.id, aksi: 'storage-config-reset', detail: { resetTo: DEFAULT_BACKUP_FOLDER } })
    return NextResponse.json({ success: true, folder: DEFAULT_BACKUP_FOLDER, message: 'Konfigurasi folder direset ke default (backups)' })
  } catch (error) {
    console.error('Storage reset error:', error)
    return NextResponse.json({ success: false, error: 'Gagal mereset konfigurasi penyimpanan' }, { status: 500 })
  }
}
