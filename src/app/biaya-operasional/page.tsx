'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/dashboard-layout'
import { authFetch } from '@/lib/auth-fetch'
import { getAuthUser } from '@/lib/auth'
import { hasSubPermission } from '@/lib/permissions'
import { notifyDataChange } from '@/lib/data-sync'
import { useDataChange } from '@/hooks/use-data-change'
import { useLanguage } from '@/contexts/language-context'
import { formatIDR } from '@/lib/format'
import { cn } from '@/lib/utils'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

// ==================== Tipe data (respon GET /api/biaya) ====================

interface Biaya {
  id: string
  tanggal: string // YYYY-MM-DD
  kategori: string
  keterangan: string
  jumlah: number
  metodePembayaran: string
  supplier: string
}

type ReportPeriod = 'today' | 'week' | 'month' | 'year' | 'date' | 'all'

// 7 kategori arsip (expenses-view)
const EXPENSE_CATEGORIES = [
  'Transportasi', 'Listrik', 'Gaji', 'Sewa', 'Packing', 'Ongkir', 'Lain-lain',
] as const

const METODE_OPTIONS = ['Tunai', 'Transfer', 'Kartu', 'QRIS', 'Lainnya']

// ==================== Helper (paritas arsip) ====================

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
 * Pemetaan data arsip → tabel Biaya (satu kolom teks):
 *   nama biaya + catatan disimpan di `keterangan` dengan pemisah " || ".
 * Data lama (tanpa pemisah) → seluruh teks dianggap nama biaya.
 */
const CATATAN_SEPARATOR = ' || '

function splitKeterangan(keterangan: string): { nama: string; catatan: string } {
  const idx = (keterangan || '').indexOf(CATATAN_SEPARATOR)
  if (idx >= 0) return { nama: keterangan.slice(0, idx), catatan: keterangan.slice(idx + CATATAN_SEPARATOR.length) }
  return { nama: keterangan || '', catatan: '' }
}

