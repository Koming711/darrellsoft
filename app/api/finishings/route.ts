import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'

// GET all finishings
export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const finishings = await db.finishing.findMany({
      where: await getDataFilter(user),
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json(finishings, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    })
  } catch (error) {
    console.error('Error fetching finishings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch finishings' },
      { status: 500 }
    )
  }
}

// POST create finishing
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const { name, minimumSheets, minimumPrice, additionalPrice, pricePerCm } = body

    if (!name || minimumSheets === undefined || minimumPrice === undefined || additionalPrice === undefined || pricePerCm === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const finishing = await db.finishing.create({
      data: {
        name,
        minimumSheets: parseInt(minimumSheets) || 0,
        minimumPrice: parseFloat(minimumPrice) || 0,
        additionalPrice: parseFloat(additionalPrice) || 0,
        pricePerCm: parseFloat(pricePerCm) || 0,
        userId: user?.id || null,
      }
    })

    return NextResponse.json(finishing, { status: 201 })
  } catch (error) {
    console.error('Error creating finishing:', error)
    return NextResponse.json(
      { error: 'Failed to create finishing' },
      { status: 500 }
    )
  }
}
