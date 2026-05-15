import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'

export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const papers = await db.paper.findMany({
      where: await getDataFilter(user),
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(papers, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    })
  } catch (error: any) {
    console.error('Error fetching papers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch papers', details: error?.message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const { name, grammage, width, height, pricePerRim } = body

    if (!name || !grammage || !width || !height || !pricePerRim) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      )
    }

    const paper = await db.paper.create({
      data: {
        name,
        grammage: parseInt(grammage),
        width: parseFloat(width),
        height: parseFloat(height),
        pricePerRim: parseFloat(pricePerRim),
        userId: user?.id || null,
      }
    })

    return NextResponse.json(paper, { status: 201 })
  } catch (error: any) {
    console.error('Error creating paper:', error)
    return NextResponse.json(
      { error: 'Failed to create paper', details: error?.message },
      { status: 500 }
    )
  }
}
