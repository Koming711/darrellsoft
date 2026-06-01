import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'

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

// Tables that belong to a specific user (have userId field)
// Only these tables will be backed up per-user
const USER_TABLES: Record<string, {
  model: any
  name: string
  label: string
  intFields?: string[]
  floatFields?: string[]
  dateFields?: string[]
}> = {
  Customer: { model: db.customer, name: 'Customer', label: 'Master Customer', dateFields: ['createdAt', 'updatedAt'] },
  Paper: { model: db.paper, name: 'Paper', label: 'Master Harga Kertas', intFields: ['grammage'], floatFields: ['width', 'height', 'pricePerRim'], dateFields: ['createdAt', 'updatedAt'] },
  PrintingCost: { model: db.printingCost, name: 'PrintingCost', label: 'Master Ongkos Cetak', intFields: ['grammage', 'minimumPrintQuantity'], floatFields: ['printAreaWidth', 'printAreaHeight', 'pricePerColor', 'specialColorPrice', 'priceAboveMinimumPerSheet', 'platePricePerSheet'], dateFields: ['createdAt', 'updatedAt'] },
  Finishing: { model: db.finishing, name: 'Finishing', label: 'Master Finishing', intFields: ['minimumSheets'], floatFields: ['minimumPrice', 'additionalPrice', 'pricePerCm'], dateFields: ['createdAt', 'updatedAt'] },
  TokoPemasok: { model: db.tokoPemasok, name: 'TokoPemasok', label: 'Master Toko/Pemasok', dateFields: ['createdAt', 'updatedAt'] },
  Invoice: { model: db.invoice, name: 'Invoice', label: 'Invoice', floatFields: ['subTotal', 'discount', 'tax', 'grandTotal'], dateFields: ['createdAt', 'updatedAt'] },
  SuratJalan: { model: db.suratJalan, name: 'SuratJalan', label: 'Surat Jalan', dateFields: ['createdAt', 'updatedAt'] },
  PurchaseOrder: { model: db.purchaseOrder, name: 'PurchaseOrder', label: 'Purchase Order', floatFields: ['subtotal', 'tax', 'total'], dateFields: ['createdAt', 'updatedAt'] },
  DocumentHistory: { model: db.documentHistory, name: 'DocumentHistory', label: 'Riwayat Dokumen', dateFields: ['createdAt'] },
  RiwayatCetakan: { model: db.riwayatCetakan, name: 'RiwayatCetakan', label: 'Riwayat Cetakan', floatFields: ['hargaPlat', 'ongkosCetak', 'hargaPlat2', 'ongkosCetak2', 'totalPaperPrice', 'pricePerSheet', 'finishingCost', 'packingCost', 'shippingCost', 'otherCost', 'otherCost2', 'glueCost', 'glueBorongan', 'subTotal', 'profitPercent', 'profitAmount', 'grandTotal'], dateFields: ['createdAt', 'updatedAt'] },
  RiwayatFinishing: { model: db.riwayatFinishing, name: 'RiwayatFinishing', label: 'Riwayat Finishing', floatFields: ['totalCost', 'hargaPerLembar'], dateFields: ['createdAt', 'updatedAt'] },
  RiwayatOngkosCetak: { model: db.riwayatOngkosCetak, name: 'RiwayatOngkosCetak', label: 'Riwayat Ongkos Cetak', floatFields: ['totalOngkosCetak', 'hargaPerLembar', 'totalOngkosCetak2'], dateFields: ['createdAt', 'updatedAt'] },
  RiwayatHargaKertas: { model: db.riwayatHargaKertas, name: 'RiwayatHargaKertas', label: 'Riwayat Harga Kertas', floatFields: ['totalPrice', 'costPerPiece'], dateFields: ['createdAt', 'updatedAt'] },
  RiwayatPotongKertas: { model: db.riwayatPotongKertas, name: 'RiwayatPotongKertas', label: 'Riwayat Potong Kertas', floatFields: ['totalPrice', 'pricePerSheet', 'efficiency'], dateFields: ['createdAt', 'updatedAt'] },
  CalonPembeli: { model: db.calonPembeli, name: 'CalonPembeli', label: 'Calon Pembeli', dateFields: ['createdAt', 'updatedAt', 'expiredDate'] },
  Pembeli: { model: db.pembeli, name: 'Pembeli', label: 'Pembeli', dateFields: ['createdAt', 'updatedAt', 'expiredDate'] },
}

