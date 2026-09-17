import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'

// One barang (item) row billed on a purchase invoice.
interface CustomerBarangItem {
  id: string
  nomor: string
  tanggal: string
  createdAt: string
  namaBarang: string
  qty: number
  hargaSatuan: number
  totalHarga: number
}

interface CustomerBarangResponse {
  success: true
  customer: string
  totalBarang: number
  barang: CustomerBarangItem[]
}

interface InvoiceItemRaw {
  deskripsi?: string
  qty?: number
  harga?: number
}

// GET /api/customer-barang?customer=Nama%20Customer
// Returns the item (barang) list billed to one customer, aggregated from the
// user's invoice history (per-user isolation). Pelunasan (PEL) continuation
// entries are excluded because they duplicate the items of their parent DP
// invoice — the parent already lists every barang of the purchase.
export async function GET(request: NextRequest): Promise<NextResponse<CustomerBarangResponse | { error: string }>> {
  try {
    const user = getServerUser(request)
    const authErr = requireAuth(request)
    if (authErr) return authErr

    const { searchParams } = new URL(request.url)
    const customerName = (searchParams.get('customer') || '').trim()
    if (!customerName) {
      return NextResponse.json({ error: 'Parameter customer wajib diisi' }, { status: 400 })
    }

    // Strict per-user isolation: every account only sees their own data.
    const dataFilter = await getDataFilter(user)

    const histories = await db.documentHistory.findMany({
      where: { docType: 'invoice', ...dataFilter },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    })

    const wanted = customerName.toLowerCase()
    const barang: CustomerBarangItem[] = []

    for (const h of histories) {
      // Skip pelunasan continuation invoices (duplicate of the DP invoice items)
      const nomor = h.nomor || ''
      if (nomor.startsWith('PEL/')) continue

      let parsed: {
        client?: { nama?: string }
        items?: InvoiceItemRaw[]
        type?: string
      } = {}
      try {
        parsed = JSON.parse(h.dataJson)
      } catch {
        continue
      }
      if (parsed.type === 'invoice-pelunasan') continue

      const rawName = (parsed.client?.nama || h.pihakKedua || '').trim()
      if (rawName.toLowerCase() !== wanted) continue

      const items = Array.isArray(parsed.items) ? parsed.items : []
      for (const [idx, it] of items.entries()) {
        const deskripsi = (it.deskripsi || '').trim()
        const qty = Number(it.qty) || 0
        const hargaSatuan = Number(it.harga) || 0
        if (!deskripsi && qty === 0) continue
        barang.push({
          id: `${h.id}-${idx}`,
          nomor,
          tanggal: h.tanggal || '',
          createdAt: h.createdAt.toISOString(),
          namaBarang: deskripsi || '-',
          qty,
          hargaSatuan,
          totalHarga: qty * hargaSatuan,
        })
      }
    }

    return NextResponse.json({
      success: true,
      customer: customerName,
      totalBarang: barang.length,
      barang,
    })
  } catch (error) {
    console.error('GET /api/customer-barang error:', error)
    return NextResponse.json({ error: 'Gagal mengambil daftar barang customer' }, { status: 500 })
  }
}
