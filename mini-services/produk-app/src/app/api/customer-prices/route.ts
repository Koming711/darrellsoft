import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, getSession, handleApiError, parseDay, requirePerm, toDayString } from '@/lib/server/context'
import type { CustomerPriceDTO } from '@/lib/types'
import { Prisma } from '@prisma/client'
import type { Customer, CustomerProductPrice, Product } from '@prisma/client'

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

function optionalText(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function requireDecimal(v: unknown, field: string): Prisma.Decimal {
  let raw: string | null = null
  if (typeof v === 'string' && v.trim() !== '') raw = v.trim()
  else if (typeof v === 'number' && Number.isFinite(v)) raw = String(v)
  if (raw === null) throw new ApiError(400, `${field} wajib diisi dan harus berupa angka.`)
  try {
    const d = new Prisma.Decimal(raw)
    if (!d.isFinite()) throw new Error('bukan angka terbatas')
    return d
  } catch {
    throw new ApiError(400, `${field} harus berupa angka desimal yang valid.`)
  }
}

type PriceWithRelations = CustomerProductPrice & { customer: Customer; product: Product }

function mapToCustomerPriceDTO(p: PriceWithRelations): CustomerPriceDTO {
  return {
    id: p.id,
    customerId: p.customerId,
    customerName: p.customer.name,
    customerCode: p.customer.code,
    productId: p.productId,
    productCode: p.product.code,
    productName: p.product.name,
    productUnit: p.product.unit,
    standardPrice: String(p.product.sellingPrice),
    sellingPrice: String(p.sellingPrice),
    unit: p.unit,
    validFrom: toDayString(p.validFrom),
    validUntil: p.validUntil ? toDayString(p.validUntil) : null,
    isActive: p.isActive,
    note: p.note,
    createdAt: p.createdAt.toISOString(),
  }
}

/**
 * GET /api/customer-prices?customerId=&productId=&status=&q=
 * status: 'active' | 'inactive' | 'expired' | 'all' (default 'all').
 * q dicocokkan ke nama/kode customer ATAU nama/kode produk.
 */
export async function GET(req: Request) {
  try {
    const session = await getSession(req)
    const { searchParams } = new URL(req.url)
    const customerId = searchParams.get('customerId')?.trim() ?? ''
    const productId = searchParams.get('productId')?.trim() ?? ''
    const q = searchParams.get('q')?.trim() ?? ''
    const status = searchParams.get('status') ?? 'all'

    const today = parseDay(toDayString(new Date()), 'Tanggal')

    let statusWhere: Prisma.CustomerProductPriceWhereInput = {}
    if (status === 'active') {
      statusWhere = { isActive: true, OR: [{ validUntil: null }, { validUntil: { gte: today } }] }
    } else if (status === 'expired') {
      statusWhere = { isActive: true, validUntil: { lt: today } }
    } else if (status === 'inactive') {
      statusWhere = { isActive: false }
    } else if (status !== 'all') {
      throw new ApiError(400, 'Parameter status tidak valid (gunakan active, inactive, expired, atau all).')
    }

    const where: Prisma.CustomerProductPriceWhereInput = {
      companyId: session.companyId,
      ...(customerId ? { customerId } : {}),
      ...(productId ? { productId } : {}),
      ...statusWhere,
      ...(q
        ? {
            OR: [
              { customer: { code: { contains: q } } },
              { customer: { name: { contains: q } } },
              { product: { code: { contains: q } } },
              { product: { name: { contains: q } } },
            ],
          }
        : {}),
    }

    const prices = await db.customerProductPrice.findMany({
      where,
      include: { customer: true, product: true },
    })

    const items = prices
      .map(mapToCustomerPriceDTO)
      .sort(
        (a, b) =>
          a.customerName.localeCompare(b.customerName) || a.productName.localeCompare(b.productName),
      )

    return NextResponse.json(items)
  } catch (e) {
    return handleApiError(e)
  }
}

/**
 * POST /api/customer-prices (izin prices:write)
 * Buat harga khusus customer. Anti-duplikasi: tidak boleh tumpang tindih
 * periode dengan harga aktif lain untuk pasangan customer+produk yang sama.
 */
export async function POST(req: Request) {
  try {
    const session = await requirePerm(req, 'prices:write')
    const body = await readJson(req)

    const customerId = requireText(body.customerId, 'Customer')
    const productId = requireText(body.productId, 'Produk')

    const created = await db.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: customerId, companyId: session.companyId },
        select: { id: true },
      })
      if (!customer) throw new ApiError(404, 'Data tidak ditemukan.')

      const product = await tx.product.findFirst({
        where: { id: productId, companyId: session.companyId },
      })
      if (!product) throw new ApiError(404, 'Data tidak ditemukan.')

      const sellingPrice = requireDecimal(body.sellingPrice, 'Harga jual')
      if (sellingPrice.comparedTo(0) < 0) throw new ApiError(400, 'Harga tidak boleh negatif.')

      const validFrom = parseDay(str(body.validFrom), 'Tanggal mulai berlaku')
      let validUntil: Date | null = null
      if (body.validUntil !== undefined && body.validUntil !== null) {
        validUntil = parseDay(str(body.validUntil), 'Tanggal akhir berlaku')
      }
      if (validUntil && validUntil.getTime() < validFrom.getTime()) {
        throw new ApiError(400, 'Tanggal akhir berlaku tidak boleh sebelum tanggal mulai.')
      }

      const unit = str(body.unit)?.trim() || product.unit
      const isActive = body.isActive === undefined ? true : body.isActive === true
      const note = optionalText(body.note)

      if (isActive) {
        const overlap = await tx.customerProductPrice.findFirst({
          where: {
            companyId: session.companyId,
            customerId,
            productId,
            isActive: true,
            OR: [{ validUntil: null }, { validUntil: { gte: validFrom } }],
            ...(validUntil ? { validFrom: { lte: validUntil } } : {}),
          },
          select: { id: true },
        })
        if (overlap) {
          throw new ApiError(
            409,
            'Sudah ada harga khusus aktif yang berlaku pada periode yang sama untuk customer dan barang ini. Perbaiki data yang ada terlebih dahulu.',
          )
        }
      }

      return tx.customerProductPrice.create({
        data: {
          customerId,
          productId,
          sellingPrice,
          unit,
          validFrom,
          validUntil,
          isActive,
          note,
          companyId: session.companyId,
        },
        include: { customer: true, product: true },
      })
    })

    return NextResponse.json(mapToCustomerPriceDTO(created), { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
