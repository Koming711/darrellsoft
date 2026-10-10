import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth, canAccessRecord } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * API master kategori bahan (StockKategori).
 * GET    /api/stock-bahan/kategori   — daftar kategori + jumlah bahan terpakai
 * POST   /api/stock-bahan/kategori   — tambah kategori (nama wajib, unik per user)
 * PUT    /api/stock-bahan/kategori   — edit kategori; rename di-cascade ke field kategori bahan
 * DELETE /api/stock-bahan/kategori?id= — hapus (ditolak 409 bila masih dipakai bahan)
 */

// GET — daftar kategori milik user + jumlah bahan yang memakainya.
export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const where = await getDataFilter(user)

    const list = await db.stockKategori.findMany({
      where,
      orderBy: [{ nama: 'asc' }],
    })

    const materials = await db.stockMaterial.findMany({
      where,
      select: { kategori: true },
    })

    // Hitung pemakaian (case-insensitive agar aman terhadap data lama).
    const usage = new Map<string, number>()
    for (const m of materials) {
      const key = (m.kategori || '').trim().toLowerCase()
      if (!key) continue
      usage.set(key, (usage.get(key) || 0) + 1)
    }

    const result = list.map(k => ({
      id: k.id,
      nama: k.nama,
      catatan: k.catatan,
      jumlahBahan: usage.get(k.nama.trim().toLowerCase()) || 0,
    }))

    // Kategori dari bahan yang belum terdaftar di master (data lama) ikut dilaporkan.
    const registered = new Set(list.map(k => k.nama.trim().toLowerCase()))
    const orphanKategori: string[] = []
    for (const [key] of usage.entries()) {
      if (!registered.has(key)) orphanKategori.push(key)
    }

    return NextResponse.json(
      { data: result, orphanKategori },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (error: any) {
    console.error('Error fetching stock kategori:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to fetch stock kategori') },
      { status: 500 }
    )
  }
}

// POST — tambah kategori baru.
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const { nama, catatan } = body

    if (!nama || String(nama).trim() === '') {
      return NextResponse.json({ error: 'Nama kategori wajib diisi' }, { status: 400 })
    }

    const userId = user?.id || null
    const namaFinal = String(nama).trim()

    const dup = await db.stockKategori.findFirst({
      where: { userId, nama: namaFinal },
    })
    if (dup) {
      return NextResponse.json(
        { error: `Kategori "${namaFinal}" sudah ada` },
        { status: 400 }
      )
    }

    const created = await db.stockKategori.create({
      data: {
        nama: namaFinal,
        catatan: catatan ? String(catatan).trim() : '',
        userId,
      },
    })

    return NextResponse.json(created, { status: 201 })
  } catch (error: any) {
    console.error('Error creating stock kategori:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to create stock kategori') },
      { status: 500 }
    )
  }
}

// PUT — edit kategori. Rename di-cascade ke field kategori pada semua bahan terkait.
export async function PUT(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const { id, nama, catatan } = body

    if (!id) return NextResponse.json({ error: 'ID kategori wajib diisi' }, { status: 400 })
    if (!nama || String(nama).trim() === '') {
      return NextResponse.json({ error: 'Nama kategori wajib diisi' }, { status: 400 })
    }

    const existing = await db.stockKategori.findUnique({ where: { id } })
    if (!existing || !canAccessRecord(user, existing.userId)) {
      return NextResponse.json({ error: 'Kategori tidak ditemukan' }, { status: 404 })
    }

    const namaFinal = String(nama).trim()
    if (namaFinal.toLowerCase() !== existing.nama.trim().toLowerCase()) {
      const dup = await db.stockKategori.findFirst({
        where: { userId: existing.userId, nama: namaFinal },
      })
      if (dup) {
        return NextResponse.json(
          { error: `Kategori "${namaFinal}" sudah ada` },
          { status: 400 }
        )
      }
    }

    const updated = await db.$transaction(async tx => {
      const row = await tx.stockKategori.update({
        where: { id },
        data: {
          nama: namaFinal,
          catatan: catatan !== undefined ? String(catatan).trim() : existing.catatan,
        },
      })

      // Cascade rename: bahan dengan kategori lama ikut berubah (field master, bukan transaksi).
      if (namaFinal !== existing.nama) {
        await tx.stockMaterial.updateMany({
          where: { userId: existing.userId, kategori: existing.nama },
          data: { kategori: namaFinal },
        })
      }

      return row
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('Error updating stock kategori:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to update stock kategori') },
      { status: 500 }
    )
  }
}

// DELETE — hapus kategori; ditolak bila masih dipakai bahan manapun.
export async function DELETE(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const id = request.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID kategori wajib diisi' }, { status: 400 })

    const existing = await db.stockKategori.findUnique({ where: { id } })
    if (!existing || !canAccessRecord(user, existing.userId)) {
      return NextResponse.json({ error: 'Kategori tidak ditemukan' }, { status: 404 })
    }

    const dipakai = await db.stockMaterial.count({
      where: { userId: existing.userId, kategori: existing.nama },
    })
    if (dipakai > 0) {
      return NextResponse.json(
        {
          error: `Kategori "${existing.nama}" masih dipakai ${dipakai} bahan. Pindahkan bahan ke kategori lain terlebih dahulu.`,
          dipakai,
        },
        { status: 409 }
      )
    }

    await db.stockKategori.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting stock kategori:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to delete stock kategori') },
      { status: 500 }
    )
  }
}
