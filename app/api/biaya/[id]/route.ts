import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth } from '@/lib/server-auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const { id } = await params
    const biaya = await db.biaya.findUnique({ where: { id } })

    if (!biaya) {
      return NextResponse.json({ error: 'Biaya not found' }, { status: 404 })
    }

    if (biaya.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    return NextResponse.json(biaya)
  } catch (error) {
    console.error('Error fetching biaya:', error)
    return NextResponse.json({ error: 'Failed to fetch biaya' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const { id } = await params

    const existing = await db.biaya.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Biaya not found' }, { status: 404 })
    }

    if (existing.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    const body = await request.json()
    const { tanggal, kategori, keterangan, jumlah, metodePembayaran, supplier } = body

    if (!tanggal) {
      return NextResponse.json({ error: 'Tanggal wajib diisi' }, { status: 400 })
    }
    if (!kategori || !kategori.trim()) {
      return NextResponse.json({ error: 'Kategori wajib diisi' }, { status: 400 })
    }
    if (jumlah === undefined || jumlah === null || isNaN(Number(jumlah))) {
      return NextResponse.json({ error: 'Jumlah biaya wajib diisi' }, { status: 400 })
    }

    const biaya = await db.biaya.update({
      where: { id },
      data: {
        tanggal,
        kategori: kategori.trim(),
        keterangan: keterangan || '',
        jumlah: Number(jumlah),
        metodePembayaran: metodePembayaran || 'Tunai',
        supplier: supplier || ''
      }
    })

    return NextResponse.json(biaya)
  } catch (error) {
    console.error('Error updating biaya:', error)
    return NextResponse.json({ error: 'Failed to update biaya' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const { id } = await params

    const existing = await db.biaya.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Biaya not found' }, { status: 404 })
    }

    if (existing.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    await db.biaya.delete({ where: { id } })

    return NextResponse.json({ message: 'Biaya deleted successfully' })
  } catch (error) {
    console.error('Error deleting biaya:', error)
    return NextResponse.json({ error: 'Failed to delete biaya' }, { status: 500 })
  }
}
