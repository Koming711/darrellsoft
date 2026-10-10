// GET /api/panel-admin/payments — daftar pembayaran langganan (filter status).
// ?status=menunggu_verifikasi|disetujui|ditolak  (default: semua)
// ?limit=50
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server-auth'
import { PAYMENT_STATUS } from '@/lib/subscription'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const err = requireAdmin(request)
  if (err) return err
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') ?? ''
    const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit')) || 100))

    const where = status && Object.values(PAYMENT_STATUS).includes(status as PAYMENT_STATUS)
      ? { status }
      : {}

    const payments = await db.subscriptionPayment.findMany({
      where,
      include: {
        invoice: { select: { invoiceNumber: true, planName: true, amount: true, isPlanChange: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    // Ambil data pelanggan
    const userIds = [...new Set(payments.map((p) => p.userId))]
    const users = await db.pengguna.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, namaLengkap: true, email: true, nomorHP: true },
    })
    const userMap = new Map(users.map((u) => [u.id, u]))

    return NextResponse.json({
      payments: payments.map((p) => ({
        id: p.id,
        invoiceId: p.invoiceId,
        invoiceNumber: p.invoice.invoiceNumber,
        planName: p.invoice.planName,
        invoiceAmount: p.invoice.amount,
        isPlanChange: p.invoice.isPlanChange,
        userId: p.userId,
        customer: userMap.get(p.userId) ?? null,
        paymentMethod: p.paymentMethod,
        amount: p.amount,
        senderName: p.senderName,
        transferDate: p.transferDate,
        proofFileName: p.proofFileName,
        hasProof: !!p.proofFileUrl,
        status: p.status,
        reviewedBy: p.reviewedBy,
        reviewedAt: p.reviewedAt,
        rejectionReason: p.rejectionReason,
        createdAt: p.createdAt,
      })),
    })
  } catch (error) {
    console.error('GET /api/panel-admin/payments error:', error)
    return NextResponse.json({ error: 'Gagal memuat pembayaran' }, { status: 500 })
  }
}
