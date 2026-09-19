import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

interface InvoiceItemRaw {
  deskripsi?: string
  qty?: number
  harga?: number
  satuan?: string
}

interface InvoiceDataRaw {
  client?: { nama?: string }
  items?: InvoiceItemRaw[]
  ppn?: number
  dp?: number
  dpAmount?: number
  originalTotal?: number
  lunas?: boolean
  batal?: boolean
}

export type CustomerInvoiceType = 'REGULER' | 'DP' | 'PELUNASAN'
export type CustomerInvoiceStatus = 'BELUM_BAYAR' | 'LUNAS' | 'BATAL'

export interface HistoryInvoice {
  id: string
  number: string
  date: string
  type: CustomerInvoiceType
  status: CustomerInvoiceStatus
  /** Nilai yang ditampilkan: invoice = grand total; pelunasan = nominal pelunasan. */
  total: number
  itemCount: number
  firstItem: string
  dpAmount: number
  /** Sisa tagihan (khusus invoice DP). */
  sisa: number
  items: { id: string; name: string; qty: number; totalQty: number; status: string }[]
}

export interface HistorySummary {
  count: number
  lunas: number
  belum: number
  batal: number
  /** Jumlah nilai semua invoice (grand total invoice + nominal pelunasan). */
  total: number
}

const norm = (s: string) => s.trim().toLowerCase()

/**
 * GET /api/customers/[id]/history — daftar invoice yang pernah dibuat untuk
 * satu pelanggan (dipakai halaman "Daftar Invoice Pelanggan" dari Master Pelanggan).
 *
 * Invoice disimpan di DocumentHistory (docType 'invoice' + 'invoice-pelunasan')
 * dan terhubung ke customer lewat nama (pihakKedua / dataJson.client.nama —
 * dicocokkan case-insensitive & trim agar konsisten dengan invoiceCount).
 * Entri sampah (deletedAt) tidak ditampilkan.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const { id } = await params

    const customer = await db.customer.findUnique({ where: { id } })
    if (!customer) {
      return NextResponse.json({ error: 'Customer tidak ditemukan' }, { status: 404 })
    }
    if (customer.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    const dataFilter = await getDataFilter(user)
    const histories = await db.documentHistory.findMany({
      where: {
        docType: { in: ['invoice', 'invoice-pelunasan'] },
        deletedAt: null,
        ...dataFilter,
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    })

    const custName = norm(customer.name || '')
    const invoices: HistoryInvoice[] = []
    let lunas = 0
    let belum = 0
    let batal = 0
    let totalSum = 0

    for (const h of histories) {
      let parsed: InvoiceDataRaw = {}
      try {
        parsed = JSON.parse(h.dataJson || '{}') as InvoiceDataRaw
      } catch {
        continue
      }

      // Cocokkan lewat client.nama ATAU pihakKedua (case-insensitive, trim).
      const clientNama = typeof parsed?.client?.nama === 'string' ? parsed.client.nama : ''
      const pihak = typeof h.pihakKedua === 'string' ? h.pihakKedua : ''
      if (norm(clientNama) !== custName && norm(pihak) !== custName) continue

      const items = Array.isArray(parsed.items) ? parsed.items : []
      const subtotal = items.reduce(
        (acc, it) => acc + (Number(it.qty) || 0) * (Number(it.harga) || 0),
        0
      )
      const ppn = Number(parsed.ppn || 0)
      const totalHarga = subtotal + subtotal * (ppn / 100)
      const docTotal =
        Number(parsed.originalTotal ?? 0) > 0 ? Number(parsed.originalTotal) : totalHarga
      // DP nominal eksplisit (dpAmount) lebih diutamakan daripada turunan persen.
      const storedDpAmount = Number(parsed.dpAmount ?? 0)
      const dpPercent = Number(parsed.dp || 0)
      const dpAmount = storedDpAmount > 0 ? storedDpAmount : docTotal * (dpPercent / 100)
      const sisa = totalHarga - dpAmount
      const lunasFlag = parsed.lunas === true
      const batalFlag = parsed.batal === true
      const isPelunasan = h.docType === 'invoice-pelunasan'

      // Status: batal > lunas > belum (konsisten dengan halaman Invoice).
      let status: CustomerInvoiceStatus
      if (batalFlag) {
        status = 'BATAL'
      } else if (isPelunasan) {
        status = lunasFlag ? 'LUNAS' : 'BELUM_BAYAR'
      } else {
        const hasDP = dpPercent > 0 || dpAmount > 0
        status = hasDP ? (lunasFlag ? 'LUNAS' : 'BELUM_BAYAR')
          : (lunasFlag || sisa <= 0 ? 'LUNAS' : 'BELUM_BAYAR')
      }

      const type: CustomerInvoiceType = isPelunasan
        ? 'PELUNASAN'
        : (dpPercent > 0 || dpAmount > 0 ? 'DP' : 'REGULER')

      // Nilai yang ditampilkan: invoice (Reguler/DP) = grand total;
      // pelunasan = nominal yang dibayarkan (docTotal − DP induknya).
      const displayedTotal = isPelunasan ? Math.max(0, docTotal - dpAmount) : docTotal

      if (status === 'BATAL') batal += 1
      else if (status === 'LUNAS') lunas += 1
      else belum += 1
      totalSum += displayedTotal

      const firstItem = (items[0]?.deskripsi || '-').split('\n')[0].trim() || '-'
      invoices.push({
        id: h.id,
        number: h.nomor || '-',
        date: h.tanggal || '',
        type,
        status,
        total: Math.round(displayedTotal * 100) / 100,
        itemCount: items.length,
        firstItem,
        dpAmount: Math.round(dpAmount * 100) / 100,
        sisa: Math.max(0, Math.round(sisa * 100) / 100),
        items: items.map((it, idx) => ({
          id: `${h.id}-${idx}`,
          name: (it.deskripsi || '-').split('\n')[0].trim() || '-',
          qty: Number(it.qty) || 0,
          totalQty: Number(it.qty) || 0,
          status: '',
        })),
      })
    }

    const summary: HistorySummary = {
      count: invoices.length,
      lunas,
      belum,
      batal,
      total: Math.round(totalSum * 100) / 100,
    }

    return NextResponse.json(
      { customer, invoices, summary },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (error: unknown) {
    console.error('Error fetching customer history:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal mengambil riwayat customer') },
      { status: 500 }
    )
  }
}
