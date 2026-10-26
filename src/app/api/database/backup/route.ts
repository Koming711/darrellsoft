import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { pruneOldBackups } from '@/lib/backup-retention'

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

    // Susun konten backup JSON — format inilah yang dipakai "Restore dari File"
    // (path .json) dan yang disimpan sebagai salinan di Riwayat Backup (BackupFile).
    const jsonBackup = {
      version: '2.0',
      type: 'user-backup',
      timestamp: new Date().toISOString(),
      userId: user.id,
      database: tableData,
    }
    const content = JSON.stringify(jsonBackup)
    const size = Buffer.byteLength(content, 'utf-8')
    const tableCount = Object.keys(tableData).length

    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const fileName = `backup-user-${dateStr}.json`

    // Simpan salinan ke DATABASE (tabel BackupFile) — bukan filesystem.
    // Di Vercel filesystem read-only, sehingga Riwayat Backup & hapus hanya
    // bisa berfungsi bila salinan backup disimpan di database.
    try {
      const data = { content, size, tableCount, rowCount: totalRows, userId: user.id }
      await db.backupFile.upsert({
        where: { fileName },
        update: data,
        create: { fileName, ...data },
      })

      // Retensi maks 7 file (FIFO): setelah backup baru tersimpan,
      // buang backup tertua agar riwayat hanya berisi 7 backup terakhir.
      await pruneOldBackups()
    } catch (saveError) {
      console.warn(
        'Salinan backup ke database dilewati:',
        saveError instanceof Error ? saveError.name : 'unknown'
      )
    }

    // File JSON inilah yang di-download user — file yang sama persis bisa
    // langsung dipakai tombol "Restore dari File".
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': String(size),
        'X-Backup-FileName': fileName,
        'X-Backup-FileCount': String(totalRows),
        'X-Backup-TableCount': String(tableCount),
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
