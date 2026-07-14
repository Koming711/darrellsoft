import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'

/**
 * GET /api/laporan?periode=all|hari_ini|minggu_ini|bulan_ini|tahun_ini
 *
 * Returns aggregate summary used by the Laporan (Reports) hub page:
 *   - totalPenjualan   sum of Invoice.grandTotal
 *   - totalPiutang     sum of Invoice.grandTotal where status != 'lunas' (outstanding)
 *   - totalInvoice     count of Invoice
 *   - totalPembelian   sum of PurchaseOrder.total
 *   - totalPO          count of PurchaseOrder
 *   - recentInvoices   latest 5 invoices (nomor, customer, total, tanggal, status)
 *   - recentPOs        latest 5 purchase orders
 */
export async function GET(request: NextRequest) {
  const authErr = requireAuth(request)
  if (authErr) return authErr

  const user = getServerUser(request)
  const dataFilter = await getDataFilter(user)

  const { searchParams } = new URL(request.url)
  const periode = searchParams.get('periode') || 'all'

  // Build date filter
  const now = new Date()
  let startDate: Date | undefined
  if (periode === 'hari_ini') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  } else if (periode === 'minggu_ini') {
    // Monday as the first day of the week
    const day = now.getDay() || 7 // 0 = Sunday → 7
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1)
  } else if (periode === 'bulan_ini') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
  } else if (periode === 'tahun_ini') {
    startDate = new Date(now.getFullYear(), 0, 1)
  }

  const dateWhere = startDate ? { createdAt: { gte: startDate } } : {}

  try {
    const [invoices, purchaseOrders] = await Promise.all([
      db.invoice.findMany({
        where: { ...dataFilter, ...dateWhere },
        select: {
          id: true,
          invoiceNumber: true,
          customerName: true,
          invoiceDate: true,
          grandTotal: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.purchaseOrder.findMany({
        where: { ...dataFilter, ...dateWhere },
        select: {
          id: true,
          poNumber: true,
          supplierName: true,
          orderDate: true,
          total: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    const totalPenjualan = invoices.reduce((s, i) => s + (i.grandTotal || 0), 0)
    const totalInvoice = invoices.length
    // Outstanding (piutang) = invoices not fully paid. We approximate using
    // status field: 'lunas' = paid, anything else = outstanding.
    const piutangInvoices = invoices.filter((i) => i.status !== 'lunas')
    const totalPiutang = piutangInvoices.reduce((s, i) => s + (i.grandTotal || 0), 0)

    const totalPembelian = purchaseOrders.reduce((s, p) => s + (p.total || 0), 0)
    const totalPO = purchaseOrders.length

    return NextResponse.json({
      periode,
      totalPenjualan,
      totalPiutang,
      totalInvoice,
      totalPembelian,
      totalPO,
      recentInvoices: invoices.slice(0, 5),
      recentPOs: purchaseOrders.slice(0, 5),
    })
  } catch (err) {
    console.error('[api/laporan] error:', err)
    return NextResponse.json({ error: 'Gagal memuat data laporan' }, { status: 500 })
  }
}
