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

    const item = await db.riwayatOngkosCetak.findUnique({ where: { id } })
    if (!item) {
      return NextResponse.json({ error: 'Riwayat tidak ditemukan' }, { status: 404 })
    }

    if (item.userId !== user.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    const updated = await db.riwayatOngkosCetak.update({
      where: { id },
      data: {
        namaCustomer: body.namaCustomer ?? item.namaCustomer,
        namaCetakan: body.namaCetakan ?? item.namaCetakan,
        machineName: body.machineName ?? item.machineName,
        machineId: body.machineId ?? item.machineId,
        jumlahWarna: body.jumlahWarna ?? item.jumlahWarna,
        warnaKhusus: body.warnaKhusus ?? item.warnaKhusus,
        hargaPlat: body.hargaPlat ?? item.hargaPlat,
        jumlahLembar: body.jumlahLembar ?? item.jumlahLembar,
        totalOngkosCetak: body.totalOngkosCetak ?? item.totalOngkosCetak,
        hargaPerLembar: body.hargaPerLembar ?? item.hargaPerLembar,
        machineId2: body.machineId2 ?? item.machineId2,
        machineName2: body.machineName2 ?? item.machineName2,
        jumlahWarna2: body.jumlahWarna2 ?? item.jumlahWarna2,
        warnaKhusus2: body.warnaKhusus2 ?? item.warnaKhusus2,
        hargaPlat2: body.hargaPlat2 ?? item.hargaPlat2,
        totalOngkosCetak2: body.totalOngkosCetak2 ?? item.totalOngkosCetak2,
      }
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating riwayat ongkos cetak:', error)
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

    const item = await db.riwayatOngkosCetak.findUnique({ where: { id } })
    if (!item) {
      return NextResponse.json({ error: 'Riwayat tidak ditemukan' }, { status: 404 })
    }

    if (item.userId !== user.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    await db.riwayatOngkosCetak.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting riwayat ongkos cetak:', error)
    return NextResponse.json({ error: 'Gagal menghapus' }, { status: 500 })
  }
}
