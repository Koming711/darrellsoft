import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, getSession, handleApiError, requirePerm, toDayString } from '@/lib/server/context'
import type { InvoiceDTO, InvoiceItemDTO, InvoiceStatus, PriceSource } from '@/lib/types'
import type { Customer, Invoice, InvoiceItem } from '@prisma/client'

export const dynamic = 'force-dynamic'

// ---- Helper kecil ----

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

async function findOwnedOr404(companyId: string, id: string): Promise<Invoice> {
  const invoice = await db.invoice.findFirst({ where: { id, companyId } })
  if (!invoice) throw new ApiError(404, 'Data tidak ditemukan.')
  return invoice
}

/** GET /api/invoices/[id] — detail invoice lengkap dengan items (urut createdAt). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req)
    const { id } = await params
    await findOwnedOr404(session.companyId, id)

    const invoice = await db.invoice.findFirstOrThrow({
      where: { id },
      include: { customer: true, items: true },
    })
    return NextResponse.json(mapToInvoiceDTO(invoice))
  } catch (e) {
    return handleApiError(e)
  }
}

/** DELETE /api/invoices/[id] (izin invoices:delete) — blokir bila sudah ada pembayaran. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePerm(req, 'invoices:delete')
    const { id } = await params
    const invoice = await findOwnedOr404(session.companyId, id)

    if (invoice.amountPaid.comparedTo(0) > 0) {
      throw new ApiError(400, 'Invoice sudah memiliki pembayaran dan tidak dapat dihapus.')
    }

    await db.invoice.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
