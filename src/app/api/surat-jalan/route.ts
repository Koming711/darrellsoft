import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// GET all surat jalan
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''

    const where: any = {}
    if (userId) where.userId = userId
    if (status && status !== 'all') where.status = status
    if (search) {
      where.OR = [
        { customerName: { contains: search } },
        { suratJalanNumber: { contains: search } },
      ]
    }

    const suratJalanList = await prisma.suratJalan.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(suratJalanList)
  } catch (error) {
    console.error('GET /api/surat-jalan error:', error)
    return NextResponse.json({ error: 'Failed to fetch surat jalan' }, { status: 500 })
  }
}

// POST create surat jalan
export async function POST(request: Request) {
  try {
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
      userId,
    } = body

    // Generate surat jalan number
    const count = await prisma.suratJalan.count()
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const suratJalanNumber = `SJ-${year}${month}-${String(count + 1).padStart(4, '0')}`

    const suratJalan = await prisma.suratJalan.create({
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
        userId: userId || null,
      },
    })

    return NextResponse.json(suratJalan)
  } catch (error) {
    console.error('POST /api/surat-jalan error:', error)
    return NextResponse.json({ error: 'Failed to create surat jalan' }, { status: 500 })
  }
}
