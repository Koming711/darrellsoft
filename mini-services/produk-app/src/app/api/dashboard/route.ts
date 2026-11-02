import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, handleApiError, parseDay, toDayString } from '@/lib/server/context'
import type { DashboardDTO, InvoiceListItemDTO, InvoiceStatus } from '@/lib/types'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

function mapToInvoiceListItem(i: {
  id: string
  number: string
  customerId: string
  invoiceDate: Date
  dueDate: Date | null
  status: string
  subtotal: Prisma.Decimal
  discount: Prisma.Decimal
  taxPercent: Prisma.Decimal
  taxAmount: Prisma.Decimal
  total: Prisma.Decimal
  amountPaid: Prisma.Decimal
  createdAt: Date
  customer: { name: string }
  _count: { items: number }
}): InvoiceListItemDTO {
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

/** GET /api/dashboard — statistik ringkas untuk halaman utama. */
export async function GET(req: Request) {
  try {
    const session = await getSession(req)

    const now = new Date()
    const today = parseDay(toDayString(now), 'Tanggal')
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 12, 0, 0))
    const monthWhere = { companyId: session.companyId, invoiceDate: { gte: monthStart } }

    const [customerCount, productCount, activePriceCount, invoiceMonthCount, revenueAgg, monthInvoices, openInvoices, recentRaw] =
      await Promise.all([
        db.customer.count({ where: { companyId: session.companyId, isActive: true } }),
        db.product.count({ where: { companyId: session.companyId, isActive: true } }),
        db.customerProductPrice.count({
          where: {
            companyId: session.companyId,
            isActive: true,
            OR: [{ validUntil: null }, { validUntil: { gte: today } }],
          },
        }),
        db.invoice.count({ where: monthWhere }),
        db.invoice.aggregate({ where: monthWhere, _sum: { total: true } }),
        db.invoice.findMany({
          where: monthWhere,
          select: {
            items: {
              select: {
                productId: true,
                productName: true,
                subtotal: true,
                costPrice: true,
                quantity: true,
              },
            },
          },
        }),
        db.invoice.findMany({
          where: { companyId: session.companyId },
          select: { total: true, amountPaid: true },
        }),
        db.invoice.findMany({
          where: { companyId: session.companyId },
          orderBy: [{ invoiceDate: 'desc' }, { number: 'desc' }],
          take: 5,
          include: { customer: { select: { name: true } }, _count: { select: { items: true } } },
        }),
      ])

    // Margin bulan ini: Σ per item (subtotal − costPrice × quantity) + agregasi top produk.
    let marginMonth = new Prisma.Decimal(0)
    const productAgg = new Map<string, { productName: string; quantity: Prisma.Decimal; revenue: Prisma.Decimal }>()
    for (const inv of monthInvoices) {
      for (const it of inv.items) {
        marginMonth = marginMonth.add(it.subtotal.sub(it.costPrice.mul(it.quantity)))
        const agg =
          productAgg.get(it.productId) ??
          { productName: it.productName, quantity: new Prisma.Decimal(0), revenue: new Prisma.Decimal(0) }
        agg.quantity = agg.quantity.add(it.quantity)
        agg.revenue = agg.revenue.add(it.subtotal)
        productAgg.set(it.productId, agg)
      }
    }

    const topProducts = Array.from(productAgg.entries())
      .sort((a, b) => b[1].revenue.comparedTo(a[1].revenue))
      .slice(0, 5)
      .map(([productId, agg]) => ({
        productId,
        productName: agg.productName,
        quantity: String(agg.quantity),
        revenue: String(agg.revenue),
      }))

    // Piutang: Σ (total − amountPaid) untuk invoice dengan total > amountPaid.
    let receivables = new Prisma.Decimal(0)
    for (const inv of openInvoices) {
      if (inv.total.comparedTo(inv.amountPaid) > 0) {
        receivables = receivables.add(inv.total.sub(inv.amountPaid))
      }
    }

    const data: DashboardDTO = {
      stats: {
        customerCount,
        productCount,
        activePriceCount,
        invoiceMonthCount,
        revenueMonth: String(revenueAgg._sum.total ?? new Prisma.Decimal(0)),
        marginMonth: String(marginMonth),
        receivables: String(receivables),
      },
      recentInvoices: recentRaw.map(mapToInvoiceListItem),
      topProducts,
    }

    return NextResponse.json(data)
  } catch (e) {
    return handleApiError(e)
  }
}
