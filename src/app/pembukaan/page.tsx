'use client'

/**
 * BERANDA (/pembukaan)
 * Port 1:1 dari dashboard-view.tsx (workspace archive "invk") yang diupload user,
 * diadaptasi ke infrastruktur app ini:
 *  - data dari GET /api/beranda via authFetch
 *  - navigasi pakai router.push (Next.js App Router)
 *  - role superadmin/admin/manager = finance; user/demo = terbatas
 *  - strip operasional: Laba Kotor / Purchase Order (finance) / Biaya Operasional / Jatuh Tempo
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ReceiptText,
  Wallet,
  Clock,
  TrendingUp,
  Plus,
  ChevronRight,
  Users,
  BadgePercent,
  Package,
  ClipboardList,
  AlarmClock,
  RefreshCw,
  CheckCircle2,
  Inbox,
  HandCoins,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { DashboardLayout } from '@/components/dashboard-layout'
import { authFetch } from '@/lib/auth-fetch'
import { formatRupiah } from '@/lib/format'
import { startNavigation } from '@/components/navigation-progress'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'

// ===== Types (sesuai respons GET /api/beranda) =====
interface BerandaInvoiceItem {
  id: string
  number: string
  date: string
  customerName: string
  total: number
  type: 'REGULER' | 'DP'
  status: 'LUNAS' | 'BELUM'
  dueDate: string
  data: Record<string, unknown> | null
}

interface BerandaDueSoonItem {
  id: string
  number: string
  customerName: string
  sisa: number
  dueDate: string
  overdue: boolean
  overdueDays: number
  data: Record<string, unknown> | null
}

interface BerandaData {
  user: { name: string; role: string }
  cards: {
    revenue: number
    invoiceCount: number
    paidThisMonth: number
    unpaidTotal: number
    unpaidCount: number
    margin: number
    expenseThisMonth: number
    dueSoonCount: number
  }
  status: { lunas: number; belum: number; jatuhTempo: number }
  monthly: { label: string; value: number }[]
  daily: { label: string; value: number }[]
  topCustomers: { name: string; count: number; total: number }[]
  topItems: { name: string; qty: number; unit: string; total: number }[]
  ops: { sjCount: number; poCount: number }
  recent: BerandaInvoiceItem[]
  dueSoon: BerandaDueSoonItem[]
  /** Daftar piutang: SEMUA invoice belum lunas (sisa pembayaran / DP) */
  piutang?: BerandaPiutangItem[]
}

/** Item daftar piutang (sisa pembayaran yang belum dibayar) — sesuai respons API */
interface BerandaPiutangItem {
  id: string
  number: string
  customerName: string
  date: string
  sisa: number
  dueDate: string
  overdue: boolean
  overdueDays: number
  data: Record<string, unknown> | null
}

const ROLE_LABEL: Record<string, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  manager: 'Manajer',
  user: 'Kasir',
  demo: 'Demo',
}

const TYPE_LABEL: Record<'REGULER' | 'DP', string> = {
  REGULER: 'Reguler',
  DP: 'DP',
}

function formatTanggalID(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Tanggal hari ini pada pukul 00:00 (untuk deteksi jatuh tempo). */
function startOfToday(): number {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()
}

/** Format ringkas utk sumbu grafik: 850rb / 1,2jt / 2M */
function compactIDR(v: number): string {
  const trim = (n: number) => {
    const s = n.toFixed(1)
    return s.endsWith('.0') ? s.slice(0, -2) : s
  }
  if (v >= 1_000_000_000) return `${trim(v / 1_000_000_000)}M`
  if (v >= 1_000_000) return `${trim(v / 1_000_000)}jt`
  if (v >= 1_000) return `${Math.round(v / 1_000)}rb`
  return `${Math.round(v)}`
}

/** Tooltip kustom grafik batang */
function ChartTip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value?: number | string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 shadow-md dark:border-zinc-700 dark:bg-zinc-800">
      <p className="text-[11px] font-medium text-stone-500 dark:text-zinc-400">{label}</p>
      <p className="text-sm font-semibold text-stone-900 dark:text-zinc-100">{formatRupiah(Number(payload[0]?.value ?? 0))}</p>
    </div>
  )
}

