'use client'

// ============================================================
// RiwayatPeriodFilter — filter periode untuk halaman riwayat.
// Tampilan PERSIS sama dengan filter periode halaman Laporan
// Penjualan (segmented control + input kondisional):
//   Hari ini | Minggu ini | Bulan ini | Tahun ini | Custom | Semua
// Mode "Custom" menampilkan input "Dari Tanggal" & "Sampai Tanggal".
// Juga menyediakan helper periode (teks & rentang tanggal efektif),
// kartu ringkasan, dan empty state bergaya Laporan Penjualan.
// ============================================================

import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type RiwayatPeriod = 'today' | 'week' | 'month' | 'year' | 'date' | 'all'

export const RIWAYAT_MONTH_LABELS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
] as const

const PERIOD_OPTIONS: Array<{ value: RiwayatPeriod; label: string }> = [
  { value: 'today', label: 'Hari ini' },
  { value: 'week', label: 'Minggu ini' },
  { value: 'month', label: 'Bulan ini' },
  { value: 'year', label: 'Tahun ini' },
  { value: 'date', label: 'Custom' },
  { value: 'all', label: 'Semua' },
]

/** Opsi tahun: (tahun sekarang + 1) turun ke (tahun sekarang − 5) — sama dengan Laporan Penjualan. */
export function riwayatYearOptions(): number[] {
  const nowYear = new Date().getFullYear()
  const out: number[] = []
  for (let y = nowYear + 1; y >= nowYear - 5; y--) out.push(y)
  return out

}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** ISO string / Date → yyyy-mm-dd untuk <input type="date"> (sama dengan toInputDate Laporan Penjualan). */
export function riwayatToInputDate(iso: string | Date | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Format tanggal pendek gaya Laporan Penjualan: "07 Sep 2026". */
export function formatPeriodeDate(iso: string | Date | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Teks periode untuk subjudul header (sama dengan periodText Laporan Penjualan). */
export function riwayatPeriodText(
  period: RiwayatPeriod,
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
      return formatPeriodeDate(now)
    case 'week': {
      const day = (now.getDay() + 6) % 7 // 0 = Senin
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day)
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
      return `${formatPeriodeDate(start)} – ${formatPeriodeDate(end)}`
    }
    case 'date':
      return `${formatPeriodeDate(from)} – ${formatPeriodeDate(to)}`
    case 'month':
      return `${RIWAYAT_MONTH_LABELS[m - 1] ?? ''} ${y}`
    case 'year':
      return String(y)
    default:
      return 'Semua Periode'
  }
}

/**
 * Rentang tanggal efektif (yyyy-mm-dd, inklusif) untuk memfilter list riwayat.
 * period 'all' → kedua nilai '' (tanpa batas).
 */
export function riwayatDateRange(
  period: RiwayatPeriod,
  from: string,
  to: string,
  month: number | null,
  year: number | null
): { dateFrom: string; dateTo: string } {
  const now = new Date()
  switch (period) {
    case 'today': {
      const t = riwayatToInputDate(now)
      return { dateFrom: t, dateTo: t }
    }
    case 'week': {
      const day = (now.getDay() + 6) % 7 // 0 = Senin
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day)
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
      return { dateFrom: riwayatToInputDate(start), dateTo: riwayatToInputDate(end) }
    }
    case 'month': {
      const m = month ?? now.getMonth() + 1
      const y = year ?? now.getFullYear()
      return { dateFrom: riwayatToInputDate(new Date(y, m - 1, 1)), dateTo: riwayatToInputDate(new Date(y, m, 0)) }
    }
    case 'year': {
      const y = year ?? now.getFullYear()
      return { dateFrom: `${y}-01-01`, dateTo: `${y}-12-31` }
    }
    case 'date':
      return { dateFrom: from || '', dateTo: to || '' }
    default:
      return { dateFrom: '', dateTo: '' }
  }
}

interface RiwayatPeriodFilterProps {
  period: RiwayatPeriod
  onChangePeriod: (p: RiwayatPeriod) => void
  from: string
  to: string
  onFromChange: (v: string) => void
  onToChange: (v: string) => void
  month: number | null
  onMonthChange: (v: number | null) => void
  year: number | null
  onYearChange: (v: number | null) => void
  /** Prefiks id unik per halaman (mis. "riwayat-invoice"). */
  idPrefix?: string
}

/** Segmented control mode periode + input kondisional — persis gaya filter periode Laporan Penjualan. */
export function RiwayatPeriodFilter(props: RiwayatPeriodFilterProps) {
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
    idPrefix = 'riwayat',
  } = props
  const years = riwayatYearOptions()
  const nowMonth = String(new Date().getMonth() + 1)
  const nowYear = String(new Date().getFullYear())

  return (
    <div className="space-y-3">
      {/* Segmented control mode periode */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Mode periode riwayat">
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
            <Label htmlFor={`${idPrefix}-from`}>Dari Tanggal</Label>
            <Input
              id={`${idPrefix}-from`}
              type="date"
              value={from}
              onChange={(e) => onFromChange(e.target.value)}
              aria-label="Tanggal mulai"
              className="min-h-[44px]"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${idPrefix}-to`}>Sampai Tanggal</Label>
            <Input
              id={`${idPrefix}-to`}
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
            <Label htmlFor={`${idPrefix}-month`}>Bulan</Label>
            <Select value={month != null ? String(month) : nowMonth} onValueChange={(v) => onMonthChange(Number(v))}>
              <SelectTrigger id={`${idPrefix}-month`} aria-label="Pilih bulan" className="w-full min-h-[44px]">
                <SelectValue placeholder="Pilih bulan" />
              </SelectTrigger>
              <SelectContent>
                {RIWAYAT_MONTH_LABELS.map((label, i) => (
                  <SelectItem key={label} value={String(i + 1)}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${idPrefix}-month-year`}>Tahun</Label>
            <Select value={year != null ? String(year) : nowYear} onValueChange={(v) => onYearChange(Number(v))}>
              <SelectTrigger id={`${idPrefix}-month-year`} aria-label="Pilih tahun" className="w-full min-h-[44px]">
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
          <Label htmlFor={`${idPrefix}-year`}>Tahun</Label>
          <Select value={year != null ? String(year) : nowYear} onValueChange={(v) => onYearChange(Number(v))}>
            <SelectTrigger id={`${idPrefix}-year`} aria-label="Pilih tahun" className="w-full min-h-[44px]">
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

/** Kartu ringkasan kecil bergaya kartu statistik Laporan Penjualan. */
export function RiwayatSummaryCard({
  label,
  value,
  note,
  valueClass,
}: {
  label: string
  value: string | number
  note?: string
  valueClass?: string
}) {
  return (
    <Card className="p-0 gap-0">
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn('text-lg md:text-xl font-bold mt-1', valueClass)}>{value}</p>
        {note && <p className="text-[11px] text-muted-foreground mt-1">{note}</p>}
      </CardContent>
    </Card>
  )
}

/** Empty state bergaya Laporan Penjualan (border dashed). */
export function RiwayatEmptyState({
  icon,
  title,
  desc,
}: {
  icon?: ReactNode
  title: string
  desc: string
}) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-white text-center py-12 px-4">
      {icon ? (
        <div className="text-stone-300 mb-2 flex justify-center [&_svg]:h-10 [&_svg]:w-10" aria-hidden="true">{icon}</div>
      ) : null}
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{desc}</p>
    </div>
  )
}
