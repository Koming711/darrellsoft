import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'

interface CustomerOption {
  name: string
  company: string | null
  hasInvoices: boolean
}

interface CustomersResponse {
  success: true
  customers: CustomerOption[]
}

interface InvoiceDataRaw {
  client?: { nama?: string }
  type?: string
}

// GET /api/customer-barang/customers
// Feeds the "Daftar Barang per Customer" page selector. Returns the current
// user's master customers UNION every client name found in the user's own
// invoice history — so customers that only appear on invoices (never added to
// the master list) are still selectable and their barang list can be shown.
// Case-insensitive dedupe; master entries win and keep their company name.
// Pelunasan (PEL) continuation entries are excluded because they duplicate the
// client of their parent DP invoice.
export async function GET(request: NextRequest): Promise<NextResponse<CustomersResponse | { error: string }>> {
  try {
    const user = getServerUser(request)
    const authErr = requireAuth(request)
    if (authErr) return authErr

    // Strict per-user isolation: every account only sees their own data.
    const dataFilter = await getDataFilter(user)

    const [masterCustomers, histories] = await Promise.all([
      db.customer.findMany({
        where: dataFilter,
        select: { name: true, companyName: true },
        orderBy: { name: 'asc' },
      }),
      db.documentHistory.findMany({
        where: { docType: 'invoice', ...dataFilter },
        select: { nomor: true, dataJson: true },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
    ])

    const map = new Map<string, CustomerOption>()
    const keyOf = (n: string) => n.toLowerCase().trim()

    for (const c of masterCustomers) {
      const name = (c.name || '').trim()
      if (!name) continue
      map.set(keyOf(name), { name, company: c.companyName?.trim() || null, hasInvoices: false })
    }

    for (const h of histories) {
      const nomor = h.nomor || ''
      if (nomor.startsWith('PEL/')) continue

      let parsed: InvoiceDataRaw = {}
      try {
        parsed = JSON.parse(h.dataJson)
      } catch {
        continue
      }
      if (parsed.type === 'invoice-pelunasan') continue

      const name = (parsed.client?.nama || '').trim()
      if (!name) continue

      const key = keyOf(name)
      const existing = map.get(key)
      if (existing) {
        existing.hasInvoices = true
      } else {
        map.set(key, { name, company: null, hasInvoices: true })
      }
    }

    const customers = Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'id', { sensitivity: 'base' })
    )

    return NextResponse.json({ success: true, customers })
  } catch (error) {
    console.error('GET /api/customer-barang/customers error:', error)
    return NextResponse.json({ error: 'Gagal mengambil daftar customer' }, { status: 500 })
  }
}
