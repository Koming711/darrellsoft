// GET /api/panel-admin/subscriptions/renewal-proof?userId=xxx
// → bukti transfer (SubscriptionPayment.proofFileUrl data URL) milik satu pelanggan,
//   untuk ditampilkan di dialog "Perpanjang Masa Berlaku" panel admin.
// Return: { payments: [{ invoiceNumber, planName, amount, status, paymentMethod,
//                       senderName, transferDate, proofFileUrl, proofFileName, createdAt }] }
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const err = requireAdmin(request)
  if (err) return err
  try {
    const userId = request.nextUrl.searchParams.get('userId') ?? ''
    if (!userId) {
      return NextResponse.json({ error: 'userId wajib' }, { status: 400 })
    }

    const payments = await db.subscriptionPayment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        invoiceId: true,
        amount: true,
        paymentMethod: true,
        senderName: true,
        transferDate: true,
        proofFileUrl: true,
        proofFileName: true,
        status: true,
        createdAt: true,
        invoice: { select: { invoiceNumber: true, planName: true } },
      },
    })

    return NextResponse.json({
      payments: payments.map((p) => ({
        id: p.id,
        invoiceNumber: p.invoice?.invoiceNumber ?? '-',
        planName: p.invoice?.planName ?? '-',
        amount: p.amount,
        status: p.status,
        paymentMethod: p.paymentMethod,
        senderName: p.senderName,
        transferDate: p.transferDate,
        proofFileUrl: p.proofFileUrl || '',
        proofFileName: p.proofFileName || '',
        createdAt: p.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('GET /api/panel-admin/subscriptions/renewal-proof error:', error)
    return NextResponse.json({ error: sanitizeError(error, 'Gagal memuat bukti pembayaran') }, { status: 500 })
  }
}
