import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import ExcelJS from 'exceljs'
import { sanitizeError } from '@/lib/api-error'
import { castRowBySchema } from '@/lib/restore-cast'

/**
 * POST /api/database/restore-harga-per-customer — restore data halaman "Harga per Customer"
 * dari file backup .xlsx (hasil GET /api/database/backup-harga-per-customer).
 *
 * Multipart form-data: { file }
 *
 * Sheet yang dibaca:
 * - "Data"            : baris Barang (kunci gabung = kode; userId dipaksa user saat ini)
 * - "Data_Registrasi" : harga khusus per pelanggan (barangKode + customerName + price).
 *                       Dicocokkan ke barang baru per KODE dan ke customer milik user per NAMA.
 *                       Baris yang barang/customer-nya tidak cocok dilewati (dihitung skipped).
 *
 * Mode REPLACE (selaras restore-master): semua barang milik user dihapus dulu
 * (registrasi BarangCustomer ikut ter-hapus via onDelete: Cascade) lalu dibuat ulang
 * dari file. Aman karena hanya BarangCustomer yang mereferensikan Barang (invoice/PO
 * menyimpan salinan data di dataJson, bukan FK barangId).
 * photoUrl tidak diubah dari file (diset null) — batas panjang sel Excel.
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

/** Baca sheet Excel → array objek (baris 1 = header). Sel angka tetap number. */
function readSheet(workbook: ExcelJS.Workbook, sheetName: string): Record<string, unknown>[] {
  const sheet = workbook.worksheets.find((s) => s.name === sheetName)
  if (!sheet) return []
  const rows: Record<string, unknown>[] = []
  let headers: string[] = []
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      headers = []
      row.eachCell((cell, colNumber) => {
        headers[colNumber - 1] = cell.text
      })
      return
    }
    if (headers.length === 0) return
    const record: Record<string, unknown> = {}
    row.eachCell((cell, colNumber) => {
      const key = headers[colNumber - 1]
      if (!key) return
      let value: unknown = cell.text
      if (cell.type === ExcelJS.ValueType.Number) value = Number(cell.text)
      record[key] = value
    })
    if (Object.keys(record).length > 0 && !Object.values(record).every((v) => v === '')) {
      rows.push(record)
    }
  })
  return rows
}

const normName = (s: unknown) => String(s ?? '').trim().toLowerCase()

export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req)
  if (!user) {
    return NextResponse.json({ success: false, error: 'Anda harus login terlebih dahulu' }, { status: 401 })
  }

  try {
    const formData = await req.formData().catch(() => null)
    const file = formData?.get('file') as File | null
    if (!file) {
      return NextResponse.json({ success: false, error: 'File tidak ditemukan' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    const barangRaw = readSheet(workbook, 'Data')
    if (barangRaw.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Sheet "Data" tidak ditemukan / kosong — file bukan backup Harga per Customer' },
        { status: 400 }
      )
    }
    const regRaw = readSheet(workbook, 'Data_Registrasi')

    // Cast baris Barang sesuai schema; pakai-ulang kode unik (duplikat dilewati),
    // wajib punya kode karena kode = kunci gabung registrasi + unik per user.
    const seenKodes = new Set<string>()
    const barangToCreate: Record<string, unknown>[] = []
    let skippedBarang = 0
    for (const r of barangRaw) {
      const kode = String((r as Record<string, unknown>).kode ?? '').trim()
      if (!kode || seenKodes.has(kode.toUpperCase())) { skippedBarang++; continue }
      const casted = castRowBySchema(r, 'Barang') as Record<string, unknown>
      casted.userId = user.id
      casted.photoUrl = null // foto tidak ikut backup (batas panjang sel Excel)
      seenKodes.add(kode.toUpperCase())
      barangToCreate.push(casted)
    }

    const result = await db.$transaction(async (tx) => {
      // REPLACE: hapus semua barang milik user (registrasi ikut terhapus via cascade)
      await tx.barang.deleteMany({ where: { userId: user.id } })

      let barangCount = 0
      if (barangToCreate.length > 0) {
        const created = await tx.barang.createMany({ data: barangToCreate as never })
        barangCount = created.count
      }

      // Peta pemulihan relasi: kode → id barang baru; nama customer → id
      const freshBarang = await tx.barang.findMany({
        where: { userId: user.id },
        select: { id: true, kode: true },
      })
      const barangIdByKode = new Map(freshBarang.map((b) => [b.kode.toUpperCase(), b.id]))

      const userCustomers = await tx.customer.findMany({
        where: { userId: user.id },
        select: { id: true, name: true },
      })
      const customerIdByName = new Map<string, string>()
      for (const c of userCustomers) {
        const key = normName(c.name)
        if (!customerIdByName.has(key)) customerIdByName.set(key, c.id)
      }

      // Bangun ulang registrasi harga khusus per pelanggan
      const regPairs = new Set<string>()
      const regsToCreate: { barangId: string; customerId: string; price: number; userId: string }[] = []
      let skippedReg = 0
      for (const r of regRaw) {
        const barangKode = String(r.barangKode ?? '').trim().toUpperCase()
        const customerKey = normName(r.customerName)
        const barangId = barangIdByKode.get(barangKode)
        const customerId = customerIdByName.get(customerKey)
        if (!barangId || !customerId) { skippedReg++; continue }
        const pairKey = `${barangId}__${customerId}`
        if (regPairs.has(pairKey)) { skippedReg++; continue }
        regPairs.add(pairKey)
        const price = Number(r.price)
        regsToCreate.push({
          barangId,
          customerId,
          price: Number.isFinite(price) && price > 0 ? price : 0,
          userId: user.id,
        })
      }
      let regCount = 0
      if (regsToCreate.length > 0) {
        const createdRegs = await tx.barangCustomer.createMany({ data: regsToCreate })
        regCount = createdRegs.count
      }

      return { barangCount, regCount, skippedReg, skippedBarang }
    })

    return NextResponse.json({
      success: true,
      message: `Restore Harga per Customer berhasil`,
      count: result.barangCount,
      regCount: result.regCount,
      skippedBarang: result.skippedBarang,
      skippedReg: result.skippedReg,
      mode: 'replace',
    })
  } catch (error) {
    console.error('Restore harga per customer error:', error)
    return NextResponse.json(
      { success: false, error: 'Gagal melakukan restore harga per customer: ' + sanitizeError(error) },
      { status: 500 }
    )
  }
}
