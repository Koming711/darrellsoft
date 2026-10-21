import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * PUT /api/customer-items/[id]  — update barang (hanya pemilik).
 * Body: { name?, satuan?, harga? }
 * id = id registrasi BarangCustomer. `harga` mengubah harga khusus customer;
 * `name`/`satuan` mengubah master Barang terkait (dipakai-ulang antar customer).
 */

/** Registrasi BarangCustomer (+ barang) → bentuk flat yang dikonsumsi UI. */
function toFlat(reg: {
  id: string
  customerId: string
  barangId: string
  price: number
  userId: string | null
  createdAt: Date
  barang: { nama: string; satuan: string } | null
}) {
  return {
    id: reg.id,
    customerId: reg.customerId,
    barangId: reg.barangId,
    name: reg.barang?.nama ?? '',
    satuan: reg.barang?.satuan ?? 'pcs',
    harga: reg.price,
    userId: reg.userId,
    createdAt: reg.createdAt,
  }
}

/** Muat registrasi + verifikasi pemilik via customer.userId (strict per-user isolation). */
async function findOwned(id: string, userId: string) {
  return db.barangCustomer.findUnique({
    where: { id },
    include: { customer: { select: { userId: true } } },
  })
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

    const existing = await findOwned(id, user.id)
    if (!existing) {
      return NextResponse.json({ error: 'Barang tidak ditemukan' }, { status: 404 })
    }
    if (existing.customer?.userId !== user.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    const body = await request.json()
    const { name, satuan, harga } = body

    const barangData: { nama?: string; satuan?: string } = {}
    if (name !== undefined && String(name).trim() !== '') barangData.nama = String(name).trim()
    if (satuan !== undefined && String(satuan).trim() !== '') barangData.satuan = String(satuan).trim() || 'pcs'
    const priceData: { price?: number } = {}
    if (harga !== undefined) priceData.price = Number(harga) || 0

    const reg = await db.$transaction(async (tx) => {
      if (Object.keys(barangData).length > 0) {
        await tx.barang.update({ where: { id: existing.barangId }, data: barangData })
      }
      return tx.barangCustomer.update({
        where: { id },
        data: priceData,
        include: { barang: { select: { nama: true, satuan: true } } },
      })
    })

    return NextResponse.json(toFlat(reg))
  } catch (error: any) {
    console.error('Error updating customer item:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal memperbarui barang') },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/customer-items/[id] — lepaskan barang dari customer (hanya pemilik).
 * Master Barang dipertahankan (dipakai-ulang oleh customer lain / harga standar).
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

    const existing = await findOwned(id, user.id)
    if (!existing) {
      return NextResponse.json({ error: 'Barang tidak ditemukan' }, { status: 404 })
    }
    if (existing.customer?.userId !== user.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    await db.barangCustomer.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting customer item:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal menghapus barang') },
      { status: 500 }
    )
  }
}
