'use client'

// ============================================================
// Halaman "Harga Customer" — CRUD harga jual khusus per customer.
// Setiap customer dapat punya harga berbeda untuk barang yang sama;
// harga khusus otomatis dipakai saat membuat invoice.
// ============================================================

import * as React from 'react'
import { Info, Pencil, Plus, Search, Tags, Trash2 } from 'lucide-react'
import type { CustomerDTO, CustomerPriceDTO, ProductDTO } from '@/lib/types'
import { api } from '@/lib/client-api'
import { formatDateID, formatRp, todayISO } from '@/lib/money'
import { useCan } from '@/hooks/use-can'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/store/app-store'
import { EmptyState, PageHeader } from '@/components/shared/page-header'
import { PricePeriodBadge } from '@/components/shared/badges'
import { SearchSelect, type SearchSelectOption } from '@/components/shared/search-select'
import { PriceFormDialog } from '@/components/darrellsoft/prices/price-form-dialog'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type StatusFilter = 'all' | 'active' | 'expired' | 'inactive'

/** Normalisasi respons list API: terima array polos maupun dibungkus {items}/{data}. */
function extractList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[]
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    if (Array.isArray(obj.items)) return obj.items as T[]
    if (Array.isArray(obj.data)) return obj.data as T[]
  }
  return []
}

function PricesTableSkeleton() {
  return (
    <div className="space-y-2 p-4" aria-hidden="true">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  )
}

const COLUMNS = [
  'Customer',
  'Kode Barang',
  'Nama Barang',
  'Harga Standar',
  'Harga Khusus',
  'Satuan',
  'Mulai Berlaku',
  'Akhir Berlaku',
  'Status',
  'Aksi',
] as const

