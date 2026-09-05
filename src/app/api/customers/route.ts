import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * GET /api/customers?q= — daftar customer milik user (array, kompatibel konsumen lama).
 * Setiap elemen kini juga membawa: code, notes, isActive, invoiceCount, customPriceCount
 * (dipakai halaman Master Pelanggan versi lama). q = contains name/code/phone.
 * invoiceCount dihitung dari DocumentHistory (docType 'invoice') yang client.nama == customer.name.
 */
export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const filter = await getDataFilter(user)

    const q = (new URL(request.url).searchParams.get('q') ?? '').trim()
    const where: Record<string, unknown> = { ...filter }
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { code: { contains: q } },
        { phone: { contains: q } },
      ]
    }

    const [customers, histories, customCounts] = await Promise.all([
      db.customer.findMany({ where, orderBy: { name: 'asc' } }),
      (async () => {
        if (!user) return [] as { dataJson: string | null }[]
        return db.documentHistory.findMany({
          where: { userId: user.id, docType: 'invoice' },
          select: { dataJson: true },
        })
      })(),
      db.barangCustomer.groupBy({
        by: ['customerId'],
        _count: { _all: true },
      }),
    ])

    // Hitung jumlah invoice per customer berdasarkan nama client di dataJson
    const invoiceCountByName = new Map<string, number>()
    for (const h of histories) {
      if (!h.dataJson) continue
      try {
        const parsed = JSON.parse(h.dataJson) as { client?: { nama?: string } }
        const nama = parsed?.client?.nama?.trim()
        if (nama) invoiceCountByName.set(nama, (invoiceCountByName.get(nama) ?? 0) + 1)
      } catch {
        // dataJson tidak valid — lewati
      }
    }
    const customCountMap = new Map(customCounts.map((c) => [c.customerId, c._count._all]))

    const result = customers.map((c) => ({
      ...c,
      code: c.code ?? '',
      invoiceCount: invoiceCountByName.get(c.name.trim()) ?? 0,
      customPriceCount: customCountMap.get(c.id) ?? 0,
    }))

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    })
  } catch (error: unknown) {
    console.error('Error fetching customers:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to fetch customers') },
      { status: 500 }
    )
  }
}

/**
 * POST /api/customers — buat customer. Kode otomatis CUST-xxx (unik per user).
 * Body: { name, companyName?, address?, phone?, email?, notes? }
 */
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const { name, companyName, address, phone, email, notes } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Nama customer wajib diisi' },
        { status: 400 }
      )
    }

    const code = await nextCode(user?.id ?? null)
    const customer = await db.customer.create({
      data: {
        code,
        name,
        companyName: companyName || null,
        address: address || null,
        phone: phone || null,
        email: email || null,
        notes: notes || null,
        userId: user?.id || null
      }
    })

    return NextResponse.json(customer, { status: 201 })
  } catch (error: unknown) {
    console.error('Error creating customer:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to create customer') },
      { status: 500 }
    )
  }
}

/** Kode CUST-xxx unik per user: mulai dari count+1, loop sampai unik. */
async function nextCode(userId: string | null): Promise<string> {
  const count = await db.customer.count({ where: { userId } })
  let n = count + 1
  for (;;) {
    const code = `CUST-${String(n).padStart(3, '0')}`
    const exists = await db.customer.findFirst({ where: { userId, code } })
    if (!exists) return code
    n += 1
  }
}
