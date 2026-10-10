import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth, canAccessRecord } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * CRUD Data Supplier untuk modul Stock Bahan.
 * GET    /api/stock-bahan/suplier          — daftar supplier (q filter opsional)
 * POST   { nama, kontak?, whatsapp?, alamat?, catatan?, aktif? }
 * PUT    { id, ...fields }
 * DELETE ?id=xxx — ditolak 409 jika supplier dipakai bahan/transaksi (sarankan nonaktifkan)
 */
export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const q = (request.nextUrl.searchParams.get('q') || '').trim().toLowerCase()

    const rows = await db.suplier.findMany({
      where: await getDataFilter(user),
      orderBy: { nama: 'asc' },
    })

    const suplier = q ? rows.filter((s) => s.nama.toLowerCase().includes(q)) : rows
    return NextResponse.json(suplier, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error: any) {
    console.error('Error fetching suplier:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to fetch suplier') },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const { nama, kontak, whatsapp, alamat, catatan, aktif } = body

    if (!nama || String(nama).trim() === '') {
      return NextResponse.json({ error: 'Nama supplier wajib diisi' }, { status: 400 })
    }

    const created = await db.suplier.create({
      data: {
        nama: String(nama).trim(),
        kontak: kontak ? String(kontak).trim() : '',
        whatsapp: whatsapp ? String(whatsapp).trim() : '',
        alamat: alamat ? String(alamat).trim() : '',
        catatan: catatan ? String(catatan) : '',
        aktif: aktif === undefined ? true : Boolean(aktif),
        userId: user?.id || null,
      },
    })
    return NextResponse.json(created, { status: 201 })
  } catch (error: any) {
    console.error('Error creating suplier:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to create suplier') },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const { id, nama, kontak, whatsapp, alamat, catatan, aktif } = body

    if (!id) return NextResponse.json({ error: 'ID supplier wajib diisi' }, { status: 400 })
    if (nama !== undefined && (!nama || String(nama).trim() === '')) {
      return NextResponse.json({ error: 'Nama supplier wajib diisi' }, { status: 400 })
    }

    const existing = await db.suplier.findUnique({ where: { id } })
    if (!existing || !canAccessRecord(user, existing.userId)) {
      return NextResponse.json({ error: 'Supplier tidak ditemukan' }, { status: 404 })
    }

    const updated = await db.suplier.update({
      where: { id },
      data: {
        nama: nama !== undefined ? String(nama).trim() : existing.nama,
        kontak: kontak !== undefined ? String(kontak).trim() : existing.kontak,
        whatsapp: whatsapp !== undefined ? String(whatsapp).trim() : existing.whatsapp,
        alamat: alamat !== undefined ? String(alamat).trim() : existing.alamat,
        catatan: catatan !== undefined ? String(catatan) : existing.catatan,
        aktif: aktif !== undefined ? Boolean(aktif) : existing.aktif,
      },
    })

    // Sinkronkan snapshot nama suplier pada bahan yang memakai supplier ini
    if (updated.nama !== existing.nama) {
      await db.bahan.updateMany({ where: { suplierId: id }, data: { suplierNama: updated.nama } })
    }

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('Error updating suplier:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to update suplier') },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const id = request.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID supplier wajib diisi' }, { status: 400 })

    const existing = await db.suplier.findUnique({ where: { id } })
    if (!existing || !canAccessRecord(user, existing.userId)) {
      return NextResponse.json({ error: 'Supplier tidak ditemukan' }, { status: 404 })
    }

    const [cBahan, cMasuk] = await Promise.all([
      db.bahan.count({ where: { suplierId: id } }),
      db.bahanMasuk.count({ where: { suplierId: id } }),
    ])
    if (cBahan + cMasuk > 0) {
      return NextResponse.json(
        { error: 'Supplier sudah dipakai pada data bahan/transaksi. Gunakan "Nonaktifkan" alih-alih menghapus.', canDeactivate: true },
        { status: 409 }
      )
    }

    await db.suplier.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting suplier:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to delete suplier') },
      { status: 500 }
    )
  }
}
