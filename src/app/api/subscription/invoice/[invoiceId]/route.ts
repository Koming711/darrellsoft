// GET /api/subscription/invoice/[invoiceId] — detail tagihan (HANYA pemilik).
// Return: tagihan + pembayaran terkait + pengaturan pembayaran + langganan saat ini.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, isAdmin } from '@/lib/server-auth'
import {
  derivedInvoiceStatus,
  getPaymentSettings,
  getOrCreateSubscription,
  derivedSubscriptionStatus,
} from '@/lib/subscription'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  try {
    const user = getServerUser(_request)
    if (!user) {
      return NextResponse.json({ error: 'Anda harus login terlebih dahulu' }, { status: 401 })
    }
    const { invoiceId } = await params

    let invoice = await db.subscriptionInvoice.findUnique({
      where: { id: invoiceId },
      include: { plan: true },
    })
    if (!invoice) {
      return NextResponse.json({ error: 'Tagihan tidak ditemukan' }, { status: 404 })
    }
    if (invoice.userId !== user.id && !isAdmin(user.role)) {
      return NextResponse.json({ error: 'Akses ditolak — tagihan bukan milik Anda' }, { status: 403 })
    }

    // Tagihan menunggu_pembayaran yang lewat batas waktu → tandai kedaluwarsa (persist)
    if (
      invoice.status === 'menunggu_pembayaran' &&
      invoice.dueDate &&
      new Date(invoice.dueDate) < new Date()
    ) {
      try {
        await db.subscriptionInvoice.update({
          where: { id: invoice.id },
          data: { status: 'kedaluwarsa' },
        })
        invoice = { ...invoice, status: 'kedaluwarsa' }
      } catch { /* non-fatal */ }
    }

    const [payments, settings, sub] = await Promise.all([
      db.subscriptionPayment.findMany({
        where: { invoiceId: invoice.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          paymentMethod: true,
          amount: true,
          senderName: true,
          transferDate: true,
          status: true,
          rejectionReason: true,
          reviewedBy: true,
          reviewedAt: true,
          createdAt: true,
          proofFileName: true,
        },
      }),
      getPaymentSettings(),
      getOrCreateSubscription(invoice.userId),
    ])

    return NextResponse.json({
      invoice: {
        ...invoice,
        plan: {
          id: invoice.plan.id,
          name: invoice.plan.name,
          slug: invoice.plan.slug,
          features: JSON.parse(invoice.plan.features || '[]'),
          durationDays: invoice.plan.durationDays,
          maxAccounts: invoice.plan.maxAccounts,
        },
        status: derivedInvoiceStatus(invoice),
        rawStatus: invoice.status,
      },
      payments,
      settings: {
        qrisImageUrl: settings.qrisImageUrl,
        qrisReceiverName: settings.qrisReceiverName,
        bankName: settings.bankName,
        bankAccountNumber: settings.bankAccountNumber,
        bankAccountName: settings.bankAccountName,
        paymentInstructions: settings.paymentInstructions,
        paymentDueHours: settings.paymentDueHours,
      },
      subscription: {
        status: derivedSubscriptionStatus(sub),
        planName: sub.plan?.name ?? null,
        endDate: sub.endDate,
      },
    })
  } catch (error) {
    console.error('GET /api/subscription/invoice/[invoiceId] error:', error)
    return NextResponse.json({ error: 'Gagal memuat tagihan' }, { status: 500 })
  }
}
