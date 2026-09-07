'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Eye, FileDown, Pencil, Printer, Search, Trash2, TrendingUp, Wallet, Users, Receipt,
} from 'lucide-react'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/dashboard-layout'
import { apiFetch } from '@/lib/client'
import { generateInvoicePdf } from '@/lib/generate-pdf'
import type { InvoiceData } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

// ===== Types =====
interface SaleRow {
  id: string
  nomor: string
  tanggal: string
  customer: string
  jenis: string
  total: number
  dpAmount: number
  pelunasan: number
  sisa: number
  status: 'lunas' | 'jatuh_tempo' | 'dp' | 'belum'
  lunas: boolean
  dpPercent: number
  tanggalJatuhTempo: string
  catatan: string
  caraPembayaran: string
  tanggalPelunasan: string
  barangNames: string[]
  dataJson: string
}

interface SalesSummary {
  totalPenjualan: number
  pembayaranMasuk: number
  piutang: number
  jumlahInvoice: number
}

interface CustomerOption { id: string; name: string }

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

function StatusBadge({ status }: { status: SaleRow['status'] }) {
  if (status === 'lunas') return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 text-[11px]">Lunas</Badge>
  if (status === 'jatuh_tempo') return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 text-[11px]">Jatuh Tempo</Badge>
  if (status === 'dp') return <Badge className="bg-sky-100 text-sky-700 border-sky-200 hover:bg-sky-100 text-[11px]">DP</Badge>
  return <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 text-[11px]">Belum Lunas</Badge>
}

