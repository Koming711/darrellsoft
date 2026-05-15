import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// GET all invoices
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
        { invoiceNumber: { contains: search } },
      ]
    }

    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(invoices)
  } catch (error) {
    console.error('GET /api/invoices error:', error)
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 })
  }
}

// POST create invoice
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      customerName,
      customerAddress,
      customerPhone,
      customerEmail,
      invoiceDate,
      dueDate,
      items,
      subTotal,
      discount,
      tax,
      grandTotal,
      notes,
      status,
      riwayatCetakanId,
      userId,
    } = body

    // Generate invoice number
    const count = await prisma.invoice.count()
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const invoiceNumber = `INV-${year}${month}-${String(count + 1).padStart(4, '0')}`

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        customerName: customerName || '',
        customerAddress: customerAddress || '',
        customerPhone: customerPhone || '',
        customerEmail: customerEmail || '',
        invoiceDate: invoiceDate || '',
        dueDate: dueDate || '',
        items: JSON.stringify(items || []),
        subTotal: subTotal || 0,
        discount: discount || 0,
        tax: tax || 0,
        grandTotal: grandTotal || 0,
        notes: notes || '',
        status: status || 'draft',
        riwayatCetakanId: riwayatCetakanId || null,
        userId: userId || null,
      },
    })

    return NextResponse.json(invoice)
  } catch (error) {
    console.error('POST /api/invoices error:', error)
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 })
  }
}
