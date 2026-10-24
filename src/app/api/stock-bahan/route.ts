import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth, canAccessRecord } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'
import { composeKeterangan, splitKeterangan, nextNomorMutasi } from '@/lib/stock-bahan-server'
import { recalcBahanStock } from '@/lib/bahan-stock'

/**
 * CRUD master Bahan.
 *
 * GET    — daftar bahan milik user (urut nama).
 * POST   — tambah bahan. Kode auto BHN-001, BHN-002, ... (per user, aman dari
 *          duplikasi lewat retry @@unique([userId, kode])). Stok awal > 0
 *          dicatat sebagai mutasi 'masuk' "Stok awal" agar riwayat konsisten.
 * PUT    — edit data master (nama, kategori, satuan, stokMin, harga, dll).
 *          PENTING: stok tersedia TIDAK boleh diubah lewat form master —
 *          perubahan stok hanya lewat transaksi (Stok Masuk/Keluar) atau
 *          Penyesuaian Stok. Field `stok` pada body sengaja diabaikan.
 * DELETE ?id= — hapus bahan HANYA jika belum punya transaksi apa pun
 *          (BahanMutasi / BahanMasuk / BahanKeluar / BahanPenyesuaian).
 *          Bahan dengan riwayat ditolak 409 + canDeactivate (sarankan
 *          nonaktifkan via form edit).
 */

export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const bahan = await db.bahan.findMany({
      where: await getDataFilter(user),
      orderBy: { nama: 'asc' },
    })
    return NextResponse.json(bahan, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error: any) {
    console.error('Error fetching stock bahan:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to fetch stock bahan') },
      { status: 500 }
    )
  }
}

/** Kode berurutan per user: BHN-001, BHN-002, ... (ambil max yang terpakai). */
async function generateKode(userId: string | null): Promise<string> {
  const existing = await db.bahan.findMany({
    where: { userId },
    select: { kode: true },
  })
  let maxNum = 0
  for (const b of existing) {
    const m = /^BHN-(\d+)$/i.exec(b.kode)
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10))
  }
  return `BHN-${String(maxNum + 1).padStart(3, '0')}`
}

export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const { nama, kategori, satuan, stok, stokMin, hargaSatuan, keterangan, lokasi, pemasok, aktif, poRef } = body

    if (!nama || String(nama).trim() === '') {
      return NextResponse.json({ error: 'Nama bahan wajib diisi' }, { status: 400 })
    }

    const userId = user?.id || null
    const stokNum = Math.max(0, Number(stok) || 0)
    const stokMinNum = Math.max(0, Number(stokMin) || 0)
    const hargaNum = Math.max(0, Number(hargaSatuan) || 0)

    // Kode auto + retry bila terjadi tabrakan (concurrent create / max berubah).
    let created: Awaited<ReturnType<typeof db.bahan.create>> | null = null
    let lastErr: unknown = null
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      const kode = await generateKode(userId)
      try {
        created = await db.$transaction(async (tx) => {
          const row = await tx.bahan.create({
            data: {
              kode,
              nama: String(nama).trim(),
              kategori: kategori ? String(kategori).trim() : '',
              satuan: satuan ? String(satuan).trim() : 'pcs',
              stok: 0,
              stokMin: stokMinNum,
              hargaSatuan: hargaNum,
              keterangan: composeKeterangan(poRef, keterangan),
              aktif: aktif === undefined ? true : Boolean(aktif),
              lokasi: lokasi ? String(lokasi).trim() : '',
              pemasok: pemasok ? String(pemasok).trim() : '',
              userId,
            },
          })

          // Stok awal > 0 (dipakai integrasi lama/PO fallback) → catat mutasi
          // "Stok awal" supaya saldo selalu berakar pada riwayat.
          if (stokNum > 0) {
            await tx.bahanMutasi.create({
              data: {
                bahanId: row.id,
                jenis: 'masuk',
                qty: stokNum,
                stokSetelah: stokNum,
                masuk: stokNum,
                keterangan: 'Stok awal',
                nomor: await nextNomorMutasi(userId, 'masuk'),
                tanggal: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }),
                namaBahan: row.nama,
                satuanBahan: row.satuan,
                pemasok: row.pemasok,
                hargaBeli: hargaNum,
                totalHarga: hargaNum * stokNum,
                userId,
              },
            })
            await recalcBahanStock(tx, row.id, {
              allowNegative: false,
              bahanNama: row.nama,
              satuan: row.satuan,
            })
          }
          return row
        })
      } catch (e: any) {
        // P2002 = unique constraint (kode bentrok) → coba lagi dgn kode baru.
        if (e?.code === 'P2002') {
          lastErr = e
          continue
        }
        throw e
      }
    }

    if (!created) {
      console.error('Error creating bahan: kode gagal unik', lastErr)
      return NextResponse.json(
        { error: 'Gagal membuat kode bahan unik — coba lagi' },
        { status: 500 }
      )
    }

    return NextResponse.json(created, { status: 201 })
  } catch (error: any) {
    console.error('Error creating bahan:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to create bahan') },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/stock-bahan — edit data master bahan.
 * Stok TIDAK diubah di sini (diabaikan) — perubahan stok harus lewat
 * transaksi stok masuk/keluar atau penyesuaian stok yang tercatat.
 */
