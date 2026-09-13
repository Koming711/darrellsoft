'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  Copy, Package, Pencil, Plus, RefreshCw, Search, Trash2, User, Users, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { formatIDR, formatNum } from '@/lib/format'
import { UNIT_OPTIONS, type Item, type ItemCustomerRef, type SessionUser } from '@/lib/types'
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
  /** Bidang praktis: saat diisi → Harga Jual otomatis = Harga Modal + Profit */
  profit: string
  /** Jumlah stok barang */
  qty: string
  keterangan: string
  isActive: boolean
  /** Pelanggan tujuan saat create/duplicate ('none' = barang umum); tidak dipakai saat edit */
  customerId: string
}

const EMPTY_FORM: ItemFormState = {
  name: '', unit: 'pcs', standardPrice: '', hpp: '', profit: '', qty: '', keterangan: '', isActive: true, customerId: 'none',
}

function toNum(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function profitOf(jual: string, modal: string): string {
  const j = toNum(jual)
  const m = toNum(modal)
  return j !== null && m !== null ? String(j - m) : ''
}

function ActiveBadge({ active }: { active: boolean }) {
  return active
    ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px] shrink-0">Aktif</Badge>
    : <Badge variant="outline" className="bg-stone-100 text-stone-500 border-stone-200 text-[11px] shrink-0">Nonaktif</Badge>
}

/** Chips nama pelanggan — tampil di bawah/di samping nama barang (barang umum = label "Umum"). */
function CustomerChips({ customers }: { customers?: ItemCustomerRef[] }) {
  if (!customers || customers.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-stone-400">
        <User className="h-3 w-3 shrink-0" aria-hidden="true" /> Umum (tanpa pelanggan)
      </span>
    )
  }
  return (
    <div className="flex flex-wrap gap-1">
      {customers.map((c) => (
        <Badge
          key={c.id}
          variant="outline"
          className="bg-stone-50 text-stone-600 border-stone-200 text-[10px] gap-1 max-w-[200px] font-normal"
          title={c.companyName ? `${c.name} — ${c.companyName}` : c.name}
        >
          <User className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{c.name}</span>
        </Badge>
      ))}
    </div>
  )
}

/** Kartu ringkasan kecil (Total / Aktif / Nonaktif). */
function StatCard({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'emerald' | 'stone' }) {
  const toneCls = tone === 'emerald' ? 'text-emerald-600' : tone === 'stone' ? 'text-stone-500' : 'text-stone-800'
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-center md:text-left">
      <p className="text-[11px] font-medium text-muted-foreground leading-tight">{label}</p>
      <p className={`text-lg md:text-xl font-bold leading-tight mt-0.5 ${toneCls}`}>{value}</p>
    </div>
  )
}

interface ItemsViewProps {
  user: SessionUser
  /** Izin granular Matriks Hak Akses (master-barang-tambah/edit/hapus); undefined = fallback role lama */
  canAdd?: boolean
  canEdit?: boolean
  canDelete?: boolean
}

