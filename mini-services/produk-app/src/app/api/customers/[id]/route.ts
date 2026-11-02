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

async function findOwnedOr404(companyId: string, id: string): Promise<Customer> {
  const customer = await db.customer.findFirst({ where: { id, companyId } })
  if (!customer) throw new ApiError(404, 'Data tidak ditemukan.')
  return customer
}

/** GET /api/customers/[id] — detail satu customer milik perusahaan sesi. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req)
    const { id } = await params
    const customer = await findOwnedOr404(session.companyId, id)
    return NextResponse.json(mapToCustomerDTO(customer))
  } catch (e) {
    return handleApiError(e)
  }
}

/** PUT /api/customers/[id] (izin customers:write) — ubah field opsional. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePerm(req, 'customers:write')
    const { id } = await params
    const body = await readJson(req)
    const existing = await findOwnedOr404(session.companyId, id)

    const data: Prisma.CustomerUpdateInput = {}

    if (body.code !== undefined) {
      const code = requireText(body.code, 'Kode customer')
      if (code !== existing.code) {
        const dup = await db.customer.findFirst({
          where: { companyId: session.companyId, code, id: { not: id } },
          select: { id: true },
        })
        if (dup) throw new ApiError(409, 'Kode customer sudah digunakan.')
      }
      data.code = code
    }
    if (body.name !== undefined) data.name = requireText(body.name, 'Nama customer')
    if (body.phone !== undefined) data.phone = optionalText(body.phone)
    if (body.email !== undefined) data.email = optionalText(body.email)
    if (body.address !== undefined) data.address = optionalText(body.address)
    if (body.isActive !== undefined) data.isActive = body.isActive === true

    const updated = await db.customer.update({ where: { id }, data })
    return NextResponse.json(mapToCustomerDTO(updated))
  } catch (e) {
    return handleApiError(e)
  }
}

/** DELETE /api/customers/[id] (izin customers:write) — blokir bila punya invoice. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePerm(req, 'customers:write')
    const { id } = await params
    await findOwnedOr404(session.companyId, id)

    const invoiceCount = await db.invoice.count({ where: { customerId: id } })
    if (invoiceCount > 0) {
      throw new ApiError(400, 'Customer memiliki invoice dan tidak dapat dihapus. Nonaktifkan saja.')
    }

    await db.$transaction(async (tx) => {
      await tx.customerProductPrice.deleteMany({ where: { customerId: id } })
      await tx.customer.delete({ where: { id } })
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
