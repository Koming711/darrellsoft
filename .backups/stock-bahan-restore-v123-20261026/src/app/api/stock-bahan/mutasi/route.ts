import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth, canAccessRecord } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'
import { nextNomorMutasi, todayJakarta, isIzinkanMinus } from '@/lib/stock-bahan-server'
import { recalcBahanStock, StockMinusError } from '@/lib/bahan-stock'

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
 * - jenis 'masuk'       : pembelian & penerimaan barang (SM-xxx)
 *     body: { bahanId, qty, tanggal?, hargaBeli?, nomorNota?, pemasok?, keterangan? }
 *     → stok +qty; hargaSatuan bahan diperbarui bila hargaBeli > 0 (harga modal terakhir).
 * - jenis 'keluar'      : produksi, sampel, rusak (SK-xxx)
 *     body: { bahanId, qty, tanggal?, tujuan?, referensi?, keterangan? }
 *     → stok -qty; ditolak bila stok tidak cukup KECUALI "Izinkan stok minus" aktif.
 * - jenis 'penyesuaian' : stok fisik vs sistem (SP-xxx)
 *     body: { bahanId, stokFisik, tanggal?, alasan?, keterangan? }
 *     → stok = stokFisik; qty tercatat sebagai selisih (boleh negatif).
 *
 * Semua jenis disimpan ATOMIK dalam satu transaksi database bersama
 * rekalkulasi saldo ledger (recalcBahanStock) sehingga:
 * - stok & saldo riwayat selalu konsisten,
 * - dua transaksi bersamaan tidak bisa membuat saldo minus (guard atomik),
 * - tombol Simpan yang tertekan dua kali tetap menghasilkan saldo benar.
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
    const izinkanMinus = await isIzinkanMinus(userId)

    try {
      // ============ STOK MASUK (pembelian & penerimaan) ============
      if (jenis === 'masuk') {
        const qtyNum = Number(qty)
        if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
          return NextResponse.json({ error: 'Jumlah harus lebih dari 0' }, { status: 400 })
        }
        const hargaBeli = Math.max(0, Number(body.hargaBeli) || 0)

        const created = await db.$transaction(async (tx) => {
          const nomor = await nextNomorMutasi(userId, 'masuk')
          const mutasi = await tx.bahanMutasi.create({
            data: {
              bahanId,
              jenis: 'masuk',
              qty: qtyNum,
              stokSetelah: bahan.stok + qtyNum,
              masuk: qtyNum,
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
          })
          await tx.bahan.update({
            where: { id: bahanId },
            data: {
              // harga modal terakhir ikut terbarui dari pembelian
              ...(hargaBeli > 0 ? { hargaSatuan: hargaBeli } : {}),
            },
          })
          await recalcBahanStock(tx, bahanId, {
            allowNegative: izinkanMinus,
            bahanNama: bahan.nama,
            satuan: bahan.satuan,
          })
          return mutasi
        })

        return NextResponse.json(
          { ...created, nomorTransaksi: created.nomor },
          { status: 201 }
        )
      }

      // ============ STOK KELUAR (produksi, sampel, rusak) ============
      if (jenis === 'keluar') {
        const qtyNum = Number(qty)
        if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
          return NextResponse.json({ error: 'Jumlah harus lebih dari 0' }, { status: 400 })
        }

        const mutasi = await db.$transaction(async (tx) => {
          const nomor = await nextNomorMutasi(userId, 'keluar')
          const created = await tx.bahanMutasi.create({
            data: {
              bahanId,
              jenis: 'keluar',
              qty: qtyNum,
              stokSetelah: bahan.stok - qtyNum,
              keluar: qtyNum,
              keterangan: keterangan ? String(keterangan) : '',
              nomor,
              tanggal: tanggalStr,
              tujuan: body.tujuan ? String(body.tujuan).trim() : 'Lainnya',
              referensi: body.referensi ? String(body.referensi).trim() : '',
              satuanBahan: bahan.satuan,
              namaBahan: bahan.nama,
              userId,
            },
          })

          if (!izinkanMinus) {
            // Guard atomik: baris hanya terupdate bila stok cukup → dua
            // transaksi bersamaan tidak bisa membuat saldo minus.
            const ok = await tx.bahan.updateMany({
              where: { id: bahanId, stok: { gte: qtyNum } },
              data: { stok: { decrement: qtyNum } },
            })
            if (ok.count === 0) {
              throw new StockMinusError(bahan.nama, bahan.stok, bahan.satuan)
            }
          } else {
            await tx.bahan.update({
              where: { id: bahanId },
              data: { stok: { decrement: qtyNum } },
            })
          }

          // Selaraskan seluruh ledger + saldo master dari sumber kebenaran.
          await recalcBahanStock(tx, bahanId, {
            allowNegative: izinkanMinus,
            bahanNama: bahan.nama,
            satuan: bahan.satuan,
          })
          return created
        })

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

      const mutasi = await db.$transaction(async (tx) => {
        const nomor = await nextNomorMutasi(userId, 'penyesuaian')
        const created = await tx.bahanMutasi.create({
          data: {
            bahanId,
            jenis: 'penyesuaian',
            qty: delta,
            stokSetelah: stokFisik,
            masuk: delta > 0 ? delta : 0,
            keluar: delta < 0 ? Math.abs(delta) : 0,
            keterangan: keterangan ? String(keterangan) : '',
            nomor,
            tanggal: tanggalStr,
            alasan: body.alasan ? String(body.alasan).trim() : 'Lainnya',
            satuanBahan: bahan.satuan,
            namaBahan: bahan.nama,
            userId,
          },
        })
        await recalcBahanStock(tx, bahanId, {
          allowNegative: izinkanMinus,
          bahanNama: bahan.nama,
          satuan: bahan.satuan,
        })
        return created
      })

      return NextResponse.json(mutasi, { status: 201 })
    } catch (e: any) {
      if (e instanceof StockMinusError) {
        return NextResponse.json(
          { error: `${e.message}. Catat Stok Masuk dahulu atau koreksi via Penyesuaian Stok.` },
          { status: 400 }
        )
      }
      throw e
    }
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
 *       { id, bahanId?, qty?, tanggal?, tujuan?, referensi?, keterangan? }               (keluar)
 *
 * - Efek stok lama & baru dihitung ulang dari ledger (recalcBahanStock) —
 *   stok tidak pernah bertambah/berkurang dua kali.
 * - Bahan juga boleh diganti (saldo bahan lama & baru sama-sama direkalkulasi).
 * - Ditolak bila hasil edit membuat saldo minus KECUALI "Izinkan stok minus" aktif.
 * - Nomor transaksi (SM-/SK-xxx) TIDAK berubah. Harga modal bahan mengikuti
 *   harga beli HANYA bila transaksi yang diedit adalah pembelian terakhir bahan tsb.
 * - Penyesuaian (SP-…) tidak dapat diedit lewat endpoint ini (buat penyesuaian baru).
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
    const tanggalStr = body.tanggal !== undefined ? (body.tanggal ? String(body.tanggal) : todayJakarta()) : mutasi.tanggal
    const keteranganStr = body.keterangan !== undefined ? String(body.keterangan || '') : mutasi.keterangan

    try {
      await db.$transaction(async (tx) => {
        const dataUpdate =
          mutasi.jenis === 'masuk'
            ? (() => {
                const hargaBeli = body.hargaBeli !== undefined ? Math.max(0, Number(body.hargaBeli) || 0) : mutasi.hargaBeli
                return {
                  bahanId: newBahanId,
                  qty: qtyNew,
                  masuk: qtyNew,
                  keluar: 0,
                  tanggal: tanggalStr,
                  keterangan: keteranganStr,
                  // snapshot bahan diperbarui bila bahan diganti
                  namaBahan: bahanBaru.nama,
                  satuanBahan: bahanBaru.satuan,
                  hargaBeli,
                  totalHarga: hargaBeli * qtyNew,
                  pemasok: body.pemasok !== undefined ? String(body.pemasok).trim() : mutasi.pemasok,
                  nomorNota: body.nomorNota !== undefined ? String(body.nomorNota).trim() : mutasi.nomorNota,
                }
              })()
            : {
                bahanId: newBahanId,
                qty: qtyNew,
                masuk: 0,
                keluar: qtyNew,
                tanggal: tanggalStr,
                keterangan: keteranganStr,
                namaBahan: bahanBaru.nama,
                satuanBahan: bahanBaru.satuan,
                tujuan: body.tujuan !== undefined ? String(body.tujuan).trim() || 'Lainnya' : mutasi.tujuan,
                referensi: body.referensi !== undefined ? String(body.referensi || '').trim() : mutasi.referensi,
              }

        await tx.bahanMutasi.update({ where: { id: mutasi.id }, data: dataUpdate })

        // Rekalkulasi saldo kedua bahan yang terdampak (satu bila sama).
        await recalcBahanStock(tx, bahanBaru.id, {
          allowNegative: izinkanMinus,
          bahanNama: bahanBaru.nama,
          satuan: bahanBaru.satuan,
        })
        if (bahanBaru.id !== bahanLama.id) {
          await recalcBahanStock(tx, bahanLama.id, {
            allowNegative: izinkanMinus,
            bahanNama: bahanLama.nama,
            satuan: bahanLama.satuan,
          })
        }
      })

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
    } catch (e: any) {
      if (e instanceof StockMinusError) {
        return NextResponse.json(
          { error: `Edit ditolak — ${e.message}. Aktifkan "Izinkan stok minus" bila memang diperlukan.` },
          { status: 400 }
        )
      }
      throw e
    }
  } catch (error: any) {
    console.error('Error updating mutasi bahan:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to update mutasi bahan') },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/stock-bahan/mutasi?id=xxx — batalkan transaksi stok.
 * - Saldo bahan dihitung ulang dari ledger setelah baris dihapus (atomik).
 * - Bila pembatalan membuat riwayat saldo minus (mis. menghapus Stok Masuk
 *   yang menopang saldo), transaksi DITOLAK dengan pesan jelas.
 * - Stok masuk yang berasal dari penerimaan PO tetap boleh dibatalkan manual
 *   (penanda "diterima" di PO tidak ikut berubah — batalkan dengan sadar).
 */
export async function DELETE(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const id = request.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID transaksi wajib diisi' }, { status: 400 })

    const mutasi = await db.bahanMutasi.findUnique({ where: { id } })
    if (!mutasi || !canAccessRecord(user, mutasi.userId)) {
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 })
    }

    const bahan = await db.bahan.findUnique({ where: { id: mutasi.bahanId } })
    const izinkanMinus = await isIzinkanMinus(user?.id || null)

    try {
      await db.$transaction(async (tx) => {
        await tx.bahanMutasi.delete({ where: { id } })
        if (bahan) {
          await recalcBahanStock(tx, bahan.id, {
            allowNegative: izinkanMinus,
            bahanNama: bahan.nama,
            satuan: bahan.satuan,
          })
        }
      })
      return NextResponse.json({ success: true })
    } catch (e: any) {
      if (e instanceof StockMinusError) {
        return NextResponse.json(
          { error: `Pembatalan ditolak — ${e.message}. Hapus/catat transaksi lain dahulu agar saldo tidak minus.` },
          { status: 400 }
        )
      }
      throw e
    }
  } catch (error: any) {
    console.error('Error deleting mutasi bahan:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to delete mutasi bahan') },
      { status: 500 }
    )
  }
}
