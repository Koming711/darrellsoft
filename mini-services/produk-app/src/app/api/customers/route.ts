import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, getSession, handleApiError, requirePerm } from '@/lib/server/context'
import type { CustomerDTO } from '@/lib/types'
import type { Customer, Prisma } from '@prisma/client'

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

function optionalText(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function requireText(v: unknown, field: string): string {
  const s = str(v)?.trim()
  if (!s) throw new ApiError(400, `${field} wajib diisi.`)
  return s
}

function mapToCustomerDTO(c: Customer): CustomerDTO {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    phone: c.phone,
    email: c.email,
    address: c.address,
    isActive: c.isActive,
    createdAt: c.createdAt.toISOString(),
  }
}

/**
 * GET /api/customers?q=&includeInactive=1
 * Daftar customer milik perusahaan sesi, urut nama.
 */
export async function GET(req: Request) {
  try {
    const session = await getSession(req)
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim() ?? ''
    const includeInactive = searchParams.get('includeInactive') === '1'

    const where: Prisma.CustomerWhereInput = {
      companyId: session.companyId,
      ...(includeInactive ? {} : { isActive: true }),
      ...(q
        ? {
            OR: [{ code: { contains: q } }, { name: { contains: q } }],
          }
        : {}),
    }

    const customers = await db.customer.findMany({ where, orderBy: { name: 'asc' } })
    return NextResponse.json(customers.map(mapToCustomerDTO))
  } catch (e) {
    return handleApiError(e)
  }
}

/**
 * POST /api/customers (izin customers:write)
 * Buat customer baru. Kode harus unik per perusahaan.
 */
export async function POST(req: Request) {
  try {
    const session = await requirePerm(req, 'customers:write')
    const body = await readJson(req)

    const code = requireText(body.code, 'Kode customer')
    const name = requireText(body.name, 'Nama customer')
    const phone = optionalText(body.phone)
    const email = optionalText(body.email)
    const address = optionalText(body.address)
    const isActive = body.isActive === undefined ? true : body.isActive === true

    const dup = await db.customer.findFirst({
      where: { companyId: session.companyId, code },
      select: { id: true },
    })
    if (dup) throw new ApiError(409, 'Kode customer sudah digunakan.')

    const created = await db.customer.create({
      data: { code, name, phone, email, address, isActive, companyId: session.companyId },
    })

    return NextResponse.json(mapToCustomerDTO(created), { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
