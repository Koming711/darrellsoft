import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth, canAccessRecord } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'
import { nextNomorMutasi, todayJakarta, isIzinkanMinus } from '@/lib/stock-bahan-server'

/**
 * GET /api/stock-bahan/mutasi — riwayat / ledger mutasi stok.
 * Query opsional:
 * - bahanId : hanya mutasi bahan tersebut
 * - jenis   : 'masuk' | 'keluar' | 'penyesuaian'
 * - limit   : batasi jumlah baris (default 500)
 */
export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const bahanId = request.nextUrl.searchParams.get('bahanId') || undefined
    const jenis = request.nextUrl.searchParams.get('jenis') || undefined
    const limitParam = parseInt(request.nextUrl.searchParams.get('limit') || '500', 10)
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 1000) : 500

    const where = {
      ...(await getDataFilter(user)),
      ...(bahanId ? { bahanId } : {}),
      ...(jenis ? { jenis } : {}),
    }

    const mutasi = await db.bahanMutasi.findMany({
      where,
      include: {
        bahan: { select: { kode: true, nama: true, satuan: true } },
      },
      orderBy: { createdAt: 'desc' },
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
 * POST /api/stock-bahan/mutasi — catat transaksi stok:
 * - jenis 'masuk'       : pembelian & penerimaan barang (SM-001, ...)
 *     body: { bahanId, qty, tanggal?, hargaBeli?, nomorNota?, pemasok?, keterangan? }
 *     → stok +qty; hargaSatuan bahan diperbarui bila hargaBeli > 0 (harga modal terakhir).
 * - jenis 'keluar'      : produksi, sampel, rusak (SK-001, ...)
 *     body: { bahanId, qty, tanggal?, tujuan?, keterangan? }
 *     → stok -qty; ditolak bila stok tidak cukup KECUALI "Izinkan stok minus" aktif.
 * - jenis 'penyesuaian' : stok fisik vs sistem (SP-001, ...)
 *     body: { bahanId, stokFisik, tanggal?, alasan?, keterangan? }
 *     → stok = stokFisik; qty tercatat sebagai selisih (boleh negatif).
 *
 * Nomor transaksi dibuat otomatis per user per jenis (SM-/SK-/SP- + urutan).
 */
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const userId = user?.id || null
    const body = await request.json()
    const { bahanId, jenis, qty, tanggal, keterangan } = body

    if (!bahanId) {
      return NextResponse.json({ error: 'Bahan wajib dipilih' }, { status: 400 })
    }
    if (jenis !== 'masuk' && jenis !== 'keluar' && jenis !== 'penyesuaian') {
      return NextResponse.json({ error: 'Jenis mutasi tidak valid' }, { status: 400 })
    }

    const bahan = await db.bahan.findUnique({ where: { id: bahanId } })
    if (!bahan || !canAccessRecord(user, bahan.userId)) {
      return NextResponse.json({ error: 'Bahan tidak ditemukan' }, { status: 404 })
    }

    const tanggalStr = tanggal ? String(tanggal) : todayJakarta()
    const nomor = await nextNomorMutasi(userId, jenis)

    // ============ STOK MASUK (pembelian & penerimaan) ============
    if (jenis === 'masuk') {
      const qtyNum = Number(qty)
      if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
        return NextResponse.json({ error: 'Jumlah harus lebih dari 0' }, { status: 400 })
      }
      const hargaBeli = Math.max(0, Number(body.hargaBeli) || 0)
      const stokBaru = bahan.stok + qtyNum

      const [, , updatedBahan] = await db.$transaction([
        db.bahanMutasi.create({
          data: {
            bahanId,
            jenis: 'masuk',
            qty: qtyNum,
            stokSetelah: stokBaru,
            keterangan: keterangan ? String(keterangan) : '',
            nomor,
            tanggal: tanggalStr,
            nomorNota: body.nomorNota ? String(body.nomorNota).trim() : '',
            pemasok: body.pemasok ? String(body.pemasok).trim() : '',
            hargaBeli,
            totalHarga: hargaBeli * qtyNum,
            satuanBahan: bahan.satuan,
            namaBahan: bahan.nama,
            userId,
          },
        }),
        db.bahan.update({
          where: { id: bahanId },
          data: {
            stok: stokBaru,
            // harga modal terakhir ikut terbarui dari pembelian
            ...(hargaBeli > 0 ? { hargaSatuan: hargaBeli } : {}),
          },
        }),
        db.bahan.findUnique({ where: { id: bahanId } }),
      ])

      return NextResponse.json(
        { ...updatedBahan, nomorTransaksi: nomor },
        { status: 201 }
      )
    }

    // ============ STOK KELUAR (produksi, sampel, rusak) ============
    if (jenis === 'keluar') {
      const qtyNum = Number(qty)
      if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
        return NextResponse.json({ error: 'Jumlah harus lebih dari 0' }, { status: 400 })
      }

      const izinkanMinus = await isIzinkanMinus(userId)
      if (!izinkanMinus && qtyNum > bahan.stok) {
        return NextResponse.json(
          { error: `Stok tidak cukup (stok saat ini: ${bahan.stok} ${bahan.satuan})` },
          { status: 400 }
        )
      }
      const stokBaru = bahan.stok - qtyNum

      const [mutasi] = await db.$transaction([
        db.bahanMutasi.create({
          data: {
            bahanId,
            jenis: 'keluar',
            qty: qtyNum,
            stokSetelah: stokBaru,
            keterangan: keterangan ? String(keterangan) : '',
            nomor,
            tanggal: tanggalStr,
            tujuan: body.tujuan ? String(body.tujuan).trim() : 'Lainnya',
            satuanBahan: bahan.satuan,
            namaBahan: bahan.nama,
            userId,
          },
        }),
        db.bahan.update({ where: { id: bahanId }, data: { stok: stokBaru } }),
      ])

      return NextResponse.json(mutasi, { status: 201 })
    }

    // ============ PENYESUAIAN STOK (stok fisik vs sistem) ============
    if (!Number.isFinite(Number(body.stokFisik))) {
      return NextResponse.json({ error: 'Stok fisik wajib diisi' }, { status: 400 })
    }
    const stokFisik = Math.max(0, Number(body.stokFisik))
    const delta = stokFisik - bahan.stok
    if (delta === 0) {
      return NextResponse.json(
        { error: 'Stok fisik sama dengan stok sistem — tidak ada yang perlu disesuaikan' },
        { status: 400 }
      )
    }

    const [mutasi] = await db.$transaction([
      db.bahanMutasi.create({
        data: {
          bahanId,
          jenis: 'penyesuaian',
          qty: delta,
          stokSetelah: stokFisik,
          keterangan: keterangan ? String(keterangan) : '',
          nomor,
          tanggal: tanggalStr,
          alasan: body.alasan ? String(body.alasan).trim() : 'Lainnya',
          satuanBahan: bahan.satuan,
          namaBahan: bahan.nama,
          userId,
        },
      }),
      db.bahan.update({ where: { id: bahanId }, data: { stok: stokFisik } }),
    ])

    return NextResponse.json(mutasi, { status: 201 })
  } catch (error: any) {
    console.error('Error creating mutasi bahan:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to create mutasi bahan') },
      { status: 500 }
    )
  }
}
