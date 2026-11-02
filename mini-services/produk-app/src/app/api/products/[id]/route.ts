import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, getSession, handleApiError, requirePerm } from '@/lib/server/context'
import type { ProductDTO } from '@/lib/types'
import { Prisma } from '@prisma/client'
import type { Product } from '@prisma/client'

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

function requireNonNegativeDecimal(v: unknown, field: string, message: string): Prisma.Decimal {
  const d = requireDecimal(v, field)
  if (d.comparedTo(0) < 0) throw new ApiError(400, message)
  return d
}

function mapToProductDTO(p: Product): ProductDTO {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    unit: p.unit,
    sellingPrice: String(p.sellingPrice),
    costPrice: String(p.costPrice),
    stock: p.stock,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
  }
}

async function findOwnedOr404(companyId: string, id: string): Promise<Product> {
  const product = await db.product.findFirst({ where: { id, companyId } })
  if (!product) throw new ApiError(404, 'Data tidak ditemukan.')
  return product
}

/** GET /api/products/[id] — detail satu produk milik perusahaan sesi. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req)
    const { id } = await params
    const product = await findOwnedOr404(session.companyId, id)
    return NextResponse.json(mapToProductDTO(product))
  } catch (e) {
    return handleApiError(e)
  }
}

/** PUT /api/products/[id] (izin products:write) — ubah field opsional. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePerm(req, 'products:write')
    const { id } = await params
    const body = await readJson(req)
    const existing = await findOwnedOr404(session.companyId, id)

    const data: Prisma.ProductUpdateInput = {}

    if (body.code !== undefined) {
      const code = requireText(body.code, 'Kode produk')
      if (code !== existing.code) {
        const dup = await db.product.findFirst({
          where: { companyId: session.companyId, code, id: { not: id } },
          select: { id: true },
        })
        if (dup) throw new ApiError(409, 'Kode produk sudah digunakan.')
      }
      data.code = code
    }
    if (body.name !== undefined) data.name = requireText(body.name, 'Nama produk')
    if (body.unit !== undefined) data.unit = requireText(body.unit, 'Satuan (unit)')
    if (body.sellingPrice !== undefined) {
      data.sellingPrice = requireNonNegativeDecimal(body.sellingPrice, 'Harga jual', 'Harga jual tidak boleh negatif.')
    }
    if (body.costPrice !== undefined) {
      data.costPrice = requireNonNegativeDecimal(body.costPrice, 'Harga pokok', 'Harga pokok tidak boleh negatif.')
    }
    if (body.stock !== undefined) {
      if (typeof body.stock !== 'number' || !Number.isInteger(body.stock) || body.stock < 0) {
        throw new ApiError(400, 'Stok harus berupa bilangan bulat tidak negatif.')
      }
      data.stock = body.stock
    }
    if (body.isActive !== undefined) data.isActive = body.isActive === true

    const updated = await db.product.update({ where: { id }, data })
    return NextResponse.json(mapToProductDTO(updated))
  } catch (e) {
    return handleApiError(e)
  }
}

/** DELETE /api/products/[id] (izin products:write) — blokir bila dipakai invoice. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePerm(req, 'products:write')
    const { id } = await params
    await findOwnedOr404(session.companyId, id)

    const usedCount = await db.invoiceItem.count({ where: { productId: id } })
    if (usedCount > 0) {
      throw new ApiError(400, 'Produk sudah dipakai pada invoice dan tidak dapat dihapus. Nonaktifkan saja.')
    }

    await db.$transaction(async (tx) => {
      await tx.customerProductPrice.deleteMany({ where: { productId: id } })
      await tx.product.delete({ where: { id } })
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
