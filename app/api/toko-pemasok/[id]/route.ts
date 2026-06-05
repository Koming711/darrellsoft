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
    const tokoPemasok = await db.tokoPemasok.findUnique({
      where: { id }
    })

    if (!tokoPemasok) {
      return NextResponse.json(
        { error: 'Toko pemasok not found' },
        { status: 404 }
      )
    }

    if (tokoPemasok.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    return NextResponse.json(tokoPemasok)
  } catch (error) {
    console.error('Error fetching toko pemasok:', error)
    return NextResponse.json(
      { error: 'Failed to fetch toko pemasok' },
      { status: 500 }
    )
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

    const existing = await db.tokoPemasok.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Toko pemasok not found' }, { status: 404 })
    }

    if (existing.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    const body = await request.json()
    const { namaToko, jenisBarang, kontak, alamat } = body

    const tokoPemasok = await db.tokoPemasok.update({
      where: { id },
      data: {
        namaToko,
        jenisBarang: jenisBarang || '',
        kontak: kontak || '',
        alamat: alamat || ''
      }
    })

    return NextResponse.json(tokoPemasok)
  } catch (error) {
    console.error('Error updating toko pemasok:', error)
    return NextResponse.json(
      { error: 'Failed to update toko pemasok' },
      { status: 500 }
    )
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

    const existing = await db.tokoPemasok.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Toko pemasok not found' }, { status: 404 })
    }

    if (existing.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    await db.tokoPemasok.delete({
      where: { id }
    })

    return NextResponse.json({ message: 'Toko pemasok deleted successfully' })
  } catch (error) {
    console.error('Error deleting toko pemasok:', error)
    return NextResponse.json(
      { error: 'Failed to delete toko pemasok' },
      { status: 500 }
    )
  }
}
