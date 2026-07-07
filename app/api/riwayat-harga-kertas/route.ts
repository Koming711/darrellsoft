import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'

export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const riwayat = await db.riwayatHargaKertas.findMany({
      where: await getDataFilter(user),
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(riwayat)
  } catch (error) {
    console.error('Error fetching riwayat harga kertas:', error)
    return NextResponse.json({ error: 'Failed to fetch riwayat' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()

    const riwayat = await db.riwayatHargaKertas.create({
      data: {
        namaCustomer: body.namaCustomer || '',
        namaCetakan: body.namaCetakan || '',
        paperName: body.paperName || '',
        paperId: body.paperId || '',
        grammage: body.grammage || '0',
        paperWidth: body.paperWidth || '0',
        paperHeight: body.paperHeight || '0',
        pricePerRim: body.pricePerRim || '0',
        quantity: body.quantity || '0',
        lebarPotong: body.lebarPotong || '0',
        tinggiPotong: body.tinggiPotong || '0',
        totalPrice: body.totalPrice || 0,
        costPerPiece: body.costPerPiece || 0,
        userId: user?.id || null,
      }
    })

    return NextResponse.json(riwayat, { status: 201 })
  } catch (error) {
    console.error('Error creating riwayat harga kertas:', error)
    return NextResponse.json({ error: 'Failed to save riwayat' }, { status: 500 })
  }
}
