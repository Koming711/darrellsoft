'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, Eye, FileDown, Pencil, Printer, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/dashboard-layout'
import { apiFetch } from '@/lib/client'
import { getAuthUser } from '@/lib/auth'
import { formatIDR } from '@/lib/format'
import type { CompanyInfo, InvoiceData } from '@/lib/types'
import { cn } from '@/lib/utils'
import { InvoicePreview } from '@/components/dokupro/invoice-preview'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Textarea } from '@/components/ui/textarea'

// ==================== Helper format (disalin dari arsip report-shared/format agar font & tampilan persis) ====================

const MONTH_LABELS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
] as const

/** Format tanggal pendek gaya arsip: "07 Sep 2026" */
function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Format tanggal + jam untuk kop cetak (arsip formatDateTime) */
function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/** ISO string -> yyyy-mm-dd untuk <input type="date"> (arsip toInputDate) */
function toInputDate(iso: string | Date | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'Terjadi kesalahan'
}

// ==================== Types ====================

type SaleStatus = 'lunas' | 'jatuh_tempo' | 'dp' | 'belum' | 'batal'

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
  status: SaleStatus
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
  /** Field tambahan (additif) untuk caption kartu gaya arsip */
  totalDp: number
  totalPelunasan: number
  regulerLunasTotal: number
  jumlahTransaksi: number
}

interface CustomerOption { id: string; name: string }

type ReportPeriod = 'today' | 'week' | 'month' | 'year' | 'date' | 'all'

const EMPTY_SUMMARY: SalesSummary = {
  totalPenjualan: 0,
  pembayaranMasuk: 0,
  piutang: 0,
  jumlahInvoice: 0,
  totalDp: 0,
  totalPelunasan: 0,
  regulerLunasTotal: 0,
  jumlahTransaksi: 0,
}

// ==================== Filter periode (disalin inline dari arsip report-shared.tsx) ====================

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

/** Teks periode untuk subjudul & kop cetak (arsip periodText). */
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

// ==================== Kop & tanda tangan cetak (arsip ReportKop/ReportSignature, branding Darrell Soft) ====================

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
        <p className="text-xs sm:text-sm pt-1" suppressHydrationWarning>
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
        <p className="text-xs text-muted-foreground mt-0.5" suppressHydrationWarning>{formatDate(new Date())}</p>
      </div>
    </div>
  )
}

/** Print & Simpan sebagai PDF (arsip useReportPrint — CSS #print-area disematkan inline di bawah). */
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

/** CSS cetak #print-area dari globals.css arsip — disematkan inline (file ini hanya boleh mengubah page.tsx). */
const PRINT_AREA_CSS = `
@media print {
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
  @page {
    size: auto;
    margin: 12mm;
  }
}
`

// ==================== Badge (arsip dashboard-view StatusBadge/TypeBadge, warna spesifikasi) ====================

/** Badge status: Lunas hijau, Belum amber, Jatuh Tempo merah, DP biru, Batal rose (spesifikasi warna) */
function StatusBadge({ status }: { status: SaleStatus }) {
  const map: Record<SaleStatus, string> = {
    lunas: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    belum: 'bg-amber-50 text-amber-700 border-amber-200',
    jatuh_tempo: 'bg-red-50 text-red-700 border-red-200',
    dp: 'bg-sky-50 text-sky-700 border-sky-200',
    batal: 'bg-rose-50 text-rose-700 border-rose-200',
  }
  const label: Record<SaleStatus, string> = {
    lunas: 'Lunas',
    belum: 'Belum Lunas',
    jatuh_tempo: 'Jatuh Tempo',
    dp: 'DP',
    batal: 'Batal',
  }
  return <Badge variant="outline" className={`${map[status]} text-[11px] shrink-0`}>{label[status]}</Badge>
}

/** Badge jenis invoice: Reguler = stone, DP = biru (spesifikasi warna arsip) */
function TypeBadge({ jenis }: { jenis: string }) {
  const map: Record<string, string> = {
    Reguler: 'bg-stone-50 text-stone-600 border-stone-300',
    DP: 'bg-sky-50 text-sky-700 border-sky-200',
  }
  return <Badge variant="outline" className={`${map[jenis] ?? map.Reguler} text-[11px] shrink-0`}>{jenis}</Badge>
}

