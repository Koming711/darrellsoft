import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'

// ===== Types for the response =====
interface DpInvoice {
  id: string
  nomor: string
  tanggal: string
  createdAt: string
  customerName: string
  namaBarang: string
  totalHarga: number
  dpPercent: number
  dpAmount: number
  sisa: number
  lunas: boolean
  tanggalJatuhTempo: string
  tanggalPelunasan: string
  isOverdue: boolean
  caraPembayaran: string
}

interface DpSummary {
  totalInvoiceDP: number
  totalNilai: number
  totalDPMasuk: number
  totalSisaPiutang: number
  totalLunas: number
  totalBelumLunas: number
  totalOverdue: number
}

interface DpResponse {
  success: true
  periode: { startDate: string | null; endDate: string | null }
  status: string
  invoices: DpInvoice[]
  summary: DpSummary
}

// Parse the dataJson field of a DocumentHistory row into a normalized shape.
// Mirrors parseInvoice() used in /api/rekap-penjualan so numbers stay
// consistent with what the user sees on the rest of the app.
function parseInvoiceDp(dataJson: string): {
  customerName: string
  namaBarang: string
  totalHarga: number
  dpPercent: number
  dpAmount: number
  sisa: number
  lunas: boolean
  tanggalJatuhTempo: string
  tanggalPelunasan: string
  caraPembayaran: string
} {
  const empty = {
    customerName: '',
    namaBarang: '',
    totalHarga: 0,
    dpPercent: 0,
    dpAmount: 0,
    sisa: 0,
    lunas: false,
    tanggalJatuhTempo: '',
    tanggalPelunasan: '',
    caraPembayaran: '',
  }
  try {
    const parsed = JSON.parse(dataJson)
    const items = parsed.items || []
    const client = parsed.client || {}
    const customerName = (client.nama || '').trim()
    const ppn = parsed.ppn || 0
    const dpPercent = parsed.dp || 0
    const tanggalJatuhTempo = parsed.tanggalJatuhTempo || ''
    const tanggalPelunasan = parsed.tanggalPelunasan || ''
    const lunas = parsed.lunas === true
    const caraPembayaran = parsed.caraPembayaran || ''

    const firstItem = items[0]
    const namaBarang: string = firstItem?.deskripsi || ''

    const subtotal = items.reduce(
      (sum: number, it: { qty: number; harga: number }) =>
        sum + (it.qty || 0) * (it.harga || 0),
      0
    )
    const totalHarga = subtotal + (subtotal * ppn) / 100
    const dpAmount = totalHarga * (dpPercent / 100)
    const sisa = totalHarga - dpAmount

    return {
      customerName,
      namaBarang,
      totalHarga,
      dpPercent,
      dpAmount,
      sisa,
      lunas,
      tanggalJatuhTempo,
      tanggalPelunasan,
      caraPembayaran,
    }
  } catch {
    return empty
  }
}

function isOverdueInvoice(
  lunas: boolean,
  sisa: number,
  tanggalJatuhTempo: string
): boolean {
  if (lunas || sisa <= 0) return false
  if (!tanggalJatuhTempo) return false
  try {
    const jt = new Date(tanggalJatuhTempo + 'T23:59:59')
    return jt.getTime() < Date.now()
  } catch {
    return false
  }
}

// GET /api/laporan-invoice-dp?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&status=all|belum_lunas|lunas|jatuh_tempo
// Returns the list of invoices that have a DP (dp > 0), with settlement info.
export async function GET(
  request: NextRequest
): Promise<NextResponse<DpResponse | { error: string }>> {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr

    const user = getServerUser(request)
    const { searchParams } = new URL(request.url)
    const startDateStr = searchParams.get('startDate')
    const endDateStr = searchParams.get('endDate')
    const status = searchParams.get('status') || 'all' // all | belum_lunas | lunas | jatuh_tempo

    const dataFilter = await getDataFilter(user)

    // Build date filter on createdAt
    const dateFilter: Record<string, Date> = {}
    if (startDateStr) {
      const start = new Date(startDateStr)
      start.setHours(0, 0, 0, 0)
      dateFilter.gte = start
    }
    if (endDateStr) {
      const end = new Date(endDateStr)
      end.setHours(23, 59, 59, 999)
      dateFilter.lte = end
    }

    const where: Record<string, unknown> = { docType: 'invoice', ...dataFilter }
    if (Object.keys(dateFilter).length > 0) {
      where.createdAt = dateFilter
    }

    // Fetch all invoice rows for the user (and period).
    // Same raised limit as /api/rekap-penjualan (5000) — more than enough for
    // any realistic small/medium print shop.
    const histories = await db.documentHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
    })

    // Filter to only invoices with DP > 0, then map to DpInvoice
    const allDpInvoices: DpInvoice[] = []
    for (const h of histories) {
      const info = parseInvoiceDp(h.dataJson)
      if (info.dpPercent <= 0) continue // skip non-DP invoices

      const customerName =
        (info.customerName || h.pihakKedua || '').trim() || '(Tanpa Nama)'
      const overdue = isOverdueInvoice(
        info.lunas,
        info.sisa,
        info.tanggalJatuhTempo
      )

      allDpInvoices.push({
        id: h.id,
        nomor: h.nomor || '',
        tanggal: h.tanggal || '',
        createdAt: h.createdAt.toISOString(),
        customerName,
        namaBarang: info.namaBarang,
        totalHarga: info.totalHarga,
        dpPercent: info.dpPercent,
        dpAmount: info.dpAmount,
        sisa: info.sisa,
        lunas: info.lunas || info.sisa <= 0,
        tanggalJatuhTempo: info.tanggalJatuhTempo,
        tanggalPelunasan: info.tanggalPelunasan,
        isOverdue: overdue,
        caraPembayaran: info.caraPembayaran,
      })
    }

    // Apply status filter
    const filteredInvoices = allDpInvoices.filter((inv) => {
      switch (status) {
        case 'lunas':
          return inv.lunas
        case 'belum_lunas':
          return !inv.lunas
        case 'jatuh_tempo':
          return !inv.lunas && inv.isOverdue
        default:
          return true
      }
    })

    // Summary (always computed from the full DP list, not the filtered one,
    // so the cards stay stable regardless of the status filter the user picks)
    const summary: DpSummary = {
      totalInvoiceDP: allDpInvoices.length,
      totalNilai: allDpInvoices.reduce((s, i) => s + i.totalHarga, 0),
      totalDPMasuk: allDpInvoices.reduce((s, i) => s + i.dpAmount, 0),
      totalSisaPiutang: allDpInvoices
        .filter((i) => !i.lunas)
        .reduce((s, i) => s + i.sisa, 0),
      totalLunas: allDpInvoices.filter((i) => i.lunas).length,
      totalBelumLunas: allDpInvoices.filter((i) => !i.lunas).length,
      totalOverdue: allDpInvoices.filter((i) => !i.lunas && i.isOverdue).length,
    }

    return NextResponse.json({
      success: true,
      periode: { startDate: startDateStr, endDate: endDateStr },
      status,
      invoices: filteredInvoices,
      summary,
    })
  } catch (error) {
    console.error('GET /api/laporan-invoice-dp error:', error)
    return NextResponse.json(
      { error: 'Gagal mengambil laporan invoice DP' },
      { status: 500 }
    )
  }
}