function joinKeterangan(nama: string, catatan: string): string {
  return catatan.trim() ? `${nama.trim()}${CATATAN_SEPARATOR}${catatan.trim()}` : nama.trim()
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

/** Teks periode untuk subjudul. */
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

// ==================== Badge kategori (salin arsip) ====================

/** Badge kategori biaya (outline stone). */
function CategoryBadge({ label }: { label: string }) {
  return (
    <Badge variant="outline" className="bg-stone-50 text-stone-600 border-stone-200 text-[11px] shrink-0">
      {label}
    </Badge>
  )
}

// ==================== Form ====================

interface ExpenseFormState {
  date: string
  nama: string
  category: string
  amount: string
  notes: string
  metodePembayaran: string
  supplier: string
}

function emptyForm(now: Date): ExpenseFormState {
  return {
    date: toInputDate(now),
    nama: '',
    category: 'Lain-lain',
    amount: '',
    notes: '',
    metodePembayaran: 'Tunai',
    supplier: '',
  }
}

// ==================== Halaman Biaya Operasional ====================

export default function BiayaOperasionalPage() {
  const { t } = useLanguage()
  const currentUser = getAuthUser()
  const canAdd = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'biaya', 'biaya-tambah')
  const canEdit = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'biaya', 'biaya-edit')
  const canDelete = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'biaya', 'biaya-hapus')
  const canView = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'biaya', 'biaya-lihat') || canAdd || canEdit || canDelete

  const [now] = useState(() => new Date())

  // Filter periode (API /api/biaya mengembalikan semua data → difilter di klien)
  const [period, setPeriod] = useState<ReportPeriod>('month')
  const [month, setMonth] = useState<number | null>(now.getMonth() + 1)
  const [year, setYear] = useState<number | null>(now.getFullYear())
  const [from, setFrom] = useState<string>(() => toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [to, setTo] = useState<string>(() => toInputDate(now))
  const [category, setCategory] = useState<string>('all')

  const [expenses, setExpenses] = useState<Biaya[]>([])
  const [loading, setLoading] = useState(true)

  // Dialog tambah / edit
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Biaya | null>(null)
  const [form, setForm] = useState<ExpenseFormState>(() => emptyForm(now))
  const [saving, setSaving] = useState(false)

  // Dialog hapus
  const [deleteTarget, setDeleteTarget] = useState<Biaya | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await authFetch('/api/biaya')
      const result = await response.json()
      if (!response.ok) throw new Error(result?.error || 'Gagal memuat data biaya')
      setExpenses(Array.isArray(result) ? result : [])
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (canView) void load()
    else setLoading(false)
  }, [load, canView])

  useDataChange(['biaya'], () => {
    if (canView) void load()
  })

  /**
   * Rentang from/to (yyyy-mm-dd) untuk SEMUA mode (filter klien — sumber data
   * sama dengan Laporan Rugi Laba):
   * - today: from = to = hari ini
   * - week: Senin–Minggu berjalan
   * - month: tgl-1 s.d. tgl-akhir bulan terpilih
   * - year: yyyy-01-01 s.d. yyyy-12-31
   * - date: from/to manual (state)
   * - all: null (tanpa filter tanggal)
   */
  const range = useMemo<{ from: string; to: string } | null>(() => {
    const y = year ?? now.getFullYear()
    const m = month ?? now.getMonth() + 1
    switch (period) {
      case 'today': {
        const d = toInputDate(now)
        return { from: d, to: d }
      }
      case 'week': {
        const day = (now.getDay() + 6) % 7 // 0 = Senin
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day)
        const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
        return { from: toInputDate(start), to: toInputDate(end) }
      }
      case 'month':
        return {
          from: toInputDate(new Date(y, m - 1, 1)),
          to: toInputDate(new Date(y, m, 0)),
        }
      case 'year':
        return { from: `${y}-01-01`, to: `${y}-12-31` }
      case 'date':
        return { from, to }
      default:
        return null
    }
  }, [period, month, year, from, to, now])

  /** Data terfilter (rentang tanggal + kategori) — gaya arsip. */
  const filteredExpenses = useMemo(() => {
    return expenses.filter((x) => {
      if (range) {
        if (range.from && x.tanggal < range.from) return false
        if (range.to && x.tanggal > range.to) return false
      }
      if (category !== 'all' && (x.kategori || 'Lain-lain') !== category) return false
      return true
    })
  }, [expenses, range, category])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm(now))
    setDialogOpen(true)
  }

  const openEdit = (x: Biaya) => {
    setEditing(x)
    const { nama, catatan } = splitKeterangan(x.keterangan)
    setForm({
      date: toInputDate(x.tanggal),
      nama,
      category: x.kategori || 'Lain-lain',
      amount: String(x.jumlah),
      notes: catatan,
      metodePembayaran: x.metodePembayaran || 'Tunai',
      supplier: x.supplier || '',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.date) {
      toast.error('Tanggal wajib diisi')
      return
    }
    if (!form.nama.trim()) {
      toast.error('Nama biaya wajib diisi')
      return
    }
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Nominal biaya harus lebih dari 0')
      return
    }
    setSaving(true)
    try {
      const body = {
        tanggal: form.date,
        kategori: form.category,
        keterangan: joinKeterangan(form.nama, form.notes),
        jumlah: amount,
        metodePembayaran: form.metodePembayaran || 'Tunai',
        supplier: form.supplier.trim(),
      }
      const response = editing
        ? await authFetch(`/api/biaya/${editing.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await authFetch('/api/biaya', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || 'Gagal menyimpan biaya')
      if (editing) {
        toast.success('Perubahan disimpan')
      } else {
        toast.success('Biaya operasional ditambahkan')
      }
      setDialogOpen(false)
      notifyDataChange('biaya')
      void load()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const response = await authFetch(`/api/biaya/${deleteTarget.id}`, { method: 'DELETE' })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || 'Gagal menghapus biaya')
      toast.success('Biaya dihapus')
      setDeleteTarget(null)
      notifyDataChange('biaya')
      void load()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setDeleting(false)
    }
  }

  const total = useMemo(() => filteredExpenses.reduce((s, x) => s + (Number(x.jumlah) || 0), 0), [filteredExpenses])
  const periodLabel = periodText(period, from, to, month, year)
  const hasData = filteredExpenses.length > 0

  return (
    <DashboardLayout title={t('biaya_operasional')} subtitle={t('subtitle_biaya')}>
      {!canView ? (
        <div className="bg-card rounded-xl shadow-sm border border-slate-200 p-4 lg:p-6">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Wallet className="w-16 h-16 mb-4 text-stone-300" aria-hidden="true" />
            <p className="text-lg font-semibold text-stone-500">Akses Ditolak</p>
            <p className="text-sm mt-1 text-muted-foreground">Anda tidak memiliki izin untuk melihat daftar biaya</p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Biaya Operasional</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Periode: {periodLabel} · catat pengeluaran di luar harga pokok barang
              </p>
            </div>
            {canAdd && (
              <Button
                onClick={openCreate}
                className="bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px] w-full sm:w-auto"
              >
                <Plus className="h-4 w-4" /> Tambah Biaya
              </Button>
            )}
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
              <div className="grid gap-1.5 sm:max-w-[280px]">
                <Label htmlFor="exp-filter-category">Kategori</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="exp-filter-category" aria-label="Filter kategori biaya" className="w-full min-h-[44px]">
                    <SelectValue placeholder="Semua Kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Kategori</SelectItem>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Ringkasan */}
          <Card className="p-0 gap-0">
            <CardContent className="p-4 md:p-5">
              {loading ? (
                <Skeleton className="h-16 w-full md:max-w-xs" />
              ) : (
                <>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Wallet className="h-4 w-4 text-emerald-600" />
                    <p className="text-xs font-medium">Total Biaya Periode</p>
                  </div>
                  <p className="text-lg md:text-2xl font-bold mt-2">{formatIDR(total)}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {filteredExpenses.length} transaksi biaya
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Tabel desktop */}
          <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : !hasData ? (
              <EmptyState />
            ) : (
              <div className="max-h-96 overflow-y-auto scrollbar-thin">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-stone-50">
                    <TableRow className="bg-stone-50 hover:bg-stone-50">
                      <TableHead className="w-12">No.</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Nama Biaya</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead>Catatan</TableHead>
                      <TableHead className="text-right">Nominal</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenses.map((x, i) => {
                      const { nama, catatan } = splitKeterangan(x.keterangan)
                      return (
                        <TableRow key={x.id}>
                          <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatDate(x.tanggal)}</TableCell>
                          <TableCell className="font-medium">{nama || '—'}</TableCell>
                          <TableCell><CategoryBadge label={x.kategori || 'Lain-lain'} /></TableCell>
                          <TableCell className="max-w-40 truncate text-muted-foreground">{catatan || '—'}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">{formatIDR(x.jumlah)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {canEdit && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 min-h-[36px]"
                                  onClick={() => openEdit(x)}
                                  aria-label={`Edit biaya ${nama}`}
                                  title="Edit"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              {canDelete && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 min-h-[36px] text-destructive hover:text-destructive"
                                  onClick={() => setDeleteTarget(x)}
                                  aria-label={`Hapus biaya ${nama}`}
                                  title="Hapus"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Kartu mobile */}
          <div className="md:hidden space-y-3">
            {loading ? (
              [1, 2, 3].map((i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)
            ) : !hasData ? (
              <EmptyState />
            ) : (
              filteredExpenses.map((x) => {
                const { nama, catatan } = splitKeterangan(x.keterangan)
                return (
                  <Card key={x.id} className="p-0 gap-0">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium min-w-0 break-words">{nama || '—'}</p>
                        <CategoryBadge label={x.kategori || 'Lain-lain'} />
                      </div>
                      <p className="text-xs text-muted-foreground">{formatDate(x.tanggal)}</p>
                      <p className="text-lg font-bold">{formatIDR(x.jumlah)}</p>
                      {(catatan || x.supplier) && (
                        <div className="text-xs text-muted-foreground break-words border-t border-stone-100 pt-2 space-y-0.5">
                          {catatan && <p>{catatan}</p>}
                          {x.supplier && <p>Supplier: {x.supplier}</p>}
                        </div>
                      )}
                      {(canEdit || canDelete) && (
                        <div className="flex gap-2 pt-1">
                          {canEdit && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 min-h-[44px]"
                              onClick={() => openEdit(x)}
                            >
                              <Pencil className="h-4 w-4" /> Edit
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 min-h-[44px] text-destructive border-stone-200 hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => setDeleteTarget(x)}
                            >
                              <Trash2 className="h-4 w-4" /> Hapus
                            </Button>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>

          {/* Dialog tambah / edit */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{editing ? 'Edit Biaya' : 'Tambah Biaya'}</DialogTitle>
                <DialogDescription>
                  {editing
                    ? 'Perbarui catatan biaya operasional. Perubahan otomatis masuk Laporan Rugi Laba.'
                    : 'Catat biaya operasional baru. Otomatis masuk Laporan Rugi Laba pada periode terkait.'}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="exp-form-date">Tanggal</Label>
                  <Input
                    id="exp-form-date"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    aria-label="Tanggal biaya"
                    className="min-h-[44px]"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="exp-form-desc">Nama Biaya <span className="text-destructive">*</span></Label>
                  <Input
                    id="exp-form-desc"
                    value={form.nama}
                    onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
                    placeholder="Mis. Sewa ruko, gaji, listrik…"
                    autoComplete="off"
                    className="min-h-[44px]"
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <Label htmlFor="exp-form-category">Kategori</Label>
                    <Select
                      value={form.category}
                      onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                    >
                      <SelectTrigger id="exp-form-category" aria-label="Kategori biaya" className="w-full min-h-[44px]">
                        <SelectValue placeholder="Pilih kategori" />
                      </SelectTrigger>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                        {/* Data lama dengan kategori di luar daftar tetap bisa disimpan tanpa berubah */}
                        {editing && !EXPENSE_CATEGORIES.includes(editing.kategori as (typeof EXPENSE_CATEGORIES)[number]) && (
                          <SelectItem value={editing.kategori}>{editing.kategori}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="exp-form-amount">Nominal (Rp) <span className="text-destructive">*</span></Label>
                    <Input
                      id="exp-form-amount"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step="any"
                      value={form.amount}
                      onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                      placeholder="0"
                      aria-label="Nominal biaya"
                      className="min-h-[44px]"
                    />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="exp-form-notes">Catatan</Label>
                  <Textarea
                    id="exp-form-notes"
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Catatan tambahan (opsional)"
                  />
                </div>
                {/* Field kompatibilitas data lama (metodePembayaran & supplier) */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <Label htmlFor="exp-form-metode">Metode Bayar</Label>
                    <Select
                      value={form.metodePembayaran}
                      onValueChange={(v) => setForm((f) => ({ ...f, metodePembayaran: v }))}
                    >
                      <SelectTrigger id="exp-form-metode" aria-label="Metode pembayaran" className="w-full min-h-[44px]">
                        <SelectValue placeholder="Pilih metode" />
                      </SelectTrigger>
                      <SelectContent>
                        {METODE_OPTIONS.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="exp-form-supplier">Supplier</Label>
                    <Input
                      id="exp-form-supplier"
                      type="text"
                      value={form.supplier}
                      onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
                      placeholder="Nama supplier/vendor (opsional)"
                      autoComplete="off"
                      className="min-h-[44px]"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving} className="min-h-[44px]">
                  Batal
                </Button>
                <Button
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px]"
                >
                  {saving ? 'Menyimpan…' : 'Simpan'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* AlertDialog hapus */}
          <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Hapus biaya?</AlertDialogTitle>
                <AlertDialogDescription>
                  {deleteTarget ? `"${splitKeterangan(deleteTarget.keterangan).nama || 'Biaya'}" (${formatIDR(deleteTarget.jumlah)}) akan dihapus permanen.` : ''}
                  Perhitungan Laporan Rugi Laba akan diperbarui otomatis.
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
        </div>
      )}
    </DashboardLayout>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-12 px-4">
      <Wallet className="h-10 w-10 text-stone-300 mx-auto mb-2" aria-hidden="true" />
      <p className="text-sm font-medium">Belum ada biaya operasional pada periode ini.</p>
      <p className="text-xs text-muted-foreground mt-1">
        Tambahkan dengan tombol &quot;+ Tambah Biaya&quot; atau ubah filter periode / kategori.
      </p>
    </div>
  )
}
