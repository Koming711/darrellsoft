'use client'

/**
 * SbDashboard — tab "Dashboard Stock" modul Stock Bahan.
 *
 * - 4 kartu ringkasan: Total Jenis Bahan, Total Stok, Stok Menipis, Stok Habis.
 * - Daftar "Bahan yang perlu dibeli": bahan berstatus menipis/habis,
 *   diurutkan habis → menipis → nama. Desktop tabel, mobile kartu.
 * - Tombol "Detail" didelegasikan ke shell via onOpenDetail.
 */

import { useMemo } from 'react'
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, Boxes, CircleX, Layers, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { BahanItem, StockStatus } from '@/lib/stock-bahan-types'
import { statusStok } from '@/lib/stock-bahan-types'
import { SbStatusBadge, fmtQty } from '@/components/stock-bahan/sb-shared'

export interface SbDashboardProps {
  bahans: BahanItem[]
  onOpenDetail?: (bahanId: string) => void
}

/** Urutan prioritas daftar beli: habis paling atas, lalu menipis. */
const STATUS_ORDER: Record<StockStatus, number> = { habis: 0, menipis: 1, aman: 2 }

function SummaryCard({
  label,
  value,
  icon: Icon,
  iconClass,
}: {
  label: string
  value: string
  icon: LucideIcon
  iconClass: string
}) {
  return (
    <Card className="gap-0 rounded-xl py-4">
      <CardContent className="flex items-center gap-3 px-4">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', iconClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl leading-tight font-bold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export default function SbDashboard({ bahans, onOpenDetail }: SbDashboardProps) {
  const totalStok = useMemo(() => bahans.reduce((s, b) => s + b.stok, 0), [bahans])
  const menipisCount = useMemo(
    () => bahans.filter((b) => statusStok(b.stok, b.stokMin) === 'menipis').length,
    [bahans]
  )
  const habisCount = useMemo(
    () => bahans.filter((b) => statusStok(b.stok, b.stokMin) === 'habis').length,
    [bahans]
  )
  const needBuy = useMemo(
    () =>
      bahans
        .map((b) => ({ bahan: b, status: statusStok(b.stok, b.stokMin) }))
        .filter((x) => x.status !== 'aman')
        .sort(
          (a, b) =>
            STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
            a.bahan.nama.localeCompare(b.bahan.nama)
        ),
    [bahans]
  )

  return (
    <div className="space-y-4">
      {/* ===== Kartu ringkasan ===== */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <SummaryCard
          label="Total Jenis Bahan"
          value={String(bahans.length)}
          icon={Boxes}
          iconClass="bg-primary/10 text-primary"
        />
        <SummaryCard
          label="Total Stok"
          value={fmtQty(totalStok)}
          icon={Layers}
          iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
        />
        <SummaryCard
          label="Stok Menipis"
          value={String(menipisCount)}
          icon={AlertTriangle}
          iconClass="bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
        />
        <SummaryCard
          label="Stok Habis"
          value={String(habisCount)}
          icon={CircleX}
          iconClass="bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400"
        />
      </div>

      {/* ===== Bahan yang perlu dibeli ===== */}
      <Card className="gap-0 rounded-xl py-4 md:py-5">
        <CardContent className="space-y-3 px-4 md:px-5">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Bahan yang perlu dibeli</h2>
            {needBuy.length > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground tabular-nums">
                {needBuy.length}
              </span>
            )}
          </div>

          {needBuy.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-muted/40 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Semua stok aman. Tidak ada bahan yang perlu dibeli.
              </p>
            </div>
          ) : (
            <>
              {/* Desktop: tabel */}
              <div className="hidden overflow-hidden rounded-xl border md:block">
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                      <TableRow>
                        <TableHead>Nama Bahan</TableHead>
                        <TableHead className="text-right">Stok Sekarang</TableHead>
                        <TableHead className="text-right">Stok Minimum</TableHead>
                        <TableHead>Status</TableHead>
                        {onOpenDetail && <TableHead className="text-right">Aksi</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {needBuy.map(({ bahan, status }) => (
                        <TableRow key={bahan.id}>
                          <TableCell>
                            <p className="text-sm font-semibold">{bahan.nama}</p>
                            <p className="font-mono text-[11px] text-muted-foreground">{bahan.kode}</p>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right">
                            <span
                              className={cn(
                                'text-sm font-bold tabular-nums',
                                status === 'habis' && 'text-red-600 dark:text-red-400',
                                status === 'menipis' && 'text-amber-700 dark:text-amber-400'
                              )}
                            >
                              {fmtQty(bahan.stok)} {bahan.satuan}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right text-sm text-muted-foreground tabular-nums">
                            {fmtQty(bahan.stokMin)} {bahan.satuan}
                          </TableCell>
                          <TableCell>
                            <SbStatusBadge status={status} />
                          </TableCell>
                          {onOpenDetail && (
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8"
                                onClick={() => onOpenDetail(bahan.id)}
                              >
                                Detail
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Mobile: kartu */}
              <div className="max-h-96 space-y-2.5 overflow-y-auto md:hidden">
                {needBuy.map(({ bahan, status }) => (
                  <div key={bahan.id} className="space-y-2 rounded-xl border bg-card p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{bahan.nama}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{bahan.kode}</p>
                      </div>
                      <SbStatusBadge status={status} />
                    </div>
                    <div className="space-y-0.5 text-xs">
                      <p className="text-muted-foreground">
                        Stok:{' '}
                        <span
                          className={cn(
                            'font-bold tabular-nums text-foreground',
                            status === 'habis' && 'text-red-600 dark:text-red-400',
                            status === 'menipis' && 'text-amber-700 dark:text-amber-400'
                          )}
                        >
                          {fmtQty(bahan.stok)} {bahan.satuan}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Minimum:{' '}
                        <span className="tabular-nums text-foreground">
                          {fmtQty(bahan.stokMin)} {bahan.satuan}
                        </span>
                      </p>
                    </div>
                    {onOpenDetail && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-full"
                        onClick={() => onOpenDetail(bahan.id)}
                      >
                        Detail
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
