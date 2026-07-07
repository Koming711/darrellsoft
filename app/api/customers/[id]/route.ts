import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth } from '@/lib/server-auth'

/**
 * Check if a user has no more master data across all 4 tables.
 * If all empty, set master_cleared flag to prevent auto-reseed.
 */
async function checkAndSetMasterCleared(userId: string): Promise<void> {
  const [papers, costs, finishings, customers] = await Promise.all([
    db.paper.count({ where: { userId } }),
    db.printingCost.count({ where: { userId } }),
    db.finishing.count({ where: { userId } }),
    db.customer.count({ where: { userId } }),
  ])
  if (papers === 0 && costs === 0 && finishings === 0 && customers === 0) {
    await db.setting.upsert({
      where: { key: `master_cleared_${userId}` },
      update: { value: 'true' },
      create: { key: `master_cleared_${userId}`, value: 'true' },
    })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const { id } = await params
    const customer = await db.customer.findUnique({
      where: { id }
    })

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      )
    }

    // Strict ownership: only the owner can access their own records
    if (customer.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    return NextResponse.json(customer)
  } catch (error) {
    console.error('Error fetching customer:', error)
    return NextResponse.json(
      { error: 'Failed to fetch customer' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const { id } = await params

    const existing = await db.customer.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    // Strict ownership: only the owner can edit their own records
    if (existing.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    const body = await request.json()
    const { name, companyName, address, phone, email } = body

    const customer = await db.customer.update({
      where: { id },
      data: {
        name,
        companyName: companyName || null,
        address,
        phone,
        email
      }
    })

    return NextResponse.json(customer)
  } catch (error) {
    console.error('Error updating customer:', error)
    return NextResponse.json(
      { error: 'Failed to update customer' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const { id } = await params

    const existing = await db.customer.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    // Strict ownership: only the owner can delete their own records
    if (existing.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    await db.customer.delete({
      where: { id }
    })

    // If user has no more master data, set master_cleared flag to prevent auto-reseed
    await checkAndSetMasterCleared(user.id)

    return NextResponse.json({ message: 'Customer deleted successfully' })
  } catch (error) {
    console.error('Error deleting customer:', error)
    return NextResponse.json(
      { error: 'Failed to delete customer' },
      { status: 500 }
    )
  }
}
