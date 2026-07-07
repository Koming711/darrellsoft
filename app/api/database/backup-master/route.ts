import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

import { createPrintStyleExcel, PrintColumn } from '@/lib/backup-excel'

// Column definitions per table (matching print preview)
const TABLE_COLUMNS: Record<string, PrintColumn[]> = {
  finishing: [
    { key: 'name', label: 'Nama Finishing', width: 24 },
    { key: 'minimumSheets', label: 'Minim Lembar', align: 'center', width: 14 },
    { key: 'minimumPrice', label: 'Harga Minimum (Rp)', align: 'right', width: 20 },
    { key: 'additionalPrice', label: 'Harga Lebih (Rp/lembar)', align: 'right', width: 22 },
    { key: 'pricePerCm', label: 'Harga per cm (Rp)', align: 'right', width: 18 },
  ],
  printing_cost: [
    { key: 'machineName', label: 'Nama Mesin', width: 24 },
    { key: 'grammage', label: 'Grammage', align: 'center', width: 12 },
    { key: 'areaCetak', label: 'Area Cetak (cm)', align: 'center', width: 16 },
    { key: 'pricePerColor', label: 'Harga/Warna (Rp)', align: 'right', width: 18 },
    { key: 'specialColorPrice', label: 'Warna Khusus (Rp)', align: 'right', width: 18 },
    { key: 'minimumPrintQuantity', label: 'Min. Cetak', align: 'center', width: 12 },
    { key: 'priceAboveMinimumPerSheet', label: 'Lebih Cetak/Lembar (Rp)', align: 'right', width: 22 },
    { key: 'platePricePerSheet', label: 'Plat/Lembar (Rp)', align: 'right', width: 16 },
  ],
  paper: [
    { key: 'name', label: 'Nama Bahan', width: 24 },
    { key: 'grammage', label: 'Gramatur', align: 'center', width: 12 },
    { key: 'ukuran', label: 'Ukuran (cm)', align: 'center', width: 14 },
    { key: 'pricePerRim', label: 'Harga/Rim (Rp)', align: 'right', width: 18 },
    { key: 'hargaPerLembar', label: 'Harga/Lembar (Rp)', align: 'right', width: 18 },
  ],
  customer: [
    { key: 'name', label: 'Nama', width: 22 },
    { key: 'companyName', label: 'Perusahaan', width: 22 },
    { key: 'address', label: 'Alamat', width: 30 },
    { key: 'phone', label: 'Nomor Telp', width: 16 },
    { key: 'email', label: 'Email', width: 24 },
  ],
  toko_pemasok: [
    { key: 'namaToko', label: 'Nama Toko', width: 22 },
    { key: 'jenisBarang', label: 'Jenis Barang', width: 22 },
    { key: 'kontak', label: 'Kontak', width: 16 },
    { key: 'alamat', label: 'Alamat', width: 30 },
  ],
  invoice_history: [
    { key: 'nomor', label: 'No. Invoice', width: 20 },
    { key: 'tanggal', label: 'Tanggal', align: 'center', width: 14 },
    { key: 'pihakKedua', label: 'Customer', width: 22 },
    { key: 'namaBarang', label: 'Nama Barang', width: 28 },
    { key: 'totalQty', label: 'Qty', align: 'center', width: 8 },
    { key: 'totalHarga', label: 'Total (Rp)', align: 'right', width: 18 },
  ],
  surat_jalan_history: [
    { key: 'nomor', label: 'No. SJ', width: 20 },
    { key: 'tanggal', label: 'Tanggal', align: 'center', width: 14 },
    { key: 'pihakKedua', label: 'Penerima', width: 22 },
    { key: 'namaBarang', label: 'Nama Barang', width: 28 },
    { key: 'totalQty', label: 'Qty', align: 'center', width: 8 },
  ],
  purchase_order_history: [
    { key: 'nomor', label: 'No. PO', width: 20 },
    { key: 'tanggal', label: 'Tanggal', align: 'center', width: 14 },
    { key: 'pihakKedua', label: 'Suplier', width: 22 },
    { key: 'namaBarang', label: 'Nama Barang', width: 28 },
    { key: 'totalQty', label: 'Qty', align: 'center', width: 8 },
    { key: 'totalHarga', label: 'Total (Rp)', align: 'right', width: 18 },
  ],
  riwayat_potong_kertas: [
    { key: 'nomorUrut', label: 'No. PK', width: 12 },
    { key: 'tanggal', label: 'Tanggal', align: 'center', width: 14 },
    { key: 'namaCustomer', label: 'Customer', width: 22 },
    { key: 'namaCetakan', label: 'Nama Barang', width: 28 },
    { key: 'paperName', label: 'Kertas', width: 18 },
    { key: 'quantity', label: 'Qty', align: 'center', width: 8 },
    { key: 'totalPrice', label: 'Total (Rp)', align: 'right', width: 18 },
  ],
  riwayat_cetakan: [
    { key: 'nomorUrut', label: 'No. HC', width: 12 },
    { key: 'tanggal', label: 'Tanggal', align: 'center', width: 14 },
    { key: 'customerName', label: 'Customer', width: 22 },
    { key: 'printName', label: 'Nama Barang', width: 28 },
    { key: 'quantity', label: 'Qty', align: 'center', width: 8 },
    { key: 'grandTotal', label: 'Total (Rp)', align: 'right', width: 18 },
  ],
}

