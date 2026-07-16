import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth, isAdmin } from '@/lib/server-auth'

/**
 * GET /api/notifications/registrations
 *
 * Returns new account registrations (CalonPembeli with status="baru")
 * for admin/superadmin notification bell.
 *
 * Query params:
 *   - since: ISO date string — only return registrations created after this date
 *
 * Response:
 *   {
 *     count: number,            // total "baru" registrations
 *     newCount: number,         // registrations newer than `since`
 *     registrations: Array<{ id, nama, email, nomorHP, username, role, createdAt }>
 *   }
 *
 * Access: admin & superadmin only.
 */
export async function GET(request: NextRequest) {
  const authErr = requireAuth(request)
  if (authErr) return authErr

  const user = getServerUser(request)
  if (!user || !isAdmin(user.role)) {
    return NextResponse.json(
      { error: 'Akses ditolak. Hanya admin yang dapat melihat notifikasi.' },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(request.url)
  const sinceParam = searchParams.get('since')
  let sinceDate: Date | undefined
  if (sinceParam) {
    const d = new Date(sinceParam)
    if (!isNaN(d.getTime())) sinceDate = d
  }

  try {
    const where = { status: 'baru' }
    const [all, recent] = await Promise.all([
      db.calonPembeli.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          nama: true,
          email: true,
          nomorHP: true,
          username: true,
          role: true,
          createdAt: true,
        },
        take: 20,
      }),
      sinceDate
        ? db.calonPembeli.count({
            where: { ...where, createdAt: { gt: sinceDate } },
          })
        : Promise.resolve(0),
    ])

    return NextResponse.json(
      {
        count: all.length,
        newCount: sinceDate ? recent : all.length,
        registrations: all,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (err) {
    console.error('[api/notifications/registrations] error:', err)
    return NextResponse.json({ error: 'Gagal memuat notifikasi' }, { status: 500 })
  }
}
