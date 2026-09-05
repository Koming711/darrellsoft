'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { useLanguage } from '@/contexts/language-context'
import { authFetch } from '@/lib/auth-fetch'
import { formatRupiah } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  Receipt,
  TrendingUp,
  Wallet,
  ShoppingBag,
  FileBarChart,
  BarChart3,
  ArrowUpRight,
  Loader2,
  AlertCircle,
  ChevronRight,
  PieChart,
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

// ===== Types =====
interface RecentInvoice {
  id: string
  invoiceNumber: string
  customerName: string
  invoiceDate: string
  grandTotal: number
  status: string
}

interface RecentPO {
  id: string
  poNumber: string
  supplierName: string
  orderDate: string
  total: number
  status: string
}

interface LaporanData {
  periode: string
  totalPenjualan: number
  totalPiutang: number
  totalInvoice: number
  totalPembelian: number
  totalPO: number
  recentInvoices: RecentInvoice[]
  recentPOs: RecentPO[]
}

type PeriodeKey = 'all' | 'hari_ini' | 'minggu_ini' | 'bulan_ini' | 'tahun_ini'

const PERIODE_OPTIONS: PeriodeKey[] = ['all', 'hari_ini', 'minggu_ini', 'bulan_ini', 'tahun_ini']

const PERIODE_LABEL_KEY: Record<PeriodeKey, 'laporan_semua' | 'laporan_hari_ini' | 'laporan_minggu_ini' | 'laporan_bulan_ini' | 'laporan_tahun_ini'> = {
  all: 'laporan_semua',
  hari_ini: 'laporan_hari_ini',
  minggu_ini: 'laporan_minggu_ini',
  bulan_ini: 'laporan_bulan_ini',
  tahun_ini: 'laporan_tahun_ini',
}

