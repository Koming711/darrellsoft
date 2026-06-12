import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parseBackupExcel } from '@/lib/backup-excel'
import { sanitizeError } from '@/lib/api-error'

// Map of master table keys to Prisma models and their field type definitions
const MASTER_TABLES: Record<string, {
  model: any
  name: string
  intFields?: string[]
  floatFields?: string[]
  dateFields?: string[]
  extraFilter?: Record<string, any>
  extraDefaults?: Record<string, any>
}> = {
  finishing: {
    model: db.finishing,
    name: 'Master Finishing',
    intFields: ['minimumSheets'],
    floatFields: ['minimumPrice', 'additionalPrice', 'pricePerCm'],
    dateFields: ['createdAt', 'updatedAt'],
  },
  printing_cost: {
    model: db.printingCost,
    name: 'Master Ongkos Cetak',
    intFields: ['grammage', 'minimumPrintQuantity'],
    floatFields: ['printAreaWidth', 'printAreaHeight', 'pricePerColor', 'specialColorPrice', 'priceAboveMinimumPerSheet', 'platePricePerSheet'],
    dateFields: ['createdAt', 'updatedAt'],
  },
  paper: {
    model: db.paper,
    name: 'Master Harga Kertas',
    intFields: ['grammage'],
    floatFields: ['width', 'height', 'pricePerRim'],
    dateFields: ['createdAt', 'updatedAt'],
  },
  customer: {
    model: db.customer,
    name: 'Master Customer',
    dateFields: ['createdAt', 'updatedAt'],
  },
  toko_pemasok: {
    model: db.tokoPemasok,
    name: 'Master Toko/Pemasok',
    dateFields: ['createdAt', 'updatedAt'],
  },
  invoice_history: {
    model: db.documentHistory,
    name: 'Riwayat Invoice',
    dateFields: ['createdAt'],
    extraFilter: { docType: 'invoice' },
    extraDefaults: { docType: 'invoice' },
  },
  surat_jalan_history: {
    model: db.documentHistory,
    name: 'Riwayat Surat Jalan',
    dateFields: ['createdAt'],
    extraFilter: { docType: 'surat-jalan' },
    extraDefaults: { docType: 'surat-jalan' },
  },
  purchase_order_history: {
    model: db.documentHistory,
    name: 'Riwayat Purchase Order',
    dateFields: ['createdAt'],
    extraFilter: { docType: 'purchase-order' },
    extraDefaults: { docType: 'purchase-order' },
  },
  riwayat_potong_kertas: {
    model: db.riwayatPotongKertas,
    name: 'Riwayat Potong Kertas',
    floatFields: ['totalPrice', 'pricePerSheet', 'efficiency'],
    dateFields: ['createdAt', 'updatedAt'],
  },
  riwayat_cetakan: {
    model: db.riwayatCetakan,
    name: 'Riwayat Hitung Cetakan',
    floatFields: ['hargaPlat', 'ongkosCetak', 'hargaPlat2', 'ongkosCetak2', 'totalPaperPrice', 'pricePerSheet', 'finishingCost', 'packingCost', 'shippingCost', 'otherCost', 'otherCost2', 'glueCost', 'glueBorongan', 'subTotal', 'profitPercent', 'profitAmount', 'grandTotal'],
    dateFields: ['createdAt', 'updatedAt'],
  },
}

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

/** Convert parsed Excel data rows to Prisma-compatible records */
function castRow(row: Record<string, any>, tableConfig: typeof MASTER_TABLES[string]): Record<string, any> {
  const result: Record<string, any> = { ...row }

  // Strip id field — let Prisma generate new ones
  delete result.id

  // Convert integer fields
  for (const field of (tableConfig.intFields || [])) {
    if (result[field] !== undefined && result[field] !== null && result[field] !== '') {
      const num = Number(result[field])
      result[field] = isNaN(num) ? 0 : Math.round(num)
    } else {
      delete result[field] // let Prisma use default
    }
  }

  // Convert float fields
  for (const field of (tableConfig.floatFields || [])) {
    if (result[field] !== undefined && result[field] !== null && result[field] !== '') {
      const num = Number(result[field])
      result[field] = isNaN(num) ? 0 : num
    } else {
      delete result[field] // let Prisma use default
    }
  }

  // Convert date fields
  for (const field of (tableConfig.dateFields || [])) {
    if (result[field] !== undefined && result[field] !== null && result[field] !== '') {
      const d = new Date(result[field])
      if (isNaN(d.getTime())) {
        // Invalid date string — let Prisma use default
        delete result[field]
      } else {
        result[field] = d.toISOString()
      }
    } else {
      delete result[field] // let Prisma use default
    }
  }

  return result
}

// POST: Restore a specific master table from Excel backup
// Accepts multipart form data with file + table field
export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req)
  if (!user) {
    return NextResponse.json({ success: false, error: 'Anda harus login terlebih dahulu' }, { status: 401 })
  }

  try {
    const contentType = req.headers.get('content-type') || ''

    let table: string
    let backupData: Record<string, any>[]

    if (contentType.includes('multipart/form-data')) {
      // Excel file upload
      const formData = await req.formData()
      const file = formData.get('file') as File | null
      const tableField = formData.get('table') as string | null
      table = tableField || ''

      if (!file) {
        return NextResponse.json({ success: false, error: 'File tidak ditemukan' }, { status: 400 })
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      const parsed = await parseBackupExcel(buffer)
      backupData = parsed.data
    } else {
      // JSON body (backward compatibility)
      const body = await req.json()
      table = body.table
      backupData = body.backupData
    }

    if (!table || !MASTER_TABLES[table]) {
      return NextResponse.json(
        { success: false, error: `Tabel master "${table}" tidak valid` },
        { status: 400 }
      )
    }

    if (!backupData || !Array.isArray(backupData)) {
      return NextResponse.json(
        { success: false, error: 'Data backup tidak valid' },
        { status: 400 }
      )
    }

    const tableConfig = MASTER_TABLES[table]
    const restoreMode = 'replace'

    // Build the delete filter: userId + any extra filters (like docType)
    const deleteFilter: Record<string, any> = { userId: user.id, ...tableConfig.extraFilter }

    // Only delete the current user's records (not all users')
    await tableConfig.model.deleteMany({ where: deleteFilter })

    if (backupData.length > 0) {
      const castedData = backupData.map((r: any) => {
        const casted = castRow(r, tableConfig)
        // Ensure userId belongs to current user
        casted.userId = user.id
        // Apply extra defaults (like docType: 'invoice')
        if (tableConfig.extraDefaults) {
          Object.assign(casted, tableConfig.extraDefaults)
        }
        return casted
      })

      await tableConfig.model.createMany({ data: castedData })
    }

    return NextResponse.json({
      success: true,
      message: `Restore ${tableConfig.name} berhasil`,
      count: backupData.length,
      mode: restoreMode,
    })
  } catch (error) {
    console.error('Master restore error:', error)
    return NextResponse.json(
      { success: false, error: 'Gagal melakukan restore master: ' + sanitizeError(error) },
      { status: 500 }
    )
  }
}
