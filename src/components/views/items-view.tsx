'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Package, Pencil, Plus, Search, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { formatIDR, formatNum } from '@/lib/format'
import { UNIT_OPTIONS, type Item, type SessionUser } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
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

interface CustomerOption {
  id: string
  name: string
  companyName: string | null
}

interface ItemFormState {
  name: string
  unit: string
  standardPrice: string
  hpp: string
  isActive: boolean
}

const EMPTY_FORM: ItemFormState = {
  name: '', unit: 'pcs', standardPrice: '', hpp: '', isActive: true,
}

function ActiveBadge({ active }: { active: boolean }) {
  return active
    ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px] shrink-0">Aktif</Badge>
    : <Badge variant="outline" className="bg-stone-100 text-stone-500 border-stone-200 text-[11px] shrink-0">Nonaktif</Badge>
}

export default function ItemsView({ user }: { user: SessionUser }) {
  const canManage = user.role !== 'KASIR'
  const showHpp = user.role !== 'KASIR'

  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')

  // Pilih Customer — filter daftar barang per pelanggan (barang terdaftar)
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [customerId, setCustomerId] = useState<string>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [form, setForm] = useState<ItemFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setQuery(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    apiFetch<CustomerOption[]>('/api/customers')
      .then((data) => setCustomers(Array.isArray(data) ? data : []))
      .catch(() => setCustomers([]))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // active=all agar item nonaktif tetap terlihat (bisa diaktifkan kembali)
      const cs = customerId !== 'all' ? `&customerId=${encodeURIComponent(customerId)}` : ''
      const data = await apiFetch<{ items: Item[] }>(
        `/api/items?q=${encodeURIComponent(query)}&active=all${cs}`
      )
      setItems(data.items)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setLoading(false)
    }
  }, [query, customerId])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (it: Item) => {
    setEditing(it)
    setForm({
      name: it.name,
      unit: it.unit,
      standardPrice: String(it.standardPrice),
      hpp: it.hpp != null ? String(it.hpp) : '',
      isActive: it.isActive,
    })
    setDialogOpen(true)
  }

  // Profit = harga jual − HPP; Margin = profit / harga jual × 100
  const marginInfo = (() => {
    const std = Number(form.standardPrice)
    const hpp = Number(form.hpp)
    if (form.standardPrice === '' || form.hpp === '' || !Number.isFinite(std) || !Number.isFinite(hpp) || std <= 0) {
      return null
    }
    const profit = std - hpp
    const margin = (profit / std) * 100
    return { profit, margin, negative: margin < 0 }
  })()

  const handleSave = async () => {
    const std = Number(form.standardPrice)
    if (!form.name.trim()) {
      toast.error('Nama barang wajib diisi')
      return
    }
    if (form.standardPrice === '' || !Number.isFinite(std) || std < 0) {
      toast.error('Harga jual wajib diisi (min 0)')
      return
    }
    const hppNum = form.hpp === '' ? null : Number(form.hpp)
    if (hppNum !== null && (!Number.isFinite(hppNum) || hppNum < 0)) {
      toast.error('HPP tidak boleh negatif')
      return
    }
    setSaving(true)
    try {
      const body = {
        name: form.name.trim(),
        unit: form.unit,
        standardPrice: std,
        hpp: showHpp ? hppNum : null,
        ...(editing ? { isActive: form.isActive } : { customerId: customerId !== 'all' ? customerId : undefined }),
      }
      const selectedCustomer = customers.find((c) => c.id === customerId)
      if (editing) {
        await apiFetch<{ item: Item }>(`/api/items/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        toast.success('Barang berhasil diperbarui')
      } else {
        await apiFetch<{ item: Item }>('/api/items', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        toast.success(
          selectedCustomer
            ? `Barang berhasil ditambahkan untuk ${selectedCustomer.name}`
            : 'Barang berhasil ditambahkan'
        )
      }
      setDialogOpen(false)
      void load()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiFetch<{ ok: boolean }>(`/api/items/${deleteTarget.id}`, { method: 'DELETE' })
      toast.success('Barang berhasil dihapus')
      setDeleteTarget(null)
      void load()
    } catch (e) {
      // 409 → item dipakai di invoice
      toast.error(errText(e))
    } finally {
      setDeleting(false)
    }
  }

  const hasResults = items.length > 0
  const selectedCustomerName = customers.find((c) => c.id === customerId)?.name ?? null
  const countLabel = loading
    ? 'Memuat data…'
    : selectedCustomerName
      ? `${items.length} barang untuk ${selectedCustomerName}`
      : `${items.length} barang`

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Master Barang</h1>
          <p className="text-sm text-muted-foreground mt-1">{countLabel}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="sm:w-56">
            <Select value={customerId} onValueChange={(v) => setCustomerId(v || 'all')}>
              <SelectTrigger className="w-full min-h-[44px] bg-white" aria-label="Pilih Customer">
                <SelectValue placeholder="Pilih Customer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Barang</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}{c.companyName ? ` — ${c.companyName}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari nama / kode barang…"
              aria-label="Cari barang"
              className="pl-9 min-h-[44px]"
            />
          </div>
          <Button
            onClick={openCreate}
            disabled={!canManage}
            title={canManage ? 'Tambah barang' : 'Hanya Admin/Manager yang dapat menambah'}
            className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px] w-full sm:w-auto"
          >
            <Plus className="h-4 w-4" /> Tambah
          </Button>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : !hasResults ? (
          <EmptyState filtered={query !== ''} customerName={selectedCustomerName} />
        ) : (
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-stone-50">
                <TableRow className="bg-stone-50 hover:bg-stone-50">
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead className="text-center">Satuan</TableHead>
                  <TableHead className="text-right">Harga Standar</TableHead>
                  {showHpp && <TableHead className="text-right">HPP</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{it.code}</TableCell>
                    <TableCell className="font-medium">{it.name}</TableCell>
                    <TableCell className="text-center">{it.unit}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatIDR(it.standardPrice)}</TableCell>
                    {showHpp && (
                      <TableCell className="text-right whitespace-nowrap">
                        {it.hpp != null ? formatIDR(it.hpp) : '-'}
                      </TableCell>
                    )}
                    <TableCell><ActiveBadge active={it.isActive} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          disabled={!canManage}
                          onClick={() => openEdit(it)}
                          aria-label={`Edit ${it.name}`}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-destructive hover:text-destructive"
                          disabled={!canManage}
                          onClick={() => setDeleteTarget(it)}
                          aria-label={`Hapus ${it.name}`}
                          title="Hapus"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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
          [1, 2, 3].map((i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)
        ) : !hasResults ? (
          <EmptyState filtered={query !== ''} customerName={selectedCustomerName} />
        ) : (
          items.map((it) => (
            <Card key={it.id} className="p-0 gap-0">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{it.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{it.code}</p>
                  </div>
                  <ActiveBadge active={it.isActive} />
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <p className="text-muted-foreground">Satuan: <span className="font-medium text-stone-700">{it.unit}</span></p>
                  <p className="text-muted-foreground">Harga: <span className="font-semibold text-stone-700">{formatIDR(it.standardPrice)}</span></p>
                </div>
                {showHpp && (
                  <p className="text-sm text-muted-foreground">
                    HPP: <span className="font-medium text-stone-700">{it.hpp != null ? formatIDR(it.hpp) : '-'}</span>
                  </p>
                )}
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 min-h-[44px]"
                    disabled={!canManage}
                    onClick={() => openEdit(it)}
                  >
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 min-h-[44px] text-destructive border-stone-200 hover:bg-destructive/10 hover:text-destructive"
                    disabled={!canManage}
                    onClick={() => setDeleteTarget(it)}
                  >
                    <Trash2 className="h-4 w-4" /> Hapus
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Dialog create / edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Barang' : 'Tambah Barang'}</DialogTitle>
            <DialogDescription>
              {editing
                ? `Kode ${editing.code} — perbarui data barang.`
                : selectedCustomerName
                  ? `Kode barang dibuat otomatis. Barang akan didaftarkan untuk ${selectedCustomerName}.`
                  : 'Kode barang dibuat otomatis oleh sistem.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="item-name">Nama Barang <span className="text-destructive">*</span></Label>
              <Input
                id="item-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nama barang / layanan"
                autoComplete="off"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="item-unit">Satuan</Label>
                <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}>
                  <SelectTrigger id="item-unit" className="w-full min-h-[44px]" aria-label="Satuan barang">
                    <SelectValue placeholder="Pilih satuan" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="item-price">Harga Jual (Rp) <span className="text-destructive">*</span></Label>
                <Input
                  id="item-price"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step="any"
                  value={form.standardPrice}
                  onChange={(e) => setForm((f) => ({ ...f, standardPrice: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>
            {showHpp && (
              <div className="grid gap-1.5">
                <Label htmlFor="item-hpp">HPP / Harga Pokok (Rp)</Label>
                <Input
                  id="item-hpp"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step="any"
                  value={form.hpp}
                  onChange={(e) => setForm((f) => ({ ...f, hpp: e.target.value }))}
                  placeholder="0"
                />
                {marginInfo && (
                  <div className={`text-xs rounded-md px-2 py-1.5 ${marginInfo.negative ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                    Profit: <span className="font-semibold">{formatIDR(marginInfo.profit)}</span>
                    {' '}(Margin: {formatNum(marginInfo.margin, 1)}%)
                  </div>
                )}
              </div>
            )}
            {editing && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 p-3">
                <div>
                  <Label htmlFor="item-active">Status Aktif</Label>
                  <p className="text-xs text-muted-foreground">Nonaktif = tidak muncul saat buat invoice.</p>
                </div>
                <Switch
                  id="item-active"
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                  className="data-[state=checked]:bg-emerald-600"
                />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving} className="min-h-[44px]">
              Batal
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px]"
            >
              {saving ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog hapus */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus barang?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name} akan dihapus permanen. Jika barang pernah dipakai di invoice,
              penghapusan akan ditolak sistem — gunakan opsi Nonaktifkan sebagai gantinya.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); void handleDelete() }}
            >
              {deleting ? 'Menghapus…' : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function EmptyState({ filtered, customerName }: { filtered: boolean; customerName?: string | null }) {
  return (
    <div className="text-center py-12 px-4">
      <Package className="h-10 w-10 text-stone-300 mx-auto mb-2" />
      <p className="text-sm font-medium">
        {filtered ? 'Tidak ditemukan' : customerName ? `Belum ada barang untuk ${customerName}` : 'Belum ada barang'}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        {filtered
          ? 'Coba kata kunci lain.'
          : customerName
            ? `Pilih "Semua Barang" untuk melihat semua, atau tambah barang saat pelanggan ini dipilih.`
            : 'Tambahkan barang pertama Anda dengan tombol "+ Tambah".'}
      </p>
    </div>
  )
}