export default function LaporanPage() {
  const { t, language } = useLanguage()
  const [data, setData] = useState<LaporanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [periode, setPeriode] = useState<PeriodeKey>('all')

  const fetchData = useCallback(async (p: PeriodeKey) => {
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch(`/api/laporan?periode=${p}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to load' }))
        throw new Error(err.error || 'Failed to load')
      }
      const json = await res.json()
      setData(json)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(periode)
  }, [periode, fetchData])

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    try {
      return new Date(dateStr).toLocaleDateString(language === 'en' ? 'en-US' : 'id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  // ===== Report cards (links to detailed report pages) =====
  const reportLinks = [
    {
      href: '/laporan/penjualan',
      titleKey: 'laporan_penjualan' as const,
      descKey: 'subtitle_laporan' as const,
      icon: TrendingUp,
      color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
    },
    {
      href: '/laporan/rugi-laba',
      titleKey: 'laporan_rugi_laba' as const,
      descKey: 'subtitle_laporan' as const,
      icon: PieChart,
      color: 'bg-teal-100 text-teal-600 dark:bg-teal-950 dark:text-teal-400',
    },
    {
      href: '/rekap-penjualan',
      titleKey: 'laporan_rekap' as const,
      descKey: 'subtitle_rekap_penjualan' as const,
      icon: BarChart3,
      color: 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
    },
    {
      href: '/riwayat-penjualan',
      titleKey: 'laporan_penjualan' as const,
      descKey: 'subtitle_riwayat_penjualan' as const,
      icon: TrendingUp,
      color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
    },
    {
      href: '/riwayat-pembelian',
      titleKey: 'laporan_pembelian' as const,
      descKey: 'subtitle_riwayat_pembelian' as const,
      icon: ShoppingBag,
      color: 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
    },
    {
      href: '/rekap-penjualan',
      titleKey: 'laporan_piutang' as const,
      descKey: 'subtitle_rekap_penjualan' as const,
      icon: Wallet,
      color: 'bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400',
    },
  ]

  return (
    <DashboardLayout title={t('laporan')} subtitle={t('subtitle_laporan')}>
      <div className="space-y-4 sm:space-y-6 pb-6">
        {/* ===== Period Filter ===== */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 hide-scrollbar">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex-shrink-0">
            {t('laporan_periode')}:
          </span>
          {PERIODE_OPTIONS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriode(p)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border',
                periode === p
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800'
              )}
            >
              {t(PERIODE_LABEL_KEY[p])}
            </button>
          ))}
        </div>

        {/* ===== Error ===== */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* ===== Summary Cards ===== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard
            label={t('laporan_total_penjualan')}
            value={loading ? null : formatRupiah(data?.totalPenjualan ?? 0)}
            icon={<TrendingUp className="w-5 h-5" />}
            color="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
            loading={loading}
          />
          <SummaryCard
            label={t('laporan_total_pembelian')}
            value={loading ? null : formatRupiah(data?.totalPembelian ?? 0)}
            icon={<ShoppingBag className="w-5 h-5" />}
            color="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
            loading={loading}
          />
          <SummaryCard
            label={t('laporan_total_piutang')}
            value={loading ? null : formatRupiah(data?.totalPiutang ?? 0)}
            icon={<Wallet className="w-5 h-5" />}
            color="bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
            loading={loading}
          />
          <SummaryCard
            label={t('laporan_total_invoice')}
            value={loading ? null : String(data?.totalInvoice ?? 0)}
            icon={<Receipt className="w-5 h-5" />}
            color="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
            loading={loading}
          />
        </div>

        {/* ===== Report Links ===== */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
            <FileBarChart className="w-4 h-4" />
            {t('laporan_pilih')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {reportLinks.map((r) => (
              <Link
                key={r.titleKey}
                href={r.href}
                className="group flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', r.color)}>
                  <r.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{t(r.titleKey)}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{t(r.descKey)}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" />
              </Link>
            ))}
          </div>
        </div>

        {/* ===== Recent Invoices ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-blue-500" />
                {t('laporan_penjualan')}
              </h3>
              <Link
                href="/riwayat-penjualan"
                className="text-xs text-primary hover:underline flex items-center gap-0.5"
              >
                {t('lainnya')}
                <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="max-h-72 overflow-y-auto hide-scrollbar">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
              ) : !data?.recentInvoices?.length ? (
                <div className="py-8 text-center text-sm text-slate-400">{t('laporan_no_data')}</div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
                  {data.recentInvoices.map((inv) => (
                    <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                          {inv.invoiceNumber}
                        </p>
                        <p className="text-xs text-slate-400 truncate">{inv.customerName || '-'}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatRupiah(inv.grandTotal || 0)}
                        </p>
                        <p className="text-[10px] text-slate-400">{formatDate(inv.invoiceDate)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* ===== Recent POs ===== */}
          <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-amber-500" />
                {t('laporan_pembelian')}
              </h3>
              <Link
                href="/riwayat-pembelian"
                className="text-xs text-primary hover:underline flex items-center gap-0.5"
              >
                {t('lainnya')}
                <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="max-h-72 overflow-y-auto hide-scrollbar">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
              ) : !data?.recentPOs?.length ? (
                <div className="py-8 text-center text-sm text-slate-400">{t('laporan_no_data')}</div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
                  {data.recentPOs.map((po) => (
                    <li key={po.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                          {po.poNumber}
                        </p>
                        <p className="text-xs text-slate-400 truncate">{po.supplierName || '-'}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                          {formatRupiah(po.total || 0)}
                        </p>
                        <p className="text-[10px] text-slate-400">{formatDate(po.orderDate)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

// ===== Summary Card component =====
function SummaryCard({
  label,
  value,
  icon,
  color,
  loading,
}: {
  label: string
  value: string | null
  icon: React.ReactNode
  color: string
  loading: boolean
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-3 sm:p-4">
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', color)}>{icon}</div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5 truncate">{label}</p>
      {loading ? (
        <div className="h-5 w-20 bg-slate-200 dark:bg-zinc-700 rounded animate-pulse" />
      ) : (
        <p className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight break-words">
          {value}
        </p>
      )}
    </div>
  )
}
