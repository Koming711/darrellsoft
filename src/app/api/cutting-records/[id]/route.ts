import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

// GET /api/cutting-records/[id] — detail
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const { id } = await params
    const record = await db.cuttingRecord.findUnique({ where: { id } })

    if (!record) {
      return NextResponse.json({ error: 'Riwayat potong tidak ditemukan' }, { status: 404 })
    }
    if (record.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    return NextResponse.json(record)
  } catch (error: unknown) {
    console.error('Error fetching cutting record:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal mengambil detail riwayat') },
      { status: 500 }
    )
  }
}

// PUT /api/cutting-records/[id] — edit
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const { id } = await params
    const body = await request.json()
    const {
      paperId, paperName, paperWidth, paperHeight,
      cutWidth, cutHeight, quantity,
      piecesPerSheet, sheetsNeeded, waste, efficiency, rotation,
      pricePerSheet, totalCost,
    } = body

    const existing = await db.cuttingRecord.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Riwayat potong tidak ditemukan' }, { status: 404 })
    }
    if (existing.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

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

    const record = await db.cuttingRecord.update({
      where: { id },
      data: {
        paperId: paperId !== undefined ? String(paperId) : existing.paperId,
        paperName: paperName !== undefined ? String(paperName).trim() : existing.paperName,
        paperWidth: parseFloat(paperWidth),
        paperHeight: parseFloat(paperHeight),
        cutWidth: parseFloat(cutWidth),
        cutHeight: parseFloat(cutHeight),
        quantity: parseInt(quantity) || 0,
        piecesPerSheet: parseInt(piecesPerSheet) || 0,
        sheetsNeeded: parseInt(sheetsNeeded) || 0,
        waste: parseFloat(waste) || 0,
        efficiency: parseFloat(efficiency) || 0,
        rotation: rotation || existing.rotation,
        pricePerSheet: parseFloat(pricePerSheet) || 0,
        totalCost: parseFloat(totalCost) || 0,
      },
    })

    return NextResponse.json(record)
  } catch (error: unknown) {
    console.error('Error updating cutting record:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal mengubah riwayat potong') },
      { status: 500 }
    )
  }
}

// DELETE /api/cutting-records/[id] — hapus
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const { id } = await params

    const existing = await db.cuttingRecord.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Riwayat potong tidak ditemukan' }, { status: 404 })
    }
    if (existing.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    await db.cuttingRecord.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Error deleting cutting record:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal menghapus riwayat potong') },
      { status: 500 }
    )
  }
}
