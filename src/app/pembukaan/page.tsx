'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart3,
  Calculator,
  ChevronRight,
  Clock,
  ReceiptText,
  Scissors,
  Sparkles,
  Truck,
  Users,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { DashboardLayout } from '@/components/dashboard-layout'
import { authFetch } from '@/lib/auth-fetch'
import { formatRupiah } from '@/lib/format'
import { startNavigation } from '@/components/navigation-progress'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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

interface BerandaData {
  user: { name: string; role: string }
  stats: BerandaStats
  chart: BerandaChartItem[]
  recent: BerandaInvoiceItem[]
  due: BerandaDueItem[]
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

export default function PembukaanPage() {
  const router = useRouter()
  const [data, setData] = useState<BerandaData | null>(null)
  const [loading, setLoading] = useState(true)

  // Popup pratinjau invoice A5
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewItem, setPreviewItem] = useState<BerandaInvoiceItem | BerandaDueItem | null>(null)
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

  const openPreview = (item: BerandaInvoiceItem | BerandaDueItem) => {
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

  const summaryCards = [
    {
      label: 'Total Penjualan',
      value: s ? formatRupiah(s.stats.totalPenjualan) : 'Rp0',
      hint: 'Semua invoice',
      icon: BarChart3,
      cardClass: 'border-stone-200 dark:border-zinc-800',
      iconBg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
      valueClass: 'text-stone-900 dark:text-stone-100',
      path: '/laporan/penjualan',
      aria: 'Buka Laporan Penjualan',
    },
    {
      label: 'Total Piutang',
      value: s ? formatRupiah(s.stats.totalPiutang) : 'Rp0',
      hint: 'Sisa tagihan DP',
      icon: Clock,
      cardClass: 'border-amber-200 dark:border-amber-900',
      iconBg: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
      valueClass: 'text-amber-700 dark:text-amber-400',
      path: '/riwayat-pembayaran',
      aria: 'Buka Riwayat Pembayaran',
    },
    {
      label: 'Invoice Belum Lunas',
      value: s ? String(s.stats.invoiceBelumLunas) : '0',
      hint: 'Perlu ditindaklanjuti',
      icon: ReceiptText,
      cardClass: 'border-stone-200 dark:border-zinc-800',
      iconBg: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
      valueClass: 'text-stone-900 dark:text-stone-100',
      path: '/riwayat',
      aria: 'Buka Riwayat Dokumen',
    },
    {
      label: 'Total Pelanggan',
      value: s ? String(s.stats.totalPelanggan) : '0',
      hint: 'Master customer',
      icon: Users,
      cardClass: 'border-stone-200 dark:border-zinc-800',
      iconBg: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
      valueClass: 'text-stone-900 dark:text-stone-100',
      path: '/master-customer',
      aria: 'Buka Master Customer',
    },
  ]

  const quickActions = [
    { label: 'Potong Kertas', desc: 'Hitung pemakaian kertas', icon: Scissors, path: '/potong-kertas' },
    { label: 'Hitung Cetakan', desc: 'Estimasi biaya cetak', icon: Calculator, path: '/hitung-cetakan' },
    { label: 'Invoice', desc: 'Buat & kelola invoice', icon: ReceiptText, path: '/invoice' },
    { label: 'Surat Jalan', desc: 'Dokumen pengiriman', icon: Truck, path: '/surat-jalan' },
    { label: 'Master Customer', desc: 'Data pelanggan', icon: Users, path: '/master-customer' },
    { label: 'Laporan Penjualan', desc: 'Rekap penjualan', icon: BarChart3, path: '/laporan/penjualan' },
  ]

  return (
    <DashboardLayout title="Beranda">
      <div className="space-y-5 md:space-y-6">
        {/* ===== HERO: greeting + role + tanggal ===== */}
        <div className="rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-700 p-5 md:p-7 text-white shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg md:text-2xl font-bold tracking-tight">
              {greeting}
              {s?.user?.name ? `, ${s.user.name}` : ''} 👋
            </h1>
            {s?.user?.role && (
              <Badge className="bg-white/20 text-white border border-white/30 hover:bg-white/20">
                {ROLE_LABEL[s.user.role] ?? s.user.role}
              </Badge>
            )}
          </div>
          <p className="text-emerald-50/90 text-xs md:text-sm mt-1">{todayLabel}</p>

          {/* Motivasi Hari Ini */}
          <div className="mt-4 bg-white/10 border border-white/20 rounded-xl px-3.5 py-3 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-300/90 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4 text-amber-800" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-50/80 mb-0.5">Motivasi Hari Ini</p>
              <p className="text-[13px] sm:text-[15px] text-white font-bold italic leading-relaxed">&ldquo;{motivasiHariIni}&rdquo;</p>
            </div>
          </div>
        </div>

        {/* ===== RINGKASAN: 4 kartu ===== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {loading
            ? [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)
            : summaryCards.map((c) => (
                <div key={c.label} className="h-full">
                  <button
                    onClick={() => navigate(c.path)}
                    aria-label={c.aria}
                    className="block w-full h-full text-left rounded-xl border bg-white dark:bg-zinc-900 p-4 transition-colors hover:border-emerald-300 dark:hover:border-emerald-800"
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2.5 ${c.iconBg}`}>
                      <c.icon className="w-4.5 h-4.5" />
                    </div>
                    <p className="text-[11px] font-medium text-muted-foreground leading-snug">{c.label}</p>
                    <p className={`text-base md:text-xl font-bold mt-0.5 break-words leading-tight ${c.valueClass}`}>{c.value}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-snug">{c.hint}</p>
                  </button>
                </div>
              ))}
        </div>

        {/* ===== GRAFIK AKTIVITAS 14 HARI ===== */}
        <Card className="border-stone-200 dark:border-zinc-800">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <CardTitle className="text-sm">Grafik Aktivitas 14 Hari</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Nilai invoice & pembayaran per hari</p>
              </div>
              <div className="flex items-center gap-3 shrink-0 text-[10px] sm:text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Penjualan
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Pembayaran
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            {loading ? (
              <Skeleton className="h-56 w-full rounded-lg" />
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={s?.chart ?? []} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gPenjualan" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gPembayaran" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#78716c' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#78716c' }}
                      tickLine={false}
                      axisLine={false}
                      width={56}
                      tickFormatter={(v: number) => (v >= 1_000_000 ? `${v / 1_000_000}jt` : v >= 1_000 ? `${v / 1_000}rb` : String(v))}
                    />
                    <Tooltip
                      formatter={(value: number | string, name: string) => [formatRupiah(Number(value)), name === 'penjualan' ? 'Penjualan' : 'Pembayaran']}
                      labelFormatter={(label: string) => `Hari: ${label}`}
                      contentStyle={{ borderRadius: 10, border: '1px solid #e7e5e4', fontSize: 12 }}
                    />
                    <Area type="monotone" dataKey="penjualan" stroke="#10b981" strokeWidth={2} fill="url(#gPenjualan)" />
                    <Area type="monotone" dataKey="pembayaran" stroke="#f59e0b" strokeWidth={2} fill="url(#gPembayaran)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ===== AKSI CEPAT: 6 kartu operasional ===== */}
        <section aria-label="Aksi Cepat">
          <h2 className="text-sm font-semibold mb-2.5">Aksi Cepat</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
            {quickActions.map((a) => (
              <div key={a.label} className="h-full">
                <button
                  onClick={() => navigate(a.path)}
                  aria-label={`Buka ${a.label}`}
                  className="block w-full h-full text-left rounded-xl border border-stone-200 bg-white p-3 sm:p-4 transition-colors hover:border-emerald-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-emerald-800"
                >
                  <div className="flex items-start justify-between gap-2.5 sm:gap-3">
                    <div className="w-8 h-8 sm:h-9 sm:w-9 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center shrink-0">
                      <a.icon className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                    </div>
                    <ChevronRight className="hidden sm:block w-4 h-4 text-stone-400 dark:text-zinc-600 shrink-0" aria-hidden="true" />
                  </div>
                  <p className="text-xs sm:text-sm font-semibold mt-2.5 leading-snug">{a.label}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 leading-snug">{a.desc}</p>
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* ===== INVOICE TERBARU ===== */}
        <Card className="border-stone-200 dark:border-zinc-800">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <CardTitle className="text-sm">Invoice Terbaru</CardTitle>
              <button
                className="text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 text-xs font-medium h-8 inline-flex items-center gap-0.5"
                onClick={() => navigate('/riwayat')}
              >
                Lihat semua <ChevronRight className="h-3.5 w-3.5" />
              </button>
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
              <ul className="divide-y divide-stone-100 max-h-[420px] overflow-y-auto dark:divide-zinc-800">
                {s.recent.map((inv) => (
                  <li key={inv.id}>
                    <button
                      onClick={() => openPreview(inv)}
                      className="w-full flex items-center gap-2.5 sm:gap-3 px-2 md:px-3 py-3 rounded-lg hover:bg-stone-50 transition-colors text-left min-h-[52px] dark:hover:bg-zinc-800"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{inv.number}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {inv.customerName} · {formatTanggalID(inv.date)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <p className="text-sm font-semibold tabular-nums">{formatRupiah(inv.total)}</p>
                        <div className="flex items-center gap-1">
                          {inv.type !== 'REGULER' && <TypeBadge type={inv.type} />}
                          <StatusBadge status={inv.status} dueDate={inv.dueDate} />
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ===== JATUH TEMPO ===== */}
        {!loading && (s?.due?.length ?? 0) > 0 && (
          <Card className="border-amber-200 dark:border-amber-900">
            <CardHeader className="pb-1">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <CardTitle className="text-sm">Jatuh Tempo</CardTitle>
                <span className="text-xs text-muted-foreground">{s?.due.length} invoice perlu ditagih</span>
              </div>
            </CardHeader>
            <CardContent className="px-2 md:px-3 pb-3">
              <ul className="divide-y divide-amber-100 max-h-[320px] overflow-y-auto dark:divide-amber-950">
                {s?.due.map((d) => (
                  <li key={d.id}>
                    <button
                      onClick={() => openPreview(d)}
                      className="w-full flex items-center gap-2.5 sm:gap-3 px-2 md:px-3 py-2.5 rounded-lg hover:bg-amber-50 transition-colors text-left dark:hover:bg-zinc-800"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{d.number}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {d.customerName} · jatuh tempo {formatTanggalID(d.dueDate)}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap">{formatRupiah(d.sisa)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

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

/** Badge tipe invoice: DP = biru muda, lainnya emerald */
function TypeBadge({ type }: { type: string }) {
  const isDp = type === 'DP'
  return (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0 ${
        isDp
          ? 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-50 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
      }`}
    >
      {type}
    </Badge>
  )
}

/** Badge status: Lunas hijau, Belum Lunas oranye + info jatuh tempo */
function StatusBadge({ status, dueDate }: { status: 'LUNAS' | 'BELUM'; dueDate: string }) {
  if (status === 'LUNAS') {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900 text-[10px] px-1.5 py-0">
        Lunas
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className="bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-50 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900 text-[10px] px-1.5 py-0"
      title={dueDate ? `Jatuh tempo ${dueDate}` : undefined}
    >
      Belum Lunas
    </Badge>
  )
}
