import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth, canAccessRecord } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * GET /api/stock-bahan/[id] — detail bahan + ringkasan + riwayat mutasi.
 * Dipakai dialog Detail Bahan: info master + ledger riwayat (masuk/keluar/
 * penyesuaian) + riwayat harga beli. Ringkasan dihitung dari ledger
 * BahanMutasi (sumber kebenaran stok).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = getServerUser(request)

    const bahan = await db.bahan.findUnique({ where: { id } })
    if (!bahan || !canAccessRecord(user, bahan.userId)) {
      return NextResponse.json({ error: 'Bahan tidak ditemukan' }, { status: 404 })
    }

    const mutasiRows = await db.bahanMutasi.findMany({
      where: { bahanId: id },
      orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    })

    // Ledger rows untuk dialog detail (urut terbaru dulu)
    const riwayat = mutasiRows.map((r) => ({
      id: r.id,
      tanggal: r.tanggal,
      nomor: r.nomor,
      jenis: r.jenis,
      qty: r.qty,
      masuk: r.masuk,
      keluar: r.keluar,
      saldo: r.stokSetelah,
      satuan: r.satuanBahan,
      tujuan: r.tujuan,
      referensi: r.referensi,
      alasan: r.alasan,
      keterangan: r.keterangan,
      hargaBeli: r.hargaBeli,
      totalHarga: r.totalHarga,
      pemasok: r.pemasok,
      nomorNota: r.nomorNota,
      createdAt: r.createdAt,
    }))

    // Ringkasan dari ledger: total masuk/keluar semua waktu + jumlah transaksi
    let totalMasuk = 0
    let totalKeluar = 0
    for (const r of mutasiRows) {
      if (r.jenis === 'masuk') totalMasuk += r.qty
      else if (r.jenis === 'keluar') totalKeluar += r.qty
    }
    const nilaiStok = bahan.stok * bahan.hargaSatuan

    // Riwayat harga beli (dari mutasi masuk yang punya harga)
    const riwayatHarga = mutasiRows
      .filter((m) => m.jenis === 'masuk' && m.hargaBeli > 0)
      .map((m) => ({
        tanggal: m.tanggal,
        hargaBeli: m.hargaBeli,
        qty: m.qty,
        suplierNama: m.pemasok,
        nomor: m.nomor,
      }))

    return NextResponse.json(
      {
        bahan,
        ringkasan: {
          totalMasuk,
          totalKeluar,
          jumlahTransaksi: mutasiRows.length,
          nilaiStok,
        },
        riwayat,
        riwayatHarga,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (error: any) {
    console.error('Error fetching bahan detail:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to fetch bahan detail') },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/stock-bahan/[id] — hapus bahan (hanya jika belum ada transaksi).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const { id } = await params
    const existing = await db.bahan.findUnique({ where: { id } })
    if (!existing || !canAccessRecord(user, existing.userId)) {
      return NextResponse.json({ error: 'Bahan tidak ditemukan' }, { status: 404 })
    }

    const [cMutasi, cMasuk, cKeluar, cAdj] = await Promise.all([
      db.bahanMutasi.count({ where: { bahanId: id } }),
      db.bahanMasuk.count({ where: { bahanId: id } }),
      db.bahanKeluar.count({ where: { bahanId: id } }),
      db.bahanPenyesuaian.count({ where: { bahanId: id } }),
    ])
    const totalTrx = cMutasi + cMasuk + cKeluar + cAdj
    if (totalTrx > 0) {
      return NextResponse.json(
        {
          error: `Bahan sudah dipakai dalam ${totalTrx} transaksi. Gunakan "Nonaktifkan" alih-alih menghapus.`,
          canDeactivate: true,
        },
        { status: 409 }
      )
    }

    await db.bahan.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting bahan:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to delete bahan') },
      { status: 500 }
    )
  }
}
