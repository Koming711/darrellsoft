import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth, canAccessRecord } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'
import { composeKeterangan, splitKeterangan, nextNomorMutasi } from '@/lib/stock-bahan-server'

/**
 * GET /api/stock-bahan — daftar semua bahan milik user yang login.
 * Diurutkan berdasarkan nama agar mudah dipindai.
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

/**
 * POST /api/stock-bahan — tambah bahan baru.
 * Body: { nama, kategori?, satuan?, stok?, stokMin?, hargaSatuan?, keterangan?,
 *         lokasi?, pemasok?, aktif?, poRef? }
 * - Kode auto-generate: BHN-001, BHN-002, ... (per user).
 * - Jika stok awal > 0, dibuat mutasi 'masuk' dengan keterangan "Stok awal"
 *   agar riwayat mutasi konsisten.
 * - poRef (Referensi PO) digabung ke keterangan: "Ref PO: xxx | catatan".
 */
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

    // Kode berurutan per user: BHN-001, BHN-002, ...
    const existing = await db.bahan.findMany({
      where: { userId },
      select: { kode: true },
    })
    let maxNum = 0
    for (const b of existing) {
      const m = /^BHN-(\d+)$/i.exec(b.kode)
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10))
    }
    const kode = `BHN-${String(maxNum + 1).padStart(3, '0')}`

    const created = await db.bahan.create({
      data: {
        kode,
        nama: String(nama).trim(),
        kategori: kategori ? String(kategori).trim() : '',
        satuan: satuan ? String(satuan).trim() : 'pcs',
        stok: stokNum,
        stokMin: stokMinNum,
        hargaSatuan: hargaNum,
        keterangan: composeKeterangan(poRef, keterangan),
        aktif: aktif === undefined ? true : Boolean(aktif),
        lokasi: lokasi ? String(lokasi).trim() : '',
        pemasok: pemasok ? String(pemasok).trim() : '',
        userId,
      },
    })

    // Mutasi awal agar riwayat mencatat stok pertama
    if (stokNum > 0) {
      await db.bahanMutasi.create({
        data: {
          bahanId: created.id,
          jenis: 'masuk',
          qty: stokNum,
          stokSetelah: stokNum,
          keterangan: 'Stok awal',
          nomor: await nextNomorMutasi(userId, 'masuk'),
          tanggal: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }),
          namaBahan: created.nama,
          satuanBahan: created.satuan,
          pemasok: created.pemasok,
          hargaBeli: hargaNum,
          totalHarga: hargaNum * stokNum,
          userId,
        },
      })
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
 * PUT /api/stock-bahan — edit data bahan.
 * Body: { id, nama, kategori?, satuan?, stok?, stokMin?, hargaSatuan?, keterangan?,
 *         lokasi?, pemasok?, aktif?, poRef? }
 * - Jika `stok` berubah, dibuat mutasi 'penyesuaian' (qty = selisih, boleh negatif)
 *   agar perubahan manual tetap tercatat di riwayat.
 */
export async function PUT(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const { id, nama, kategori, satuan, stok, stokMin, hargaSatuan, keterangan, lokasi, pemasok, aktif, poRef } = body

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

    const stokNum = Math.max(0, Number(stok) || 0)
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
        stok: stokNum,
        stokMin: stokMin !== undefined ? Math.max(0, Number(stokMin) || 0) : existing.stokMin,
        hargaSatuan: hargaSatuan !== undefined ? Math.max(0, Number(hargaSatuan) || 0) : existing.hargaSatuan,
        keterangan: finalKeterangan,
        aktif: aktif !== undefined ? Boolean(aktif) : existing.aktif,
        lokasi: lokasi !== undefined ? String(lokasi).trim() : existing.lokasi,
        pemasok: pemasok !== undefined ? String(pemasok).trim() : existing.pemasok,
      },
    })

    // Stok diubah manual → catat sebagai penyesuaian
    const delta = stokNum - existing.stok
    if (delta !== 0) {
      await db.bahanMutasi.create({
        data: {
          bahanId: id,
          jenis: 'penyesuaian',
          qty: delta,
          stokSetelah: stokNum,
          keterangan: 'Penyesuaian manual',
          nomor: await nextNomorMutasi(user?.id || null, 'penyesuaian'),
          tanggal: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }),
          namaBahan: updated.nama,
          satuanBahan: updated.satuan,
          alasan: 'Koreksi data',
          userId: user?.id || null,
        },
      })
    }

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
 * DELETE /api/stock-bahan?id=xxx — hapus bahan (mutasi ikut terhapus / cascade).
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
