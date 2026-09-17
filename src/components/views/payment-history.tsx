'use client'

import { useCallback, useEffect, useState } from 'react'
import { Banknote, ChevronRight, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { formatDate, formatIDR } from '@/lib/format'
import type { InvoiceListResponse, InvoiceListRow } from '@/lib/types'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge, TypeBadge } from '@/components/views/invoice-badges'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'Terjadi kesalahan'
}

interface PaymentHistoryProps {
  refreshKey: number
  onOpenDetail: (id: string) => void
}

/** Warna teks sisa tagihan: amber bila masih ada, emerald bila lunas (0) */
function sisaClass(sisa: number): string {
  return sisa > 0 ? 'text-amber-700' : 'text-emerald-700'
}

export default function PaymentHistory({ refreshKey, onOpenDetail }: PaymentHistoryProps) {
  const [dpRows, setDpRows] = useState<InvoiceListRow[]>([])
  const [settlementRows, setSettlementRows] = useState<InvoiceListRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [dp, pl] = await Promise.all([
        apiFetch<InvoiceListResponse>('/api/invoices?type=DP'),
        apiFetch<InvoiceListResponse>('/api/invoices?type=PELUNASAN'),
      ])
      setDpRows(dp.invoices)
      setSettlementRows(pl.invoices)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  // Total piutang = Σ sisa invoice DP (non-BATAL; LUNAS otomatis sisa 0).
  // Filter type defensif di sisi klien — aman walau backend belum mengirim field baru.
  const dpOnly = dpRows.filter((r) => r.type === 'DP')
  const settlementOnly = settlementRows.filter((r) => r.type === 'PELUNASAN')
  const totalPiutang = dpOnly
    .filter((r) => r.status !== 'BATAL')
    .reduce((acc, r) => acc + r.sisa, 0)

  return (
    <div className="space-y-6">
      {/* Strip ringkasan */}
      {loading ? (
        <Skeleton className="h-20 w-full rounded-xl" />
      ) : (
        <div className="rounded-xl border border-stone-200 bg-white p-4 md:p-5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Total Piutang</p>
            <p className="text-xl md:text-2xl font-bold text-amber-700 mt-1">
              {formatIDR(totalPiutang)}
            </p>
          </div>
          <p className="text-xs text-muted-foreground text-right shrink-0">
            {dpOnly.length} invoice DP · {settlementOnly.length} pelunasan
          </p>
        </div>
      )}

      {/* ===== Bagian 1: Daftar Invoice DP ===== */}
      <section aria-label="Daftar Invoice DP" className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Daftar Invoice DP</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Invoice pesanan dengan uang muka (DP) dan sisa tagihannya.
          </p>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : dpOnly.length === 0 ? (
            <DpEmptyState />
          ) : (
            <div className="max-h-96 overflow-auto scrollbar-thin">
              <Table className="min-w-[760px]">
                <TableHeader className="sticky top-0 z-10 bg-stone-50">
                  <TableRow className="bg-stone-50 hover:bg-stone-50">
                    <TableHead>Nomor</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Pelanggan</TableHead>
                    <TableHead className="text-right">Total Pesanan</TableHead>
                    <TableHead className="text-right">Total DP</TableHead>
                    <TableHead className="text-right">Sudah Dipelunasi</TableHead>
                    <TableHead className="text-right">Sisa Tagihan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10"><span className="sr-only">Buka detail</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dpRows.map((inv) => (
                    <TableRow
                      key={inv.id}
                      tabIndex={0}
                      onClick={() => onOpenDetail(inv.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onOpenDetail(inv.id)
                        }
                      }}
                      aria-label={`Buka invoice DP ${inv.number}`}
                      className="cursor-pointer"
                    >
                      <TableCell className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          {inv.number} <TypeBadge type={inv.type} />
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(inv.date)}</TableCell>
                      <TableCell className="max-w-40 truncate">{inv.customerName}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatIDR(inv.total)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatIDR(inv.dpAmount)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap text-emerald-700">
                        {formatIDR(inv.settlementTotal)}
                      </TableCell>
                      <TableCell className={`text-right font-semibold whitespace-nowrap ${sisaClass(inv.sisa)}`}>
                        {formatIDR(inv.sisa)}
                      </TableCell>
                      <TableCell><StatusBadge status={inv.status} /></TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-stone-400" aria-hidden="true" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {loading ? (
            [1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)
          ) : dpOnly.length === 0 ? (
            <div className="rounded-xl border border-stone-200 bg-white"><DpEmptyState /></div>
          ) : (
            dpOnly.map((inv) => (
              <button
                key={inv.id}
                onClick={() => onOpenDetail(inv.id)}
                aria-label={`Buka invoice DP ${inv.number}`}
                className="w-full text-left"
              >
                <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-2.5 transition-colors active:bg-stone-50 hover:border-emerald-300">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm font-semibold truncate">{inv.number}</p>
                      <TypeBadge type={inv.type} />
                    </div>
                    <StatusBadge status={inv.status} />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {inv.customerName} · {formatDate(inv.date)}
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-[11px] text-muted-foreground">Total</p>
                      <p className="font-medium whitespace-nowrap">{formatIDR(inv.total)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">DP</p>
                      <p className="font-medium whitespace-nowrap">{formatIDR(inv.dpAmount)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Sisa</p>
                      <p className={`font-semibold whitespace-nowrap ${sisaClass(inv.sisa)}`}>
                        {formatIDR(inv.sisa)}
                      </p>
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      {/* ===== Bagian 2: Transaksi Pelunasan ===== */}
      <section aria-label="Transaksi Pelunasan" className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Transaksi Pelunasan</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pembayaran pelunasan atas invoice DP.
          </p>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : settlementOnly.length === 0 ? (
            <SettlementEmptyState />
          ) : (
            <div className="max-h-96 overflow-auto scrollbar-thin">
              <Table className="min-w-[560px]">
                <TableHeader className="sticky top-0 z-10 bg-stone-50">
                  <TableRow className="bg-stone-50 hover:bg-stone-50">
                    <TableHead>Nomor</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Invoice DP</TableHead>
                    <TableHead className="text-right">Nominal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10"><span className="sr-only">Buka detail</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settlementRows.map((inv) => (
                    <TableRow
                      key={inv.id}
                      tabIndex={0}
                      onClick={() => onOpenDetail(inv.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onOpenDetail(inv.id)
                        }
                      }}
                      aria-label={`Buka transaksi pelunasan ${inv.number}`}
                      className="cursor-pointer"
                    >
                      <TableCell className="font-medium whitespace-nowrap">{inv.number}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(inv.date)}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {inv.parentNumber ?? '-'}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-emerald-700 whitespace-nowrap">
                        {formatIDR(inv.paidAmount)}
                      </TableCell>
                      <TableCell><StatusBadge status={inv.status} /></TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-stone-400" aria-hidden="true" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {loading ? (
            [1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
          ) : settlementOnly.length === 0 ? (
            <div className="rounded-xl border border-stone-200 bg-white"><SettlementEmptyState /></div>
          ) : (
            settlementOnly.map((inv) => (
              <button
                key={inv.id}
                onClick={() => onOpenDetail(inv.id)}
                aria-label={`Buka transaksi pelunasan ${inv.number}`}
                className="w-full text-left"
              >
                <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-2 transition-colors active:bg-stone-50 hover:border-emerald-300">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold truncate">{inv.number}</p>
                    <StatusBadge status={inv.status} />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-xs text-muted-foreground truncate">
                      {formatDate(inv.date)}
                      {inv.parentNumber ? ` · DP ${inv.parentNumber}` : ''}
                    </span>
                    <span className="font-semibold text-emerald-700 whitespace-nowrap">
                      {formatIDR(inv.paidAmount)}
                    </span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

function DpEmptyState() {
  return (
    <div className="text-center py-12 px-4">
      <Layers className="h-10 w-10 text-stone-300 mx-auto mb-2" />
      <p className="text-sm font-medium">Belum ada invoice DP</p>
      <p className="text-xs text-muted-foreground mt-1">
        Buat invoice dengan tipe &quot;DP&quot; untuk mencatat uang muka pesanan.
      </p>
    </div>
  )
}

function SettlementEmptyState() {
  return (
    <div className="text-center py-12 px-4">
      <Banknote className="h-10 w-10 text-stone-300 mx-auto mb-2" />
      <p className="text-sm font-medium">Belum ada transaksi pelunasan</p>
      <p className="text-xs text-muted-foreground mt-1">
        Pelunasan akan muncul setelah ada pembayaran atas invoice DP.
      </p>
    </div>
  )
}
