'use client'

import * as React from 'react'
import {
  Gauge,
  Package,
  Percent,
  Receipt,
  ShieldAlert,
  TriangleAlert,
  TrendingUp,
  Wallet,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState, PageHeader } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { api } from '@/lib/client-api'
import { formatDateID, formatNumberID, formatRp, todayISO } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { MarginReportDTO } from '@/lib/types'
import { useCan } from '@/hooks/use-can'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/store/app-store'

interface DateRange {
  from: string
  to: string
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Rentang satu bulan relatif terhadap bulan berjalan (0 = bulan ini, -1 = bulan lalu). */
function monthRange(offset: number): DateRange {
  const today = todayISO()
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7)) // 1-12
  const first = new Date(Date.UTC(year, month - 1 + offset, 1))
  const y = first.getUTCFullYear()
  const m = first.getUTCMonth() + 1
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${y}-${pad2(m)}-01`, to: `${y}-${pad2(m)}-${pad2(lastDay)}` }
}

function lastNDaysRange(days: number): DateRange {
  const to = todayISO()
  const d = new Date(`${to}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - (days - 1))
  return { from: d.toISOString().slice(0, 10), to }
}

function isCompleteRange(range: DateRange): boolean {
  return ISO_DATE_RE.test(range.from) && ISO_DATE_RE.test(range.to)
}

function SummarySkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="py-0">
          <CardContent className="flex items-start gap-3 p-4 sm:gap-4 sm:p-5">
            <Skeleton className="h-11 w-11 rounded-lg" />
            <div className="flex-1 space-y-2 pt-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-32" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4 sm:p-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  )
}

