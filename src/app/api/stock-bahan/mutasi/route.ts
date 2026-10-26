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

/**
 * PUT /api/stock-bahan/mutasi — edit transaksi stok masuk / keluar yang sudah tercatat.
 * body: { id, bahanId?, qty?, tanggal?, hargaBeli?, pemasok?, nomorNota?, keterangan? }  (masuk)
 *       { id, bahanId?, qty?, tanggal?, tujuan?, keterangan? }                            (keluar)
 *
 * - Efek stok lama DIREVERT lalu efek baru DITERAPKAN (stok bahan ikut berubah otomatis).
 * - Bahan juga boleh diganti (stok bahan lama & baru sama-sama disesuaikan).
 * - Ditolak bila hasil edit membuat stok minus KECUALI "Izinkan stok minus" aktif.
 * - Nomor transaksi (SM-/SK-XXX) TIDAK berubah. harga modal bahan mengikuti harga beli
 *   HANYA bila transaksi yang diedit adalah pembelian terakhir bahan tsb.
 * - Penyesuaian (SP-…) tidak dapat diedit lewat endpoint ini.
 */
export async function PUT(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const { id } = body
    if (!id) {
      return NextResponse.json({ error: 'ID transaksi wajib ada' }, { status: 400 })
    }

    const mutasi = await db.bahanMutasi.findUnique({ where: { id: String(id) } })
    if (!mutasi || !canAccessRecord(user, mutasi.userId)) {
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 })
    }
    if (mutasi.jenis !== 'masuk' && mutasi.jenis !== 'keluar') {
      return NextResponse.json(
        { error: 'Hanya transaksi stok masuk / stok keluar yang dapat diedit' },
        { status: 400 }
      )
    }

    const newBahanId = body.bahanId ? String(body.bahanId) : mutasi.bahanId
    const qtyNew = Number(body.qty ?? mutasi.qty)
    if (!Number.isFinite(qtyNew) || qtyNew <= 0) {
      return NextResponse.json({ error: 'Jumlah harus lebih dari 0' }, { status: 400 })
    }

    const bahanLama = await db.bahan.findUnique({ where: { id: mutasi.bahanId } })
    const bahanBaru = newBahanId === mutasi.bahanId ? bahanLama : await db.bahan.findUnique({ where: { id: newBahanId } })
    if (!bahanLama || !bahanBaru || !canAccessRecord(user, bahanBaru.userId)) {
      return NextResponse.json({ error: 'Bahan tidak ditemukan' }, { status: 404 })
    }

    const izinkanMinus = await isIzinkanMinus(user?.id || null)

    // Hitung hasil stok setelah edit: revert efek lama → terapkan efek baru.
    let stokLamaHasil = bahanLama.stok
    let stokBaruHasil = bahanBaru.stok
    if (mutasi.jenis === 'masuk') {
      if (bahanBaru.id === bahanLama.id) {
        stokBaruHasil = bahanLama.stok - mutasi.qty + qtyNew
      } else {
        stokLamaHasil = bahanLama.stok - mutasi.qty
        stokBaruHasil = bahanBaru.stok + qtyNew
      }
    } else {
      if (bahanBaru.id === bahanLama.id) {
        stokBaruHasil = bahanLama.stok + mutasi.qty - qtyNew
      } else {
        stokLamaHasil = bahanLama.stok + mutasi.qty
        stokBaruHasil = bahanBaru.stok - qtyNew
      }
    }

    // Tolak bila hasil edit membuat stok minus (kecuali diizinkan).
    const minusTargets = [
      ...(bahanBaru.id !== bahanLama.id ? [{ id: bahanLama.id, nama: bahanLama.nama, stok: stokLamaHasil }] : []),
      { id: bahanBaru.id, nama: bahanBaru.nama, stok: stokBaruHasil },
    ].filter((t) => t.stok < 0)
    if (minusTargets.length > 0 && !izinkanMinus) {
      const t = minusTargets[0]
      return NextResponse.json(
        { error: `Edit ditolak — stok ${t.nama} akan menjadi minus (${t.stok}). Aktifkan "Izinkan stok minus" bila memang diperlukan.` },
        { status: 400 }
      )
    }

    const tanggalStr = body.tanggal !== undefined ? (body.tanggal ? String(body.tanggal) : todayJakarta()) : mutasi.tanggal
    const keteranganStr = body.keterangan !== undefined ? String(body.keterangan || '') : mutasi.keterangan

    const baseUpdate = {
      bahanId: newBahanId,
      qty: qtyNew,
      tanggal: tanggalStr,
      keterangan: keteranganStr,
      // snapshot bahan diperbarui bila bahan diganti
      namaBahan: bahanBaru.nama,
      satuanBahan: bahanBaru.satuan,
      // snapshot stok setelah transaksi ini (stok mutakhir setelah edit)
      stokSetelah: stokBaruHasil,
    }
    const dataUpdate =
      mutasi.jenis === 'masuk'
        ? (() => {
            const hargaBeli = body.hargaBeli !== undefined ? Math.max(0, Number(body.hargaBeli) || 0) : mutasi.hargaBeli
            return {
              ...baseUpdate,
              hargaBeli,
              totalHarga: hargaBeli * qtyNew,
              pemasok: body.pemasok !== undefined ? String(body.pemasok).trim() : mutasi.pemasok,
              nomorNota: body.nomorNota !== undefined ? String(body.nomorNota).trim() : mutasi.nomorNota,
            }
          })()
        : {
            ...baseUpdate,
            tujuan: body.tujuan !== undefined ? String(body.tujuan).trim() || 'Lainnya' : mutasi.tujuan,
          }

    await db.$transaction([
      db.bahanMutasi.update({ where: { id: mutasi.id }, data: dataUpdate }),
      ...(bahanBaru.id === bahanLama.id
        ? [db.bahan.update({ where: { id: bahanBaru.id }, data: { stok: stokBaruHasil } })]
        : [
            db.bahan.update({ where: { id: bahanLama.id }, data: { stok: stokLamaHasil } }),
            db.bahan.update({ where: { id: bahanBaru.id }, data: { stok: stokBaruHasil } }),
          ]),
    ])

    // Harga modal bahan mengikuti harga beli HANYA bila transaksi yang diedit
    // adalah pembelian (masuk) terakhir bahan tsb — meniru aturan POST.
    let updatedBahan = await db.bahan.findUnique({ where: { id: bahanBaru.id } })
    if (mutasi.jenis === 'masuk' && updatedBahan) {
      const latestMasuk = await db.bahanMutasi.findFirst({
        where: { bahanId: bahanBaru.id, jenis: 'masuk' },
        orderBy: { createdAt: 'desc' },
      })
      if (latestMasuk && latestMasuk.hargaBeli > 0 && updatedBahan.hargaSatuan !== latestMasuk.hargaBeli) {
        updatedBahan = await db.bahan.update({
          where: { id: bahanBaru.id },
          data: { hargaSatuan: latestMasuk.hargaBeli },
        })
      }
    }

    return NextResponse.json({ ok: true, bahan: updatedBahan })
  } catch (error: any) {
    console.error('Error updating mutasi bahan:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to update mutasi bahan') },
      { status: 500 }
    )
  }
}
