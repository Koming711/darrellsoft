'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, FileSpreadsheet, Plus, ReceiptText, Search } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch, downloadFile } from '@/lib/client'
import { formatDate, formatIDR } from '@/lib/format'
import {
  STATUS_LABEL,
  type InvoiceListResponse,
  type InvoiceListRow,
  type InvoiceStatus,
  type SessionUser,
} from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/views/invoice-badges'
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
  user: SessionUser
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

export default function InvoiceList({ user, refreshKey, onOpenDetail, onCreate }: InvoiceListProps) {
  const [invoices, setInvoices] = useState<InvoiceListRow[]>([])
  const [summary, setSummary] = useState<{ count: number; total: number } | null>(null)
  const [loading, setLoading] = useState(true)

  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'ALL' | InvoiceStatus>('ALL')
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
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    return p.toString()
  }, [q, status, from, to])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = buildQuery()
      const data = await apiFetch<InvoiceListResponse>(`/api/invoices${qs ? `?${qs}` : ''}`)
      setInvoices(data.invoices)
      setSummary(data.summary)
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

  const hasFilters = q !== '' || status !== 'ALL' || from !== '' || to !== ''

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Riwayat Invoice</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {loading ? 'Memuat data…' : summary
              ? `${summary.count} invoice · Total ${formatIDR(summary.total)}`
              : '—'}
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
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Jumlah Item</TableHead>
                  <TableHead className="text-right">Total</TableHead>
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
                    <TableCell className="font-medium whitespace-nowrap">{inv.number}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(inv.date)}</TableCell>
                    <TableCell className="max-w-48 truncate">{inv.customerName}</TableCell>
                    <TableCell><StatusBadge status={inv.status} dueDate={inv.dueDate} /></TableCell>
                    <TableCell className="text-center tabular-nums">{inv.itemCount}</TableCell>
                    <TableCell className="text-right font-semibold whitespace-nowrap">{formatIDR(inv.total)}</TableCell>
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
                    <p className="text-sm font-semibold truncate">{inv.number}</p>
                    <p className="text-xs text-muted-foreground truncate">{inv.customerName}</p>
                  </div>
                  <StatusBadge status={inv.status} dueDate={inv.dueDate} />
                </div>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">
                    {formatDate(inv.date)} · {inv.itemCount} item
                  </span>
                  <span className="font-semibold whitespace-nowrap">{formatIDR(inv.total)}</span>
                </div>
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
