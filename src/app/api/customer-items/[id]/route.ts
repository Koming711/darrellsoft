import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * PUT /api/customer-items/[id]  — update barang (hanya pemilik).
 * Body: { name?, satuan?, harga? }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const { id } = await params

    const existing = await db.customerItem.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Barang tidak ditemukan' }, { status: 404 })
    }
    if (existing.userId !== user.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    const body = await request.json()
    const { name, satuan, harga } = body

    const item = await db.customerItem.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(satuan !== undefined && { satuan: String(satuan).trim() || 'pcs' }),
        ...(harga !== undefined && { harga: Number(harga) || 0 }),
      },
    })

    return NextResponse.json(item)
  } catch (error: any) {
    console.error('Error updating customer item:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal memperbarui barang') },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/customer-items/[id] — hapus barang (hanya pemilik).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const { id } = await params

    const existing = await db.customerItem.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Barang tidak ditemukan' }, { status: 404 })
    }
    if (existing.userId !== user.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    await db.customerItem.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting customer item:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal menghapus barang') },
      { status: 500 }
    )
  }
}
