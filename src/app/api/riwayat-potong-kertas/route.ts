import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'

export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const riwayat = await db.riwayatPotongKertas.findMany({
      where: await getDataFilter(user),
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(riwayat)
  } catch (error) {
    console.error('Error fetching riwayat potong kertas:', error)
    return NextResponse.json({ error: 'Gagal mengambil riwayat' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()

    const riwayat = await db.riwayatPotongKertas.create({
      data: {
        nomorPotongKertas: body.nomorPotongKertas || '',
        namaCustomer: body.namaCustomer || '',
        namaCetakan: body.namaCetakan || '',
        paperName: body.paperName || '',
        paperId: body.paperId || '',
        grammage: body.grammage || '0',
        paperWidth: body.paperWidth || '0',
        paperHeight: body.paperHeight || '0',
        cutWidth: body.cutWidth || '0',
        cutHeight: body.cutHeight || '0',
        quantity: body.quantity || '0',
        setelanKertas: body.setelanKertas || '0',
        sheetsNeeded: body.sheetsNeeded || '0',
        totalPrice: body.totalPrice || 0,
        pricePerSheet: body.pricePerSheet || 0,
        efficiency: body.efficiency || 0,
        strategy: body.strategy || '',
        jumlahPesanan: body.jumlahPesanan || '',
        berapaMata: body.berapaMata || '',
        resultData: body.resultData || '',
        userId: user?.id || null,
      }
    })

    return NextResponse.json(riwayat, { status: 201 })
  } catch (error) {
    console.error('Error creating riwayat potong kertas:', error)
    return NextResponse.json({ error: 'Gagal menyimpan riwayat potong kertas' }, { status: 500 })
  }
}
