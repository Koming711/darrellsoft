import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const biaya = await db.biaya.findMany({
      where: await getDataFilter(user),
      orderBy: { tanggal: 'desc' }
    })
    return NextResponse.json(biaya, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    })
  } catch (error: any) {
    console.error('Error fetching biaya:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to fetch biaya') },
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
    const { tanggal, kategori, keterangan, jumlah, metodePembayaran, supplier } = body

    if (!tanggal) {
      return NextResponse.json(
        { error: 'Tanggal wajib diisi' },
        { status: 400 }
      )
    }
    if (!kategori || !kategori.trim()) {
      return NextResponse.json(
        { error: 'Kategori wajib diisi' },
        { status: 400 }
      )
    }
    if (jumlah === undefined || jumlah === null || isNaN(Number(jumlah))) {
      return NextResponse.json(
        { error: 'Jumlah biaya wajib diisi' },
        { status: 400 }
      )
    }

    const biaya = await db.biaya.create({
      data: {
        tanggal,
        kategori: kategori.trim(),
        keterangan: keterangan || '',
        jumlah: Number(jumlah),
        metodePembayaran: metodePembayaran || 'Tunai',
        supplier: supplier || '',
        userId: user?.id || null
      }
    })

    return NextResponse.json(biaya, { status: 201 })
  } catch (error: any) {
    console.error('Error creating biaya:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to create biaya') },
      { status: 500 }
    )
  }
}
