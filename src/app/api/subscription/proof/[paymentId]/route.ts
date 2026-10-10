// GET /api/subscription/proof/[paymentId] — lihat bukti pembayaran (base64 data URL).
// Akses: pemilik pembayaran ATAU admin. Isolasi ketat.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, isAdmin } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  try {
    const user = getServerUser(_request)
    if (!user) {
      return NextResponse.json({ error: 'Anda harus login terlebih dahulu' }, { status: 401 })
    }
    const { paymentId } = await params

    const payment = await db.subscriptionPayment.findUnique({
      where: { id: paymentId },
      select: {
        userId: true,
        proofFileUrl: true,
        proofFileName: true,
        senderName: true,
        transferDate: true,
        paymentMethod: true,
        amount: true,
        status: true,
        rejectionReason: true,
        reviewedBy: true,
        reviewedAt: true,
        invoice: { select: { invoiceNumber: true, planName: true, amount: true } },
      },
    })
    if (!payment) {
      return NextResponse.json({ error: 'Pembayaran tidak ditemukan' }, { status: 404 })
    }
    if (payment.userId !== user.id && !isAdmin(user.role)) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    return NextResponse.json({
      proofFileUrl: payment.proofFileUrl,
      proofFileName: payment.proofFileName,
      senderName: payment.senderName,
      transferDate: payment.transferDate,
      paymentMethod: payment.paymentMethod,
      amount: payment.amount,
      status: payment.status,
      rejectionReason: payment.rejectionReason,
      reviewedBy: payment.reviewedBy,
      reviewedAt: payment.reviewedAt,
      invoice: payment.invoice,
    })
  } catch (error) {
    console.error('GET /api/subscription/proof error:', error)
    return NextResponse.json({ error: 'Gagal memuat bukti pembayaran' }, { status: 500 })
  }
}
