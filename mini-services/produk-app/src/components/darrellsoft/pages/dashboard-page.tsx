'use client'

import * as React from 'react'
import {
  AlertCircle,
  ArrowRight,
  FileText,
  Package,
  Tags,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { api } from '@/lib/client-api'
import type { DashboardDTO, InvoiceStatus } from '@/lib/types'
import { useAppStore } from '@/store/app-store'
import { useToast } from '@/hooks/use-toast'
import { formatDateID, formatNumberID, formatRp } from '@/lib/money'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const HEAD_CELL = 'bg-zinc-50 px-3 py-2.5 text-xs uppercase tracking-wide text-muted-foreground'
const BODY_CELL = 'px-3 py-2.5'

function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  if (status === 'PAID') {
    return (
      <Badge variant="outline" className="border-emerald-200 bg-emerald-100 text-emerald-800">
        Lunas
      </Badge>
    )
  }
  if (status === 'PARTIAL') {
    return (
      <Badge variant="outline" className="border-teal-200 bg-teal-100 text-teal-800">
        Sebagian
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-amber-200 bg-amber-100 text-amber-800">
      Belum Dibayar
    </Badge>
  )
}

export default function DashboardPage() {
  const { toast } = useToast()
  const companyId = useAppStore((s) => s.companyId)
  const userId = useAppStore((s) => s.userId)
  const [data, setData] = React.useState<DashboardDTO | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshTick, setRefreshTick] = React.useState(0)

  // Muat data dashboard (reload saat sesi perusahaan/pengguna berubah)
  React.useEffect(() => {
    if (!companyId || !userId) return
    let cancelled = false
    setLoading(true)
    api<DashboardDTO>('/api/dashboard')
      .then((d) => {
        if (cancelled) return
        setData(d)
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        toast({ title: 'Gagal memuat dashboard', description: (e as Error).message, variant: 'destructive' })
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [companyId, userId, refreshTick, toast])

  if (loading && !data) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title="Dashboard" description="Ringkasan aktivitas penjualan perusahaan Anda." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader title="Dashboard" description="Ringkasan aktivitas penjualan perusahaan Anda." />
        <div className="rounded-lg border bg-white">
          <EmptyState
            icon={AlertCircle}
            title="Tidak dapat memuat data dashboard"
            description="Terjadi kesalahan saat mengambil data. Silakan coba lagi."
            action={{ label: 'Coba lagi', onClick: () => setRefreshTick((t) => t + 1) }}
          />
        </div>
      </div>
    )
  }

  const s = data.stats

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Dashboard" description="Ringkasan aktivitas penjualan perusahaan Anda." />

      {/* Kartu statistik */}
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Customer" value={formatNumberID(s.customerCount)} icon={Users} />
          <StatCard title="Produk" value={formatNumberID(s.productCount)} icon={Package} />
          <StatCard
            title="Harga Khusus Aktif"
            value={formatNumberID(s.activePriceCount)}
            icon={Tags}
            hint="Harga customer yang sedang berlaku"
          />
          <StatCard title="Invoice Bulan Ini" value={formatNumberID(s.invoiceMonthCount)} icon={FileText} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard title="Pendapatan Bulan Ini" value={formatRp(s.revenueMonth)} icon={Wallet} tone="emerald" />
          <StatCard
            title="Margin Bulan Ini"
            value={formatRp(s.marginMonth)}
            icon={TrendingUp}
            tone="emerald"
            hint="Pendapatan − harga pokok"
          />
          <StatCard
            title="Piutang"
            value={formatRp(s.receivables)}
            icon={AlertCircle}
            tone="amber"
            hint="Total tagihan belum dibayar"
          />
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* Invoice terakhir */}
        <Card className="gap-0 py-0">
          <CardHeader className="border-b">
            <CardTitle>Invoice Terakhir</CardTitle>
            <CardDescription>Invoice terbaru yang dibuat</CardDescription>
            <CardAction>
              <Button
                variant="outline"
                size="sm"
                onClick={() => useAppStore.getState().setActivePage('invoices')}
              >
                Lihat semua
                <ArrowRight />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="p-0">
            {data.recentInvoices.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Belum ada invoice"
                description="Invoice yang dibuat akan tampil di sini."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={HEAD_CELL}>Nomor</TableHead>
                      <TableHead className={HEAD_CELL}>Tanggal</TableHead>
                      <TableHead className={HEAD_CELL}>Customer</TableHead>
                      <TableHead className={`${HEAD_CELL} text-right`}>Total</TableHead>
                      <TableHead className={HEAD_CELL}>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentInvoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className={`${BODY_CELL} font-mono text-[13px] font-medium`}>
                          {inv.number}
                        </TableCell>
                        <TableCell className={BODY_CELL}>{formatDateID(inv.invoiceDate)}</TableCell>
                        <TableCell className={BODY_CELL}>
                          <span className="block max-w-[160px] truncate" title={inv.customerName}>
                            {inv.customerName}
                          </span>
                        </TableCell>
                        <TableCell className={`${BODY_CELL} text-right font-medium`}>
                          {formatRp(inv.total)}
                        </TableCell>
                        <TableCell className={BODY_CELL}>
                          <InvoiceStatusBadge status={inv.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Produk terlaris bulan ini */}
        <Card className="gap-0 py-0">
          <CardHeader className="border-b">
            <CardTitle>Produk Terlaris (Bulan Ini)</CardTitle>
            <CardDescription>Produk dengan penjualan tertinggi bulan ini</CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {data.topProducts.length === 0 ? (
              <EmptyState
                icon={Package}
                title="Belum ada penjualan bulan ini"
                description="Produk terlaris akan tampil setelah ada invoice pada bulan ini."
              />
            ) : (
              <div>
                {data.topProducts.map((p, idx) => (
                  <div key={p.productId}>
                    {idx > 0 && <Separator />}
                    <div className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.productName}</p>
                        <p className="text-xs text-muted-foreground">{formatNumberID(p.quantity)} terjual</p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold">{formatRp(p.revenue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
