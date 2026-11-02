'use client'

import * as React from 'react'
import { Eye, FileText, Plus, Trash2, Wallet } from 'lucide-react'
import { api } from '@/lib/client-api'
import { formatDateID, formatNumberID, formatRp, toNumber } from '@/lib/money'
import { useCan } from '@/hooks/use-can'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/store/app-store'
import type { CustomerDTO, InvoiceListItemDTO } from '@/lib/types'
import { EmptyState, PageHeader } from '@/components/shared/page-header'
import { SearchSelect, type SearchSelectOption } from '@/components/shared/search-select'
import { InvoiceStatusBadge } from '@/components/shared/badges'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { InvoiceCreateDialog } from '@/components/darrellsoft/invoices/invoice-create-dialog'
import { InvoiceDetailDialog } from '@/components/darrellsoft/invoices/invoice-detail-dialog'
import { PaymentDialog, type PaymentTarget } from '@/components/darrellsoft/invoices/payment-dialog'

/** Halaman Invoice — daftar tagihan penjualan dengan harga terkunci saat disimpan. */
export default function InvoicesPage() {
  const { toast } = useToast()
  const canFn = useCan()
  const companyId = useAppStore((s) => s.companyId)
  const userId = useAppStore((s) => s.userId)

  const canWrite = canFn('invoices:write')
  const canPay = canFn('invoices:pay')
  const canDelete = canFn('invoices:delete')
  const canManualPrice = canFn('manual_price')

  // ---- Filter ----
  const [searchText, setSearchText] = React.useState('')
  const [debouncedQ, setDebouncedQ] = React.useState('')
  const [customerFilter, setCustomerFilter] = React.useState<string | null>(null)
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')

  // ---- Data ----
  const [customers, setCustomers] = React.useState<CustomerDTO[]>([])
  const [rows, setRows] = React.useState<InvoiceListItemDTO[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  // ---- Dialog state ----
  const [createOpen, setCreateOpen] = React.useState(false)
  const [detailId, setDetailId] = React.useState<string | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)
  const [detailRefreshKey, setDetailRefreshKey] = React.useState(0)
  const [payTarget, setPayTarget] = React.useState<PaymentTarget | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<InvoiceListItemDTO | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  // Debounce pencarian 300ms
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchText.trim()), 300)
    return () => clearTimeout(t)
  }, [searchText])

  // Opsi customer untuk filter
  React.useEffect(() => {
    if (!companyId || !userId) return
    let cancelled = false
    api<CustomerDTO[]>('/api/customers')
      .then((data) => {
        if (!cancelled) setCustomers(data)
      })
      .catch(() => {
        // filter customer bersifat opsional; daftar tetap tampil
      })
    return () => {
      cancelled = true
    }
  }, [companyId, userId])

  // Daftar invoice (refetch saat filter berubah / setelah create-payment-delete)
  React.useEffect(() => {
    if (!companyId || !userId) return
    let cancelled = false
    setLoading(true)
    api<InvoiceListItemDTO[]>('/api/invoices', {
      params: {
        q: debouncedQ || undefined,
        customerId: customerFilter ?? undefined,
        from: from || undefined,
        to: to || undefined,
      },
    })
      .then((data) => {
        if (cancelled) return
        setRows(data)
        setLoadError(null)
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [companyId, userId, debouncedQ, customerFilter, from, to, tick])

  function refresh() {
    setTick((t) => t + 1)
  }

  function openDetail(id: string) {
    setDetailId(id)
    setDetailOpen(true)
  }

  function handlePaymentSuccess() {
    refresh()
    setDetailRefreshKey((k) => k + 1)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api<unknown>(`/api/invoices/${deleteTarget.id}`, { method: 'DELETE' })
      toast({ title: 'Invoice dihapus', description: `Invoice ${deleteTarget.number} berhasil dihapus.` })
      setDeleteTarget(null)
      refresh()
    } catch (e) {
      // Server menolak bila invoice sudah memiliki pembayaran — tampilkan pesannya.
      toast({
        variant: 'destructive',
        title: 'Gagal menghapus invoice',
        description: e instanceof Error ? e.message : 'Terjadi kesalahan.',
      })
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  const customerOptions: SearchSelectOption[] = React.useMemo(
    () => customers.map((c) => ({ value: c.id, label: c.name, description: c.code, keywords: [c.code] })),
    [customers]
  )

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Invoice"
        description="Tagihan penjualan — harga terkunci saat invoice disimpan."
        actions={
          canWrite ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Buat Invoice
            </Button>
          ) : undefined
        }
      />

      {/* Filter */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="inv-filter-search">Cari</Label>
              <Input
                id="inv-filter-search"
                placeholder="Nomor atau customer..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <SearchSelect
                value={customerFilter}
                onChange={setCustomerFilter}
                options={customerOptions}
                placeholder="Semua customer"
                searchPlaceholder="Cari customer..."
                emptyText="Tidak ada customer"
                allowClear
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-filter-from">Dari</Label>
              <Input id="inv-filter-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-filter-to">Sampai</Label>
              <Input id="inv-filter-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabel */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : loadError ? (
            <div className="p-6 text-sm text-destructive">Gagal memuat invoice: {loadError}</div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Belum ada invoice"
              description="Buat invoice pertama untuk mulai mencatat tagihan penjualan."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomor</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Jumlah Item</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Dibayar</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((inv) => {
                  const sisa = Math.max(0, toNumber(inv.total) - toNumber(inv.amountPaid))
                  return (
                    <TableRow key={inv.id} className="cursor-pointer" onClick={() => openDetail(inv.id)}>
                      <TableCell className="font-mono font-semibold">{inv.number}</TableCell>
                      <TableCell>{formatDateID(inv.invoiceDate)}</TableCell>
                      <TableCell>{inv.customerName}</TableCell>
                      <TableCell className="text-right">{formatNumberID(inv.itemCount)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatRp(inv.total)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatRp(inv.amountPaid)}</TableCell>
                      <TableCell>
                        <InvoiceStatusBadge status={inv.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={`Detail ${inv.number}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              openDetail(inv.id)
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {inv.status !== 'PAID' && canPay && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`Bayar ${inv.number}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                setPayTarget({ id: inv.id, number: inv.number, sisa })
                              }}
                            >
                              <Wallet className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              aria-label={`Hapus ${inv.number}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeleteTarget(inv)
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog Buat Invoice */}
      <InvoiceCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={refresh}
        canManualPrice={canManualPrice}
      />

      {/* Dialog Detail */}
      <InvoiceDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        invoiceId={detailId}
        refreshKey={detailRefreshKey}
        canPay={canPay}
        onPay={setPayTarget}
      />

      {/* Dialog Pembayaran */}
      <PaymentDialog
        open={payTarget !== null}
        onOpenChange={(o) => {
          if (!o) setPayTarget(null)
        }}
        target={payTarget}
        onSuccess={handlePaymentSuccess}
      />

      {/* Konfirmasi hapus */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              Invoice {deleteTarget?.number} akan dihapus permanen. Invoice yang sudah memiliki pembayaran tidak dapat
              dihapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
            >
              {deleting ? 'Menghapus...' : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
