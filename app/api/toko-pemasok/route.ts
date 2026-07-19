import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const tokoPemasok = await db.tokoPemasok.findMany({
      where: await getDataFilter(user),
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(tokoPemasok, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    })
  } catch (error: any) {
    console.error('Error fetching toko pemasok:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to fetch toko pemasok') },
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
    const { namaToko, jenisBarang, kontak, alamat } = body

    if (!namaToko) {
      return NextResponse.json(
        { error: 'Nama toko wajib diisi' },
        { status: 400 }
      )
    }

    const tokoPemasok = await db.tokoPemasok.create({
      data: {
        namaToko,
        jenisBarang: jenisBarang || '',
        kontak: kontak || '',
        alamat: alamat || '',
        userId: user?.id || null
      }
    })

    return NextResponse.json(tokoPemasok, { status: 201 })
  } catch (error: any) {
    console.error('Error creating toko pemasok:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to create toko pemasok') },
      { status: 500 }
    )
  }
}
