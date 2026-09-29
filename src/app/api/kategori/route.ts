import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth, canAccessRecord } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * GET /api/kategori — daftar kategori milik user yang login (untuk halaman
 * Daftar Kategori dan dropdown Kategori di Master Harga Kertas).
 * Diurutkan berdasarkan nama (asc).
 */
export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const kategori = await db.kategori.findMany({
      where: await getDataFilter(user),
      orderBy: { nama: 'asc' },
    })
    return NextResponse.json(kategori, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error: any) {
    console.error('Error fetching kategori:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to fetch kategori') },
      { status: 500 }
    )
  }
}

/**
 * POST /api/kategori — tambah kategori baru.
 * Body: { nama }
 * - Nama wajib diisi; nama yang sama (per user) ditolak dengan 409.
 */
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const { nama } = body

    if (!nama || String(nama).trim() === '') {
      return NextResponse.json({ error: 'Nama kategori wajib diisi' }, { status: 400 })
    }

    const trimmed = String(nama).trim()
    const userId = user?.id || null

    // Cegah duplikat per user
    const duplicate = await db.kategori.findFirst({
      where: { nama: trimmed, userId },
    })
    if (duplicate) {
      return NextResponse.json(
        { error: `Kategori "${trimmed}" sudah ada` },
        { status: 409 }
      )
    }

    const created = await db.kategori.create({
      data: { nama: trimmed, userId },
    })

    return NextResponse.json(created, { status: 201 })
  } catch (error: any) {
    console.error('Error creating kategori:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to create kategori') },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/kategori?id=xxx — hapus kategori milik user sendiri.
 * Kategori yang masih dipakai bahan kertas (Paper) TIDAK bisa dihapus (409).
 */
export async function DELETE(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const id = request.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'ID kategori wajib diisi' }, { status: 400 })
    }

    const existing = await db.kategori.findUnique({ where: { id } })
    if (!existing || !canAccessRecord(user, existing.userId)) {
      return NextResponse.json({ error: 'Kategori tidak ditemukan' }, { status: 404 })
    }

    // Tolak hapus jika kategori masih dipakai bahan kertas
    const usedCount = await db.paper.count({ where: { kategoriId: id } })
    if (usedCount > 0) {
      return NextResponse.json(
        {
          error: `Kategori "${existing.nama}" masih dipakai oleh ${usedCount} bahan kertas dan tidak bisa dihapus`,
          usedCount,
        },
        { status: 409 }
      )
    }

    await db.kategori.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Error deleting kategori:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to delete kategori') },
      { status: 500 }
    )
  }
}
