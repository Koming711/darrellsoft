'use client'

import * as React from 'react'
import { Package, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { api } from '@/lib/client-api'
import type { ProductDTO } from '@/lib/types'
import { useAppStore } from '@/store/app-store'
import { useCan } from '@/hooks/use-can'
import { useToast } from '@/hooks/use-toast'
import { formatNumberID, formatRp } from '@/lib/money'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { MoneyInput } from '@/components/shared/money-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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

interface ProductFormState {
  code: string
  name: string
  unit: string
  costPrice: string | null
  sellingPrice: string | null
  stock: string
  isActive: boolean
}

const EMPTY_FORM: ProductFormState = {
  code: '',
  name: '',
  unit: '',
  costPrice: null,
  sellingPrice: null,
  stock: '0',
  isActive: true,
}

const HEAD_CELL = 'bg-zinc-50 px-3 py-2.5 text-xs uppercase tracking-wide text-muted-foreground'
const BODY_CELL = 'px-3 py-2.5'

export default function ProductsPage() {
  const { toast } = useToast()
  const can = useCan()
  const canWrite = can('products:write')
  const companyId = useAppStore((s) => s.companyId)
  const userId = useAppStore((s) => s.userId)

  const [products, setProducts] = React.useState<ProductDTO[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [debouncedSearch, setDebouncedSearch] = React.useState('')
  const [refreshTick, setRefreshTick] = React.useState(0)

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ProductDTO | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [form, setForm] = React.useState<ProductFormState>(EMPTY_FORM)

  const [deleteTarget, setDeleteTarget] = React.useState<ProductDTO | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  // Debounce pencarian 300ms
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // Muat daftar produk (reload saat sesi perusahaan/pengguna berubah)
  React.useEffect(() => {
    if (!companyId || !userId) return
    let cancelled = false
    setLoading(true)
    api<ProductDTO[]>('/api/products', { params: { q: debouncedSearch, includeInactive: '1' } })
      .then((rows) => {
        if (cancelled) return
        setProducts(rows)
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        toast({ title: 'Gagal memuat produk', description: (e as Error).message, variant: 'destructive' })
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [companyId, userId, debouncedSearch, refreshTick, toast])

  const openAdd = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (p: ProductDTO) => {
    setEditing(p)
    setForm({
      code: p.code,
      name: p.name,
      unit: p.unit,
      costPrice: p.costPrice,
      sellingPrice: p.sellingPrice,
      stock: String(p.stock),
      isActive: p.isActive,
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.unit.trim()) {
      toast({ title: 'Validasi gagal', description: 'Kode, nama, dan satuan produk wajib diisi.', variant: 'destructive' })
      return
    }
    if (form.costPrice === null || form.sellingPrice === null) {
      toast({ title: 'Validasi gagal', description: 'Harga pokok dan harga jual standar wajib diisi.', variant: 'destructive' })
      return
    }
    const stockNum = form.stock.trim() === '' ? 0 : Number(form.stock)
    if (!Number.isFinite(stockNum) || stockNum < 0) {
      toast({ title: 'Validasi gagal', description: 'Stok harus berupa angka 0 atau lebih.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const body = {
        code: form.code.trim(),
        name: form.name.trim(),
        unit: form.unit.trim(),
        sellingPrice: form.sellingPrice,
        costPrice: form.costPrice,
        stock: Math.max(0, Math.floor(stockNum)),
        isActive: form.isActive,
      }
      if (editing) {
        await api<ProductDTO>(`/api/products/${editing.id}`, { method: 'PUT', body })
        toast({ title: 'Berhasil', description: `Produk "${body.name}" berhasil diperbarui.` })
      } else {
        await api<ProductDTO>('/api/products', { method: 'POST', body })
        toast({ title: 'Berhasil', description: `Produk "${body.name}" berhasil ditambahkan.` })
      }
      setDialogOpen(false)
      setRefreshTick((t) => t + 1)
    } catch (e) {
      toast({ title: 'Gagal menyimpan produk', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteConfirm = async () => {
    const target = deleteTarget
    if (!target) return
    setDeleting(true)
    try {
      await api<void>(`/api/products/${target.id}`, { method: 'DELETE' })
      toast({ title: 'Berhasil', description: `Produk "${target.name}" berhasil dihapus.` })
      setDeleteTarget(null)
      setRefreshTick((t) => t + 1)
    } catch (e) {
      toast({ title: 'Gagal menghapus produk', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  const showSkeleton = loading && products.length === 0

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Produk"
        description="Master barang: harga standar & harga pokok untuk margin."
        actions={
          canWrite ? (
            <Button onClick={openAdd}>
              <Plus />
              Tambah Produk
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kode atau nama produk..."
            aria-label="Cari produk"
            className="pl-9"
          />
        </div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {loading ? 'Memuat...' : `${products.length} produk`}
        </p>
      </div>

      {showSkeleton ? (
        <div className="rounded-lg border bg-white p-4">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-lg border bg-white">
          <EmptyState
            icon={Package}
            title={debouncedSearch ? 'Tidak ada produk yang cocok' : 'Belum ada produk'}
            description={
              debouncedSearch
                ? `Tidak ditemukan produk untuk pencarian "${debouncedSearch}".`
                : 'Tambahkan produk beserta harga standar dan harga pokoknya.'
            }
            action={
              canWrite && !debouncedSearch ? { label: 'Tambah Produk', onClick: openAdd } : undefined
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white">
          <div className="max-h-[65vh] overflow-y-auto">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={HEAD_CELL}>Kode</TableHead>
                    <TableHead className={HEAD_CELL}>Nama</TableHead>
                    <TableHead className={HEAD_CELL}>Satuan</TableHead>
                    <TableHead className={HEAD_CELL}>Harga Pokok</TableHead>
                    <TableHead className={HEAD_CELL}>Harga Jual Standar</TableHead>
                    <TableHead className={HEAD_CELL}>Stok</TableHead>
                    <TableHead className={HEAD_CELL}>Status</TableHead>
                    <TableHead className={`${HEAD_CELL} text-right`}>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className={`${BODY_CELL} font-mono text-[13px]`}>{p.code}</TableCell>
                      <TableCell className={`${BODY_CELL} font-medium`}>{p.name}</TableCell>
                      <TableCell className={BODY_CELL}>{p.unit}</TableCell>
                      <TableCell className={BODY_CELL}>{formatRp(p.costPrice)}</TableCell>
                      <TableCell className={`${BODY_CELL} font-semibold`}>{formatRp(p.sellingPrice)}</TableCell>
                      <TableCell className={BODY_CELL}>{formatNumberID(p.stock)}</TableCell>
                      <TableCell className={BODY_CELL}>
                        {p.isActive ? (
                          <Badge variant="outline" className="border-emerald-200 bg-emerald-100 text-emerald-800">
                            Aktif
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Nonaktif
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className={`${BODY_CELL} text-right`}>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(p)}
                            disabled={!canWrite}
                            title={canWrite ? 'Edit produk' : 'Anda tidak memiliki izin'}
                          >
                            <Pencil />
                            <span className="sr-only">Edit {p.name}</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(p)}
                            disabled={!canWrite}
                            title={canWrite ? 'Hapus produk' : 'Anda tidak memiliki izin'}
                          >
                            <Trash2 />
                            <span className="sr-only">Hapus {p.name}</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {/* Dialog tambah / edit produk */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o && !saving) setDialogOpen(false)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Produk' : 'Tambah Produk'}</DialogTitle>
            <DialogDescription>
              {editing
                ? `Perbarui data produk ${editing.name}.`
                : 'Isi data produk baru beserta harga standar dan harga pokoknya.'}
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              void handleSave()
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="product-code">
                  Kode <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="product-code"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="PRD-001"
                  disabled={saving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="product-name">
                  Nama <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="product-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Semen 50kg"
                  disabled={saving}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="product-unit">
                  Satuan <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="product-unit"
                  value={form.unit}
                  onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                  placeholder="pcs"
                  disabled={saving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="product-stock">Stok</Label>
                <Input
                  id="product-stock"
                  type="number"
                  min={0}
                  step="1"
                  inputMode="numeric"
                  value={form.stock}
                  onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                  placeholder="0"
                  disabled={saving}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="product-cost">
                  Harga Pokok <span className="text-destructive">*</span>
                </Label>
                <MoneyInput
                  id="product-cost"
                  value={form.costPrice}
                  onChange={(v) => setForm((f) => ({ ...f, costPrice: v }))}
                  disabled={saving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="product-selling">
                  Harga Jual Standar <span className="text-destructive">*</span>
                </Label>
                <MoneyInput
                  id="product-selling"
                  value={form.sellingPrice}
                  onChange={(v) => setForm((f) => ({ ...f, sellingPrice: v }))}
                  disabled={saving}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <Label htmlFor="product-active">Produk aktif</Label>
                <p className="text-xs text-muted-foreground">Nonaktifkan bila produk tidak lagi dijual.</p>
              </div>
              <Switch
                id="product-active"
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                disabled={saving}
              />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Harga jual standar dipakai otomatis pada invoice saat customer belum memiliki harga khusus.
              Harga pokok dipakai untuk perhitungan margin dan tidak berubah oleh harga jual.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                Batal
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog konfirmasi hapus */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o && !deleting) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus produk {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Tindakan ini tidak dapat dibatalkan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void handleDeleteConfirm()
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
