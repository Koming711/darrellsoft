import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'

/**
 * GET /api/laporan?periode=all|hari_ini|minggu_ini|bulan_ini|tahun_ini
 *
 * Returns aggregate summary used by the Laporan (Reports) hub page.
 *
 * Data source: DocumentHistory table (where invoices & POs are actually saved
 * by the editor pages). The legacy Invoice/PurchaseOrder tables are NOT used
 * because the editors save to DocumentHistory via /api/history.
 *
 * Multi-user behavior:
 *   - superadmin / admin → sees ALL users' data (management oversight)
 *   - regular user      → sees only their own data (strict per-user isolation)
 *
 * Response:
 *   - totalPenjualan   sum of invoice grandTotal (items subtotal + PPN)
 *   - totalPiutang     sum of unpaid invoice grandTotal (status != 'lunas')
 *   - totalInvoice     count of invoices
 *   - totalPembelian   sum of PO grandTotal
 *   - totalPO          count of purchase orders
 *   - recentInvoices   latest 5 invoices
 *   - recentPOs        latest 5 purchase orders
 */

interface InvoiceParsed {
  nomor?: string
  tanggal?: string
  client?: { nama?: string }
  items?: Array<{ qty?: number; harga?: number }>
  ppn?: number
  lunas?: boolean
  uangCapek?: number
}

interface POParsed {
  nomor?: string
  tanggal?: string
  client?: { nama?: string }
  items?: Array<{ qty?: number; harga?: number }>
  ppn?: number
}

/** Safely parse dataJson; return null on failure. */
function safeParse<T>(raw: string | null | undefined): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** Compute invoice grand total: sum(qty * harga) + PPN. */
function computeInvoiceGrandTotal(parsed: InvoiceParsed | null): number {
  if (!parsed || !Array.isArray(parsed.items)) return 0
  const subtotal = parsed.items.reduce(
    (s, it) => s + (Number(it.qty) || 0) * (Number(it.harga) || 0),
    0,
  )
  const ppn = Number(parsed.ppn) || 0
  return subtotal + (subtotal * ppn) / 100
}

/** Compute PO grand total: sum(qty * harga) + PPN. */
function computePOGrandTotal(parsed: POParsed | null): number {
  if (!parsed || !Array.isArray(parsed.items)) return 0
  const subtotal = parsed.items.reduce(
    (s, it) => s + (Number(it.qty) || 0) * (Number(it.harga) || 0),
    0,
  )
  const ppn = Number(parsed.ppn) || 0
  return subtotal + (subtotal * ppn) / 100
}

export async function GET(request: NextRequest) {
  const authErr = requireAuth(request)
  if (authErr) return authErr

  const user = getServerUser(request)

  // Strict per-user isolation: every account only sees their own data.
  // No admin override — account A cannot see account B's data, and vice versa.
  const baseFilter = await getDataFilter(user)

  const { searchParams } = new URL(request.url)
  const periode = searchParams.get('periode') || 'all'

  // Build date filter on createdAt
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
    // Read from DocumentHistory — where the editors actually save data.
    const [invoiceHistories, poHistories] = await Promise.all([
      db.documentHistory.findMany({
        where: { docType: 'invoice', deletedAt: null, ...baseFilter, ...dateWhere },
        select: {
          id: true,
          nomor: true,
          pihakKedua: true,
          tanggal: true,
          dataJson: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.documentHistory.findMany({
        where: { docType: 'purchase-order', deletedAt: null, ...baseFilter, ...dateWhere },
        select: {
          id: true,
          nomor: true,
          pihakKedua: true,
          tanggal: true,
          dataJson: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    // Compute invoice totals
    const invoiceData = invoiceHistories.map((h) => {
      const parsed = safeParse<InvoiceParsed>(h.dataJson)
      const grandTotal = computeInvoiceGrandTotal(parsed)
      const customerName = parsed?.client?.nama || h.pihakKedua || ''
      const lunas = parsed?.lunas === true
      const invoiceDate = parsed?.tanggal || h.tanggal || ''
      return {
        id: h.id,
        invoiceNumber: h.nomor,
        customerName,
        invoiceDate,
        grandTotal,
        status: lunas ? 'lunas' : 'belum',
        createdAt: h.createdAt,
      }
    })

    const totalPenjualan = invoiceData.reduce((s, i) => s + (i.grandTotal || 0), 0)
    const totalInvoice = invoiceData.length
    // Piutang = invoices not fully paid
    const piutangInvoices = invoiceData.filter((i) => i.status !== 'lunas')
    const totalPiutang = piutangInvoices.reduce((s, i) => s + (i.grandTotal || 0), 0)

    // Compute PO totals
    const poData = poHistories.map((h) => {
      const parsed = safeParse<POParsed>(h.dataJson)
      const grandTotal = computePOGrandTotal(parsed)
      const supplierName = parsed?.client?.nama || h.pihakKedua || ''
      const orderDate = parsed?.tanggal || h.tanggal || ''
      return {
        id: h.id,
        poNumber: h.nomor,
        supplierName,
        orderDate,
        total: grandTotal,
        status: 'draft',
        createdAt: h.createdAt,
      }
    })

    const totalPembelian = poData.reduce((s, p) => s + (p.total || 0), 0)
    const totalPO = poData.length

    return NextResponse.json({
      periode,
      totalPenjualan,
      totalPiutang,
      totalInvoice,
      totalPembelian,
      totalPO,
      recentInvoices: invoiceData.slice(0, 5),
      recentPOs: poData.slice(0, 5),
    })
  } catch (err) {
    console.error('[api/laporan] error:', err)
    return NextResponse.json({ error: 'Gagal memuat data laporan' }, { status: 500 })
  }
}
