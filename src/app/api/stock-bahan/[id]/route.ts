import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth, canAccessRecord } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * GET /api/stock-bahan/[id] — detail bahan + ringkasan + riwayat mutasi.
 * Dipakai dialog Detail Bahan: info master + tab Riwayat/Masuk/Keluar/Penyesuaian.
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

    const [masukRows, keluarRows, adjRows, mutasiRows] = await Promise.all([
      db.bahanMasuk.findMany({ where: { bahanId: id }, orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }] }),
      db.bahanKeluar.findMany({ where: { bahanId: id }, orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }] }),
      db.bahanPenyesuaian.findMany({ where: { bahanId: id }, orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }] }),
      db.bahanMutasi.findMany({ where: { bahanId: id }, orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }], take: 200 }),
    ])

    // Ledger rows: map stokSetelah → saldo agar konsisten dengan kontrak RiwayatItem
    const riwayat = mutasiRows.map((r) => ({
      id: r.id,
      tanggal: r.tanggal,
      nomor: r.nomor,
      jenis: r.jenis,
      masuk: r.masuk,
      keluar: r.keluar,
      saldo: r.stokSetelah,
      keterangan: r.keterangan,
    }))

    const totalMasuk = masukRows.reduce((s, m) => s + m.qty, 0)
    const totalKeluar = keluarRows.reduce((s, k) => s + k.qty, 0)
    const nilaiStok = bahan.stok * bahan.hargaSatuan

    // Riwayat harga beli (dari stok masuk yang punya harga)
    const riwayatHarga = masukRows
      .filter((m) => m.hargaBeli > 0)
      .map((m) => ({ tanggal: m.tanggal, hargaBeli: m.hargaBeli, qty: m.qty, suplierNama: m.suplierNama, nomor: m.nomor }))

    return NextResponse.json(
      {
        bahan,
        ringkasan: { totalMasuk, totalKeluar, jumlahTransaksi: masukRows.length + keluarRows.length + adjRows.length, nilaiStok },
        masuk: masukRows,
        keluar: keluarRows,
        penyesuaian: adjRows,
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

    const [cMasuk, cKeluar, cAdj] = await Promise.all([
      db.bahanMasuk.count({ where: { bahanId: id } }),
      db.bahanKeluar.count({ where: { bahanId: id } }),
      db.bahanPenyesuaian.count({ where: { bahanId: id } }),
    ])
    if (cMasuk + cKeluar + cAdj > 0) {
      return NextResponse.json(
        {
          error: `Bahan sudah dipakai dalam ${cMasuk + cKeluar + cAdj} transaksi. Gunakan "Nonaktifkan" alih-alih menghapus.`,
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
