import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handleApiError, parseDay, requirePerm, toDayString } from '@/lib/server/context'
import type { MarginReportDTO } from '@/lib/types'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

/**
 * GET /api/reports/margin?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Default periode: awal bulan berjalan s.d. hari ini.
 * Semua perhitungan uang memakai Prisma.Decimal.
 */
export async function GET(req: Request) {
  try {
    const session = await requirePerm(req, 'reports:read')
    const { searchParams } = new URL(req.url)

    const now = new Date()
    const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 12, 0, 0))
    const from = searchParams.get('from') ? parseDay(searchParams.get('from'), 'Tanggal awal') : defaultFrom
    const to = searchParams.get('to') ? parseDay(searchParams.get('to'), 'Tanggal akhir') : parseDay(toDayString(now), 'Tanggal akhir')
    // Inklusivitas: from <= invoiceDate < (to + 1 hari).
    const toExclusive = new Date(to.getTime() + 24 * 60 * 60 * 1000)

    const invoices = await db.invoice.findMany({
      where: {
        companyId: session.companyId,
        invoiceDate: { gte: from, lt: toExclusive },
      },
      include: { customer: true, items: true },
      orderBy: [{ invoiceDate: 'asc' }, { number: 'asc' }],
    })

    let revenue = new Prisma.Decimal(0)
    let discountTotal = new Prisma.Decimal(0)
    let taxTotal = new Prisma.Decimal(0)
    let hppTotal = new Prisma.Decimal(0)

    const byInvoice = invoices.map((inv) => {
      let invHpp = new Prisma.Decimal(0)
      for (const it of inv.items) {
        revenue = revenue.add(it.subtotal)
        invHpp = invHpp.add(it.costPrice.mul(it.quantity))
      }
      discountTotal = discountTotal.add(inv.discount)
      taxTotal = taxTotal.add(inv.taxAmount)
      hppTotal = hppTotal.add(invHpp)

      return {
        id: inv.id,
        number: inv.number,
        invoiceDate: toDayString(inv.invoiceDate),
        customerName: inv.customer.name,
        subtotal: String(inv.subtotal),
        discount: String(inv.discount),
        taxAmount: String(inv.taxAmount),
        total: String(inv.total),
        hpp: String(invHpp),
        grossProfit: String(inv.subtotal.sub(invHpp)),
      }
    })

    const grossProfit = revenue.sub(hppTotal)
    const marginPercent =
      revenue.comparedTo(0) > 0
        ? grossProfit.mul(100).div(revenue).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2)
        : '0.00'

    // Agregasi per produk (snapshot dari item invoice).
    const productAgg = new Map<
      string,
      {
        productCode: string
        productName: string
        quantity: Prisma.Decimal
        revenue: Prisma.Decimal
        hpp: Prisma.Decimal
      }
    >()
    for (const inv of invoices) {
      for (const it of inv.items) {
        const agg =
          productAgg.get(it.productId) ??
          {
            productCode: it.productCode,
            productName: it.productName,
            quantity: new Prisma.Decimal(0),
            revenue: new Prisma.Decimal(0),
            hpp: new Prisma.Decimal(0),
          }
        agg.quantity = agg.quantity.add(it.quantity)
        agg.revenue = agg.revenue.add(it.subtotal)
        agg.hpp = agg.hpp.add(it.costPrice.mul(it.quantity))
        productAgg.set(it.productId, agg)
      }
    }

    const byProduct = Array.from(productAgg.entries())
      .sort((a, b) => b[1].revenue.comparedTo(a[1].revenue))
      .map(([productId, agg]) => ({
        productId,
        productCode: agg.productCode,
        productName: agg.productName,
        quantity: String(agg.quantity),
        revenue: String(agg.revenue),
        hpp: String(agg.hpp),
        grossProfit: String(agg.revenue.sub(agg.hpp)),
      }))

    const data: MarginReportDTO = {
      from: toDayString(from),
      to: toDayString(to),
      totals: {
        revenue: String(revenue),
        discount: String(discountTotal),
        taxAmount: String(taxTotal),
        hpp: String(hppTotal),
        grossProfit: String(grossProfit),
        marginPercent,
        invoiceCount: invoices.length,
      },
      byInvoice,
      byProduct,
    }

    return NextResponse.json(data)
  } catch (e) {
    return handleApiError(e)
  }
}
