import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth, canAccessRecord } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'
import { recalcBahan, nextStkNumber, todayStr } from '@/lib/stock-bahan-server'

/**
 * POST /api/purchase-order/receive — terima barang dari Purchase Order.
 * Body: { historyId }
 *
 * Alur (permintaan user): pembelian melalui PO → otomatis masuk Stock Bahan.
 * - Untuk setiap item PO (deskripsi, qty, satuan, harga):
 *   - Bahan dengan nama sama (per user) → stok BERTAMBAH via transaksi Stok Masuk.
 *   - Bahan belum ada → dibuat otomatis (kode BHN-xxx) + transaksi Stok Masuk.
 *   - Setiap item tercatat di ledger (BahanMasuk) dengan nomor STK-xxxx,
 *     harga beli item, suplier, dan referensi nomor PO → riwayat harga & saldo akurat.
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
    const tanggalTerima = todayStr()

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
    const affectedBahanIds = new Set<string>()

    // Pre-generate nomor STK di LUAR transaksi (query terpisah di dalam tx interaktif
    // bisa melebihi timeout 5s pada koneksi Supabase berlatensi tinggi)
    const stkNumbers: string[] = []
    for (let i = 0; i < items.length; i++) {
      stkNumbers.push(await nextStkNumber(userId))
    }

    await db.$transaction(async (tx) => {
      let idx = 0
      for (const it of items) {
        const key = it.deskripsi.toLowerCase()
        let bahan = byName.get(key) || null
        let bahanId: string
        let bahanNama: string
        let bahanSatuan: string
        let baru = false

        if (bahan) {
          bahanId = bahan.id
          bahanNama = bahan.nama
          bahanSatuan = bahan.satuan || it.satuan
          byName.set(key, { ...bahan })
        } else {
          maxNum += 1
          const kode = `BHN-${String(maxNum).padStart(3, '0')}`
          const created = await tx.bahan.create({
            data: {
              kode,
              nama: it.deskripsi,
              kategori: pemasokJenis,
              satuan: it.satuan || 'pcs',
              stok: 0, // stok diisi via transaksi Stok Masuk di bawah
              stokMin: 0,
              hargaSatuan: it.harga,
              suplierNama: pemasokNama,
              keterangan: `Dari PO ${nomor}`,
              userId,
            },
          })
          bahanId = created.id
          bahanNama = created.nama
          bahanSatuan = created.satuan
          baru = true
          byName.set(key, created)
        }

        const stkNomor = stkNumbers[idx++]
        await tx.bahanMasuk.create({
          data: {
            nomor: stkNomor,
            tanggal: tanggalTerima,
            bahanId,
            bahanNama,
            satuan: bahanSatuan,
            qty: it.qty,
            hargaBeli: it.harga,
            total: it.qty * it.harga,
            suplierNama: pemasokNama,
            nomorNota: nomor,
            poNomor: nomor,
            catatan: `Terima PO ${nomor}`,
            userId,
          },
        })

        affectedBahanIds.add(bahanId)
        stokMasuk.push({ bahanId, kode: (byName.get(key) as { kode: string }).kode, nama: bahanNama, qty: it.qty, satuan: bahanSatuan, baru })
      }

      // Tandai PO diterima di dataJson (ringkasan ikut disimpan)
      const updatedDataJson = JSON.stringify({
        ...parsed,
        diterima: true,
        tanggalTerima,
        stokMasuk,
      })
      await tx.documentHistory.update({
        where: { id: historyId },
        data: { dataJson: updatedDataJson },
      })
    }, { timeout: 20000 })

    // Recalc saldo stok semua bahan yang terdampak (di luar tx — replay ledger)
    for (const bahanId of affectedBahanIds) {
      await recalcBahan(bahanId)
    }

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
