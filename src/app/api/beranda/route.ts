import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter } from '@/lib/server-auth'

/**
 * GET /api/beranda — agregat data untuk halaman Beranda (/pembukaan).
 * Isolasi per-user via getDataFilter (superadmin/admin melihat semua).
 *
 * Response:
 * {
 *   user: { name, role },
 *   stats: { totalPenjualan, totalPiutang, invoiceBelumLunas, totalPelanggan },
 *   chart: [{ tanggal: 'YYYY-MM-DD', label: 'Sen', penjualan, pembayaran }], // 14 hari
 *   recent: [{ id, number, date, customerName, total, type, status, dueDate, data }],
 *   due:    [{ id, number, date, customerName, total, sisa, dueDate, data }]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const dataFilter = await getDataFilter(user)

    const invFilter = { docType: 'invoice', deletedAt: null, ...dataFilter }
    const pelFilter = { docType: 'invoice-pelunasan', deletedAt: null, ...dataFilter }

    const [invoices, pelunasan, pelangganCount, userInfo] = await Promise.all([
      db.documentHistory.findMany({
        where: invFilter,
        orderBy: { createdAt: 'desc' },
        select: { id: true, nomor: true, tanggal: true, pihakKedua: true, dataJson: true, createdAt: true },
      }),
      db.documentHistory.findMany({
        where: pelFilter,
        orderBy: { createdAt: 'desc' },
        select: { id: true, nomor: true, pihakKedua: true, dataJson: true, createdAt: true },
      }),
      db.customer.count({ where: dataFilter }),
      user?.id
        ? db.pengguna.findUnique({ where: { id: user.id }, select: { username: true, role: true } })
        : Promise.resolve(null),
    ])

    // ===== Parse invoice =====
    type ParsedInvoice = {
      id: string
      number: string
      date: string
      customerName: string
      total: number
      type: 'REGULER' | 'DP'
      status: 'LUNAS' | 'BELUM'
      dueDate: string
      dpAmount: number
      sisa: number
      data: Record<string, unknown>
    }
    const parsed: ParsedInvoice[] = []
    for (const inv of invoices) {
      try {
        const d = JSON.parse(inv.dataJson) as Record<string, unknown>
        const items = Array.isArray(d.items) ? (d.items as Record<string, unknown>[]) : []
        const subtotal = items.reduce((s, it) => s + Number(it.qty ?? 0) * Number(it.harga ?? 0), 0)
        const ppn = Number(d.ppn ?? 0)
        const total = subtotal + subtotal * (ppn / 100)
        const dpAmount =
          d.dpAmount !== undefined && d.dpAmount !== null && Number(d.dpAmount) > 0
            ? Number(d.dpAmount)
            : total * (Number(d.dp ?? 0) / 100)
        const lunas = d.lunas === true
        const isDp = dpAmount > 0
        parsed.push({
          id: inv.id,
          number: inv.nomor,
          date: String(d.tanggal ?? inv.tanggal ?? inv.createdAt.toISOString()).slice(0, 10),
          customerName: inv.pihakKedua || String((d.client as Record<string, unknown> | undefined)?.nama ?? '') || '-',
          total: Math.round(total),
          type: isDp ? 'DP' : 'REGULER',
          status: lunas ? 'LUNAS' : 'BELUM',
          dueDate: String(d.tanggalJatuhTempo ?? ''),
          dpAmount: Math.round(dpAmount),
          sisa: Math.max(0, Math.round(total - dpAmount)),
          data: d,
        })
      } catch {
        /* skip rusak */
      }
    }

    // ===== Stats =====
    const totalPenjualan = parsed.reduce((s, p) => s + p.total, 0)
    const totalPiutang = parsed.reduce((s, p) => s + (p.status === 'LUNAS' ? 0 : p.sisa), 0)
    const invoiceBelumLunas = parsed.filter((p) => p.status === 'BELUM').length

    // ===== Chart 14 hari =====
    const days: { tanggal: string; label: string; penjualan: number; pembayaran: number }[] = []
    const byDateSales = new Map<string, number>()
    for (const p of parsed) byDateSales.set(p.date, (byDateSales.get(p.date) ?? 0) + p.total)

    const byDatePay = new Map<string, number>()
    for (const pel of pelunasan) {
      try {
        const d = JSON.parse(pel.dataJson) as Record<string, unknown>
        const tgl = String(d.tanggalPelunasan ?? d.tanggal ?? pel.createdAt.toISOString()).slice(0, 10)
        const items = Array.isArray(d.items) ? (d.items as Record<string, unknown>[]) : []
        const subtotal = items.reduce((s, it) => s + Number(it.qty ?? 0) * Number(it.harga ?? 0), 0)
        const ppn = Number(d.ppn ?? 0)
        const docTotal = Number(d.originalTotal ?? 0) > 0 ? Number(d.originalTotal) : subtotal + subtotal * (ppn / 100)
        const dpAmount =
          d.dpAmount !== undefined && d.dpAmount !== null && Number(d.dpAmount) > 0
            ? Number(d.dpAmount)
            : docTotal * (Number(d.dp ?? 0) / 100)
        const nominal = Math.max(0, docTotal - dpAmount)
        byDatePay.set(tgl, (byDatePay.get(tgl) ?? 0) + nominal)
      } catch {
        /* skip rusak */
      }
    }

    const now = new Date()
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      days.push({
        tanggal: key,
        label: d.toLocaleDateString('id-ID', { weekday: 'short' }),
        penjualan: Math.round(byDateSales.get(key) ?? 0),
        pembayaran: Math.round(byDatePay.get(key) ?? 0),
      })
    }

    // ===== Recent invoices (8 terbaru) =====
    const recent = parsed.slice(0, 8).map((p) => ({
      id: p.id,
      number: p.number,
      date: p.date,
      customerName: p.customerName,
      total: p.total,
      type: p.type,
      status: p.status,
      dueDate: p.dueDate,
      data: p.data,
    }))

    // ===== Jatuh tempo: belum lunas + tanggal jatuh tempo sudah lewat/hari ini =====
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const due = parsed
      .filter((p) => p.status === 'BELUM' && p.dueDate && p.dueDate <= todayKey)
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
      .slice(0, 8)
      .map((p) => ({
        id: p.id,
        number: p.number,
        date: p.date,
        customerName: p.customerName,
        total: p.total,
        sisa: p.sisa,
        dueDate: p.dueDate,
        data: p.data,
      }))

    return NextResponse.json(
      {
        user: { name: userInfo?.username ?? user?.name ?? '', role: userInfo?.role ?? user?.role ?? '' },
        stats: { totalPenjualan, totalPiutang, invoiceBelumLunas, totalPelanggan: pelangganCount },
        chart: days,
        recent,
        due,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e) {
    console.error('GET /api/beranda error:', e)
    return NextResponse.json({ error: 'Gagal memuat data beranda' }, { status: 500 })
  }
}
