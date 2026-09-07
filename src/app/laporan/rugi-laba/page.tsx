'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Coins, FileDown, PiggyBank, Printer, TrendingDown, TrendingUp, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/dashboard-layout'
import { apiFetch } from '@/lib/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

// ===== Types =====
interface DetailRow {
  invoiceId: string
  nomor: string
  tanggal: string
  customer: string
  barang: string
  qty: number
  harga: number
  totalJual: number
  modal: number
  totalModal: number
  laba: number
  estimated: boolean
}

interface PlSummary {
  penjualan: number
  hargaPokok: number
  labaKotor: number
  biayaOperasional: number
  labaBersih: number
  jumlahInvoice: number
}

type PeriodType = 'today' | 'week' | 'month' | 'year' | 'custom'

// ===== Helpers =====
function formatRupiah(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0)
}

function formatDateID(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtISO(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function getFilterDates(period: PeriodType, customStart: string, customEnd: string): { start: string; end: string } {
  const now = new Date()
  const today = fmtISO(now)
  if (period === 'today') return { start: today, end: today }
  if (period === 'week') {
    const day = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return { start: fmtISO(monday), end: fmtISO(sunday) }
  }
  if (period === 'month') {
    return { start: fmtISO(new Date(now.getFullYear(), now.getMonth(), 1)), end: fmtISO(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }
  }
  if (period === 'year') return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` }
  return { start: customStart || '2000-01-01', end: customEnd || today }
}

function periodLabel(period: PeriodType, customStart: string, customEnd: string): string {
  if (period === 'today') return 'Hari Ini'
  if (period === 'week') return 'Minggu Ini'
  if (period === 'month') return 'Bulan Ini'
  if (period === 'year') return 'Tahun Ini'
  return `${formatDateID(customStart)} s/d ${formatDateID(customEnd)}`
}

// ===== Page =====
export default function LaporanRugiLabaPage() {
  const [period, setPeriod] = useState<PeriodType>('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [customOpen, setCustomOpen] = useState(false)

  const [rows, setRows] = useState<DetailRow[]>([])
  const [summary, setSummary] = useState<PlSummary>({ penjualan: 0, hargaPokok: 0, labaKotor: 0, biayaOperasional: 0, labaBersih: 0, jumlahInvoice: 0 })
  const [loading, setLoading] = useState(true)
  const [companyName, setCompanyName] = useState('')

  const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<{ value?: string }>('/api/settings?key=company_name')
      .then((d) => { if (d?.value) setCompanyName(d.value) })
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { start, end } = getFilterDates(period, customStart, customEnd)
      const data = await apiFetch<{ rows: DetailRow[]; summary: PlSummary }>(`/api/laporan/rugi-laba?start=${start}&end=${end}`)
      setRows(data.rows || [])
      setSummary(data.summary || { penjualan: 0, hargaPokok: 0, labaKotor: 0, biayaOperasional: 0, labaBersih: 0, jumlahInvoice: 0 })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal memuat laporan')
    } finally {
      setLoading(false)
    }
  }, [period, customStart, customEnd])

  useEffect(() => { void load() }, [load])

  const periodeText = useMemo(() => periodLabel(period, customStart, customEnd), [period, customStart, customEnd])

  // Kelompokkan baris detail per invoice untuk dialog & kartu mobile
  const invoiceGroups = useMemo(() => {
    const map = new Map<string, { nomor: string; tanggal: string; customer: string; items: DetailRow[]; estimated: boolean }>()
    for (const r of rows) {
      const g = map.get(r.invoiceId)
      if (g) {
        g.items.push(r)
        if (r.estimated) g.estimated = true
      } else {
        map.set(r.invoiceId, { nomor: r.nomor, tanggal: r.tanggal, customer: r.customer, items: [r], estimated: r.estimated })
      }
    }
    return Array.from(map.values())
  }, [rows])

  const detailInvoice = useMemo(
    () => invoiceGroups.find((g) => g.items[0]?.invoiceId === detailInvoiceId) || null,
    [invoiceGroups, detailInvoiceId]
  )

  // ===== Cetak / PDF =====
  const openPrintWindow = (mode: 'print' | 'pdf') => {
    const win = window.open('', '', 'height=800,width=1000')
    if (!win) {
      toast.error('Gagal membuka jendela print')
      return
    }
    const rowsHtml = rows.map((r, i) => `
      <tr>
        <td class="center">${i + 1}</td>
        <td class="center">${formatDateID(r.tanggal)}</td>
        <td>${r.nomor}</td>
        <td>${r.customer}</td>
        <td>${r.barang}</td>
        <td class="center">${r.qty}</td>
        <td class="right">${formatRupiah(r.harga)}</td>
        <td class="right">${formatRupiah(r.totalJual)}</td>
        <td class="right">${formatRupiah(r.modal)}</td>
        <td class="right">${formatRupiah(r.totalModal)}</td>
        <td class="right ${r.laba < 0 ? 'neg' : ''}">${formatRupiah(r.laba)}</td>
      </tr>`).join('')

    win.document.write('<html><head><title>Laporan Rugi Laba</title>')
    win.document.write(`
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
        h1 { text-align: center; margin-bottom: 2px; font-size: 18px; }
        .subtitle { text-align: center; font-size: 12px; margin-bottom: 4px; }
        .periode { text-align: center; font-size: 11px; color: #555; margin-bottom: 12px; }
        .meta { text-align: right; font-size: 11px; color: #666; margin-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #ddd; padding: 5px; }
        th { background-color: #f2f2f2; font-weight: bold; white-space: nowrap; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .right { text-align: right; white-space: nowrap; }
        .center { text-align: center; }
        .neg { color: #b91c1c; }
        .summary { margin-top: 14px; width: 45%; margin-left: auto; }
        .summary td { border: none; padding: 3px 5px; }
        .grand { font-weight: bold; border-top: 2px solid #333 !important; }
        .footer { margin-top: 18px; font-size: 11px; color: #666; }
        @media print { body { padding: 0; } }
      </style>`)
    win.document.write('</head><body>')
    win.document.write(`<h1>${companyName || 'Laporan Rugi Laba'}</h1>`)
    win.document.write('<div class="subtitle">Laporan Rugi Laba Sederhana</div>')
    win.document.write(`<div class="periode">Periode: ${periodeText}</div>`)
    win.document.write(`<div class="meta">Dicetak: ${new Date().toLocaleString('id-ID')}</div>`)
    win.document.write(`<table>
      <thead><tr>
        <th>No.</th><th>Tanggal</th><th>Invoice</th><th>Customer</th><th>Nama Barang</th>
        <th>Qty</th><th>Harga Jual</th><th>Total Jual</th><th>Harga Modal</th><th>Total Modal</th><th>Laba</th>
      </tr></thead><tbody>${rowsHtml}</tbody></table>`)
    win.document.write(`<table class="summary">
      <tr><td>Penjualan</td><td class="right">${formatRupiah(summary.penjualan)}</td></tr>
      <tr><td>Harga Pokok / Modal</td><td class="right">(${formatRupiah(summary.hargaPokok)})</td></tr>
      <tr><td>Laba Kotor</td><td class="right">${formatRupiah(summary.labaKotor)}</td></tr>
      <tr><td>Biaya Operasional</td><td class="right">(${formatRupiah(summary.biayaOperasional)})</td></tr>
      <tr class="grand"><td>Laba Bersih</td><td class="right ${summary.labaBersih < 0 ? 'neg' : ''}">${formatRupiah(summary.labaBersih)}</td></tr>
    </table>`)
    win.document.write('</body></html>')
    win.document.close()
    if (mode === 'pdf') {
      toast.info('Pilih "Save as PDF" pada dialog print untuk mengunduh PDF')
    }
    setTimeout(() => win.print(), 300)
  }

  const cards = [
    { label: 'Penjualan', value: summary.penjualan, icon: TrendingUp, tone: 'bg-emerald-50 text-emerald-600' },
    { label: 'Harga Pokok / Modal', value: -summary.hargaPokok, icon: Coins, tone: 'bg-stone-100 text-stone-600' },
    { label: 'Laba Kotor', value: summary.labaKotor, icon: PiggyBank, tone: 'bg-teal-50 text-teal-600' },
    { label: 'Biaya Operasional', value: -summary.biayaOperasional, icon: TrendingDown, tone: 'bg-rose-50 text-rose-600' },
    { label: 'Laba Bersih', value: summary.labaBersih, icon: Receipt, tone: summary.labaBersih < 0 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600' },
  ]

  const periodChips: { key: PeriodType; label: string }[] = [
    { key: 'today', label: 'Hari Ini' },
    { key: 'week', label: 'Minggu Ini' },
    { key: 'month', label: 'Bulan Ini' },
    { key: 'year', label: 'Tahun Ini' },
    { key: 'custom', label: 'Custom' },
  ]

  return (
    <DashboardLayout title="Laporan Rugi Laba" subtitle="Penjualan, modal, dan biaya">
      <div className="space-y-5">
        {/* Header + Print */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between print:hidden">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">Laporan Rugi Laba</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {loading ? 'Memuat data…' : `${summary.jumlahInvoice} invoice · ${periodeText}`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => openPrintWindow('print')} className="min-h-[44px]">
              <Printer className="h-4 w-4" /> Cetak
            </Button>
            <Button variant="outline" onClick={() => openPrintWindow('pdf')} className="min-h-[44px]">
              <FileDown className="h-4 w-4" /> Unduh PDF
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 print:hidden">
          {cards.map((c) => (
            <Card key={c.label} className="p-0 gap-0">
              <CardContent className="p-4">
                <div className="flex items-center gap-2.5">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.tone}`}>
                    <c.icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground leading-tight">{c.label}</p>
                    <p className={`text-sm md:text-base font-bold truncate leading-tight mt-0.5 ${c.value < 0 ? 'text-red-600' : ''}`}>
                      {formatRupiah(c.value)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filter periode */}
        <section aria-label="Filter periode" className="rounded-xl border border-stone-200 bg-white p-3 print:hidden">
          <div className="flex flex-wrap gap-1.5">
            {periodChips.map((p) => (
              <button
                key={p.key}
                onClick={() => { if (p.key === 'custom') { setCustomOpen(true) } else { setPeriod(p.key) } }}
                className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors min-h-[36px] ${
                  period === p.key
                    ? 'bg-stone-800 text-white border-stone-800'
                    : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
                }`}
              >
                {p.label}{period === 'custom' && p.key === 'custom' ? ' ✓' : ''}
              </button>
            ))}
            {period === 'custom' && (customStart || customEnd) && (
              <span className="text-xs text-muted-foreground self-center">{periodLabel(period, customStart, customEnd)}</span>
            )}
          </div>
        </section>

        {/* Desktop detail table */}
        <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden print:hidden">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="max-h-[480px] overflow-y-auto scrollbar-thin">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-stone-50">
                  <TableRow className="bg-stone-50 hover:bg-stone-50">
                    <TableHead className="text-center">Tanggal</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Nama Barang</TableHead>
                    <TableHead className="text-center">Qty</TableHead>
                    <TableHead className="text-right">Harga Jual</TableHead>
                    <TableHead className="text-right">Total Jual</TableHead>
                    <TableHead className="text-right">Harga Modal</TableHead>
                    <TableHead className="text-right">Total Modal</TableHead>
                    <TableHead className="text-right">Laba</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow
                      key={`${r.invoiceId}-${i}`}
                      className="cursor-pointer"
                      onClick={() => setDetailInvoiceId(r.invoiceId)}
                    >
                      <TableCell className="text-center whitespace-nowrap">{formatDateID(r.tanggal)}</TableCell>
                      <TableCell className="font-medium whitespace-nowrap">
                        {r.nomor}{r.estimated && <span className="ml-1 text-[10px] text-muted-foreground" title="Modal diestimasi dari profit invoice">~</span>}
                      </TableCell>
                      <TableCell className="max-w-40"><span className="block truncate" title={r.customer}>{r.customer}</span></TableCell>
                      <TableCell className="max-w-52"><span className="block truncate text-sm" title={r.barang}>{r.barang || '-'}</span></TableCell>
                      <TableCell className="text-center">{r.qty}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatRupiah(r.harga)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap font-medium">{formatRupiah(r.totalJual)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatRupiah(r.modal)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatRupiah(r.totalModal)}</TableCell>
                      <TableCell className={`text-right whitespace-nowrap font-medium ${r.laba < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                        {formatRupiah(r.laba)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Mobile cards — per invoice */}
        <div className="md:hidden space-y-3 print:hidden">
          {loading ? (
            [1, 2, 3].map((i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)
          ) : invoiceGroups.length === 0 ? (
            <EmptyState />
          ) : (
            invoiceGroups.map((g) => {
              const totalJual = g.items.reduce((s, it) => s + it.totalJual, 0)
              const totalModal = g.items.reduce((s, it) => s + it.totalModal, 0)
              const laba = totalJual - totalModal
              return (
                <Card
                  key={g.items[0].invoiceId}
                  className="p-0 gap-0 cursor-pointer"
                  onClick={() => setDetailInvoiceId(g.items[0].invoiceId)}
                >
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{g.nomor}</p>
                        <p className="text-xs text-muted-foreground truncate">{g.customer}</p>
                      </div>
                      {g.estimated && <Badge variant="outline" className="text-[10px] bg-stone-50 text-stone-500 border-stone-200 shrink-0">Modal ~</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{formatDateID(g.tanggal)} · {g.items.length} item</p>
                    <div className="text-sm space-y-0.5 border-t border-stone-100 pt-2">
                      <p className="flex justify-between"><span className="text-muted-foreground">Penjualan:</span><span className="font-semibold">{formatRupiah(totalJual)}</span></p>
                      <p className="flex justify-between"><span className="text-muted-foreground">Modal:</span><span className="font-medium">{formatRupiah(totalModal)}</span></p>
                      <p className="flex justify-between"><span className="text-muted-foreground">Laba:</span><span className={`font-semibold ${laba < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatRupiah(laba)}</span></p>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>

        {/* Catatan rumus */}
        <p className="text-xs text-muted-foreground print:hidden">
          Laba Kotor = Penjualan − Harga Pokok · Laba Bersih = Laba Kotor − Biaya Operasional.
          Harga modal diambil dari snapshot saat invoice dibuat, sehingga laporan lama tidak berubah
          meski harga modal master barang diperbarui. Tanda ~ = modal invoice lama diestimasi dari profit tersimpan.
        </p>
      </div>

      {/* Dialog detail transaksi */}
      <Dialog open={!!detailInvoice} onOpenChange={(o) => { if (!o) setDetailInvoiceId(null) }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {detailInvoice && (() => {
            const totalJual = detailInvoice.items.reduce((s, it) => s + it.totalJual, 0)
            const totalModal = detailInvoice.items.reduce((s, it) => s + it.totalModal, 0)
            const laba = totalJual - totalModal
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 flex-wrap">
                    {detailInvoice.nomor}
                    {detailInvoice.estimated && (
                      <Badge variant="outline" className="text-[10px] bg-stone-50 text-stone-500 border-stone-200">Modal diestimasi</Badge>
                    )}
                  </DialogTitle>
                  <DialogDescription>
                    {detailInvoice.customer} · {formatDateID(detailInvoice.tanggal)}
                  </DialogDescription>
                </DialogHeader>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-stone-50 hover:bg-stone-50">
                        <TableHead>Barang</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead className="text-right">Harga Jual</TableHead>
                        <TableHead className="text-right">Modal</TableHead>
                        <TableHead className="text-right">Laba</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailInvoice.items.map((it, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm max-w-48"><span className="block truncate" title={it.barang}>{it.barang || '-'}</span></TableCell>
                          <TableCell className="text-center text-sm">{it.qty}</TableCell>
                          <TableCell className="text-right text-sm whitespace-nowrap">{formatRupiah(it.harga)}</TableCell>
                          <TableCell className="text-right text-sm whitespace-nowrap">{formatRupiah(it.modal)}</TableCell>
                          <TableCell className={`text-right text-sm whitespace-nowrap font-medium ${it.laba < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatRupiah(it.laba)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="rounded-lg bg-stone-50 p-3 text-sm space-y-1.5">
                  <p className="flex justify-between"><span className="text-muted-foreground">Total Jual</span><span className="font-semibold">{formatRupiah(totalJual)}</span></p>
                  <p className="flex justify-between"><span className="text-muted-foreground">Total Modal</span><span>{formatRupiah(totalModal)}</span></p>
                  <p className="flex justify-between border-t border-stone-200 pt-1.5"><span className="text-muted-foreground">Laba Kotor</span><span className={`font-bold ${laba < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatRupiah(laba)}</span></p>
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Dialog custom periode */}
      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Custom Periode</DialogTitle>
            <DialogDescription>Pilih rentang tanggal laporan</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="rl-custom-start">Dari Tanggal</Label>
              <Input id="rl-custom-start" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rl-custom-end">Sampai Tanggal</Label>
              <Input id="rl-custom-end" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCustomOpen(false)} className="min-h-[44px]">Batal</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px]"
              onClick={() => { setPeriod('custom'); setCustomOpen(false) }}
            >
              Terapkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-12 px-4">
      <Receipt className="h-10 w-10 text-stone-300 mx-auto mb-2" />
      <p className="text-sm font-medium">Belum ada data rugi laba</p>
      <p className="text-xs text-muted-foreground mt-1">
        Data dihitung otomatis dari invoice (dengan snapshot harga modal) dan biaya operasional.
      </p>
    </div>
  )
}
