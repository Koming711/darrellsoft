import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'
import { sanitizeError } from '@/lib/api-error'

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

// Only user-owned tables (matching backup route)
const USER_TABLES: Record<string, {
  model: any
  name: string
  intFields?: string[]
  floatFields?: string[]
  dateFields?: string[]
  mergeMode?: boolean // if true, merge instead of replace
}> = {
  Customer: { model: db.customer, name: 'Customer', dateFields: ['createdAt', 'updatedAt'] },
  Paper: { model: db.paper, name: 'Paper', intFields: ['grammage'], floatFields: ['width', 'height', 'pricePerRim'], dateFields: ['createdAt', 'updatedAt'] },
  PrintingCost: { model: db.printingCost, name: 'PrintingCost', intFields: ['grammage', 'minimumPrintQuantity'], floatFields: ['printAreaWidth', 'printAreaHeight', 'pricePerColor', 'specialColorPrice', 'priceAboveMinimumPerSheet', 'platePricePerSheet'], dateFields: ['createdAt', 'updatedAt'] },
  Finishing: { model: db.finishing, name: 'Finishing', intFields: ['minimumSheets'], floatFields: ['minimumPrice', 'additionalPrice', 'pricePerCm'], dateFields: ['createdAt', 'updatedAt'] },
  TokoPemasok: { model: db.tokoPemasok, name: 'TokoPemasok', dateFields: ['createdAt', 'updatedAt'] },
  Invoice: { model: db.invoice, name: 'Invoice', floatFields: ['subTotal', 'discount', 'tax', 'grandTotal'], dateFields: ['createdAt', 'updatedAt'] },
  SuratJalan: { model: db.suratJalan, name: 'SuratJalan', dateFields: ['createdAt', 'updatedAt'] },
  PurchaseOrder: { model: db.purchaseOrder, name: 'PurchaseOrder', floatFields: ['subtotal', 'tax', 'total'], dateFields: ['createdAt', 'updatedAt'] },
  DocumentHistory: { model: db.documentHistory, name: 'DocumentHistory', dateFields: ['createdAt'] },
  RiwayatCetakan: { model: db.riwayatCetakan, name: 'RiwayatCetakan', floatFields: ['hargaPlat', 'ongkosCetak', 'hargaPlat2', 'ongkosCetak2', 'totalPaperPrice', 'pricePerSheet', 'finishingCost', 'packingCost', 'shippingCost', 'otherCost', 'otherCost2', 'glueCost', 'glueBorongan', 'subTotal', 'profitPercent', 'profitAmount', 'grandTotal'], dateFields: ['createdAt', 'updatedAt'] },
  RiwayatFinishing: { model: db.riwayatFinishing, name: 'RiwayatFinishing', floatFields: ['totalCost', 'hargaPerLembar'], dateFields: ['createdAt', 'updatedAt'] },
  RiwayatOngkosCetak: { model: db.riwayatOngkosCetak, name: 'RiwayatOngkosCetak', floatFields: ['totalOngkosCetak', 'hargaPerLembar', 'totalOngkosCetak2'], dateFields: ['createdAt', 'updatedAt'] },
  RiwayatHargaKertas: { model: db.riwayatHargaKertas, name: 'RiwayatHargaKertas', floatFields: ['totalPrice', 'costPerPiece'], dateFields: ['createdAt', 'updatedAt'] },
  RiwayatPotongKertas: { model: db.riwayatPotongKertas, name: 'RiwayatPotongKertas', floatFields: ['totalPrice', 'pricePerSheet', 'efficiency'], dateFields: ['createdAt', 'updatedAt'] },
  CalonPembeli: { model: db.calonPembeli, name: 'CalonPembeli', dateFields: ['createdAt', 'updatedAt', 'expiredDate'], mergeMode: true },
  Pembeli: { model: db.pembeli, name: 'Pembeli', dateFields: ['createdAt', 'updatedAt', 'expiredDate'], mergeMode: true },
}

/** Cast row types from Excel string values to proper Prisma types */
function castRow(row: Record<string, any>, tableKey: string): Record<string, any> {
  const result: Record<string, any> = { ...row }
  const types = USER_TABLES[tableKey]
  if (!types) return result

  // Strip id field — let Prisma generate new ones
  delete result.id

  // Convert integer fields
  for (const field of (types.intFields || [])) {
    if (result[field] !== undefined && result[field] !== null && result[field] !== '') {
      const num = Number(result[field])
      result[field] = isNaN(num) ? 0 : Math.round(num)
    } else {
      delete result[field]
    }
  }

  // Convert float fields
  for (const field of (types.floatFields || [])) {
    if (result[field] !== undefined && result[field] !== null && result[field] !== '') {
      const num = Number(result[field])
      result[field] = isNaN(num) ? 0 : num
    } else {
      delete result[field]
    }
  }

  // Convert date fields
  for (const field of (types.dateFields || [])) {
    if (result[field] !== undefined && result[field] !== null && result[field] !== '') {
      const d = new Date(result[field])
      if (isNaN(d.getTime())) {
        delete result[field]
      } else {
        result[field] = d.toISOString()
      }
    } else {
      delete result[field]
    }
  }

  return result
}

