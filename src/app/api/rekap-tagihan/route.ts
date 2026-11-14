import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, getServerUser, getDataFilter } from '@/lib/server-auth'

/**
 * API Rekap Tagihan Customer (halaman /rekap-tagihan).
 *
 * Dua mode GET:
 *  1. ?list=1
 *     → daftar nama customer (distinct dari invoice dalam cakupan data user).
 *       Dipakai fallback daftar dropdown "Pilih Customer".
 *
 *  2. ?customer=<nama|__all__>&month=1..12&year=YYYY
 *     → rows rekap tagihan invoice pada bulan/tahun tsb.
 *       customer = '__all__' → SEMUA customer (opsi "Semua Customer").
 *
 * Rumus identik dengan Piutang Dagang (sumber: docType=invoice):
 *   subtotal = Σ qty × harga
 *   total    = round(subtotal + subtotal × ppn%)
 *   dpAmount = dpAmount > 0 ? round(dpAmount) : round(total × dp%)
 *   sisa     = max(0, total − dpAmount)
 *   lunas    = p.lunas === true
 * Invoice batal di-skip.
 *
 * CATATAN (Task 36): kolom Total Harga menampilkan HARGA PENUH invoice (total)
 * bila lunas — sebagai riwayat — tetapi kolom tersebut TIDAK dihitung ke
 * totalTagihan (TOTAL = Σ sisa invoice yang BELUM lunas saja).
 *
 * tanggalLabel berformat dd/mm/yy (Task 35); tanggal tidak valid → fallback
 * string tanggal mentah.
 */

interface RekapRow {
  id: string
  nomor: string
  tanggal: string
  tanggalLabel: string // dd/mm/yy
  customerName: string
  namaCetakan: string
  itemCount: number
  total: number
  sisa: number
  lunas: boolean
}

export async function GET(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr

    const user = getServerUser(request)
    const baseFilter = (await getDataFilter(user)) as Record<string, unknown>

    const { searchParams } = new URL(request.url)

    // ===== Mode 1: daftar customer (distinct dari invoice) =====
    if (searchParams.get('list') === '1') {
      const docs = await db.documentHistory.findMany({
        where: { ...baseFilter, docType: 'invoice', deletedAt: null },
        select: { pihakKedua: true, dataJson: true },
      })
      const set = new Set<string>()
      for (const d of docs) {
        let nama = d.pihakKedua || ''
        try {
          const p = JSON.parse(d.dataJson) as Record<string, unknown>
          const client = p.client as Record<string, unknown> | undefined
          if (client && typeof client.nama === 'string' && client.nama) nama = client.nama
        } catch {
          /* dataJson rusak → pakai pihakKedua */
        }
        if (nama) set.add(nama)
      }
      const customers = Array.from(set).sort((a, b) =>
        a.localeCompare(b, 'id', { sensitivity: 'base' })
      )
      return NextResponse.json({ success: true, customers })
    }

    // ===== Mode 2: rekap per bulan =====
    const customer = (searchParams.get('customer') ?? '').trim()
    const month = Number(searchParams.get('month'))
    const year = Number(searchParams.get('year'))

    if (
      !customer ||
      !Number.isInteger(month) || month < 1 || month > 12 ||
      !Number.isInteger(year) || year < 2000 || year > 2100
    ) {
      return NextResponse.json(
        { error: 'Parameter customer, month (1-12), dan year wajib diisi' },
        { status: 400 }
      )
    }

    const mm = String(month).padStart(2, '0')
    const prefix = `${year}-${mm}`

    const docs = await db.documentHistory.findMany({
      where: {
        ...baseFilter,
        docType: 'invoice',
        deletedAt: null,
        tanggal: { startsWith: prefix },
      },
      orderBy: [{ tanggal: 'asc' }, { nomor: 'asc' }],
    })

    const isAll = customer === '__all__'
    const rows: RekapRow[] = []
    let totalTagihan = 0
    let jumlahBelumLunas = 0

    for (const d of docs) {
      let p: Record<string, unknown>
      try {
        p = JSON.parse(d.dataJson) as Record<string, unknown>
      } catch {
        continue // dataJson rusak → skip
      }
      // Invoice batal bukan tagihan (selaras Piutang Dagang / beranda)
      if (p.batal === true || p.batal === 'true') continue

      const itemsRaw = Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : []
      const subtotal = itemsRaw.reduce(
        (acc, it) => acc + Number(it.qty ?? 0) * Number(it.harga ?? 0),
        0
      )
      const ppn = Number(p.ppn ?? 0)
      const total = Math.round(subtotal + subtotal * (ppn / 100))
      const dpAmount =
        p.dpAmount !== undefined && p.dpAmount !== null && Number(p.dpAmount) > 0
          ? Math.round(Number(p.dpAmount))
          : Math.round(total * (Number(p.dp ?? 0) / 100))
      const sisa = Math.max(0, total - dpAmount)
      const lunas = p.lunas === true

      const clientObj = p.client as Record<string, unknown> | undefined
      const customerName =
        (clientObj && typeof clientObj.nama === 'string' && clientObj.nama
          ? clientObj.nama
          : '') || d.pihakKedua || '-'

      // Filter customer spesifik (mode '__all__' lewati)
      if (!isAll && customerName !== customer) continue

      const tanggal = String(p.tanggal ?? d.tanggal ?? '').slice(0, 10)
      const tParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tanggal)
      const tanggalLabel = tParts
        ? `${tParts[3]}/${tParts[2]}/${tParts[1].slice(2)}`
        : tanggal

      const namaCetakan =
        itemsRaw
          .map((it) => String(it.deskripsi ?? it.nama ?? '').trim())
          .filter(Boolean)
          .join(', ') || '-'

      rows.push({
        id: d.id,
        nomor: d.nomor,
        tanggal,
        tanggalLabel,
        customerName,
        namaCetakan,
        itemCount: itemsRaw.length,
        total,
        sisa,
        lunas,
      })

      // TOTAL hanya menjumlahkan sisa invoice yang BELUM lunas
      if (!lunas) {
        totalTagihan += sisa
        jumlahBelumLunas += 1
      }
    }

    return NextResponse.json({
      success: true,
      customer,
      month,
      year,
      rows,
      totalTagihan,
      jumlahInvoice: rows.length,
      jumlahBelumLunas,
    })
  } catch (error) {
    console.error('Error rekap-tagihan:', error)
    return NextResponse.json(
      { error: 'Gagal memuat data rekap tagihan' },
      { status: 500 }
    )
  }
}
