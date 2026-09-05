import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth, canAccessRecord } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/** PUT /api/barang/[id] — update nama/modal/jual/keterangan of a barang (owner only) */
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
    const { nama, modal, jual, keterangan } = body

    const existing = await db.barang.findUnique({ where: { id } })
    if (!existing || !canAccessRecord(user, existing.userId)) {
      return NextResponse.json({ error: 'Barang tidak ditemukan' }, { status: 404 })
    }

    const updated = await db.barang.update({
      where: { id },
      data: {
        nama: nama !== undefined ? String(nama).trim() : existing.nama,
        modal: modal !== undefined ? Number(modal) || 0 : existing.modal,
        jual: jual !== undefined ? Number(jual) || 0 : existing.jual,
        keterangan: keterangan !== undefined ? String(keterangan) : existing.keterangan,
      },
      include: {
        registrations: {
          include: { customer: { select: { id: true, name: true, companyName: true } } },
        },
      },
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('Error updating barang:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to update barang') },
      { status: 500 }
    )
  }
}

/** DELETE /api/barang/[id] — delete a barang and its customer registrations (owner only) */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const { id } = await params

    const existing = await db.barang.findUnique({ where: { id } })
    if (!existing || !canAccessRecord(user, existing.userId)) {
      return NextResponse.json({ error: 'Barang tidak ditemukan' }, { status: 404 })
    }

    await db.barang.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting barang:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to delete barang') },
      { status: 500 }
    )
  }
}
