import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server-auth'
import { parseBackupExcel } from '@/lib/backup-excel'

// Map of master table keys to Prisma models
const MASTER_TABLES: Record<string, { model: any; name: string }> = {
  finishing: { model: db.finishing, name: 'Master Finishing' },
  printing_cost: { model: db.printingCost, name: 'Master Ongkos Cetak' },
  paper: { model: db.paper, name: 'Master Harga Kertas' },
  customer: { model: db.customer, name: 'Master Customer' },
}

// POST: Restore a specific master table from Excel backup
// Accepts multipart form data with file + table field
export async function POST(req: NextRequest) {
  const err = requireAdmin(req)
  if (err) return err

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

    await tableConfig.model.deleteMany()

    if (backupData.length > 0) {
      await tableConfig.model.createMany({
        data: backupData.map((r: any) => {
          const { id, ...rest } = r
          return rest
        })
      })
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
      { success: false, error: 'Gagal melakukan restore master: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    )
  }
}
