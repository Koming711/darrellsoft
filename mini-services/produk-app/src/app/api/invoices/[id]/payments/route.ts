import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, handleApiError, requirePerm, toDayString } from '@/lib/server/context'
import type { InvoiceDTO, InvoiceItemDTO, InvoiceStatus, PriceSource } from '@/lib/types'
import { Prisma } from '@prisma/client'
import type { Customer, Invoice, InvoiceItem } from '@prisma/client'

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

function mapToInvoiceItemDTO(it: InvoiceItem): InvoiceItemDTO {
  return {
    id: it.id,
    productId: it.productId,
    productCode: it.productCode,
    productName: it.productName,
    unit: it.unit,
    quantity: String(it.quantity),
    unitPrice: String(it.unitPrice),
    costPrice: String(it.costPrice),
    priceSource: it.priceSource as PriceSource,
    manualReason: it.manualReason,
    subtotal: String(it.subtotal),
  }
}

type InvoiceWithRelations = Invoice & { customer: Customer; items: InvoiceItem[] }

function mapToInvoiceDTO(i: InvoiceWithRelations): InvoiceDTO {
  return {
    id: i.id,
    number: i.number,
    customerId: i.customerId,
    customerName: i.customer.name,
    customerCode: i.customer.code,
    invoiceDate: toDayString(i.invoiceDate),
    dueDate: i.dueDate ? toDayString(i.dueDate) : null,
    status: i.status as InvoiceStatus,
    subtotal: String(i.subtotal),
    discount: String(i.discount),
    taxPercent: String(i.taxPercent),
    taxAmount: String(i.taxAmount),
    total: String(i.total),
    amountPaid: String(i.amountPaid),
    note: i.note,
    items: [...i.items]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(mapToInvoiceItemDTO),
    createdAt: i.createdAt.toISOString(),
  }
}

/**
 * POST /api/invoices/[id]/payments (izin invoices:pay)
 * Catat pembayaran. amountPaid + amount tidak boleh melebihi total.
 * Status diperbarui: PAID bila lunas, PARTIAL bila sebagian, UNPAID bila nol.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePerm(req, 'invoices:pay')
    const { id } = await params
    const body = await readJson(req)

    const amount = requireDecimal(body.amount, 'Jumlah pembayaran')
    if (amount.comparedTo(0) <= 0) {
      throw new ApiError(400, 'Jumlah pembayaran harus lebih besar dari 0.')
    }

    const updated = await db.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({ where: { id, companyId: session.companyId } })
      if (!invoice) throw new ApiError(404, 'Data tidak ditemukan.')

      const newPaid = invoice.amountPaid.add(amount)
      if (newPaid.comparedTo(invoice.total) > 0) {
        throw new ApiError(400, 'Jumlah pembayaran melebihi sisa tagihan.')
      }

      const status: InvoiceStatus =
        newPaid.comparedTo(invoice.total) >= 0 ? 'PAID' : newPaid.comparedTo(0) > 0 ? 'PARTIAL' : 'UNPAID'

      return tx.invoice.update({
        where: { id },
        data: { amountPaid: newPaid, status },
        include: { customer: true, items: true },
      })
    })

    return NextResponse.json(mapToInvoiceDTO(updated))
  } catch (e) {
    return handleApiError(e)
  }
}
