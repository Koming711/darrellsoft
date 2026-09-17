import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth, canAccessRecord } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * GET /api/barang-customer?customerId=X
 * → daftar barang yang terdaftar (di-checklist) untuk customer tsb,
 *   lengkap dengan harga khusus per customer.
 */
export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const userId = user?.id || null
    const customerId = request.nextUrl.searchParams.get('customerId')
    if (!customerId) {
      return NextResponse.json({ error: 'customerId wajib diisi' }, { status: 400 })
    }

    const customer = await db.customer.findUnique({ where: { id: customerId } })
    if (!customer || !canAccessRecord(user, customer.userId)) {
      return NextResponse.json({ error: 'Customer tidak ditemukan' }, { status: 404 })
    }

    const regs = await db.barangCustomer.findMany({
      where: { customerId, userId },
      include: {
        barang: {
          select: { id: true, kode: true, nama: true, modal: true, jual: true, keterangan: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    const result = regs
      .filter(r => r.barang)
      .map(r => ({
        registrationId: r.id,
        barangId: r.barangId,
        kode: r.barang.kode,
        nama: r.barang.nama,
        modal: r.barang.modal,
        jual: r.barang.jual,
        keterangan: r.barang.keterangan,
        price: r.price,
      }))
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error: any) {
    console.error('Error fetching barang-customer:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to fetch barang-customer') },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/barang-customer — upsert registrasi (checklist) barang untuk customer.
 * Body: { customerId, entries: [{ barangId, price }] }
 * Semua barang pada `entries` menjadi terdaftar (masuk daftar barang pelanggan).
 */
export async function PUT(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const userId = user?.id || null
    const body = await request.json()
    const { customerId, entries } = body as {
      customerId: string
      entries: { barangId: string; price: number }[]
    }

    if (!customerId || !Array.isArray(entries)) {
      return NextResponse.json({ error: 'customerId dan entries wajib diisi' }, { status: 400 })
    }

    const customer = await db.customer.findUnique({ where: { id: customerId } })
    if (!customer || !canAccessRecord(user, customer.userId)) {
      return NextResponse.json({ error: 'Customer tidak ditemukan' }, { status: 404 })
    }

    for (const entry of entries) {
      const barang = await db.barang.findUnique({ where: { id: entry.barangId } })
      if (!barang || !canAccessRecord(user, barang.userId)) continue

      await db.barangCustomer.upsert({
        where: { barangId_customerId: { barangId: entry.barangId, customerId } },
        update: { price: Number(entry.price) || 0 },
        create: {
          barangId: entry.barangId,
          customerId,
          price: Number(entry.price) || 0,
          userId,
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error upserting barang-customer:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to save barang-customer') },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/barang-customer?customerId=X&barangId=Y
 * → batalkan registrasi (hapus dari daftar barang pelanggan).
 */
export async function DELETE(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const userId = user?.id || null
    const customerId = request.nextUrl.searchParams.get('customerId')
    const barangId = request.nextUrl.searchParams.get('barangId')

    if (!customerId || !barangId) {
      return NextResponse.json({ error: 'customerId dan barangId wajib diisi' }, { status: 400 })
    }

    await db.barangCustomer.deleteMany({
      where: { customerId, barangId, userId },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting barang-customer:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to delete barang-customer') },
      { status: 500 }
    )
  }
}
