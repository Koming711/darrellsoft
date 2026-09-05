import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

// Common company suffixes that must NOT be used for code initials
const COMPANY_SUFFIXES = /^(cv|pt|ud|pn|fa|pv|tbk|ltd|inc|llc|co)\.?$/i

/**
 * Derive a unique company-code prefix from a company name.
 * Uses word initials (skipping common suffixes like PT/CV/UD).
 * If the prefix is already taken by a DIFFERENT company (any existing
 * prefix in `takenPrefixes`), it extends letters until unique.
 */
export function deriveCompanyPrefix(companyName: string, takenPrefixes: string[]): string {
  const words = companyName
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0 && !COMPANY_SUFFIXES.test(w))

  const source = words.length > 0 ? words : companyName.toUpperCase().replace(/[^A-Z]/g, '').split(/\s+/)
  const existing = new Set(takenPrefixes.map(p => p.toUpperCase()))

  // Try increasing letter counts per word: w1[0..1]+w2[0..1], w1[0..2]+w2[0..2], ...
  for (let take = 1; take <= 4; take++) {
    let candidate = ''
    for (const w of source) candidate += w.slice(0, take)
    candidate = candidate.slice(0, 8)
    if (candidate.length > 0 && !existing.has(candidate)) return candidate
  }

  // Fallback: append letters from the joined name until unique
  const joined = source.join('')
  let fallback = joined.slice(0, 3) || 'BRG'
  let i = 3
  while (existing.has(fallback) && i < joined.length) {
    fallback += joined[i]
    i++
  }
  let n = 1
  while (existing.has(fallback + n)) n++
  return existing.has(fallback) ? fallback + n : fallback
}

/** GET /api/barang — list all barang (with customer registrations) for the logged-in user */
export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const barang = await db.barang.findMany({
      where: await getDataFilter(user),
      include: {
        registrations: {
          include: { customer: { select: { id: true, name: true, companyName: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(barang, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error: any) {
    console.error('Error fetching barang:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to fetch barang') },
      { status: 500 }
    )
  }
}

/**
 * POST /api/barang — create a new barang.
 * Body: { nama, modal, jual, keterangan?, customerId?, price? }
 * - Kode is auto-generated server-side from the customer's company initials
 *   (unique across companies — never reused by another company).
 * - If customerId is provided, the barang is auto-registered to that customer
 *   with `price` (defaults to `jual`).
 */
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const { nama, modal, jual, keterangan, customerId, price } = body

    if (!nama || String(nama).trim() === '') {
      return NextResponse.json({ error: 'Nama barang wajib diisi' }, { status: 400 })
    }

    const userId = user?.id || null
    const modalNum = Number(modal) || 0
    const jualNum = Number(jual) || 0

    // Fetch customer (must belong to this user) for company-based code
    let customer: { id: string; name: string; companyName: string | null } | null = null
    if (customerId) {
      const found = await db.customer.findUnique({ where: { id: customerId } })
      if (!found || found.userId !== userId) {
        return NextResponse.json({ error: 'Customer tidak ditemukan' }, { status: 404 })
      }
      customer = found
    }

    // Collect prefixes already used by this user's barang (they belong to companies)
    const existingBarang = await db.barang.findMany({
      where: { userId },
      select: { kode: true },
    })
    const takenPrefixes = existingBarang
      .map(b => b.kode.split('-')[0])
      .filter((p): p is string => p.length > 0)

    // Prefix source: customer company name (falls back to barang name)
    const prefixSource = customer?.companyName?.trim() || customer?.name || nama
    const prefix = deriveCompanyPrefix(prefixSource, takenPrefixes)

    // Running number per prefix: PREFIX-001, PREFIX-002, ...
    const countWithPrefix = existingBarang.filter(b => b.kode.toUpperCase().startsWith(prefix.toUpperCase() + '-')).length
    const kode = `${prefix.toUpperCase()}-${String(countWithPrefix + 1).padStart(3, '0')}`

    const barang = await db.barang.create({
      data: {
        kode,
        nama: String(nama).trim(),
        modal: modalNum,
        jual: jualNum,
        keterangan: keterangan ? String(keterangan) : '',
        userId,
      },
    })

    // Auto-register to the selected customer (checklist = daftar barang pelanggan)
    if (customer) {
      await db.barangCustomer.create({
        data: {
          barangId: barang.id,
          customerId: customer.id,
          price: price !== undefined && price !== null && Number(price) > 0 ? Number(price) : jualNum,
          userId,
        },
      })
    }

    const created = await db.barang.findUnique({
      where: { id: barang.id },
      include: {
        registrations: {
          include: { customer: { select: { id: true, name: true, companyName: true } } },
        },
      },
    })

    return NextResponse.json({ barang: created }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating barang:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to create barang') },
      { status: 500 }
    )
  }
}