// ==================== InvoiceData dari dataJson (pola parseInvoiceData invoice/page.tsx) ====================

function buildInvoiceData(parsed: Record<string, unknown>, fallbackNomor: string, fallbackTanggal: string): InvoiceData {
  const company: CompanyInfo = {
    nama: (parsed.company as CompanyInfo | undefined)?.nama || 'Darrell Soft',
    telepon: (parsed.company as CompanyInfo | undefined)?.telepon || '',
    alamat: (parsed.company as CompanyInfo | undefined)?.alamat || '',
    email: (parsed.company as CompanyInfo | undefined)?.email || '',
    npwp: (parsed.company as CompanyInfo | undefined)?.npwp || '',
    website: (parsed.company as CompanyInfo | undefined)?.website || '',
    ppn: (parsed.company as CompanyInfo | undefined)?.ppn ?? (parsed.ppn as number | undefined) ?? 11,
    logo: (parsed.company as CompanyInfo | undefined)?.logo || '',
    bankName: (parsed.company as CompanyInfo | undefined)?.bankName || '',
    bankAccount: (parsed.company as CompanyInfo | undefined)?.bankAccount || '',
    bankHolder: (parsed.company as CompanyInfo | undefined)?.bankHolder || '',
    bankName2: (parsed.company as CompanyInfo | undefined)?.bankName2 || '',
    bankAccount2: (parsed.company as CompanyInfo | undefined)?.bankAccount2 || '',
    bankHolder2: (parsed.company as CompanyInfo | undefined)?.bankHolder2 || '',
  }
  const client = (parsed.client as InvoiceData['client']) || { nama: '', kontak: '', alamat: '' }
  const items = (Array.isArray(parsed.items) ? parsed.items : []).map(
    (it: { id?: string; deskripsi?: string; qty?: number; satuan?: string; harga?: number; modal?: number }, i: number) => ({
      id: it.id || `item-${i}`,
      deskripsi: it.deskripsi || '',
      qty: it.qty || 0,
      satuan: it.satuan || '',
      harga: it.harga || 0,
      ...(it.modal !== undefined ? { modal: it.modal } : {}),
    })
  )
  return {
    type: 'invoice',
    company,
    nomor: (parsed.nomor as string) || fallbackNomor,
    tanggal: (parsed.tanggal as string) || fallbackTanggal,
    referensi: (parsed.referensi as string) || '',
    client,
    items,
    ppn: (parsed.ppn as number) ?? 11,
    dp: (parsed.dp as number) || 0,
    dpAmount: parsed.dpAmount !== undefined ? (parsed.dpAmount as number) : undefined,
    catatan: (parsed.catatan as string) || '',
    tanggalJatuhTempo: (parsed.tanggalJatuhTempo as string) || '',
    caraPembayaran: ((parsed.caraPembayaran as InvoiceData['caraPembayaran']) || ''),
    tanggalGiro: (parsed.tanggalGiro as string) || '',
    lunas: parsed.lunas === true,
    tanggalPelunasan: (parsed.tanggalPelunasan as string) || '',
    referensiInvoiceId: (parsed.referensiInvoiceId as string) || undefined,
    referensiInvoiceNomor: (parsed.referensiInvoiceNomor as string) || undefined,
    originalTotal: parsed.originalTotal !== undefined ? (parsed.originalTotal as number) : undefined,
  }
}

// ==================== Page ====================

