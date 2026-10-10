import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

const SETTLED = ['settlement', 'capture', 'success']

/**
 * GET /api/panel-admin/penjualan?month=YYYY-MM
 * Riwayat PENJUALAN PAKET kepada akun (tabel Payment): semua transaksi
 * pembelian paket, dengan filter bulanan (superadmin/admin saja).
 */
export async function GET(request: NextRequest) {
  const authErr = requireAdmin(request)
  if (authErr) return authErr

  try {
    const monthParam = (request.nextUrl.searchParams.get('month') || '').trim()
    let range: { gte: Date; lt: Date } | undefined

    if (/^\d{4}-\d{2}$/.test(monthParam)) {
      const [yy, mm] = monthParam.split('-').map(v => parseInt(v, 10))
      if (mm >= 1 && mm <= 12) {
        range = { gte: new Date(yy, mm - 1, 1), lt: new Date(yy, mm, 1) }
      }
    }

    const payments = await db.payment.findMany({
      where: range ? { createdAt: range } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        orderId: true,
        packageName: true,
        packageType: true,
        grossAmount: true,
        customerName: true,
        customerPhone: true,
        paymentType: true,
        transactionStatus: true,
        createdAt: true,
      },
    })

    const items = payments.map(p => ({
      id: p.id,
      orderId: p.orderId,
      packageName: p.packageName,
      packageType: p.packageType,
      grossAmount: p.grossAmount,
      customerName: p.customerName,
      customerPhone: p.customerPhone,
      paymentType: p.paymentType,
      status: p.transactionStatus,
      settled: SETTLED.includes(p.transactionStatus),
      createdAt: p.createdAt.toISOString(),
    }))

    const total = items.reduce((s, i) => s + (i.grossAmount || 0), 0)
    const totalSettled = items.filter(i => i.settled).reduce((s, i) => s + (i.grossAmount || 0), 0)
    const pendingCount = items.filter(i => i.status === 'pending').length

    const byStatus: Record<string, { count: number; total: number }> = {}
    for (const i of items) {
      const k = i.status || 'pending'
      byStatus[k] = byStatus[k] || { count: 0, total: 0 }
      byStatus[k].count += 1
      byStatus[k].total += i.grossAmount || 0
    }

    return NextResponse.json({
      items,
      summary: { count: items.length, total, totalSettled, pendingCount, byStatus },
    })
  } catch (error) {
    console.error('Panel admin riwayat penjualan error:', error)
    return NextResponse.json({ error: sanitizeError(error, 'Gagal memuat riwayat penjualan.') }, { status: 500 })
  }
}
