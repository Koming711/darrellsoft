'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { useLanguage } from '@/contexts/language-context'
import { useAuth } from '@/contexts/auth-context'
import { authFetch } from '@/lib/auth-fetch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import {
  FileText,
  Truck,
  ShoppingCart,
  Scissors,
  DollarSign,
  BookOpen,
  Clock,
  Calculator,
  TrendingUp,
  CalendarClock,
  ChevronRight,
  History,
  BarChart3,
  Receipt,
  Package,
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { formatRupiah, formatTanggal } from '@/lib/format'

// --- Types ---
interface CetakanRecord {
  id: string
  printName: string
  customerName: string
  profitAmount: number
  finishingNames: string
  jumlahPesanan: string
  grandTotal: number
  createdAt: string
}

interface PotongKertasRecord {
  id: string
  namaCetakan: string
  namaCustomer: string
  paperName: string
  paperWidth: string
  paperHeight: string
  cutWidth: string
  cutHeight: string
  jumlahPesanan: string
  totalPrice: number
  createdAt: string
}

interface HistoryEntry {
  id: string;
  docType: string;
  nomor: string;
  tanggal: string;
  pihakKedua: string;
  total: string;
  dataJson: string;
  createdAt: string;
}

interface DashboardData {
  expiryInfo: {
    validUntil: string | null
    remainingDays: number | null
  }
  summary: {
    calculations: {
      cetakan: number
      finishing: number
      ongkosCetak: number
      hargaKertas: number
      potongKertas: number
      total: number
    }
    documents: {
      invoice: number
      suratJalan: number
      purchaseOrder: number
      total: number
    }
    totals: {
      cetakan: number
      finishing: number
      uangCapek: number
      ongkosCetak: number
      hargaKertas: number
      potongKertas: number
      invoice: number
      purchaseOrder: number
      revenue: number
      modal: number
      todaySales: number
      todayOrderCount: number
      todayUangCapek: number
    }
  }
  recent: {
    cetakan: CetakanRecord[]
    potongKertas: PotongKertasRecord[]
  }
  daily: Record<string, { calculations: number; documents: number }>
}

// --- Greeting ---
function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 0 && hour < 11) return 'Selamat Pagi'
  if (hour >= 11 && hour < 15) return 'Selamat Siang'
  if (hour >= 15 && hour < 18) return 'Selamat Sore'
  return 'Selamat Malam'
}

// --- Helpers ---
function formatRupiahShort(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
}

// --- Empty State ---
function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center">
      <Clock className="mx-auto h-6 w-6 text-gray-300" />
      <p className="mt-2 text-sm text-gray-400">Belum ada data 7 hari terakhir</p>
    </div>
  )
}

// --- Loading Skeleton ---
function TableSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map(i => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}
    </div>
  )
}

// --- Parse dataJson for document info ---
function parseDocInfo(entry: HistoryEntry) {
  try {
    const parsed = JSON.parse(entry.dataJson);
    const items = parsed.items || [];
    const firstItem = items[0];
    const namaBarang = firstItem?.deskripsi || '';
    const hargaSatuan = firstItem?.harga || 0;
    const totalQty = items.reduce((sum: number, it: { qty: number }) => sum + (it.qty || 0), 0);
    const subtotal = items.reduce((sum: number, it: { qty: number; harga: number }) => sum + it.qty * it.harga, 0);
    const ppn = parsed.ppn || 0;
    const totalHarga = subtotal + (subtotal * ppn / 100);
    return { namaBarang, hargaSatuan, totalQty, totalHarga };
  } catch {
    return { namaBarang: '', hargaSatuan: 0, totalQty: 0, totalHarga: 0 };
  }
}

