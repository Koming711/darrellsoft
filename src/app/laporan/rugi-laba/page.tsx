'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ChevronRight, FileDown, Printer, ReceiptText, Scale } from 'lucide-react'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/dashboard-layout'
import { apiFetch } from '@/lib/client'
import { useDataChange } from '@/hooks/use-data-change'
import { formatIDR, formatNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { getAuthUser } from '@/lib/auth'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ==================== Tipe data (respon GET /api/laporan/rugi-laba) ====================

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
  /** Aditif: modal belum diisi (tanpa snapshot & tanpa profit utk estimasi) */
  hppNull?: boolean
}

interface PlSummary {
  penjualan: number
  hargaPokok: number
  labaKotor: number
  biayaOperasional: number
  labaBersih: number
  jumlahInvoice: number
}

interface BiayaRow {
  id: string
  tanggal: string
  kategori: string
  keterangan: string
  metodePembayaran: string
  supplier: string
  jumlah: number
}

/** Baris ringkasan per barang (agregasi klien dari rows) */
interface ItemRow {
  name: string
  qty: number
  penjualan: number
  modal: number
  laba: number
  modalMissing: boolean
}

type ReportPeriod = 'today' | 'week' | 'month' | 'year' | 'date' | 'all'

// ==================== Helper format (paritas arsip) ====================

function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'Terjadi kesalahan'
}

/** Format tanggal singkat, contoh: 15 Jan 2025 */
function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Format tanggal + jam */
function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/** ISO string / Date -> yyyy-mm-dd untuk <input type="date"> (pakai waktu lokal) */
function toInputDate(iso: string | Date | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const MONTH_LABELS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
] as const

/**
 * Kolom keterangan tabel Biaya memakai format "nama || catatan" (lihat halaman
 * Biaya Operasional). Data lama tanpa " || " → seluruh teks = nama biaya.
 */
function splitKeterangan(keterangan: string): { nama: string; catatan: string } {
  const idx = (keterangan || '').indexOf(' || ')
  if (idx >= 0) return { nama: keterangan.slice(0, idx), catatan: keterangan.slice(idx + 4) }
  return { nama: keterangan || '', catatan: '' }
}

// ==================== Filter periode (salin report-shared arsip) ====================

const PERIOD_OPTIONS: Array<{ value: ReportPeriod; label: string }> = [
  { value: 'today', label: 'Hari ini' },
  { value: 'week', label: 'Minggu ini' },
  { value: 'month', label: 'Bulan ini' },
  { value: 'year', label: 'Tahun ini' },
  { value: 'date', label: 'Custom' },
  { value: 'all', label: 'Semua' },
]

/** Opsi tahun: (tahun sekarang + 1) turun ke (tahun sekarang − 5) */
function yearOptions(): number[] {
  const nowYear = new Date().getFullYear()
  const out: number[] = []
  for (let y = nowYear + 1; y >= nowYear - 5; y--) out.push(y)
  return out
}

interface PeriodFilterProps {
  period: ReportPeriod
  onChangePeriod: (p: ReportPeriod) => void
  from: string
  to: string
  onFromChange: (v: string) => void
  onToChange: (v: string) => void
  month: number | null
  onMonthChange: (v: number | null) => void
  year: number | null
  onYearChange: (v: number | null) => void
}

