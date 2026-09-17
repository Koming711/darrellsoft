import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

// GET /api/cutting-records — daftar riwayat potong kertas
export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim()
    const paperName = searchParams.get('paperName')?.trim()

    const where: Record<string, unknown> = await getDataFilter(user)
    if (paperName) where.paperName = paperName
    if (search) {
      where.OR = [
        { paperName: { contains: search } },
        { cutWidth: { contains: search } },
      ]
    }

    const records = await db.cuttingRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(records, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error: unknown) {
    console.error('Error fetching cutting records:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal mengambil riwayat potong kertas') },
      { status: 500 }
    )
  }
}

// POST /api/cutting-records — simpan hasil potong
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const {
      paperId, paperName, paperWidth, paperHeight,
      cutWidth, cutHeight, quantity,
      piecesPerSheet, sheetsNeeded, waste, efficiency, rotation,
      pricePerSheet, totalCost,
    } = body

    // Validasi
    if (!(parseFloat(paperWidth) > 0) || !(parseFloat(paperHeight) > 0)) {
      return NextResponse.json({ error: 'Ukuran kertas harus lebih dari 0' }, { status: 400 })
    }
    if (!(parseFloat(cutWidth) > 0) || !(parseFloat(cutHeight) > 0)) {
      return NextResponse.json({ error: 'Ukuran potong harus lebih dari 0' }, { status: 400 })
    }
    if (!(parseInt(quantity) > 0)) {
      return NextResponse.json({ error: 'Jumlah pesanan harus lebih dari 0' }, { status: 400 })
    }

    const record = await db.cuttingRecord.create({
      data: {
        paperId: paperId ? String(paperId) : '',
        paperName: paperName ? String(paperName).trim() : '',
        paperWidth: parseFloat(paperWidth),
        paperHeight: parseFloat(paperHeight),
        cutWidth: parseFloat(cutWidth),
        cutHeight: parseFloat(cutHeight),
        quantity: parseInt(quantity) || 0,
        piecesPerSheet: parseInt(piecesPerSheet) || 0,
        sheetsNeeded: parseInt(sheetsNeeded) || 0,
        waste: parseFloat(waste) || 0,
        efficiency: parseFloat(efficiency) || 0,
        rotation: rotation || 'normal',
        pricePerSheet: parseFloat(pricePerSheet) || 0,
        totalCost: parseFloat(totalCost) || 0,
        userId: user?.id || null,
      },
    })

    return NextResponse.json(record, { status: 201 })
  } catch (error: unknown) {
    console.error('Error creating cutting record:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal menyimpan riwayat potong') },
      { status: 500 }
    )
  }
}
