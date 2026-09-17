'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, FileSpreadsheet, Plus, ReceiptText, Search } from 'lucide-react'
import { toast } from 'sonner'
import { apiJson, downloadFile } from '@/lib/invoice-client'
import { formatDate, formatIDR } from '@/lib/invoice-format'
import {
  STATUS_LABEL,
  TYPE_LABEL,
  type InvoiceListResponse,
  type InvoiceListRow,
  type InvoiceStatus,
  type InvoiceType,
} from '@/lib/invoice-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge, SummaryChip, TypeBadge } from '@/components/invoice/invoice-badges'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

interface InvoiceListProps {
  refreshKey: number
  onOpenDetail: (id: string) => void
  onCreate: () => void
}

const STATUS_OPTIONS: Array<{ value: 'ALL' | InvoiceStatus; label: string }> = [
  { value: 'ALL', label: 'Semua Status' },
  { value: 'BELUM_BAYAR', label: STATUS_LABEL.BELUM_BAYAR },
  { value: 'LUNAS', label: STATUS_LABEL.LUNAS },
  { value: 'BATAL', label: STATUS_LABEL.BATAL },
]

const TYPE_OPTIONS: Array<{ value: 'ALL' | InvoiceType; label: string }> = [
  { value: 'ALL', label: 'Semua Tipe' },
  { value: 'REGULER', label: `Tipe ${TYPE_LABEL.REGULER}` },
  { value: 'DP', label: `Tipe ${TYPE_LABEL.DP}` },
  { value: 'PELUNASAN', label: `Tipe ${TYPE_LABEL.PELUNASAN}` },
]

