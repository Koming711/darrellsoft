'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { useLanguage } from '@/contexts/language-context'
import { authFetch } from '@/lib/auth-fetch'
import { formatRupiah } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  Receipt,
  Wallet,
  TrendingUp,
  AlertTriangle,
  Search,
  Loader2,
  Printer,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  CalendarClock,
  Eye,
  AlertCircle,
} from 'lucide-react'
import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

// ===== Types (mirror the API response) =====
interface DpInvoice {
  id: string
  nomor: string
  tanggal: string
  createdAt: string
  customerName: string
  namaBarang: string
  totalHarga: number
  dpPercent: number
  dpAmount: number
  sisa: number
  lunas: boolean
  tanggalJatuhTempo: string
  tanggalPelunasan: string
  isOverdue: boolean
  caraPembayaran: string
}

interface DpSummary {
  totalInvoiceDP: number
  totalNilai: number
  totalDPMasuk: number
  totalSisaPiutang: number
  totalLunas: number
  totalBelumLunas: number
  totalOverdue: number
}

interface DpResponse {
  success: true
  periode: { startDate: string | null; endDate: string | null }
  status: string
  invoices: DpInvoice[]
  summary: DpSummary
}

// ===== Date filter helpers (same scheme as rekap-penjualan) =====
type FilterType = 'all' | 'today' | 'week' | 'month' | 'custom'

function getFilterDates(
  filter: FilterType,
  customStart?: Date,
  customEnd?: Date
): { startDate: string; endDate: string } {
  const today = new Date()
  const fmt = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  switch (filter) {
    case 'all':
      return { startDate: '2000-01-01', endDate: '2099-12-31' }
    case 'today':
      return { startDate: fmt(today), endDate: fmt(today) }
    case 'week': {
      const s = new Date(today)
      const day = s.getDay()
      s.setDate(s.getDate() + (day === 0 ? -6 : 1 - day))
      return { startDate: fmt(s), endDate: fmt(today) }
    }
    case 'month': {
      const s = new Date(today.getFullYear(), today.getMonth(), 1)
      return { startDate: fmt(s), endDate: fmt(today) }
    }
    case 'custom':
      return {
        startDate: customStart ? fmt(customStart) : fmt(today),
        endDate: customEnd ? fmt(customEnd) : fmt(today),
      }
  }
}

