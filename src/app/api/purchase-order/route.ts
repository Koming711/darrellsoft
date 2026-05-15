import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET all purchase orders
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''

    const where: any = {}
    if (status && status !== 'all') where.status = status
    if (search) {
      where.OR = [
        { supplierName: { contains: search } },
        { poNumber: { contains: search } },
      ]
    }

    const purchaseOrders = await db.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(purchaseOrders)
  } catch (error) {
    console.error('GET /api/purchase-order error:', error)
    return NextResponse.json({ error: 'Failed to fetch purchase orders' }, { status: 500 })
  }
}

// POST create purchase order
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      supplierName,
      supplierAddress,
      supplierPhone,
      orderDate,
      deliveryDate,
      items,
      subtotal,
      tax,
      total,
      notes,
      status,
      userId,
    } = body

    // Generate PO number
    const count = await db.purchaseOrder.count()
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const poNumber = `PO-${year}${month}-${String(count + 1).padStart(4, '0')}`

    const purchaseOrder = await db.purchaseOrder.create({
      data: {
        poNumber,
        supplierName: supplierName || '',
        supplierAddress: supplierAddress || '',
        supplierPhone: supplierPhone || '',
        orderDate: orderDate || '',
        deliveryDate: deliveryDate || '',
        items: typeof items === 'string' ? items : JSON.stringify(items || []),
        subtotal: subtotal || 0,
        tax: tax || 0,
        total: total || 0,
        notes: notes || '',
        status: status || 'draft',
        userId: userId || null,
      },
    })

    return NextResponse.json(purchaseOrder)
  } catch (error) {
    console.error('POST /api/purchase-order error:', error)
    return NextResponse.json({ error: 'Failed to create purchase order' }, { status: 500 })
  }
}
