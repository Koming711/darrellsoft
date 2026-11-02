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

function optionalText(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

/** Parse angka desimal dari string (fallback: number). Melempar 400 bila tidak valid. */
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

/**
 * GET /api/products?q=&includeInactive=1
 * Daftar produk milik perusahaan sesi, urut nama.
 */
export async function GET(req: Request) {
  try {
    const session = await getSession(req)
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim() ?? ''
    const includeInactive = searchParams.get('includeInactive') === '1'

    const where: Prisma.ProductWhereInput = {
      companyId: session.companyId,
      ...(includeInactive ? {} : { isActive: true }),
      ...(q
        ? {
            OR: [{ code: { contains: q } }, { name: { contains: q } }],
          }
        : {}),
    }

    const products = await db.product.findMany({ where, orderBy: { name: 'asc' } })
    return NextResponse.json(products.map(mapToProductDTO))
  } catch (e) {
    return handleApiError(e)
  }
}

/**
 * POST /api/products (izin products:write)
 * Buat produk baru. Kode harus unik per perusahaan.
 */
export async function POST(req: Request) {
  try {
    const session = await requirePerm(req, 'products:write')
    const body = await readJson(req)

    const code = requireText(body.code, 'Kode produk')
    const name = requireText(body.name, 'Nama produk')
    const unit = requireText(body.unit, 'Satuan (unit)')
    const sellingPrice = requireNonNegativeDecimal(body.sellingPrice, 'Harga jual', 'Harga jual tidak boleh negatif.')
    const costPrice = requireNonNegativeDecimal(body.costPrice, 'Harga pokok', 'Harga pokok tidak boleh negatif.')
    const isActive = body.isActive === undefined ? true : body.isActive === true

    let stock = 0
    if (body.stock !== undefined) {
      if (typeof body.stock !== 'number' || !Number.isInteger(body.stock) || body.stock < 0) {
        throw new ApiError(400, 'Stok harus berupa bilangan bulat tidak negatif.')
      }
      stock = body.stock
    }

    const dup = await db.product.findFirst({
      where: { companyId: session.companyId, code },
      select: { id: true },
    })
    if (dup) throw new ApiError(409, 'Kode produk sudah digunakan.')

    const created = await db.product.create({
      data: {
        code,
        name,
        unit,
        sellingPrice,
        costPrice,
        stock,
        isActive,
        companyId: session.companyId,
      },
    })

    return NextResponse.json(mapToProductDTO(created), { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
