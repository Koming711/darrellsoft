import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'
import { generateDocNumber } from '@/lib/doc-number'

// GET all surat jalan (per-user isolation)
export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const authErr = requireAuth(request)
    if (authErr) return authErr

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''

    const dataFilter = await getDataFilter(user)
    const where: any = { ...dataFilter }
    if (status && status !== 'all') where.status = status
    if (search) {
      where.OR = [
        { customerName: { contains: search } },
        { suratJalanNumber: { contains: search } },
      ]
    }

    const suratJalanList = await db.suratJalan.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(suratJalanList)
  } catch (error) {
    console.error('GET /api/surat-jalan error:', error)
    return NextResponse.json({ error: 'Failed to fetch surat jalan' }, { status: 500 })
  }
}

// POST create surat jalan (auto-assign userId from auth)
export async function POST(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const authErr = requireAuth(request)
    if (authErr) return authErr

    const body = await request.json()
    const {
      customerName,
      customerAddress,
      customerPhone,
      driverName,
      vehicleNumber,
      deliveryDate,
      items,
      notes,
      status,
      invoiceId,
      riwayatCetakanId,
    } = body

    // Generate sequential surat jalan number (never reuses deleted numbers)
    const dataFilter = await getDataFilter(user)
    const suratJalanNumber = await generateDocNumber('suratJalan', 'suratJalanNumber', 'SJ', dataFilter)

    const suratJalan = await db.suratJalan.create({
      data: {
        suratJalanNumber,
        customerName: customerName || '',
        customerAddress: customerAddress || '',
        customerPhone: customerPhone || '',
        driverName: driverName || '',
        vehicleNumber: vehicleNumber || '',
        deliveryDate: deliveryDate || '',
        items: JSON.stringify(items || []),
        notes: notes || '',
        status: status || 'draft',
        invoiceId: invoiceId || null,
        riwayatCetakanId: riwayatCetakanId || null,
        userId: user!.id,
      },
    })

    return NextResponse.json(suratJalan)
  } catch (error) {
    console.error('POST /api/surat-jalan error:', error)
    return NextResponse.json({ error: 'Failed to create surat jalan' }, { status: 500 })
  }
}
