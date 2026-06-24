'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { useLanguage } from '@/contexts/language-context'
import { authFetch } from '@/lib/auth-fetch'
import { Button } from '@/components/ui/button'
import {
  FileText,
  Printer,
  Search,
  Loader2,
  FileSpreadsheet,
  Layers,
  Palette,
  Paintbrush,
  Droplets,
  Droplet,
  Scissors,
  Receipt,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ===== Types (mirror the API response) =====
interface RekapBiayaItem {
  id: string
  nomorUrut: string
  printName: string
  customerName: string
  quantity: string
  paperName: string
  biayaBahanKertas: number
  biayaCetak: number
  biayaFinishing: number
  biayaOngkosLem: number
  biayaOngkosLemBorongan: number
  biayaBikinPiso: number
  biayaBikinPisoLabel: string
  subTotal: number
  createdAt: string
}

interface RekapBiayaResponse {
  success: true
  periode: { startDate: string | null; endDate: string | null }
  items: RekapBiayaItem[]
  grandTotal: {
    totalCetakan: number
    totalBahanKertas: number
    totalCetak: number
    totalFinishing: number
    totalOngkosLem: number
    totalOngkosLemBorongan: number
    totalBikinPiso: number
    totalBiaya: number
  }
}

// ===== Date filter helpers =====
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

type SortKey = 'terbaru' | 'terlama' | 'total_desc' | 'total_asc' | 'nama_asc'

// ===== Summary card definition =====
interface SummaryCardDef {
  key: 'bahanKertas' | 'cetak' | 'finishing' | 'ongkosLem' | 'ongkosLemBorongan' | 'bikinPiso'
  labelKey: string
  icon: typeof FileText
  color: string
  bg: string
  value: number
}

export default function RekapBiayaPage() {
  const { t } = useLanguage()

  const [data, setData] = useState<RekapBiayaResponse | null>(null)
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
  const [sortKey, setSortKey] = useState<SortKey>('terbaru')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { startDate, endDate } = getFilterDates(filterType, customStartDate, customEndDate)
      const res = await authFetch(`/api/rekap-biaya?startDate=${startDate}&endDate=${endDate}`)
      if (res.ok) {
        const json = (await res.json()) as RekapBiayaResponse
        setData(json)
      } else {
        setError('Gagal memuat data rekap biaya')
      }
    } catch (err) {
      console.error('[RekapBiaya] fetchData error:', err)
      setError('Gagal memuat data rekap biaya')
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

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Apply search + sort
  const processedItems = useMemo<RekapBiayaItem[]>(() => {
    if (!data) return []
    const term = searchTerm.trim().toLowerCase()
    let list = data.items
    if (term) {
      list = list.filter(
        (it) =>
          it.printName.toLowerCase().includes(term) ||
          it.customerName.toLowerCase().includes(term) ||
          it.nomorUrut.toLowerCase().includes(term) ||
          it.paperName.toLowerCase().includes(term)
      )
    }
    const sorted = [...list]
    const totalOf = (it: RekapBiayaItem) =>
      it.biayaBahanKertas +
      it.biayaCetak +
      it.biayaFinishing +
      it.biayaOngkosLem +
      it.biayaOngkosLemBorongan +
      it.biayaBikinPiso
    switch (sortKey) {
      case 'terbaru':
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        break
      case 'terlama':
        sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        break
      case 'total_desc':
        sorted.sort((a, b) => totalOf(b) - totalOf(a))
        break
      case 'total_asc':
        sorted.sort((a, b) => totalOf(a) - totalOf(b))
        break
      case 'nama_asc':
        sorted.sort((a, b) => (a.printName || '').localeCompare(b.printName || '', 'id'))
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

  // 6 summary cards
  const summaryCards: SummaryCardDef[] = grandTotal
    ? [
        {
          key: 'bahanKertas',
          labelKey: 'rekap_biaya_bahan_kertas',
          icon: Layers,
          color: 'text-blue-600',
          bg: 'bg-blue-100 dark:bg-blue-900/30',
          value: grandTotal.totalBahanKertas,
        },
        {
          key: 'cetak',
          labelKey: 'rekap_biaya_cetak',
          icon: Printer,
          color: 'text-emerald-600',
          bg: 'bg-emerald-100 dark:bg-emerald-900/30',
          value: grandTotal.totalCetak,
        },
        {
          key: 'finishing',
          labelKey: 'rekap_biaya_finishing',
          icon: Paintbrush,
          color: 'text-violet-600',
          bg: 'bg-violet-100 dark:bg-violet-900/30',
          value: grandTotal.totalFinishing,
        },
        {
          key: 'ongkosLem',
          labelKey: 'rekap_biaya_ongkos_lem',
          icon: Droplets,
          color: 'text-cyan-600',
          bg: 'bg-cyan-100 dark:bg-cyan-900/30',
          value: grandTotal.totalOngkosLem,
        },
        {
          key: 'ongkosLemBorongan',
          labelKey: 'rekap_biaya_ongkos_lem_borongan',
          icon: Droplet,
          color: 'text-teal-600',
          bg: 'bg-teal-100 dark:bg-teal-900/30',
          value: grandTotal.totalOngkosLemBorongan,
        },
        {
          key: 'bikinPiso',
          labelKey: 'rekap_biaya_bikin_piso',
          icon: Scissors,
          color: 'text-amber-600',
          bg: 'bg-amber-100 dark:bg-amber-900/30',
          value: grandTotal.totalBikinPiso,
        },
      ]
    : []

  // ===== Export to Excel (CSV) =====
  const handleExportExcel = () => {
    if (!data || data.items.length === 0) return
    const rows: string[][] = []
    // Header
    rows.push([
      'No',
      'Tanggal',
      'No. Urut',
      'Nama Cetakan',
      'Customer',
      'Qty',
      'Bahan Kertas',
      'Cetak',
      'Finishing',
      'Ongkos Lem',
      'Ongkos Lem Borongan',
      'Bikin Piso',
      'Total Biaya',
    ])
    data.items.forEach((it, i) => {
      const total =
        it.biayaBahanKertas +
        it.biayaCetak +
        it.biayaFinishing +
        it.biayaOngkosLem +
        it.biayaOngkosLemBorongan +
        it.biayaBikinPiso
      rows.push([
        String(i + 1),
        formatDateShort(it.createdAt),
        it.nomorUrut,
        it.printName,
        it.customerName,
        it.quantity,
        String(Math.round(it.biayaBahanKertas)),
        String(Math.round(it.biayaCetak)),
        String(Math.round(it.biayaFinishing)),
        String(Math.round(it.biayaOngkosLem)),
        String(Math.round(it.biayaOngkosLemBorongan)),
        String(Math.round(it.biayaBikinPiso)),
        String(Math.round(total)),
      ])
    })
    // Grand total row
    if (grandTotal) {
      rows.push([])
      rows.push([
        '',
        '',
        '',
        '',
        '',
        '',
        String(Math.round(grandTotal.totalBahanKertas)),
        String(Math.round(grandTotal.totalCetak)),
        String(Math.round(grandTotal.totalFinishing)),
        String(Math.round(grandTotal.totalOngkosLem)),
        String(Math.round(grandTotal.totalOngkosLemBorongan)),
        String(Math.round(grandTotal.totalBikinPiso)),
        String(Math.round(grandTotal.totalBiaya)),
      ])
    }
    const csv = rows
      .map((r) => r.map((cell) => `"${(cell || '').replace(/"/g, '""')}"`).join(';'))
      .join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const todayStr = new Date().toISOString().slice(0, 10)
    a.download = `Rekap_Biaya_Produksi_${todayStr}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <DashboardLayout title={t('rekap_biaya')} subtitle={t('subtitle_rekap_biaya')}>
      <div className="space-y-4 sm:space-y-6 pb-6">
        {/* ===== 6 Summary Cards ===== */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {summaryCards.map((card) => {
            const Icon = card.icon
            return (
              <div
                key={card.key}
                className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-3 sm:p-4"
              >
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', card.bg)}>
                  <Icon className={cn('w-5 h-5', card.color)} />
                </div>
                <p className="text-xs text-slate-500 mb-0.5 leading-tight">{t(card.labelKey as never)}</p>
                <p className={cn('text-sm sm:text-base font-bold leading-tight', card.color)}>
                  {formatRupiahShort(card.value)}
                </p>
              </div>
            )
          })}
        </div>

        {/* ===== Grand total banner ===== */}
        {grandTotal && (
          <div className="bg-gradient-to-r from-blue-600 to-violet-600 rounded-xl p-4 sm:p-5 text-white shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                  <Receipt className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-blue-100">
                    {t('rekap_biaya_grand_total')}
                  </p>
                  <p className="text-xl sm:text-2xl font-bold">{formatRupiahShort(grandTotal.totalBiaya)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-blue-100">{t('rekap_biaya_jumlah_cetakan')}</p>
                <p className="text-xl sm:text-2xl font-bold">{grandTotal.totalCetakan}</p>
              </div>
            </div>
          </div>
        )}

        {/* ===== Filter + Search + Sort + Actions ===== */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-slate-200 dark:border-zinc-700 p-4 print:hidden">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder={t('rekap_biaya_cari')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-xs text-slate-500 whitespace-nowrap">{t('rekap_urutkan')}:</span>
                <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                  <SelectTrigger className="h-9 w-full sm:w-56 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="terbaru">{t('rekap_sort_terbaru')}</SelectItem>
                    <SelectItem value="terlama">Terlama</SelectItem>
                    <SelectItem value="total_desc">Total Biaya (Tertinggi)</SelectItem>
                    <SelectItem value="total_asc">Total Biaya (Terendah)</SelectItem>
                    <SelectItem value="nama_asc">{t('rekap_sort_nama_asc')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
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
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportExcel}
                  disabled={!data || data.items.length === 0}
                  className="h-8 px-3 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-1.5" />
                  {t('rekap_export_excel')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrint}
                  disabled={!data || data.items.length === 0}
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
        ) : !data || processedItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-3 text-sm text-slate-400 font-medium">{t('rekap_biaya_tidak_ada_data')}</p>
          </div>
        ) : (
          <>
            {/* ===== Desktop Table ===== */}
            <div className="hidden lg:block bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-slate-200 dark:border-zinc-700 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                    <th className="text-left py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap w-8"></th>
                    <th className="text-left py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">{t('rekap_biaya_no_urut')}</th>
                    <th className="text-left py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">{t('rekap_tanggal')}</th>
                    <th className="text-left py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">{t('rekap_biaya_nama_cetakan')}</th>
                    <th className="text-left py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">{t('rekap_biaya_nama_customer')}</th>
                    <th className="text-center py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">{t('rekap_biaya_quantity')}</th>
                    <th className="text-right py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">{t('rekap_biaya_bahan_kertas')}</th>
                    <th className="text-right py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">{t('rekap_biaya_cetak')}</th>
                    <th className="text-right py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">{t('rekap_biaya_finishing')}</th>
                    <th className="text-right py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">{t('rekap_biaya_ongkos_lem')}</th>
                    <th className="text-right py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">{t('rekap_biaya_ongkos_lem_borongan')}</th>
                    <th className="text-right py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">{t('rekap_biaya_bikin_piso')}</th>
                    <th className="text-right py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">{t('rekap_biaya_total_biaya')}</th>
                  </tr>
                </thead>
                <tbody>
                  {processedItems.map((it, idx) => {
                    const total =
                      it.biayaBahanKertas +
                      it.biayaCetak +
                      it.biayaFinishing +
                      it.biayaOngkosLem +
                      it.biayaOngkosLemBorongan +
                      it.biayaBikinPiso
                    const isOpen = expanded.has(it.id)
                    return (
                      <BiayaRowDesktop
                        key={it.id}
                        item={it}
                        total={total}
                        isOpen={isOpen}
                        onToggle={() => toggleExpand(it.id)}
                        zebra={idx % 2 === 1}
                      />
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 dark:border-zinc-600 bg-slate-50 dark:bg-zinc-800 font-bold">
                    <td colSpan={6} className="py-3 px-3 text-right text-slate-700 dark:text-zinc-200 uppercase text-xs tracking-wide">
                      {t('rekap_biaya_grand_total')}
                    </td>
                    <td className="py-3 px-3 text-right text-blue-700 dark:text-blue-400">{formatRupiahShort(grandTotal?.totalBahanKertas ?? 0)}</td>
                    <td className="py-3 px-3 text-right text-emerald-700 dark:text-emerald-400">{formatRupiahShort(grandTotal?.totalCetak ?? 0)}</td>
                    <td className="py-3 px-3 text-right text-violet-700 dark:text-violet-400">{formatRupiahShort(grandTotal?.totalFinishing ?? 0)}</td>
                    <td className="py-3 px-3 text-right text-cyan-700 dark:text-cyan-400">{formatRupiahShort(grandTotal?.totalOngkosLem ?? 0)}</td>
                    <td className="py-3 px-3 text-right text-teal-700 dark:text-teal-400">{formatRupiahShort(grandTotal?.totalOngkosLemBorongan ?? 0)}</td>
                    <td className="py-3 px-3 text-right text-amber-700 dark:text-amber-400">{formatRupiahShort(grandTotal?.totalBikinPiso ?? 0)}</td>
                    <td className="py-3 px-3 text-right text-slate-800 dark:text-zinc-100">{formatRupiahShort(grandTotal?.totalBiaya ?? 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* ===== Tablet/Mobile (sm to lg) — simpler table ===== */}
            <div className="hidden sm:block lg:hidden bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-slate-200 dark:border-zinc-700 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                    <th className="text-left py-2 px-2 text-slate-500 font-semibold whitespace-nowrap w-8"></th>
                    <th className="text-left py-2 px-2 text-slate-500 font-semibold whitespace-nowrap">{t('rekap_biaya_nama_cetakan')}</th>
                    <th className="text-right py-2 px-2 text-slate-500 font-semibold whitespace-nowrap">{t('rekap_biaya_bahan_kertas')}</th>
                    <th className="text-right py-2 px-2 text-slate-500 font-semibold whitespace-nowrap">{t('rekap_biaya_cetak')}</th>
                    <th className="text-right py-2 px-2 text-slate-500 font-semibold whitespace-nowrap">{t('rekap_biaya_finishing')}</th>
                    <th className="text-right py-2 px-2 text-slate-500 font-semibold whitespace-nowrap">{t('rekap_biaya_total_biaya')}</th>
                  </tr>
                </thead>
                <tbody>
                  {processedItems.map((it, idx) => {
                    const total =
                      it.biayaBahanKertas +
                      it.biayaCetak +
                      it.biayaFinishing +
                      it.biayaOngkosLem +
                      it.biayaOngkosLemBorongan +
                      it.biayaBikinPiso
                    const isOpen = expanded.has(it.id)
                    return (
                      <BiayaRowTablet
                        key={it.id}
                        item={it}
                        total={total}
                        isOpen={isOpen}
                        onToggle={() => toggleExpand(it.id)}
                        zebra={idx % 2 === 1}
                      />
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 dark:border-zinc-600 bg-slate-50 dark:bg-zinc-800 font-bold">
                    <td colSpan={2} className="py-2 px-2 text-right text-slate-700 dark:text-zinc-200 uppercase text-[10px]">
                      {t('rekap_biaya_grand_total')}
                    </td>
                    <td className="py-2 px-2 text-right text-blue-700 dark:text-blue-400">{formatRupiahShort(grandTotal?.totalBahanKertas ?? 0)}</td>
                    <td className="py-2 px-2 text-right text-emerald-700 dark:text-emerald-400">{formatRupiahShort(grandTotal?.totalCetak ?? 0)}</td>
                    <td className="py-2 px-2 text-right text-violet-700 dark:text-violet-400">{formatRupiahShort(grandTotal?.totalFinishing ?? 0)}</td>
                    <td className="py-2 px-2 text-right text-slate-800 dark:text-zinc-100">{formatRupiahShort(grandTotal?.totalBiaya ?? 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* ===== Mobile cards ===== */}
            <div className="sm:hidden space-y-3">
              {processedItems.map((it) => {
                const total =
                  it.biayaBahanKertas +
                  it.biayaCetak +
                  it.biayaFinishing +
                  it.biayaOngkosLem +
                  it.biayaOngkosLemBorongan +
                  it.biayaBikinPiso
                const isOpen = expanded.has(it.id)
                return (
                  <BiayaCardMobile
                    key={it.id}
                    item={it}
                    total={total}
                    isOpen={isOpen}
                    onToggle={() => toggleExpand(it.id)}
                  />
                )
              })}
              {/* Mobile grand total */}
              {grandTotal && (
                <div className="rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    {t('rekap_biaya_grand_total')}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-[10px] text-slate-500">{t('rekap_biaya_bahan_kertas')}</p>
                      <p className="font-bold text-blue-700 dark:text-blue-400">{formatRupiahShort(grandTotal.totalBahanKertas)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">{t('rekap_biaya_cetak')}</p>
                      <p className="font-bold text-emerald-700 dark:text-emerald-400">{formatRupiahShort(grandTotal.totalCetak)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">{t('rekap_biaya_finishing')}</p>
                      <p className="font-bold text-violet-700 dark:text-violet-400">{formatRupiahShort(grandTotal.totalFinishing)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">{t('rekap_biaya_ongkos_lem')}</p>
                      <p className="font-bold text-cyan-700 dark:text-cyan-400">{formatRupiahShort(grandTotal.totalOngkosLem)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">{t('rekap_biaya_ongkos_lem_borongan')}</p>
                      <p className="font-bold text-teal-700 dark:text-teal-400">{formatRupiahShort(grandTotal.totalOngkosLemBorongan)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">{t('rekap_biaya_bikin_piso')}</p>
                      <p className="font-bold text-amber-700 dark:text-amber-400">{formatRupiahShort(grandTotal.totalBikinPiso)}</p>
                    </div>
                    <div className="col-span-2 pt-2 border-t border-slate-200 dark:border-zinc-700 mt-1">
                      <p className="text-[10px] text-slate-500">{t('rekap_biaya_total_biaya')}</p>
                      <p className="font-bold text-lg text-slate-800 dark:text-zinc-100">{formatRupiahShort(grandTotal.totalBiaya)}</p>
                    </div>
                  </div>
                </div>
              )}
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

// ===== Cost component badge helper =====
function CostBadge({
  value,
  color,
}: {
  value: number
  color: string
}) {
  if (value <= 0) return <span className="text-slate-400">-</span>
  return <span className={cn('font-medium whitespace-nowrap', color)}>{formatRupiahShort(value)}</span>
}

// ===== Desktop row (full columns + expandable sub-detail) =====
function BiayaRowDesktop({
  item,
  total,
  isOpen,
  onToggle,
  zebra,
}: {
  item: RekapBiayaItem
  total: number
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
        <td className="py-2.5 px-3 text-slate-600 dark:text-zinc-300 whitespace-nowrap">{item.nomorUrut || '-'}</td>
        <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{formatDateShort(item.createdAt)}</td>
        <td className="py-2.5 px-3 text-slate-800 dark:text-zinc-100 font-medium max-w-[200px] truncate">
          {item.printName || '-'}
        </td>
        <td className="py-2.5 px-3 text-slate-600 dark:text-zinc-300 max-w-[160px] truncate">
          {item.customerName || '-'}
        </td>
        <td className="py-2.5 px-3 text-center text-slate-600 dark:text-zinc-300 whitespace-nowrap">{item.quantity || '-'}</td>
        <td className="py-2.5 px-3 text-right whitespace-nowrap"><CostBadge value={item.biayaBahanKertas} color="text-blue-700 dark:text-blue-400" /></td>
        <td className="py-2.5 px-3 text-right whitespace-nowrap"><CostBadge value={item.biayaCetak} color="text-emerald-700 dark:text-emerald-400" /></td>
        <td className="py-2.5 px-3 text-right whitespace-nowrap"><CostBadge value={item.biayaFinishing} color="text-violet-700 dark:text-violet-400" /></td>
        <td className="py-2.5 px-3 text-right whitespace-nowrap"><CostBadge value={item.biayaOngkosLem} color="text-cyan-700 dark:text-cyan-400" /></td>
        <td className="py-2.5 px-3 text-right whitespace-nowrap"><CostBadge value={item.biayaOngkosLemBorongan} color="text-teal-700 dark:text-teal-400" /></td>
        <td className="py-2.5 px-3 text-right whitespace-nowrap"><CostBadge value={item.biayaBikinPiso} color="text-amber-700 dark:text-amber-400" /></td>
        <td className="py-2.5 px-3 text-right whitespace-nowrap font-bold text-slate-800 dark:text-zinc-100">{formatRupiahShort(total)}</td>
      </tr>
      {isOpen && (
        <tr className="bg-slate-50/80 dark:bg-zinc-800/40">
          <td></td>
          <td colSpan={12} className="py-3 px-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <DetailChip label={t('rekap_biaya_bahan_kertas')} value={item.biayaBahanKertas} color="text-blue-700 dark:text-blue-400" bg="bg-blue-50 dark:bg-blue-900/20" />
              <DetailChip label={t('rekap_biaya_cetak')} value={item.biayaCetak} color="text-emerald-700 dark:text-emerald-400" bg="bg-emerald-50 dark:bg-emerald-900/20" />
              <DetailChip label={t('rekap_biaya_finishing')} value={item.biayaFinishing} color="text-violet-700 dark:text-violet-400" bg="bg-violet-50 dark:bg-violet-900/20" />
              <DetailChip label={t('rekap_biaya_ongkos_lem')} value={item.biayaOngkosLem} color="text-cyan-700 dark:text-cyan-400" bg="bg-cyan-50 dark:bg-cyan-900/20" />
              <DetailChip label={t('rekap_biaya_ongkos_lem_borongan')} value={item.biayaOngkosLemBorongan} color="text-teal-700 dark:text-teal-400" bg="bg-teal-50 dark:bg-teal-900/20" />
              <DetailChip label={item.biayaBikinPisoLabel} value={item.biayaBikinPiso} color="text-amber-700 dark:text-amber-400" bg="bg-amber-50 dark:bg-amber-900/20" />
            </div>
            {item.paperName && (
              <p className="mt-2 text-xs text-slate-500">
                <span className="font-medium">Kertas:</span> {item.paperName}
                {item.customerName && <> • <span className="font-medium">Customer:</span> {item.customerName}</>}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function DetailChip({
  label,
  value,
  color,
  bg,
}: {
  label: string
  value: number
  color: string
  bg: string
}) {
  return (
    <div className={cn('rounded-lg px-3 py-2', bg)}>
      <p className="text-[10px] uppercase tracking-wide text-slate-500 truncate">{label}</p>
      <p className={cn('text-sm font-bold', color)}>{value > 0 ? formatRupiahShort(value) : '-'}</p>
    </div>
  )
}

// ===== Tablet row (simplified 6-column) =====
function BiayaRowTablet({
  item,
  total,
  isOpen,
  onToggle,
  zebra,
}: {
  item: RekapBiayaItem
  total: number
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
        <td className="py-2 px-2 text-center">
          {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 inline" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400 inline" />}
        </td>
        <td className="py-2 px-2 text-slate-800 dark:text-zinc-100 font-medium max-w-[160px] truncate">
          <div className="truncate">{item.printName || '-'}</div>
          <div className="text-[10px] text-slate-400 truncate">{item.customerName || '-'}</div>
        </td>
        <td className="py-2 px-2 text-right whitespace-nowrap"><CostBadge value={item.biayaBahanKertas} color="text-blue-700 dark:text-blue-400" /></td>
        <td className="py-2 px-2 text-right whitespace-nowrap"><CostBadge value={item.biayaCetak} color="text-emerald-700 dark:text-emerald-400" /></td>
        <td className="py-2 px-2 text-right whitespace-nowrap"><CostBadge value={item.biayaFinishing} color="text-violet-700 dark:text-violet-400" /></td>
        <td className="py-2 px-2 text-right whitespace-nowrap font-bold text-slate-800 dark:text-zinc-100">{formatRupiahShort(total)}</td>
      </tr>
      {isOpen && (
        <tr className="bg-slate-50/80 dark:bg-zinc-800/40">
          <td></td>
          <td colSpan={5} className="py-3 px-2">
            <div className="grid grid-cols-3 gap-2">
              <DetailChip label={t('rekap_biaya_ongkos_lem')} value={item.biayaOngkosLem} color="text-cyan-700 dark:text-cyan-400" bg="bg-cyan-50 dark:bg-cyan-900/20" />
              <DetailChip label={t('rekap_biaya_ongkos_lem_borongan')} value={item.biayaOngkosLemBorongan} color="text-teal-700 dark:text-teal-400" bg="bg-teal-50 dark:bg-teal-900/20" />
              <DetailChip label={item.biayaBikinPisoLabel} value={item.biayaBikinPiso} color="text-amber-700 dark:text-amber-400" bg="bg-amber-50 dark:bg-amber-900/20" />
            </div>
            <p className="mt-2 text-[10px] text-slate-500">
              {item.nomorUrut && <>No. {item.nomorUrut} • </>}
              {formatDateShort(item.createdAt)}
              {item.paperName && <> • {item.paperName}</>}
            </p>
          </td>
        </tr>
      )}
    </>
  )
}

// ===== Mobile card =====
function BiayaCardMobile({
  item,
  total,
  isOpen,
  onToggle,
}: {
  item: RekapBiayaItem
  total: number
  isOpen: boolean
  onToggle: () => void
}) {
  const { t } = useLanguage()
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-slate-200 dark:border-zinc-700 overflow-hidden">
      <button onClick={onToggle} className="w-full text-left p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 dark:text-zinc-100 truncate">{item.printName || '-'}</p>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            {item.customerName || '-'} • {formatDateShort(item.createdAt)}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-bold text-slate-800 dark:text-zinc-100 text-sm">{formatRupiahShort(total)}</p>
          <p className="text-[10px] text-slate-400">Qty: {item.quantity || '-'}</p>
        </div>
        <ChevronRight className={cn('w-4 h-4 text-slate-400 flex-shrink-0 transition-transform', isOpen && 'rotate-90')} />
      </button>

      {/* Cost chips */}
      <div className="px-4 pb-3 grid grid-cols-3 gap-2">
        <MiniChip label={t('rekap_biaya_bahan_kertas')} value={item.biayaBahanKertas} color="text-blue-700 dark:text-blue-400" />
        <MiniChip label={t('rekap_biaya_cetak')} value={item.biayaCetak} color="text-emerald-700 dark:text-emerald-400" />
        <MiniChip label={t('rekap_biaya_finishing')} value={item.biayaFinishing} color="text-violet-700 dark:text-violet-400" />
      </div>

      {/* Expanded: show remaining 3 costs */}
      {isOpen && (
        <div className="border-t border-slate-100 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-800/30 px-4 py-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <MiniChip label={t('rekap_biaya_ongkos_lem')} value={item.biayaOngkosLem} color="text-cyan-700 dark:text-cyan-400" />
            <MiniChip label={t('rekap_biaya_ongkos_lem_borongan')} value={item.biayaOngkosLemBorongan} color="text-teal-700 dark:text-teal-400" />
            <MiniChip label={item.biayaBikinPisoLabel} value={item.biayaBikinPiso} color="text-amber-700 dark:text-amber-400" />
          </div>
          {item.paperName && (
            <p className="text-[11px] text-slate-500 pt-1">
              <span className="font-medium">Kertas:</span> {item.paperName}
              {item.nomorUrut && <> • No. {item.nomorUrut}</>}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function MiniChip({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div className="bg-slate-50 dark:bg-zinc-800 rounded-lg px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wide text-slate-500 truncate leading-tight">{label}</p>
      <p className={cn('text-[11px] font-bold leading-tight mt-0.5', color)}>
        {value > 0 ? formatRupiahShort(value) : '-'}
      </p>
    </div>
  )
}
