import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getServerUser } from '@/lib/server-auth'
import { logGroupAudit, GRUP_STATUS } from '@/lib/grup'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/panel-admin/grup/[id] — Super admin mengaktifkan / menonaktifkan grup.
 * Grup dinonaktifkan → seluruh anggota tidak dapat login (dicek di login &
 * verify-session), data perusahaan TIDAK dihapus, dan akses dipulihkan
 * otomatis setelah grup diaktifkan kembali.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const err = requireAdmin(request)
    if (err) return err
    const adminUser = getServerUser(request)!
    const admin = await db.pengguna.findUnique({
      where: { id: adminUser.id },
      select: { username: true },
    })
    const adminUsername = admin?.username || adminUser.id

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const status = String(body?.status ?? '')
    const alasan = String(body?.alasan ?? '').slice(0, 300)

    if (status !== GRUP_STATUS.AKTIF && status !== GRUP_STATUS.DINONAKTIFKAN) {
      return NextResponse.json({ error: 'Status tidak valid (aktif | dinonaktifkan).' }, { status: 400 })
    }
    if (status === GRUP_STATUS.DINONAKTIFKAN && !alasan.trim()) {
      return NextResponse.json({ error: 'Alasan penonaktifan wajib diisi.' }, { status: 400 })
    }

    const grup = await db.grup.findUnique({ where: { id } })
    if (!grup) {
      return NextResponse.json({ error: 'Grup tidak ditemukan.' }, { status: 404 })
    }
    if (grup.status === status) {
      return NextResponse.json({ success: true, idempotent: true })
    }

    await db.grup.update({
      where: { id },
      data: { status, suspendReason: status === GRUP_STATUS.DINONAKTIFKAN ? alasan : '' },
    })

    await logGroupAudit(db, {
      grupId: id,
      aktorId: adminUser.id,
      aktorNama: adminUsername,
      aksi: status === GRUP_STATUS.AKTIF ? 'grup_diaktifkan' : 'grup_dinonaktifkan',
      detail: status === GRUP_STATUS.AKTIF ? { oleh: adminUsername } : { oleh: adminUsername, alasan },
    })

    if (grup.ownerUserId) {
      await db.notification.create({
        data: {
          userId: grup.ownerUserId,
          title: status === GRUP_STATUS.AKTIF ? 'Grup Diaktifkan' : 'Grup Dinonaktifkan',
          body:
            status === GRUP_STATUS.AKTIF
              ? `Grup "${grup.nama}" (${grup.kode}) telah diaktifkan kembali oleh admin.`
              : `Grup "${grup.nama}" (${grup.kode}) dinonaktifkan oleh admin. Alasan: ${alasan}`,
          type: 'subscription',
          link: '/grup',
        },
      }).catch(() => {})
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('PATCH /api/panel-admin/grup/[id] error:', error)
    return NextResponse.json({ error: 'Gagal mengubah status grup' }, { status: 500 })
  }
}
