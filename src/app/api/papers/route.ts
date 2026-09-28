import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const papers = await db.paper.findMany({
      where: await getDataFilter(user),
      orderBy: { createdAt: 'desc' },
      include: { kategori: { select: { id: true, nama: true } } }
    })
    return NextResponse.json(papers, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    })
  } catch (error: any) {
    console.error('Error fetching papers:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to fetch papers') },
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
    const { name, grammage, width, height, pricePerRim, kategoriId, suplier } = body

    if (!name || !grammage || !width || !height || !pricePerRim) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      )
    }

    // Kategori opsional — validasi milik user agar tidak menandang FK error
    let validKategoriId: string | null = null
    if (kategoriId) {
      const kategori = await db.kategori.findFirst({
        where: { id: String(kategoriId), userId: user?.id || null }
      })
      if (!kategori) {
        return NextResponse.json(
          { error: 'Kategori tidak ditemukan' },
          { status: 400 }
        )
      }
      validKategoriId = kategori.id
    }

    const paper = await db.paper.create({
      data: {
        name,
        grammage: parseInt(grammage),
        width: parseFloat(width),
        height: parseFloat(height),
        pricePerRim: parseFloat(pricePerRim),
        kategoriId: validKategoriId,
        suplier: suplier ? String(suplier).trim() || null : null,
        userId: user?.id || null,
      },
      include: { kategori: { select: { id: true, nama: true } } }
    })

    return NextResponse.json(paper, { status: 201 })
  } catch (error: any) {
    console.error('Error creating paper:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to create paper') },
      { status: 500 }
    )
  }
}
