import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parseBackupExcel } from '@/lib/backup-excel'
import { sanitizeError } from '@/lib/api-error'
import { castRowBySchema } from '@/lib/restore-cast'

// Map of master table keys to Prisma models
// Casting tipe dilakukan castRowBySchema (src/lib/restore-cast.ts) berdasarkan schema Prisma —
// menangani boolean teks Excel ("true"/"false"), kolom backup yang tidak ada di schema,
// dan field wajib yang hilang pada backup lama.
const MASTER_TABLES: Record<string, {
  model: any
  name: string
  modelName: string // nama model Prisma untuk schema-driven casting
  extraFilter?: Record<string, any>
  extraDefaults?: Record<string, any>
}> = {
  finishing: {
    model: db.finishing,
    name: 'Master Finishing',
    modelName: 'Finishing',
  },
  printing_cost: {
    model: db.printingCost,
    name: 'Master Ongkos Cetak',
    modelName: 'PrintingCost',
  },
  paper: {
    model: db.paper,
    name: 'Master Bahan',
    modelName: 'Paper',
  },
  customer: {
    model: db.customer,
    name: 'Master Customer',
    modelName: 'Customer',
  },
  toko_pemasok: {
    model: db.tokoPemasok,
    name: 'Master Toko/Pemasok',
    modelName: 'TokoPemasok',
  },
  invoice_history: {
    model: db.documentHistory,
    name: 'Riwayat Invoice',
    modelName: 'DocumentHistory',
    extraFilter: { docType: 'invoice' },
    extraDefaults: { docType: 'invoice' },
  },
  surat_jalan_history: {
    model: db.documentHistory,
    name: 'Riwayat Surat Jalan',
    modelName: 'DocumentHistory',
    extraFilter: { docType: 'surat-jalan' },
    extraDefaults: { docType: 'surat-jalan' },
  },
  purchase_order_history: {
    model: db.documentHistory,
    name: 'Riwayat Purchase Order',
    modelName: 'DocumentHistory',
    extraFilter: { docType: 'purchase-order' },
    extraDefaults: { docType: 'purchase-order' },
  },
  riwayat_potong_kertas: {
    model: db.riwayatPotongKertas,
    name: 'Riwayat Potong Kertas',
    modelName: 'RiwayatPotongKertas',
  },
  riwayat_cetakan: {
    model: db.riwayatCetakan,
    name: 'Riwayat Hitung Cetakan',
    modelName: 'RiwayatCetakan',
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

    // HARDENING (insiden wipe 2x di endpoint restore lain — 1 & 2 Nov 2026):
    // 1) File backup KOSONG ditolak — tidak ada yang bisa dipulihkan, jangan
    //    hapus data lama hanya untuk menggantinya dengan 0 baris.
    if (backupData.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            'File backup kosong — tidak ada baris untuk dipulihkan. Data lama TIDAK diubah — ' +
            'periksa file backup / unduh backup baru lalu coba lagi.',
        },
        { status: 400 }
      )
    }

    // 2) Cast baris SEBELUM menyentuh database — file salah kolom/tipe
    //    dibatalkan di sini tanpa menghapus apa pun.
    const castedData = backupData.map((r: any) => {
      const casted = castRowBySchema(r, tableConfig.modelName)
      // Ensure userId belongs to current user
      casted.userId = user.id
      // Apply extra defaults (like docType: 'invoice')
      if (tableConfig.extraDefaults) {
        Object.assign(casted, tableConfig.extraDefaults)
      }
      return casted
    })

    // Build the delete filter: userId + any extra filters (like docType)
    const deleteFilter: Record<string, any> = { userId: user.id, ...tableConfig.extraFilter }

    // 3) delete + create ATOMIK (satu transaksi): bila create gagal (mis. data
    //    bentrok constraint), delete ikut di-rollback — data lama tetap utuh.
    await db.$transaction(async (tx) => {
      // Only delete the current user's records (not all users')
      await tableConfig.model.deleteMany({ where: deleteFilter })
      await tableConfig.model.createMany({ data: castedData })
    })

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
