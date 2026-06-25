'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { useLanguage } from '@/contexts/language-context'
import { authFetch } from '@/lib/auth-fetch'
import { Button } from '@/components/ui/button'
import {
  Users,
  Receipt,
  TrendingUp,
  Wallet,
  ChevronDown,
  ChevronRight,
  Search,
  Loader2,
  Printer,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
} from 'lucide-react'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { formatRupiah } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ===== Types (mirror the API response) =====
interface RecapInvoice {
  id: string
  nomor: string
  tanggal: string
  createdAt: string
  totalHarga: number
  dp: number
  sisa: number
  lunas: boolean
  tanggalJatuhTempo: string
  tanggalPelunasan: string
  namaBarang: string
}

interface RecapCustomer {
  customerName: string
  totalInvoices: number
  totalNilai: number
  totalDP: number
  totalSisa: number
  totalLunas: number
  totalBelumLunas: number
  lastTransactionAt: string
  lastTransactionTanggal: string
  invoices: RecapInvoice[]
}

interface RecapGrandTotal {
  totalCustomers: number
  totalInvoices: number
  totalNilai: number
  totalDP: number
  totalSisa: number
  totalLunas: number
  totalBelumLunas: number
}

interface RecapResponse {
  success: true
  periode: { startDate: string | null; endDate: string | null }
  customers: RecapCustomer[]
  grandTotal: RecapGrandTotal
}

// ===== Date filter helpers (same scheme as riwayat-penjualan) =====
type FilterType = 'today' | 'week' | 'month' | 'custom'

function getFilterDates(filter: FilterType, customStart?: Date, customEnd?: Date): { startDate: string; endDate: string } {
  const today = new Date()
  const fmt = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  switch (filter) {
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
    case 'custom': {
      return {
        startDate: customStart ? fmt(customStart) : fmt(today),
        endDate: customEnd ? fmt(customEnd) : fmt(today),
      }
    }
  }
}

