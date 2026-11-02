import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, getSession, handleApiError, parseDay, toDayString } from '@/lib/server/context'
import type { ResolvedPriceDTO } from '@/lib/types'
import type { CustomerProductPrice, Product } from '@prisma/client'

export const dynamic = 'force-dynamic'

// ---- Helper kecil ----

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await req.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('bukan objek')
    return parsed as Record<string, unknown>
  } catch {
    throw new ApiError(400, 'Format data yang dikirim tidak valid.')
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function requireText(v: unknown, field: string): string {
  const s = str(v)?.trim()
  if (!s) throw new ApiError(400, `${field} wajib diisi.`)
  return s
}

/**
 * POST /api/customer-prices/resolve
 * Dipakai form invoice: resolusi harga efektif per produk untuk sebuah
 * customer pada tanggal tertentu (harga khusus aktif, atau harga standar).
 * Harga khusus milik customer lain TIDAK PERNAH dipakai.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession(req)
    const body = await readJson(req)

    const customerId = requireText(body.customerId, 'Customer')
    const rawIds = body.productIds
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      throw new ApiError(400, 'Daftar produk (productIds) wajib diisi.')
    }
    if (rawIds.length > 200) {
      throw new ApiError(400, 'Maksimal 200 produk per permintaan.')
    }

    const productIds = Array.from(
      new Set(
        rawIds
          .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
          .map((v) => v.trim()),
      ),
    )

    const date =
      body.date !== undefined && body.date !== null
        ? parseDay(str(body.date), 'Tanggal')
        : parseDay(toDayString(new Date()), 'Tanggal')

    const customer = await db.customer.findFirst({
      where: { id: customerId, companyId: session.companyId },
      select: { id: true },
    })
    if (!customer) throw new ApiError(404, 'Data tidak ditemukan.')

    const products = await db.product.findMany({
      where: { companyId: session.companyId, id: { in: productIds } },
    })
    const productMap = new Map<string, Product>(products.map((p) => [p.id, p]))

    // Harga khusus customer ini saja, aktif, dan mencakup tanggal diminta.
    const prices = await db.customerProductPrice.findMany({
      where: {
        companyId: session.companyId,
        customerId,
        productId: { in: productIds },
        isActive: true,
        validFrom: { lte: date },
        OR: [{ validUntil: null }, { validUntil: { gte: date } }],
      },
      orderBy: { validFrom: 'desc' },
    })

    // Bila ada lebih dari satu (data legacy tumpang tindih), pilih validFrom terbaru.
    const bestPrice = new Map<string, CustomerProductPrice>()
    for (const p of prices) {
      const current = bestPrice.get(p.productId)
      if (!current || p.validFrom.getTime() > current.validFrom.getTime()) {
        bestPrice.set(p.productId, p)
      }
    }

    const result: ResolvedPriceDTO[] = []
    for (const pid of productIds) {
      const product = productMap.get(pid)
      if (!product) continue // produk tidak ada / bukan milik company → lewati

      const special = bestPrice.get(pid)
      if (special) {
        result.push({
          productId: pid,
          price: String(special.sellingPrice),
          unit: special.unit,
          source: 'CUSTOMER_PRICE',
          customerPriceId: special.id,
          validUntil: special.validUntil ? toDayString(special.validUntil) : null,
        })
      } else {
        result.push({
          productId: pid,
          price: String(product.sellingPrice),
          unit: product.unit,
          source: 'STANDARD',
          customerPriceId: null,
          validUntil: null,
        })
      }
    }

    return NextResponse.json({ prices: result })
  } catch (e) {
    return handleApiError(e)
  }
}
