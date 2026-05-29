import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'

// GET all invoices (per-user isolation)
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
        { invoiceNumber: { contains: search } },
      ]
    }

    const invoices = await db.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(invoices)
  } catch (error) {
    console.error('GET /api/invoices error:', error)
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 })
  }
}

// POST create invoice (auto-assign userId from auth)
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
    } = body

    // Generate invoice number (scoped per-user for uniqueness)
    const dataFilter = await getDataFilter(user)
    const count = await db.invoice.count({ where: dataFilter })
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const invoiceNumber = `INV-${year}${month}-${String(count + 1).padStart(4, '0')}`

    const invoice = await db.invoice.create({
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
        userId: user!.id,
      },
    })

    return NextResponse.json(invoice)
  } catch (error) {
    console.error('POST /api/invoices error:', error)
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 })
  }
}
