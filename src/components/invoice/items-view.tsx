'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Check, ChevronDown, Loader2, Package, Plus, Search, Trash2, UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiJson } from '@/lib/invoice-client'
import { formatIDR } from '@/lib/invoice-format'
import {
  UNIT_OPTIONS,
  type CustomerOption,
  type InvoiceSessionUser,
  type Item,
  type PriceRow,
} from '@/lib/invoice-types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
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

interface ItemFormState {
  name: string
  unit: string
  hpp: string
  hargaJual: string
  keterangan: string
  isActive: boolean
}

const EMPTY_FORM: ItemFormState = {
  name: '', unit: 'pcs', hpp: '', hargaJual: '', keterangan: '', isActive: true,
}

function ActiveBadge({ active }: { active: boolean }) {
  return active
    ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px] shrink-0">Aktif</Badge>
    : <Badge variant="outline" className="bg-stone-100 text-stone-500 border-stone-200 text-[11px] shrink-0">Nonaktif</Badge>
}

/** Untung = harga jual - harga modal (dihitung otomatis). */
function UntungBadge({ jual, modal }: { jual: number; modal: number }) {
  const untung = jual - modal
  const cls = untung > 0 ? 'text-emerald-700' : untung < 0 ? 'text-red-600' : 'text-muted-foreground'
  return <span className={`font-medium ${cls}`}>{formatIDR(untung)}</span>
}

