'use client'

/**
 * BarangView — porting dari workspace upload "Aplikasi Invoice & Pembukuan"
 * (src/components/master/products-view.tsx, file upload workspace-d2498c56).
 *
 * Adaptasi ke aplikasi Darrellsoft (data tetap SATU sumber: tabel Barang via
 * /api/items — tanpa master baru, sesuai aturan spec):
 * - Sumber data : GET /api/items?active=all → dipetakan ke bentuk Product
 *                 (qty→stock, hpp→costPrice, jual→sellPrice, customers[]→customerPrices).
 * - Mutasi      : POST/PUT/DELETE /api/items (kode ITM-xxx otomatis dr server).
 * - Toast       : sonner (standar aplikasi ini) menggantikan @/hooks/use-toast.
 * - TanStack Query dipertahankan; QueryClientProvider dipasang lokal di /barang.
 * - stockMin TIDAK dipakai (model Barang tak punya kolom tsb) — form edit
 *   menyediakan Stok (Qty) langsung; peringatan "menipis" mengikuti stok 0.
 * - Hak akses   : canAdd/canEdit/canDelete dr Matriks Hak Akses (fitur 'barang').
 */

import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Package, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { notifyDataChange } from '@/lib/data-sync'
import { formatIDR, formatNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

// ===== Helper API — kontrak sama dengan file sumber (api.get/post/put/del),
// namun lewat apiFetch aplikasi ini (header sesi x-user-id otomatis). =====
const api = {
  get: <T,>(url: string) => apiFetch<T>(url),
  post: <T,>(url: string, body: unknown) =>
    apiFetch<T>(url, { method: 'POST', body: JSON.stringify(body) }),
  put: <T,>(url: string, body: unknown) =>
    apiFetch<T>(url, { method: 'PUT', body: JSON.stringify(body) }),
  del: <T,>(url: string) => apiFetch<T>(url, { method: 'DELETE' }),
}

// ===== Bentuk Product (dr file sumber) + pemetaan dr Item (/api/items) =====
interface Product {
  id: string
  name: string
  unit: string
  stock: number
  costPrice: number
  sellPrice: number
  /** Dipakai sbg jumlah harga khusus (badge) — di aplikasi ini = customers[] */
  customerPrices: { id: string }[]
}

interface ItemResponse {
  id: string
  name: string
  unit: string
  qty: number
  hpp: number
  standardPrice: number
  customers?: { id: string }[]
}

function toProduct(it: ItemResponse): Product {
  return {
    id: it.id,
    name: it.name,
    unit: it.unit || 'pcs',
    stock: it.qty ?? 0,
    costPrice: it.hpp ?? 0,
    sellPrice: it.standardPrice ?? 0,
    customerPrices: (it.customers ?? []).map((c) => ({ id: c.id })),
  }
}

async function fetchProducts(): Promise<Product[]> {
  // active=all agar barang nonaktif tetap terlihat & bisa diaktifkan kembali
  const data = await api.get<{ items: ItemResponse[] }>('/api/items?active=all')
  return (data.items ?? []).map(toProduct)
}

interface ProductFormState {
  name: string
  unit: string
  costPrice: string
  sellPrice: string
  stock: string
}

const EMPTY_FORM: ProductFormState = { name: '', unit: '', costPrice: '', sellPrice: '', stock: '' }

const fmtPct = (n: number) =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(n)

/** Status stok sederhana: 0 = HABIS (rose), selain itu AMAN (emerald). */
const stockStatus = (stock: number) => (stock <= 0 ? 'HABIS' : 'AMAN')

const STOCK_CLS: Record<string, string> = {
  HABIS: 'text-rose-600',
  AMAN: 'text-emerald-700',
}

interface BarangViewProps {
  /** Izin granular Matriks Hak Akses (fitur 'barang'); undefined = akses penuh */
  canAdd?: boolean
  canEdit?: boolean
  canDelete?: boolean
}

export default function BarangView({ canAdd = true, canEdit = true, canDelete = true }: BarangViewProps) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: fetchProducts,
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return products
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.unit.toLowerCase().includes(q)
    )
  }, [products, search])

  // Hint margin live di footer dialog (margin = jual - modal, % = margin/jual * 100)
  const marginInfo = useMemo(() => {
    const cost = Number(form.costPrice)
    const sell = Number(form.sellPrice)
    const costOk = form.costPrice.trim() !== '' && Number.isFinite(cost) && cost >= 0
    const sellOk = form.sellPrice.trim() !== '' && Number.isFinite(sell) && sell >= 0
    if (!costOk || !sellOk) return null
    const margin = sell - cost
    const pct = sell > 0 ? (margin / sell) * 100 : null
    return { margin, pct }
  }, [form.costPrice, form.sellPrice])

  const saveMutation = useMutation({
    mutationFn: (payload: { id?: string; data: ProductFormState }) => {
      // Pemetaan ke /api/items: sellPrice→standardPrice, costPrice→hpp, stock→qty
      const body: Record<string, unknown> = {
        name: payload.data.name.trim(),
        unit: payload.data.unit.trim() || 'pcs',
        standardPrice: Number(payload.data.sellPrice),
        hpp: Number(payload.data.costPrice),
        qty: Number(payload.data.stock || 0),
      }
      return payload.id
        ? api.put<ItemResponse>(`/api/items/${payload.id}`, body)
        : api.post<ItemResponse>('/api/items', body)
    },
    onSuccess: (_data, vars) => {
      toast.success(vars.id ? 'Barang diperbarui' : 'Barang ditambahkan', {
        description: vars.data.name.trim(),
      })
      setDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ['products'] })
      // Sinkron antar halaman (Master Produk / invoice / harga customer)
      notifyDataChange('items')
    },
    onError: (err: Error) =>
      toast.error('Gagal menyimpan barang', { description: err.message }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/api/items/${id}`),
    onSuccess: () => {
      toast.success('Barang dihapus')
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ['products'] })
      notifyDataChange('items')
    },
    onError: (err: Error) => {
      toast.error('Gagal menghapus barang', { description: err.message })
      setDeleteTarget(null)
    },
  })

  const openAdd = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setDialogOpen(true)
  }

  const openEdit = (p: Product) => {
    setEditing(p)
    setForm({
      name: p.name,
      unit: p.unit ?? '',
      costPrice: String(p.costPrice ?? ''),
      sellPrice: String(p.sellPrice ?? ''),
      stock: String(p.stock ?? ''),
    })
    setFormError('')
    setDialogOpen(true)
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const name = form.name.trim()
    const cost = Number(form.costPrice)
    const sell = Number(form.sellPrice)
    const stock = Number(form.stock || 0)
    if (!name) {
      setFormError('Nama barang wajib diisi')
      return
    }
    if (form.costPrice.trim() === '' || !Number.isFinite(cost) || cost < 0) {
      setFormError('Harga modal tidak valid (minimal 0)')
      return
    }
    if (form.sellPrice.trim() === '' || !Number.isFinite(sell) || sell < 0) {
      setFormError('Harga jual tidak valid (minimal 0)')
      return
    }
    if (!Number.isFinite(stock) || stock < 0) {
      setFormError('Stok tidak valid (minimal 0)')
      return
    }
    setFormError('')
    saveMutation.mutate({ id: editing?.id, data: form })
  }

  const isPending = saveMutation.isPending
  const hasData = products.length > 0

  return (
    <div className="flex flex-col gap-4">
      {/* Header: pencarian + tombol tambah */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari barang..."
            aria-label="Cari barang"
            className="pl-9"
          />
        </div>
        {canAdd && (
          <Button onClick={openAdd} className="shrink-0">
            <Plus aria-hidden />
            Tambah Barang
          </Button>
        )}
      </div>

      {/* Konten */}
      {isLoading ? (
        <div className="space-y-2" role="status" aria-label="Memuat barang">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Package className="h-6 w-6 text-muted-foreground" aria-hidden />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">{hasData ? 'Tidak ada hasil' : 'Belum ada barang'}</p>
            <p className="text-sm text-muted-foreground">
              {hasData
                ? `Tidak ada barang yang cocok dengan pencarian "${search}".`
                : 'Tambahkan barang pertama Anda beserta harga modal dan harga jualnya.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Tabel (desktop) */}
          <div className="hidden overflow-x-auto rounded-md border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Satuan</TableHead>
                  <TableHead className="text-right">Stok</TableHead>
                  <TableHead className="text-right">Harga Modal</TableHead>
                  <TableHead className="text-right">Harga Jual</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-center">Harga Khusus</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const margin = (p.sellPrice ?? 0) - (p.costPrice ?? 0)
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground">{p.unit}</TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-semibold tabular-nums',
                          STOCK_CLS[stockStatus(p.stock)] ?? 'text-emerald-700'
                        )}
                      >
                        {formatNum(p.stock ?? 0)} {p.unit || ''}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatIDR(p.costPrice)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatIDR(p.sellPrice)}</TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-medium tabular-nums',
                          margin > 0 ? 'text-emerald-600' : margin < 0 ? 'text-rose-600' : 'text-muted-foreground'
                        )}
                      >
                        {formatIDR(margin)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={p.customerPrices?.length ? 'secondary' : 'outline'}>
                          {p.customerPrices?.length ?? 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-11 w-11 p-0"
                              aria-label={`Edit barang ${p.name}`}
                              onClick={() => openEdit(p)}
                            >
                              <Pencil className="text-muted-foreground" aria-hidden />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-11 w-11 p-0"
                              aria-label={`Hapus barang ${p.name}`}
                              onClick={() => setDeleteTarget(p)}
                            >
                              <Trash2 className="text-rose-600" aria-hidden />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Kartu (mobile) */}
          <div className="flex flex-col gap-3 md:hidden">
            {filtered.map((p) => {
              const margin = (p.sellPrice ?? 0) - (p.costPrice ?? 0)
              return (
                <Card key={p.id} className="gap-3 py-4">
                  <CardContent className="flex flex-col gap-3 px-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium leading-snug">{p.name}</p>
                        <p className="text-sm text-muted-foreground">Satuan: {p.unit || '-'}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {canEdit && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-11 w-11 p-0"
                            aria-label={`Edit barang ${p.name}`}
                            onClick={() => openEdit(p)}
                          >
                            <Pencil aria-hidden />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-11 w-11 p-0"
                            aria-label={`Hapus barang ${p.name}`}
                            onClick={() => setDeleteTarget(p)}
                          >
                            <Trash2 className="text-rose-600" aria-hidden />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Stok</span>
                        <span
                          className={cn(
                            'font-semibold tabular-nums',
                            STOCK_CLS[stockStatus(p.stock)] ?? 'text-emerald-700'
                          )}
                        >
                          {formatNum(p.stock ?? 0)} {p.unit || ''}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Harga Modal</span>
                        <span className="tabular-nums">{formatIDR(p.costPrice)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Harga Jual</span>
                        <span className="font-semibold tabular-nums">{formatIDR(p.sellPrice)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Margin</span>
                        <span
                          className={cn(
                            'font-medium tabular-nums',
                            margin > 0 ? 'text-emerald-600' : margin < 0 ? 'text-rose-600' : 'text-muted-foreground'
                          )}
                        >
                          {formatIDR(margin)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Harga Khusus</span>
                        <Badge variant={p.customerPrices?.length ? 'secondary' : 'outline'}>
                          {p.customerPrices?.length ?? 0}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {/* Dialog tambah/edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Barang' : 'Tambah Barang'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Perbarui informasi barang berikut.'
                : 'Isi nama barang beserta harga modal dan harga jual.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="product-name">
                Nama Barang <span className="text-rose-600">*</span>
              </Label>
              <Input
                id="product-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Contoh: Paper Bowl 500ml"
                aria-invalid={!!formError && form.name.trim() === ''}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="product-unit">Satuan</Label>
              <Input
                id="product-unit"
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                placeholder="pcs"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="product-cost">
                  Harga Modal <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="product-cost"
                  type="number"
                  min={0}
                  step="any"
                  value={form.costPrice}
                  onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
                  placeholder="0"
                  inputMode="numeric"
                  className="text-right tabular-nums"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="product-sell">
                  Harga Jual <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="product-sell"
                  type="number"
                  min={0}
                  step="any"
                  value={form.sellPrice}
                  onChange={(e) => setForm((f) => ({ ...f, sellPrice: e.target.value }))}
                  placeholder="0"
                  inputMode="numeric"
                  className="text-right tabular-nums"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="product-stock">Stok (Qty)</Label>
              <Input
                id="product-stock"
                type="number"
                min={0}
                step="any"
                value={form.stock}
                onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                placeholder="0"
                inputMode="decimal"
                className="text-right tabular-nums"
              />
              <p className="text-xs text-muted-foreground">
                {editing
                  ? 'Stok saat ini tercantum di kolom Stok — ubah lewat kolom ini bila perlu.'
                  : 'Stok awal barang; kelola harga & stok di tabel barang.'}
              </p>
            </div>
            {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
            <DialogFooter className="flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p
                className={cn(
                  'text-sm font-medium',
                  marginInfo
                    ? marginInfo.margin > 0
                      ? 'text-emerald-600'
                      : marginInfo.margin < 0
                        ? 'text-rose-600'
                        : 'text-muted-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {marginInfo
                  ? `Margin: ${formatIDR(marginInfo.margin)}${
                      marginInfo.pct !== null ? ` (${fmtPct(marginInfo.pct)}%)` : ''
                    }`
                  : 'Margin akan muncul saat harga diisi.'}
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={isPending}>
                  Batal
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Menyimpan...' : 'Simpan'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Konfirmasi hapus */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus barang ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Barang &quot;{deleteTarget?.name}&quot; akan dihapus permanen. Tindakan tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault()
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
              }}
            >
              {deleteMutation.isPending ? 'Menghapus...' : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
