import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * GET /api/customer-items?customerId=xxx
 * Daftar barang milik satu customer (harus milik user yang login).
 * Tanpa customerId → semua barang milik user (dipakai untuk lookup cepat).
 */
export async function GET(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const customerId = request.nextUrl.searchParams.get('customerId')

    if (customerId) {
      // Pastikan customer benar-benar milik user (strict per-user isolation)
      const customer = await db.customer.findUnique({ where: { id: customerId } })
      if (!customer) {
        return NextResponse.json({ error: 'Customer tidak ditemukan' }, { status: 404 })
      }
      if (customer.userId !== user.id) {
        return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
      }

      const items = await db.customerItem.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
      })
      return NextResponse.json(items, {
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      })
    }

    // Semua barang milik user
    const items = await db.customerItem.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(items, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    })
  } catch (error: any) {
    console.error('Error fetching customer items:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal memuat daftar barang') },
      { status: 500 }
    )
  }
}

/**
 * POST /api/customer-items
 * Body: { customerId, name, satuan?, harga? }
 */
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const { customerId, name, satuan, harga } = body

    if (!customerId || !name || String(name).trim() === '') {
      return NextResponse.json(
        { error: 'Customer dan nama barang wajib diisi' },
        { status: 400 }
      )
    }

    const customer = await db.customer.findUnique({ where: { id: customerId } })
    if (!customer) {
      return NextResponse.json({ error: 'Customer tidak ditemukan' }, { status: 404 })
    }
    if (customer.userId !== user.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    const item = await db.customerItem.create({
      data: {
        customerId,
        name: String(name).trim(),
        satuan: satuan ? String(satuan).trim() || 'pcs' : 'pcs',
        harga: Number(harga) || 0,
        userId: user.id,
      },
    })

    return NextResponse.json(item, { status: 201 })
  } catch (error: any) {
    console.error('Error creating customer item:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal menambahkan barang') },
      { status: 500 }
    )
  }
}