const salesChartConfig = {
  penjualan: { label: 'Penjualan', color: '#059669' },
} satisfies ChartConfig

const statusChartConfig = {
  lunas: { label: 'Lunas', color: '#059669' },
  belum: { label: 'Belum Bayar', color: '#d97706' },
  jatuhTempo: { label: 'Jatuh Tempo', color: '#dc2626' },
} satisfies ChartConfig

/**
 * Badge status invoice. Warna (spesifikasi user):
 * Lunas → hijau, Belum Lunas → oranye, Jatuh Tempo → merah.
 * `dueDate` opsional: BELUM + jatuh tempo terlewat → tampil "Jatuh Tempo" (merah).
 */
function StatusBadge({ status, dueDate }: { status: 'LUNAS' | 'BELUM'; dueDate?: string | null }) {
  if (status === 'BELUM' && dueDate && new Date(`${dueDate}T00:00:00`).getTime() < startOfToday()) {
    return (
      <Badge
        variant="outline"
        className="bg-red-50 text-red-700 border-red-200 text-[11px] shrink-0 dark:bg-red-950 dark:text-red-300 dark:border-red-900"
      >
        Jatuh Tempo
      </Badge>
    )
  }
  const map = {
    BELUM: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900',
    LUNAS: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900',
  } as const
  return (
    <Badge variant="outline" className={`${map[status]} text-[11px] shrink-0`}>
      {status === 'LUNAS' ? 'Lunas' : 'Belum Lunas'}
    </Badge>
  )
}

/** Badge tipe invoice: Reguler = stone, DP = biru */
function TypeBadge({ type }: { type: 'REGULER' | 'DP' }) {
  const map = {
    REGULER: 'bg-stone-50 text-stone-600 border-stone-300 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700',
    DP: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-900',
  } as const
  return (
    <Badge variant="outline" className={`${map[type]} text-[11px] shrink-0`}>
      {TYPE_LABEL[type]}
    </Badge>
  )
}

