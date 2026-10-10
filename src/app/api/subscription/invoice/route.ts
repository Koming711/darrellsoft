// POST /api/subscription/invoice — buat tagihan langganan untuk paket pilihan user login.
// KEAMANAN:
// - Nominal tagihan dihitung SERVER dari DB (bukan dari browser) — beku saat dibuat.
// - Cegah tagihan ganda: 1 tagihan terbuka per (user, plan).
// - Cegah tagihan untuk paket non-aktif.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser } from '@/lib/server-auth'
import {
  getOrCreateSubscription,
  getPaymentSettings,
  generateUniqueInvoiceNumber,
  addAuditLog,
  addNotification,
  INVOICE_STATUS,
  SUB_STATUS,
} from '@/lib/subscription'

export const dynamic = 'force-dynamic'

const OPEN_STATUSES = [INVOICE_STATUS.MENUNGGU_PEMBAYARAN, INVOICE_STATUS.MENUNGGU_VERIFIKASI]

export async function POST(request: NextRequest) {
  try {
    const user = getServerUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Anda harus login terlebih dahulu' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const planId = typeof body?.planId === 'string' ? body.planId : ''
    if (!planId) {
      return NextResponse.json({ error: 'Paket belum dipilih' }, { status: 400 })
    }

    const plan = await db.subscriptionPlan.findUnique({ where: { id: planId } })
    if (!plan || !plan.isActive) {
      return NextResponse.json({ error: 'Paket tidak tersedia atau tidak aktif' }, { status: 400 })
    }

    // Cegah tagihan ganda untuk paket yang sama
    const openInvoice = await db.subscriptionInvoice.findFirst({
      where: {
        userId: user.id,
        planId,
        status: { in: OPEN_STATUSES },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (openInvoice) {
      return NextResponse.json(
        {
          error: `Masih ada tagihan terbuka untuk paket ${openInvoice.planName} (${openInvoice.invoiceNumber}). Selesaikan atau tunggu verifikasi tagihan tersebut.`,
          existingInvoiceId: openInvoice.id,
        },
        { status: 409 },
      )
    }

    const settings = await getPaymentSettings()
    const now = new Date()
    const dueDate = new Date(now.getTime() + (settings.paymentDueHours || 24) * 3600_000)

    const sub = await getOrCreateSubscription(user.id)
    const isPlanChange = !!sub.planId && sub.planId !== plan.id

    const invoiceNumber = await generateUniqueInvoiceNumber()
    const invoice = await db.subscriptionInvoice.create({
      data: {
        invoiceNumber,
        userId: user.id,
        planId: plan.id,
        subscriptionId: sub.id,
        planName: plan.name,
        amount: plan.monthlyPrice, // BEKU — tidak ikut perubahan harga paket
        originalPrice: plan.originalPrice,
        planSnapshot: JSON.stringify({
          name: plan.name,
          slug: plan.slug,
          features: JSON.parse(plan.features || '[]'),
          durationDays: plan.durationDays,
          maxAccounts: plan.maxAccounts,
        }),
        status: INVOICE_STATUS.MENUNGGU_PEMBAYARAN,
        dueDate,
        isPlanChange,
      },
    })

    // Status langganan masih belum_aktif → tetap belum_aktif; aktif hanya via approval admin.
    if (sub.status === SUB_STATUS.BELUM_AKTIF) {
      await db.customerSubscription.update({
        where: { id: sub.id },
        data: { status: SUB_STATUS.BELUM_AKTIF },
      })
    }

    await addAuditLog({
      userId: user.id,
      subscriptionId: sub.id,
      invoiceId: invoice.id,
      action: 'invoice_created',
      newStatus: INVOICE_STATUS.MENUNGGU_PEMBAYARAN,
      performedBy: user.id,
      notes: `Tagihan ${invoiceNumber} — ${plan.name} Rp ${plan.monthlyPrice.toLocaleString('id-ID')}${isPlanChange ? ' (ganti paket)' : ''}`,
    })
    // Notifikasi untuk admin (userId="" = broadcast admin)
    await addNotification({
      userId: '',
      title: 'Tagihan Baru Dibuat',
      body: `Tagihan ${invoiceNumber} — paket ${plan.name}. Menunggu pembayaran pelanggan.`,
      type: 'payment',
      link: '/panel-admin/verifikasi-pembayaran',
    })

    return NextResponse.json({
      success: true,
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount,
        originalPrice: invoice.originalPrice,
        planName: invoice.planName,
        status: invoice.status,
        dueDate: invoice.dueDate,
        isPlanChange: invoice.isPlanChange,
      },
    })
  } catch (error) {
    console.error('POST /api/subscription/invoice error:', error)
    return NextResponse.json({ error: 'Gagal membuat tagihan' }, { status: 500 })
  }
}
