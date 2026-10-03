import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth, canAccessRecord } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'
import { recalcBahan, nextStkNumber, todayStr, getStockPengaturan } from '@/lib/stock-bahan-server'

/**
 * GET /api/stock-bahan/mutasi — riwayat mutasi stok (ledger gabungan).
 * Query opsional: bahanId, limit (default 100)
 */
export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const bahanId = request.nextUrl.searchParams.get('bahanId') || undefined
    const limitParam = parseInt(request.nextUrl.searchParams.get('limit') || '100', 10)
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 100

    const where = {
      ...(await getDataFilter(user)),
      ...(bahanId ? { bahanId } : {}),
    }

    const mutasi = await db.bahanMutasi.findMany({
      where,
      include: {
        bahan: { select: { kode: true, nama: true, satuan: true } },
      },
      orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    })
    return NextResponse.json(mutasi, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error: any) {
    console.error('Error fetching mutasi bahan:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to fetch mutasi bahan') },
      { status: 500 }
    )
  }
}

/**
 * POST /api/stock-bahan/mutasi — catat stok masuk / keluar cepat.
 * Body: { bahanId, jenis: 'masuk' | 'keluar', qty, keterangan? }
 * Kompatibel dengan versi lama, tetapi sekarang membuat transaksi ledger
 * (BahanMasuk/BahanKeluar) lalu recalc → saldo riwayat selalu konsisten.
 */
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const { bahanId, jenis, qty, keterangan } = body

    if (!bahanId) {
      return NextResponse.json({ error: 'Bahan wajib dipilih' }, { status: 400 })
    }
    if (jenis !== 'masuk' && jenis !== 'keluar') {
      return NextResponse.json({ error: 'Jenis mutasi tidak valid' }, { status: 400 })
    }
    const qtyNum = Number(qty)
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      return NextResponse.json({ error: 'Jumlah harus lebih dari 0' }, { status: 400 })
    }

    const bahan = await db.bahan.findUnique({ where: { id: bahanId } })
    if (!bahan || !canAccessRecord(user, bahan.userId)) {
      return NextResponse.json({ error: 'Bahan tidak ditemukan' }, { status: 404 })
    }

    if (jenis === 'keluar') {
      const { allowNegativeStock } = await getStockPengaturan()
      if (!allowNegativeStock && qtyNum > bahan.stok) {
        return NextResponse.json(
          { error: `Stok tidak cukup (stok saat ini: ${bahan.stok} ${bahan.satuan})` },
          { status: 400 }
        )
      }
    }

    const userId = user?.id || null
    const nomor = await nextStkNumber(userId)
    const tanggal = todayStr()

    if (jenis === 'masuk') {
      await db.bahanMasuk.create({
        data: {
          nomor,
          tanggal,
          bahanId,
          bahanNama: bahan.nama,
          satuan: bahan.satuan,
          qty: qtyNum,
          hargaBeli: 0,
          total: 0,
          suplierNama: '',
          nomorNota: '',
          catatan: keterangan ? String(keterangan) : 'Stok masuk cepat',
          userId,
        },
      })
    } else {
      await db.bahanKeluar.create({
        data: {
          nomor,
          tanggal,
          bahanId,
          bahanNama: bahan.nama,
          satuan: bahan.satuan,
          qty: qtyNum,
          tujuan: 'Lainnya',
          catatan: keterangan ? String(keterangan) : 'Stok keluar cepat',
          userId,
        },
      })
    }

    await recalcBahan(bahanId)
    const stokBaru = await db.bahan.findUnique({ where: { id: bahanId }, select: { stok: true } })
    return NextResponse.json({ success: true, nomor, stok: stokBaru?.stok ?? 0 }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating mutasi bahan:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to create mutasi bahan') },
      { status: 500 }
    )
  }
}
