'use client'

/**
 * DAFTAR INVOICE PELANGGAN (/master-customer/[id])
 * Muncul saat baris pelanggan di halaman Master Pelanggan diklik.
 * Menampilkan data pelanggan + semua invoice yang pernah dibuat untuk
 * pelanggan tersebut (dari GET /api/customers/[id]/history).
 * Klik salah satu invoice → buka Detail Invoice (/invoice?detail=<id>).
 */

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, ChevronRight, MapPin, Phone, Plus, ReceiptText,
} from 'lucide-react'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/dashboard-layout'
import { apiFetch } from '@/lib/client'
import { formatIDR, formatTanggalShort } from '@/lib/format'
import { getAuthUser } from '@/lib/auth'
import type { Customer } from '@/lib/types'
import type { InvoiceStatus, InvoiceType } from '@/lib/invoice-types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge, TypeBadge } from '@/components/invoice/invoice-badges'
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

interface CustomerInvoice {
  id: string
  number: string
  date: string
  type: InvoiceType
  status: InvoiceStatus
  total: number
  itemCount: number
  firstItem: string
  dpAmount: number
  sisa: number
}

interface CustomerHistorySummary {
  count: number
  lunas: number
  belum: number
  batal: number
  total: number
}

interface CustomerHistoryResponse {
  customer: Customer
  invoices: CustomerInvoice[]
  summary: CustomerHistorySummary
}

function ActiveBadge({ active }: { active: boolean }) {
  return active
    ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px] shrink-0">Aktif</Badge>
    : <Badge variant="outline" className="bg-stone-100 text-stone-500 border-stone-200 text-[11px] shrink-0">Nonaktif</Badge>
}

export default function CustomerInvoicesPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const customerId = params?.id ?? ''

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([])
  const [summary, setSummary] = useState<CustomerHistorySummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const authUser = getAuthUser()
    if (!authUser) {
      window.location.href = '/login'
    }
  }, [])

  const load = useCallback(async () => {
    if (!customerId) return
    setLoading(true)
    try {
      const data = await apiFetch<CustomerHistoryResponse>(
        `/api/customers/${encodeURIComponent(customerId)}/history`
      )
      setCustomer(data.customer)
      setInvoices(data.invoices)
      setSummary(data.summary)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => {
    void load()
  }, [load])

  const openDetail = (invId: string) => {
    router.push(`/invoice?detail=${encodeURIComponent(invId)}`)
  }

  const hasInvoices = invoices.length > 0

  return (
    <DashboardLayout title="Invoice Pelanggan" subtitle={customer?.name ?? 'Memuat…'}>
      <div className="space-y-5">
        {/* Kembali ke Master Pelanggan */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/master-customer')}
          className="-ml-2 h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          aria-label="Kembali ke Master Pelanggan"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Master Pelanggan
        </Button>

        {/* Kartu info pelanggan + ringkasan */}
        {loading ? (
          <Card className="p-0 gap-0">
            <CardContent className="p-4 space-y-3">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
              <div className="grid grid-cols-3 gap-2 pt-1">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
              </div>
            </CardContent>
          </Card>
        ) : customer ? (
          <Card className="p-0 gap-0">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{customer.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{customer.code || '—'}</p>
                </div>
                <ActiveBadge active={customer.isActive} />
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="flex items-center gap-1.5 min-h-[20px]">
                  <Phone className="h-3.5 w-3.5 shrink-0" /> {customer.phone || '-'}
                </p>
                <p className="flex items-start gap-1.5">
                  <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{customer.address || '-'}</span>
                </p>
              </div>
              {summary && (
                <>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div className="rounded-lg border border-stone-200 bg-stone-50 p-2.5 text-center">
                      <p className="text-lg font-bold tabular-nums leading-tight">{summary.count}</p>
                      <p className="text-[11px] text-muted-foreground">Invoice</p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-center">
                      <p className="text-lg font-bold tabular-nums leading-tight text-emerald-700">{summary.lunas}</p>
                      <p className="text-[11px] text-emerald-700/80">Lunas</p>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-center">
                      <p className="text-lg font-bold tabular-nums leading-tight text-amber-700">{summary.belum}</p>
                      <p className="text-[11px] text-amber-700/80">Belum Lunas</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Total nilai:{' '}
                    <span className="font-semibold text-foreground tabular-nums">
                      {formatIDR(summary.total)}
                    </span>
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ) : null}

        {/* Daftar invoice */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Daftar Invoice
          </h2>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
            </div>
          ) : !hasInvoices ? (
            <ListEmptyState onCreate={() => router.push('/invoice?buat=1')} />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
                <div className="max-h-96 overflow-y-auto scrollbar-thin">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-stone-50">
                      <TableRow className="bg-stone-50 hover:bg-stone-50">
                        <TableHead>Nomor</TableHead>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Jenis</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="w-10"><span className="sr-only">Buka detail</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((inv) => (
                        <TableRow
                          key={inv.id}
                          tabIndex={0}
                          onClick={() => openDetail(inv.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              openDetail(inv.id)
                            }
                          }}
                          aria-label={`Buka invoice ${inv.number}`}
                          className="cursor-pointer"
                        >
                          <TableCell className="font-medium whitespace-nowrap">{inv.number}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatTanggalShort(inv.date)}</TableCell>
                          <TableCell><TypeBadge type={inv.type} /></TableCell>
                          <TableCell><StatusBadge status={inv.status} /></TableCell>
                          <TableCell className="max-w-48 truncate text-muted-foreground">
                            {inv.itemCount} item · {inv.firstItem}
                          </TableCell>
                          <TableCell className="text-right font-semibold whitespace-nowrap tabular-nums">
                            {formatIDR(inv.total)}
                          </TableCell>
                          <TableCell>
                            <ChevronRight className="h-4 w-4 text-stone-400" aria-hidden="true" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {invoices.map((inv) => (
                  <button
                    key={inv.id}
                    onClick={() => openDetail(inv.id)}
                    aria-label={`Buka invoice ${inv.number}`}
                    className="w-full text-left"
                  >
                    <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-2 transition-colors active:bg-stone-50 hover:border-emerald-300">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{inv.number}</p>
                          <p className="text-xs text-muted-foreground truncate">{inv.firstItem}</p>
                        </div>
                        <StatusBadge status={inv.status} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <TypeBadge type={inv.type} />
                        {inv.type === 'DP' && inv.sisa > 0 && (
                          <span className="text-xs text-amber-700">Sisa {formatIDR(inv.sisa)}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">
                          {formatTanggalShort(inv.date)} · {inv.itemCount} item
                        </span>
                        <span className="font-semibold whitespace-nowrap tabular-nums">{formatIDR(inv.total)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}

function ListEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="text-center py-12 px-4 rounded-xl border border-stone-200 bg-white">
      <ReceiptText className="h-10 w-10 text-stone-300 mx-auto mb-2" />
      <p className="text-sm font-medium">Belum ada invoice untuk pelanggan ini</p>
      <p className="text-xs text-muted-foreground mt-1 mb-4">
        Invoice yang dibuat dengan nama pelanggan ini akan tampil di sini.
      </p>
      <Button
        onClick={onCreate}
        className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px]"
      >
        <Plus className="h-4 w-4" /> Buat Invoice
      </Button>
    </div>
  )
}
