import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * GET /api/items?q=&active=&customerId= — list barang (versi lama "Master Barang").
 * Response: { items: Item[] } dengan Item = { id, code, name, unit, standardPrice, hpp, keterangan, isActive, createdAt }.
 * hpp (harga modal) dikirim untuk SEMUA role (permintaan owner; sebelumnya dinol-kan untuk kasir).
 * Default hanya isActive=true; active=0|all untuk semua. q = contains nama/kode.
 * customerId= → hanya barang TERDAFTAR (BarangCustomer) untuk customer tsb.
 */
export async function GET(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const sp = new URL(request.url).searchParams
    const q = (sp.get('q') ?? '').trim()
    const activeParam = sp.get('active')
    const customerId = (sp.get('customerId') ?? '').trim()

    const where: Record<string, unknown> = { userId: user.id }
    if (q) {
      where.OR = [{ nama: { contains: q } }, { kode: { contains: q } }]
    }
    if (activeParam !== '0' && activeParam !== 'all') where.isActive = true
    if (customerId && customerId !== 'all') {
      const customer = await db.customer.findUnique({ where: { id: customerId } })
      if (!customer || customer.userId !== user.id) {
        return NextResponse.json({ error: 'Pelanggan tidak ditemukan' }, { status: 404 })
      }
      const regs = await db.barangCustomer.findMany({
        where: { userId: user.id, customerId },
        select: { barangId: true },
      })
      where.id = { in: regs.map((r) => r.barangId) }
    }

    const rows = await db.barang.findMany({ where, orderBy: { nama: 'asc' } })
    const items = rows.map((it) => ({
      id: it.id,
      code: it.kode,
      name: it.nama,
      unit: it.satuan,
      standardPrice: it.jual,
      hpp: it.modal,
      keterangan: it.keterangan,
      isActive: it.isActive,
      createdAt: it.createdAt.toISOString(),
    }))
    return NextResponse.json(
      { items },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (error: unknown) {
    console.error('Error fetching items:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to fetch items') },
      { status: 500 }
    )
  }
}

/**
 * POST /api/items — tambah barang. Kode otomatis ITM-xxx (unik per user).
 * Body: { name, unit, standardPrice, hpp, keterangan?, customerId? }
 * customerId → barang otomatis terdaftar (BarangCustomer) untuk customer tsb,
 * harga khusus awal = standardPrice (harga jual).
 */
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body tidak valid' }, { status: 400 })
    }

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'Nama item wajib diisi' }, { status: 400 })
    }
    const standardPrice = toNumber(body.standardPrice)
    if (standardPrice === null || standardPrice < 0) {
      return NextResponse.json({ error: 'Harga standar tidak valid' }, { status: 400 })
    }
    const hpp = body.hpp === undefined || body.hpp === null ? 0 : toNumber(body.hpp)
    if (hpp === null || hpp < 0) {
      return NextResponse.json({ error: 'HPP tidak valid' }, { status: 400 })
    }
    const unit = typeof body.unit === 'string' && body.unit.trim() ? body.unit.trim() : 'pcs'
    const keterangan = typeof body.keterangan === 'string' ? body.keterangan.trim().slice(0, 500) : ''

    // Pilih customer (opsional) — barang akan didaftarkan untuk customer tsb
    const customerId = typeof body.customerId === 'string' ? body.customerId.trim() : ''
    if (customerId) {
      const customer = await db.customer.findUnique({ where: { id: customerId } })
      if (!customer || customer.userId !== user.id) {
        return NextResponse.json({ error: 'Pelanggan tidak ditemukan' }, { status: 404 })
      }
    }

    const code = await nextCode(user.id)
    const item = await db.barang.create({
      data: { userId: user.id, kode: code, nama: name, satuan: unit, jual: standardPrice, modal: hpp, keterangan },
    })

    if (customerId) {
      await db.barangCustomer.upsert({
        where: { barangId_customerId: { barangId: item.id, customerId } },
        update: {},
        create: { barangId: item.id, customerId, price: standardPrice, userId: user.id },
      })
    }

    return NextResponse.json({
      item: {
        id: item.id,
        code: item.kode,
        name: item.nama,
        unit: item.satuan,
        standardPrice: item.jual,
        hpp: item.modal,
        keterangan: item.keterangan,
        isActive: item.isActive,
        createdAt: item.createdAt.toISOString(),
      },
    })
  } catch (error: unknown) {
    console.error('Error creating item:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to create item') },
      { status: 500 }
    )
  }
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** Kode ITM-xxx unik per user: mulai dari count+1, loop sampai unik. */
async function nextCode(userId: string): Promise<string> {
  const count = await db.barang.count({ where: { userId } })
  let n = count + 1
  for (;;) {
    const code = `ITM-${String(n).padStart(3, '0')}`
    const exists = await db.barang.findFirst({ where: { userId, kode: code } })
    if (!exists) return code
    n += 1
  }
}