/** Transform raw data into print-friendly format for each table */
function transformForPrint(table: string, rawData: Record<string, any>[]): Record<string, any>[] {
  switch (table) {
    case 'finishing':
      return rawData.map((row) => ({
        ...row,
        minimumSheets: row.minimumSheets || 0,
        minimumPrice: row.minimumPrice || 0,
        additionalPrice: row.additionalPrice || 0,
        pricePerCm: row.pricePerCm || 0,
      }))

    case 'printing_cost':
      return rawData.map((row) => ({
        ...row,
        areaCetak: `${row.printAreaWidth || 0} x ${row.printAreaHeight || 0}`,
      }))

    case 'paper':
      return rawData.map((row) => ({
        ...row,
        ukuran: `${row.width || 0} x ${row.height || 0}`,
        hargaPerLembar: Math.round((row.pricePerRim || 0) / 500),
      }))

    case 'customer':
      return rawData.map((row) => row)

    case 'toko_pemasok':
      return rawData.map((row) => row)

    case 'invoice_history':
    case 'surat_jalan_history':
    case 'purchase_order_history':
      // Parse dataJson for print-friendly columns
      return rawData.map((row) => {
        let namaBarang = ''
        let totalQty = 0
        let totalHarga = 0
        try {
          const parsed = JSON.parse(row.dataJson || '{}')
          const items = parsed.items || []
          const firstItem = items[0]
          namaBarang = firstItem?.deskripsi || ''
          totalQty = items.reduce((sum: number, it: { qty: number }) => sum + (it.qty || 0), 0)
          const subtotal = items.reduce((sum: number, it: { qty: number; harga: number }) => sum + it.qty * it.harga, 0)
          const ppn = parsed.ppn || 0
          totalHarga = subtotal + (subtotal * ppn / 100)
        } catch {}
        return {
          ...row,
          namaBarang: namaBarang || '-',
          totalQty: totalQty || 0,
          totalHarga: totalHarga || 0,
        }
      })

    case 'riwayat_potong_kertas':
      return rawData.map((row) => ({
        ...row,
        tanggal: row.createdAt ? new Date(row.createdAt).toLocaleDateString('id-ID') : '-',
      }))

    case 'riwayat_cetakan':
      return rawData.map((row) => ({
        ...row,
        tanggal: row.createdAt ? new Date(row.createdAt).toLocaleDateString('id-ID') : '-',
      }))

    default:
      return rawData
  }
}