export default function PembukaanPage() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const router = useRouter()
  const [greeting, setGreeting] = useState(getGreeting)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  // Document history states
  const [invoiceHistory, setInvoiceHistory] = useState<HistoryEntry[]>([])
  const [suratJalanHistory, setSuratJalanHistory] = useState<HistoryEntry[]>([])
  const [poHistory, setPoHistory] = useState<HistoryEntry[]>([])
  const [docLoading, setDocLoading] = useState(false)

  // Popup state
  const [showPembelianPopup, setShowPembelianPopup] = useState(false)

  const displayName = user?.name || user?.username || 'Pengguna'

  useEffect(() => {
    const interval = setInterval(() => {
      setGreeting(getGreeting())
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true)
      const res = await authFetch('/api/dashboard')
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (err) {
      console.error('Failed to fetch dashboard:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchDocHistory = useCallback(async () => {
    setDocLoading(true)
    try {
      const [invRes, sjRes, poRes] = await Promise.all([
        fetch('/api/history?docType=invoice'),
        fetch('/api/history?docType=surat-jalan'),
        fetch('/api/history?docType=purchase-order'),
      ])
      if (invRes.ok) { const json = await invRes.json(); setInvoiceHistory(json.data || []) }
      if (sjRes.ok) { const json = await sjRes.json(); setSuratJalanHistory(json.data || []) }
      if (poRes.ok) { const json = await poRes.json(); setPoHistory(json.data || []) }
    } catch {
      // ignore
    } finally {
      setDocLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
    fetchDocHistory()
  }, [fetchDashboard, fetchDocHistory])

  // Listen for save events
  useEffect(() => {
    const handler = () => fetchDocHistory()
    window.addEventListener('dokupro:history-updated', handler)
    return () => window.removeEventListener('dokupro:history-updated', handler)
  }, [fetchDocHistory])

  const summary = data?.summary
  const recent = data?.recent

  return (
    <DashboardLayout title={t('pembukaan')} subtitle={t('subtitle_pembukaan')}>
      <div className="space-y-4 sm:space-y-6 pb-6">
        {/* Greeting Section */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-sky-400 flex items-center justify-center shadow-lg shrink-0">
            <BookOpen className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-normal uppercase text-slate-800">{greeting}</h2>
            <p className="text-lg sm:text-[27px] font-extrabold text-slate-800 truncate">Halo, {displayName}</p>
          </div>
        </div>

        {/* Expired Akun Demo - only for demo role */}
        {user?.role === 'demo' && data?.expiryInfo?.validUntil && (
          <button
            onClick={() => router.push('/checkout')}
            className="bg-teal-600 hover:bg-teal-700 rounded-xl p-4 flex items-center gap-4 w-full text-left transition-colors cursor-pointer"
          >
            <div className="w-10 h-10 rounded-lg bg-white/20 text-white flex items-center justify-center shrink-0">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-teal-100">Expired Akun Demo</p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className="text-base sm:text-lg font-bold text-white leading-tight">
                  {data.expiryInfo.remainingDays} hari lagi
                </p>
                <span className="text-xs text-teal-100">
                  s/d {new Date(data.expiryInfo.validUntil).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
              <p className="text-[11px] mt-1 text-teal-100">
                Lanjutkan sebelum akun mati dan data hilang
              </p>
            </div>
            <ChevronRight className="w-5 h-5 shrink-0 text-white/70" />
          </button>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="Pendapatan Hari Ini"
            count={summary?.totals.todaySales ?? 0}
            total={0}
            color="rose"
            loading={loading}
            isCurrency
            subtitle={summary?.totals.todayOrderCount ? `${summary.totals.todayOrderCount} pesanan` : undefined}
          />
          <StatCard
            icon={<FileText className="w-5 h-5" />}
            label="Transaksi Hari Ini"
            count={invoiceHistory.length}
            total={summary?.totals.invoice ?? 0}
            color="emerald"
            loading={loading}
          />
          <StatCard
            icon={<Calculator className="w-5 h-5" />}
            label="Uang Capek Hari Ini"
            count={summary?.totals.todayUangCapek ?? 0}
            total={0}
            color="amber"
            loading={loading}
            isCurrency
          />
          <StatCard
            icon={<DollarSign className="w-5 h-5" />}
            label={`Total Pendapatan ${new Date().toLocaleDateString('id-ID', { month: 'long' })}`}
            count={summary?.totals.revenue ?? 0}
            total={0}
            color="sky"
            loading={loading}
            isCurrency
          />
          <StatCard
            icon={<DollarSign className="w-5 h-5" />}
            label="Total Uang Capek"
            count={summary?.totals.uangCapek ?? 0}
            total={0}
            color="violet"
            loading={loading}
            isCurrency
            profitBadge={summary?.totals.modal && summary.totals.modal > 0 ? `${(((summary.totals.uangCapek ?? 0) / summary.totals.modal) * 100).toFixed(1)}%` : undefined}
          />
        </div>

        {/* Quick Access Icons */}
        <div className="grid grid-cols-4 gap-3 sm:gap-4">
          <QuickIcon
            icon={<ShoppingCart className="w-5 h-5" />}
            label="Pembelian"
            color="bg-blue-50 text-blue-600 border-blue-200"
            onClick={() => setShowPembelianPopup(true)}
          />
          <QuickIcon
            icon={<History className="w-5 h-5" />}
            label="Riwayat"
            color="bg-amber-50 text-amber-600 border-amber-200"
            onClick={() => router.push('/riwayat')}
          />
          <QuickIcon
            icon={<BarChart3 className="w-5 h-5" />}
            label="Laporan"
            color="bg-emerald-50 text-emerald-600 border-emerald-200"
            onClick={() => router.push('/administrasi')}
          />
          <QuickIcon
            icon={<Receipt className="w-5 h-5" />}
            label="Invoice"
            color="bg-violet-50 text-violet-600 border-violet-200"
            onClick={() => router.push('/invoice')}
          />
        </div>

        {/* Popup Pembelian - Riwayat Purchase Order */}
        <Dialog open={showPembelianPopup} onOpenChange={setShowPembelianPopup}>
          <DialogContent className="sm:max-w-xl p-0 gap-0" showCloseButton={false}>
            <DialogHeader className="px-5 pt-5 pb-3">
              <DialogTitle className="flex items-center gap-2 text-base">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                Riwayat Purchase Order
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">Daftar purchase order yang pernah dibuat</DialogDescription>
            </DialogHeader>
            <div className="px-5 pb-5">
              {docLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}
                </div>
              ) : poHistory.length === 0 ? (
                <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50/50 p-8 text-center">
                  <Package className="mx-auto h-8 w-8 text-blue-300" />
                  <p className="mt-2 text-sm text-blue-400">Belum ada data purchase order</p>
                </div>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {poHistory.map(po => {
                    const info = parseDocInfo(po)
                    return (
                      <div
                        key={po.id}
                        className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg px-3 py-2.5 hover:bg-blue-50/50 transition-colors"
                      >
                        <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
                          <ShoppingCart className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-800 truncate">{po.nomor}</p>
                            {info.namaBarang && (
                              <span className="text-[11px] text-slate-400 truncate hidden sm:inline">· {info.namaBarang}</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 truncate">{po.pihakKedua}{po.tanggal ? ` · ${formatDateShort(po.tanggal)}` : ''}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-blue-600">{info.totalHarga > 0 ? formatRupiahShort(info.totalHarga) : po.total}</p>
                          {info.totalQty > 0 && <p className="text-[10px] text-slate-400">{info.totalQty} item</p>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}

// --- Stat Card Component ---
function StatCard({
  icon, label, count, total, color, loading, isCurrency, subtitle, profitBadge, isDays,
}: {
  icon: React.ReactNode; label: string; count: number; total: number; color: string; loading: boolean; isCurrency?: boolean; subtitle?: string; profitBadge?: string; isDays?: boolean
}) {
  const colorMap: Record<string, { bg: string; border: string; iconBg: string; text: string }> = {
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', iconBg: 'bg-emerald-100 text-emerald-600', text: 'text-emerald-700' },
    sky: { bg: 'bg-sky-50', border: 'border-sky-200', iconBg: 'bg-sky-100 text-sky-600', text: 'text-sky-700' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', iconBg: 'bg-amber-100 text-amber-600', text: 'text-amber-700' },
    violet: { bg: 'bg-violet-50', border: 'border-violet-200', iconBg: 'bg-violet-100 text-violet-600', text: 'text-violet-700' },
    rose: { bg: 'bg-rose-50', border: 'border-rose-200', iconBg: 'bg-rose-100 text-rose-600', text: 'text-rose-700' },
    red: { bg: 'bg-red-50', border: 'border-red-200', iconBg: 'bg-red-100 text-red-600', text: 'text-red-700' },
    orange: { bg: 'bg-orange-50', border: 'border-orange-200', iconBg: 'bg-orange-100 text-orange-600', text: 'text-orange-700' },
    teal: { bg: 'bg-teal-50', border: 'border-teal-200', iconBg: 'bg-teal-100 text-teal-600', text: 'text-teal-700' },
  }
  const c = colorMap[color] || colorMap.emerald

  return (
    <div className={`${c.bg} ${c.border} border rounded-xl p-3 sm:p-4`}>
      {loading ? (
        <div className="space-y-2">
          <div className="h-5 w-5 rounded bg-white/50 animate-pulse" />
          <div className="h-4 w-20 bg-white/50 rounded animate-pulse" />
          <div className="h-3 w-16 bg-white/50 rounded animate-pulse" />
        </div>
      ) : (
        <>
          <div className={`w-8 h-8 rounded-lg ${c.iconBg} flex items-center justify-center mb-2`}>{icon}</div>
          <p className="text-xs text-slate-500 mb-0.5 break-words">{label} {profitBadge && <span className="text-[15px] font-bold text-violet-700">{profitBadge}</span>}</p>
          <p className={`text-base sm:text-lg font-bold ${c.text} leading-tight`}>{isCurrency ? formatRupiahShort(count) : isDays ? `${count} hari` : count}</p>
          {!isCurrency && total > 0 && <p className="text-[10px] text-slate-400">{formatRupiahShort(total)}</p>}
          {subtitle && <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>}
        </>
      )}
    </div>
  )
}

// --- Doc Card Component ---
function DocCard({
  icon, label, count, total, color, loading,
}: {
  icon: React.ReactNode; label: string; count: number; total?: number; color: string; loading: boolean
}) {
  const colorMap: Record<string, { bg: string; border: string; iconBg: string; text: string }> = {
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', iconBg: 'bg-blue-100 text-blue-600', text: 'text-blue-700' },
    teal: { bg: 'bg-teal-50', border: 'border-teal-200', iconBg: 'bg-teal-100 text-teal-600', text: 'text-teal-700' },
    orange: { bg: 'bg-orange-50', border: 'border-orange-200', iconBg: 'bg-orange-100 text-orange-600', text: 'text-orange-700' },
  }
  const c = colorMap[color] || colorMap.blue

  return (
    <div className={`${c.bg} ${c.border} border rounded-xl p-3 sm:p-4`}>
      {loading ? (
        <div className="space-y-2">
          <div className="h-5 w-5 rounded bg-white/50 animate-pulse" />
          <div className="h-4 w-20 bg-white/50 rounded animate-pulse" />
          <div className="h-3 w-16 bg-white/50 rounded animate-pulse" />
        </div>
      ) : (
        <>
          <div className={`w-8 h-8 rounded-lg ${c.iconBg} flex items-center justify-center mb-2`}>{icon}</div>
          <p className="text-xs text-slate-500 mb-0.5">{label}</p>
          <p className={`text-base sm:text-lg font-bold ${c.text} leading-tight`}>{count}</p>
          {total !== undefined && total > 0 && <p className="text-[10px] text-slate-400">{formatRupiahShort(total)}</p>}
        </>
      )}
    </div>
  )
}

// --- Quick Icon Component ---
function QuickIcon({
  icon, label, color, onClick,
}: {
  icon: React.ReactNode; label: string; color: string; onClick: () => void
}) {
  const [bg, text, border] = color.split(' ')
  return (
    <button
      onClick={onClick}
      className={`${bg} ${border} border rounded-xl p-3 sm:p-4 flex flex-col items-center justify-center gap-2 transition-all hover:scale-105 active:scale-95 cursor-pointer`}
    >
      <div className={`${text}`}>{icon}</div>
      <span className={`text-[11px] sm:text-xs font-medium ${text}`}>{label}</span>
    </button>
  )
}