export default function ItemsView({ user, canAdd: canAddProp, canEdit: canEditProp, canDelete: canDeleteProp }: ItemsViewProps) {
  const canManage = user.role !== 'KASIR'
  const canAdd = canAddProp ?? canManage
  const canEditItem = canEditProp ?? canManage
  const canDelete = canDeleteProp ?? canManage
  // Harga Modal & Profit tampil untuk SEMUA role (permintaan owner — sebelumnya disembunyikan untuk KASIR)
  const showHpp = true

  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')

  // Pilih Customer — filter daftar barang per pelanggan (barang terdaftar)
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [customerId, setCustomerId] = useState<string>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  /** Sumber duplikasi (mode salin) — null saat create/edit biasa */
  const [duplicateFrom, setDuplicateFrom] = useState<Item | null>(null)
  const [form, setForm] = useState<ItemFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  /** ID barang yang sedang di-toggle status aktifnya (switch di tabel) */
  const [togglingId, setTogglingId] = useState<string | null>(null)

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
    setDuplicateFrom(null)
    setForm({ ...EMPTY_FORM, customerId: customerId !== 'all' ? customerId : 'none' })
    setDialogOpen(true)
  }

  /** Duplikat: buka form Tambah terisi data barang sumber (kode baru dibuat otomatis). */
  const openDuplicate = (it: Item) => {
    setEditing(null)
    setDuplicateFrom(it)
    const modalStr = it.hpp != null ? String(it.hpp) : ''
    setForm({
      name: it.name,
      unit: it.unit,
      standardPrice: String(it.standardPrice),
      hpp: modalStr,
      profit: profitOf(String(it.standardPrice), modalStr),
      qty: String(it.qty ?? 0),
      keterangan: it.keterangan ?? '',
      isActive: true,
      customerId: it.customers && it.customers.length > 0 ? it.customers[0].id : (customerId !== 'all' ? customerId : 'none'),
    })
    setDialogOpen(true)
  }

  const openEdit = (it: Item) => {
    setEditing(it)
    setDuplicateFrom(null)
    const modalStr = it.hpp != null ? String(it.hpp) : ''
    setForm({
      name: it.name,
      unit: it.unit,
      standardPrice: String(it.standardPrice),
      hpp: modalStr,
      profit: profitOf(String(it.standardPrice), modalStr),
      qty: String(it.qty ?? 0),
      keterangan: it.keterangan ?? '',
      isActive: it.isActive,
      customerId: 'none',
    })
    setDialogOpen(true)
  }

  // Profit = harga jual − harga modal; Margin = profit / harga jual × 100
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

  /* Sinkronisasi dua arah: Jual ↔ Profit dengan Modal sebagai dasar.
   - Ubah Harga Jual → Profit = Jual − Modal
   - Ubah Harga Modal → Profit mengikuti Jual; bila Jual kosong tapi Profit terisi → Jual = Modal + Profit
   - Ubah Profit → Jual = Modal + Profit */
  const setJual = (v: string) => {
    setForm((f) => ({ ...f, standardPrice: v, profit: profitOf(v, f.hpp) }))
  }
  const setModal = (v: string) => {
    setForm((f) => {
      const jual = toNum(f.standardPrice)
      const modal = toNum(v)
      if (jual !== null && modal !== null) {
        return { ...f, hpp: v, profit: String(jual - modal) }
      }
      const profit = toNum(f.profit)
      if (profit !== null && modal !== null) {
        return { ...f, hpp: v, standardPrice: String(modal + profit) }
      }
      return { ...f, hpp: v, profit: f.standardPrice !== '' || f.profit === '' ? '' : f.profit }
    })
  }
  const setProfit = (v: string) => {
    setForm((f) => {
      const modal = toNum(f.hpp)
      const profit = toNum(v)
      if (modal !== null && profit !== null) {
        return { ...f, profit: v, standardPrice: String(modal + profit) }
      }
      return { ...f, profit: v }
    })
  }

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
    const qtyNum = form.qty.trim() === '' ? 0 : Number(form.qty)
    if (!Number.isFinite(qtyNum) || qtyNum < 0) {
      toast.error('Qty tidak boleh negatif')
      return
    }
    setSaving(true)
    try {
      const formCustomerName = customers.find((c) => c.id === form.customerId)?.name
      const body = {
        name: form.name.trim(),
        unit: form.unit,
        standardPrice: std,
        hpp: hppNum,
        qty: qtyNum,
        keterangan: form.keterangan.trim(),
        ...(editing
          ? { isActive: form.isActive }
          : { customerId: form.customerId !== 'none' ? form.customerId : undefined }),
      }
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
          formCustomerName
            ? `Barang berhasil ditambahkan untuk ${formCustomerName}`
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

  /** Toggle status aktif cepat dari tabel/kartu (tanpa membuka dialog edit). */
  const toggleActive = async (it: Item) => {
    setTogglingId(it.id)
    try {
      await apiFetch<{ item: Item }>(`/api/items/${it.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !it.isActive }),
      })
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, isActive: !x.isActive } : x)))
      toast.success(`${it.name} ${!it.isActive ? 'diaktifkan' : 'dinonaktifkan'}`)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setTogglingId(null)
    }
  }

  const hasResults = items.length > 0
  const activeCount = items.filter((it) => it.isActive).length
  const inactiveCount = items.length - activeCount
  const selectedCustomerName = customers.find((c) => c.id === customerId)?.name ?? null
  // CRUD penuh: Tambah/Edit/Duplikat tersedia di SEMUA mode (termasuk "Semua Barang").
  // Barang umum (tanpa pelanggan) juga bisa dikelola; pelanggan dipilih di dalam form.
  const showTambah = canAdd
  const showEdit = canEditItem
  // Hapus SELALU tampil di tabel (selaras Master Pelanggan), termasuk mode "Semua Barang"
  const showHapus = canDelete
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
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => void load()}
              disabled={loading}
              aria-label="Muat ulang data"
              title="Muat ulang"
              className="min-h-[44px] w-11 shrink-0"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            {showTambah && (
              <Button
                onClick={openCreate}
                title="Tambah barang baru"
                className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px] flex-1 sm:flex-none"
              >
                <Plus className="h-4 w-4" /> Tambah
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Pilih Pelanggan — kotak filter tepat di bawah judul Master Barang */}
      <section
        aria-label="Filter pelanggan"
        className="rounded-xl border border-stone-200 bg-white p-3 md:px-4 md:py-3"
      >
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-4">
          <div className="flex items-center gap-2.5 lg:shrink-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-stone-100">
              <Users className="h-4 w-4 text-stone-500" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <Label
                htmlFor="pilih-pelanggan"
                className="block text-sm font-semibold text-stone-800 leading-tight"
              >
                Pilih Pelanggan
              </Label>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                Tampilkan barang per pelanggan
              </p>
            </div>
          </div>
          <div className="lg:w-80">
            <Select value={customerId} onValueChange={(v) => setCustomerId(v || 'all')}>
              <SelectTrigger
                id="pilih-pelanggan"
                className="w-full min-h-[44px] bg-white"
                aria-label="Pilih Pelanggan"
              >
                <SelectValue placeholder="Pilih pelanggan" />
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
          {customerId === 'all' && (
            <p className="text-xs text-muted-foreground lg:ml-auto self-center">
              Gunakan tombol Tambah untuk barang umum atau per pelanggan
            </p>
          )}
          {customerId !== 'all' && selectedCustomerName && (
            <div className="flex items-center gap-2 lg:ml-auto">
              <Badge
                variant="outline"
                className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs max-w-[240px]"
              >
                <span className="truncate font-medium">{selectedCustomerName}</span>
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-muted-foreground hover:text-stone-800"
                onClick={() => setCustomerId('all')}
                aria-label="Reset filter pelanggan"
              >
                <X className="h-3.5 w-3.5" /> Reset
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Ringkasan cepat */}
      <div className="grid grid-cols-3 gap-2 md:gap-3" aria-label="Ringkasan barang">
        <StatCard label="Total Barang" value={items.length} />
        <StatCard label="Aktif" value={activeCount} tone="emerald" />
        <StatCard label="Nonaktif" value={inactiveCount} tone="stone" />
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : !hasResults ? (
          <EmptyState
            filtered={query !== ''}
            customerName={selectedCustomerName}
            action={
              showTambah && !query ? (
                <Button
                  onClick={openCreate}
                  className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px]"
                >
                  <Plus className="h-4 w-4" /> Tambah Barang
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-stone-50">
                <TableRow className="bg-stone-50 hover:bg-stone-50">
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead className="text-center">Satuan</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead className="text-right">Harga Jual</TableHead>
                  {showHpp && <TableHead className="text-right">HPP</TableHead>}
                  <TableHead>Keterangan</TableHead>
                  <TableHead>Status</TableHead>
                  {(showTambah || showEdit || showHapus) && <TableHead className="text-right">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{it.code}</TableCell>
                    <TableCell className="font-medium">
                      <div className="min-w-0 space-y-1">
                        <span className="block truncate" title={it.name}>{it.name}</span>
                        <CustomerChips customers={it.customers} />
                      </div>
                    </TableCell>
                    <TableCell className="text-center">{it.unit}</TableCell>
                    <TableCell className="text-center whitespace-nowrap">{formatNum(it.qty)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatIDR(it.standardPrice)}</TableCell>
                    {showHpp && (
                      <TableCell className="text-right whitespace-nowrap">
                        {it.hpp != null ? formatIDR(it.hpp) : '-'}
                      </TableCell>
                    )}
                    <TableCell className="max-w-[200px]">
                      <span
                        className="block truncate text-sm text-muted-foreground"
                        title={it.keterangan || undefined}
                      >
                        {it.keterangan || '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {showEdit && (
                          <Switch
                            checked={it.isActive}
                            disabled={togglingId === it.id}
                            onCheckedChange={() => void toggleActive(it)}
                            aria-label={`${it.isActive ? 'Nonaktifkan' : 'Aktifkan'} ${it.name}`}
                            className="data-[state=checked]:bg-emerald-600"
                          />
                        )}
                        <ActiveBadge active={it.isActive} />
                      </div>
                    </TableCell>
                    {(showTambah || showEdit || showHapus) && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {showTambah && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9"
                              onClick={() => openDuplicate(it)}
                              aria-label={`Duplikat ${it.name}`}
                              title="Duplikat"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          )}
                          {showEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9"
                              onClick={() => openEdit(it)}
                              aria-label={`Edit ${it.name}`}
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {showHapus && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(it)}
                              aria-label={`Hapus ${it.name}`}
                              title="Hapus"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
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
          <EmptyState
            filtered={query !== ''}
            customerName={selectedCustomerName}
            action={
              showTambah && !query ? (
                <Button
                  onClick={openCreate}
                  className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px] w-full sm:w-auto"
                >
                  <Plus className="h-4 w-4" /> Tambah Barang
                </Button>
              ) : undefined
            }
          />
        ) : (
          items.map((it) => (
            <Card key={it.id} className="p-0 gap-0">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium truncate" title={it.name}>{it.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{it.code}</p>
                    <CustomerChips customers={it.customers} />
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    {showEdit && (
                      <Switch
                        checked={it.isActive}
                        disabled={togglingId === it.id}
                        onCheckedChange={() => void toggleActive(it)}
                        aria-label={`${it.isActive ? 'Nonaktifkan' : 'Aktifkan'} ${it.name}`}
                        className="data-[state=checked]:bg-emerald-600"
                      />
                    )}
                    <ActiveBadge active={it.isActive} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <p className="text-muted-foreground">Satuan: <span className="font-medium text-stone-700">{it.unit}</span></p>
                  <p className="text-muted-foreground">Qty: <span className="font-semibold text-stone-700">{formatNum(it.qty)}</span></p>
                  <p className="text-muted-foreground">Harga Jual: <span className="font-semibold text-stone-700">{formatIDR(it.standardPrice)}</span></p>
                </div>
                {showHpp && (
                  <p className="text-sm text-muted-foreground">
                    HPP: <span className="font-medium text-stone-700">{it.hpp != null ? formatIDR(it.hpp) : '-'}</span>
                  </p>
                )}
                {it.keterangan && (
                  <p className="text-sm text-muted-foreground">
                    Keterangan: <span className="text-stone-700">{it.keterangan}</span>
                  </p>
                )}
                {(showTambah || showEdit || showHapus) && (
                  <div className="flex gap-2 pt-1">
                    {showTambah && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 min-h-[44px]"
                        onClick={() => openDuplicate(it)}
                        aria-label={`Duplikat ${it.name}`}
                      >
                        <Copy className="h-4 w-4" /> Duplikat
                      </Button>
                    )}
                    {showEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 min-h-[44px]"
                        onClick={() => openEdit(it)}
                      >
                        <Pencil className="h-4 w-4" /> Edit
                      </Button>
                    )}
                    {showHapus && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 min-h-[44px] text-destructive border-stone-200 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeleteTarget(it)}
                      >
                        <Trash2 className="h-4 w-4" /> Hapus
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Dialog create / edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg p-4 sm:p-6 gap-3 sm:gap-4 max-h-[calc(100dvh-2rem)] overflow-y-auto scrollbar-thin">
          <DialogHeader className="pr-8">
            <DialogTitle>{editing ? 'Edit Barang' : duplicateFrom ? 'Duplikat Barang' : 'Tambah Barang'}</DialogTitle>
            <DialogDescription>
              {editing
                ? `Kode ${editing.code} — perbarui data barang.`
                : duplicateFrom
                  ? `Salinan dari ${duplicateFrom.code} — ${duplicateFrom.name}. Kode baru dibuat otomatis.`
                  : 'Kode barang dibuat otomatis oleh sistem.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:gap-4">
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
            {!editing && (
              <div className="grid gap-1.5">
                <Label htmlFor="item-customer">Untuk Pelanggan</Label>
                {customerId !== 'all' ? (
                  <>
                    <Select value={form.customerId} onValueChange={(v) => setForm((f) => ({ ...f, customerId: v }))} disabled>
                      <SelectTrigger id="item-customer" className="w-full min-h-[44px]" aria-label="Pelanggan tujuan">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {customers.filter((c) => c.id === customerId).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}{c.companyName ? ` — ${c.companyName}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">Mengikuti filter pelanggan aktif di atas.</p>
                  </>
                ) : (
                  <>
                    <Select value={form.customerId} onValueChange={(v) => setForm((f) => ({ ...f, customerId: v }))}>
                      <SelectTrigger id="item-customer" className="w-full min-h-[44px]" aria-label="Pelanggan tujuan">
                        <SelectValue placeholder="Pilih pelanggan (opsional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Barang umum (tanpa pelanggan) —</SelectItem>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}{c.companyName ? ` — ${c.companyName}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      Barang umum bisa didaftarkan ke pelanggan kapan saja lewat halaman Harga Khusus.
                    </p>
                  </>
                )}
              </div>
            )}
            {editing && (
              <div className="grid gap-1.5">
                <Label>Pelanggan Terdaftar</Label>
                <CustomerChips customers={editing.customers} />
                <p className="text-[11px] text-muted-foreground">
                  Kelola harga khusus per pelanggan di halaman Harga Khusus.
                </p>
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
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
                <Label htmlFor="item-qty">Qty</Label>
                <Input
                  id="item-qty"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step="any"
                  value={form.qty}
                  onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
                  placeholder="0"
                />
              </div>
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
                onChange={(e) => setJual(e.target.value)}
                placeholder="0"
              />
            </div>
            {showHpp && (
              <div className="grid gap-1.5">
                <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="grid gap-1.5">
                    <Label htmlFor="item-modal">Harga Modal (Rp)</Label>
                    <Input
                      id="item-modal"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step="any"
                      value={form.hpp}
                      onChange={(e) => setModal(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="item-profit">Profit (Rp)</Label>
                    <Input
                      id="item-profit"
                      type="number"
                      inputMode="numeric"
                      step="any"
                      value={form.profit}
                      onChange={(e) => setProfit(e.target.value)}
                      placeholder="Otomatis dari Harga Jual − Modal"
                      className={marginInfo?.negative ? 'text-red-600' : ''}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Isi Modal + Profit → Harga Jual terisi otomatis. Isi Harga Jual → Profit terhitung sendiri.
                </p>
                {marginInfo && (
                  <div className={`text-xs rounded-md px-2 py-1.5 ${marginInfo.negative ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                    Profit: <span className="font-semibold">{formatIDR(marginInfo.profit)}</span>
                    {' '}(Margin: {formatNum(marginInfo.margin, 1)}%)
                    {marginInfo.negative ? ' — rugi! Harga Jual lebih kecil dari Modal.' : ''}
                  </div>
                )}
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="item-keterangan">Keterangan</Label>
              <Input
                id="item-keterangan"
                value={form.keterangan}
                onChange={(e) => setForm((f) => ({ ...f, keterangan: e.target.value }))}
                placeholder="Keterangan tambahan (opsional)"
                maxLength={500}
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
          <DialogFooter className="gap-2 border-t border-stone-100 pt-3 mt-1">
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
              {deleteTarget?.name} akan dihapus permanen dari daftar beserta daftar harga khususnya.
              Invoice lama tetap tersimpan. Jika tidak ingin dihapus, gunakan opsi Nonaktifkan sebagai gantinya.
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

function EmptyState({ filtered, customerName, action }: { filtered: boolean; customerName?: string | null; action?: ReactNode }) {
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
            ? `Tambahkan barang pertama untuk pelanggan ini, atau pilih "Semua Barang" untuk melihat semua.`
            : 'Klik "Tambah Barang" untuk membuat barang umum atau per pelanggan, atau pilih pelanggan untuk memfilter.'}
      </p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