export default function ItemsView({ user }: { user: InvoiceSessionUser }) {
  const canManage = ['superadmin', 'admin', 'manager'].includes(user.role)

  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')

  // Dropdown pilih pelanggan → filter daftar barang pelanggan (checklist Harga Khusus)
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [custOpen, setCustOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [custLoading, setCustLoading] = useState(false)

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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // active=all agar item nonaktif tetap terlihat (bisa diaktifkan kembali)
      const data = await apiJson<{ items: Item[] }>(
        `/api/items?q=${encodeURIComponent(query)}&active=all`
      )
      setItems(data.items)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const raw = await apiJson<Array<Record<string, unknown>>>('/api/customers')
        const c: CustomerOption[] = (Array.isArray(raw) ? raw : []).map((x) => ({
          id: String(x.id ?? ''),
          code: String(x.code ?? '—'),
          name: String(x.name ?? ''),
          phone: String(x.phone ?? x.whatsapp ?? ''),
          email: String(x.email ?? ''),
          address: String(x.address ?? ''),
          isActive: x.isActive !== false,
        }))
        if (!cancelled) setCustomers(c)
      } catch {
        // daftar pelanggan gagal dimuat — dropdown tetap bisa dipakai tanpa filter
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const pickCustomer = async (c: CustomerOption | null) => {
    setCustOpen(false)
    if (!c) {
      setSelectedCustomer(null)
      setCheckedIds(new Set())
      return
    }
    if (selectedCustomer?.id === c.id) return
    setSelectedCustomer(c)
    setCustLoading(true)
    try {
      const data = await apiJson<{ rows: PriceRow[] }>(
        `/api/prices?customerId=${encodeURIComponent(c.id)}`
      )
      // Daftar barang pelanggan = barang yang dicentang di checklist Harga Khusus
      setCheckedIds(new Set(data.rows.filter((r) => r.customPrice != null).map((r) => r.itemId)))
    } catch (e) {
      toast.error(errText(e))
      setSelectedCustomer(null)
      setCheckedIds(new Set())
    } finally {
      setCustLoading(false)
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (it: Item) => {
    if (!canManage || !selectedCustomer) return
    setEditing(it)
    setForm({
      name: it.name,
      unit: it.unit,
      hpp: String(it.hpp),
      hargaJual: String(it.hargaJual),
      keterangan: it.keterangan ?? '',
      isActive: it.isActive,
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Nama barang wajib diisi')
      return
    }
    const modal = Number(form.hpp)
    if (form.hpp === '' || !Number.isFinite(modal) || modal < 0) {
      toast.error('Harga modal wajib diisi (min 0)')
      return
    }
    const jual = Number(form.hargaJual)
    if (form.hargaJual === '' || !Number.isFinite(jual) || jual < 0) {
      toast.error('Harga jual wajib diisi (min 0)')
      return
    }
    setSaving(true)
    try {
      const body = {
        name: form.name.trim(),
        unit: form.unit,
        hpp: modal,
        hargaJual: jual,
        keterangan: form.keterangan.trim(),
        ...(editing ? { isActive: form.isActive } : {}),
        // Kode barang memakai initial nama perusahaan pelanggan yang dipilih
        ...(editing || !selectedCustomer ? {} : { customerId: selectedCustomer.id }),
      }
      if (editing) {
        await apiJson<{ item: Item }>(`/api/items/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        toast.success('Barang berhasil diperbarui')
      } else {
        const created = await apiJson<{ item: Item }>('/api/items', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        // Barang baru yang dibuat saat pelanggan terpilih → langsung terdaftar
        // untuk pelanggan itu (harga = harga jual, fallback harga modal),
        // supaya langsung terlihat di daftar barang pelanggan yang terfilter.
        if (selectedCustomer) {
          try {
            await apiJson('/api/prices', {
              method: 'PUT',
              body: JSON.stringify({
                customerId: selectedCustomer.id,
                entries: [{ itemId: created.item.id, price: jual > 0 ? jual : modal }],
              }),
            })
            setCheckedIds((prev) => new Set(prev).add(created.item.id))
            toast.success(`Barang berhasil ditambahkan & terdaftar untuk ${selectedCustomer.name}`)
          } catch {
            toast.success('Barang berhasil ditambahkan')
          }
        } else {
          toast.success('Barang berhasil ditambahkan')
        }
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
      await apiJson<{ ok: boolean }>(`/api/items/${deleteTarget.id}`, { method: 'DELETE' })
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

  const modalNum = form.hpp === '' ? NaN : Number(form.hpp)
  const jualNum = form.hargaJual === '' ? NaN : Number(form.hargaJual)
  const untungPreview = Number.isFinite(modalNum) && Number.isFinite(jualNum) ? jualNum - modalNum : null
  const untungPct = untungPreview !== null && modalNum > 0 ? Math.round((untungPreview / modalNum) * 100) : null

  // Filter tampil: barang milik pelanggan terpilih saja (yang dicentang di Harga Khusus)
  const visibleItems = useMemo(
    () => (selectedCustomer ? items.filter((it) => checkedIds.has(it.id)) : items),
    [items, selectedCustomer, checkedIds]
  )

  const hasResults = visibleItems.length > 0
  const countLabel = loading
    ? 'Memuat data…'
    : selectedCustomer
      ? custLoading
        ? 'Memuat daftar barang…'
        : `${visibleItems.length} barang terdaftar untuk ${selectedCustomer.name}`
      : `${items.length} barang`

  // Mode "Semua barang" (tanpa pelanggan) = hanya lihat; edit/hapus hanya saat pelanggan dipilih
  const canEdit = canManage && !!selectedCustomer

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Master Barang</h1>
          <p className="text-sm text-muted-foreground mt-1">{countLabel}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Dropdown pilih pelanggan → tampilkan daftar barang pelanggan */}
          <Popover open={custOpen} onOpenChange={setCustOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={custOpen}
                aria-label="Pilih pelanggan"
                className="w-full sm:w-56 justify-between min-h-[44px]"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <UserRound className="h-4 w-4 text-emerald-600 shrink-0" />
                  {selectedCustomer ? (
                    <span className="truncate">{selectedCustomer.name}</span>
                  ) : (
                    <span className="text-muted-foreground">Pilih Pelanggan</span>
                  )}
                </span>
                {custLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="end">
              <Command>
                <CommandInput placeholder="Cari nama pelanggan…" />
                <CommandEmpty>Pelanggan tidak ditemukan.</CommandEmpty>
                <CommandList className="max-h-60 overflow-y-auto scrollbar-thin">
                  <CommandItem value="Semua barang" onSelect={() => void pickCustomer(null)} className="min-h-[44px]">
                    <Check className={cn('mr-2 h-4 w-4 shrink-0', !selectedCustomer ? 'opacity-100 text-emerald-600' : 'opacity-0')} />
                    <span>Semua barang (tanpa filter pelanggan)</span>
                  </CommandItem>
                  {customers.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`${c.name} ${c.code}`}
                      onSelect={() => void pickCustomer(c)}
                      className="min-h-[44px]"
                    >
                      <Check
                        className={cn('mr-2 h-4 w-4 shrink-0', selectedCustomer?.id === c.id ? 'opacity-100 text-emerald-600' : 'opacity-0')}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{c.code}</p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
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
          {selectedCustomer && (
            <Button
              onClick={openCreate}
              disabled={!canManage}
              title={canManage ? `Tambah barang untuk ${selectedCustomer.name}` : 'Hanya Admin/Manager yang dapat menambah'}
              className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px] w-full sm:w-auto"
            >
              <Plus className="h-4 w-4" /> Tambah
            </Button>
          )}
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : !hasResults ? (
          <EmptyState filtered={query !== ''} customerName={selectedCustomer?.name ?? null} />
        ) : (
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-stone-50">
                <TableRow className="bg-stone-50 hover:bg-stone-50">
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama Barang</TableHead>
                  <TableHead className="text-center">Satuan</TableHead>
                  <TableHead className="text-right">Harga Modal</TableHead>
                  <TableHead className="text-right">Harga Jual</TableHead>
                  <TableHead className="text-right">Untung</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead>Status</TableHead>
                  {selectedCustomer && <TableHead className="text-right">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleItems.map((it) => (
                  <TableRow
                    key={it.id}
                    tabIndex={canEdit ? 0 : undefined}
                    aria-label={canEdit ? `Edit ${it.name}` : undefined}
                    className={cn(canEdit && 'cursor-pointer')}
                    onClick={canEdit ? () => openEdit(it) : undefined}
                    onKeyDown={canEdit ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openEdit(it)
                      }
                    } : undefined}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{it.code}</TableCell>
                    <TableCell className="font-medium">{it.name}</TableCell>
                    <TableCell className="text-center">{it.unit}</TableCell>
                    <TableCell className="text-right whitespace-nowrap font-medium">{formatIDR(it.hpp)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap font-medium">{formatIDR(it.hargaJual)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap"><UntungBadge jual={it.hargaJual} modal={it.hpp} /></TableCell>
                    <TableCell className="max-w-[220px]">
                      <span className="block truncate text-sm text-muted-foreground" title={it.keterangan || undefined}>
                        {it.keterangan || '-'}
                      </span>
                    </TableCell>
                    <TableCell><ActiveBadge active={it.isActive} /></TableCell>
                    {selectedCustomer && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-destructive hover:text-destructive"
                          disabled={!canManage}
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteTarget(it)
                          }}
                          aria-label={`Hapus ${it.name}`}
                          title="Hapus"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
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
          <EmptyState filtered={query !== ''} customerName={selectedCustomer?.name ?? null} />
        ) : (
          visibleItems.map((it) => (
            <Card
              key={it.id}
              role={canEdit ? 'button' : undefined}
              tabIndex={canEdit ? 0 : undefined}
              aria-label={canEdit ? `Edit ${it.name}` : undefined}
              className={cn('p-0 gap-0', canEdit && 'cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 outline-none')}
              onClick={canEdit ? () => openEdit(it) : undefined}
              onKeyDown={canEdit ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openEdit(it)
                }
              } : undefined}
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{it.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{it.code}</p>
                  </div>
                  <ActiveBadge active={it.isActive} />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <p className="text-muted-foreground">Harga Modal: <span className="font-semibold text-stone-700">{formatIDR(it.hpp)}</span></p>
                  <p className="text-muted-foreground">Harga Jual: <span className="font-semibold text-stone-700">{formatIDR(it.hargaJual)}</span></p>
                  <p className="text-muted-foreground">Untung: <UntungBadge jual={it.hargaJual} modal={it.hpp} /></p>
                  <p className="text-muted-foreground">Satuan: <span className="font-medium text-stone-700">{it.unit}</span></p>
                </div>
                {it.keterangan && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{it.keterangan}</p>
                )}
                {selectedCustomer && (
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 min-h-[44px] text-destructive border-stone-200 hover:bg-destructive/10 hover:text-destructive"
                      disabled={!canManage}
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteTarget(it)
                      }}
                    >
                      <Trash2 className="h-4 w-4" /> Hapus
                    </Button>
                  </div>
                )}
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
                : selectedCustomer
                  ? `Kode otomatis dari initial perusahaan ${selectedCustomer.name}. Barang langsung terdaftar untuk pelanggan ini.`
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
                <Label htmlFor="item-hpp">Harga Modal (Rp) <span className="text-destructive">*</span></Label>
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
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="item-harga-jual">Harga Jual (Rp) <span className="text-destructive">*</span></Label>
                <Input
                  id="item-harga-jual"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step="any"
                  value={form.hargaJual}
                  onChange={(e) => setForm((f) => ({ ...f, hargaJual: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Untung</Label>
                <div aria-live="polite" className="flex items-center min-h-[44px] rounded-md border border-stone-200 bg-stone-50 px-3 text-sm">
                  {untungPreview === null ? (
                    <span className="text-muted-foreground">Isi harga modal &amp; harga jual</span>
                  ) : (
                    <span className={
                      untungPreview > 0 ? 'font-medium text-emerald-700' : untungPreview < 0 ? 'font-medium text-red-600' : 'text-muted-foreground'
                    }>
                      {formatIDR(untungPreview)}{untungPct !== null ? ` (${untungPct}%)` : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="item-keterangan">Keterangan</Label>
              <Input
                id="item-keterangan"
                value={form.keterangan}
                onChange={(e) => setForm((f) => ({ ...f, keterangan: e.target.value }))}
                placeholder="Keterangan tambahan (opsional)"
                autoComplete="off"
              />
            </div>
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
      {customerName ? (
        <>
          <p className="text-sm font-medium">Belum ada barang untuk {customerName}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Centang barang di menu Harga Khusus agar masuk daftar barang pelanggan ini.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium">{filtered ? 'Tidak ditemukan' : 'Belum ada barang'}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {filtered
              ? 'Coba kata kunci lain.'
              : 'Pilih pelanggan terlebih dahulu untuk menambah barang.'}
          </p>
        </>
      )}
    </div>
  )
}