// Map of master table keys to Prisma models and display names
const MASTER_TABLES: Record<string, { model: any; name: string; extraFilter?: Record<string, any> }> = {
  finishing: { model: db.finishing, name: 'Master Finishing' },
  printing_cost: { model: db.printingCost, name: 'Master Ongkos Cetak' },
  paper: { model: db.paper, name: 'Master Harga Kertas' },
  customer: { model: db.customer, name: 'Master Customer' },
  toko_pemasok: { model: db.tokoPemasok, name: 'Master Toko/Pemasok' },
  invoice_history: { model: db.documentHistory, name: 'Riwayat Invoice', extraFilter: { docType: 'invoice' } },
  surat_jalan_history: { model: db.documentHistory, name: 'Riwayat Surat Jalan', extraFilter: { docType: 'surat-jalan' } },
  purchase_order_history: { model: db.documentHistory, name: 'Riwayat Purchase Order', extraFilter: { docType: 'purchase-order' } },
  riwayat_potong_kertas: { model: db.riwayatPotongKertas, name: 'Riwayat Potong Kertas' },
  riwayat_cetakan: { model: db.riwayatCetakan, name: 'Riwayat Hitung Cetakan' },
}

function getUserFromRequest(req: NextRequest) {
  let userId = req.cookies.get('userId')?.value
  let userRole = req.cookies.get('userRole')?.value

  if (!userId || !userRole) {
    userId = userId || req.headers.get('x-user-id')
    userRole = userRole || req.headers.get('x-user-role')
  }

  // Fallback: query params (for window.open downloads)
  if (!userId || !userRole) {
    userId = userId || req.nextUrl.searchParams.get('uid')
    userRole = userRole || req.nextUrl.searchParams.get('role')
  }

  if (!userId || !userRole) return null
  return { id: userId, role: userRole }
}

/** Shared logic for generating the print-style backup Excel */
async function generateBackup(table: string, userId: string) {
  const tableConfig = MASTER_TABLES[table]
  const filter: Record<string, any> = { userId, ...tableConfig.extraFilter }
  const rawData = await tableConfig.model.findMany({ where: filter, orderBy: { createdAt: 'desc' } })

  // Get column config for this table (fallback to auto-detect)
  const columns = TABLE_COLUMNS[table] || Object.keys(rawData[0] || {}).map((k) => ({ key: k, label: k }))

  // Transform data for print view
  const printData = transformForPrint(table, rawData)

  const excelBuffer = await createPrintStyleExcel(
    tableConfig.name,
    columns,
    printData,
    rawData,
    {
      type: 'master-backup',
      table,
      tableName: tableConfig.name,
    }
  )

  return { excelBuffer, count: rawData.length }
}

// GET: Backup a specific master table as print-style Excel (download via browser)
export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req)
  if (!user) {
    return NextResponse.json({ error: 'Anda harus login terlebih dahulu' }, { status: 401 })
  }

  try {
    const table = req.nextUrl.searchParams.get('table')
    if (!table || !MASTER_TABLES[table]) {
      return NextResponse.json(
        { success: false, error: `Tabel master "${table}" tidak valid. Pilihan: ${Object.keys(MASTER_TABLES).join(', ')}` },
        { status: 400 }
      )
    }

    const { excelBuffer, count } = await generateBackup(table, user.id)

    const fileName = `backup-${table}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.xlsx`

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': String(excelBuffer.length),
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('Master backup error:', error)
    return NextResponse.json(
      { success: false, error: 'Gagal melakukan backup master' },
      { status: 500 }
    )
  }
}

// POST: Backup a specific master table as print-style Excel (for fetch-based download)
export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req)
  if (!user) {
    return NextResponse.json({ error: 'Anda harus login terlebih dahulu' }, { status: 401 })
  }

  try {
    const { table } = await req.json()
    if (!table || !MASTER_TABLES[table]) {
      return NextResponse.json(
        { success: false, error: `Tabel master "${table}" tidak valid. Pilihan: ${Object.keys(MASTER_TABLES).join(', ')}` },
        { status: 400 }
      )
    }

    const { excelBuffer, count } = await generateBackup(table, user.id)

    const fileName = `backup-${table}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.xlsx`

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': String(excelBuffer.length),
        'X-Backup-Count': String(count),
        'X-Backup-Table': table,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('Master backup error:', error)
    return NextResponse.json(
      { success: false, error: 'Gagal melakukan backup master' },
      { status: 500 }
    )
  }
}