function formatDateShort(iso: string): string {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

function formatRupiahShort(n: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(n)
}

type SortKey = 'nilai_desc' | 'jumlah_desc' | 'nama_asc' | 'terbaru'

export default function RekapPenjualanPage() {
  const { t } = useLanguage()

  const [data, setData] = useState<RecapResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Date filter
  const [filterType, setFilterType] = useState<FilterType>('month')
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined)
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined)
  const [showCustomDialog, setShowCustomDialog] = useState(false)
  const [customStartStr, setCustomStartStr] = useState('')
  const [customEndStr, setCustomEndStr] = useState('')

  // UI state
  const [searchTerm, setSearchTerm] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('nilai_desc')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { startDate, endDate } = getFilterDates(filterType, customStartDate, customEndDate)
      const res = await authFetch(`/api/rekap-penjualan?startDate=${startDate}&endDate=${endDate}`)
      if (res.ok) {
        const json = (await res.json()) as RecapResponse
        setData(json)
      } else {
        setError('Gagal memuat data rekap')
      }
    } catch (err) {
      console.error('[RekapPenjualan] fetchData error:', err)
      setError('Gagal memuat data rekap')
    } finally {
      setLoading(false)
    }
  }, [filterType, customStartDate, customEndDate])

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

  const toggleExpand = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  // Apply search + sort on the customer list
  const processedCustomers = useMemo<RecapCustomer[]>(() => {
    if (!data) return []
    const term = searchTerm.trim().toLowerCase()
    let list = data.customers
    if (term) {
      list = list.filter((c) => c.customerName.toLowerCase().includes(term))
    }
    const sorted = [...list]
    switch (sortKey) {
      case 'nilai_desc':
        sorted.sort((a, b) => b.totalNilai - a.totalNilai)
        break
      case 'jumlah_desc':
        sorted.sort((a, b) => b.totalInvoices - a.totalInvoices)
        break
      case 'nama_asc':
        sorted.sort((a, b) => a.customerName.localeCompare(b.customerName, 'id'))
        break
      case 'terbaru':
        sorted.sort((a, b) => new Date(b.lastTransactionAt).getTime() - new Date(a.lastTransactionAt).getTime())
        break
    }
    return sorted
  }, [data, searchTerm, sortKey])

  const grandTotal = data?.grandTotal

  const filterButtons: { type: FilterType; label: string }[] = [
    { type: 'today', label: t('today') },
    { type: 'week', label: t('this_week') },
    { type: 'month', label: t('this_month') },
    { type: 'custom', label: t('custom') },
  ]

  // ===== Export to Excel (CSV, opens in Excel) =====
  const handleExportExcel = () => {
    if (!data || data.customers.length === 0) return
    const rows: string[][] = []
    // Header
    rows.push([
      'No',
      'Nama Customer',
      'Jumlah Transaksi',
      'Nilai Penjualan',
      'Total DP',
      'Sisa Piutang',
      'Lunas',
      'Belum Lunas',
      'Transaksi Terakhir',
    ])
    data.customers.forEach((c, i) => {
      rows.push([
        String(i + 1),
        c.customerName,
        String(c.totalInvoices),
        String(Math.round(c.totalNilai)),
        String(Math.round(c.totalDP)),
        String(Math.round(c.totalSisa)),
        String(c.totalLunas),
        String(c.totalBelumLunas),
        c.lastTransactionTanggal || formatDateShort(c.lastTransactionAt),
      ])
    })
    // Grand total row
    if (grandTotal) {
      rows.push([])
      rows.push([
        '',
        'TOTAL',
        String(grandTotal.totalInvoices),
        String(Math.round(grandTotal.totalNilai)),
        String(Math.round(grandTotal.totalDP)),
        String(Math.round(grandTotal.totalSisa)),
        String(grandTotal.totalLunas),
        String(grandTotal.totalBelumLunas),
        '',
      ])
    }
    // Convert to CSV (Excel-friendly: semicolon separator for ID locale)
    const csv = rows
      .map((r) => r.map((cell) => `"${(cell || '').replace(/"/g, '""')}"`).join(';'))
      .join('\r\n')
    // Prepend BOM so Excel detects UTF-8
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const todayStr = new Date().toISOString().slice(0, 10)
    a.download = `Rekap_Penjualan_Per_Customer_${todayStr}.csv`
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
    <DashboardLayout title={t('rekap_penjualan')} subtitle={t('subtitle_rekap_penjualan')}>
      <div className="space-y-4 sm:space-y-6 pb-6">
        {/* ===== Summary Cards ===== */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-3 sm:p-4">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mb-2">
              <Users className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-500 mb-0.5">{t('rekap_total_customer')}</p>
            <p className="text-base sm:text-lg font-bold text-blue-700 leading-tight">
              {grandTotal?.totalCustomers ?? 0}
            </p>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-3 sm:p-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2">
              <Receipt className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-500 mb-0.5">{t('rekap_total_transaksi')}</p>
            <p className="text-base sm:text-lg font-bold text-emerald-700 leading-tight">
              {grandTotal?.totalInvoices ?? 0}
            </p>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-3 sm:p-4">
            <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center mb-2">
              <TrendingUp className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-500 mb-0.5">{t('rekap_total_nilai')}</p>
            <p className="text-base sm:text-lg font-bold text-violet-700 leading-tight">
              {formatRupiahShort(grandTotal?.totalNilai ?? 0)}
            </p>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-3 sm:p-4">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center mb-2">
              <Wallet className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-500 mb-0.5">{t('rekap_total_sisa')}</p>
            <p className="text-base sm:text-lg font-bold text-amber-700 leading-tight">
              {formatRupiahShort(grandTotal?.totalSisa ?? 0)}
            </p>
          </div>
        </div>

        {/* ===== Filter + Search + Sort + Actions ===== */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-slate-200 dark:border-zinc-700 p-4 print:hidden">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              {/* Search */}
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder={t('rekap_cari_customer')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {/* Sort */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-xs text-slate-500 whitespace-nowrap">{t('rekap_urutkan')}:</span>
                <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                  <SelectTrigger className="h-9 w-full sm:w-56 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nilai_desc">{t('rekap_sort_nilai_desc')}</SelectItem>
                    <SelectItem value="jumlah_desc">{t('rekap_sort_jumlah_desc')}</SelectItem>
                    <SelectItem value="nama_asc">{t('rekap_sort_nama_asc')}</SelectItem>
                    <SelectItem value="terbaru">{t('rekap_sort_terbaru')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              {/* Date filter buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                {filterButtons.map((btn) => (
                  <Button
                    key={btn.type}
                    variant="outline"
                    size="sm"
                    onClick={() => handleFilterChange(btn.type)}
                    className={cn(
                      'h-8 px-3 text-xs font-medium rounded-lg transition-all',
                      filterType === btn.type
                        ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 hover:text-white shadow-sm'
                        : 'bg-white dark:bg-[#1a1a1a] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-[#222] hover:text-slate-800 dark:hover:text-slate-200'
                    )}
                  >
                    {btn.label}
                  </Button>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportExcel}
                  disabled={!data || data.customers.length === 0}
                  className="h-8 px-3 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-1.5" />
                  {t('rekap_export_excel')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrint}
                  disabled={!data || data.customers.length === 0}
                  className="h-8 px-3 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800"
                >
                  <Printer className="w-4 h-4 mr-1.5" />
                  {t('rekap_cetak')}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ===== Error ===== */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* ===== Loading ===== */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 bg-slate-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !data || processedCustomers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-12 text-center">
            <Users className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-3 text-sm text-slate-400 font-medium">{t('rekap_tidak_ada_customer')}</p>
            <p className="text-xs text-slate-300 mt-1">{t('rekap_tidak_ada_invoice')}</p>
          </div>
        ) : (
          <>
            {/* ===== Desktop Table ===== */}
            <div className="hidden sm:block bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-slate-200 dark:border-zinc-700 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                    <th className="text-left py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap w-10"></th>
                    <th className="text-left py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Customer</th>
                    <th className="text-center py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">{t('rekap_jumlah_transaksi')}</th>
                    <th className="text-center py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">{t('rekap_lunas')}</th>
                    <th className="text-right py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">{t('rekap_total_dp')}</th>
                    <th className="text-right py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">{t('rekap_nilai_penjualan')}</th>
                    <th className="text-right py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">{t('rekap_sisa_piutang')}</th>
                    <th className="text-left py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">{t('rekap_transaksi_terakhir')}</th>
                  </tr>
                </thead>
                <tbody>
                  {processedCustomers.map((c, idx) => {
                    const isOpen = expanded.has(c.customerName)
                    return (
                      <CustomerRowDesktop
                        key={c.customerName}
                        customer={c}
                        isOpen={isOpen}
                        onToggle={() => toggleExpand(c.customerName)}
                        zebra={idx % 2 === 1}
                      />
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 dark:border-zinc-600 bg-slate-50 dark:bg-zinc-800 font-bold">
                    <td colSpan={2} className="py-3 px-3 text-right text-slate-700 dark:text-zinc-200 uppercase text-xs tracking-wide">
                      {t('rekap_grand_total')}
                    </td>
                    <td className="py-3 px-3 text-center text-slate-700 dark:text-zinc-200">{grandTotal?.totalInvoices ?? 0}</td>
                    <td className="py-3 px-3 text-center text-emerald-700 dark:text-emerald-400">{grandTotal?.totalLunas ?? 0}</td>
                    <td className="py-3 px-3 text-right text-violet-700 dark:text-violet-400">{formatRupiahShort(grandTotal?.totalDP ?? 0)}</td>
                    <td className="py-3 px-3 text-right text-violet-700 dark:text-violet-400">{formatRupiahShort(grandTotal?.totalNilai ?? 0)}</td>
                    <td className="py-3 px-3 text-right text-amber-700 dark:text-amber-400">{formatRupiahShort(grandTotal?.totalSisa ?? 0)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* ===== Mobile Cards ===== */}
            <div className="sm:hidden space-y-3">
              {processedCustomers.map((c) => {
                const isOpen = expanded.has(c.customerName)
                return (
                  <CustomerCardMobile
                    key={c.customerName}
                    customer={c}
                    isOpen={isOpen}
                    onToggle={() => toggleExpand(c.customerName)}
                  />
                )
              })}
              {/* Mobile grand total */}
              <div className="rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  {t('rekap_grand_total')}
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">{t('rekap_jumlah_transaksi')}</p>
                    <p className="font-bold text-slate-700 dark:text-zinc-200">{grandTotal?.totalInvoices ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">{t('rekap_lunas')}</p>
                    <p className="font-bold text-emerald-700 dark:text-emerald-400">{grandTotal?.totalLunas ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">{t('rekap_nilai_penjualan')}</p>
                    <p className="font-bold text-violet-700 dark:text-violet-400">{formatRupiahShort(grandTotal?.totalNilai ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">{t('rekap_sisa_piutang')}</p>
                    <p className="font-bold text-amber-700 dark:text-amber-400">{formatRupiahShort(grandTotal?.totalSisa ?? 0)}</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ===== Custom date dialog ===== */}
      {showCustomDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-slate-200 dark:border-zinc-700 w-full max-w-md p-5">
            <h3 className="text-base font-bold text-slate-800 dark:text-zinc-100 mb-1">
              {t('pilih_rentang_tanggal')}
            </h3>
            <p className="text-xs text-slate-500 mb-4">{t('tentukan_periode')}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-300 mb-1">
                  {t('tanggal_mulai')}
                </label>
                <input
                  type="date"
                  value={customStartStr}
                  onChange={(e) => setCustomStartStr(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-300 mb-1">
                  {t('tanggal_akhir')}
                </label>
                <input
                  type="date"
                  value={customEndStr}
                  onChange={(e) => setCustomEndStr(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCustomDialog(false)}
                className="h-9 px-4 text-sm"
              >
                Batal
              </Button>
              <Button
                size="sm"
                onClick={applyCustomFilter}
                className="h-9 px-4 text-sm bg-blue-600 hover:bg-blue-700 text-white"
              >
                {t('terapkan')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

// ===== Desktop customer row (with expandable invoice sub-table) =====
function CustomerRowDesktop({
  customer,
  isOpen,
  onToggle,
  zebra,
}: {
  customer: RecapCustomer
  isOpen: boolean
  onToggle: () => void
  zebra: boolean
}) {
  const { t } = useLanguage()
  return (
    <>
      <tr
        onClick={onToggle}
        className={cn(
          'border-b border-slate-100 dark:border-zinc-800 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors cursor-pointer',
          zebra && 'bg-slate-50/50 dark:bg-zinc-800/30'
        )}
      >
        <td className="py-2.5 px-3 text-center">
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-slate-400 inline" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400 inline" />
          )}
        </td>
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 flex items-center justify-center text-xs font-bold flex-shrink-0">
              {customer.customerName.charAt(0).toUpperCase()}
            </div>
            <span className="font-semibold text-slate-800 dark:text-zinc-100 truncate max-w-[200px]">
              {customer.customerName}
            </span>
          </div>
        </td>
        <td className="py-2.5 px-3 text-center text-slate-700 dark:text-zinc-200 font-medium">
          {customer.totalInvoices}
        </td>
        <td className="py-2.5 px-3 text-center">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
            <CheckCircle2 className="w-3 h-3" />
            {customer.totalLunas}
          </span>
        </td>
        <td className="py-2.5 px-3 text-right whitespace-nowrap text-violet-700 dark:text-violet-400 font-medium">
          {customer.totalDP > 0 ? formatRupiahShort(customer.totalDP) : '-'}
        </td>
        <td className="py-2.5 px-3 text-right whitespace-nowrap text-violet-700 dark:text-violet-400 font-bold">
          {formatRupiahShort(customer.totalNilai)}
        </td>
        <td className="py-2.5 px-3 text-right whitespace-nowrap">
          {customer.totalSisa > 0 ? (
            <span className="text-amber-700 dark:text-amber-400 font-medium">{formatRupiahShort(customer.totalSisa)}</span>
          ) : (
            <span className="text-slate-400">-</span>
          )}
        </td>
        <td className="py-2.5 px-3 text-slate-500 text-xs whitespace-nowrap">
          {customer.lastTransactionTanggal
            ? formatDateShort(customer.lastTransactionTanggal)
            : formatDateShort(customer.lastTransactionAt)}
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-slate-50/80 dark:bg-zinc-800/40">
          <td></td>
          <td colSpan={7} className="py-3 px-3">
            <div className="rounded-lg border border-slate-200 dark:border-zinc-700 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">
                    <th className="text-left py-2 px-3 font-semibold">{t('rekap_no_invoice')}</th>
                    <th className="text-left py-2 px-3 font-semibold">{t('rekap_tanggal')}</th>
                    <th className="text-left py-2 px-3 font-semibold max-w-[200px] truncate">{t('nama_barang')}</th>
                    <th className="text-right py-2 px-3 font-semibold">{t('rekap_total_dp')}</th>
                    <th className="text-right py-2 px-3 font-semibold">{t('rekap_nilai')}</th>
                    <th className="text-center py-2 px-3 font-semibold">{t('rekap_status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.invoices.map((inv) => (
                    <tr key={inv.id} className="border-t border-slate-100 dark:border-zinc-800">
                      <td className="py-2 px-3 font-medium text-slate-700 dark:text-zinc-200 whitespace-nowrap">
                        <Receipt className="w-3 h-3 text-blue-600 inline mr-1.5" />
                        {inv.nomor || '-'}
                      </td>
                      <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                        {inv.tanggal ? formatDateShort(inv.tanggal) : '-'}
                      </td>
                      <td className="py-2 px-3 text-slate-600 dark:text-zinc-300 max-w-[200px] truncate">
                        {inv.namaBarang ? inv.namaBarang.split('\n')[0] : '-'}
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap text-violet-700 dark:text-violet-400">
                        {inv.dp > 0 ? formatRupiahShort(inv.dp) : '-'}
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap font-medium text-slate-700 dark:text-zinc-200">
                        {formatRupiahShort(inv.totalHarga)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {inv.lunas ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-[10px] font-medium">
                            <CheckCircle2 className="w-3 h-3" />
                            {t('rekap_lunas')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-[10px] font-medium">
                            <Clock className="w-3 h-3" />
                            {t('rekap_belum_lunas')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ===== Mobile customer card (with expandable invoice list) =====
function CustomerCardMobile({
  customer,
  isOpen,
  onToggle,
}: {
  customer: RecapCustomer
  isOpen: boolean
  onToggle: () => void
}) {
  const { t } = useLanguage()
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-slate-200 dark:border-zinc-700 overflow-hidden">
      {/* Customer header (tap to expand) */}
      <button
        onClick={onToggle}
        className="w-full text-left p-4 flex items-center gap-3"
      >
        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 flex items-center justify-center text-sm font-bold flex-shrink-0">
          {customer.customerName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 dark:text-zinc-100 truncate">{customer.customerName}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {customer.totalInvoices} {t('rekap_jumlah_transaksi')} • {formatDateShort(customer.lastTransactionTanggal || customer.lastTransactionAt)}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-bold text-violet-700 dark:text-violet-400 text-sm">{formatRupiahShort(customer.totalNilai)}</p>
          {customer.totalSisa > 0 && (
            <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
              {t('rekap_sisa_piutang')}: {formatRupiahShort(customer.totalSisa)}
            </p>
          )}
        </div>
        <ChevronRight className={cn('w-4 h-4 text-slate-400 flex-shrink-0 transition-transform', isOpen && 'rotate-90')} />
      </button>

      {/* Summary chips */}
      <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-[10px] font-medium">
          <CheckCircle2 className="w-3 h-3" />
          {t('rekap_lunas')}: {customer.totalLunas}
        </span>
        {customer.totalBelumLunas > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-[10px] font-medium">
            <Clock className="w-3 h-3" />
            {t('rekap_belum_lunas')}: {customer.totalBelumLunas}
          </span>
        )}
        {customer.totalDP > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 text-[10px] font-medium">
            {t('rekap_total_dp')}: {formatRupiahShort(customer.totalDP)}
          </span>
        )}
      </div>

      {/* Expanded invoice list */}
      {isOpen && (
        <div className="border-t border-slate-100 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-800/30">
          <div className="max-h-80 overflow-y-auto">
            {customer.invoices.map((inv) => (
              <div
                key={inv.id}
                className="px-4 py-3 border-b border-slate-100 dark:border-zinc-800 last:border-b-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Receipt className="w-3 h-3 text-blue-600 flex-shrink-0" />
                      <span className="font-semibold text-xs text-slate-700 dark:text-zinc-200 truncate">
                        {inv.nomor || '-'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {inv.tanggal ? formatDateShort(inv.tanggal) : '-'}
                    </p>
                    {inv.namaBarang && (
                      <p className="text-[11px] text-slate-600 dark:text-zinc-300 mt-0.5 truncate">
                        {inv.namaBarang.split('\n')[0]}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-semibold text-xs text-violet-700 dark:text-violet-400">
                      {formatRupiahShort(inv.totalHarga)}
                    </p>
                    {inv.lunas ? (
                      <span className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-[9px] font-medium">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        {t('rekap_lunas')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-[9px] font-medium">
                        <Clock className="w-2.5 h-2.5" />
                        {t('rekap_belum_lunas')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