export default function CustomerPricesPage() {
  const { toast } = useToast()
  const can = useCan()
  const canWrite = can('prices:write')
  const companyId = useAppStore((s) => s.companyId)
  const today = todayISO()

  // ---- Filter state ----
  const [q, setQ] = React.useState('')
  const [qDebounced, setQDebounced] = React.useState('')
  const [customerFilter, setCustomerFilter] = React.useState<string | null>(null)
  const [productFilter, setProductFilter] = React.useState<string | null>(null)
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all')

  // ---- Data state ----
  const [prices, setPrices] = React.useState<CustomerPriceDTO[] | null>(null)
  const [customers, setCustomers] = React.useState<CustomerDTO[]>([])
  const [products, setProducts] = React.useState<ProductDTO[]>([])
  const [reloadKey, setReloadKey] = React.useState(0)

  // ---- Dialog state ----
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<CustomerPriceDTO | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<CustomerPriceDTO | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  // Debounce pencarian 300ms.
  React.useEffect(() => {
    const timer = setTimeout(() => setQDebounced(q.trim()), 300)
    return () => clearTimeout(timer)
  }, [q])

  // Fetch daftar harga customer — refetch saat filter / perusahaan berubah & setelah mutation.
  React.useEffect(() => {
    if (!companyId) return
    let cancelled = false
    api<unknown>('/api/customer-prices', {
      params: {
        q: qDebounced || undefined,
        customerId: customerFilter,
        productId: productFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
      },
    })
      .then((res) => {
        if (!cancelled) setPrices(extractList<CustomerPriceDTO>(res))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setPrices([])
        toast({
          variant: 'destructive',
          title: 'Gagal memuat harga customer',
          description: err instanceof Error ? err.message : 'Terjadi kesalahan.',
        })
      })
    return () => {
      cancelled = true
    }
  }, [companyId, qDebounced, customerFilter, productFilter, statusFilter, reloadKey, toast])

  // Master data untuk filter & form (di-fetch ulang saat ganti perusahaan).
  React.useEffect(() => {
    if (!companyId) return
    let cancelled = false
    api<unknown>('/api/customers')
      .then((res) => {
        if (!cancelled) setCustomers(extractList<CustomerDTO>(res))
      })
      .catch(() => undefined)
    api<unknown>('/api/products')
      .then((res) => {
        if (!cancelled) setProducts(extractList<ProductDTO>(res))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [companyId])

  const customerFilterOptions = React.useMemo<SearchSelectOption[]>(
    () => customers.map((c) => ({ value: c.id, label: c.name, description: c.code })),
    [customers]
  )

  const productFilterOptions = React.useMemo<SearchSelectOption[]>(
    () => products.map((p) => ({ value: p.id, label: p.name, description: p.code })),
    [products]
  )

  const openAdd = React.useCallback(() => {
    setEditing(null)
    setFormOpen(true)
  }, [])

  const openEdit = React.useCallback((row: CustomerPriceDTO) => {
    setEditing(row)
    setFormOpen(true)
  }, [])

  const refetch = React.useCallback(() => setReloadKey((k) => k + 1), [])

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { customerName, productName } = deleteTarget
    try {
      await api(`/api/customer-prices/${deleteTarget.id}`, { method: 'DELETE' })
      toast({
        title: 'Harga khusus dihapus',
        description: `${customerName} - ${productName}`,
      })
      setDeleteTarget(null)
      refetch()
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Gagal menghapus harga',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan.',
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Harga Customer"
        description="Harga jual khusus per customer — otomatis dipakai saat membuat invoice."
        actions={
          canWrite ? (
            <Button
              type="button"
              onClick={openAdd}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Tambah Harga Customer
            </Button>
          ) : undefined
        }
      />

      {/* Panel filter */}
      <Card>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari customer/barang..."
              aria-label="Cari customer atau barang"
              className="pl-9"
            />
          </div>
          <SearchSelect
            value={customerFilter}
            onChange={setCustomerFilter}
            options={customerFilterOptions}
            placeholder="Semua customer"
            searchPlaceholder="Cari customer..."
            allowClear
          />
          <SearchSelect
            value={productFilter}
            onChange={setProductFilter}
            options={productFilterOptions}
            placeholder="Semua produk"
            searchPlaceholder="Cari produk..."
            allowClear
          />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger aria-label="Filter status harga">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              <SelectItem value="active">Aktif</SelectItem>
              <SelectItem value="expired">Berakhir</SelectItem>
              <SelectItem value="inactive">Nonaktif</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Tabel harga customer */}
      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          {prices === null ? (
            <PricesTableSkeleton />
          ) : prices.length === 0 ? (
            <EmptyState
              icon={Tags}
              title="Belum ada harga khusus"
              description="Tambahkan harga khusus agar invoice otomatis memakai kesepakatan harga customer."
            />
          ) : (
            <div className="max-h-[65vh] overflow-y-auto">
              <Table className="min-w-[1150px]">
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    {COLUMNS.map((col, i) => (
                      <TableHead key={col} className={i === COLUMNS.length - 1 ? 'text-right' : undefined}>
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prices.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <p className="font-medium leading-tight">{row.customerName}</p>
                        <p className="text-xs text-muted-foreground">{row.customerCode}</p>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">{row.productCode}</span>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex max-w-56 items-center gap-1.5">
                          <span className="truncate">{row.productName}</span>
                          {row.note && (
                            <span
                              title={row.note}
                              aria-label={`Catatan: ${row.note}`}
                              className="inline-flex shrink-0"
                            >
                              <Info className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatRp(row.standardPrice)}</TableCell>
                      <TableCell className="font-semibold text-emerald-700">{formatRp(row.sellingPrice)}</TableCell>
                      <TableCell>{row.unit}</TableCell>
                      <TableCell>{formatDateID(row.validFrom)}</TableCell>
                      <TableCell>{formatDateID(row.validUntil)}</TableCell>
                      <TableCell>
                        <PricePeriodBadge isActive={row.isActive} validUntil={row.validUntil} todayISO={today} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={!canWrite}
                            title={canWrite ? 'Edit harga' : 'Anda tidak memiliki izin'}
                            aria-label={`Edit harga ${row.customerName} untuk ${row.productName}`}
                            onClick={() => openEdit(row)}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            disabled={!canWrite}
                            title={canWrite ? 'Hapus harga' : 'Anda tidak memiliki izin'}
                            aria-label={`Hapus harga ${row.customerName} untuk ${row.productName}`}
                            onClick={() => setDeleteTarget(row)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog tambah/edit — key memastikan form direset setiap kali dibuka */}
      <PriceFormDialog
        key={`${editing?.id ?? 'new'}-${formOpen}`}
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        customers={customers}
        products={products}
        onSaved={refetch}
      />

      {/* Konfirmasi hapus */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus harga khusus ini?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `Harga khusus ${deleteTarget.customerName} untuk ${deleteTarget.productName} akan dihapus.`
                : 'Harga khusus akan dihapus.'}
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
