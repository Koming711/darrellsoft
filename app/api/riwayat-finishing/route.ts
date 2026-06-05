import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'

export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const riwayat = await db.riwayatFinishing.findMany({
      where: await getDataFilter(user),
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(riwayat)
  } catch (error) {
    console.error('Error fetching riwayat finishing:', error)
    return NextResponse.json({ error: 'Failed to fetch riwayat' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()

    const riwayat = await db.riwayatFinishing.create({
      data: {
        namaCustomer: body.namaCustomer || '',
        namaCetakan: body.namaCetakan || '',
        jumlahLembar: body.jumlahLembar || '0',
        lebarCm: body.lebarCm || '0',
        tinggiCm: body.tinggiCm || '0',
        finishingNames: body.finishingNames || '',
        finishingIds: body.finishingIds || '',
        totalCost: body.totalCost || 0,
        hargaPerLembar: body.hargaPerLembar || 0,
        userId: user?.id || null,
      }
    })

    return NextResponse.json(riwayat, { status: 201 })
  } catch (error) {
    console.error('Error creating riwayat finishing:', error)
    return NextResponse.json({ error: 'Failed to save riwayat' }, { status: 500 })
  }
}
