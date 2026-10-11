// GET /api/panel-admin/subscription-stats — Ringkasan dashboard admin langganan.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server-auth'
import {
  derivedSubscriptionStatus,
  ensureSubscriptionSeeded,
  INVOICE_STATUS,
  PAYMENT_STATUS,
  SUB_STATUS,
} from '@/lib/subscription'
import { runExpiryReminderSweep } from '@/lib/subscription-reminders'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const err = requireAdmin(request)
  if (err) return err
  try {
    await ensureSubscriptionSeeded()

    // Aturan #8 — sweep pengingat kedaluwarsa (7 hari / 3 hari / berakhir) untuk
    // semua langganan. Throttle in-memory 3 menit — admin buka dashboard = memicu.
    // Fire-and-forget agar dashboard tidak menunggu.
    void runExpiryReminderSweep().catch(() => {})

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [subs, totalPengguna, totalCalon, pendingPayments, approvedPayments, planCounts, recentPayments, pendingInvoices] =
      await Promise.all([
        db.customerSubscription.findMany({
          select: { id: true, userId: true, status: true, endDate: true, planId: true },
        }),
        db.pengguna.count(),
        db.calonPembeli.count(),
        db.subscriptionPayment.findMany({
          where: { status: PAYMENT_STATUS.MENUNGGU_VERIFIKASI },
          include: { invoice: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        db.subscriptionPayment.findMany({
          where: { status: PAYMENT_STATUS.DISETUJUI },
          select: { amount: true, createdAt: true },
        }),
        db.subscriptionPlan.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
        db.subscriptionPayment.findMany({
          where: { status: PAYMENT_STATUS.DISETUJUI },
          include: {
            invoice: { select: { invoiceNumber: true, planName: true } },
          },
          orderBy: { reviewedAt: 'desc' },
          take: 10,
        }),
        db.subscriptionInvoice.findMany({ select: { userId: true, status: true, dueDate: true } }),
      ])

    // Hitung status turunan per langganan
    const statusCounts: Record<string, number> = {
      [SUB_STATUS.BELUM_AKTIF]: 0,
      [SUB_STATUS.AKTIF]: 0,
      [SUB_STATUS.AKAN_BERAKHIR]: 0,
      [SUB_STATUS.KEDALUWARSA]: 0,
      [SUB_STATUS.DITANGGUHKAN]: 0,
      [SUB_STATUS.DIBATALKAN]: 0,
    }
    const perPlan: Record<string, number> = {}
    for (const s of subs) {
      const st = derivedSubscriptionStatus(s)
      statusCounts[st] = (statusCounts[st] ?? 0) + 1
      if ((st === SUB_STATUS.AKTIF || st === SUB_STATUS.AKAN_BERAKHIR) && s.planId) {
        perPlan[s.planId] = (perPlan[s.planId] ?? 0) + 1
      }
    }

    const totalPendapatan = approvedPayments.reduce((sum, p) => sum + p.amount, 0)
    const pendapatanBulanIni = approvedPayments
      .filter((p) => p.createdAt >= startOfMonth)
      .reduce((sum, p) => sum + p.amount, 0)

    // Tagihan menunggu aksi pelanggan (belum bayar / belum lewat)
    const tagihanMenungguPembayaran = pendingInvoices.filter((i) => {
      if (i.status !== INVOICE_STATUS.MENUNGGU_PEMBAYARAN) return false
      return new Date(i.dueDate).getTime() > now.getTime()
    }).length

    return NextResponse.json({
      totalAkun: totalPengguna + totalCalon,
      pelangganAktif: statusCounts[SUB_STATUS.AKTIF],
      pelangganAkanBerakhir: statusCounts[SUB_STATUS.AKAN_BERAKHIR],
      pelangganKedaluwarsa: statusCounts[SUB_STATUS.KEDALUWARSA],
      pelangganDitangguhkan: statusCounts[SUB_STATUS.DITANGGUHKAN],
      pelangganBelumAktif: statusCounts[SUB_STATUS.BELUM_AKTIF],
      pembayaranMenungguVerifikasi: pendingPayments.length,
      totalPendapatan,
      pendapatanBulanIni,
      tagihanMenungguPembayaran,
      pelangganPerPaket: planCounts.map((p) => ({
        planId: p.id,
        name: p.name,
        count: perPlan[p.id] ?? 0,
      })),
      pendingPaymentList: pendingPayments.slice(0, 10).map((p) => ({
        id: p.id,
        invoiceNumber: p.invoice.invoiceNumber,
        planName: p.invoice.planName,
        amount: p.amount,
        paymentMethod: p.paymentMethod,
        createdAt: p.createdAt,
      })),
      recentApproved: recentPayments.map((p) => ({
        id: p.id,
        invoiceNumber: p.invoice.invoiceNumber,
        planName: p.invoice.planName,
        amount: p.amount,
        reviewedAt: p.reviewedAt,
      })),
    })
  } catch (error) {
    console.error('GET /api/panel-admin/subscription-stats error:', error)
    return NextResponse.json({ error: 'Gagal memuat ringkasan' }, { status: 500 })
  }
}