export default function LaporanPenjualanPage() {
  const [now] = useState(() => new Date())
  const [period, setPeriod] = useState<ReportPeriod>('month')
  const [month, setMonth] = useState<number | null>(now.getMonth() + 1)
  const [year, setYear] = useState<number | null>(now.getFullYear())
  const [from, setFrom] = useState<string>(() => toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [to, setTo] = useState<string>(() => toInputDate(now))
  const [customerId, setCustomerId] = useState<string>('all')
  const [payStatus, setPayStatus] = useState<'all' | 'lunas' | 'belum' | 'batal'>('all')
  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')

  const [data, setData] = useState<{ rows: SaleRow[]; summary: SalesSummary; truncated?: boolean; totalCount?: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [user, setUser] = useState<{ name?: string; username?: string; role?: string } | null>(null)

  // Dialog detail (Lihat)
  const [detailRow, setDetailRow] = useState<SaleRow | null>(null)

  // Dialog edit
  const [editRow, setEditRow] = useState<SaleRow | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editStatus, setEditStatus] = useState<'belum' | 'lunas' | 'batal'>('belum')
  const [editDueDate, setEditDueDate] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Dialog hapus
  const [deleteRow, setDeleteRow] = useState<SaleRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Dialog cetak invoice per baris
  const [printId, setPrintId] = useState<string | null>(null)

  const { print, savePdf } = useReportPrint()

  // User dari localStorage (setelah mount agar tidak hydration mismatch)
  useEffect(() => {
    setUser(getAuthUser())
  }, [])

  // Debounce pencarian 400ms (arsip)
  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput.trim()), 400)
    return () => clearTimeout(t)
  }, [searchInput])

  // Daftar pelanggan untuk filter (sekali saat mount)
  useEffect(() => {
    let cancelled = false
    apiFetch<CustomerOption[]>('/api/customers')
      .then((d) => {
        if (!cancelled) setCustomers(Array.isArray(d) ? d : [])
      })
      .catch((e) => {
        if (!cancelled) toast.error(errText(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (period === 'today') {
      p.set('start', toInputDate(now))
      p.set('end', toInputDate(now))
    } else if (period === 'week') {
      const day = (now.getDay() + 6) % 7 // 0 = Senin
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day)
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
      p.set('start', toInputDate(start))
      p.set('end', toInputDate(end))
    } else if (period === 'month') {
      const m = month ?? now.getMonth() + 1
      const y = year ?? now.getFullYear()
      p.set('start', toInputDate(new Date(y, m - 1, 1)))
      p.set('end', toInputDate(new Date(y, m, 0)))
    } else if (period === 'year') {
      const y = year ?? now.getFullYear()
      p.set('start', `${y}-01-01`)
      p.set('end', `${y}-12-31`)
    } else if (period === 'date') {
      if (from) p.set('start', from)
      if (to) p.set('end', to)
    }
    // period === 'all' → tanpa start/end (semua periode)
    if (customerId !== 'all') p.set('customer', customerId)
    if (payStatus !== 'all') p.set('status', payStatus)
    if (q) p.set('q', q)
    return p.toString()
  }, [period, from, to, month, year, customerId, payStatus, q, now])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await apiFetch<{ rows: SaleRow[]; summary: SalesSummary; truncated?: boolean; totalCount?: number }>(`/api/laporan/penjualan?${query}`)
      setData(d)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    void load()
  }, [load])

  // Inisialisasi form edit saat dialog dibuka
  useEffect(() => {
    if (!editRow) return
    setEditDate(toInputDate(editRow.tanggal))
    setEditStatus(editRow.status === 'batal' ? 'batal' : editRow.lunas ? 'lunas' : 'belum')
    setEditDueDate(editRow.tanggalJatuhTempo ? toInputDate(editRow.tanggalJatuhTempo) : '')
    setEditNotes(editRow.catatan ?? '')
  }, [editRow])

  // Pratinjau cetak per baris: InvoiceData dari dataJson baris (tanpa fetch tambahan)
  const printRow = printId ? (data?.rows.find((r) => r.id === printId) ?? null) : null
  const printData = useMemo(() => {
    if (!printRow) return null
    try {
      return buildInvoiceData(JSON.parse(printRow.dataJson || '{}') as Record<string, unknown>, printRow.nomor, printRow.tanggal)
    } catch {
      return null
    }
  }, [printRow])

  const closePrintDialog = useCallback(() => {
    setPrintId(null)
  }, [])

  const saveEdit = async () => {
    if (!editRow) return
    setSaving(true)
    try {
      // Pola merge dataJson (sama dengan handleEditSave lama & handleBatal invoice)
      const parsed = JSON.parse(editRow.dataJson || '{}') as Record<string, unknown>
      parsed.tanggal = editDate
      parsed.catatan = editNotes
      parsed.tanggalJatuhTempo = editDueDate || ''
      if (editStatus === 'lunas') {
        parsed.lunas = true
        parsed.batal = false
        if (!parsed.tanggalPelunasan) parsed.tanggalPelunasan = toInputDate(new Date())
      } else if (editStatus === 'batal') {
        parsed.batal = true
      } else {
        parsed.lunas = false
        parsed.batal = false
        delete parsed.tanggalPelunasan
      }
      await apiFetch(`/api/history/${editRow.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          nomor: editRow.nomor,
          tanggal: editDate,
          pihakKedua: editRow.customer,
          dataJson: JSON.stringify(parsed),
        }),
      })
      toast.success('Perubahan disimpan')
      setEditRow(null)
      await load()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteRow) return
    setDeleting(true)
    try {
      await apiFetch<{ success: boolean }>(`/api/history/${deleteRow.id}`, { method: 'DELETE' })
      toast.success('Invoice dihapus (masuk Sampah)')
      setDeleteRow(null)
      await load()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setDeleting(false)
    }
  }

  const rows = data?.rows ?? []
  const s = data?.summary ?? null
  const periodLabel = periodText(period, from, to, month, year)
  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin'

  return (
    <DashboardLayout title="Laporan Penjualan" subtitle="Data penjualan dari invoice">
      {/* CSS cetak #print-area (arsip) */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_AREA_CSS }} />

      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">Laporan Penjualan</h1>
            <p className="text-sm text-muted-foreground mt-1">Periode: {periodLabel}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={print}
              className="min-h-[44px] flex-1 sm:flex-none"
              aria-label="Cetak laporan penjualan"
            >
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button
              variant="outline"
              onClick={savePdf}
              className="min-h-[44px] flex-1 sm:flex-none"
              aria-label="Simpan laporan penjualan sebagai PDF"
            >
              <FileDown className="h-4 w-4" /> Simpan sebagai PDF
            </Button>
          </div>
        </div>

        {/* Filter */}
        <Card className="p-0 gap-0">
          <CardContent className="p-4 space-y-4">
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="report-customer">Pelanggan</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger id="report-customer" aria-label="Filter pelanggan" className="w-full min-h-[44px]">
                    <SelectValue placeholder="Semua Pelanggan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Pelanggan</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="report-pay-status">Status Pembayaran</Label>
                <Select value={payStatus} onValueChange={(v) => setPayStatus(v as 'all' | 'lunas' | 'belum' | 'batal')}>
                  <SelectTrigger id="report-pay-status" aria-label="Filter status pembayaran" className="w-full min-h-[44px]">
                    <SelectValue placeholder="Semua Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Status</SelectItem>
                    <SelectItem value="lunas">Lunas</SelectItem>
                    <SelectItem value="belum">Belum Lunas</SelectItem>
                    <SelectItem value="batal">Batal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5 sm:col-span-2 lg:col-span-1">
                <Label htmlFor="report-search">Cari</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" aria-hidden="true" />
                  <Input
                    id="report-search"
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Cari nomor, pelanggan, atau barang…"
                    aria-label="Cari"
                    className="pl-9 min-h-[44px]"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ringkasan */}
        {loading && !data ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : s ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-0 gap-0">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">Total Penjualan</p>
                <p className="text-lg md:text-xl font-bold mt-1">{formatIDR(s.totalPenjualan)}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{s.jumlahTransaksi} invoice reguler &amp; DP</p>
              </CardContent>
            </Card>
            <Card className="p-0 gap-0">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">Pembayaran Masuk</p>
                <p className="text-lg md:text-xl font-bold mt-1 text-emerald-700">{formatIDR(s.pembayaranMasuk)}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  DP {formatIDR(s.totalDp)} · Pelunasan {formatIDR(s.totalPelunasan)} · Reguler lunas {formatIDR(s.regulerLunasTotal)}
                </p>
              </CardContent>
            </Card>
            <Card className="p-0 gap-0">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">Total Piutang</p>
                <p className="text-lg md:text-xl font-bold mt-1 text-amber-700">{formatIDR(s.piutang)}</p>
                <p className="text-[11px] text-muted-foreground mt-1">Belum dibayar dari invoice reguler &amp; DP</p>
              </CardContent>
            </Card>
            <Card className="p-0 gap-0">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">Jumlah Invoice</p>
                <p className="text-lg md:text-xl font-bold mt-1">{s.jumlahInvoice}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{s.jumlahTransaksi} transaksi penjualan</p>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* Peringatan data terpotong */}
        {data?.truncated && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="alert">
            Menampilkan 2000 invoice terbaru dari {data.totalCount ?? s?.jumlahInvoice ?? 0} — persempit periode untuk melihat semua.
          </div>
        )}

        {/* Daftar invoice */}
        {loading && !data ? (
          <Skeleton className="h-72 w-full rounded-xl" />
        ) : rows.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Tabel desktop */}
            <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
              <div className="max-h-96 overflow-y-auto scrollbar-thin">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-stone-50">
                    <TableRow className="bg-stone-50 hover:bg-stone-50">
                      <TableHead className="w-10">No.</TableHead>
                      <TableHead>Nomor Invoice</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Jenis Invoice</TableHead>
                      <TableHead className="text-right">Total Penjualan</TableHead>
                      <TableHead className="text-right">DP</TableHead>
                      <TableHead className="text-right">Pelunasan</TableHead>
                      <TableHead className="text-right">Sisa Tagihan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <TableRow key={r.id} className={cn(r.status === 'batal' && 'opacity-60')}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-xs">{r.nomor}</span>
                            {r.jenis !== 'Reguler' && <TypeBadge jenis={r.jenis} />}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(r.tanggal)}</TableCell>
                        <TableCell className="font-medium max-w-40 truncate">{r.customer}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{r.jenis}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{formatIDR(r.total)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{r.dpAmount > 0 ? formatIDR(r.dpAmount) : '—'}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{r.pelunasan > 0 ? formatIDR(r.pelunasan) : '—'}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <span className={cn(r.sisa > 0 && 'text-amber-700 font-medium')}>
                            {formatIDR(r.sisa)}
                          </span>
                        </TableCell>
                        <TableCell><StatusBadge status={r.status} /></TableCell>
                        <TableCell>
                          <DesktopRowActions
                            number={r.nomor}
                            isAdmin={isAdmin}
                            onView={() => setDetailRow(r)}
                            onEdit={() => setEditRow(r)}
                            onPrint={() => setPrintId(r.id)}
                            onDelete={() => setDeleteRow(r)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Kartu mobile */}
            <div className="md:hidden space-y-3">
              {rows.map((r) => (
                <Card key={r.id} className={cn('p-0 gap-0', r.status === 'batal' && 'opacity-60')}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-mono text-xs font-semibold break-all">{r.nomor}</p>
                          {r.jenis !== 'Reguler' && <TypeBadge jenis={r.jenis} />}
                        </div>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-sm">
                      <span className="text-muted-foreground">{formatDate(r.tanggal)} · </span>
                      <span className="font-medium">{r.customer}</span>
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm border-t border-stone-100 pt-2">
                      <p className="text-muted-foreground">Penjualan: <span className="font-medium text-stone-700">{formatIDR(r.total)}</span></p>
                      <p className="text-muted-foreground text-right sm:text-left">DP: <span className="font-medium text-stone-700">{r.dpAmount > 0 ? formatIDR(r.dpAmount) : '—'}</span></p>
                      <p className="text-muted-foreground">Pelunasan: <span className="font-medium text-stone-700">{r.pelunasan > 0 ? formatIDR(r.pelunasan) : '—'}</span></p>
                      <p className="text-muted-foreground text-right sm:text-left">
                        Sisa: <span className={cn('font-medium', r.sisa > 0 ? 'text-amber-700' : 'text-stone-700')}>
                          {formatIDR(r.sisa)}
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-2.5">
                      <Button
                        variant="outline"
                        className="flex-1 min-h-[36px] h-8 px-2 gap-1 text-xs"
                        onClick={() => setDetailRow(r)}
                      >
                        <Eye className="h-3.5 w-3.5" /> Detail
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 min-h-[36px] h-8 px-2 gap-1 text-xs"
                        onClick={() => setEditRow(r)}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 min-h-[36px] h-8 px-2 gap-1 text-xs"
                        onClick={() => setPrintId(r.id)}
                      >
                        <Printer className="h-3.5 w-3.5" /> Print
                      </Button>
                      {isAdmin && (
                        <Button
                          variant="outline"
                          className="flex-1 min-h-[36px] h-8 px-2 gap-1 text-xs text-destructive hover:text-destructive"
                          onClick={() => setDeleteRow(r)}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Hapus
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Penjualan dihitung dari invoice Reguler &amp; DP. Invoice pelunasan adalah pembayaran, tidak dihitung dua kali.
            </p>
          </>
        )}

        {/* Dialog detail (Lihat) */}
        <Dialog open={detailRow !== null} onOpenChange={(o) => { if (!o) setDetailRow(null) }}>
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
                      <span className="font-mono text-xs">{detailRow.nomor}</span>
                      <StatusBadge status={detailRow.status} />
                    </DialogTitle>
                    <DialogDescription>
                      {detailRow.customer} · {formatDate(detailRow.tanggal)} · {detailRow.jenis}
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
                                <TableCell className="text-right text-sm whitespace-nowrap">{formatIDR(o.harga || 0)}</TableCell>
                                {hasModal && <TableCell className="text-right text-sm whitespace-nowrap">{formatIDR(o.modal || 0)}</TableCell>}
                                <TableCell className="text-right text-sm whitespace-nowrap font-medium">{formatIDR((o.qty || 0) * (o.harga || 0))}</TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-lg bg-stone-50 p-3 space-y-1.5">
                        <p className="flex justify-between"><span className="text-muted-foreground">Total Penjualan</span><span className="font-bold">{formatIDR(detailRow.total)}</span></p>
                        <p className="flex justify-between"><span className="text-muted-foreground">DP {detailRow.dpPercent > 0 ? `(${detailRow.dpPercent}%)` : ''}</span><span>{detailRow.dpAmount > 0 ? formatIDR(detailRow.dpAmount) : '—'}</span></p>
                        <p className="flex justify-between"><span className="text-muted-foreground">Pelunasan</span><span>{detailRow.pelunasan > 0 ? formatIDR(detailRow.pelunasan) : '—'}</span></p>
                        <p className="flex justify-between border-t border-stone-200 pt-1.5"><span className="text-muted-foreground">Sisa Tagihan</span><span className="font-semibold text-amber-700">{formatIDR(detailRow.sisa)}</span></p>
                      </div>
                      <div className="rounded-lg bg-stone-50 p-3 space-y-1.5">
                        <p className="flex justify-between"><span className="text-muted-foreground">Jatuh Tempo</span><span>{formatDate(detailRow.tanggalJatuhTempo)}</span></p>
                        <p className="flex justify-between"><span className="text-muted-foreground">Cara Bayar</span><span className="capitalize">{detailRow.caraPembayaran || '—'}</span></p>
                        <p className="flex justify-between"><span className="text-muted-foreground">Tgl Pelunasan</span><span>{detailRow.tanggalPelunasan ? formatDate(detailRow.tanggalPelunasan) : '—'}</span></p>
                        {detailRow.catatan && <p className="text-xs text-muted-foreground pt-1 border-t border-stone-200">Catatan: {detailRow.catatan}</p>}
                      </div>
                    </div>
                  </div>
                </>
              )
            })()}
          </DialogContent>
        </Dialog>

        {/* Dialog edit invoice */}
        <Dialog open={editRow !== null} onOpenChange={(o) => { if (!o) setEditRow(null) }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Invoice</DialogTitle>
              <DialogDescription>
                Perbarui data {editRow?.nomor}. Nomor, pelanggan, dan rincian barang tidak dapat diubah di sini.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid gap-1.5">
                <Label htmlFor="edit-date">Tanggal</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="min-h-[44px]"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-status">Status Pembayaran</Label>
                <Select value={editStatus} onValueChange={(v) => setEditStatus(v as 'belum' | 'lunas' | 'batal')}>
                  <SelectTrigger id="edit-status" aria-label="Status pembayaran" className="w-full min-h-[44px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="belum">Belum Lunas</SelectItem>
                    <SelectItem value="lunas">Lunas</SelectItem>
                    <SelectItem value="batal">Batal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-due">Jatuh Tempo</Label>
                <Input
                  id="edit-due"
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  aria-label="Jatuh tempo"
                  className="min-h-[44px]"
                />
                <p className="text-[11px] text-muted-foreground">Kosongkan jika tidak ada jatuh tempo.</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-notes">Catatan</Label>
                <Textarea
                  id="edit-notes"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                  placeholder="Catatan invoice (opsional)"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditRow(null)} disabled={saving}>Batal</Button>
              <Button
                onClick={() => void saveEdit()}
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {saving ? 'Menyimpan…' : 'Simpan'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog hapus invoice */}
        <AlertDialog open={deleteRow !== null} onOpenChange={(o) => { if (!o) setDeleteRow(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus {deleteRow?.nomor}?</AlertDialogTitle>
              <AlertDialogDescription>
                Invoice akan dihapus dari laporan beserta seluruh rinciannya (dokumen pelunasan terkait ikut dihapus)
                dan laporan otomatis diperbarui. Data masih dapat dipulihkan dari menu Sampah.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
              <AlertDialogAction
                disabled={deleting}
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={(e) => { e.preventDefault(); void confirmDelete() }}
              >
                {deleting ? 'Menghapus…' : 'Hapus'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Dialog cetak invoice per baris — saat terbuka, satu-satunya #print-area adalah Card di dalam dialog */}
        <Dialog open={printId !== null} onOpenChange={(o) => { if (!o) closePrintDialog() }}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader className="sr-only">
              <DialogTitle>Cetak Invoice</DialogTitle>
              <DialogDescription>Pratinjau invoice sebelum dicetak</DialogDescription>
            </DialogHeader>
            {printData ? (
              <div className="overflow-x-auto">
                <Card id="print-area" className="p-0 gap-0 w-fit mx-auto">
                  <CardContent className="p-5 md:p-8">
                    <InvoicePreview data={printData} />
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Skeleton className="h-96 w-full" />
            )}
            <DialogFooter>
              <Button variant="outline" onClick={closePrintDialog}>Tutup</Button>
              <Button
                onClick={() => window.print()}
                disabled={!printData}
                className="bg-emerald-600 hover:bg-emerald-700"
                aria-label="Cetak invoice"
              >
                <Printer className="h-4 w-4" /> Cetak
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ===== Template cetak laporan (terlihat di layar; tidak dirender saat dialog cetak invoice terbuka) ===== */}
        {!printId && (
          <Card id="print-area" className="p-0 gap-0 shadow-sm">
            <CardContent className="p-5 md:p-8">
              <ReportKop title="LAPORAN PENJUALAN" period={periodLabel} />

              {/* Ringkasan cetak */}
              {s && (
                <div className="py-5 border-b border-stone-200 space-y-1.5 text-sm max-w-md">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p>Total Penjualan</p>
                      <p className="text-[11px] text-muted-foreground">{s.jumlahTransaksi} invoice reguler &amp; DP</p>
                    </div>
                    <p className="font-semibold text-right whitespace-nowrap">{formatIDR(s.totalPenjualan)}</p>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p>Total Pembayaran Masuk</p>
                      <p className="text-[11px] text-muted-foreground">
                        DP {formatIDR(s.totalDp)} · Pelunasan {formatIDR(s.totalPelunasan)} · Reguler lunas {formatIDR(s.regulerLunasTotal)}
                      </p>
                    </div>
                    <p className="font-semibold text-right whitespace-nowrap">{formatIDR(s.pembayaranMasuk)}</p>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p>Total Piutang</p>
                      <p className="text-[11px] text-muted-foreground">Belum dibayar dari invoice reguler &amp; DP</p>
                    </div>
                    <p className="font-semibold text-right whitespace-nowrap text-amber-700">{formatIDR(s.piutang)}</p>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p>Jumlah Invoice</p>
                      <p className="text-[11px] text-muted-foreground">{s.jumlahTransaksi} transaksi penjualan</p>
                    </div>
                    <p className="font-semibold text-right whitespace-nowrap">{s.jumlahInvoice}</p>
                  </div>
                </div>
              )}

              {/* Tabel ringkas cetak */}
              <div className="py-5">
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Tidak ada invoice pada periode ini.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Nomor Invoice</TableHead>
                        <TableHead className="text-xs">Tanggal</TableHead>
                        <TableHead className="text-xs">Pelanggan</TableHead>
                        <TableHead className="text-xs">Tipe</TableHead>
                        <TableHead className="text-xs text-right">Penjualan</TableHead>
                        <TableHead className="text-xs text-right">DP</TableHead>
                        <TableHead className="text-xs text-right">Pelunasan</TableHead>
                        <TableHead className="text-xs text-right">Sisa</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs font-mono py-1.5">{r.nomor}</TableCell>
                          <TableCell className="text-xs py-1.5 whitespace-nowrap">{formatDate(r.tanggal)}</TableCell>
                          <TableCell className="text-xs py-1.5">{r.customer}</TableCell>
                          <TableCell className="text-xs py-1.5">{r.jenis}</TableCell>
                          <TableCell className="text-xs py-1.5 text-right whitespace-nowrap">{formatIDR(r.total)}</TableCell>
                          <TableCell className="text-xs py-1.5 text-right whitespace-nowrap">{r.dpAmount > 0 ? formatIDR(r.dpAmount) : '—'}</TableCell>
                          <TableCell className="text-xs py-1.5 text-right whitespace-nowrap">{r.pelunasan > 0 ? formatIDR(r.pelunasan) : '—'}</TableCell>
                          <TableCell className="text-xs py-1.5 text-right whitespace-nowrap">{formatIDR(r.sisa)}</TableCell>
                          <TableCell className="text-xs py-1.5 whitespace-nowrap">{statusTextLabel(r.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground">
                Penjualan dihitung dari invoice Reguler &amp; DP. Invoice pelunasan adalah pembayaran, tidak dihitung dua kali.
              </p>

              <ReportSignature userName={user?.name || user?.username || 'Admin'} />
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}

/** Tombol aksi baris (desktop): ikon kecil ghost — Lihat | Edit | Print | (Hapus, ADMIN saja) */
function DesktopRowActions({
  number,
  isAdmin,
  onView,
  onEdit,
  onPrint,
  onDelete,
}: {
  number: string
  isAdmin: boolean
  onView: () => void
  onEdit: () => void
  onPrint: () => void
  onDelete: () => void
}) {
  const cls = 'min-h-[36px] h-8 w-8'
  return (
    <div className="flex gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className={cls}
        title="Lihat"
        aria-label={`Lihat invoice ${number}`}
        onClick={onView}
      >
        <Eye className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cls}
        title="Edit"
        aria-label={`Edit invoice ${number}`}
        onClick={onEdit}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cls}
        title="Print"
        aria-label={`Cetak invoice ${number}`}
        onClick={onPrint}
      >
        <Printer className="h-4 w-4" />
      </Button>
      {isAdmin && (
        <Button
          variant="ghost"
          size="icon"
          className={cn(cls, 'text-destructive hover:text-destructive')}
          title="Hapus"
          aria-label={`Hapus invoice ${number}`}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

/** Label status untuk tabel cetak (teks polos, arsip STATUS_LABEL) */
function statusTextLabel(status: SaleStatus): string {
  if (status === 'lunas') return 'Lunas'
  if (status === 'jatuh_tempo') return 'Jatuh Tempo'
  if (status === 'dp') return 'DP'
  if (status === 'batal') return 'Batal'
  return 'Belum Lunas'
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-white text-center py-12 px-4">
      <BarChart3 className="h-10 w-10 text-stone-300 mx-auto mb-2" aria-hidden="true" />
      <p className="text-sm font-medium">Tidak ada invoice pada periode ini.</p>
      <p className="text-xs text-muted-foreground mt-1">Coba ubah filter periode, status, atau kata kunci pencarian.</p>
    </div>
  )
}
