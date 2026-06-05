import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'

export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const customers = await db.customer.findMany({
      where: await getDataFilter(user),
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(customers, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    })
  } catch (error: any) {
    console.error('Error fetching customers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch customers', details: error?.message },
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
    const { name, companyName, address, phone, email } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Nama customer wajib diisi' },
        { status: 400 }
      )
    }

    const customer = await db.customer.create({
      data: { name, companyName: companyName || null, address: address || null, phone: phone || null, email: email || null, userId: user?.id || null }
    })

    return NextResponse.json(customer, { status: 201 })
  } catch (error: any) {
    console.error('Error creating customer:', error)
    return NextResponse.json(
      { error: 'Failed to create customer', details: error?.message },
      { status: 500 }
    )
  }
}
