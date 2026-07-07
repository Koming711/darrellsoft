import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server-auth'
import { parseBackupExcel } from '@/lib/backup-excel'
import { sanitizeError } from '@/lib/api-error'

// Map of riwayat table keys to Prisma models
const RIWAYAT_TABLES: Record<string, { model: any; name: string }> = {
  riwayat_cetakan: { model: db.riwayatCetakan, name: 'Riwayat Cetakan' },
  riwayat_finishing: { model: db.riwayatFinishing, name: 'Riwayat Finishing' },
  riwayat_ongkos_cetak: { model: db.riwayatOngkosCetak, name: 'Riwayat Ongkos Cetak' },
  riwayat_harga_kertas: { model: db.riwayatHargaKertas, name: 'Riwayat Harga Kertas' },
  riwayat_potong_kertas: { model: db.riwayatPotongKertas, name: 'Riwayat Potong Kertas' },
}

// POST: Restore a specific riwayat table from Excel backup
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

    if (!table || !RIWAYAT_TABLES[table]) {
      return NextResponse.json(
        { success: false, error: `Tabel riwayat "${table}" tidak valid` },
        { status: 400 }
      )
    }

    if (!backupData || !Array.isArray(backupData)) {
      return NextResponse.json(
        { success: false, error: 'Data backup tidak valid' },
        { status: 400 }
      )
    }

    const tableConfig = RIWAYAT_TABLES[table]
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
    console.error('Riwayat restore error:', error)
    return NextResponse.json(
      { success: false, error: 'Gagal melakukan restore riwayat: ' + sanitizeError(error) },
      { status: 500 }
    )
  }
}
