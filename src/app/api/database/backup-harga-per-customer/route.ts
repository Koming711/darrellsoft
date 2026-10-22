import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import ExcelJS from 'exceljs'
import { sanitizeError } from '@/lib/api-error'

/**
 * GET /api/database/backup-harga-per-customer — backup data halaman "Harga per Customer".
 *
 * Satu file .xlsx berisi:
 * - Sheet "Laporan"        : tampilan cetak (daftar barang + chip harga khusus per pelanggan)
 * - Sheet "Data"           : baris mentah tabel Barang (untuk restore — dicocokkan per KODE)
 * - Sheet "Data_Registrasi": baris mentah registrasi BarangCustomer (barangKode + customerName
 *                            sebagai kunci gabung + price = harga khusus per pelanggan)
 * - Sheet "Info"           : metadata backup
 *
 * photoUrl TIDAK ikut di-backup (data URL foto bisa >32.767 karakter = batas sel Excel;
 * foto bukan bagian data harga per customer).
 */

function getUserFromRequest(req: NextRequest) {
  let userId = req.cookies.get('userId')?.value
  let userRole = req.cookies.get('userRole')?.value
  if (!userId || !userRole) {
    userId = userId || req.headers.get('x-user-id')
    userRole = userRole || req.headers.get('x-user-role')
  }
  if (!userId || !userRole) return null
  return { id: userId, role: userRole }
}

