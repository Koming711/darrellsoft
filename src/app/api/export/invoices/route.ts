import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'
import { createPrintStyleExcel, type PrintColumn } from '@/lib/backup-excel'

export const runtime = 'nodejs'

/**
 * GET /api/export/invoices?q=&status=&from=&to= — Export DAFTAR invoice
 * (docType invoice + invoice-pelunasan) ke Excel, mengikuti filter yang
 * sedang aktif di halaman Riwayat Invoice:
 *   q      → cari di nomor / customer / nama barang / tanggal
 *   status → all | lunas | belum | batal
 *   from   → tanggal mulai (yyyy-mm-dd, inklusif)
 *   to     → tanggal akhir (yyyy-mm-dd, inklusif)
 * Status & total dihitung dari dataJson dengan logika yang SAMA dengan
 * halaman Riwayat Invoice (parseDocInfo + getInvoiceStatus).
 */

interface DocRowLike {
  id: string
  docType: string
  nomor: string
  tanggal: string
  pihakKedua: string
  total: string
  dataJson: string
  createdAt: Date
}

function parseDoc(row: DocRowLike) {
  try {
    const parsed = JSON.parse(row.dataJson || '{}')
    const items = parsed.items || []
    const itemCount = items.length
    const firstItem = items[0]
    const namaBarang = firstItem?.deskripsi || ''
    const totalQty = items.reduce((sum: number, it: { qty: number }) => sum + (it.qty || 0), 0)
    const subtotal = items.reduce((sum: number, it: { qty: number; harga: number }) => sum + it.qty * it.harga, 0)
    const ppn = parsed.ppn || 0
    const dpPercent = parsed.dp || 0
    const totalHarga = subtotal + (subtotal * ppn / 100)
    const originalTotal = parsed.originalTotal !== undefined ? parsed.originalTotal : totalHarga
    const dpAmount = originalTotal * (dpPercent / 100)
    const sisa = totalHarga - dpAmount
    const lunas = parsed.lunas === true
    const batal = parsed.batal === true
    const isPelunasan = row.docType === 'invoice-pelunasan'
    const hasDP = dpPercent > 0 || dpAmount > 0
    const status: 'lunas' | 'belum' | 'batal' = batal
      ? 'batal'
      : isPelunasan
        ? (lunas ? 'lunas' : 'belum')
        : ((hasDP ? lunas : (lunas || sisa <= 0)) ? 'lunas' : 'belum')
    const tipe = isPelunasan ? 'Invoice Pelunasan' : (dpPercent > 0 ? 'Invoice DP' : 'Invoice')
    return { namaBarang, itemCount, totalQty, totalHarga, status, tipe }
  } catch {
    return { namaBarang: '', itemCount: 0, totalQty: 0, totalHarga: 0, status: 'belum' as const, tipe: row.docType === 'invoice-pelunasan' ? 'Invoice Pelunasan' : 'Invoice' }
  }
}

const STATUS_LABEL: Record<string, string> = { lunas: 'Lunas', belum: 'Belum Lunas', batal: 'Batal' }

const EXPORT_COLUMNS: PrintColumn[] = [
  { key: 'nomor', label: 'Nomor', width: 22 },
  { key: 'tanggal', label: 'Tanggal', align: 'center', width: 14 },
  { key: 'pihakKedua', label: 'Pelanggan', width: 26 },
  { key: 'status', label: 'Status', align: 'center', width: 14 },
  { key: 'tipe', label: 'Tipe', align: 'center', width: 18 },
  { key: 'itemCount', label: 'Jumlah Item', align: 'center', width: 12 },
  { key: 'totalQty', label: 'Total Qty', align: 'center', width: 12 },
  { key: 'totalHarga', label: 'Total (Rp)', align: 'right', width: 18 },
]

export async function GET(req: NextRequest) {
  try {
    const authErr = requireAuth(req)
    if (authErr) return authErr
    const user = getServerUser(req)!

    const sp = new URL(req.url).searchParams
    const q = (sp.get('q') ?? '').trim().toLowerCase()
    const status = (sp.get('status') ?? 'all').trim()
    const from = (sp.get('from') ?? '').trim()
    const to = (sp.get('to') ?? '').trim()

    const dataFilter = await getDataFilter(user)
    const rows = await db.documentHistory.findMany({
      where: {
        docType: { in: ['invoice', 'invoice-pelunasan'] },
        deletedAt: null,
        ...dataFilter,
      },
      orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }],
    })

    const printData = rows
      .map((row) => {
        const info = parseDoc(row as unknown as DocRowLike)
        return { row, info }
      })
      .filter(({ row, info }) => {
        if (status !== 'all' && info.status !== status) return false
        if (from && row.tanggal && row.tanggal < from) return false
        if (to && row.tanggal && row.tanggal > to) return false
        if (q) {
          const hay = `${row.nomor || ''} ${row.pihakKedua || ''} ${info.namaBarang || ''} ${row.tanggal || ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .map(({ row, info }, i) => ({
        no: i + 1,
        nomor: row.nomor || '-',
        tanggal: row.tanggal || '-',
        pihakKedua: row.pihakKedua || '-',
        status: STATUS_LABEL[info.status] || info.status,
        tipe: info.tipe,
        itemCount: info.itemCount,
        totalQty: info.totalQty,
        totalHarga: Math.round(info.totalHarga),
      }))

    const excelBuffer = await createPrintStyleExcel(
      'Riwayat Invoice',
      EXPORT_COLUMNS,
      printData,
      printData,
      { type: 'export-invoices', table: 'invoice_history', tableName: 'Riwayat Invoice' }
    )

    const today = new Date().toISOString().slice(0, 10)
    const fileName = `Riwayat-Invoice-${today}.xlsx`
    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(excelBuffer.length),
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error: unknown) {
    console.error('Error exporting invoices:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal export riwayat invoice') },
      { status: 500 }
    )
  }
}
