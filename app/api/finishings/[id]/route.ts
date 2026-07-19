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

// GET single finishing
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const { id } = await params
    const finishing = await db.finishing.findUnique({
      where: { id }
    })

    if (!finishing) {
      return NextResponse.json({ error: 'Finishing not found' }, { status: 404 })
    }

    // Strict ownership: only the owner can access their own records
    if (finishing.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    return NextResponse.json(finishing)
  } catch (error) {
    console.error('Error fetching finishing:', error)
    return NextResponse.json({ error: 'Failed to fetch finishing' }, { status: 500 })
  }
}

// PUT update finishing
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const { id } = await params

    const existing = await db.finishing.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Finishing not found' }, { status: 404 })
    }

    // Strict ownership: only the owner can edit their own records
    if (existing.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    const body = await request.json()
    const { name, minimumSheets, minimumPrice, additionalPrice, pricePerCm } = body

    const finishing = await db.finishing.update({
      where: { id },
      data: {
        name,
        minimumSheets: parseFloat(minimumSheets) || 0,
        minimumPrice: parseFloat(minimumPrice) || 0,
        additionalPrice: parseFloat(additionalPrice) || 0,
        pricePerCm: parseFloat(pricePerCm) || 0
      }
    })

    return NextResponse.json(finishing)
  } catch (error) {
    console.error('Error updating finishing:', error)
    return NextResponse.json({ error: 'Failed to update finishing' }, { status: 500 })
  }
}

// DELETE finishing
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const { id } = await params

    const existing = await db.finishing.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Finishing not found' }, { status: 404 })
    }

    // Strict ownership: only the owner can delete their own records
    if (existing.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    await db.finishing.delete({
      where: { id }
    })

    // If user has no more master data, set master_cleared flag to prevent auto-reseed
    await checkAndSetMasterCleared(user.id)

    return NextResponse.json({ message: 'Finishing deleted successfully' })
  } catch (error) {
    console.error('Error deleting finishing:', error)
    return NextResponse.json({ error: 'Failed to delete finishing' }, { status: 500 })
  }
}
