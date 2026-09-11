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
 *   due:    [{ id, number, date, customerName, total, sisa, dueDate, data }],
 *   // --- Field tambahan Task 30 (desain beranda dari arsip) ---
 *   cards: { revenue, invoiceCount, paidThisMonth, unpaidTotal, unpaidCount,
 *            margin, expenseThisMonth, dueSoonCount },
 *   status: { lunas, belum, jatuhTempo },      // invoice bulan ini (donut)
 *   monthly: [{ label: 'Jan', value }],        // 6 bulan terakhir
 *   daily: [{ label: 'Sen', value }],          // 14 hari (nilai invoice/hari)
 *   topCustomers: [{ name, count, total }],    // bulan ini, top 5
 *   topItems: [{ name, qty, unit, total }],    // bulan ini, top 5
 *   ops: { sjCount, poCount },                 // dokumen dibuat bulan ini
 *   dueSoon: [{ id, number, customerName, sisa, dueDate, overdue, overdueDays, data }]
 * }
 *
 * Rumus margin (selaras laporan rugi-laba):
 *   per item: (harga − modal snapshot) × qty; fallback invoice lama tanpa
 *   snapshot modal → pakai uangCapek; tidak ada keduanya → 0.
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

    // ===== Task 30: agregasi tambahan untuk beranda baru =====
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` // YYYY-MM
    const monthStartDate = `${monthKey}-01`
    const inThisMonth = (dateStr: string) => Boolean(dateStr) && dateStr.slice(0, 7) === monthKey

    // --- Kartu ringkasan (bulan berjalan) ---
    let revenue = 0
    let invoiceCount = 0
    let margin = 0
    let paidThisMonth = 0
    for (const p of parsed) {
      if (!inThisMonth(p.date)) continue
      invoiceCount++
      revenue += p.total
      // Laba kotor: snapshot modal per item; fallback uangCapek (invoice lama)
      try {
        const d = p.data as Record<string, unknown>
        const items = Array.isArray(d.items) ? (d.items as Record<string, unknown>[]) : []
        let hpp = 0
        let hasModal = false
        for (const it of items) {
          const m = Number(it.modal ?? NaN)
          if (Number.isFinite(m)) {
            hasModal = true
            hpp += Number(it.qty ?? 0) * m
          }
        }
        // Laba Kotor = Penjualan − Harga Pokok (selaras /api/laporan/rugi-laba);
        // p.total sudah termasuk PPN, hpp dari snapshot modal per item
        if (hasModal) margin += p.total - hpp
        else margin += Number(d.uangCapek ?? 0)
      } catch {
        /* skip */
      }
      // Pembayaran masuk: DP (saat invoice dibuat) + reguler lunas (penuh)
      if (p.type === 'DP') paidThisMonth += p.dpAmount
      else if (p.status === 'LUNAS') paidThisMonth += p.total
    }
    // Pembayaran masuk dari pelunasan bulan ini (invoice bulan lama pun terhitung)
    for (const pel of pelunasan) {
      try {
        const d = JSON.parse(pel.dataJson) as Record<string, unknown>
        const tgl = String(d.tanggalPelunasan ?? d.tanggal ?? '').slice(0, 10)
        if (!inThisMonth(tgl)) continue
        const items = Array.isArray(d.items) ? (d.items as Record<string, unknown>[]) : []
        const subtotal = items.reduce((s, it) => s + Number(it.qty ?? 0) * Number(it.harga ?? 0), 0)
        const ppn = Number(d.ppn ?? 0)
        const docTotal = Number(d.originalTotal ?? 0) > 0 ? Number(d.originalTotal) : subtotal + subtotal * (ppn / 100)
        const dpAmount =
          d.dpAmount !== undefined && d.dpAmount !== null && Number(d.dpAmount) > 0
            ? Number(d.dpAmount)
            : docTotal * (Number(d.dp ?? 0) / 100)
        paidThisMonth += Math.max(0, docTotal - dpAmount)
      } catch {
        /* skip rusak */
      }
    }

    // Biaya operasional bulan ini (tabel Biaya — selaras modul Biaya Operasional)
    let expenseThisMonth = 0
    try {
      const biayaAgg = await db.biaya.aggregate({
        where: { ...dataFilter, tanggal: { gte: monthStartDate, lte: `${monthKey}-31` } },
        _sum: { jumlah: true },
      })
      expenseThisMonth = biayaAgg._sum.jumlah ?? 0
    } catch {
      /* biaya ops tidak kritikal */
    }

    // --- Donut status invoice bulan ini ---
    const status = { lunas: 0, belum: 0, jatuhTempo: 0 }
    for (const p of parsed) {
      if (!inThisMonth(p.date)) continue
      if (p.status === 'LUNAS') status.lunas++
      else if (p.dueDate && p.dueDate < todayKey) status.jatuhTempo++
      else status.belum++
    }

    // --- Grafik batang: 6 bulan terakhir ---
    const monthly: { label: string; value: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString('id-ID', { month: 'short' })
      let value = 0
      for (const p of parsed) if (p.date.slice(0, 7) === key) value += p.total
      monthly.push({ label, value: Math.round(value) })
    }

    // --- Grafik batang: 14 hari (nilai invoice per hari) ---
    const daily = days.map((d) => ({ label: d.label, value: d.penjualan }))

    // --- Peringkat pelanggan & produk (bulan ini) ---
    const custMap = new Map<string, { name: string; count: number; total: number }>()
    const itemMap = new Map<string, { name: string; qty: number; unit: string; total: number }>()
    for (const p of parsed) {
      if (!inThisMonth(p.date)) continue
      if (p.customerName && p.customerName !== '-') {
        const c = custMap.get(p.customerName) ?? { name: p.customerName, count: 0, total: 0 }
        c.count++
        c.total += p.total
        custMap.set(p.customerName, c)
      }
      try {
        const d = p.data as Record<string, unknown>
        const items = Array.isArray(d.items) ? (d.items as Record<string, unknown>[]) : []
        for (const it of items) {
          const nama = String(it.deskripsi ?? '').trim()
          if (!nama) continue
          const qty = Number(it.qty ?? 0)
          const harga = Number(it.harga ?? 0)
          const unit = String(it.satuan ?? 'pcs')
          const prev = itemMap.get(nama) ?? { name: nama, qty: 0, unit, total: 0 }
          prev.qty += qty
          prev.total += qty * harga
          itemMap.set(nama, prev)
        }
      } catch {
        /* skip */
      }
    }
    const topCustomers = Array.from(custMap.values()).sort((a, b) => b.total - a.total).slice(0, 5)
    const topItems = Array.from(itemMap.values()).sort((a, b) => b.total - a.total).slice(0, 5)

    // --- Strip operasional: SJ & PO dibuat bulan ini ---
    let sjCount = 0
    let poCount = 0
    try {
      const [sj, po] = await Promise.all([
        db.documentHistory.count({
          where: { docType: 'surat-jalan', deletedAt: null, ...dataFilter, createdAt: { gte: new Date(`${monthStartDate}T00:00:00.000Z`) } },
        }),
        db.documentHistory.count({
          where: { docType: 'purchase-order', deletedAt: null, ...dataFilter, createdAt: { gte: new Date(`${monthStartDate}T00:00:00.000Z`) } },
        }),
      ])
      sjCount = sj
      poCount = po
    } catch {
      /* non-kritikal */
    }

    // --- Pengingat jatuh tempo: belum lunas & tempo ≤ 7 hari (termasuk terlambat) ---
    const dueSoonParsed = parsed
      .filter((p) => {
        if (p.status !== 'BELUM' || !p.dueDate) return false
        const due = new Date(`${p.dueDate}T00:00:00`)
        if (Number.isNaN(due.getTime())) return false
        const limit = new Date(now)
        limit.setDate(limit.getDate() + 7)
        return p.dueDate <= `${limit.getFullYear()}-${String(limit.getMonth() + 1).padStart(2, '0')}-${String(limit.getDate()).padStart(2, '0')}`
      })
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
    const dueSoonCount = dueSoonParsed.length
    const dueSoon = dueSoonParsed.slice(0, 8).map((p) => {
      const dueMs = new Date(`${p.dueDate}T00:00:00`).getTime() - new Date(todayKey + 'T00:00:00').getTime()
      const overdueDays = Math.floor(dueMs / 86400000)
      return {
        id: p.id,
        number: p.number,
        customerName: p.customerName,
        sisa: p.sisa,
        dueDate: p.dueDate,
        overdue: overdueDays > 0,
        overdueDays: Math.max(0, overdueDays),
        data: p.data,
      }
    })

    return NextResponse.json(
      {
        user: { name: userInfo?.username ?? user?.name ?? '', role: userInfo?.role ?? user?.role ?? '' },
        stats: { totalPenjualan, totalPiutang, invoiceBelumLunas, totalPelanggan: pelangganCount },
        chart: days,
        recent,
        due,
        cards: {
          revenue: Math.round(revenue),
          invoiceCount,
          paidThisMonth: Math.round(paidThisMonth),
          unpaidTotal: totalPiutang,
          unpaidCount: invoiceBelumLunas,
          margin: Math.round(Math.max(0, margin)),
          expenseThisMonth: Math.round(expenseThisMonth),
          dueSoonCount,
        },
        status,
        monthly,
        daily,
        topCustomers,
        topItems,
        ops: { sjCount, poCount },
        dueSoon,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e) {
    console.error('GET /api/beranda error:', e)
    return NextResponse.json({ error: 'Gagal memuat data beranda' }, { status: 500 })
  }
}
