import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'
import { generateDocNumber } from '@/lib/doc-number'

export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const dataFilter = await getDataFilter(user)
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    // If an ID is provided, fetch a single specific record
    if (id) {
      const riwayat = await db.riwayatPotongKertas.findFirst({
        where: { id, ...dataFilter }
      })
      if (!riwayat) {
        return NextResponse.json({ error: 'Riwayat not found' }, { status: 404 })
      }
      return NextResponse.json(riwayat)
    }

    // Otherwise fetch all records
    const riwayat = await db.riwayatPotongKertas.findMany({
      where: dataFilter,
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(riwayat)
  } catch (error) {
    console.error('Error fetching riwayat potong kertas:', error)
    return NextResponse.json({ error: 'Failed to fetch riwayat' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()

    // Generate sequential number (never reuses deleted numbers)
    const dataFilter = await getDataFilter(user)
    const nomorUrut = await generateDocNumber('riwayatPotongKertas', 'nomorUrut', 'PK', dataFilter)

    const riwayat = await db.riwayatPotongKertas.create({
      data: {
        nomorUrut,
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
    return NextResponse.json({ error: 'Failed to save riwayat' }, { status: 500 })
  }
}
