import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth, canAccessRecord } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * API supplier bahan.
 * GET    /api/stock-bahan/suppliers         — daftar supplier
 * POST   /api/stock-bahan/suppliers         — tambah
 * PUT    /api/stock-bahan/suppliers         — edit / nonaktifkan
 * DELETE /api/stock-bahan/suppliers?id=xxx  — hard delete (ditolak jika dipakai Stok Masuk)
 */

export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const list = await db.stockSupplier.findMany({
      where: await getDataFilter(user),
      orderBy: { nama: 'asc' },
      include: { _count: { select: { stockIns: true } } },
    })
    const result = list.map(s => ({
      id: s.id,
      nama: s.nama,
      kontak: s.kontak,
      whatsapp: s.whatsapp,
      alamat: s.alamat,
      catatan: s.catatan,
      aktif: s.aktif,
      punyaTransaksi: s._count.stockIns > 0,
    }))
    return NextResponse.json(
      { data: result },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (error: any) {
    console.error('Error fetching stock suppliers:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to fetch stock suppliers') },
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
    const { nama, kontak, whatsapp, alamat, catatan } = body

    if (!nama || String(nama).trim() === '') {
      return NextResponse.json({ error: 'Nama supplier wajib diisi' }, { status: 400 })
    }

    const created = await db.stockSupplier.create({
      data: {
        nama: String(nama).trim(),
        kontak: kontak ? String(kontak).trim() : '',
        whatsapp: whatsapp ? String(whatsapp).trim() : '',
        alamat: alamat ? String(alamat).trim() : '',
        catatan: catatan ? String(catatan) : '',
        aktif: true,
        userId: user?.id || null,
      },
    })
    return NextResponse.json(created, { status: 201 })
  } catch (error: any) {
    console.error('Error creating stock supplier:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to create stock supplier') },
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
    if (!nama || String(nama).trim() === '') {
      return NextResponse.json({ error: 'Nama supplier wajib diisi' }, { status: 400 })
    }

    const existing = await db.stockSupplier.findUnique({ where: { id } })
    if (!existing || !canAccessRecord(user, existing.userId)) {
      return NextResponse.json({ error: 'Supplier tidak ditemukan' }, { status: 404 })
    }

    const updated = await db.stockSupplier.update({
      where: { id },
      data: {
        nama: String(nama).trim(),
        kontak: kontak !== undefined ? String(kontak).trim() : existing.kontak,
        whatsapp: whatsapp !== undefined ? String(whatsapp).trim() : existing.whatsapp,
        alamat: alamat !== undefined ? String(alamat).trim() : existing.alamat,
        catatan: catatan !== undefined ? String(catatan) : existing.catatan,
        aktif: aktif !== undefined ? Boolean(aktif) : existing.aktif,
      },
    })
    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('Error updating stock supplier:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to update stock supplier') },
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

    const existing = await db.stockSupplier.findUnique({
      where: { id },
      include: { _count: { select: { stockIns: true } } },
    })
    if (!existing || !canAccessRecord(user, existing.userId)) {
      return NextResponse.json({ error: 'Supplier tidak ditemukan' }, { status: 404 })
    }

    if (existing._count.stockIns > 0) {
      return NextResponse.json(
        {
          error:
            'Supplier sudah dipakai pada transaksi stok masuk dan tidak dapat dihapus permanen. Gunakan Nonaktifkan.',
          punyaTransaksi: true,
        },
        { status: 409 }
      )
    }

    await db.stockSupplier.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting stock supplier:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to delete stock supplier') },
      { status: 500 }
    )
  }
}