/** Parse Excel backup file (multi-sheet format) and return data per table */
async function parseExcelBackup(fileBuffer: Buffer): Promise<Record<string, any[]>> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(fileBuffer)

  const result: Record<string, any[]> = {}

  for (const sheet of workbook.worksheets) {
    // Only process sheets starting with "Data_"
    if (!sheet.name.startsWith('Data_')) continue

    // Extract table name from sheet name: "Data_Customer" → "Customer"
    const tableKey = sheet.name.substring(5)
    const data: Record<string, any>[] = []
    let headers: string[] = []

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        // Header row
        headers = []
        row.eachCell((cell, colNumber) => {
          headers[colNumber - 1] = cell.text
        })
      } else if (headers.length > 0) {
        const record: Record<string, any> = {}
        row.eachCell((cell, colNumber) => {
          const key = headers[colNumber - 1]
          if (key) {
            let value: any = cell.text
            // Try to parse numbers
            if (value !== '' && !isNaN(Number(value)) && cell.type === ExcelJS.ValueType.Number) {
              value = Number(value)
            }
            record[key] = value
          }
        })
        // Skip empty rows
        if (Object.keys(record).length > 0 && !(Object.values(record).every((v) => v === ''))) {
          data.push(record)
        }
      }
    })

    result[tableKey] = data
  }

  return result
}

/** Restore logic: only touches data belonging to the current user */
async function restoreDatabase(data: Record<string, any[]>, userId: string) {
  // ⛔ PROTECT: Save existing CalonPembeli & Pembeli for merge
  const existingCalonPembeli = await db.calonPembeli.findMany({ where: { userId } })
  const existingPembeli = await db.pembeli.findMany({ where: { userId } })

  // Delete only the current user's data (NOT other users' data)
  const deleteOrder = [
    'RiwayatCetakan', 'RiwayatFinishing', 'RiwayatOngkosCetak',
    'RiwayatHargaKertas', 'RiwayatPotongKertas',
    'DocumentHistory', 'Invoice', 'SuratJalan', 'PurchaseOrder',
    'TokoPemasok', 'Finishing', 'PrintingCost', 'Paper', 'Customer',
  ]
  // CalonPembeli & Pembeli are merge-only, never deleted

  for (const tableKey of deleteOrder) {
    const config = USER_TABLES[tableKey]
    if (config?.model) {
      await config.model.deleteMany({ where: { userId } })
    }
  }

  let restoredTables = 0

  // Restore tables in order
  const restoreOrder = [
    'Customer', 'Paper', 'PrintingCost', 'Finishing', 'TokoPemasok',
    'Invoice', 'SuratJalan', 'PurchaseOrder', 'DocumentHistory',
    'CalonPembeli', 'Pembeli',
    'RiwayatCetakan', 'RiwayatFinishing', 'RiwayatOngkosCetak',
    'RiwayatHargaKertas', 'RiwayatPotongKertas',
  ]

  for (const tableKey of restoreOrder) {
    const rows = data[tableKey]
    if (!rows || !Array.isArray(rows) || rows.length === 0) continue
    const config = USER_TABLES[tableKey]
    if (!config?.model) continue

    if (config.mergeMode) {
      // ⛔ CalonPembeli / Pembeli: MERGE only — add missing records
      const existingIds = new Set(
        (tableKey === 'CalonPembeli' ? existingCalonPembeli : existingPembeli).map(p => p.id)
      )
      const newRecords = rows.filter((r: any) => !existingIds.has(r.id))
      if (newRecords.length > 0) {
        const castedData = newRecords.map((r: any) => {
          const casted = castRow(r, tableKey)
          casted.userId = userId // ensure userId belongs to current user
          return casted
        })
        await config.model.createMany({ data: castedData })
      }
    } else {
      // Normal tables: restore all with current userId
      const castedData = rows.map((r: any) => {
        const casted = castRow(r, tableKey)
        casted.userId = userId // ensure userId belongs to current user
        return casted
      })
      await config.model.createMany({ data: castedData })
    }
    restoredTables++
  }

  return restoredTables
}

export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req)
  if (!user) {
    return NextResponse.json({ error: 'Anda harus login terlebih dahulu' }, { status: 401 })
  }

  try {
    const contentType = req.headers.get('content-type') || ''
    let data: Record<string, any[]>

    if (contentType.includes('multipart/form-data')) {
      // Excel file upload
      const formData = await req.formData()
      const file = formData.get('file') as File | null
      if (!file) {
        return NextResponse.json({ success: false, error: 'File tidak ditemukan' }, { status: 400 })
      }
      const buffer = Buffer.from(await file.arrayBuffer())
      data = await parseExcelBackup(buffer)
    } else {
      // JSON body (backward compatibility with old JSON backups & server restore)
      const body = await req.json()
      const { fileName, backupData } = body

      if (backupData && typeof backupData === 'object' && backupData.database) {
        data = backupData.database
      } else if (fileName && typeof fileName === 'string') {
        const filePath = path.join(process.cwd(), 'backups', fileName)
        if (!fs.existsSync(filePath)) {
          return NextResponse.json(
            { success: false, error: 'File backup tidak ditemukan' },
            { status: 404 }
          )
        }
        const raw = fs.readFileSync(filePath, 'utf-8')
        const parsed = JSON.parse(raw)
        data = parsed.database
      } else {
        return NextResponse.json(
          { success: false, error: 'Data backup tidak valid' },
          { status: 400 }
        )
      }
    }

    if (!data || typeof data !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Format backup tidak valid' },
        { status: 400 }
      )
    }

    // Filter data to only include user-owned tables (skip global tables like User, Pengguna, Post, Setting)
    const allowedTables = new Set(Object.keys(USER_TABLES))
    const filteredData: Record<string, any[]> = {}
    for (const [key, rows] of Object.entries(data)) {
      if (allowedTables.has(key)) {
        filteredData[key] = rows
      }
    }

    const restoredTables = await restoreDatabase(filteredData, user.id)

    return NextResponse.json({
      success: true,
      message: 'Data berhasil di-restore (hanya data user Anda yang dipulihkan)',
      restoredTables,
    })
  } catch (error) {
    console.error('Restore error:', error)
    return NextResponse.json(
      { success: false, error: 'Gagal melakukan restore database: ' + sanitizeError(error) },
      { status: 500 }
    )
  }
}
