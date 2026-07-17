import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'

// Types for the recap response
interface RecapInvoice {
  id: string
  nomor: string
  tanggal: string
  createdAt: string
  totalHarga: number
  dp: number
  sisa: number
  lunas: boolean
  tanggalJatuhTempo: string
  tanggalPelunasan: string
  namaBarang: string
}

interface RecapCustomer {
  customerName: string
  totalInvoices: number
  totalNilai: number
  totalDP: number
  totalSisa: number
  totalLunas: number
  totalBelumLunas: number
  lastTransactionAt: string
  lastTransactionTanggal: string
  invoices: RecapInvoice[]
}

interface RecapResponse {
  success: true
  periode: { startDate: string | null; endDate: string | null }
  customers: RecapCustomer[]
  grandTotal: {
    totalCustomers: number
    totalInvoices: number
    totalNilai: number
    totalDP: number
    totalSisa: number
    totalLunas: number
    totalBelumLunas: number
  }
}

// Parse the dataJson field of a DocumentHistory row into a normalized shape.
// Mirrors parseDocInfo() used on the riwayat-penjualan page so the recap
// stays consistent with what the user sees there.
function parseInvoice(dataJson: string): {
  namaCustomer: string
  namaBarang: string
  totalHarga: number
  dp: number
  sisa: number
  lunas: boolean
  tanggalJatuhTempo: string
  tanggalPelunasan: string
} {
  try {
    const parsed = JSON.parse(dataJson)
    const items = parsed.items || []
    const client = parsed.client || {}
    const namaCustomer = (client.nama || '').trim()
    const ppn = parsed.ppn || 0
    const dpPercent = parsed.dp || 0
    const tanggalJatuhTempo = parsed.tanggalJatuhTempo || ''
    const tanggalPelunasan = parsed.tanggalPelunasan || ''
    const lunas = parsed.lunas === true

    const firstItem = items[0]
    const namaBarang: string = firstItem?.deskripsi || ''

    const subtotal = items.reduce((sum: number, it: { qty: number; harga: number }) => sum + (it.qty || 0) * (it.harga || 0), 0)
    const totalHarga = subtotal + (subtotal * ppn / 100)
    const dpAmount = totalHarga * (dpPercent / 100)
    const sisa = totalHarga - dpAmount

    return {
      namaCustomer,
      namaBarang,
      totalHarga,
      dp: dpAmount,
      sisa,
      lunas,
      tanggalJatuhTempo,
      tanggalPelunasan,
    }
  } catch {
    return {
      namaCustomer: '',
      namaBarang: '',
      totalHarga: 0,
      dp: 0,
      sisa: 0,
      lunas: false,
      tanggalJatuhTempo: '',
      tanggalPelunasan: '',
    }
  }
}

// GET /api/rekap-penjualan?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// Aggregates invoice sales history by customer name (per-user isolation).
export async function GET(request: NextRequest): Promise<NextResponse<RecapResponse | { error: string }>> {
  try {
    const user = getServerUser(request)
    const authErr = requireAuth(request)
    if (authErr) return authErr

    const { searchParams } = new URL(request.url)
    const startDateStr = searchParams.get('startDate')
    const endDateStr = searchParams.get('endDate')

    // Strict per-user isolation: every account only sees their own data.
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

    // Fetch all invoice history rows for the user (and period).
    // Note: existing /api/history caps at take:100, but a recap should cover
    // every sale in the period — so we raise the limit to 5000 which is more
    // than enough for any realistic small/medium print shop.
    const histories = await db.documentHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
    })

    // Aggregate by customer name (case-insensitive key, but preserve original casing)
    const customerMap = new Map<string, RecapCustomer>()

    for (const h of histories) {
      const info = parseInvoice(h.dataJson)
      const rawName = (info.namaCustomer || h.pihakKedua || '').trim()
      const displayName = rawName || '(Tanpa Nama)'
      const key = displayName.toLowerCase()

      const invoice: RecapInvoice = {
        id: h.id,
        nomor: h.nomor || '',
        tanggal: h.tanggal || '',
        createdAt: h.createdAt.toISOString(),
        totalHarga: info.totalHarga,
        dp: info.dp,
        sisa: info.sisa,
        lunas: info.lunas || info.sisa <= 0,
        tanggalJatuhTempo: info.tanggalJatuhTempo,
        tanggalPelunasan: info.tanggalPelunasan,
        namaBarang: info.namaBarang,
      }

      let cust = customerMap.get(key)
      if (!cust) {
        cust = {
          customerName: displayName,
          totalInvoices: 0,
          totalNilai: 0,
          totalDP: 0,
          totalSisa: 0,
          totalLunas: 0,
          totalBelumLunas: 0,
          lastTransactionAt: h.createdAt.toISOString(),
          lastTransactionTanggal: h.tanggal || '',
          invoices: [],
        }
        customerMap.set(key, cust)
      }

      cust.totalInvoices += 1
      cust.totalNilai += info.totalHarga
      cust.totalDP += info.dp
      // Only count outstanding when invoice is not yet paid
      cust.totalSisa += info.lunas || info.sisa <= 0 ? 0 : info.sisa
      if (info.lunas || info.sisa <= 0) {
        cust.totalLunas += 1
      } else {
        cust.totalBelumLunas += 1
      }
      // histories are sorted desc by createdAt, so the first one we add
      // for a customer is their most recent transaction.
      if (cust.invoices.length === 0) {
        cust.lastTransactionAt = h.createdAt.toISOString()
        cust.lastTransactionTanggal = h.tanggal || ''
      }
      cust.invoices.push(invoice)
    }

    const customers = Array.from(customerMap.values())

    const grandTotal = {
      totalCustomers: customers.length,
      totalInvoices: customers.reduce((s, c) => s + c.totalInvoices, 0),
      totalNilai: customers.reduce((s, c) => s + c.totalNilai, 0),
      totalDP: customers.reduce((s, c) => s + c.totalDP, 0),
      totalSisa: customers.reduce((s, c) => s + c.totalSisa, 0),
      totalLunas: customers.reduce((s, c) => s + c.totalLunas, 0),
      totalBelumLunas: customers.reduce((s, c) => s + c.totalBelumLunas, 0),
    }

    return NextResponse.json({
      success: true,
      periode: { startDate: startDateStr, endDate: endDateStr },
      customers,
      grandTotal,
    })
  } catch (error) {
    console.error('GET /api/rekap-penjualan error:', error)
    return NextResponse.json({ error: 'Gagal mengambil rekap penjualan' }, { status: 500 })
  }
}
