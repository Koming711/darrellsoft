import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth } from '@/lib/server-auth'
import { validatePhotoDataUrl } from '@/lib/image-compress'

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

    const item = await db.riwayatPotongKertas.findUnique({ where: { id } })
    if (!item) {
      return NextResponse.json({ error: 'Riwayat tidak ditemukan' }, { status: 404 })
    }

    if (item.userId !== user.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    const updated = await db.riwayatPotongKertas.update({
      where: { id },
      data: {
        namaCustomer: body.namaCustomer ?? item.namaCustomer,
        namaCetakan: body.namaCetakan ?? item.namaCetakan,
        paperName: body.paperName ?? item.paperName,
        paperId: body.paperId ?? item.paperId,
        grammage: body.grammage ?? item.grammage,
        paperWidth: body.paperWidth ?? item.paperWidth,
        paperHeight: body.paperHeight ?? item.paperHeight,
        cutWidth: body.cutWidth ?? item.cutWidth,
        cutHeight: body.cutHeight ?? item.cutHeight,
        quantity: body.quantity ?? item.quantity,
        setelanKertas: body.setelanKertas ?? item.setelanKertas,
        sheetsNeeded: body.sheetsNeeded ?? item.sheetsNeeded,
        totalPrice: body.totalPrice ?? item.totalPrice,
        pricePerSheet: body.pricePerSheet ?? item.pricePerSheet,
        efficiency: body.efficiency ?? item.efficiency,
        strategy: body.strategy ?? item.strategy,
        jumlahPesanan: body.jumlahPesanan ?? item.jumlahPesanan,
        berapaMata: body.berapaMata ?? item.berapaMata,
        resultData: body.resultData ?? item.resultData,
        photoUrl: body.photoUrl === undefined ? item.photoUrl : validatePhotoDataUrl(body.photoUrl),
      }
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating riwayat potong kertas:', error)
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

    const item = await db.riwayatPotongKertas.findUnique({ where: { id } })
    if (!item) {
      return NextResponse.json({ error: 'Riwayat tidak ditemukan' }, { status: 404 })
    }

    // Strict ownership: only the owner can delete their own records.
    // Pengecualian: catatan YATIM (pemilik sudah dihapus / tanpa pemilik)
    // boleh dibersihkan oleh user login mana pun — tanpa ini catatan tidak
    // pernah bisa dihapus siapa pun.
    if (item.userId !== user.id) {
      let orphaned = !item.userId
      if (!orphaned) {
        const owner = await db.pengguna.findUnique({ where: { id: item.userId }, select: { id: true } })
        orphaned = !owner
      }
      if (!orphaned) {
        return NextResponse.json({ error: 'Riwayat ini milik akun lain' }, { status: 403 })
      }
    }

    await db.riwayatPotongKertas.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting riwayat potong kertas:', error)
    return NextResponse.json({ error: 'Gagal menghapus' }, { status: 500 })
  }
}
