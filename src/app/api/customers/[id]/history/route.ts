import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

interface InvoiceDataRaw {
  lunas?: boolean
  items?: { deskripsi?: string; qty?: number }[]
  type?: string
}

interface HistoryInvoice {
  id: string
  number: string
  date: string
  status: string // 'LUNAS' | 'BELUM'
  items: { id: string; name: string; qty: number; totalQty: number; status: string }[]
}

/**
 * GET /api/customers/[id]/history — riwayat invoice customer.
 * Invoice disimpan di DocumentHistory (docType=invoice) dan terhubung ke
 * customer lewat nama (pihakKedua / dataJson.client.nama). Entri pelunasan
 * (PEL) dilewati karena menduplikasi item invoice DP induknya.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const { id } = await params

    const customer = await db.customer.findUnique({ where: { id } })
    if (!customer) {
      return NextResponse.json({ error: 'Customer tidak ditemukan' }, { status: 404 })
    }
    if (customer.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    const dataFilter = await getDataFilter(user)
    const histories = await db.documentHistory.findMany({
      where: { docType: 'invoice', ...dataFilter, pihakKedua: customer.name.trim() },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    const invoices: HistoryInvoice[] = []
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

      const items = Array.isArray(parsed.items) ? parsed.items : []
      invoices.push({
        id: h.id,
        number: nomor,
        date: h.tanggal || '',
        status: parsed.lunas ? 'LUNAS' : 'BELUM',
        items: items.map((it, idx) => {
          const qty = Number(it.qty) || 0
          const name = (it.deskripsi || '-').split('\n')[0].trim() || '-'
          return { id: `${h.id}-${idx}`, name, qty, totalQty: qty, status: '' }
        }),
      })
    }

    return NextResponse.json({ customer, invoices })
  } catch (error: unknown) {
    console.error('Error fetching customer history:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal mengambil riwayat customer') },
      { status: 500 }
    )
  }
}
