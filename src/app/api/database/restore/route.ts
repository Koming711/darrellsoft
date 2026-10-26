import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'
import { sanitizeError } from '@/lib/api-error'
import { castRowBySchema } from '@/lib/restore-cast'

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
// Casting tipe dilakukan castRowBySchema (src/lib/restore-cast.ts) berdasarkan schema Prisma —
// menangani boolean teks Excel ("true"/"false"), kolom backup yang tidak ada di schema,
// dan field wajib yang hilang pada backup lama.
const USER_TABLES: Record<string, {
  model: any
  name: string
  mergeMode?: boolean // if true, merge instead of replace
}> = {
  Customer: { model: db.customer, name: 'Customer' },
  Paper: { model: db.paper, name: 'Paper' },
  PrintingCost: { model: db.printingCost, name: 'PrintingCost' },
  Finishing: { model: db.finishing, name: 'Finishing' },
  TokoPemasok: { model: db.tokoPemasok, name: 'TokoPemasok' },
  Invoice: { model: db.invoice, name: 'Invoice' },
  SuratJalan: { model: db.suratJalan, name: 'SuratJalan' },
  PurchaseOrder: { model: db.purchaseOrder, name: 'PurchaseOrder' },
  DocumentHistory: { model: db.documentHistory, name: 'DocumentHistory' },
  RiwayatCetakan: { model: db.riwayatCetakan, name: 'RiwayatCetakan' },
  RiwayatFinishing: { model: db.riwayatFinishing, name: 'RiwayatFinishing' },
  RiwayatOngkosCetak: { model: db.riwayatOngkosCetak, name: 'RiwayatOngkosCetak' },
  RiwayatHargaKertas: { model: db.riwayatHargaKertas, name: 'RiwayatHargaKertas' },
  RiwayatPotongKertas: { model: db.riwayatPotongKertas, name: 'RiwayatPotongKertas' },
  CalonPembeli: { model: db.calonPembeli, name: 'CalonPembeli', mergeMode: true },
  Pembeli: { model: db.pembeli, name: 'Pembeli', mergeMode: true },
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

  // Kategori adalah tabel global yang TIDAK ikut backup/restore — kategoriId pada backup
  // yang tidak ada di DB di-null-kan agar restore Paper tidak gagal FK (P2003)
  const validKategoriIds = new Set(
    (await db.kategori.findMany({ select: { id: true } })).map((k) => k.id)
  )
  // Suffix unik untuk nomorUrut fallback (backup lama tanpa kolom nomorUrut — kolom unique)
  const restoreUid = Date.now().toString(36)

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
          const casted = castRowBySchema(r, tableKey)
          casted.userId = userId // ensure userId belongs to current user
          return casted
        })
        await config.model.createMany({ data: castedData })
      }
    } else {
      // Normal tables: restore all with current userId
      const castedData = rows.map((r: any, idx: number) => {
        const casted = castRowBySchema(r, tableKey)
        casted.userId = userId // ensure userId belongs to current user
        // Backup lama mungkin tanpa nomorUrut (kolom @unique) — isi fallback unik agar tidak bentrok
        if ((tableKey === 'RiwayatCetakan' || tableKey === 'RiwayatPotongKertas') && !casted.nomorUrut) {
          casted.nomorUrut = `RESTORE-${restoreUid}-${idx + 1}`
        }
        // Paper: kategoriId yang tidak ada di DB → null (hindari FK P2003; Kategori tidak ikut restore)
        if (tableKey === 'Paper' && casted.kategoriId && !validKategoriIds.has(String(casted.kategoriId))) {
          casted.kategoriId = null
        }
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
      // File upload (dari tombol "Restore dari File")
      const formData = await req.formData()
      const file = formData.get('file') as File | null
      if (!file) {
        return NextResponse.json({ success: false, error: 'File tidak ditemukan' }, { status: 400 })
      }
      const fileName = (file.name || '').toLowerCase()
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        // Excel backup — parse multi-sheet (Data_*)
        const buffer = Buffer.from(await file.arrayBuffer())
        data = await parseExcelBackup(buffer)
      } else {
        // File .json (hasil "Backup Semua") — parse JSON, JANGAN dibaca sebagai Excel.
        const text = Buffer.from(await file.arrayBuffer()).toString('utf-8')
        let parsed: any
        try {
          parsed = JSON.parse(text)
        } catch {
          return NextResponse.json(
            { success: false, error: 'Format file tidak dikenali — gunakan file backup .json atau .xlsx' },
            { status: 400 }
          )
        }
        data = parsed && typeof parsed === 'object' && parsed.database ? parsed.database : parsed
      }
    } else {
      // JSON body (backward compatibility with old JSON backups & server restore)
      const body = await req.json()
      const { fileName, backupData } = body

      if (backupData && typeof backupData === 'object' && backupData.database) {
        data = backupData.database
      } else if (fileName && typeof fileName === 'string') {
        // Ambil isi backup dari DATABASE (tabel BackupFile) dulu — berlaku juga
        // di Vercel yang filesystem-nya read-only; fallback ke folder backups/ (file lama di lokal).
        let raw: string | null = null
        try {
          const rec = await db.backupFile.findUnique({ where: { fileName } })
          if (rec) raw = rec.content
        } catch { /* fallback ke filesystem */ }
        if (raw === null) {
          const filePath = path.join(process.cwd(), 'backups', fileName)
          if (!fs.existsSync(filePath)) {
            return NextResponse.json(
              { success: false, error: 'File backup tidak ditemukan' },
              { status: 404 }
            )
          }
          raw = fs.readFileSync(filePath, 'utf-8')
        }
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