export default function InvoiceList({ refreshKey, onOpenDetail, onCreate }: InvoiceListProps) {
  const [invoices, setInvoices] = useState<InvoiceListRow[]>([])
  const [loading, setLoading] = useState(true)

  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'ALL' | InvoiceStatus>('ALL')
  const [type, setType] = useState<'ALL' | InvoiceType>('ALL')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (status !== 'ALL') p.set('status', status)
    if (type !== 'ALL') p.set('type', type)
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    return p.toString()
  }, [q, status, type, from, to])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = buildQuery()
      const data = await apiJson<InvoiceListResponse>(`/api/invoices${qs ? `?${qs}` : ''}`)
      setInvoices(data.invoices)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setLoading(false)
    }
  }, [buildQuery])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const handleExport = () => {
    const qs = buildQuery()
    downloadFile(`/api/export/invoices${qs ? `?${qs}` : ''}`, 'Riwayat-Invoice.xlsx')
      .then(() => toast.success('File Excel berhasil diunduh'))
      .catch((e) => toast.error(errText(e)))
  }

  const hasFilters = q !== '' || status !== 'ALL' || type !== 'ALL' || from !== '' || to !== ''

  // Ringkasan dari data terfilter (invoice BATAL tidak dihitung)
  const stats = useMemo(() => {
    const active = invoices.filter((r) => r.status !== 'BATAL')
    return {
      count: active.length,
      total: active.reduce((s, r) => s + r.total, 0),
      unpaid: active.filter((r) => r.status === 'BELUM_BAYAR').length,
      sisa: active.reduce((s, r) => s + r.sisa, 0),
    }
  }, [invoices])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Daftar Invoice</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {loading ? 'Memuat data…' : `${invoices.length} invoice ditampilkan`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleExport}
            className="min-h-[44px] flex-1 sm:flex-none"
            aria-label="Export daftar invoice ke Excel"
          >
            <FileSpreadsheet className="h-4 w-4" /> Export Excel
          </Button>
          <Button
            onClick={onCreate}
            className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px] flex-1 sm:flex-none"
          >
            <Plus className="h-4 w-4" /> Buat Invoice
          </Button>
        </div>
      </div>

      {/* Ringkasan */}
      {loading ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <SummaryChip label="Invoice Aktif" value={String(stats.count)} />
          <SummaryChip label="Total Penjualan" value={formatIDR(stats.total)} />
          <SummaryChip label="Belum Bayar" value={String(stats.unpaid)} valueClass={stats.unpaid > 0 ? 'text-amber-700' : undefined} />
          <SummaryChip label="Sisa Tagihan" value={formatIDR(stats.sisa)} valueClass={stats.sisa > 0 ? 'text-amber-700' : 'text-emerald-700'} />
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px] sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cari nomor / pelanggan…"
            aria-label="Cari invoice"
            className="pl-9 min-h-[44px]"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as 'ALL' | InvoiceStatus)}>
          <SelectTrigger className="w-full sm:w-40 min-h-[44px]" aria-label="Filter status invoice">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => setType(v as 'ALL' | InvoiceType)}>
          <SelectTrigger className="w-full sm:w-40 min-h-[44px]" aria-label="Filter tipe invoice">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-label="Dari tanggal"
          title="Dari tanggal"
          className="w-full sm:w-40 min-h-[44px]"
        />
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-label="Sampai tanggal"
          title="Sampai tanggal"
          className="w-full sm:w-40 min-h-[44px]"
        />
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : invoices.length === 0 ? (
          <ListEmptyState filtered={hasFilters} />
        ) : (
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-stone-50">
                <TableRow className="bg-stone-50 hover:bg-stone-50">
                  <TableHead>Nomor</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Pelanggan</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Item</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Sisa</TableHead>
                  <TableHead className="w-10"><span className="sr-only">Buka detail</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
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
                    aria-label={`Buka invoice ${inv.number}`}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-medium whitespace-nowrap">
                      <span className={inv.status === 'BATAL' ? 'line-through text-stone-400' : undefined}>{inv.number}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(inv.date)}</TableCell>
                    <TableCell className="max-w-40 truncate">{inv.customerName}</TableCell>
                    <TableCell><TypeBadge type={inv.type} /></TableCell>
                    <TableCell><StatusBadge status={inv.status} /></TableCell>
                    <TableCell className="text-center tabular-nums">{inv.itemCount}</TableCell>
                    <TableCell className="text-right font-semibold whitespace-nowrap">{formatIDR(inv.total)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {inv.sisa > 0 ? (
                        <span className="font-semibold text-amber-700">{formatIDR(inv.sisa)}</span>
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </TableCell>
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
          [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
        ) : invoices.length === 0 ? (
          <ListEmptyState filtered={hasFilters} />
        ) : (
          invoices.map((inv) => (
            <button
              key={inv.id}
              onClick={() => onOpenDetail(inv.id)}
              aria-label={`Buka invoice ${inv.number}`}
              className="w-full text-left"
            >
              <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-2 transition-colors active:bg-stone-50 hover:border-emerald-300">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold truncate ${inv.status === 'BATAL' ? 'line-through text-stone-400' : ''}`}>{inv.number}</p>
                    <p className="text-xs text-muted-foreground truncate">{inv.customerName}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <TypeBadge type={inv.type} />
                    <StatusBadge status={inv.status} />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">
                    {formatDate(inv.date)} · {inv.itemCount} item
                  </span>
                  <span className="font-semibold whitespace-nowrap">{formatIDR(inv.total)}</span>
                </div>
                {inv.sisa > 0 && inv.status !== 'BATAL' && (
                  <div className="flex items-center justify-between gap-2 text-xs border-t border-stone-100 pt-2">
                    <span className="text-muted-foreground">Sisa Tagihan</span>
                    <span className="font-semibold text-amber-700">{formatIDR(inv.sisa)}</span>
                  </div>
                )}
              </div>
            </button>
          ))
        )}
      </div>

    </div>
  )
}

function ListEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="text-center py-12 px-4">
      <ReceiptText className="h-10 w-10 text-stone-300 mx-auto mb-2" />
      <p className="text-sm font-medium">{filtered ? 'Tidak ada invoice yang cocok' : 'Belum ada invoice'}</p>
      <p className="text-xs text-muted-foreground mt-1">
        {filtered ? 'Ubah kata kunci atau filter pencarian.' : 'Buat invoice pertama Anda dengan tombol "+ Buat Invoice".'}
      </p>
    </div>
  )
}