export default function ReportsPage() {
  const { toast } = useToast()
  const can = useCan()
  const companyId = useAppStore((s) => s.companyId)
  const userId = useAppStore((s) => s.userId)

  const [range, setRange] = React.useState<DateRange>(() => monthRange(0))
  const [report, setReport] = React.useState<MarginReportDTO | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [refreshKey, setRefreshKey] = React.useState(0)
  const requestIdRef = React.useRef(0)

  const rangeValid = isCompleteRange(range) && range.from <= range.to

  React.useEffect(() => {
    if (!companyId || !userId || !rangeValid) return
    const id = ++requestIdRef.current
    setLoading(true)
    api<MarginReportDTO>('/api/reports/margin', { params: { from: range.from, to: range.to } })
      .then((data) => {
        if (requestIdRef.current === id) setReport(data)
      })
      .catch((err: unknown) => {
        if (requestIdRef.current === id) {
          toast({
            variant: 'destructive',
            title: 'Gagal memuat laporan',
            description: err instanceof Error ? err.message : 'Terjadi kesalahan saat mengambil data.',
          })
        }
      })
      .finally(() => {
        if (requestIdRef.current === id) setLoading(false)
      })
  }, [companyId, userId, range.from, range.to, rangeValid, refreshKey, toast])

  if (!can('reports:read')) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Anda tidak memiliki izin melihat laporan."
        description="Hubungi pemilik atau admin perusahaan untuk mendapatkan akses."
      />
    )
  }

  const totals = report?.totals
  const byInvoice = report?.byInvoice ?? []
  const byProduct = report?.byProduct ?? []
  const showSkeleton = loading && !report
  const dimmed = loading && report !== null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laporan Laba Rugi"
        description="Margin penjualan dari harga jual vs harga pokok pada snapshot invoice."
      />

      {/* Filter periode */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Periode Laporan</CardTitle>
          <CardDescription>
            {isCompleteRange(range)
              ? `Menampilkan ${formatDateID(range.from)} \u2013 ${formatDateID(range.to)}`
              : 'Pilih rentang tanggal untuk menampilkan laporan.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
            <div className="w-full space-y-1.5 sm:w-44">
              <Label htmlFor="report-from">Dari</Label>
              <Input
                id="report-from"
                type="date"
                value={range.from}
                onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              />
            </div>
            <div className="w-full space-y-1.5 sm:w-44">
              <Label htmlFor="report-to">Sampai</Label>
              <Input
                id="report-to"
                type="date"
                value={range.to}
                onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              <Button variant="outline" size="sm" onClick={() => setRange(monthRange(0))}>
                Bulan Ini
              </Button>
              <Button variant="outline" size="sm" onClick={() => setRange(monthRange(-1))}>
                Bulan Lalu
              </Button>
              <Button variant="outline" size="sm" onClick={() => setRange(lastNDaysRange(30))}>
                30 Hari Terakhir
              </Button>
            </div>
          </div>
          {!rangeValid && (
            <p className="text-xs text-amber-600">
              Lengkapi tanggal mulai dan akhir (tanggal mulai tidak boleh melebihi tanggal akhir).
            </p>
          )}
        </CardContent>
      </Card>

      {showSkeleton ? (
        <>
          <SummarySkeleton />
          <Card>
            <TableSkeleton />
          </Card>
        </>
      ) : !rangeValid ? null : !report || !totals ? (
        <Card>
          <EmptyState
            icon={TriangleAlert}
            title="Laporan tidak tersedia."
            description="Gagal memuat data laporan untuk periode ini. Silakan coba lagi."
            action={{ label: 'Coba Lagi', onClick: () => setRefreshKey((k) => k + 1) }}
          />
        </Card>
      ) : (
        <div
          className={cn(
            'space-y-4 transition-opacity duration-200',
            dimmed && 'pointer-events-none opacity-60'
          )}
        >
          {/* Ringkasan */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard title="Pendapatan" value={formatRp(totals.revenue)} icon={Wallet} />
            <StatCard title="Diskon" value={formatRp(totals.discount)} icon={Percent} />
            <StatCard title="Pajak Terkumpul" value={formatRp(totals.taxAmount)} icon={Receipt} />
            <StatCard title="Harga Pokok Penjualan" value={formatRp(totals.hpp)} icon={Package} />
            <StatCard
              title="Laba Kotor"
              value={formatRp(totals.grossProfit)}
              icon={TrendingUp}
              tone="emerald"
              hint={`${totals.invoiceCount} invoice`}
            />
            <StatCard
              title="Margin (%)"
              value={`${formatNumberID(totals.marginPercent, 1)}%`}
              icon={Gauge}
              tone="teal"
            />
          </div>

          <div className="rounded-md border bg-zinc-50 p-3 text-xs text-muted-foreground">
            Harga pokok diambil dari snapshot saat invoice dibuat. Mengubah harga jual atau harga
            khusus customer tidak mengubah harga pokok, nilai stok, maupun invoice lama.
          </div>

          {/* Rincian */}
          <Tabs defaultValue="invoice">
            <TabsList>
              <TabsTrigger value="invoice">Per Invoice</TabsTrigger>
              <TabsTrigger value="product">Per Produk</TabsTrigger>
            </TabsList>

            <TabsContent value="invoice">
              <Card>
                <CardContent className="p-0">
                  <div className="max-h-[60vh] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-card">
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Nomor</TableHead>
                          <TableHead>Tanggal</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead className="text-right">Pendapatan</TableHead>
                          <TableHead className="text-right">Diskon</TableHead>
                          <TableHead className="text-right">Pajak</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">HPP</TableHead>
                          <TableHead className="text-right">Laba Kotor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {byInvoice.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={9}
                              className="h-24 text-center text-sm text-muted-foreground"
                            >
                              Tidak ada invoice pada periode ini.
                            </TableCell>
                          </TableRow>
                        ) : (
                          byInvoice.map((inv) => (
                            <TableRow key={inv.id}>
                              <TableCell className="font-mono text-xs">{inv.number}</TableCell>
                              <TableCell>{formatDateID(inv.invoiceDate)}</TableCell>
                              <TableCell className="max-w-[180px] truncate" title={inv.customerName}>
                                {inv.customerName}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatRp(inv.subtotal)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatRp(inv.discount)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatRp(inv.taxAmount)}
                              </TableCell>
                              <TableCell className="text-right font-medium tabular-nums">
                                {formatRp(inv.total)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatRp(inv.hpp)}
                              </TableCell>
                              <TableCell className="text-right font-semibold text-emerald-700 tabular-nums">
                                {formatRp(inv.grossProfit)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="product">
              <Card>
                <CardContent className="p-0">
                  <div className="max-h-[60vh] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-card">
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Kode</TableHead>
                          <TableHead>Nama Produk</TableHead>
                          <TableHead className="text-right">Qty Terjual</TableHead>
                          <TableHead className="text-right">Pendapatan</TableHead>
                          <TableHead className="text-right">HPP</TableHead>
                          <TableHead className="text-right">Laba Kotor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {byProduct.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              className="h-24 text-center text-sm text-muted-foreground"
                            >
                              Tidak ada produk terjual pada periode ini.
                            </TableCell>
                          </TableRow>
                        ) : (
                          byProduct.map((p) => (
                            <TableRow key={p.productId}>
                              <TableCell className="font-mono text-xs">{p.productCode}</TableCell>
                              <TableCell className="max-w-[240px] truncate" title={p.productName}>
                                {p.productName}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatNumberID(p.quantity)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatRp(p.revenue)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatRp(p.hpp)}
                              </TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">
                                {formatRp(p.grossProfit)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  )
}