export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req)
  if (!user) {
    return NextResponse.json({ error: 'Anda harus login terlebih dahulu' }, { status: 401 })
  }

  try {
    // Fetch data for the current user only
    const tableData: Record<string, any[]> = {}
    let totalRows = 0

    for (const [key, config] of Object.entries(USER_TABLES)) {
      try {
        const rows = await config.model.findMany({ where: { userId: user.id } })
        tableData[key] = rows
        totalRows += rows.length
      } catch {
        tableData[key] = []
      }
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'DarrellSoft'
    workbook.created = new Date()

    // ============== Sheet 1: Info (metadata) ==============
    const infoSheet = workbook.addWorksheet('Info', {
      properties: { tabColor: { argb: 'FF9CA3AF' } },
    })
    infoSheet.addRow(['Key', 'Value'])
    infoSheet.addRow(['Type', 'user-backup'])
    infoSheet.addRow(['Version', '2.0'])
    infoSheet.addRow(['Timestamp', new Date().toISOString()])
    infoSheet.addRow(['Total Tables', Object.keys(tableData).length.toString()])
    infoSheet.addRow(['Total Records', totalRows.toString()])
    infoSheet.addRow(['UserId', user.id])

    // List all tables with row counts
    infoSheet.addRow([])
    infoSheet.addRow(['Table', 'Label', 'Records'])
    for (const [key, rows] of Object.entries(tableData)) {
      infoSheet.addRow([key, USER_TABLES[key]?.label || key, rows.length.toString()])
    }

    infoSheet.getRow(1).font = { bold: true }
    infoSheet.getColumn(1).width = 22
    infoSheet.getColumn(2).width = 36

    await infoSheet.protect('', {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: false, formatColumns: false, formatRows: false,
      insertColumns: false, insertRows: false, insertHyperlinks: false,
      deleteColumns: false, deleteRows: false,
      sort: false, autoFilter: false, pivotTables: false,
    })

    // ============== Sheet per table ==============
    for (const [tableKey, rows] of Object.entries(tableData)) {
      const sheetName = `Data_${tableKey}`.substring(0, 31) // Excel max 31 chars
      const sheet = workbook.addWorksheet(sheetName, {
        properties: { tabColor: { argb: 'FF10B981' } },
      })

      if (rows.length === 0) {
        sheet.addRow(['(Tidak ada data)'])
      } else {
        // Get all unique keys from all records
        const allKeys = new Set<string>()
        rows.forEach((row: any) => Object.keys(row).forEach((k) => allKeys.add(k)))
        const headers = Array.from(allKeys)

        // Header row with styling
        const headerRow = sheet.addRow(headers)
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF374151' },
        }
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
        headerRow.height = 24

        // Data rows
        rows.forEach((row: any) => {
          const values = headers.map((key) => {
            const val = row[key]
            if (val === null || val === undefined) return ''
            if (val instanceof Date) return val.toISOString()
            if (typeof val === 'object') return JSON.stringify(val)
            return val
          })
          sheet.addRow(values)
        })

        // Auto-fit column widths
        headers.forEach((header, i) => {
          const col = sheet.getColumn(i + 1)
          let maxLen = header.length
          rows.forEach((row: any) => {
            const val = row[header]
            const str = val === null || val === undefined ? '' : String(val)
            maxLen = Math.max(maxLen, str.length)
          })
          col.width = Math.min(Math.max(maxLen + 2, 10), 50)
        })

        // Alternating row colors
        sheet.eachRow((row, rowNumber) => {
          if (rowNumber > 1 && rowNumber % 2 === 0) {
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF3F4F6' },
            }
          }
        })
      }

      // Protect the sheet
      await sheet.protect('', {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: false, formatColumns: false, formatRows: false,
        insertColumns: false, insertRows: false, insertHyperlinks: false,
        deleteColumns: false, deleteRows: false,
        sort: false, autoFilter: false, pivotTables: false,
      })
    }

    // Generate buffer
    const excelBuffer = Buffer.from(await workbook.xlsx.writeBuffer())

    // Save a copy to the backups directory
    const backupsDir = path.join(process.cwd(), 'backups')
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true })
    }
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const fileName = `backup-user-${dateStr}.xlsx`
    const filePath = path.join(backupsDir, fileName)
    fs.writeFileSync(filePath, excelBuffer)

    // Also save JSON format for backward compat with restore from server
    const jsonFileName = `backup-user-${dateStr}.json`
    const jsonFilePath = path.join(backupsDir, jsonFileName)
    const jsonBackup = {
      version: '2.0',
      type: 'user-backup',
      timestamp: new Date().toISOString(),
      userId: user.id,
      database: tableData,
    }
    fs.writeFileSync(jsonFilePath, JSON.stringify(jsonBackup, null, 2), 'utf-8')

    // Return the Excel file
    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': String(excelBuffer.length),
        'X-Backup-FileName': fileName,
        'X-Backup-FileCount': String(totalRows),
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('Backup error:', error)
    return NextResponse.json(
      { success: false, error: 'Gagal melakukan backup database' },
      { status: 500 }
    )
  }
}
