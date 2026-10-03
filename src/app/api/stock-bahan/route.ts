import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth, canAccessRecord } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'
import { recalcBahan, nextStkNumber, todayStr } from '@/lib/stock-bahan-server'

/**
 * GET /api/stock-bahan — daftar semua bahan milik user yang login.
 * Query opsional: q (nama/kode), kategori, aktif ('true'/'false')
 */
export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const sp = request.nextUrl.searchParams
    const q = (sp.get('q') || '').trim().toLowerCase()
    const kategori = (sp.get('kategori') || '').trim()
    const aktif = sp.get('aktif')

    const rows = await db.bahan.findMany({
      where: await getDataFilter(user),
      orderBy: { nama: 'asc' },
    })

    let bahan = rows
    if (q) {
      bahan = bahan.filter(
        (b) => b.nama.toLowerCase().includes(q) || b.kode.toLowerCase().includes(q)
      )
    }
    if (kategori) bahan = bahan.filter((b) => b.kategori === kategori)
    if (aktif === 'true') bahan = bahan.filter((b) => b.aktif)
    if (aktif === 'false') bahan = bahan.filter((b) => !b.aktif)

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
 * Body: { nama, kategori?, satuan?, stokMin?, hargaSatuan?, suplierId?, suplierNama?,
 *         lokasi?, aktif?, keterangan?, stokAwal? }
 * - Kode auto: BHN-001, BHN-002, ... (per user).
 * - stokAwal > 0 → dibuat transaksi Stok Masuk "Stok awal" agar saldo terlacak.
 */
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const { nama, kategori, satuan, stokMin, hargaSatuan, suplierId, suplierNama, lokasi, aktif, keterangan, stokAwal } = body

    if (!nama || String(nama).trim() === '') {
      return NextResponse.json({ error: 'Nama bahan wajib diisi' }, { status: 400 })
    }
    if (!satuan || String(satuan).trim() === '') {
      return NextResponse.json({ error: 'Satuan wajib diisi' }, { status: 400 })
    }

    const userId = user?.id || null
    const stokMinNum = Math.max(0, Number(stokMin) || 0)
    const hargaNum = Math.max(0, Number(hargaSatuan) || 0)
    const stokAwalNum = Math.max(0, Number(stokAwal) || 0)

    // Kode berurutan per user: BHN-001, BHN-002, ...
    const existing = await db.bahan.findMany({ where: { userId }, select: { kode: true } })
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
        satuan: String(satuan).trim(),
        stok: 0, // stok hanya berubah lewat transaksi
        stokMin: stokMinNum,
        hargaSatuan: hargaNum,
        suplierId: suplierId ? String(suplierId) : null,
        suplierNama: suplierNama ? String(suplierNama).trim() : '',
        lokasi: lokasi ? String(lokasi).trim() : '',
        aktif: aktif === undefined ? true : Boolean(aktif),
        keterangan: keterangan ? String(keterangan) : '',
        userId,
      },
    })

    if (stokAwalNum > 0) {
      const nomor = await nextStkNumber(userId)
      await db.bahanMasuk.create({
        data: {
          nomor,
          tanggal: todayStr(),
          bahanId: created.id,
          bahanNama: created.nama,
          satuan: created.satuan,
          qty: stokAwalNum,
          hargaBeli: hargaNum,
          total: stokAwalNum * hargaNum,
          suplierNama: created.suplierNama,
          nomorNota: '',
          catatan: 'Stok awal',
          userId,
        },
      })
      await recalcBahan(created.id)
    }

    const fresh = await db.bahan.findUnique({ where: { id: created.id } })
    return NextResponse.json(fresh, { status: 201 })
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
 * Body: { id, nama?, kategori?, satuan?, stokMin?, hargaSatuan?, suplierId?, suplierNama?,
 *         lokasi?, aktif?, keterangan? }
 * - Stok TIDAK bisa diubah langsung di sini (wajib lewat Stok Masuk/Keluar/Penyesuaian).
 * - Transaksi lama tidak terpengaruh (nama/satuan tersimpan snapshot di transaksi).
 */
export async function PUT(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const { id, nama, kategori, satuan, stokMin, hargaSatuan, suplierId, suplierNama, lokasi, aktif, keterangan } = body

    if (!id) {
      return NextResponse.json({ error: 'ID bahan wajib diisi' }, { status: 400 })
    }
    if (nama !== undefined && (!nama || String(nama).trim() === '')) {
      return NextResponse.json({ error: 'Nama bahan wajib diisi' }, { status: 400 })
    }

    const existing = await db.bahan.findUnique({ where: { id } })
    if (!existing || !canAccessRecord(user, existing.userId)) {
      return NextResponse.json({ error: 'Bahan tidak ditemukan' }, { status: 404 })
    }

    // Jika memilih suplier via ID, ambil nama terkini dari tabel Suplier
    let suplierNamaFinal = existing.suplierNama
    if (suplierId !== undefined) {
      if (suplierId) {
        const sup = await db.suplier.findUnique({ where: { id: String(suplierId) } })
        suplierNamaFinal = sup ? sup.nama : existing.suplierNama
      } else {
        suplierNamaFinal = ''
      }
    } else if (suplierNama !== undefined) {
      suplierNamaFinal = String(suplierNama).trim()
    }

    const updated = await db.bahan.update({
      where: { id },
      data: {
        nama: nama !== undefined ? String(nama).trim() : existing.nama,
        kategori: kategori !== undefined ? String(kategori).trim() : existing.kategori,
        satuan: satuan !== undefined && String(satuan).trim() !== '' ? String(satuan).trim() : existing.satuan,
        stokMin: stokMin !== undefined ? Math.max(0, Number(stokMin) || 0) : existing.stokMin,
        hargaSatuan: hargaSatuan !== undefined ? Math.max(0, Number(hargaSatuan) || 0) : existing.hargaSatuan,
        suplierId: suplierId !== undefined ? (suplierId ? String(suplierId) : null) : existing.suplierId,
        suplierNama: suplierNamaFinal,
        lokasi: lokasi !== undefined ? String(lokasi).trim() : existing.lokasi,
        aktif: aktif !== undefined ? Boolean(aktif) : existing.aktif,
        keterangan: keterangan !== undefined ? String(keterangan) : existing.keterangan,
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
 * Jika bahan sudah punya transaksi (masuk/keluar/penyesuaian) → ditolak 409.
 * Gunakan PUT { aktif: false } untuk menonaktifkan alih-alih menghapus.
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