/** Segmented control mode periode + input kondisional (tanggal / bulan / tahun). */
function PeriodFilter(props: PeriodFilterProps) {
  const {
    period,
    onChangePeriod,
    from,
    to,
    onFromChange,
    onToChange,
    month,
    onMonthChange,
    year,
    onYearChange,
  } = props
  const years = yearOptions()
  const nowMonth = String(new Date().getMonth() + 1)
  const nowYear = String(new Date().getFullYear())

  return (
    <div className="space-y-3">
      {/* Segmented control mode periode */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Mode periode laporan">
        {PERIOD_OPTIONS.map((opt) => {
          const active = period === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChangePeriod(opt.value)}
              className={cn(
                'rounded-lg border px-4 min-h-[44px] text-sm font-medium transition-colors',
                active
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-100 hover:text-stone-900'
              )}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {period === 'date' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="report-from">Dari Tanggal</Label>
            <Input
              id="report-from"
              type="date"
              value={from}
              onChange={(e) => onFromChange(e.target.value)}
              aria-label="Tanggal mulai"
              className="min-h-[44px]"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="report-to">Sampai Tanggal</Label>
            <Input
              id="report-to"
              type="date"
              value={to}
              onChange={(e) => onToChange(e.target.value)}
              aria-label="Tanggal akhir"
              className="min-h-[44px]"
            />
          </div>
        </div>
      )}

      {period === 'month' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="report-month">Bulan</Label>
            <Select value={month != null ? String(month) : nowMonth} onValueChange={(v) => onMonthChange(Number(v))}>
              <SelectTrigger id="report-month" aria-label="Pilih bulan" className="w-full min-h-[44px]">
                <SelectValue placeholder="Pilih bulan" />
              </SelectTrigger>
              <SelectContent>
                {MONTH_LABELS.map((label, i) => (
                  <SelectItem key={label} value={String(i + 1)}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="report-month-year">Tahun</Label>
            <Select value={year != null ? String(year) : nowYear} onValueChange={(v) => onYearChange(Number(v))}>
              <SelectTrigger id="report-month-year" aria-label="Pilih tahun" className="w-full min-h-[44px]">
                <SelectValue placeholder="Pilih tahun" />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {period === 'year' && (
        <div className="grid gap-1.5 sm:max-w-[240px]">
          <Label htmlFor="report-year">Tahun</Label>
          <Select value={year != null ? String(year) : nowYear} onValueChange={(v) => onYearChange(Number(v))}>
            <SelectTrigger id="report-year" aria-label="Pilih tahun" className="w-full min-h-[44px]">
              <SelectValue placeholder="Pilih tahun" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}

/** Teks periode untuk subjudul & kop cetak. */
function periodText(
  period: ReportPeriod,
  from: string,
  to: string,
  month: number | null,
  year: number | null
): string {
  const now = new Date()
  const m = month ?? now.getMonth() + 1
  const y = year ?? now.getFullYear()
  switch (period) {
    case 'today':
      return formatDate(now)
    case 'week': {
      const day = (now.getDay() + 6) % 7 // 0 = Senin
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day)
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
      return `${formatDate(start)} – ${formatDate(end)}`
    }
    case 'date':
      return `${formatDate(from)} – ${formatDate(to)}`
    case 'month':
      return `${MONTH_LABELS[m - 1] ?? ''} ${y}`
    case 'year':
      return String(y)
    default:
      return 'Semua Periode'
  }
}

// ==================== Kop & tanda tangan cetak (salin report-shared arsip, brand Darrell Soft) ====================

function ReportKop({ title, period }: { title: string; period: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-5 border-b border-stone-200">
      <div className="flex items-start gap-3">
        <img src="/logo-ds.png" alt="Logo Darrell Soft" className="h-12 w-12" />
        <div>
          <p className="text-lg font-bold tracking-tight leading-tight">Darrell Soft</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Kalkulator Hitung Cetakan</p>
        </div>
      </div>
      <div className="text-sm sm:text-right space-y-1">
        <p className="text-base font-bold tracking-wide uppercase">{title}</p>
        <p className="font-semibold">Periode: {period}</p>
        <p className="text-xs sm:text-sm pt-1">
          <span className="text-muted-foreground">Dicetak: </span>
          {formatDateTime(new Date())}
        </p>
      </div>
    </div>
  )
}

function ReportSignature({ userName }: { userName: string }) {
  return (
    <div className="flex justify-end pt-2">
      <div className="text-center text-sm w-48">
        <p>Hormat kami,</p>
        <div className="h-16" aria-hidden="true" />
        <p className="font-semibold border-t border-stone-300 pt-1.5">Dibuat oleh: {userName}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{formatDate(new Date())}</p>
      </div>
    </div>
  )
}

/** Print & Simpan sebagai PDF (memakai area #print-area). */
function useReportPrint() {
  const print = useCallback(() => {
    window.print()
  }, [])

  const savePdf = useCallback(() => {
    window.print()
    toast.info('Pilih "Save as PDF" pada dialog cetak untuk menyimpan sebagai PDF.')
  }, [])

  return { print, savePdf }
}

// ==================== Komponen kecil (salin arsip) ====================

function MissingBadge() {
  return (
    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-[11px] shrink-0">
      Belum diisi
    </Badge>
  )
}

/** Badge kategori biaya (outline stone). */
function CategoryBadge({ label }: { label: string }) {
  return (
    <Badge variant="outline" className="bg-stone-50 text-stone-600 border-stone-200 text-[11px] shrink-0">
      {label}
    </Badge>
  )
}

/** Satu baris ringkasan bertingkat (label+kiri, nilai+kanan). */
function ProfitLine({
  label,
  caption,
  value,
  valueClass,
  big,
}: {
  label: string
  caption?: string
  value: string
  valueClass?: string
  big?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className={cn('text-sm', big && 'font-semibold')}>{label}</p>
        {caption && <p className="text-[11px] text-muted-foreground">{caption}</p>}
      </div>
      <p
        className={cn(
          'font-semibold text-right whitespace-nowrap',
          big ? 'text-xl md:text-2xl font-bold' : 'text-sm',
          valueClass
        )}
      >
        {value}
      </p>
    </div>
  )
}

/** CSS cetak: hanya #print-area yang tampil (halaman ini punya satu #print-area). */
const PRINT_CSS = `
@media print {
  @page { size: auto; margin: 12mm; }
  body > * {
    height: 0 !important;
    min-height: 0 !important;
    overflow: hidden !important;
    margin: 0 !important;
  }
  body *:not(#print-area):not(#print-area *) {
    visibility: hidden !important;
  }
  #print-area,
  #print-area * {
    visibility: visible !important;
  }
  #print-area {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 24px !important;
    box-shadow: none !important;
    border: none !important;
  }
}
`

// ==================== Halaman Laporan Rugi Laba ====================

export default function LaporanRugiLabaPage() {
  const router = useRouter()
  const currentUser = getAuthUser()

  const [now] = useState(() => new Date())
  const [period, setPeriod] = useState<ReportPeriod>('month')
  const [month, setMonth] = useState<number | null>(now.getMonth() + 1)
  const [year, setYear] = useState<number | null>(now.getFullYear())
  const [from, setFrom] = useState<string>(() => toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [to, setTo] = useState<string>(() => toInputDate(now))
  const [summary, setSummary] = useState<PlSummary | null>(null)
  const [rows, setRows] = useState<DetailRow[]>([])
  const [expenses, setExpenses] = useState<BiayaRow[]>([])
  const [rowsTruncated, setRowsTruncated] = useState(false)
  const [loading, setLoading] = useState(true)

  const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null)

  const { print, savePdf } = useReportPrint()

  /**
   * Rentang start/end (yyyy-mm-dd) dari mode periode — dikirim ke
   * GET /api/laporan/rugi-laba. Mode 'all' → tanpa param (semua data).
   */
  const range = useMemo<{ start: string; end: string } | null>(() => {
    const y = year ?? now.getFullYear()
    const m = month ?? now.getMonth() + 1
    switch (period) {
      case 'today': {
        const d = toInputDate(now)
        return { start: d, end: d }
      }
      case 'week': {
        const day = (now.getDay() + 6) % 7 // 0 = Senin
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day)
        const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
        return { start: toInputDate(start), end: toInputDate(end) }
      }
      case 'month':
        return {
          start: toInputDate(new Date(y, m - 1, 1)),
          end: toInputDate(new Date(y, m, 0)),
        }
      case 'year':
        return { start: `${y}-01-01`, end: `${y}-12-31` }
      case 'date':
        return { start: from, end: to }
      default:
        return null
    }
  }, [period, month, year, from, to, now])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = range ? `?start=${range.start}&end=${range.end}` : ''
      const d = await apiFetch<{
        rows?: DetailRow[]
        summary?: PlSummary
        biayaRows?: BiayaRow[]
        rowsTruncated?: boolean
      }>(`/api/laporan/rugi-laba${qs}`)
      setRows(d.rows || [])
      setExpenses(d.biayaRows || [])
      setRowsTruncated(!!d.rowsTruncated)
      setSummary(
        d.summary || {
          penjualan: 0, hargaPokok: 0, labaKotor: 0, biayaOperasional: 0, labaBersih: 0, jumlahInvoice: 0,
        }
      )
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    void load()
  }, [load])

  // Selaras: reload otomatis saat data biaya / invoice berubah (termasuk lintas tab)
  useDataChange(['biaya', 'invoice'], () => { void load() })

  const periodLabel = periodText(period, from, to, month, year)

  // Baris dengan modal belum diisi (hppNull aditif dari API)
  const uncounted = useMemo(() => rows.filter((r) => r.hppNull), [rows])
  const uncountedPenjualan = useMemo(
    () => uncounted.reduce((s, r) => s + r.totalJual, 0),
    [uncounted]
  )

  // Agregasi Rincian per Barang dari baris transaksi
  const items = useMemo<ItemRow[]>(() => {
    const map = new Map<string, ItemRow>()
    for (const r of rows) {
      const name = r.barang || '(tanpa nama)'
      const cur = map.get(name) || { name, qty: 0, penjualan: 0, modal: 0, laba: 0, modalMissing: false }
      cur.qty += r.qty
      cur.penjualan += r.totalJual
      cur.modal += r.totalModal
      cur.laba += r.laba
      if (r.hppNull) cur.modalMissing = true
      map.set(name, cur)
    }
    return Array.from(map.values())
  }, [rows])

  // Kelompokkan baris per invoice untuk dialog detail transaksi
  const detailInvoice = useMemo(() => {
    if (!detailInvoiceId) return null
    const group = rows.filter((r) => r.invoiceId === detailInvoiceId)
    if (group.length === 0) return null
    return {
      nomor: group[0].nomor,
      tanggal: group[0].tanggal,
      customer: group[0].customer,
      items: group,
    }
  }, [rows, detailInvoiceId])

  const t = summary
  const netLoss = t != null && t.labaBersih < 0

  return (
    <DashboardLayout title="Laporan Rugi Laba" subtitle="Penjualan, modal & biaya operasional">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">Laporan Rugi Laba</h1>
            <p className="text-sm text-muted-foreground mt-1">Periode: {periodLabel}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={print}
              className="min-h-[44px] flex-1 sm:flex-none"
              aria-label="Cetak laporan rugi laba"
            >
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button
              variant="outline"
              onClick={savePdf}
              className="min-h-[44px] flex-1 sm:flex-none"
              aria-label="Simpan laporan rugi laba sebagai PDF"
            >
              <FileDown className="h-4 w-4" /> Simpan sebagai PDF
            </Button>
          </div>
        </div>

        {/* Filter */}
        <Card className="p-0 gap-0">
          <CardContent className="p-4">
            <PeriodFilter
              period={period}
              onChangePeriod={setPeriod}
              from={from}
              to={to}
              onFromChange={setFrom}
              onToChange={setTo}
              month={month}
              onMonthChange={setMonth}
              year={year}
              onYearChange={setYear}
            />
          </CardContent>
        </Card>

        {loading && !t ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-64 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : t ? (
          <>
            {/* Ringkasan rugi laba */}
            <Card className="p-0 gap-0">
              <CardHeader className="px-4 md:px-6 pt-4 md:pt-6 pb-3">
                <CardTitle className="text-sm md:text-base">Rugi Laba</CardTitle>
              </CardHeader>
              <CardContent className="px-4 md:px-6 pb-4 md:pb-6 space-y-3">
                <ProfitLine
                  label="Total Penjualan"
                  caption={`Invoice reguler & DP non-batal · ${t.jumlahInvoice} invoice`}
                  value={formatIDR(t.penjualan)}
                />
                <ProfitLine
                  label="Total Modal"
                  caption="Harga pokok dari item dengan modal terisi"
                  value={formatIDR(t.hargaPokok)}
                />
                <ProfitLine
                  label="Laba Kotor"
                  caption="Penjualan − modal (harga pokok)"
                  value={formatIDR(t.labaKotor)}
                  valueClass="text-emerald-700"
                />
                <ProfitLine
                  label="Biaya Operasional"
                  caption={expenses.length > 0 ? `${expenses.length} catatan biaya` : 'Belum ada biaya'}
                  value={formatIDR(t.biayaOperasional)}
                />
                <Separator />
                <ProfitLine
                  label="Laba Bersih"
                  caption="Laba kotor − biaya operasional"
                  value={formatIDR(t.labaBersih)}
                  valueClass={netLoss ? 'text-red-600' : 'text-emerald-700'}
                  big
                />
              </CardContent>
            </Card>

            {/* Peringatan modal belum diisi */}
            {uncounted.length > 0 && (
              <Card className="p-0 gap-0 border-amber-200 bg-amber-50">
                <CardContent className="p-4 space-y-2">
                  <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Modal belum diisi
                  </p>
                  <p className="text-sm text-amber-800">
                    Modal belum diisi — {uncounted.length} baris item (penjualan {formatIDR(uncountedPenjualan)}) tidak
                    diikutkan dalam perhitungan laba karena harga modal belum diisi.
                  </p>
                  <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
                    {uncounted.slice(0, 10).map((u, i) => (
                      <li key={`${u.invoiceId}-${i}`}>
                        {u.nomor} — {u.barang}: {formatIDR(u.totalJual)}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-amber-700">Lengkapi harga modal di Master Barang agar laba akurat.</p>
                </CardContent>
              </Card>
            )}

            {/* Biaya operasional (read-only — CRUD di menu Biaya Operasional) */}
            <Card className="p-0 gap-0">
              <CardHeader className="px-4 md:px-6 pt-4 md:pt-6 pb-3">
                <CardTitle className="text-sm md:text-base">Biaya Operasional ({expenses.length} catatan)</CardTitle>
              </CardHeader>
              <CardContent className="px-4 md:px-6 pb-4 md:pb-6 space-y-4">
                {expenses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Belum ada biaya operasional pada periode ini.</p>
                ) : (
                  <>
                    {/* Desktop */}
                    <div className="hidden md:block rounded-xl border border-stone-200 overflow-hidden">
                      <div className="max-h-64 overflow-y-auto scrollbar-thin">
                        <Table>
                          <TableHeader className="sticky top-0 z-10 bg-stone-50">
                            <TableRow className="bg-stone-50 hover:bg-stone-50">
                              <TableHead>Tanggal</TableHead>
                              <TableHead>Nama</TableHead>
                              <TableHead>Kategori</TableHead>
                              <TableHead className="text-right">Nominal</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {expenses.map((x) => (
                              <TableRow key={x.id}>
                                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(x.tanggal)}</TableCell>
                                <TableCell className="font-medium">{splitKeterangan(x.keterangan).nama || '—'}</TableCell>
                                <TableCell><CategoryBadge label={x.kategori || 'Lain-lain'} /></TableCell>
                                <TableCell className="text-right whitespace-nowrap">{formatIDR(x.jumlah)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    {/* Mobile */}
                    <ul className="md:hidden divide-y divide-stone-100 max-h-64 overflow-y-auto scrollbar-thin rounded-xl border border-stone-200">
                      {expenses.map((x) => (
                        <li key={x.id} className="flex items-start justify-between gap-2 p-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium break-words">{splitKeterangan(x.keterangan).nama || '—'}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(x.tanggal)} · {x.kategori || 'Lain-lain'}</p>
                          </div>
                          <p className="text-sm font-semibold whitespace-nowrap">{formatIDR(x.jumlah)}</p>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {/* Total biaya */}
                <div className="flex justify-between gap-3 text-sm font-semibold border-t border-stone-200 pt-2">
                  <span>Total Biaya Operasional</span>
                  <span className="whitespace-nowrap">{formatIDR(t.biayaOperasional)}</span>
                </div>

                {/* Hint ke menu Biaya Operasional */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">Kelola catatan biaya di menu Biaya Operasional.</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-emerald-700 hover:text-emerald-800"
                    onClick={() => router.push('/biaya-operasional')}
                  >
                    Buka menu Biaya Operasional <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Rincian per barang */}
            <Card className="p-0 gap-0">
              <CardHeader className="px-4 md:px-6 pt-4 md:pt-6 pb-3">
                <CardTitle className="text-sm md:text-base">Rincian per Barang</CardTitle>
              </CardHeader>
              <CardContent className="px-4 md:px-6 pb-4 md:pb-6">
                {items.length === 0 ? (
                  <div className="text-center py-10">
                    <Scale className="h-10 w-10 text-stone-300 mx-auto mb-2" aria-hidden="true" />
                    <p className="text-sm font-medium">Tidak ada penjualan pada periode ini.</p>
                    <p className="text-xs text-muted-foreground mt-1">Rincian per barang muncul setelah ada invoice.</p>
                  </div>
                ) : (
                  <>
                    {/* Desktop */}
                    <div className="hidden md:block rounded-xl border border-stone-200 overflow-hidden">
                      <div className="max-h-96 overflow-auto scrollbar-thin">
                        <Table>
                          <TableHeader className="sticky top-0 z-10 bg-stone-50">
                            <TableRow className="bg-stone-50 hover:bg-stone-50">
                              <TableHead>Nama</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
                              <TableHead className="text-right">Penjualan</TableHead>
                              <TableHead className="text-right">Modal</TableHead>
                              <TableHead className="text-right">Laba</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {items.map((it) => (
                              <TableRow key={it.name}>
                                <TableCell className="font-medium">{it.name}</TableCell>
                                <TableCell className="text-right whitespace-nowrap">{formatNum(it.qty)}</TableCell>
                                <TableCell className="text-right whitespace-nowrap">{formatIDR(it.penjualan)}</TableCell>
                                <TableCell className="text-right whitespace-nowrap">
                                  {it.modalMissing ? <MissingBadge /> : formatIDR(it.modal)}
                                </TableCell>
                                <TableCell className="text-right whitespace-nowrap">
                                  {it.modalMissing ? (
                                    <MissingBadge />
                                  ) : (
                                    <span className="text-emerald-700 font-medium">{formatIDR(it.laba)}</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    {/* Mobile */}
                    <div className="md:hidden space-y-3">
                      {items.map((it) => (
                        <Card key={it.name} className="p-0 gap-0">
                          <CardContent className="p-4 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-medium min-w-0 break-words">{it.name}</p>
                              <p className="text-xs text-muted-foreground shrink-0">Qty {formatNum(it.qty)}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm border-t border-stone-100 pt-2">
                              <p className="text-muted-foreground">Penjualan: <span className="font-medium text-stone-700">{formatIDR(it.penjualan)}</span></p>
                              <p className="text-muted-foreground text-right sm:text-left">
                                Modal:{' '}
                                {it.modalMissing ? (
                                  <MissingBadge />
                                ) : (
                                  <span className="font-medium text-stone-700">{formatIDR(it.modal)}</span>
                                )}
                              </p>
                              <p className="text-muted-foreground col-span-2 sm:col-span-1">
                                Laba:{' '}
                                {it.modalMissing ? (
                                  <MissingBadge />
                                ) : (
                                  <span className="font-medium text-emerald-700">{formatIDR(it.laba)}</span>
                                )}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Rincian per transaksi (baris diklik -> dialog detail transaksi) */}
            <Card className="p-0 gap-0">
              <CardHeader className="px-4 md:px-6 pt-4 md:pt-6 pb-3">
                <CardTitle className="text-sm md:text-base">Rincian per Transaksi</CardTitle>
              </CardHeader>
              <CardContent className="px-4 md:px-6 pb-4 md:pb-6 space-y-3">
                {rowsTruncated && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="alert">
                    Menampilkan 2000 invoice terbaru — persempit periode untuk melihat semua transaksi.
                  </div>
                )}
                {rows.length === 0 ? (
                  <div className="text-center py-10">
                    <ReceiptText className="h-10 w-10 text-stone-300 mx-auto mb-2" aria-hidden="true" />
                    <p className="text-sm font-medium">Tidak ada transaksi pada periode ini.</p>
                    <p className="text-xs text-muted-foreground mt-1">Rincian per transaksi muncul setelah ada invoice.</p>
                  </div>
                ) : (
                  <>
                    {/* Desktop */}
                    <div className="hidden md:block rounded-xl border border-stone-200 overflow-hidden">
                      <div className="max-h-96 overflow-y-auto scrollbar-thin">
                        <Table>
                          <TableHeader className="sticky top-0 z-10 bg-stone-50">
                            <TableRow className="bg-stone-50 hover:bg-stone-50">
                              <TableHead>Tanggal</TableHead>
                              <TableHead>Invoice</TableHead>
                              <TableHead>Customer</TableHead>
                              <TableHead>Nama Barang</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
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
                                onClick={() => setDetailInvoiceId(r.invoiceId)}
                                className="cursor-pointer hover:bg-stone-50"
                                aria-label={`Lihat detail transaksi ${r.nomor} — ${r.barang}`}
                              >
                                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(r.tanggal)}</TableCell>
                                <TableCell className="font-mono text-xs whitespace-nowrap">{r.nomor}</TableCell>
                                <TableCell className="font-medium max-w-40"><span className="block truncate" title={r.customer}>{r.customer}</span></TableCell>
                                <TableCell className="max-w-40 truncate">{r.barang || '-'}</TableCell>
                                <TableCell className="text-right whitespace-nowrap">{formatNum(r.qty)}</TableCell>
                                <TableCell className="text-right whitespace-nowrap">{formatIDR(r.harga)}</TableCell>
                                <TableCell className="text-right whitespace-nowrap font-medium">{formatIDR(r.totalJual)}</TableCell>
                                <TableCell className="text-right whitespace-nowrap">
                                  {r.hppNull ? <MissingBadge /> : formatIDR(r.modal)}
                                </TableCell>
                                <TableCell className="text-right whitespace-nowrap">
                                  {r.hppNull ? (
                                    <span className="text-[11px] text-amber-700">Belum diisi</span>
                                  ) : (
                                    formatIDR(r.totalModal)
                                  )}
                                </TableCell>
                                <TableCell className="text-right whitespace-nowrap">
                                  {r.hppNull ? (
                                    <span className="text-[11px] text-amber-700">Belum diisi</span>
                                  ) : (
                                    <span className="text-emerald-700 font-medium">{formatIDR(r.laba)}</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    {/* Mobile */}
                    <div className="md:hidden space-y-3">
                      {rows.map((r, i) => (
                        <Card key={`${r.invoiceId}-${i}`} className="p-0 gap-0">
                          <CardContent className="p-4 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-mono text-xs font-semibold break-all">{r.nomor}</p>
                              <p className="text-xs text-muted-foreground shrink-0">{formatDate(r.tanggal)}</p>
                            </div>
                            <p className="text-sm font-medium">{r.customer}</p>
                            <p className="text-sm text-muted-foreground break-words">
                              {r.barang || '-'} · Qty {formatNum(r.qty)} × {formatIDR(r.harga)}
                            </p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm border-t border-stone-100 pt-2">
                              <p className="text-muted-foreground">
                                Total Jual: <span className="font-medium text-stone-700">{formatIDR(r.totalJual)}</span>
                              </p>
                              <p className="text-muted-foreground text-right sm:text-left">
                                Total Modal:{' '}
                                {r.hppNull ? (
                                  <MissingBadge />
                                ) : (
                                  <span className="font-medium text-stone-700">{formatIDR(r.totalModal)}</span>
                                )}
                              </p>
                              <p className="text-muted-foreground col-span-2 sm:col-span-1">
                                Laba:{' '}
                                {r.hppNull ? (
                                  <MissingBadge />
                                ) : (
                                  <span className="font-medium text-emerald-700">{formatIDR(r.laba)}</span>
                                )}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full min-h-[44px]"
                              onClick={() => setDetailInvoiceId(r.invoiceId)}
                            >
                              Detail
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Klik baris transaksi untuk membuka detail transaksi.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}

        {/* ===== Template cetak (terlihat di layar, satu-satunya #print-area) ===== */}
        <Card id="print-area" className="p-0 gap-0 shadow-sm">
          <CardContent className="p-5 md:p-8">
            <ReportKop title="LAPORAN RUGI LABA SEDERHANA" period={periodLabel} />

            {/* Ringkasan bertingkat */}
            {t && (
              <div className="py-5 border-b border-stone-200 space-y-1.5 text-sm max-w-md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p>Total Penjualan</p>
                    <p className="text-[11px] text-muted-foreground">{t.jumlahInvoice} invoice reguler &amp; DP</p>
                  </div>
                  <p className="font-semibold text-right whitespace-nowrap">{formatIDR(t.penjualan)}</p>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p>Total Modal</p>
                    <p className="text-[11px] text-muted-foreground">Harga pokok barang terjual</p>
                  </div>
                  <p className="font-semibold text-right whitespace-nowrap">{formatIDR(t.hargaPokok)}</p>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p>Laba Kotor</p>
                    <p className="text-[11px] text-muted-foreground">Penjualan − modal (harga pokok)</p>
                  </div>
                  <p className="font-semibold text-right whitespace-nowrap text-emerald-700">{formatIDR(t.labaKotor)}</p>
                </div>

                <div className="pt-3">
                  <p className="font-semibold">Biaya Operasional</p>
                  {expenses.length === 0 ? (
                    <>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Tidak ada biaya operasional pada periode ini.</p>
                      <p className="text-[11px] text-muted-foreground">Catatan: kelola biaya di menu Biaya Operasional.</p>
                    </>
                  ) : (
                    <div className="mt-1 space-y-0.5">
                      {expenses.map((x) => (
                        <div key={x.id} className="flex justify-between gap-3 text-xs sm:text-sm">
                          <span className="min-w-0">
                            {formatDate(x.tanggal)} — {splitKeterangan(x.keterangan).nama || '—'}
                          </span>
                          <span className="whitespace-nowrap">{formatIDR(x.jumlah)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-between gap-3 text-xs sm:text-sm font-semibold border-t border-stone-200 mt-1.5 pt-1.5">
                    <span>Total Biaya Operasional</span>
                    <span className="whitespace-nowrap">{formatIDR(t.biayaOperasional)}</span>
                  </div>
                </div>

                <Separator className="my-2" />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">Laba Bersih</p>
                    <p className="text-[11px] text-muted-foreground">Laba kotor − biaya operasional</p>
                  </div>
                  <p className={cn('text-xl font-bold text-right whitespace-nowrap', t.labaBersih < 0 ? 'text-red-600' : 'text-emerald-700')}>
                    {formatIDR(t.labaBersih)}
                  </p>
                </div>
              </div>
            )}

            {/* Rincian per barang */}
            <div className="py-5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Rincian per Barang</p>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tidak ada penjualan pada periode ini.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Nama</TableHead>
                      <TableHead className="text-xs text-right">Qty</TableHead>
                      <TableHead className="text-xs text-right">Penjualan</TableHead>
                      <TableHead className="text-xs text-right">Modal</TableHead>
                      <TableHead className="text-xs text-right">Laba</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it) => (
                      <TableRow key={it.name}>
                        <TableCell className="text-xs py-1.5">{it.name}</TableCell>
                        <TableCell className="text-xs py-1.5 text-right whitespace-nowrap">{formatNum(it.qty)}</TableCell>
                        <TableCell className="text-xs py-1.5 text-right whitespace-nowrap">{formatIDR(it.penjualan)}</TableCell>
                        <TableCell className="text-xs py-1.5 text-right whitespace-nowrap">
                          {it.modalMissing ? 'Belum diisi' : formatIDR(it.modal)}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-right whitespace-nowrap">
                          {it.modalMissing ? 'Belum diisi' : formatIDR(it.laba)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {t && uncounted.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Catatan: {uncounted.length} baris item (penjualan {formatIDR(uncountedPenjualan)}) tidak diikutkan dalam
                perhitungan laba karena harga modal belum diisi.
              </p>
            )}

            <ReportSignature userName={currentUser?.username || 'Admin'} />
          </CardContent>
        </Card>
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
                  <DialogTitle className="font-mono text-base">{detailInvoice.nomor}</DialogTitle>
                  <DialogDescription>
                    {detailInvoice.customer} · {formatDate(detailInvoice.tanggal)}
                  </DialogDescription>
                </DialogHeader>
                <div className="rounded-xl border border-stone-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-stone-50 hover:bg-stone-50">
                        <TableHead className="text-xs">Barang</TableHead>
                        <TableHead className="text-xs text-right">Qty</TableHead>
                        <TableHead className="text-xs text-right">Harga Jual</TableHead>
                        <TableHead className="text-xs text-right">Harga Modal</TableHead>
                        <TableHead className="text-xs text-right">Total Modal</TableHead>
                        <TableHead className="text-xs text-right">Laba</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailInvoice.items.map((it, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm max-w-48"><span className="block truncate" title={it.barang}>{it.barang || '-'}</span></TableCell>
                          <TableCell className="text-right text-sm whitespace-nowrap">{formatNum(it.qty)}</TableCell>
                          <TableCell className="text-right text-sm whitespace-nowrap">{formatIDR(it.harga)}</TableCell>
                          <TableCell className="text-right text-sm whitespace-nowrap">
                            {it.hppNull ? <MissingBadge /> : formatIDR(it.modal)}
                          </TableCell>
                          <TableCell className="text-right text-sm whitespace-nowrap">
                            {it.hppNull ? (
                              <span className="text-[11px] text-amber-700">Belum diisi</span>
                            ) : (
                              formatIDR(it.totalModal)
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm whitespace-nowrap">
                            {it.hppNull ? (
                              <span className="text-[11px] text-amber-700">Belum diisi</span>
                            ) : (
                              <span className="text-emerald-700 font-medium">{formatIDR(it.laba)}</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="rounded-lg bg-stone-50 p-3 text-sm space-y-1.5 max-w-md">
                  <p className="flex justify-between"><span className="text-muted-foreground">Total Jual</span><span className="font-semibold">{formatIDR(totalJual)}</span></p>
                  <p className="flex justify-between"><span className="text-muted-foreground">Total Modal</span><span>{formatIDR(totalModal)}</span></p>
                  <p className="flex justify-between border-t border-stone-200 pt-1.5"><span className="text-muted-foreground font-semibold">Laba</span><span className={cn('font-bold', laba < 0 ? 'text-red-600' : 'text-emerald-700')}>{formatIDR(laba)}</span></p>
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