// ===== Page =====
export default function LaporanPenjualanPage() {
  const [period, setPeriod] = useState<PeriodType>('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [customOpen, setCustomOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')
  const [customer, setCustomer] = useState('all')
  const [status, setStatus] = useState('all')

  const [rows, setRows] = useState<SaleRow[]>([])
  const [summary, setSummary] = useState<SalesSummary>({ totalPenjualan: 0, pembayaranMasuk: 0, piutang: 0, jumlahInvoice: 0 })
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [companyName, setCompanyName] = useState('')

  const [detailRow, setDetailRow] = useState<SaleRow | null>(null)
  const [editRow, setEditRow] = useState<SaleRow | null>(null)
  const [editForm, setEditForm] = useState({ tanggal: '', catatan: '', lunas: false })
  const [saving, setSaving] = useState(false)
  const [deleteRow, setDeleteRow] = useState<SaleRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    apiFetch<CustomerOption[]>('/api/customers')
      .then((data) => setCustomers(Array.isArray(data) ? data : []))
      .catch(() => setCustomers([]))
    apiFetch<{ value?: string }>('/api/settings?key=company_name')
      .then((d) => { if (d?.value) setCompanyName(d.value) })
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { start, end } = getFilterDates(period, customStart, customEnd)
      const params = new URLSearchParams({ start, end, status })
      if (q) params.set('q', q)
      if (customer !== 'all') params.set('customer', customer)
      const data = await apiFetch<{ rows: SaleRow[]; summary: SalesSummary }>(`/api/laporan/penjualan?${params.toString()}`)
      setRows(data.rows || [])
      setSummary(data.summary || { totalPenjualan: 0, pembayaranMasuk: 0, piutang: 0, jumlahInvoice: 0 })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal memuat laporan')
    } finally {
      setLoading(false)
    }
  }, [period, customStart, customEnd, q, customer, status])

  useEffect(() => { void load() }, [load])

  const periodeText = useMemo(() => periodLabel(period, customStart, customEnd), [period, customStart, customEnd])

  // ===== Edit =====
  const openEdit = (r: SaleRow) => {
    setEditRow(r)
    setEditForm({ tanggal: r.tanggal, catatan: r.catatan || '', lunas: r.lunas })
  }

  const handleEditSave = async () => {
    if (!editRow) return
    setSaving(true)
    try {
      const parsed = JSON.parse(editRow.dataJson || '{}') as Record<string, unknown>
      parsed.tanggal = editForm.tanggal
      parsed.catatan = editForm.catatan
      if (editForm.lunas) {
        parsed.lunas = true
        if (!parsed.tanggalPelunasan) parsed.tanggalPelunasan = fmtISO(new Date())
      } else {
        parsed.lunas = false
        delete parsed.tanggalPelunasan
      }
      await apiFetch(`/api/history/${editRow.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          nomor: editRow.nomor,
          tanggal: editForm.tanggal,
          pihakKedua: editRow.customer,
          dataJson: JSON.stringify(parsed),
        }),
      })
      toast.success('Data penjualan berhasil diperbarui')
      setEditRow(null)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal memperbarui data')
    } finally {
      setSaving(false)
    }
  }

  // ===== Delete =====
  const handleDelete = async () => {
    if (!deleteRow) return
    setDeleting(true)
    try {
      await apiFetch<{ success: boolean }>(`/api/history/${deleteRow.id}`, { method: 'DELETE' })
      toast.success('Data penjualan berhasil dihapus')
      setDeleteRow(null)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus data')
    } finally {
      setDeleting(false)
    }
  }

  // ===== Print invoice tunggal (PDF) =====
  const printInvoice = async (r: SaleRow) => {
    try {
      const invData = JSON.parse(r.dataJson || '{}') as InvoiceData
      const blob = await generateInvoicePdf(invData)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal membuat PDF invoice')
    }
  }

  // ===== Cetak / PDF laporan =====
  const openPrintWindow = (mode: 'print' | 'pdf') => {
    const win = window.open('', '', 'height=800,width=1000')
    if (!win) {
      toast.error('Gagal membuka jendela print')
      return
    }
    const periode = periodeText
    const rowsHtml = rows.map((r, i) => `
      <tr>
        <td class="center">${i + 1}</td>
        <td>${r.nomor}</td>
        <td class="center">${formatDateID(r.tanggal)}</td>
        <td>${r.customer}</td>
        <td class="center">${r.jenis}</td>
        <td class="right">${formatRupiah(r.total)}</td>
        <td class="right">${r.dpAmount > 0 ? formatRupiah(r.dpAmount) : '-'}</td>
        <td class="right">${r.pelunasan > 0 ? formatRupiah(r.pelunasan) : '-'}</td>
        <td class="right">${r.sisa > 0 ? formatRupiah(r.sisa) : '-'}</td>
        <td class="center">${r.status === 'lunas' ? 'Lunas' : r.status === 'jatuh_tempo' ? 'Jatuh Tempo' : r.status === 'dp' ? 'DP' : 'Belum Lunas'}</td>
      </tr>`).join('')

    win.document.write('<html><head><title>Laporan Penjualan</title>')
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
        .summary { margin-top: 14px; width: 40%; margin-left: auto; }
        .summary td { border: none; padding: 3px 5px; }
        .grand { font-weight: bold; border-top: 2px solid #333 !important; }
        .footer { margin-top: 18px; font-size: 11px; color: #666; }
        @media print { body { padding: 0; } }
      </style>`)
    win.document.write('</head><body>')
    win.document.write(`<h1>${companyName || 'Laporan Penjualan'}</h1>`)
    win.document.write('<div class="subtitle">Laporan Penjualan</div>')
    win.document.write(`<div class="periode">Periode: ${periode}</div>`)
    win.document.write(`<div class="meta">Dicetak: ${new Date().toLocaleString('id-ID')}</div>`)
    win.document.write(`<table>
      <thead><tr>
        <th>No.</th><th>Nomor Invoice</th><th>Tanggal</th><th>Customer</th><th>Jenis</th>
        <th>Total Penjualan</th><th>DP</th><th>Pelunasan</th><th>Sisa</th><th>Status</th>
      </tr></thead><tbody>${rowsHtml}</tbody></table>`)
    win.document.write(`<table class="summary">
      <tr><td>Total Penjualan</td><td class="right">${formatRupiah(summary.totalPenjualan)}</td></tr>
      <tr><td>Pembayaran Masuk</td><td class="right">${formatRupiah(summary.pembayaranMasuk)}</td></tr>
      <tr><td>Total Piutang</td><td class="right">${formatRupiah(summary.piutang)}</td></tr>
      <tr class="grand"><td>Jumlah Invoice</td><td class="right">${summary.jumlahInvoice}</td></tr>
    </table>`)
    win.document.write('</body></html>')
    win.document.close()
    if (mode === 'pdf') {
      toast.info('Pilih "Save as PDF" pada dialog print untuk mengunduh PDF')
    }
    setTimeout(() => win.print(), 300)
  }

  const cards = [
    { label: 'Total Penjualan', value: formatRupiah(summary.totalPenjualan), icon: TrendingUp, tone: 'bg-emerald-50 text-emerald-600' },
    { label: 'Pembayaran Masuk', value: formatRupiah(summary.pembayaranMasuk), icon: Wallet, tone: 'bg-teal-50 text-teal-600' },
    { label: 'Total Piutang', value: formatRupiah(summary.piutang), icon: Receipt, tone: 'bg-rose-50 text-rose-600' },
    { label: 'Jumlah Invoice', value: String(summary.jumlahInvoice), icon: Users, tone: 'bg-amber-50 text-amber-600' },
  ]

  const periodChips: { key: PeriodType; label: string }[] = [
    { key: 'today', label: 'Hari Ini' },
    { key: 'week', label: 'Minggu Ini' },
    { key: 'month', label: 'Bulan Ini' },
    { key: 'year', label: 'Tahun Ini' },
    { key: 'custom', label: 'Custom' },
  ]

  return (
    <DashboardLayout title="Laporan Penjualan" subtitle="Data penjualan dari invoice">
      <div className="space-y-5" data-laporan-content>
        {/* Header + Print */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between print:hidden">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">Laporan Penjualan</h1>
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 print:hidden">
          {cards.map((c) => (
            <Card key={c.label} className="p-0 gap-0">
              <CardContent className="p-4">
                <div className="flex items-center gap-2.5">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.tone}`}>
                    <c.icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground leading-tight">{c.label}</p>
                    <p className="text-sm md:text-base font-bold truncate leading-tight mt-0.5">{c.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <section aria-label="Filter laporan" className="rounded-xl border border-stone-200 bg-white p-3 space-y-3 print:hidden">
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
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative flex-1 lg:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Cari nomor / customer / barang…"
                aria-label="Cari laporan penjualan"
                className="pl-9 min-h-[44px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 lg:flex lg:w-auto">
              <Select value={customer} onValueChange={setCustomer}>
                <SelectTrigger className="w-full lg:w-52 min-h-[44px] bg-white" aria-label="Filter customer">
                  <SelectValue placeholder="Semua Customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Customer</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full lg:w-40 min-h-[44px] bg-white" aria-label="Filter status">
                  <SelectValue placeholder="Semua Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="lunas">Lunas</SelectItem>
                  <SelectItem value="belum">Belum Lunas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* Desktop table */}
        <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden print:hidden">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="max-h-[520px] overflow-y-auto scrollbar-thin">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-stone-50">
                  <TableRow className="bg-stone-50 hover:bg-stone-50">
                    <TableHead className="w-10">No.</TableHead>
                    <TableHead>Nomor Invoice</TableHead>
                    <TableHead className="text-center">Tanggal</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-center">Jenis</TableHead>
                    <TableHead className="text-right">Total Penjualan</TableHead>
                    <TableHead className="text-right">DP</TableHead>
                    <TableHead className="text-right">Pelunasan</TableHead>
                    <TableHead className="text-right">Sisa Tagihan</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium whitespace-nowrap">{r.nomor}</TableCell>
                      <TableCell className="text-center whitespace-nowrap">{formatDateID(r.tanggal)}</TableCell>
                      <TableCell className="max-w-44"><span className="block truncate" title={r.customer}>{r.customer}</span></TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={`text-[11px] ${r.jenis === 'DP' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-stone-50 text-stone-600 border-stone-200'}`}>{r.jenis}</Badge>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap font-medium">{formatRupiah(r.total)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{r.dpAmount > 0 ? formatRupiah(r.dpAmount) : '-'}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{r.pelunasan > 0 ? formatRupiah(r.pelunasan) : '-'}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{r.sisa > 0 ? formatRupiah(r.sisa) : '-'}</TableCell>
                      <TableCell className="text-center"><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-0.5">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailRow(r)} aria-label={`Lihat ${r.nomor}`} title="Lihat">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)} aria-label={`Edit ${r.nomor}`} title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void printInvoice(r)} aria-label={`Print ${r.nomor}`} title="Print invoice">
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteRow(r)} aria-label={`Hapus ${r.nomor}`} title="Hapus">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-3 print:hidden">
          {loading ? (
            [1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)
          ) : rows.length === 0 ? (
            <EmptyState />
          ) : (
            rows.map((r) => (
              <Card key={r.id} className="p-0 gap-0">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{r.nomor}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.customer}</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDateID(r.tanggal)} · {r.jenis}</p>
                  <div className="text-sm space-y-0.5 border-t border-stone-100 pt-2">
                    <p className="flex justify-between"><span className="text-muted-foreground">Penjualan:</span><span className="font-semibold">{formatRupiah(r.total)}</span></p>
                    <p className="flex justify-between"><span className="text-muted-foreground">Dibayar:</span><span className="font-medium text-emerald-700">{formatRupiah(r.dpAmount + r.pelunasan)}</span></p>
                    <p className="flex justify-between"><span className="text-muted-foreground">Sisa:</span><span className="font-medium text-amber-700">{formatRupiah(r.sisa)}</span></p>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" className="flex-1 min-h-[40px]" onClick={() => setDetailRow(r)}>
                      <Eye className="h-4 w-4" /> Detail
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 min-h-[40px]" onClick={() => openEdit(r)}>
                      <Pencil className="h-4 w-4" /> Edit
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 min-h-[40px]" onClick={() => void printInvoice(r)}>
                      <Printer className="h-4 w-4" /> Print
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      className="min-h-[40px] px-2.5 text-destructive border-stone-200 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setDeleteRow(r)} aria-label={`Hapus ${r.nomor}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Dialog detail (Lihat) */}
      <Dialog open={!!detailRow} onOpenChange={(o) => { if (!o) setDetailRow(null) }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {detailRow && (() => {
            let parsed: Partial<InvoiceData> = {}
            try { parsed = JSON.parse(detailRow.dataJson || '{}') } catch { parsed = {} }
            const items = Array.isArray(parsed.items) ? parsed.items : []
            const hasModal = items.some((it) => Number((it as { modal?: number }).modal) > 0)
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 flex-wrap">
                    <span>{detailRow.nomor}</span>
                    <StatusBadge status={detailRow.status} />
                  </DialogTitle>
                  <DialogDescription>
                    {detailRow.customer} · {formatDateID(detailRow.tanggal)} · {detailRow.jenis}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-stone-50 hover:bg-stone-50">
                          <TableHead>Barang</TableHead>
                          <TableHead className="text-center">Qty</TableHead>
                          <TableHead className="text-right">Harga</TableHead>
                          {hasModal && <TableHead className="text-right">Modal</TableHead>}
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((it, idx) => {
                          const o = it as { deskripsi?: string; qty?: number; harga?: number; modal?: number }
                          return (
                            <TableRow key={o.deskripsi ? `${idx}-${o.deskripsi.slice(0, 12)}` : idx}>
                              <TableCell className="text-sm whitespace-pre-line max-w-56">{o.deskripsi || '-'}</TableCell>
                              <TableCell className="text-center text-sm">{o.qty}</TableCell>
                              <TableCell className="text-right text-sm whitespace-nowrap">{formatRupiah(o.harga || 0)}</TableCell>
                              {hasModal && <TableCell className="text-right text-sm whitespace-nowrap">{formatRupiah(o.modal || 0)}</TableCell>}
                              <TableCell className="text-right text-sm whitespace-nowrap font-medium">{formatRupiah((o.qty || 0) * (o.harga || 0))}</TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-stone-50 p-3 space-y-1.5">
                      <p className="flex justify-between"><span className="text-muted-foreground">Total Penjualan</span><span className="font-bold">{formatRupiah(detailRow.total)}</span></p>
                      <p className="flex justify-between"><span className="text-muted-foreground">DP {detailRow.dpPercent > 0 ? `(${detailRow.dpPercent}%)` : ''}</span><span>{detailRow.dpAmount > 0 ? formatRupiah(detailRow.dpAmount) : '-'}</span></p>
                      <p className="flex justify-between"><span className="text-muted-foreground">Pelunasan</span><span>{detailRow.pelunasan > 0 ? formatRupiah(detailRow.pelunasan) : '-'}</span></p>
                      <p className="flex justify-between border-t border-stone-200 pt-1.5"><span className="text-muted-foreground">Sisa Tagihan</span><span className="font-semibold text-amber-700">{formatRupiah(detailRow.sisa)}</span></p>
                    </div>
                    <div className="rounded-lg bg-stone-50 p-3 space-y-1.5">
                      <p className="flex justify-between"><span className="text-muted-foreground">Jatuh Tempo</span><span>{formatDateID(detailRow.tanggalJatuhTempo)}</span></p>
                      <p className="flex justify-between"><span className="text-muted-foreground">Cara Bayar</span><span className="capitalize">{detailRow.caraPembayaran || '-'}</span></p>
                      <p className="flex justify-between"><span className="text-muted-foreground">Tgl Pelunasan</span><span>{detailRow.tanggalPelunasan ? formatDateID(detailRow.tanggalPelunasan) : '-'}</span></p>
                      {detailRow.catatan && <p className="text-xs text-muted-foreground pt-1 border-t border-stone-200">Catatan: {detailRow.catatan}</p>}
                    </div>
                  </div>
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Dialog edit */}
      <Dialog open={!!editRow} onOpenChange={(o) => { if (!o) setEditRow(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Data Penjualan</DialogTitle>
            <DialogDescription>{editRow?.nomor} — {editRow?.customer}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-tanggal">Tanggal</Label>
              <Input
                id="edit-tanggal" type="date" value={editForm.tanggal}
                onChange={(e) => setEditForm((f) => ({ ...f, tanggal: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-status">Status Pembayaran</Label>
              <Select value={editForm.lunas ? 'lunas' : 'belum'} onValueChange={(v) => setEditForm((f) => ({ ...f, lunas: v === 'lunas' }))}>
                <SelectTrigger id="edit-status" className="w-full min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="belum">Belum Lunas</SelectItem>
                  <SelectItem value="lunas">Lunas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-catatan">Catatan</Label>
              <Textarea
                id="edit-catatan" rows={2} value={editForm.catatan}
                onChange={(e) => setEditForm((f) => ({ ...f, catatan: e.target.value }))}
                placeholder="Catatan tambahan (opsional)"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditRow(null)} disabled={saving} className="min-h-[44px]">Batal</Button>
            <Button onClick={() => void handleEditSave()} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px]">
              {saving ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog hapus */}
      <AlertDialog open={!!deleteRow} onOpenChange={(o) => { if (!o) setDeleteRow(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus data penjualan?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRow?.nomor} ({deleteRow?.customer}) akan dihapus permanen beserta dokumen
              pelunasannya jika ada. Invoice lama di riwayat juga akan terhapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); void handleDelete() }}
            >
              {deleting ? 'Menghapus…' : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog custom periode */}
      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Custom Periode</DialogTitle>
            <DialogDescription>Pilih rentang tanggal laporan</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="custom-start">Dari Tanggal</Label>
              <Input id="custom-start" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="custom-end">Sampai Tanggal</Label>
              <Input id="custom-end" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
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
      <p className="text-sm font-medium">Belum ada data penjualan</p>
      <p className="text-xs text-muted-foreground mt-1">
        Data penjualan masuk otomatis dari invoice yang dibuat.
      </p>
    </div>
  )
}
