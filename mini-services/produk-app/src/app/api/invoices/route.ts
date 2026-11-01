import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, getSession, handleApiError, parseDay, requirePerm, toDayString } from '@/lib/server/context'
import { can } from '@/lib/permissions'
import type { InvoiceDTO, InvoiceItemDTO, InvoiceListItemDTO, InvoiceStatus, PriceSource } from '@/lib/types'
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

function optionalDecimal(v: unknown, field: string): Prisma.Decimal {
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
    return new Prisma.Decimal(0)
  }
  return requireDecimal(v, field)
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

type InvoiceListRow = Invoice & { customer: Customer; _count: { items: number } }

function mapToInvoiceListItem(i: InvoiceListRow): InvoiceListItemDTO {
  return {
    id: i.id,
    number: i.number,
    customerId: i.customerId,
    customerName: i.customer.name,
    invoiceDate: toDayString(i.invoiceDate),
    dueDate: i.dueDate ? toDayString(i.dueDate) : null,
    status: i.status as InvoiceStatus,
    subtotal: String(i.subtotal),
    discount: String(i.discount),
    taxPercent: String(i.taxPercent),
    taxAmount: String(i.taxAmount),
    total: String(i.total),
    amountPaid: String(i.amountPaid),
    itemCount: i._count.items,
    createdAt: i.createdAt.toISOString(),
  }
}

/**
 * GET /api/invoices?q=&customerId=&from=&to=
 * from/to berformat YYYY-MM-DD (inklusif). Urut invoiceDate desc lalu number desc.
 */
export async function GET(req: Request) {
  try {
    const session = await getSession(req)
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim() ?? ''
    const customerId = searchParams.get('customerId')?.trim() ?? ''
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const invoiceDateFilter: Prisma.DateTimeFilter = {}
    if (from) invoiceDateFilter.gte = parseDay(from, 'Tanggal awal')
    if (to) invoiceDateFilter.lt = new Date(parseDay(to, 'Tanggal akhir').getTime() + 24 * 60 * 60 * 1000)

    const where: Prisma.InvoiceWhereInput = {
      companyId: session.companyId,
      ...(customerId ? { customerId } : {}),
      ...(Object.keys(invoiceDateFilter).length > 0 ? { invoiceDate: invoiceDateFilter } : {}),
      ...(q
        ? {
            OR: [{ number: { contains: q } }, { customer: { name: { contains: q } } }],
          }
        : {}),
    }

    const invoices = await db.invoice.findMany({
      where,
      orderBy: [{ invoiceDate: 'desc' }, { number: 'desc' }],
      include: { customer: true, _count: { select: { items: true } } },
    })

    return NextResponse.json(invoices.map(mapToInvoiceListItem))
  } catch (e) {
    return handleApiError(e)
  }
}

/**
 * POST /api/invoices (izin invoices:write)
 * Buat invoice. Harga item di-resolve OTORITATIF di server:
 * harga khusus customer aktif (periode mencakup tanggal invoice, validFrom
 * terbaru bila tumpang tindih) → harga standar produk. priceSource MANUAL
 * hanya untuk peran berizin manual_price dan wajib menyertakan alasan.
 */
