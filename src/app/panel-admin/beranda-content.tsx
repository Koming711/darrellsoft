'use client'

// Konten BERANDA ADMIN panel admin — ringkasan (dashboard admin langganan):
// total akun, pelanggan aktif/kedaluwarsa, pembayaran menunggu verifikasi.
// total pendapatan disetujui, pendapatan bulan ini, pelanggan per paket.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { authFetch } from '@/lib/auth-fetch'
import { useLiveData } from '@/hooks/use-live-data'
import { LiveIndicator } from './live-indicator'
import { toast } from 'sonner'
import {
  Users,
  UserCheck,
  UserX,
  ShieldAlert,
  Wallet,
  CalendarRange,
  PackageOpen,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react'

const rupiah = (n: number) => `Rp ${Math.round(n ?? 0).toLocaleString('id-ID')}`
const fmtDateTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'

interface Stats {
  totalAkun: number
  pelangganAktif: number
  pelangganAkanBerakhir: number
  pelangganKedaluwarsa: number
  pelangganDitangguhkan: number
  pelangganBelumAktif: number
  pembayaranMenungguVerifikasi: number
  totalPendapatan: number
  pendapatanBulanIni: number
  tagihanMenungguPembayaran: number
  pelangganPerPaket: { planId: string; name: string; count: number }[]
  pendingPaymentList: { id: string; invoiceNumber: string; planName: string; amount: number; paymentMethod: string; createdAt: string }[]
  recentApproved: { id: string; invoiceNumber: string; planName: string; amount: number; reviewedAt: string | null }[]
}

export function BerandaContent() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const pendingRef = useRef<number | null>(null)

  const load = async () => {
    try {
      const res = await authFetch('/api/panel-admin/subscription-stats')
      const json = await res.json()
      if (!res.ok) {
        // Pemuatan awal gagal → tampilkan pesan; refresh silent senyap saja
        if (loading) toast.error(json.error || 'Gagal memuat ringkasan')
        return
      }
      setStats(json)
      // Notifikasi real-time: pembayaran baru masuk menunggu verifikasi
      const cnt = (json as Stats)?.pembayaranMenungguVerifikasi ?? 0
      if (pendingRef.current !== null && cnt > pendingRef.current) {
        toast.info(`${cnt - pendingRef.current} pembayaran baru menunggu verifikasi`, {
          description: 'Data panel diperbarui otomatis.',
        })
      }
      pendingRef.current = cnt
    } catch {
      if (loading) toast.error('Gagal terhubung ke server')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Data masuk real-time: segarkan otomatis tiap 10 detik saat halaman terlihat
  const { lastUpdated } = useLiveData({ load, intervalMs: 10000 })

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Beranda Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">Kondisi langganan & pendapatan Darrellsoft.</p>
        </div>
        <LiveIndicator lastUpdated={lastUpdated} />
      </div>

      {/* Alert verifikasi tertunda */}
      {stats && stats.pembayaranMenungguVerifikasi > 0 && (
        <Alert className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
          <ShieldAlert className="h-5 w-5 text-amber-600" />
          <AlertTitle>
            {stats.pembayaranMenungguVerifikasi} pembayaran menunggu verifikasi
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>Pembayaran tidak mengaktifkan langganan sebelum Anda menyetujuinya.</span>
            <Link href="/panel-admin?tab=pembayaran&sub=verifikasi" className="inline-flex items-center gap-1 font-semibold text-amber-800 underline dark:text-amber-300">
              Verifikasi sekarang <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* Kartu statistik utama */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Total Akun Terdaftar" value={stats?.totalAkun ?? 0} tint="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" />
        <StatCard icon={UserCheck} label="Pelanggan Aktif" value={stats?.pelangganAktif ?? 0} sub={stats ? `${stats.pelangganAkanBerakhir} akan berakhir` : ''} tint="bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" />
        <StatCard icon={UserX} label="Pelanggan Kedaluwarsa" value={stats?.pelangganKedaluwarsa ?? 0} sub={stats ? `${stats.pelangganDitangguhkan} ditangguhkan` : ''} tint="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" />
        <StatCard icon={ShieldAlert} label="Menunggu Verifikasi" value={stats?.pembayaranMenungguVerifikasi ?? 0} sub={stats ? `${stats.tagihanMenungguPembayaran} tagihan belum dibayar` : ''} tint="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" />
        <StatCard icon={Wallet} label="Total Pendapatan Disetujui" value={rupiah(stats?.totalPendapatan ?? 0)} tint="bg-emerald-600 text-white" />
        <StatCard icon={CalendarRange} label="Pendapatan Bulan Ini" value={rupiah(stats?.pendapatanBulanIni ?? 0)} tint="bg-slate-800 text-white dark:bg-slate-700" />
        <StatCard icon={UserCheck} label="Belum Aktif" value={stats?.pelangganBelumAktif ?? 0} sub="akun tanpa langganan aktif" tint="bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" />
        <StatCard icon={PackageOpen} label="Tagihan Terbuka" value={stats?.tagihanMenungguPembayaran ?? 0} sub="menunggu pembayaran pelanggan" tint="bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Pelanggan per paket */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pelanggan per Paket</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(stats?.pelangganPerPaket ?? []).map((p) => {
              const total = Math.max(1, (stats?.pelangganAktif ?? 0) + (stats?.pelangganAkanBerakhir ?? 0))
              const pct = Math.min(100, Math.round(((p.count ?? 0) / total) * 100))
              return (
                <div key={p.planId}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-muted-foreground">{p.count} pelanggan</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
            {(stats?.pelangganPerPaket ?? []).length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">Belum ada paket.</p>
            )}
          </CardContent>
        </Card>

        {/* Pembayaran menunggu verifikasi */}
        <Card className="rounded-2xl">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Pembayaran Menunggu Verifikasi</CardTitle>
            <Link href="/panel-admin?tab=pembayaran&sub=verifikasi" className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              Lihat semua
            </Link>
          </CardHeader>
          <CardContent>
            {(stats?.pendingPaymentList ?? []).length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Tidak ada antrean verifikasi. 🎉</p>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {stats!.pendingPaymentList.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{p.invoiceNumber}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.planName} · {p.paymentMethod === 'qris' ? 'QRIS' : 'Transfer Bank'} · {fmtDateTime(p.createdAt)}
                      </div>
                    </div>
                    <div className="shrink-0 text-sm font-bold">{rupiah(p.amount)}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Terakhir disetujui */}
      <Card className="rounded-2xl">
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Pembayaran Terakhir Disetujui</CardTitle>
          <Link href="/panel-admin?tab=transaksi" className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            Riwayat lengkap
          </Link>
        </CardHeader>
        <CardContent>
          {(stats?.recentApproved ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Belum ada pembayaran disetujui.</p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {stats!.recentApproved.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{p.invoiceNumber}</div>
                      <div className="text-xs text-muted-foreground">{p.planName} · {fmtDateTime(p.reviewedAt)}</div>
                    </div>
                  </div>
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">
                    {rupiah(p.amount)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  sub?: string
  tint: string
}) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tint}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs text-muted-foreground">{label}</div>
          <div className="truncate text-xl font-extrabold tracking-tight">{value}</div>
          {sub && <div className="truncate text-[10px] text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  )
}
