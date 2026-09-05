import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * GET /api/prices?customerId= — daftar barang aktif + harga khusus per pelanggan.
 * Response: { customer: { id, code, name }, rows: PriceRow[] }
 * PriceRow = { itemId, code, name, unit, standardPrice, hpp, customPrice }.
 * hpp null untuk role kasir (user/demo).
 */
export async function GET(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const isKasir = user.role === 'user' || user.role === 'demo'

    const customerId = (new URL(request.url).searchParams.get('customerId') ?? '').trim()
    if (!customerId) {
      return NextResponse.json({ error: 'customerId wajib diisi' }, { status: 400 })
    }

    const customer = await db.customer.findUnique({ where: { id: customerId } })
    if (!customer || customer.userId !== user.id) {
      return NextResponse.json({ error: 'Pelanggan tidak ditemukan' }, { status: 404 })
    }

    const [items, customPrices] = await Promise.all([
      db.barang.findMany({ where: { userId: user.id, isActive: true }, orderBy: { nama: 'asc' } }),
      db.barangCustomer.findMany({ where: { userId: user.id, customerId } }),
    ])
    const customMap = new Map(customPrices.map((cp) => [cp.barangId, cp.price]))

    const rows = items.map((it) => ({
      itemId: it.id,
      code: it.kode,
      name: it.nama,
      unit: it.satuan,
      standardPrice: it.jual,
      hpp: isKasir ? null : it.modal,
      customPrice: customMap.get(it.id) ?? null,
    }))

    return NextResponse.json(
      { customer: { id: customer.id, code: customer.code ?? '', name: customer.name }, rows },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (error: unknown) {
    console.error('Error fetching prices:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to fetch prices') },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/prices — simpan harga khusus.
 * Body: { customerId, entries: [{ itemId, price: number|null }] }, price null = hapus custom.
 */
export async function PUT(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body tidak valid' }, { status: 400 })
    }

    const customerId = typeof body.customerId === 'string' ? body.customerId.trim() : ''
    if (!customerId) {
      return NextResponse.json({ error: 'customerId wajib diisi' }, { status: 400 })
    }

    const customer = await db.customer.findUnique({ where: { id: customerId } })
    if (!customer || customer.userId !== user.id) {
      return NextResponse.json({ error: 'Pelanggan tidak ditemukan' }, { status: 404 })
    }

    const rawEntries: unknown[] = Array.isArray(body.entries) ? body.entries : []
    if (rawEntries.length === 0) {
      return NextResponse.json({ error: 'entries wajib berupa array berisi item' }, { status: 400 })
    }

    type Entry = { itemId: string; price: number | null }
    const entries: Entry[] = []
    for (let i = 0; i < rawEntries.length; i++) {
      const raw = rawEntries[i] as Record<string, unknown> | null
      const itemId = raw && typeof raw.itemId === 'string' ? raw.itemId.trim() : ''
      if (!itemId) {
        return NextResponse.json(
          { error: `entries[${i}] tidak valid: itemId wajib diisi` },
          { status: 400 }
        )
      }
      if (!raw || raw.price === undefined) {
        return NextResponse.json(
          { error: `entries[${i}] tidak valid: price wajib diisi (null untuk hapus)` },
          { status: 400 }
        )
      }
      if (raw.price === null) {
        entries.push({ itemId, price: null })
        continue
      }
      const n = typeof raw.price === 'number' ? raw.price : Number(raw.price)
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json(
          { error: `entries[${i}] tidak valid: harga tidak boleh negatif` },
          { status: 400 }
        )
      }
      entries.push({ itemId, price: n })
    }

    const itemIds = [...new Set(entries.map((e) => e.itemId))]
    const foundItems = await db.barang.findMany({
      where: { id: { in: itemIds }, userId: user.id },
      select: { id: true },
    })
    if (foundItems.length !== itemIds.length) {
      return NextResponse.json({ error: 'Ada item yang tidak ditemukan' }, { status: 400 })
    }

    let saved = 0
    for (const e of entries) {
      if (e.price === null) {
        // null = hapus custom (kembali ke harga standar)
        await db.barangCustomer.deleteMany({
          where: { userId: user.id, customerId, barangId: e.itemId },
        })
      } else {
        const existing = await db.barangCustomer.findFirst({
          where: { userId: user.id, customerId, barangId: e.itemId },
        })
        if (existing) {
          await db.barangCustomer.update({ where: { id: existing.id }, data: { price: e.price } })
        } else {
          await db.barangCustomer.create({
            data: { userId: user.id, customerId, barangId: e.itemId, price: e.price },
          })
        }
      }
      saved += 1
    }

    return NextResponse.json({ saved })
  } catch (error: unknown) {
    console.error('Error saving prices:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to save prices') },
      { status: 500 }
    )
  }
}
