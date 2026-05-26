'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { useLanguage } from '@/contexts/language-context'
import { useAuth } from '@/contexts/auth-context'
import { authFetch } from '@/lib/auth-fetch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

        {/* Document Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <DocCard
            icon={<FileText className="w-5 h-5" />}
            label="Invoice"
            count={invoiceHistory.length}
            total={summary?.totals.invoice ?? 0}
            color="blue"
            loading={loading}
          />
          <DocCard
            icon={<Truck className="w-5 h-5" />}
            label="Surat Jalan"
            count={suratJalanHistory.length}
            color="teal"
            loading={loading}
          />
          <DocCard
            icon={<ShoppingCart className="w-5 h-5" />}
            label="Purchase Order"
            count={poHistory.length}
            total={summary?.totals.purchaseOrder ?? 0}
            color="orange"
            loading={loading}
          />
        </div>

        {/* Riwayat Sections */}
        <div className="space-y-3">
          {/* Hitung Cetakan */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                Riwayat Hitung Cetakan
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                  {recent?.cetakan?.length ?? 0}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <TableSkeleton /> : (
                recent?.cetakan && recent.cetakan.length > 0 ? (
                  <div className="rounded-lg border bg-white max-h-[400px] overflow-auto -mx-4 px-4 md:mx-0 md:px-0">
                    <Table className="min-w-[700px]">
                      <TableHeader>
                        <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                          <TableHead className="w-10 text-[11px] font-semibold text-gray-500">No</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">Tgl</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">Customer</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">Nama Barang</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">Uang Capek</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">Finishing</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold text-gray-500">Jml Pesanan</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold text-gray-500">Harga/Pcs</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold text-gray-500">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recent.cetakan.map((r, idx) => {
                          const qty = parseInt(r.jumlahPesanan || '0')
                          const hargaPcs = qty > 0 ? Math.round((r.grandTotal || 0) / qty) : 0
                          return (
                            <TableRow key={r.id} className="group">
                              <TableCell className="py-2.5 text-xs text-gray-400">{idx + 1}</TableCell>
                              <TableCell className="py-2.5 text-xs text-gray-500 whitespace-nowrap">{formatDateShort(r.createdAt)}</TableCell>
                              <TableCell className="py-2.5 text-xs text-gray-700 font-medium max-w-[100px] truncate">{r.customerName || '-'}</TableCell>
                              <TableCell className="py-2.5 text-xs text-gray-700 max-w-[200px] truncate" title={r.printName || ''}>{r.printName || '-'}</TableCell>
                              <TableCell className="py-2.5 text-xs text-gray-700 whitespace-nowrap">
                                {r.profitAmount > 0 ? formatRupiah(r.profitAmount) : '-'}
                              </TableCell>
                              <TableCell className="py-2.5 text-xs text-gray-700 max-w-[150px] truncate" title={r.finishingNames || ''}>
                                {r.finishingNames || '-'}
                              </TableCell>
                              <TableCell className="py-2.5 text-xs text-right text-gray-700">{qty.toLocaleString('id-ID')}</TableCell>
                              <TableCell className="py-2.5 text-xs text-right text-gray-700">{hargaPcs > 0 ? formatRupiah(hargaPcs) : '-'}</TableCell>
                              <TableCell className="py-2.5 text-xs text-right font-medium text-emerald-700 whitespace-nowrap">{formatRupiah(r.grandTotal || 0)}</TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : <EmptyState />
              )}
            </CardContent>
          </Card>

          {/* Potong Kertas */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Scissors className="w-4 h-4 text-slate-400" />
                Riwayat Potong Kertas
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                  {recent?.potongKertas?.length ?? 0}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <TableSkeleton /> : (
                recent?.potongKertas && recent.potongKertas.length > 0 ? (
                  <div className="rounded-lg border bg-white max-h-[400px] overflow-auto -mx-4 px-4 md:mx-0 md:px-0">
                    <Table className="min-w-[650px]">
                      <TableHeader>
                        <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                          <TableHead className="w-10 text-[11px] font-semibold text-gray-500">No</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">Tgl</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">Customer</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">Barang</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">Kertas</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">Uk. Kertas</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">Uk. Potong</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold text-gray-500">Jml</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold text-gray-500">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recent.potongKertas.map((r, idx) => (
                          <TableRow key={r.id} className="group">
                            <TableCell className="py-2.5 text-xs text-gray-400">{idx + 1}</TableCell>
                            <TableCell className="py-2.5 text-xs text-gray-500 whitespace-nowrap">{formatDateShort(r.createdAt)}</TableCell>
                            <TableCell className="py-2.5 text-xs text-gray-700 font-medium max-w-[100px] truncate">{r.namaCustomer || '-'}</TableCell>
                            <TableCell className="py-2.5 text-xs text-gray-700 max-w-[120px] truncate">{r.namaCetakan || '-'}</TableCell>
                            <TableCell className="py-2.5 text-xs text-gray-700 max-w-[100px] truncate">{r.paperName || '-'}</TableCell>
                            <TableCell className="py-2.5 text-xs text-gray-500 whitespace-nowrap">
                              {r.paperWidth && r.paperWidth !== '0' ? `${r.paperWidth}×${r.paperHeight}` : '-'}
                            </TableCell>
                            <TableCell className="py-2.5 text-xs text-gray-500 whitespace-nowrap">
                              {r.cutWidth && r.cutWidth !== '0' ? `${r.cutWidth}×${r.cutHeight}` : '-'}
                            </TableCell>
                            <TableCell className="py-2.5 text-xs text-right text-gray-700">{parseInt(r.jumlahPesanan || '0').toLocaleString('id-ID')}</TableCell>
                            <TableCell className="py-2.5 text-xs text-right font-medium text-emerald-700 whitespace-nowrap">{formatRupiah(r.totalPrice || 0)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : <EmptyState />
              )}
            </CardContent>
          </Card>

          {/* Invoice */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" />
                Riwayat Invoice
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                  {invoiceHistory.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {docLoading ? <TableSkeleton /> : (
                invoiceHistory.length > 0 ? (
                  <div className="rounded-lg border bg-white max-h-[400px] overflow-auto -mx-4 px-4 md:mx-0 md:px-0">
                    <Table className="min-w-[650px]">
                      <TableHeader>
                        <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                          <TableHead className="w-10 text-[11px] font-semibold text-gray-500">No</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">No. Dokumen</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">Tanggal</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">Nama Customer</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">Nama Barang</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold text-gray-500">Qty</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold text-gray-500">Harga Satuan</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold text-gray-500">Total Harga</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoiceHistory.map((entry, i) => {
                          const info = parseDocInfo(entry)
                          return (
                            <TableRow key={entry.id} className="group">
                              <TableCell className="py-2.5 text-xs text-gray-400">{i + 1}</TableCell>
                              <TableCell className="py-2.5 text-xs font-medium text-gray-900 whitespace-nowrap">{entry.nomor}</TableCell>
                              <TableCell className="py-2.5 text-xs text-gray-500 whitespace-nowrap">{entry.tanggal ? formatTanggal(entry.tanggal) : '-'}</TableCell>
                              <TableCell className="py-2.5 text-xs text-gray-600 max-w-[120px] truncate">{entry.pihakKedua}</TableCell>
                              <TableCell className="py-2.5 text-xs text-gray-700 max-w-[160px] truncate" title={info.namaBarang}>{info.namaBarang ? info.namaBarang.split('\n')[0] : '-'}</TableCell>
                              <TableCell className="py-2.5 text-xs text-right text-gray-700">{info.totalQty > 0 ? info.totalQty.toLocaleString('id-ID') : '-'}</TableCell>
                              <TableCell className="py-2.5 text-xs text-right text-gray-700">{info.hargaSatuan > 0 ? formatRupiah(info.hargaSatuan) : '-'}</TableCell>
                              <TableCell className="py-2.5 text-xs text-right font-medium text-emerald-700 whitespace-nowrap">{info.totalHarga > 0 ? formatRupiah(info.totalHarga) : '-'}</TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : <EmptyState />
              )}
            </CardContent>
          </Card>

          {/* Surat Jalan */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Truck className="w-4 h-4 text-slate-400" />
                Riwayat Surat Jalan
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                  {suratJalanHistory.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {docLoading ? <TableSkeleton /> : (
                suratJalanHistory.length > 0 ? (
                  <div className="rounded-lg border bg-white max-h-[400px] overflow-auto -mx-4 px-4 md:mx-0 md:px-0">
                    <Table className="min-w-[450px]">
                      <TableHeader>
                        <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                          <TableHead className="w-10 text-[11px] font-semibold text-gray-500">No</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">No. Dokumen</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">Tanggal</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">Customer</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {suratJalanHistory.map((entry, i) => (
                          <TableRow key={entry.id} className="group">
                            <TableCell className="py-2.5 text-xs text-gray-400">{i + 1}</TableCell>
                            <TableCell className="py-2.5 text-xs font-medium text-gray-900 whitespace-nowrap">{entry.nomor}</TableCell>
                            <TableCell className="py-2.5 text-xs text-gray-500 whitespace-nowrap">{entry.tanggal ? formatTanggal(entry.tanggal) : '-'}</TableCell>
                            <TableCell className="py-2.5 text-xs text-gray-600 max-w-[200px] truncate">{entry.pihakKedua}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : <EmptyState />
              )}
            </CardContent>
          </Card>

          {/* Purchase Order */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-slate-400" />
                Riwayat Purchase Order
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                  {poHistory.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {docLoading ? <TableSkeleton /> : (
                poHistory.length > 0 ? (
                  <div className="rounded-lg border bg-white max-h-[400px] overflow-auto -mx-4 px-4 md:mx-0 md:px-0">
                    <Table className="min-w-[650px]">
                      <TableHeader>
                        <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                          <TableHead className="w-10 text-[11px] font-semibold text-gray-500">No</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">No. Dokumen</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">Tanggal</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">Pemasok</TableHead>
                          <TableHead className="text-[11px] font-semibold text-gray-500">Nama Barang</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold text-gray-500">Qty</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold text-gray-500">Harga Satuan</TableHead>
                          <TableHead className="text-right text-[11px] font-semibold text-gray-500">Total Harga</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {poHistory.map((entry, i) => {
                          const info = parseDocInfo(entry)
                          return (
                            <TableRow key={entry.id} className="group">
                              <TableCell className="py-2.5 text-xs text-gray-400">{i + 1}</TableCell>
                              <TableCell className="py-2.5 text-xs font-medium text-gray-900 whitespace-nowrap">{entry.nomor}</TableCell>
                              <TableCell className="py-2.5 text-xs text-gray-500 whitespace-nowrap">{entry.tanggal ? formatTanggal(entry.tanggal) : '-'}</TableCell>
                              <TableCell className="py-2.5 text-xs text-gray-600 max-w-[120px] truncate">{entry.pihakKedua}</TableCell>
                              <TableCell className="py-2.5 text-xs text-gray-700 max-w-[160px] truncate" title={info.namaBarang}>{info.namaBarang ? info.namaBarang.split('\n')[0] : '-'}</TableCell>
                              <TableCell className="py-2.5 text-xs text-right text-gray-700">{info.totalQty > 0 ? info.totalQty.toLocaleString('id-ID') : '-'}</TableCell>
                              <TableCell className="py-2.5 text-xs text-right text-gray-700">{info.hargaSatuan > 0 ? formatRupiah(info.hargaSatuan) : '-'}</TableCell>
                              <TableCell className="py-2.5 text-xs text-right font-medium text-emerald-700 whitespace-nowrap">{info.totalHarga > 0 ? formatRupiah(info.totalHarga) : '-'}</TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : <EmptyState />
              )}
            </CardContent>
          </Card>
        </div>
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