const fmtRp = (n: number) => `Rp ${Math.round(n || 0).toLocaleString('id-ID')}`

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req)
  if (!user) {
    return NextResponse.json({ error: 'Anda harus login terlebih dahulu' }, { status: 401 })
  }

  try {
    const [barangRows, regRows] = await Promise.all([
      db.barang.findMany({ where: { userId: user.id }, orderBy: { kode: 'asc' } }),
      db.barangCustomer.findMany({
        where: { userId: user.id },
        include: {
          barang: { select: { kode: true, nama: true } },
          customer: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    // Peta harga khusus per barang: kode → [{customer, price}]
    const regsByKode = new Map<string, { customer: string; price: number }[]>()
    for (const r of regRows) {
      if (!r.barang?.kode) continue
      const list = regsByKode.get(r.barang.kode) ?? []
      list.push({ customer: r.customer.name, price: r.price })
      regsByKode.set(r.barang.kode, list)
    }

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'DarrellSoft'
    workbook.created = new Date()

    // ===== Sheet 1: Laporan (tampilan cetak) =====
    const report = workbook.addWorksheet('Laporan', { properties: { tabColor: { argb: 'FF10B981' } } })
    const headers = ['No', 'Kode', 'Nama Barang', 'Satuan', 'Qty', 'Harga Jual', 'HPP', 'Harga Khusus per Pelanggan']
    const titleRow = report.addRow(['Harga per Customer'])
    titleRow.font = { bold: true, size: 16, color: { argb: 'FF1F2937' } }
    titleRow.alignment = { horizontal: 'center', vertical: 'middle' }
    titleRow.height = 36
    report.mergeCells(1, 1, 1, headers.length)
    const dateRow = report.addRow([`Dicetak: ${new Date().toLocaleString('id-ID')}`])
    dateRow.font = { size: 10, color: { argb: 'FF6B7280' } }
    dateRow.alignment = { horizontal: 'right' }
    report.mergeCells(2, 1, 2, headers.length)
    report.addRow([])

    const headerRow = report.addRow(headers)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } }
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
    headerRow.height = 26
    headerRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF9CA3AF' } },
        bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } },
        left: { style: 'thin', color: { argb: 'FF9CA3AF' } },
        right: { style: 'thin', color: { argb: 'FF9CA3AF' } },
      }
    })

    barangRows.forEach((b, idx) => {
      const regs = regsByKode.get(b.kode) ?? []
      const hargaKhusus = regs.length > 0
        ? regs.map((r) => `${r.customer}: ${fmtRp(r.price)}`).join('; ')
        : '-'
      const row = report.addRow([
        idx + 1, b.kode, b.nama, b.satuan, b.qty, b.jual, b.modal, hargaKhusus,
      ])
      row.getCell(1).alignment = { horizontal: 'center' }
      ;[5, 6, 7].forEach((c) => { row.getCell(c).alignment = { horizontal: 'right' } })
      if (idx % 2 === 1) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }
      }
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        }
      })
    })

    report.addRow([])
    const footerRow = report.addRow([`Total Data: ${barangRows.length} barang · ${regRows.length} registrasi harga`])
    footerRow.font = { size: 10, color: { argb: 'FF6B7280' }, italic: true }
    footerRow.alignment = { horizontal: 'center' }
    report.mergeCells(footerRow.number, 1, footerRow.number, headers.length)

    const widths = [6, 12, 26, 10, 10, 16, 16, 44]
    widths.forEach((w, i) => { report.getColumn(i + 1).width = w })

    // ===== Sheet 2: Data (raw barang — kunci gabung restore = kode) =====
    const dataSheet = workbook.addWorksheet('Data', { properties: { tabColor: { argb: 'FF6B7280' } } })
    const barangHeaders = ['id', 'kode', 'nama', 'satuan', 'qty', 'modal', 'jual', 'keterangan', 'isActive', 'createdAt', 'updatedAt']
    const dataHeaderRow = dataSheet.addRow(barangHeaders)
    dataHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    dataHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } }
    for (const b of barangRows) {
      dataSheet.addRow([
        b.id, b.kode, b.nama, b.satuan, b.qty, b.modal, b.jual, b.keterangan,
        b.isActive ? 'true' : 'false',
        b.createdAt.toISOString(), b.updatedAt.toISOString(),
      ])
    }
    barangHeaders.forEach((h, i) => { dataSheet.getColumn(i + 1).width = Math.min(Math.max(h.length + 2, 10), 42) })

    // ===== Sheet 3: Data_Registrasi (harga khusus per pelanggan) =====
    const regSheet = workbook.addWorksheet('Data_Registrasi', { properties: { tabColor: { argb: 'FF9CA3AF' } } })
    const regHeaders = ['barangKode', 'barangNama', 'customerName', 'price', 'createdAt']
    const regHeaderRow = regSheet.addRow(regHeaders)
    regHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    regHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } }
    for (const r of regRows) {
      regSheet.addRow([
        r.barang?.kode ?? '', r.barang?.nama ?? '', r.customer.name, r.price, r.createdAt.toISOString(),
      ])
    }
    regHeaders.forEach((h, i) => { regSheet.getColumn(i + 1).width = Math.min(Math.max(h.length + 2, 12), 42) })

    // ===== Sheet 4: Info =====
    const info = workbook.addWorksheet('Info', { properties: { tabColor: { argb: 'FF9CA3AF' } } })
    info.addRow(['Key', 'Value'])
    info.addRow(['Type', 'master-backup'])
    info.addRow(['Table', 'harga_per_customer'])
    info.addRow(['Table Name', 'Harga per Customer'])
    info.addRow(['Timestamp', new Date().toISOString()])
    info.addRow(['Record Count', barangRows.length])
    info.addRow(['Registration Count', regRows.length])
    info.getRow(1).font = { bold: true }
    info.getColumn(1).width = 20
    info.getColumn(2).width = 32

    const buffer = await workbook.xlsx.writeBuffer()
    const fileName = `backup-harga-per-customer-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.xlsx`

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': String(buffer.byteLength),
        'X-Backup-Count': String(barangRows.length),
        'X-Backup-Reg-Count': String(regRows.length),
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('Backup harga per customer error:', error)
    return NextResponse.json(
      { success: false, error: 'Gagal melakukan backup harga per customer: ' + sanitizeError(error) },
      { status: 500 }
    )
  }
}