export async function PUT(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const { id, nama, kategori, satuan, stokMin, hargaSatuan, keterangan, lokasi, pemasok, aktif, poRef } = body

    if (!id) {
      return NextResponse.json({ error: 'ID bahan wajib diisi' }, { status: 400 })
    }
    if (!nama || String(nama).trim() === '') {
      return NextResponse.json({ error: 'Nama bahan wajib diisi' }, { status: 400 })
    }

    const existing = await db.bahan.findUnique({ where: { id } })
    if (!existing || !canAccessRecord(user, existing.userId)) {
      return NextResponse.json({ error: 'Bahan tidak ditemukan' }, { status: 404 })
    }

    // Pertahankan Ref PO lama bila field-nya tidak dikirim dari form edit
    const existingKet = splitKeterangan(existing.keterangan)
    const finalKeterangan =
      keterangan !== undefined || poRef !== undefined
        ? composeKeterangan(
            poRef !== undefined ? poRef : existingKet.poRef,
            keterangan !== undefined ? keterangan : existingKet.catatan
          )
        : existing.keterangan
    const updated = await db.bahan.update({
      where: { id },
      data: {
        nama: String(nama).trim(),
        kategori: kategori !== undefined ? String(kategori).trim() : existing.kategori,
        satuan: satuan !== undefined && String(satuan).trim() !== '' ? String(satuan).trim() : existing.satuan,
        // stok sengaja tidak diupdate — hanya lewat transaksi / penyesuaian
        stokMin: stokMin !== undefined ? Math.max(0, Number(stokMin) || 0) : existing.stokMin,
        hargaSatuan: hargaSatuan !== undefined ? Math.max(0, Number(hargaSatuan) || 0) : existing.hargaSatuan,
        keterangan: finalKeterangan,
        aktif: aktif !== undefined ? Boolean(aktif) : existing.aktif,
        lokasi: lokasi !== undefined ? String(lokasi).trim() : existing.lokasi,
        pemasok: pemasok !== undefined ? String(pemasok).trim() : existing.pemasok,
      },
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('Error updating bahan:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to update bahan') },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/stock-bahan?id=xxx — hapus bahan.
 * Ditolak (409) bila bahan sudah punya transaksi stok — gunakan Nonaktifkan.
 */
export async function DELETE(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const id = request.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'ID bahan wajib diisi' }, { status: 400 })
    }

    const existing = await db.bahan.findUnique({ where: { id } })
    if (!existing || !canAccessRecord(user, existing.userId)) {
      return NextResponse.json({ error: 'Bahan tidak ditemukan' }, { status: 404 })
    }

    // Lindungi bahan yang sudah punya riwayat transaksi.
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
          error: `Bahan sudah dipakai dalam ${totalTrx} transaksi dan tidak bisa dihapus. Gunakan "Nonaktifkan" pada form Edit bahan.`,
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
