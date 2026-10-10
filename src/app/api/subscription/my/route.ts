// GET /api/subscription/my — data langganan milik user yang login (ISOLASI: hanya miliknya).
// Return: subscription (dengan status turunan), tagihan, pembayaran, notifikasi.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser } from '@/lib/server-auth'
import {
  getOrCreateSubscription,
  derivedSubscriptionStatus,
  derivedInvoiceStatus,
  subscriptionDaysLeft,
} from '@/lib/subscription'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Anda harus login terlebih dahulu' }, { status: 401 })
    }

    const pengguna = await db.pengguna.findUnique({
      where: { id: user.id },
      select: { id: true, username: true, namaLengkap: true, email: true, nomorHP: true, role: true },
    })
    if (!pengguna) {
      return NextResponse.json({ error: 'Akun tidak ditemukan' }, { status: 404 })
    }

    const sub = await getOrCreateSubscription(user.id)
    const status = derivedSubscriptionStatus(sub)

    const [invoices, payments, notifications] = await Promise.all([
      db.subscriptionInvoice.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      }),
      db.subscriptionPayment.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      }),
      db.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ])

    // Serialisasi ringan
    const invoicesSafe = invoices.map((inv) => ({
      ...inv,
      planSnapshot: undefined,
      status: derivedInvoiceStatus(inv),
      payments: payments.filter((p) => p.invoiceId === inv.id).map((p) => ({
        ...p,
        proofFileUrl: p.proofFileUrl ? 'present' : '', // jangan kirim base64 besar dalam list
        hasProof: !!p.proofFileUrl,
      })),
    }))

    return NextResponse.json({
      user: pengguna,
      subscription: {
        ...sub,
        planName: sub.plan?.name ?? null,
        planPrice: sub.plan?.monthlyPrice ?? null,
        status,
        daysLeft: subscriptionDaysLeft(sub.endDate),
      },
      invoices: invoicesSafe,
      notifications,
    })
  } catch (error) {
    console.error('GET /api/subscription/my error:', error)
    return NextResponse.json({ error: 'Gagal memuat langganan' }, { status: 500 })
  }
}
