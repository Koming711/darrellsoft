import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, getServerUser, isAdmin, canAccessRecord } from '@/lib/server-auth'
import { logAudit } from '@/lib/audit'

/**
 * GET /api/database/backups/download?fileName=xxx
 * Unduh file backup (.json) dari Riwayat Backup (tabel BackupFile).
 *
 * Keamanan:
 * - Hanya user login.
 * - Milik sendiri / anggota grup sama / admin sistem → boleh.
 * - Backup user lain → 403 (tidak boleh diunduh tanpa otorisasi).
 * - Integritas dicek (JSON valid) sebelum dikirim; file rusak → 422.
 */
export async function GET(req: NextRequest) {
  const err = requireAuth(req); if (err) return err;
  try {
    const user = getServerUser(req)!
    const { searchParams } = new URL(req.url)
    const fileName = searchParams.get('fileName') || ''
    if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
      return NextResponse.json({ error: 'fileName tidak valid' }, { status: 400 })
    }

    const rec = await db.backupFile.findUnique({ where: { fileName } })
    if (!rec) {
      return NextResponse.json({ error: 'File backup tidak ditemukan' }, { status: 404 })
    }

    // Otorisasi: milik sendiri / grup sama / admin
    if (!isAdmin(user.role)) {
      if (!rec.userId || !(rec.userId === user.id || (await canAccessRecord(user, rec.userId)))) {
        await logAudit({ aktorId: user.id, aksi: 'backup-download-denied', detail: { fileName, owner: rec.userId } })
        return NextResponse.json({ error: 'Akses ditolak — file backup ini bukan milik akun Anda' }, { status: 403 })
      }
    }

    // Validasi integritas: harus JSON yang bisa diparse dan punya struktur database
    let parsed: unknown
    try {
      parsed = JSON.parse(rec.content)
    } catch {
      return NextResponse.json({ error: 'File backup rusak (JSON tidak valid) — tidak dapat diunduh' }, { status: 422 })
    }
    if (!parsed || typeof parsed !== 'object' || !(parsed as Record<string, unknown>).database) {
      return NextResponse.json({ error: 'Struktur file backup tidak dikenal — tidak dapat diunduh' }, { status: 422 })
    }

    await logAudit({ aktorId: user.id, aksi: 'backup-download', detail: { fileName, size: rec.size } })

    return new NextResponse(rec.content, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(rec.fileName)}"`,
        'Content-Length': String(Buffer.byteLength(rec.content, 'utf-8')),
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('Backup download error:', error)
    return NextResponse.json({ error: 'Gagal mengunduh backup' }, { status: 500 })
  }
}