function formatDateShort(iso: string): string {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function formatDateShortId(dateStr: string): string {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function formatRupiahShort(n: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(n)
}

type StatusFilter = 'all' | 'belum_lunas' | 'lunas' | 'jatuh_tempo'
type SortKey = 'terbaru' | 'jatuh_tempo' | 'sisa_desc' | 'dp_desc' | 'nama_asc'

export default function LaporanInvoiceDpPage() {
  const { t } = useLanguage()

  const [data, setData] = useState<DpResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Date filter
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined)
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined)
  const [showCustomDialog, setShowCustomDialog] = useState(false)
  const [customStartStr, setCustomStartStr] = useState('')
  const [customEndStr, setCustomEndStr] = useState('')

  // Status + search + sort
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('terbaru')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { startDate, endDate } = getFilterDates(
        filterType,
        customStartDate,
        customEndDate
      )
      const res = await authFetch(
        `/api/laporan-invoice-dp?startDate=${startDate}&endDate=${endDate}&status=${statusFilter}`
      )
      if (res.ok) {
        const json = (await res.json()) as DpResponse
        setData(json)
      } else {
        setError('Gagal memuat data laporan invoice DP')
      }
    } catch (err) {
      console.error('[LaporanInvoiceDP] fetchData error:', err)
      setError('Gagal memuat data laporan invoice DP')
    } finally {
      setLoading(false)
    }
  }, [filterType, customStartDate, customEndDate, statusFilter])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleFilterChange = (type: FilterType) => {
    if (type === 'custom') {
      setShowCustomDialog(true)
    } else {
      setFilterType(type)
    }
  }

  const applyCustomFilter = () => {
    if (customStartStr && customEndStr) {
      setCustomStartDate(new Date(customStartStr))
      setCustomEndDate(new Date(customEndStr))
      setFilterType('custom')
      setShowCustomDialog(false)
    }
  }

  // Apply search + sort on the invoice list
  const processedInvoices = useMemo<DpInvoice[]>(() => {
    if (!data) return []
    const term = searchTerm.trim().toLowerCase()
    let list = data.invoices
    if (term) {
      list = list.filter(
        (i) =>
          i.customerName.toLowerCase().includes(term) ||
          i.nomor.toLowerCase().includes(term)
      )
    }
    const sorted = [...list]
    switch (sortKey) {
      case 'terbaru':
        sorted.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        break
      case 'jatuh_tempo':
        // overdue first, then nearest due date, then no due date
        sorted.sort((a, b) => {
          if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1
          if (!a.tanggalJatuhTempo) return 1
          if (!b.tanggalJatuhTempo) return -1
          return (
            new Date(a.tanggalJatuhTempo).getTime() -
            new Date(b.tanggalJatuhTempo).getTime()
          )
        })
        break
      case 'sisa_desc':
        sorted.sort((a, b) => b.sisa - a.sisa)
        break
      case 'dp_desc':
        sorted.sort((a, b) => b.dpAmount - a.dpAmount)
        break
      case 'nama_asc':
        sorted.sort((a, b) => a.customerName.localeCompare(b.customerName, 'id'))
        break
    }
    return sorted
  }, [data, searchTerm, sortKey])

  const summary = data?.summary

  const filterButtons: { type: FilterType; label: string }[] = [
    { type: 'all', label: t('semua') },
    { type: 'today', label: t('today') },
    { type: 'week', label: t('this_week') },
    { type: 'month', label: t('this_month') },
    { type: 'custom', label: t('custom') },
  ]

  const statusButtons: { type: StatusFilter; label: string }[] = [
    { type: 'all', label: t('laporan_dp_status_all') },
    { type: 'belum_lunas', label: t('laporan_dp_status_belum_lunas') },
    { type: 'lunas', label: t('laporan_dp_status_lunas') },
    { type: 'jatuh_tempo', label: t('laporan_dp_status_jatuh_tempo') },
  ]

  // ===== Export to Excel (CSV, opens in Excel) =====
  const handleExportExcel = () => {
    if (!data || processedInvoices.length === 0) return
    const rows: string[][] = []
    rows.push([
      'No',
      'No. Invoice',
      'Tanggal',
      'Customer',
      'Total Invoice',
      'DP (%)',
      'Nilai DP',
      'Sisa Piutang',
      'Status',
      'Jatuh Tempo',
      'Tanggal Pelunasan',
      'Cara Pembayaran',
    ])
    processedInvoices.forEach((inv, i) => {
      const statusLabel = inv.lunas
        ? 'Lunas'
        : inv.isOverdue
          ? 'Jatuh Tempo'
          : 'Belum Lunas'
      rows.push([
        String(i + 1),
        inv.nomor,
        inv.tanggal || formatDateShort(inv.createdAt),
        inv.customerName,
        String(Math.round(inv.totalHarga)),
        String(inv.dpPercent) + '%',
        String(Math.round(inv.dpAmount)),
        String(Math.round(inv.sisa)),
        statusLabel,
        inv.tanggalJatuhTempo || '-',
        inv.tanggalPelunasan || '-',
        inv.caraPembayaran || '-',
      ])
    })
    // Summary row
    if (summary) {
      rows.push([])
      rows.push([
        '',
        'TOTAL',
        '',
        '',
        String(Math.round(summary.totalNilai)),
        '',
        String(Math.round(summary.totalDPMasuk)),
        String(Math.round(summary.totalSisaPiutang)),
        `${summary.totalLunas} Lunas / ${summary.totalBelumLunas} Belum`,
        '',
        '',
        '',
      ])
    }
    // Convert to CSV (Excel-friendly: semicolon separator for ID locale)
    const csv = rows
      .map((r) =>
        r.map((cell) => `"${(cell || '').replace(/"/g, '""')}"`).join(';')
      )
      .join('\r\n')
    // Prepend BOM so Excel detects UTF-8
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const todayStr = new Date().toISOString().slice(0, 10)
    a.download = `Laporan_Invoice_DP_${todayStr}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ===== Print =====
  const handlePrint = () => {
    window.print()
  }

  return (
    <DashboardLayout
      title={t('laporan_invoice_dp')}
      subtitle={t('subtitle_laporan_invoice_dp')}
    >
      <div className="space-y-4 sm:space-y-6 pb-6">
        {/* ===== Summary Cards ===== */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:hidden">
          {/* Total Invoice DP */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-3 sm:p-4">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400 flex items-center justify-center mb-2">
              <Receipt className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              {t('laporan_dp_total_invoice')}
            </p>
            {loading ? (
              <div className="h-6 w-16 bg-slate-200 dark:bg-zinc-700 rounded animate-pulse" />
            ) : (
              <p className="text-base sm:text-lg font-bold text-blue-700 dark:text-blue-400 leading-tight">
                {summary?.totalInvoiceDP ?? 0}
              </p>
            )}
          </div>

          {/* Total DP Masuk */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-3 sm:p-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 flex items-center justify-center mb-2">
              <TrendingUp className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              {t('laporan_dp_total_dp')}
            </p>
            {loading ? (
              <div className="h-6 w-24 bg-slate-200 dark:bg-zinc-700 rounded animate-pulse" />
            ) : (
              <p className="text-base sm:text-lg font-bold text-emerald-700 dark:text-emerald-400 leading-tight">
                {formatRupiahShort(summary?.totalDPMasuk ?? 0)}
              </p>
            )}
          </div>

          {/* Sisa Piutang */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-3 sm:p-4">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400 flex items-center justify-center mb-2">
              <Wallet className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              {t('laporan_dp_total_sisa')}
            </p>
            {loading ? (
              <div className="h-6 w-24 bg-slate-200 dark:bg-zinc-700 rounded animate-pulse" />
            ) : (
              <p className="text-base sm:text-lg font-bold text-amber-700 dark:text-amber-400 leading-tight">
                {formatRupiahShort(summary?.totalSisaPiutang ?? 0)}
              </p>
            )}
          </div>

          {/* Belum Lunas / Overdue */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-3 sm:p-4">
            <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400 flex items-center justify-center mb-2">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              {t('laporan_dp_belum_lunas')}
            </p>
            {loading ? (
              <div className="h-6 w-16 bg-slate-200 dark:bg-zinc-700 rounded animate-pulse" />
            ) : (
              <p className="text-base sm:text-lg font-bold text-rose-700 dark:text-rose-400 leading-tight">
                {summary?.totalBelumLunas ?? 0}
                {summary && summary.totalOverdue > 0 && (
                  <span className="text-xs font-medium text-rose-500 dark:text-rose-500 ml-1">
                    ({summary.totalOverdue} {t('laporan_dp_overdue_short')})
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* ===== Filter + Search + Sort + Actions ===== */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-slate-200 dark:border-zinc-700 p-4 print:hidden">
          <div className="flex flex-col gap-3">
            {/* Date filter row */}
            <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex-shrink-0">
                {t('laporan_periode')}:
              </span>
              {filterButtons.map((f) => (
                <button
                  key={f.type}
                  onClick={() => handleFilterChange(f.type)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border',
                    filterType === f.type
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Status filter row */}
            <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex-shrink-0">
                {t('laporan_dp_status_label')}:
              </span>
              {statusButtons.map((s) => (
                <button
                  key={s.type}
                  onClick={() => setStatusFilter(s.type)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border',
                    statusFilter === s.type
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Search + sort + actions */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder={t('laporan_dp_cari')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="h-9 px-3 border border-slate-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label={t('rekap_urutkan')}
                >
                  <option value="terbaru">{t('laporan_dp_sort_terbaru')}</option>
                  <option value="jatuh_tempo">
                    {t('laporan_dp_sort_jatuh_tempo')}
                  </option>
                  <option value="sisa_desc">
                    {t('laporan_dp_sort_sisa_desc')}
                  </option>
                  <option value="dp_desc">{t('laporan_dp_sort_dp_desc')}</option>
                  <option value="nama_asc">
                    {t('laporan_dp_sort_nama_asc')}
                  </option>
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportExcel}
                  className="h-9"
                  disabled={!data || processedInvoices.length === 0}
                >
                  <FileSpreadsheet className="w-4 h-4 mr-1.5" />
                  <span className="hidden sm:inline">
                    {t('rekap_export_excel')}
                  </span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrint}
                  className="h-9"
                  disabled={!data || processedInvoices.length === 0}
                >
                  <Printer className="w-4 h-4 mr-1.5" />
                  <span className="hidden sm:inline">{t('rekap_cetak')}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ===== Error ===== */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900 print:hidden">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* ===== Print Header (only visible when printing) ===== */}
        <div className="hidden print:block">
          <h1 className="text-lg font-bold">{t('laporan_invoice_dp')}</h1>
          <p className="text-xs text-slate-500">
            {summary?.totalInvoiceDP ?? 0} invoice · {t('laporan_dp_total_dp')}:{' '}
            {formatRupiah(summary?.totalDPMasuk ?? 0)} ·{' '}
            {t('laporan_dp_total_sisa')}:{' '}
            {formatRupiah(summary?.totalSisaPiutang ?? 0)}
          </p>
        </div>

        {/* ===== Invoice Table ===== */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-slate-200 dark:border-zinc-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : !processedInvoices.length ? (
            <div className="py-16 text-center text-sm text-slate-400">
              {t('laporan_dp_no_data')}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-zinc-800/50 text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-3 text-left font-medium w-10">No</th>
                      <th className="px-3 py-3 text-left font-medium">
                        {t('laporan_dp_col_invoice')}
                      </th>
                      <th className="px-3 py-3 text-left font-medium">
                        {t('laporan_dp_col_customer')}
                      </th>
                      <th className="px-3 py-3 text-left font-medium">
                        {t('laporan_dp_col_tanggal')}
                      </th>
                      <th className="px-3 py-3 text-right font-medium">
                        {t('laporan_dp_col_total')}
                      </th>
                      <th className="px-3 py-3 text-center font-medium">
                        {t('laporan_dp_col_dp_percent')}
                      </th>
                      <th className="px-3 py-3 text-right font-medium">
                        {t('laporan_dp_col_dp_amount')}
                      </th>
                      <th className="px-3 py-3 text-right font-medium">
                        {t('laporan_dp_col_sisa')}
                      </th>
                      <th className="px-3 py-3 text-left font-medium">
                        {t('laporan_dp_col_jatuh_tempo')}
                      </th>
                      <th className="px-3 py-3 text-center font-medium">
                        {t('laporan_dp_col_status')}
                      </th>
                      <th className="px-3 py-3 text-center font-medium w-12 print:hidden">
                        {t('laporan_dp_col_aksi')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {processedInvoices.map((inv, i) => (
                      <tr
                        key={inv.id}
                        className="hover:bg-slate-50 dark:hover:bg-zinc-800/40"
                      >
                        <td className="px-3 py-2.5 text-slate-400 text-xs">
                          {i + 1}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-slate-700 dark:text-slate-200">
                          {inv.nomor}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200">
                          <div className="font-medium truncate max-w-[180px]">
                            {inv.customerName}
                          </div>
                          {inv.namaBarang && (
                            <div className="text-xs text-slate-400 truncate max-w-[180px]">
                              {inv.namaBarang}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
                          {inv.tanggal
                            ? formatDateShortId(inv.tanggal)
                            : formatDateShort(inv.createdAt)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-700 dark:text-slate-200 whitespace-nowrap">
                          {formatRupiah(inv.totalHarga)}
                        </td>
                        <td className="px-3 py-2.5 text-center text-slate-600 dark:text-slate-300">
                          {inv.dpPercent}%
                        </td>
                        <td className="px-3 py-2.5 text-right text-emerald-600 dark:text-emerald-400 font-medium whitespace-nowrap">
                          {formatRupiah(inv.dpAmount)}
                        </td>
                        <td
                          className={cn(
                            'px-3 py-2.5 text-right font-medium whitespace-nowrap',
                            inv.lunas
                              ? 'text-slate-400 line-through'
                              : 'text-amber-600 dark:text-amber-400'
                          )}
                        >
                          {formatRupiah(inv.sisa)}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {inv.tanggalJatuhTempo
                            ? formatDateShortId(inv.tanggalJatuhTempo)
                            : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <StatusBadge
                            lunas={inv.lunas}
                            isOverdue={inv.isOverdue}
                            t={t}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-center print:hidden">
                          <Link
                            href="/riwayat-penjualan"
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                            title={t('laporan_dp_lihat')}
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 dark:bg-zinc-800/50 font-semibold">
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-3 text-right text-slate-600 dark:text-slate-300"
                      >
                        {t('rekap_grand_total')}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-800 dark:text-slate-100 whitespace-nowrap">
                        {formatRupiah(
                          processedInvoices.reduce((s, i) => s + i.totalHarga, 0)
                        )}
                      </td>
                      <td className="px-3 py-3" />
                      <td className="px-3 py-3 text-right text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                        {formatRupiah(
                          processedInvoices.reduce((s, i) => s + i.dpAmount, 0)
                        )}
                      </td>
                      <td className="px-3 py-3 text-right text-amber-700 dark:text-amber-400 whitespace-nowrap">
                        {formatRupiah(
                          processedInvoices.reduce((s, i) => s + i.sisa, 0)
                        )}
                      </td>
                      <td colSpan={3} className="px-3 py-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="lg:hidden divide-y divide-slate-100 dark:divide-zinc-800 max-h-[70vh] overflow-y-auto">
                {processedInvoices.map((inv, i) => (
                  <div key={inv.id} className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {inv.nomor}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {inv.customerName}
                        </p>
                      </div>
                      <StatusBadge
                        lunas={inv.lunas}
                        isOverdue={inv.isOverdue}
                        t={t}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-slate-400">
                          {t('laporan_dp_col_tanggal')}
                        </p>
                        <p className="text-slate-700 dark:text-slate-200">
                          {inv.tanggal
                            ? formatDateShortId(inv.tanggal)
                            : formatDateShort(inv.createdAt)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400">
                          {t('laporan_dp_col_jatuh_tempo')}
                        </p>
                        <p className="text-slate-700 dark:text-slate-200">
                          {inv.tanggalJatuhTempo
                            ? formatDateShortId(inv.tanggalJatuhTempo)
                            : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400">
                          {t('laporan_dp_col_total')}
                        </p>
                        <p className="text-slate-700 dark:text-slate-200 font-medium">
                          {formatRupiah(inv.totalHarga)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400">
                          {t('laporan_dp_col_dp_percent')}
                        </p>
                        <p className="text-slate-700 dark:text-slate-200 font-medium">
                          {inv.dpPercent}% · {formatRupiah(inv.dpAmount)}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-slate-400">
                          {t('laporan_dp_col_sisa')}
                        </p>
                        <p
                          className={cn(
                            'font-bold',
                            inv.lunas
                              ? 'text-slate-400 line-through'
                              : 'text-amber-600 dark:text-amber-400'
                          )}
                        >
                          {formatRupiah(inv.sisa)}
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-end pt-1">
                      <Link
                        href="/riwayat-penjualan"
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {t('laporan_dp_lihat')}
                      </Link>
                    </div>
                    <p className="text-[10px] text-slate-300">#{i + 1}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ===== Custom Date Dialog ===== */}
      {showCustomDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-md p-5 space-y-4">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">
              {t('laporan_dp_custom_periode')}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400">
                  {t('laporan_dp_dari')}
                </label>
                <input
                  type="date"
                  value={customStartStr}
                  onChange={(e) => setCustomStartStr(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400">
                  {t('laporan_dp_sampai')}
                </label>
                <input
                  type="date"
                  value={customEndStr}
                  onChange={(e) => setCustomEndStr(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCustomDialog(false)}
              >
                {t('batal')}
              </Button>
              <Button size="sm" onClick={applyCustomFilter}>
                {t('terapkan')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

// ===== Status Badge component =====
function StatusBadge({
  lunas,
  isOverdue,
  t,
}: {
  lunas: boolean
  isOverdue: boolean
  t: (key: string) => string
}) {
  if (lunas) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 whitespace-nowrap">
        <CheckCircle2 className="w-3 h-3" />
        {t('laporan_dp_badge_lunas')}
      </span>
    )
  }
  if (isOverdue) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400 whitespace-nowrap">
        <CalendarClock className="w-3 h-3" />
        {t('laporan_dp_badge_overdue')}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 whitespace-nowrap">
      <Clock className="w-3 h-3" />
      {t('laporan_dp_badge_belum')}
    </span>
  )
}
