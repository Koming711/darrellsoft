import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth, canAccessRecord } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * POST /api/purchase-order/receive — terima barang dari Purchase Order.
 * Body: { historyId }
 *
 * Alur (permintaan user): pembelian melalui PO → otomatis masuk Stock Bahan.
 * - Untuk setiap item PO (deskripsi, qty, satuan, harga):
 *   - Bahan dengan nama sama (per user) → stok BERTAMBAH (+qty) + mutasi 'masuk'.
 *   - Bahan belum ada → dibuat otomatis (kode BHN-xxx) + mutasi 'masuk'.
 * - dataJson PO diperbarui: diterima=true, tanggalTerima, stokMasuk (ringkasan).
 *   PO yang sudah diterima ditolak (409) agar stok tidak dobel.
 *
 * Hutang: PO otomatis sudah dihitung sebagai hutang dagang (halaman Hutang
 * Dagang membaca docType=purchase-order); pelunasan lewat "Tandai Lunas".
 */

interface PoItem {
  deskripsi?: string
  qty?: number
  satuan?: string
  harga?: number
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const body = await request.json()
    const historyId = String(body?.historyId || '')
    if (!historyId) {
      return NextResponse.json({ error: 'historyId wajib diisi' }, { status: 400 })
    }

    const record = await db.documentHistory.findUnique({ where: { id: historyId } })
    if (!record || !canAccessRecord(user, record.userId)) {
      return NextResponse.json({ error: 'Purchase order tidak ditemukan' }, { status: 404 })
    }
    if (record.docType !== 'purchase-order') {
      return NextResponse.json({ error: 'Dokumen bukan purchase order' }, { status: 400 })
    }
    if (record.deletedAt) {
      return NextResponse.json({ error: 'Purchase order sudah dihapus' }, { status: 400 })
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(record.dataJson) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'Data PO rusak' }, { status: 400 })
    }
    if (parsed.diterima === true) {
      return NextResponse.json(
        { error: `PO ${record.nomor} sudah diterima${parsed.tanggalTerima ? ` (${parsed.tanggalTerima})` : ''}` },
        { status: 409 }
      )
    }

    const itemsRaw = Array.isArray(parsed.items) ? (parsed.items as PoItem[]) : []
    const items = itemsRaw
      .map((it) => ({
        deskripsi: String(it.deskripsi ?? '').trim(),
        qty: Number(it.qty ?? 0),
        satuan: String(it.satuan ?? '').trim(),
        harga: Math.max(0, Number(it.harga ?? 0) || 0),
      }))
      .filter((it) => it.deskripsi !== '' && Number.isFinite(it.qty) && it.qty > 0)

    if (items.length === 0) {
      return NextResponse.json({ error: 'Tidak ada item valid untuk diterima' }, { status: 400 })
    }

    const userId = user?.id || null
    const nomor = record.nomor
    const pemasokObj = parsed.pemasok as Record<string, unknown> | undefined
    const pemasokNama = String(pemasokObj?.nama ?? '') || record.pihakKedua || '-'
    const pemasokJenis = String(pemasokObj?.jenisBarang ?? '').trim()

    // Muat bahan milik user sekali — pencocokan nama dilakukan di JS agar
    // portabel antara SQLite (lokal) & Postgres (produksi).
    const existingBahans = await db.bahan.findMany({ where: { userId } })
    const byName = new Map<string, (typeof existingBahans)[number]>()
    for (const b of existingBahans) byName.set(b.nama.trim().toLowerCase(), b)

    // Kode berikutnya: BHN-001, BHN-002, ... (per user)
    let maxNum = 0
    for (const b of existingBahans) {
      const m = /^BHN-(\d+)$/i.exec(b.kode)
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10))
    }

    const stokMasuk: { bahanId: string; kode: string; nama: string; qty: number; satuan: string; baru: boolean }[] = []

    await db.$transaction(async (tx) => {
      for (const it of items) {
        const key = it.deskripsi.toLowerCase()
        let bahan = byName.get(key) || null

        if (bahan) {
          const stokBaru = bahan.stok + it.qty
          await tx.bahan.update({
            where: { id: bahan.id },
            data: {
              stok: stokBaru,
              ...(it.harga > 0 ? { hargaSatuan: it.harga } : {}),
            },
          })
          await tx.bahanMutasi.create({
            data: {
              bahanId: bahan.id,
              jenis: 'masuk',
              qty: it.qty,
              stokSetelah: stokBaru,
              keterangan: `PO ${nomor} — ${pemasokNama}`,
              userId,
            },
          })
          stokMasuk.push({ bahanId: bahan.id, kode: bahan.kode, nama: bahan.nama, qty: it.qty, satuan: bahan.satuan || it.satuan, baru: false })
          bahan = { ...bahan, stok: stokBaru }
          byName.set(key, bahan)
        } else {
          maxNum += 1
          const kode = `BHN-${String(maxNum).padStart(3, '0')}`
          const created = await tx.bahan.create({
            data: {
              kode,
              nama: it.deskripsi,
              kategori: pemasokJenis,
              satuan: it.satuan || 'pcs',
              stok: it.qty,
              stokMin: 0,
              hargaSatuan: it.harga,
              keterangan: `Dari PO ${nomor}`,
              userId,
            },
          })
          await tx.bahanMutasi.create({
            data: {
              bahanId: created.id,
              jenis: 'masuk',
              qty: it.qty,
              stokSetelah: it.qty,
              keterangan: `PO ${nomor} — ${pemasokNama}`,
              userId,
            },
          })
          stokMasuk.push({ bahanId: created.id, kode, nama: created.nama, qty: it.qty, satuan: created.satuan, baru: true })
          byName.set(key, created)
        }
      }

      // Tandai PO diterima di dataJson (ringkasan ikut disimpan)
      const updatedDataJson = JSON.stringify({
        ...parsed,
        diterima: true,
        tanggalTerima: todayStr(),
        stokMasuk,
      })
      await tx.documentHistory.update({
        where: { id: historyId },
        data: { dataJson: updatedDataJson },
      })
    })

    return NextResponse.json({
      success: true,
      nomor,
      createdCount: stokMasuk.filter((s) => s.baru).length,
      updatedCount: stokMasuk.filter((s) => !s.baru).length,
      items: stokMasuk,
    })
  } catch (error: any) {
    console.error('Error receiving purchase order:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to receive purchase order') },
      { status: 500 }
    )
  }
}
