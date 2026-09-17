import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

// GET /api/master-kertas — daftar Master Kertas (papers)
export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const where: Record<string, unknown> = await getDataFilter(user)
    if (status) where.status = status

    const papers = await db.masterKertas.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(papers, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error: unknown) {
    console.error('Error fetching master kertas:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal mengambil data Master Kertas') },
      { status: 500 }
    )
  }
}

// POST /api/master-kertas — tambah Master Kertas
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const { name, width, height, price, unit, status } = body

    // Validasi sederhana
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: 'Nama kertas wajib diisi' }, { status: 400 })
    }
    if (!(parseFloat(width) > 0) || !(parseFloat(height) > 0)) {
      return NextResponse.json({ error: 'Ukuran harus lebih dari 0' }, { status: 400 })
    }
    if (parseFloat(price) < 0) {
      return NextResponse.json({ error: 'Harga tidak boleh negatif' }, { status: 400 })
    }

    const paper = await db.masterKertas.create({
      data: {
        name: String(name).trim(),
        width: parseFloat(width),
        height: parseFloat(height),
        price: parseFloat(price) || 0,
        unit: unit || 'lembar',
        status: status || 'aktif',
        userId: user?.id || null,
      },
    })

    return NextResponse.json(paper, { status: 201 })
  } catch (error: unknown) {
    console.error('Error creating master kertas:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal menambah Master Kertas') },
      { status: 500 }
    )
  }
}
