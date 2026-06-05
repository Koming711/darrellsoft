import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'

export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const riwayat = await db.riwayatOngkosCetak.findMany({
      where: await getDataFilter(user),
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(riwayat)
  } catch (error) {
    console.error('Error fetching riwayat ongkos cetak:', error)
    return NextResponse.json({ error: 'Failed to fetch riwayat' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()

    const riwayat = await db.riwayatOngkosCetak.create({
      data: {
        namaCustomer: body.namaCustomer || '',
        namaCetakan: body.namaCetakan || '',
        machineName: body.machineName || '',
        machineId: body.machineId || '',
        jumlahWarna: body.jumlahWarna || '0',
        warnaKhusus: body.warnaKhusus || '0',
        hargaPlat: body.hargaPlat || '0',
        jumlahLembar: body.jumlahLembar || '0',
        totalOngkosCetak: body.totalOngkosCetak || 0,
        hargaPerLembar: body.hargaPerLembar || 0,
        machineId2: body.machineId2 || '',
        machineName2: body.machineName2 || '',
        jumlahWarna2: body.jumlahWarna2 || '0',
        warnaKhusus2: body.warnaKhusus2 || '0',
        hargaPlat2: body.hargaPlat2 || '0',
        totalOngkosCetak2: body.totalOngkosCetak2 || 0,
        userId: user?.id || null,
      }
    })

    return NextResponse.json(riwayat, { status: 201 })
  } catch (error) {
    console.error('Error creating riwayat ongkos cetak:', error)
    return NextResponse.json({ error: 'Failed to save riwayat' }, { status: 500 })
  }
}
