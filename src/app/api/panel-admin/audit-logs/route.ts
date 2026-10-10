// GET /api/panel-admin/audit-logs — jejak audit langganan.
// ?userId=&action=&limit=
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const err = requireAdmin(request)
  if (err) return err
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId') ?? ''
    const action = searchParams.get('action') ?? ''
    const limit = Math.min(300, Math.max(1, Number(searchParams.get('limit')) || 100))

    const where: Record<string, string> = {}
    if (userId) where.userId = userId
    if (action) where.action = action

    const logs = await db.subscriptionAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    const userIds = [...new Set(logs.map((l) => l.userId).filter((v): v is string => !!v))]
    const users = await db.pengguna.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, namaLengkap: true },
    })
    const userMap = new Map(users.map((u) => [u.id, u]))

    return NextResponse.json({
      logs: logs.map((l) => ({
        ...l,
        customer: l.userId ? userMap.get(l.userId) ?? null : null,
      })),
    })
  } catch (error) {
    console.error('GET /api/panel-admin/audit-logs error:', error)
    return NextResponse.json({ error: 'Gagal memuat audit log' }, { status: 500 })
  }
}
