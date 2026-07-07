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

    const item = await db.riwayatFinishing.findUnique({ where: { id } })
    if (!item) {
      return NextResponse.json({ error: 'Riwayat tidak ditemukan' }, { status: 404 })
    }

    if (item.userId !== user.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    const updated = await db.riwayatFinishing.update({
      where: { id },
      data: {
        namaCustomer: body.namaCustomer ?? item.namaCustomer,
        namaCetakan: body.namaCetakan ?? item.namaCetakan,
        jumlahLembar: body.jumlahLembar ?? item.jumlahLembar,
        lebarCm: body.lebarCm ?? item.lebarCm,
        tinggiCm: body.tinggiCm ?? item.tinggiCm,
        finishingNames: body.finishingNames ?? item.finishingNames,
        finishingIds: body.finishingIds ?? item.finishingIds,
        totalCost: body.totalCost ?? item.totalCost,
        hargaPerLembar: body.hargaPerLembar ?? item.hargaPerLembar,
      }
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating riwayat finishing:', error)
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

    const item = await db.riwayatFinishing.findUnique({ where: { id } })
    if (!item) {
      return NextResponse.json({ error: 'Riwayat tidak ditemukan' }, { status: 404 })
    }

    if (item.userId !== user.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    await db.riwayatFinishing.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting riwayat finishing:', error)
    return NextResponse.json({ error: 'Gagal menghapus' }, { status: 500 })
  }
}
