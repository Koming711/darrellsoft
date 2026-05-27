import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth, getDataFilter } from '@/lib/server-auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = getServerUser(request)
    const { id } = await params

    const item = await db.riwayatPotongKertas.findUnique({ where: { id } })
    if (!item) {
      return NextResponse.json({ error: 'Riwayat tidak ditemukan' }, { status: 404 })
    }

    // Check access: must be owner or admin
    const dataFilter = await getDataFilter(user)
    if (dataFilter.userId && item.userId !== dataFilter.userId) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    return NextResponse.json(item)
  } catch (error) {
    console.error('Error fetching riwayat potong kertas:', error)
    return NextResponse.json({ error: 'Gagal mengambil data' }, { status: 500 })
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
        nomorPotongKertas: body.nomorPotongKertas ?? item.nomorPotongKertas,
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

    if (item.userId !== user.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    await db.riwayatPotongKertas.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting riwayat potong kertas:', error)
    return NextResponse.json({ error: 'Gagal menghapus' }, { status: 500 })
  }
}