export async function POST(req: Request) {
  try {
    const session = await requirePerm(req, 'invoices:write')
    const body = await readJson(req)

    const customerId = requireText(body.customerId, 'Customer')
    const invoiceDate = parseDay(str(body.invoiceDate), 'Tanggal invoice')
    let dueDate: Date | null = null
    if (body.dueDate !== undefined && body.dueDate !== null) {
      dueDate = parseDay(str(body.dueDate), 'Tanggal jatuh tempo')
    }
    const note = optionalText(body.note)

    const rawItems = body.items
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new ApiError(400, 'Invoice harus memiliki minimal satu item.')
    }

    const created = await db.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: customerId, companyId: session.companyId },
        select: { id: true },
      })
      if (!customer) throw new ApiError(404, 'Data tidak ditemukan.')

      const itemData: Array<{
        productId: string
        productCode: string
        productName: string
        unit: string
        quantity: Prisma.Decimal
        unitPrice: Prisma.Decimal
        costPrice: Prisma.Decimal
        priceSource: PriceSource
        manualReason: string | null
        subtotal: Prisma.Decimal
      }> = []

      let subtotal = new Prisma.Decimal(0)

      for (const raw of rawItems) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          throw new ApiError(400, 'Format item invoice tidak valid.')
        }
        const item = raw as Record<string, unknown>

        const productId = requireText(item.productId, 'Produk')
        const quantity = requireDecimal(item.quantity, 'Jumlah (quantity)')
        if (quantity.comparedTo(0) <= 0) {
          throw new ApiError(400, 'Jumlah (quantity) harus lebih besar dari 0.')
        }

        const product = await tx.product.findFirst({
          where: { id: productId, companyId: session.companyId },
        })
        if (!product) throw new ApiError(404, 'Data tidak ditemukan.')

        const sourceRaw = str(item.priceSource) ?? 'STANDARD'
        if (sourceRaw !== 'CUSTOMER_PRICE' && sourceRaw !== 'STANDARD' && sourceRaw !== 'MANUAL') {
          throw new ApiError(400, 'Sumber harga tidak valid.')
        }

        let unitPrice: Prisma.Decimal
        let priceSource: PriceSource = sourceRaw
        let unit: string
        let manualReason: string | null = null

        if (priceSource === 'MANUAL') {
          if (!can(session.role, 'manual_price')) {
            throw new ApiError(403, 'Anda tidak memiliki izin mengubah harga secara manual.')
          }
          const manual = requireDecimal(item.unitPrice, 'Harga satuan manual')
          if (manual.comparedTo(0) < 0) {
            throw new ApiError(400, 'Harga tidak boleh negatif.')
          }
          const reason = str(item.manualReason)?.trim()
          if (!reason) {
            throw new ApiError(400, 'Alasan perubahan harga manual wajib diisi.')
          }
          unitPrice = manual
          manualReason = reason
          unit = product.unit
        } else {
          // Abaikan unitPrice dari klien; resolusi otoritatif di server.
          const special = await tx.customerProductPrice.findFirst({
            where: {
              companyId: session.companyId,
              customerId,
              productId,
              isActive: true,
              validFrom: { lte: invoiceDate },
              OR: [{ validUntil: null }, { validUntil: { gte: invoiceDate } }],
            },
            orderBy: { validFrom: 'desc' },
          })
          if (special) {
            unitPrice = special.sellingPrice
            priceSource = 'CUSTOMER_PRICE'
            unit = special.unit
          } else {
            unitPrice = product.sellingPrice
            priceSource = 'STANDARD'
            unit = product.unit
          }
        }

        const itemSubtotal = quantity.mul(unitPrice)
        subtotal = subtotal.add(itemSubtotal)

        itemData.push({
          productId,
          productCode: product.code,
          productName: product.name,
          unit,
          quantity,
          unitPrice,
          costPrice: product.costPrice,
          priceSource,
          manualReason,
          subtotal: itemSubtotal,
        })
      }

      const discount = optionalDecimal(body.discount, 'Diskon')
      if (discount.comparedTo(0) < 0) throw new ApiError(400, 'Diskon tidak boleh negatif.')
      if (discount.comparedTo(subtotal) > 0) {
        throw new ApiError(400, 'Diskon tidak boleh melebihi subtotal.')
      }

      const taxPercent = optionalDecimal(body.taxPercent, 'Persentase pajak')
      if (taxPercent.comparedTo(0) < 0 || taxPercent.comparedTo(100) > 0) {
        throw new ApiError(400, 'Persentase pajak harus antara 0 dan 100.')
      }

      const taxable = subtotal.sub(discount)
      const taxAmount = taxable.mul(taxPercent).div(100)
      const total = taxable.add(taxAmount)

      // Nomor invoice unik global: INV/{yyyyMMdd}/{seq padStart 3}.
      const dateKey = `${invoiceDate.getUTCFullYear()}${String(invoiceDate.getUTCMonth() + 1).padStart(2, '0')}${String(invoiceDate.getUTCDate()).padStart(2, '0')}`
      const dayStart = new Date(
        Date.UTC(invoiceDate.getUTCFullYear(), invoiceDate.getUTCMonth(), invoiceDate.getUTCDate()),
      )
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
      let seq = (await tx.invoice.count({ where: { invoiceDate: { gte: dayStart, lt: dayEnd } } })) + 1
      let number = ''
      for (;;) {
        number = `INV/${dateKey}/${String(seq).padStart(3, '0')}`
        const dup = await tx.invoice.findUnique({ where: { number }, select: { id: true } })
        if (!dup) break
        seq += 1
      }

      return tx.invoice.create({
        data: {
          number,
          customerId,
          invoiceDate,
          dueDate,
          status: 'UNPAID',
          subtotal,
          discount,
          taxPercent,
          taxAmount,
          total,
          amountPaid: new Prisma.Decimal(0),
          note,
          companyId: session.companyId,
          createdById: session.userId,
          items: { create: itemData },
        },
        include: { customer: true, items: true },
      })
    })

    return NextResponse.json(mapToInvoiceDTO(created), { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}
