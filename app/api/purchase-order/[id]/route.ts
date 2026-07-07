import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth, canAccessRecord } from '@/lib/server-auth'

// GET single purchase order
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const { id } = await params
    const purchaseOrder = await db.purchaseOrder.findUnique({ where: { id } })
    if (!purchaseOrder) {
      return NextResponse.json({ error: 'Purchase Order not found' }, { status: 404 })
    }

    // Check ownership
    if (!canAccessRecord(user, purchaseOrder.userId)) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    return NextResponse.json(purchaseOrder)
  } catch (error) {
    console.error('GET /api/purchase-order/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch purchase order' }, { status: 500 })
  }
}

// PUT update purchase order
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const { id } = await params

    // Check ownership first
    const existing = await db.purchaseOrder.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Purchase Order not found' }, { status: 404 })
    }
    if (!canAccessRecord(user, existing.userId)) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    const body = await request.json()
    // Prevent userId from being changed
    delete body.userId

    // Ensure items is stored as string
    if (body.items && typeof body.items !== 'string') {
      body.items = JSON.stringify(body.items)
    }

    const purchaseOrder = await db.purchaseOrder.update({
      where: { id },
      data: body,
    })
    return NextResponse.json(purchaseOrder)
  } catch (error) {
    console.error('PUT /api/purchase-order/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update purchase order' }, { status: 500 })
  }
}

// DELETE purchase order
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const { id } = await params

    // Check ownership first
    const existing = await db.purchaseOrder.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Purchase Order not found' }, { status: 404 })
    }
    if (!canAccessRecord(user, existing.userId)) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    await db.purchaseOrder.delete({ where: { id } })
    return NextResponse.json({ message: 'Purchase Order deleted' })
  } catch (error) {
    console.error('DELETE /api/purchase-order/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete purchase order' }, { status: 500 })
  }
}
