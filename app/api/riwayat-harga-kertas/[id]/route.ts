import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth } from '@/lib/server-auth'

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

    const item = await db.riwayatHargaKertas.findUnique({ where: { id } })
    if (!item) {
      return NextResponse.json({ error: 'Riwayat tidak ditemukan' }, { status: 404 })
    }

    if (item.userId !== user.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    const updated = await db.riwayatHargaKertas.update({
      where: { id },
      data: {
        namaCustomer: body.namaCustomer ?? item.namaCustomer,
        namaCetakan: body.namaCetakan ?? item.namaCetakan,
        paperName: body.paperName ?? item.paperName,
        paperId: body.paperId ?? item.paperId,
        grammage: body.grammage ?? item.grammage,
        paperWidth: body.paperWidth ?? item.paperWidth,
        paperHeight: body.paperHeight ?? item.paperHeight,
        pricePerRim: body.pricePerRim ?? item.pricePerRim,
        quantity: body.quantity ?? item.quantity,
        lebarPotong: body.lebarPotong ?? item.lebarPotong,
        tinggiPotong: body.tinggiPotong ?? item.tinggiPotong,
        totalPrice: body.totalPrice ?? item.totalPrice,
        costPerPiece: body.costPerPiece ?? item.costPerPiece,
      }
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating riwayat harga kertas:', error)
    return NextResponse.json({ error: 'Gagal mengupdate riwayat' }, { status: 500 })
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

    const item = await db.riwayatHargaKertas.findUnique({ where: { id } })
    if (!item) {
      return NextResponse.json({ error: 'Riwayat tidak ditemukan' }, { status: 404 })
    }

    if (item.userId !== user.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    await db.riwayatHargaKertas.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting riwayat harga kertas:', error)
    return NextResponse.json({ error: 'Gagal menghapus' }, { status: 500 })
  }
}
