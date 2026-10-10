// POST /api/panel-admin/payments/review — admin setujui / tolak pembayaran.
// Body: { paymentId, action: 'approve'|'reject', reason? }
// IDEMPOTEN: persetujuan ganda tidak menambah masa aktif dua kali (guard di lib/subscription).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAdmin } from '@/lib/server-auth'
import { reviewPayment } from '@/lib/subscription'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const err = requireAdmin(request)
  if (err) return err
  try {
    const user = getServerUser(request)!
    // Ambil username admin untuk jejak audit
    const admin = await db.pengguna.findUnique({ where: { id: user.id }, select: { username: true } })
    const adminUsername = admin?.username || user.id

    const body = await request.json().catch(() => ({}))
    const paymentId = String(body?.paymentId ?? '')
    const action = String(body?.action ?? '')
    const reason = String(body?.reason ?? '').slice(0, 500)

    if (!paymentId) return NextResponse.json({ error: 'paymentId wajib' }, { status: 400 })
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'action harus approve atau reject' }, { status: 400 })
    }
    if (action === 'reject' && !reason.trim()) {
      return NextResponse.json({ error: 'Alasan penolakan wajib diisi' }, { status: 400 })
    }

    const result = await reviewPayment(paymentId, action, adminUsername, reason)
    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, idempotent: result.idempotent ?? false },
        { status: result.httpStatus },
      )
    }
    return NextResponse.json({
      success: true,
      message: result.message,
      newEndDate: result.newEndDate,
      planName: result.planName,
      isPlanChange: result.isPlanChange,
    })
  } catch (error) {
    console.error('POST /api/panel-admin/payments/review error:', error)
    return NextResponse.json({ error: 'Gagal memproses pembayaran' }, { status: 500 })
  }
}
