'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlarmClock,
  BadgePercent,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Inbox,
  Package,
  ReceiptText,
  RefreshCw,
  Sparkles,
  Truck,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { InvoicePreview } from '@/components/dokupro/invoice-preview'
import type { InvoiceData } from '@/lib/types'
import { normalizeInvoiceData } from '@/lib/normalize-invoice'
import { fetchUserCompany } from '@/lib/company-settings'
import { generateInvoicePdf, sharePdfViaWhatsApp } from '@/lib/generate-pdf'

// ===== Types (sesuai respons GET /api/beranda) =====
interface BerandaStats {
  totalPenjualan: number
  totalPiutang: number
  invoiceBelumLunas: number
  totalPelanggan: number
}

interface BerandaChartItem {
  tanggal: string
  label: string
  penjualan: number
  pembayaran: number
}

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

interface BerandaDueItem {
  id: string
  number: string
  date: string
  customerName: string
  total: number
  sisa: number
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

interface BerandaTopCustomer {
  name: string
  count: number
  total: number
}

interface BerandaTopItem {
  name: string
  qty: number
  unit: string
  total: number
}

interface BerandaData {
  user: { name: string; role: string }
  stats: BerandaStats
  chart: BerandaChartItem[]
  recent: BerandaInvoiceItem[]
  due: BerandaDueItem[]
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
  topCustomers: BerandaTopCustomer[]
  topItems: BerandaTopItem[]
  ops: { sjCount: number; poCount: number }
  dueSoon: BerandaDueSoonItem[]
}

// Motivasi hari ini — deterministic (day-of-year based) to avoid hydration mismatch
const DAFTAR_MOTIVASI = [
  'Kerja keras hari ini, hasilnya nikmat besok hari.',
  'Setiap langkah kecil mendekatkanmu pada tujuan besar.',
  'Jangan takut gagal, takutlah untuk tidak mencoba.',
  'Kesuksesan dimulai dari keberanian untuk memulai.',
  'Disiplin adalah jembatan antara tujuan dan pencapaian.',
  'Hari ini adalah kesempatan baru untuk menjadi lebih baik.',
  'Usaha kecil yang konsisten mengalahkan usaha besar yang sporadis.',
  'Fokus pada proses, hasil akan mengikuti.',
  'Jangan menunda pekerjaan hari ini sampai besok.',
  'Bermimpi besar, mulai dari yang kecil.',
  'Konsistensi adalah kunci dari semua keberhasilan.',
  'Waktu terbaik untuk memulai adalah sekarang.',
]

const ROLE_LABEL: Record<string, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  manager: 'Manajer',
  user: 'Kasir',
  demo: 'Demo',
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

export default function PembukaanPage() {
  const router = useRouter()
  const [data, setData] = useState<BerandaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [chartMode, setChartMode] = useState<'monthly' | 'daily'>('monthly')

  // Popup pratinjau invoice A5
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewItem, setPreviewItem] = useState<BerandaInvoiceItem | BerandaDueItem | BerandaDueSoonItem | null>(null)
  const [previewScale, setPreviewScale] = useState(0.5)
  const [sendingPdf, setSendingPdf] = useState(false)

  // Data toko milik user (fallback konten invoice lama yang tidak menyimpan company)
  const [userCompany, setUserCompany] = useState<Partial<InvoiceData['company']> | null>(null)
  useEffect(() => {
    let alive = true
    fetchUserCompany().then((c) => {
      if (alive) setUserCompany(c)
    })
    return () => {
      alive = false
    }
  }, [])

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

