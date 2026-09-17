import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

// GET /api/master-kertas/[id] — detail
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const { id } = await params
    const paper = await db.masterKertas.findUnique({ where: { id } })

    if (!paper) {
      return NextResponse.json({ error: 'Data kertas tidak ditemukan' }, { status: 404 })
    }
    if (paper.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    return NextResponse.json(paper)
  } catch (error: unknown) {
    console.error('Error fetching master kertas:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal mengambil detail kertas') },
      { status: 500 }
    )
  }
}

// PUT /api/master-kertas/[id] — edit
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
    const { name, width, height, price, unit, status } = body

    const existing = await db.masterKertas.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Data kertas tidak ditemukan' }, { status: 404 })
    }
    if (existing.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

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

    const paper = await db.masterKertas.update({
      where: { id },
      data: {
        name: String(name).trim(),
        width: parseFloat(width),
        height: parseFloat(height),
        price: parseFloat(price) || 0,
        unit: unit || existing.unit,
        status: status || existing.status,
      },
    })

    return NextResponse.json(paper)
  } catch (error: unknown) {
    console.error('Error updating master kertas:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal mengubah Master Kertas') },
      { status: 500 }
    )
  }
}

// DELETE /api/master-kertas/[id] — hapus
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const { id } = await params

    const existing = await db.masterKertas.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Data kertas tidak ditemukan' }, { status: 404 })
    }
    if (existing.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    await db.masterKertas.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Error deleting master kertas:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal menghapus Master Kertas') },
      { status: 500 }
    )
  }
}
