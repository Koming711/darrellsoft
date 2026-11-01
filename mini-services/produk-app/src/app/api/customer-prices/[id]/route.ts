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

async function findOwnedOr404(companyId: string, id: string): Promise<CustomerProductPrice> {
  const price = await db.customerProductPrice.findFirst({ where: { id, companyId } })
  if (!price) throw new ApiError(404, 'Data tidak ditemukan.')
  return price
}

/** GET /api/customer-prices/[id] — detail satu harga khusus milik perusahaan sesi. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req)
    const { id } = await params
    await findOwnedOr404(session.companyId, id)

    const price = await db.customerProductPrice.findFirstOrThrow({
      where: { id },
      include: { customer: true, product: true },
    })
    return NextResponse.json(mapToCustomerPriceDTO(price))
  } catch (e) {
    return handleApiError(e)
  }
}

/**
 * PUT /api/customer-prices/[id] (izin prices:write)
 * Ubah harga khusus. Overlap check meng-eksklusi data ini sendiri.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePerm(req, 'prices:write')
    const { id } = await params
    const body = await readJson(req)
    const existing = await findOwnedOr404(session.companyId, id)

    const updated = await db.$transaction(async (tx) => {
      const customerId = body.customerId !== undefined ? requireText(body.customerId, 'Customer') : existing.customerId
      const productId = body.productId !== undefined ? requireText(body.productId, 'Produk') : existing.productId

      const customer = await tx.customer.findFirst({
        where: { id: customerId, companyId: session.companyId },
        select: { id: true },
      })
      if (!customer) throw new ApiError(404, 'Data tidak ditemukan.')

      const product = await tx.product.findFirst({
        where: { id: productId, companyId: session.companyId },
      })
      if (!product) throw new ApiError(404, 'Data tidak ditemukan.')

      const sellingPrice =
        body.sellingPrice !== undefined ? requireDecimal(body.sellingPrice, 'Harga jual') : existing.sellingPrice
      if (sellingPrice.comparedTo(0) < 0) throw new ApiError(400, 'Harga tidak boleh negatif.')

      const validFrom =
        body.validFrom !== undefined
          ? parseDay(str(body.validFrom), 'Tanggal mulai berlaku')
          : existing.validFrom

      let validUntil: Date | null
      if (body.validUntil === undefined) {
        validUntil = existing.validUntil
      } else if (body.validUntil === null) {
        validUntil = null
      } else {
        validUntil = parseDay(str(body.validUntil), 'Tanggal akhir berlaku')
      }
      if (validUntil && validUntil.getTime() < validFrom.getTime()) {
        throw new ApiError(400, 'Tanggal akhir berlaku tidak boleh sebelum tanggal mulai.')
      }

      let unit: string
      if (body.unit !== undefined) {
        unit = str(body.unit)?.trim() || product.unit
      } else {
        unit = existing.unit
      }

      const isActive = body.isActive !== undefined ? body.isActive === true : existing.isActive
      const note = body.note !== undefined ? optionalText(body.note) : existing.note

      if (isActive) {
        const overlap = await tx.customerProductPrice.findFirst({
          where: {
            companyId: session.companyId,
            customerId,
            productId,
            isActive: true,
            id: { not: id },
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

      return tx.customerProductPrice.update({
        where: { id },
        data: {
          customerId,
          productId,
          sellingPrice,
          unit,
          validFrom,
          validUntil,
          isActive,
          note,
        },
        include: { customer: true, product: true },
      })
    })

    return NextResponse.json(mapToCustomerPriceDTO(updated))
  } catch (e) {
    return handleApiError(e)
  }
}

/** DELETE /api/customer-prices/[id] (izin prices:write) — hapus data harga khusus. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePerm(req, 'prices:write')
    const { id } = await params
    await findOwnedOr404(session.companyId, id)

    await db.customerProductPrice.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