  // Scale A5 Invoice preview to fit inside a popup on both mobile & desktop
  useEffect(() => {
    const DESIGN_W = 576
    const DESIGN_H = DESIGN_W * (210 / 148)
    const updateInvScale = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const marginX = 24
      const marginY = 32
      const topPad = 48
      const btnArea = 56
      const availW = vw - marginX * 2
      const availH = vh - marginY * 2 - topPad - btnArea
      const sc = Math.min(availW / DESIGN_W, availH / DESIGN_H)
      setPreviewScale(Math.max(0.28, Math.min(0.85, sc)))
    }
    updateInvScale()
    window.addEventListener('resize', updateInvScale)
    return () => window.removeEventListener('resize', updateInvScale)
  }, [])

  const openPreview = (item: BerandaInvoiceItem | BerandaDueItem | BerandaDueSoonItem | null) => {
    // Guard: tanpa data lengkap, popup akan kosong — info user
    if (!item?.data) {
      toast.info('Detail pratinjau tidak tersedia untuk invoice ini')
      return
    }
    setPreviewItem(item)
    setPreviewOpen(true)
  }

  const previewData = useMemo<InvoiceData | null>(() => {
    if (!previewItem?.data) return null
    // Normalisasi data lama (dataJson tanpa key `company`) + fallback data toko user
    return normalizeInvoiceData(previewItem.data, userCompany)
  }, [previewItem, userCompany])

  const handleSendPdf = useCallback(async () => {
    if (!previewData) return
    setSendingPdf(true)
    try {
      const blob = await generateInvoicePdf(previewData)
      const fileName = `Invoice_${previewData.nomor || 'draft'}.pdf`
      await sharePdfViaWhatsApp(blob, fileName, `Invoice ${previewData.nomor}`)
      toast.success('PDF dikirim via WhatsApp')
    } catch (err) {
      console.error(err)
      toast.error('Gagal mengirim PDF')
    } finally {
      setSendingPdf(false)
    }
  }, [previewData])

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

  // Motivasi deterministik berdasarkan day-of-year (hindari hydration mismatch)
  const motivasiHariIni = useMemo(() => {
    const today = new Date()
    const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000)
    return DAFTAR_MOTIVASI[dayOfYear % DAFTAR_MOTIVASI.length]
  }, [])

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
        {/* ===== Header: greeting + tanggal (TANPA tombol Buat Invoice & Refresh) ===== */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-stone-900 dark:text-zinc-100">
              {greeting}
              {s?.user?.name ? `, ${s.user.name}` : ''} 👋
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

        {/* ===== MOTIVASI HARI INI ===== */}
        <div className="rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-700 p-4 md:p-5 text-white shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-300/90 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-4.5 h-4.5 text-amber-800" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-50/80 mb-0.5">Motivasi Hari Ini</p>
              <p className="text-[14px] sm:text-[16px] font-bold italic leading-relaxed">&ldquo;{motivasiHariIni}&rdquo;</p>
            </div>
          </div>
        </div>

        {/* ===== Kartu ringkasan keuangan ===== */}
        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
          {/* Penjualan bulan ini */}
          <button className="text-left" onClick={() => navigate('/laporan/penjualan')} aria-label="Buka Laporan Penjualan">
            <Card className="p-0 gap-0 h-full transition-colors hover:border-emerald-300 dark:border-zinc-800 dark:hover:border-emerald-800">
              <CardContent className="p-4 md:p-5">
                {loading ? (
                  <Skeleton className="h-16 w-full" />
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <ReceiptText className="h-4 w-4 text-emerald-600" />
                      <p className="text-xs font-medium">Penjualan Bulan Ini</p>
                    </div>
                    <p className="text-base md:text-2xl font-bold mt-2 text-stone-900 dark:text-zinc-100">{formatRupiah(s?.cards.revenue ?? 0)}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{s?.cards.invoiceCount ?? 0} invoice bulan ini</p>
                  </>
                )}
              </CardContent>
            </Card>
          </button>

          {/* Pembayaran masuk (cash basis) */}
          <button className="text-left" onClick={() => navigate('/riwayat-pembayaran')} aria-label="Buka Riwayat Pembayaran">
            <Card className="p-0 gap-0 h-full transition-colors hover:border-emerald-300 dark:border-zinc-800 dark:hover:border-emerald-800">
              <CardContent className="p-4 md:p-5">
                {loading ? (
                  <Skeleton className="h-16 w-full" />
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Wallet className="h-4 w-4 text-emerald-600" />
                      <p className="text-xs font-medium">Pembayaran Masuk</p>
                    </div>
                    <p className="text-base md:text-2xl font-bold mt-2 text-stone-900 dark:text-zinc-100">{formatRupiah(s?.cards.paidThisMonth ?? 0)}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">DP + pelunasan + reguler lunas</p>
                  </>
                )}
              </CardContent>
            </Card>
          </button>

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
                    <p className="text-base md:text-2xl font-bold mt-2 text-amber-700 dark:text-amber-400">{formatRupiah(s?.cards.unpaidTotal ?? 0)}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{s?.cards.unpaidCount ?? 0} invoice belum lunas</p>
                  </>
                )}
              </CardContent>
            </Card>
          </button>

          {/* Laba kotor (admin/manager) atau Surat Jalan (kasir) */}
          {canSeeFinance ? (
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
                      <p className="text-base md:text-2xl font-bold mt-2 text-stone-900 dark:text-zinc-100">{formatRupiah(s?.cards.margin ?? 0)}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Biaya ops: {formatRupiah(s?.cards.expenseThisMonth ?? 0)}
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </button>
          ) : (
            <button className="text-left" onClick={() => navigate('/surat-jalan')} aria-label="Buka Surat Jalan">
              <Card className="p-0 gap-0 h-full transition-colors hover:border-emerald-300 dark:border-zinc-800 dark:hover:border-emerald-800">
                <CardContent className="p-4 md:p-5">
                  {loading ? (
                    <Skeleton className="h-16 w-full" />
                  ) : (
                    <>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Truck className="h-4 w-4 text-emerald-600" />
                        <p className="text-xs font-medium">Surat Jalan</p>
                      </div>
                      <p className="text-base md:text-2xl font-bold mt-2 text-stone-900 dark:text-zinc-100">{s?.ops.sjCount ?? 0}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">dibuat bulan ini</p>
                    </>
                  )}
                </CardContent>
              </Card>
            </button>
          )}
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
                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ left: 4, right: 8, top: 8 }}>
                      <defs>
                        <linearGradient id="gBar" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                          <stop offset="100%" stopColor="#059669" stopOpacity={0.75} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e7e5e4" className="dark:opacity-20" />
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
                        width={48}
                        tickLine={false}
                        axisLine={false}
                        fontSize={10}
                        stroke="#78716c"
                        tickFormatter={(v: number) => compactIDR(v)}
                      />
                      <RTooltip cursor={{ fill: 'rgba(5, 150, 105, 0.07)' }} content={<ChartTip />} />
                      <Bar dataKey="value" fill="url(#gBar)" radius={[6, 6, 0, 0]} maxBarSize={38} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
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
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <RTooltip content={<ChartTip />} />
                        <Pie data={statusData} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={2} strokeWidth={0}>
                          {statusData.map((d) => (
                            <Cell key={d.name} fill={d.fill} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
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
                        <span className="text-[11px] text-muted-foreground w-9 text-right">{Math.round((d.value / statusTotal) * 100)}%</span>
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
                            <p className="text-sm font-medium truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">{c.name}</p>
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
                            <p className="text-sm font-medium truncate">{it.name}</p>
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <OpsCard
              loading={loading}
              icon={Truck}
              label="Surat Jalan"
              value={`${s?.ops.sjCount ?? 0}`}
              hint="dibuat bulan ini"
              onClick={() => navigate('/surat-jalan')}
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
              tone={s?.cards.dueSoonCount ? 'amber' : 'stone'}
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
                  onClick={() => navigate('/riwayat')}
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
                </div>
              ) : (
                <ul className="divide-y divide-stone-100 max-h-[420px] overflow-y-auto scrollbar-thin dark:divide-zinc-800">
                  {s.recent.map((inv) => (
                    <li key={inv.id}>
                      <button
                        onClick={() => openPreview(inv)}
                        className="w-full flex items-center gap-3 px-2 md:px-3 py-3 rounded-lg hover:bg-stone-50 dark:hover:bg-zinc-800 transition-colors text-left min-h-[52px]"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{inv.number}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {inv.customerName} · {formatTanggalID(inv.date)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold tabular-nums">{formatRupiah(inv.total)}</p>
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
                        onClick={() => openPreview(d)}
                        className="w-full flex items-center gap-3 px-2 md:px-3 py-3 rounded-lg hover:bg-stone-50 dark:hover:bg-zinc-800 transition-colors text-left min-h-[52px]"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{d.number}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {d.customerName} · tempo {formatTanggalID(d.dueDate)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold tabular-nums">{formatRupiah(d.sisa)}</p>
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
            <QuickLink icon={ReceiptText} title="Riwayat Invoice" desc="Cari, export Excel/PDF, kirim WA" onClick={() => navigate('/riwayat')} />
            <QuickLink icon={Truck} title="Surat Jalan" desc="Dokumen pengiriman barang" onClick={() => navigate('/surat-jalan')} />
            {canSeeFinance && (
              <QuickLink icon={ClipboardList} title="Purchase Order" desc="Pesan barang ke supplier" onClick={() => navigate('/purchase-order')} />
            )}
          </div>
        </section>

        {/* ===== PREVIEW DIALOG — Invoice A5 popup ===== */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent
            className="max-w-none w-auto overflow-hidden p-2 pt-10 gap-0 [&_button]:cursor-default"
            style={{
              width: `${576 * previewScale + 16}px`,
              maxHeight: `calc(100dvh - 32px)`,
            }}
            aria-label="Pratinjau Invoice"
          >
            <DialogHeader className="sr-only">
              <DialogTitle>Pratinjau Invoice</DialogTitle>
              <DialogDescription>Preview detail invoice dalam format A5</DialogDescription>
            </DialogHeader>

            {previewData && (
              <div className="flex flex-col items-center gap-3">
                <div
                  style={{
                    width: `${576 * previewScale}px`,
                    height: `${576 * (210 / 148) * previewScale}px`,
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: 576,
                      height: 576 * (210 / 148),
                      transform: `scale(${previewScale})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    <div className="bg-white" style={{ width: 576, height: 576 * (210 / 148) }}>
                      <div className="a5-preview-scaler">
                        <InvoicePreview data={previewData} />
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleSendPdf}
                  disabled={sendingPdf}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 cursor-default text-white text-sm font-medium transition-colors flex-shrink-0"
                >
                  {sendingPdf ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                  )}
                  Kirim via WhatsApp
                </button>
              </div>
            )}
          </DialogContent>
        </Dialog>
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
  icon: typeof Truck
  label: string
  value: string
  hint: string
  onClick: () => void
  loading?: boolean
  tone?: 'emerald' | 'amber' | 'stone'
}) {
  return (
    <button onClick={onClick} className="text-left">
      <Card
        className={`p-0 gap-0 h-full transition-colors dark:border-zinc-800 ${
          tone === 'amber'
            ? 'hover:border-amber-300 hover:bg-amber-50/30 dark:hover:border-amber-900 dark:hover:bg-amber-950/20'
            : tone === 'stone'
              ? 'hover:border-stone-300 dark:hover:border-zinc-700'
              : 'hover:border-emerald-300 hover:bg-emerald-50/30 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20'
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
      className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50/50 min-h-[60px] dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-stone-900 dark:text-zinc-100">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{desc}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-stone-400 dark:text-zinc-600" />
    </button>
  )
}

/** Badge tipe invoice: DP = biru muda, lainnya stone */
function TypeBadge({ type }: { type: string }) {
  const isDp = type === 'DP'
  return (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0 shrink-0 ${
        isDp
          ? 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-50 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300'
          : 'border-stone-300 bg-stone-50 text-stone-600 hover:bg-stone-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
      }`}
    >
      {type}
    </Badge>
  )
}

/**
 * Badge status invoice. Warna (spesifikasi user):
 * Lunas → hijau, Belum Lunas → oranye, Jatuh Tempo → merah.
 */
function StatusBadge({ status, dueDate }: { status: 'LUNAS' | 'BELUM'; dueDate: string }) {
  if (status === 'BELUM' && dueDate && new Date(`${dueDate}T00:00:00`).getTime() < startOfToday()) {
    return (
      <Badge
        variant="outline"
        className="bg-red-50 text-red-700 border-red-200 text-[10px] px-1.5 py-0 shrink-0 dark:bg-red-950 dark:text-red-300 dark:border-red-900"
      >
        Jatuh Tempo
      </Badge>
    )
  }
  if (status === 'LUNAS') {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900 text-[10px] px-1.5 py-0 shrink-0">
        Lunas
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className="bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-50 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900 text-[10px] px-1.5 py-0 shrink-0"
      title={dueDate ? `Jatuh tempo ${dueDate}` : undefined}
    >
      Belum Lunas
    </Badge>
  )
}