export default function PembukaanPage() {
  const router = useRouter()
  const [data, setData] = useState<BerandaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [chartMode, setChartMode] = useState<'monthly' | 'daily'>('monthly')

  const refresh = useCallback(() => {
    setLoading(true)
    authFetch('/api/beranda')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Gagal memuat data'))))
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Terjadi kesalahan'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const navigate = useCallback(
    (path: string) => {
      startNavigation()
      router.push(path)
    },
    [router]
  )

  const s = data
  const hour = new Date().getHours()
  const greeting = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 19 ? 'Selamat sore' : 'Selamat malam'
  const todayLabel = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  // Kasir/demo tidak melihat data finansial (laba, biaya, PO)
  const role = s?.user?.role ?? ''
  const canSeeFinance = role !== 'user' && role !== 'demo'

  // Data donut status (hapus slice bernilai 0)
  const statusTotal = s ? s.status.lunas + s.status.belum + s.status.jatuhTempo : 0
  const statusData = s
    ? [
        { name: 'Lunas', value: s.status.lunas, fill: '#059669' },
        { name: 'Belum Bayar', value: s.status.belum, fill: '#d97706' },
        { name: 'Jatuh Tempo', value: s.status.jatuhTempo, fill: '#dc2626' },
      ].filter((d) => d.value > 0)
    : []
  const chartData = s ? (chartMode === 'monthly' ? s.monthly : s.daily) : []
  const chartTotal = chartData.reduce((a, b) => a + b.value, 0)

  const maxCust = s?.topCustomers[0]?.total ?? 0
  const maxItem = s?.topItems[0]?.total ?? 0

  return (
    <DashboardLayout title="Beranda">
      <div className="space-y-5 md:space-y-6">
        {/* ===== Header ===== */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-stone-900 dark:text-zinc-100">
                {greeting}
                {s?.user?.name ? `, ${s.user.name.split(' ')[0]}` : ''} 👋
              </h1>
              {s?.user?.role && (
                <Badge
                  variant="outline"
                  className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px] dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900"
                >
                  {ROLE_LABEL[s.user.role] ?? s.user.role}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{todayLabel}</p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="icon"
              aria-label="Muat ulang data"
              onClick={refresh}
              disabled={loading}
              className="h-[44px] w-[44px] shrink-0 bg-white dark:bg-zinc-900"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              onClick={() => navigate('/invoice?buat=1')}
              className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px] flex-1 min-w-0 sm:w-auto"
            >
              <Plus className="h-4 w-4" /> Buat Invoice
            </Button>
          </div>
        </div>

        {/* ===== Kartu ringkasan keuangan ===== */}
        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
          {/* Penjualan bulan ini */}
          <Card className="p-0 gap-0 dark:border-zinc-800">
            <CardContent className="p-4 md:p-5">
              {loading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <ReceiptText className="h-4 w-4 text-emerald-600" />
                    <p className="text-xs font-medium">Penjualan Bulan Ini</p>
                  </div>
                  <p className="text-base md:text-2xl font-bold mt-2 text-stone-900 dark:text-zinc-100">
                    {formatRupiah(s?.cards.revenue ?? 0)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">{s?.cards.invoiceCount ?? 0} invoice aktif &amp; lunas</p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Pembayaran masuk (cash basis) */}
          <Card className="p-0 gap-0 dark:border-zinc-800">
            <CardContent className="p-4 md:p-5">
              {loading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Wallet className="h-4 w-4 text-emerald-600" />
                    <p className="text-xs font-medium">Pembayaran Masuk</p>
                  </div>
                  <p className="text-base md:text-2xl font-bold mt-2 text-stone-900 dark:text-zinc-100">
                    {formatRupiah(s?.cards.paidThisMonth ?? 0)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">DP + pelunasan + reguler lunas</p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Piutang */}
          <button className="text-left" onClick={() => navigate('/riwayat-pembayaran')} aria-label="Buka Riwayat Pembayaran">
            <Card className="p-0 gap-0 h-full transition-colors hover:border-amber-300 dark:border-zinc-800 dark:hover:border-amber-900">
              <CardContent className="p-4 md:p-5">
                {loading ? (
                  <Skeleton className="h-16 w-full" />
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4 text-amber-600" />
                      <p className="text-xs font-medium">Piutang</p>
                    </div>
                    <p className="text-base md:text-2xl font-bold mt-2 text-amber-700 dark:text-amber-400">
                      {formatRupiah(s?.cards.unpaidTotal ?? 0)}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">{s?.cards.unpaidCount ?? 0} invoice belum lunas</p>
                  </>
                )}
              </CardContent>
            </Card>
          </button>

          {/* Laba kotor */}
          <button className="text-left" onClick={() => navigate('/laporan/rugi-laba')} aria-label="Buka Laporan Rugi Laba">
            <Card className="p-0 gap-0 h-full transition-colors hover:border-emerald-300 dark:border-zinc-800 dark:hover:border-emerald-800">
              <CardContent className="p-4 md:p-5">
                {loading ? (
                  <Skeleton className="h-16 w-full" />
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <TrendingUp className="h-4 w-4 text-emerald-600" />
                      <p className="text-xs font-medium">Laba Kotor</p>
                    </div>
                    <p className="text-base md:text-2xl font-bold mt-2 text-stone-900 dark:text-zinc-100">
                      {formatRupiah(s?.cards.margin ?? 0)}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">Biaya ops: {formatRupiah(s?.cards.expenseThisMonth ?? 0)}</p>
                  </>
                )}
              </CardContent>
            </Card>
          </button>
        </div>

        {/* ===== Grafik + Status ===== */}
        <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3 p-0 gap-0 dark:border-zinc-800">
            <CardHeader className="py-4 px-4 md:px-5">
              <div className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm">Grafik Penjualan</CardTitle>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Total: <span className="font-semibold text-emerald-700 dark:text-emerald-400">{formatRupiah(chartTotal)}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
                  {(['monthly', 'daily'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setChartMode(m)}
                      aria-pressed={chartMode === m}
                      className={`px-2.5 h-7 rounded-md text-[11px] font-medium transition-colors ${
                        chartMode === m
                          ? 'bg-white shadow-sm text-stone-900 dark:bg-zinc-900 dark:text-zinc-100'
                          : 'text-stone-500 hover:text-stone-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                      }`}
                    >
                      {m === 'monthly' ? '6 Bulan' : '14 Hari'}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-2 md:px-4 pb-4">
              {loading ? (
                <Skeleton className="h-[240px] w-full mx-2" />
              ) : (
                <ChartContainer config={salesChartConfig} className="aspect-auto h-[240px] w-full">
                  <BarChart data={chartData} margin={{ left: 4, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e7e5e4" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      fontSize={11}
                      stroke="#78716c"
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      width={44}
                      tickLine={false}
                      axisLine={false}
                      fontSize={10}
                      stroke="#78716c"
                      tickFormatter={(v: number) => compactIDR(v)}
                    />
                    <RTooltip cursor={{ fill: 'rgba(5, 150, 105, 0.07)' }} content={<ChartTip />} />
                    <Bar dataKey="value" fill="#059669" radius={[6, 6, 0, 0]} maxBarSize={38} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2 p-0 gap-0 dark:border-zinc-800">
            <CardHeader className="py-4 px-4 md:px-5">
              <CardTitle className="text-sm">Status Invoice Bulan Ini</CardTitle>
            </CardHeader>
            <CardContent className="px-4 md:px-5 pb-5">
              {loading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : statusTotal === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Inbox className="h-10 w-10 text-stone-300 mx-auto mb-2 dark:text-zinc-700" />
                  <p className="text-sm text-muted-foreground">Belum ada invoice bulan ini.</p>
                </div>
              ) : (
                <>
                  <div className="relative mx-auto h-[180px] w-full max-w-[240px]">
                    <ChartContainer config={statusChartConfig} className="h-[180px] w-full">
                      <PieChart>
                        <RTooltip content={<ChartTip />} />
                        <Pie
                          data={statusData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius="62%"
                          outerRadius="88%"
                          paddingAngle={2}
                          strokeWidth={0}
                        >
                          {statusData.map((d) => (
                            <Cell key={d.name} fill={d.fill} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <p className="text-2xl font-bold leading-none text-stone-900 dark:text-zinc-100">{statusTotal}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">invoice</p>
                    </div>
                  </div>
                  <ul className="mt-4 space-y-2">
                    {statusData.map((d) => (
                      <li key={d.name} className="flex items-center gap-2 text-sm">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.fill }} />
                        <span className="flex-1 text-stone-600 dark:text-zinc-300">{d.name}</span>
                        <span className="font-semibold text-stone-900 dark:text-zinc-100">{d.value}</span>
                        <span className="text-[11px] text-muted-foreground w-9 text-right">
                          {Math.round((d.value / statusTotal) * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ===== Peringkat: Top pelanggan & produk terlaris ===== */}
        <div className="grid grid-cols-1 gap-4 md:gap-6 md:grid-cols-2">
          <Card className="p-0 gap-0 dark:border-zinc-800">
            <CardHeader className="py-4 px-4 md:px-5">
              <CardTitle className="text-sm">Pelanggan Teratas Bulan Ini</CardTitle>
            </CardHeader>
            <CardContent className="px-4 md:px-5 pb-5">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !s?.topCustomers.length ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Belum ada penjualan bulan ini.</p>
              ) : (
                <ul className="space-y-3.5">
                  {s.topCustomers.map((c, i) => (
                    <li key={c.name}>
                      <button onClick={() => navigate('/master-customer')} className="w-full text-left group" aria-label={`Buka Master Customer: ${c.name}`}>
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                              i === 0 ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-500 dark:bg-zinc-800 dark:text-zinc-400'
                            }`}
                          >
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate group-hover:text-emerald-700 transition-colors text-stone-900 dark:text-zinc-100">
                              {c.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground">{c.count} invoice</p>
                          </div>
                          <p className="text-sm font-semibold shrink-0 text-stone-900 dark:text-zinc-100">{formatRupiah(c.total)}</p>
                        </div>
                        <div className="mt-1.5 ml-9 h-1.5 rounded-full bg-stone-100 overflow-hidden dark:bg-zinc-800">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${maxCust > 0 ? Math.max(4, (c.total / maxCust) * 100) : 4}%` }}
                          />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="p-0 gap-0 dark:border-zinc-800">
            <CardHeader className="py-4 px-4 md:px-5">
              <CardTitle className="text-sm">Produk Terlaris Bulan Ini</CardTitle>
            </CardHeader>
            <CardContent className="px-4 md:px-5 pb-5">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !s?.topItems.length ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Belum ada barang terjual bulan ini.</p>
              ) : (
                <ul className="space-y-3.5">
                  {s.topItems.map((it, i) => (
                    <li key={it.name}>
                      <div>
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                              i === 0 ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-500 dark:bg-zinc-800 dark:text-zinc-400'
                            }`}
                          >
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate text-stone-900 dark:text-zinc-100">{it.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {it.qty} {it.unit} terjual
                            </p>
                          </div>
                          <p className="text-sm font-semibold shrink-0 text-stone-900 dark:text-zinc-100">{formatRupiah(it.total)}</p>
                        </div>
                        <div className="mt-1.5 ml-9 h-1.5 rounded-full bg-stone-100 overflow-hidden dark:bg-zinc-800">
                          <div
                            className="h-full rounded-full bg-amber-500"
                            style={{ width: `${maxItem > 0 ? Math.max(4, (it.total / maxItem) * 100) : 4}%` }}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ===== Strip operasional ===== */}
        <section aria-label="Operasional">
          <p className="text-[10px] uppercase tracking-wider text-stone-400 dark:text-zinc-500 font-semibold mb-2">Operasional</p>
          <div className={`grid grid-cols-2 ${canSeeFinance ? 'lg:grid-cols-4' : ''} gap-3`}>
            <OpsCard
              loading={loading}
              icon={TrendingUp}
              label="Laba Kotor"
              value={formatRupiah(s?.cards.margin ?? 0)}
              hint="bulan ini"
              onClick={() => navigate('/laporan/rugi-laba')}
            />
            {canSeeFinance && (
              <>
                <OpsCard
                  loading={loading}
                  icon={ClipboardList}
                  label="Purchase Order"
                  value={`${s?.ops.poCount ?? 0}`}
                  hint="dibuat bulan ini"
                  onClick={() => navigate('/purchase-order')}
                />
                <OpsCard
                  loading={loading}
                  icon={Wallet}
                  label="Biaya Operasional"
                  value={formatRupiah(s?.cards.expenseThisMonth ?? 0)}
                  hint="bulan ini"
                  onClick={() => navigate('/biaya-operasional')}
                />
              </>
            )}
            <OpsCard
              loading={loading}
              icon={AlarmClock}
              label="Jatuh Tempo ≤7 Hari"
              value={`${s?.cards.dueSoonCount ?? 0}`}
              hint="termasuk terlambat"
              onClick={() => navigate('/riwayat-pembayaran')}
              tone={s?.cards.dueSoonCount ? 'amber' : 'emerald'}
            />
          </div>
        </section>

        {/* ===== Invoice terbaru + Pengingat jatuh tempo ===== */}
        <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3 p-0 gap-0 dark:border-zinc-800">
            <CardHeader className="py-4 px-4 md:px-5">
              <div className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm">Invoice Terbaru</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 h-8"
                  onClick={() => navigate('/invoice')}
                >
                  Lihat semua <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-2 md:px-3 pb-3">
              {loading ? (
                <div className="space-y-2 px-2">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !s?.recent?.length ? (
                <div className="text-center py-8 px-4">
                  <ReceiptText className="h-10 w-10 text-stone-300 mx-auto mb-2 dark:text-zinc-700" />
                  <p className="text-sm text-muted-foreground">Belum ada invoice.</p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => navigate('/invoice?buat=1')}>
                    <Plus className="h-4 w-4" /> Buat invoice pertama
                  </Button>
                </div>
              ) : (
                <ul className="divide-y divide-stone-100 dark:divide-zinc-800 max-h-[420px] overflow-y-auto scrollbar-thin">
                  {s.recent.map((inv) => (
                    <li key={inv.id}>
                      <button
                        onClick={() => navigate(`/invoice?detail=${inv.id}`)}
                        aria-label={`Buka detail invoice ${inv.number}`}
                        className="w-full flex items-center gap-3 px-2 md:px-3 py-3 rounded-lg hover:bg-stone-50 dark:hover:bg-zinc-800 transition-colors text-left min-h-[52px]"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-stone-900 dark:text-zinc-100">{inv.number}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {inv.customerName} · {formatTanggalID(inv.date)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-stone-900 dark:text-zinc-100">{formatRupiah(inv.total)}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {inv.type !== 'REGULER' && <TypeBadge type={inv.type} />}
                          <StatusBadge status={inv.status} dueDate={inv.dueDate} />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2 p-0 gap-0 dark:border-zinc-800">
            <CardHeader className="py-4 px-4 md:px-5">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlarmClock className="h-4 w-4 text-amber-600" /> Pengingat Jatuh Tempo
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 md:px-3 pb-3">
              {loading ? (
                <div className="space-y-2 px-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !s?.dueSoon?.length ? (
                <div className="text-center py-8 px-4">
                  <CheckCircle2 className="h-10 w-10 text-emerald-200 mx-auto mb-2 dark:text-emerald-900" />
                  <p className="text-sm text-muted-foreground">Tidak ada tagihan jatuh tempo dalam 7 hari.</p>
                </div>
              ) : (
                <ul className="divide-y divide-stone-100 dark:divide-zinc-800">
                  {s.dueSoon.map((d) => (
                    <li key={d.id}>
                      <button
                        onClick={() => navigate(`/invoice?detail=${d.id}`)}
                        aria-label={`Buka detail invoice ${d.number}`}
                        className="w-full flex items-center gap-3 px-2 md:px-3 py-3 rounded-lg hover:bg-stone-50 dark:hover:bg-zinc-800 transition-colors text-left min-h-[52px]"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-stone-900 dark:text-zinc-100">{d.number}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {d.customerName} · tempo {formatTanggalID(d.dueDate)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-stone-900 dark:text-zinc-100">{formatRupiah(d.sisa)}</p>
                          {d.overdue ? (
                            <p className="text-[11px] font-medium text-red-600">Terlambat {d.overdueDays} hari</p>
                          ) : (
                            <p className="text-[11px] font-medium text-amber-600">
                              H-{Math.ceil((new Date(`${d.dueDate}T00:00:00`).getTime() - startOfToday()) / 86400000)}
                            </p>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ===== Daftar Piutang (sisa pembayaran invoice DP & invoice belum lunas) ===== */}
        <Card className="p-0 gap-0 dark:border-zinc-800">
          <CardHeader className="py-4 px-4 md:px-5">
            <div className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" /> Daftar Piutang
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Total: <span className="font-semibold text-amber-700 dark:text-amber-400">{formatRupiah(s?.cards.unpaidTotal ?? 0)}</span>
              </p>
            </div>
          </CardHeader>
          <CardContent className="px-2 md:px-3 pb-3">
            {loading ? (
              <div className="space-y-2 px-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !s?.piutang?.length ? (
              <div className="text-center py-8 px-4">
                <CheckCircle2 className="h-10 w-10 text-emerald-200 mx-auto mb-2 dark:text-emerald-900" />
                <p className="text-sm text-muted-foreground">Tidak ada piutang — semua invoice sudah lunas.</p>
              </div>
            ) : (
              <ul className="divide-y divide-stone-100 dark:divide-zinc-800 max-h-96 overflow-y-auto">
                {s.piutang.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => navigate(`/invoice?detail=${p.id}`)}
                      aria-label={`Buka detail invoice ${p.number}`}
                      className="w-full flex items-center gap-3 px-2 md:px-3 py-3 rounded-lg hover:bg-stone-50 dark:hover:bg-zinc-800 transition-colors text-left min-h-[52px]"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium truncate text-stone-900 dark:text-zinc-100">{p.number}</p>
                          {(Boolean(p.data?.dp) || Number(p.data?.dpAmount ?? 0) > 0) ? (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-violet-300 text-violet-700 dark:border-violet-700 dark:text-violet-300">DP</Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {p.customerName} · {formatTanggalID(p.date)}{p.dueDate ? ` · tempo ${formatTanggalID(p.dueDate)}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">{formatRupiah(p.sisa)}</p>
                        {p.overdue ? (
                          <p className="text-[11px] font-medium text-red-600">Terlambat {p.overdueDays} hari</p>
                        ) : p.dueDate ? (
                          <p className="text-[11px] font-medium text-amber-600">
                            H-{Math.ceil((new Date(`${p.dueDate}T00:00:00`).getTime() - startOfToday()) / 86400000)}
                          </p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">Sisa pembayaran</p>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ===== Menu pintas ===== */}
        <section aria-label="Menu Pintas">
          <p className="text-[10px] uppercase tracking-wider text-stone-400 dark:text-zinc-500 font-semibold mb-2">Menu Pintas</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {canSeeFinance && (
              <>
                <QuickLink icon={Users} title="Master Pelanggan" desc="Data & kontak pelanggan" onClick={() => navigate('/master-customer')} />
                <QuickLink icon={BadgePercent} title="Harga Khusus" desc="Atur harga per pelanggan" onClick={() => navigate('/harga-khusus')} />
                <QuickLink icon={Package} title="Master Barang" desc="Harga standar & HPP" onClick={() => navigate('/master-barang')} />
              </>
            )}
            <QuickLink icon={ReceiptText} title="Riwayat Invoice" desc="Cari, export Excel/PDF, kirim WA" onClick={() => navigate('/invoice')} />
            {canSeeFinance && (
              <>
                <QuickLink icon={TrendingUp} title="Laba Kotor" desc="Laporan rugi laba" onClick={() => navigate('/laporan/rugi-laba')} />
                <QuickLink icon={HandCoins} title="Hutang Dagang" desc="Tagihan PO ke pemasok" onClick={() => navigate('/hutang-dagang')} />
                <QuickLink icon={ClipboardList} title="Purchase Order" desc="Pesan barang ke supplier" onClick={() => navigate('/purchase-order')} />
              </>
            )}
          </div>
        </section>
      </div>
    </DashboardLayout>
  )
}

/** Kartu kecil operasional yang bisa diklik */
function OpsCard({
  icon: Icon,
  label,
  value,
  hint,
  onClick,
  loading,
  tone = 'emerald',
}: {
  icon: typeof TrendingUp
  label: string
  value: string
  hint: string
  onClick: () => void
  loading?: boolean
  tone?: 'emerald' | 'amber'
}) {
  return (
    <button onClick={onClick} className="text-left">
      <Card
        className={`p-0 gap-0 h-full transition-colors dark:border-zinc-800 ${
          tone === 'amber'
            ? 'hover:border-amber-300 hover:bg-amber-50/30 dark:hover:border-amber-900 dark:hover:bg-amber-950/30'
            : 'hover:border-emerald-300 hover:bg-emerald-50/30 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/30'
        }`}
      >
        <CardContent className="p-4">
          {loading ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <div className="flex items-start gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  tone === 'amber'
                    ? 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400'
                    : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400'
                }`}
              >
                <Icon className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
                <p className="text-base md:text-lg font-bold mt-0.5 truncate text-stone-900 dark:text-zinc-100">{value}</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{hint}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-stone-300 dark:text-zinc-600 shrink-0 mt-1" />
            </div>
          )}
        </CardContent>
      </Card>
    </button>
  )
}

function QuickLink({
  icon: Icon,
  title,
  desc,
  onClick,
}: {
  icon: typeof Users
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50/50 min-h-[60px] dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/30"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-stone-900 dark:text-zinc-100">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{desc}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-stone-400 dark:text-zinc-500" />
    </button>
  )
}
