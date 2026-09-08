import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth, getDataFilter } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * GET /api/laporan/penjualan — Data penjualan per invoice (sumber: DocumentHistory).
 *
 * Satu invoice (docType 'invoice') = SATU baris penjualan. Dokumen pelunasan
 * (docType 'invoice-pelunasan') TIDAK dihitung terpisah — DP + pelunasan dari
 * transaksi yang sama dihitung sebagai satu transaksi (anti double counting).
 *
 * Query: q (nomor/customer/nama barang), customer, status (all|lunas|belum),
 *        start, end (YYYY-MM-DD, filter pada tanggal dokumen)
 */

interface ParsedItem { deskripsi?: string; qty?: number; harga?: number; modal?: number }

function computeInvoiceMetrics(parsed: {
  items?: ParsedItem[]
  ppn?: number
  dp?: number
  originalTotal?: number
  lunas?: boolean
  tanggalJatuhTempo?: string
  uangCapek?: number
}) {
  const items = Array.isArray(parsed.items) ? parsed.items : []
  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.harga) || 0), 0)
  const ppnAmount = subtotal * ((Number(parsed.ppn) || 0) / 100)
  const total = subtotal + ppnAmount
  // dpAmount selalu diturunkan dari originalTotal (konsisten dengan invoice/page.tsx)
  const originalTotal = parsed.originalTotal !== undefined ? Number(parsed.originalTotal) || total : total
  const dpAmount = originalTotal * ((Number(parsed.dp) || 0) / 100)
  const lunas = parsed.lunas === true
  const pelunasan = lunas ? Math.max(total - dpAmount, 0) : 0
  const sisa = lunas ? 0 : Math.max(total - dpAmount, 0)
  const uangMasuk = lunas ? total : Math.min(dpAmount, total)
  return { items, subtotal, ppnAmount, total, dpAmount, pelunasan, sisa, lunas, uangMasuk }
}

export async function GET(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const dataFilter = await getDataFilter(user)

    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') || '').trim().toLowerCase()
    const customer = (searchParams.get('customer') || '').trim().toLowerCase()
    const statusFilter = (searchParams.get('status') || 'all').trim()
    const start = (searchParams.get('start') || '').trim()
    const end = (searchParams.get('end') || '').trim()

    const rows = await db.documentHistory.findMany({
      where: { docType: 'invoice', deletedAt: null, ...dataFilter },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    })

    const todayStr = new Date().toISOString().slice(0, 10)

    let totalPenjualan = 0
    let pembayaranMasuk = 0
    let piutang = 0

    const sales = [] as Array<Record<string, unknown>>

    for (const r of rows) {
      let parsed: Record<string, unknown> = {}
      try { parsed = JSON.parse(r.dataJson || '{}') } catch { parsed = {} }
      const m = computeInvoiceMetrics(parsed as Parameters<typeof computeInvoiceMetrics>[0])

      const items = Array.isArray(parsed.items) ? (parsed.items as ParsedItem[]) : []
      const docTanggal = (typeof parsed.tanggal === 'string' && parsed.tanggal) ? parsed.tanggal : r.createdAt.toISOString().slice(0, 10)

      // Filter periode pada tanggal dokumen (fallback createdAt)
      if (start && docTanggal < start) continue
      if (end && docTanggal > end) continue

      const custName = r.pihakKedua || (typeof parsed.client === 'object' && parsed.client ? String((parsed.client as { nama?: string }).nama || '') : '')
      const jenis = (Number(parsed.dp) || 0) > 0 ? 'DP' : 'Reguler'
      const due = typeof parsed.tanggalJatuhTempo === 'string' ? parsed.tanggalJatuhTempo : ''
      let status: 'lunas' | 'jatuh_tempo' | 'dp' | 'belum' = 'belum'
      if (m.lunas) status = 'lunas'
      else if (due && due < todayStr && m.sisa > 0) status = 'jatuh_tempo'
      else if ((Number(parsed.dp) || 0) > 0) status = 'dp'

      // Pencarian: nomor invoice / customer / nama barang
      if (q) {
        const inNomor = r.nomor.toLowerCase().includes(q)
        const inCust = custName.toLowerCase().includes(q)
        const inBarang = items.some((it) => String(it.deskripsi || '').toLowerCase().includes(q))
        if (!inNomor && !inCust && !inBarang) continue
      }
      if (customer && custName.toLowerCase() !== customer) continue
      if (statusFilter === 'lunas' && status !== 'lunas') continue
      if (statusFilter === 'belum' && status === 'lunas') continue

      totalPenjualan += m.total
      pembayaranMasuk += m.uangMasuk
      piutang += m.sisa

      sales.push({
        id: r.id,
        nomor: r.nomor,
        tanggal: docTanggal,
        customer: custName,
        jenis,
        total: m.total,
        dpAmount: m.dpAmount,
        pelunasan: m.pelunasan,
        sisa: m.sisa,
        status,
        lunas: m.lunas,
        dpPercent: Number(parsed.dp) || 0,
        tanggalJatuhTempo: due,
        catatan: typeof parsed.catatan === 'string' ? parsed.catatan : '',
        caraPembayaran: parsed.caraPembayaran ?? '',
        tanggalPelunasan: parsed.tanggalPelunasan ?? '',
        barangNames: items.map((it) => String(it.deskripsi || '').split('\n')[0]).filter(Boolean),
        dataJson: r.dataJson,
      })
    }

    return NextResponse.json({
      rows: sales,
      summary: {
        totalPenjualan,
        pembayaranMasuk,
        piutang,
        jumlahInvoice: sales.length,
      },
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    console.error('Error laporan penjualan:', error)
    return NextResponse.json({ error: sanitizeError(error, 'Gagal memuat laporan penjualan') }, { status: 500 })
  }
}
