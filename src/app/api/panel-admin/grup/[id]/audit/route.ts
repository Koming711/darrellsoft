import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/panel-admin/grup/[id]/audit — riwayat aktivitas penting grup
 * (pembuatan, penambahan/penyuntingan/pengeluaran anggota, reset sandi,
 * perubahan langganan, tindakan superadmin). Super admin tidak mengubah
 * data transaksi pelanggan di sini — hanya memantau.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const err = requireAdmin(request)
    if (err) return err

    const { id } = await params
    const logs = await db.auditLog.findMany({
      where: { grupId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return NextResponse.json(
      { logs: logs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })) },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (error) {
    console.error('GET /api/panel-admin/grup/[id]/audit error:', error)
    return NextResponse.json({ error: 'Gagal memuat riwayat aktivitas' }, { status: 500 })
  }
}
