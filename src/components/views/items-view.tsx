'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  Check, ChevronsUpDown, Copy, ImagePlus, Package, Pencil, Plus, RefreshCw, Search, Trash2, User, Users, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { onDataChange } from '@/lib/data-sync'
import { formatIDR, formatNum } from '@/lib/format'
import { type Item, type ItemCustomerRef, type SessionUser } from '@/lib/types'
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { BarangFormDialog } from '@/components/views/barang-form-dialog'
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

/** Helper foto (kompres ≤300KB JPG + format byte) kini di @/lib/image-compress + komponen @/components/photo-upload. */

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

/** Tanggal dibuat (createdAt ISO dari API) → format dd/mm/yy, mis. "30/09/26". Gagal parse → "-". */
function formatTanggalDibuat(iso?: string | null): string {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return '-'
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yy = String(d.getFullYear()).slice(-2)
    return `${dd}/${mm}/${yy}`
  } catch {
    return '-'
  }
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
  // Combobox Pilih Pelanggan: daftar bisa DIKETIK untuk pencarian cepat
  const [custOpen, setCustOpen] = useState(false)
  const [custSearch, setCustSearch] = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  /** Sumber duplikasi (mode salin) — null saat create/edit biasa */
  const [duplicateFrom, setDuplicateFrom] = useState<Item | null>(null)
  /** ID barang yang sedang di-toggle status aktifnya (switch di tabel) */
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Popup foto barang (klik baris tabel / kartu)
  const [viewPhoto, setViewPhoto] = useState<Item | null>(null)

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

  // Sinkron antar-tab & pasca offline-sync: muat ulang daftar saat entity
  // 'items' berubah (mis. antrian offline baru saja direplay).
  useEffect(() => {
    return onDataChange(['items'], () => {
      void load()
    })
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setDuplicateFrom(null)
    setDialogOpen(true)
  }

  /** Duplikat: buka form Tambah terisi data barang sumber (kode baru dibuat otomatis, foto ikut). */
  const openDuplicate = (it: Item) => {
    setEditing(null)
    setDuplicateFrom(it)
    setDialogOpen(true)
  }

  const openEdit = (it: Item) => {
    setEditing(it)
    setDuplicateFrom(null)
    setDialogOpen(true)
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
  const selectedCustomerOption = customers.find((c) => c.id === customerId) ?? null
  const selectedCustomerName = customers.find((c) => c.id === customerId)?.name ?? null
  // Tambah tersedia di SEMUA mode (termasuk "Semua Barang"); pelanggan dipilih di dalam form.
  // Edit & Duplikat hanya tampil saat pelanggan spesifik dipilih ( disembunyikan di mode "Semua Barang").
  const showTambah = canAdd
  const showDuplicate = canAdd && customerId !== 'all'
  const showEdit = canEditItem && customerId !== 'all'
  // Switch status aktif mengikuti izin edit dan tetap tersedia di semua mode (bukan tombol edit).
  const showToggle = canEditItem
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
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Harga per Customer</h1>
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
            {/* Combobox: pelanggan bisa DIKETIK untuk pencarian cepat (selaras halaman Invoice) */}
            <Popover
              open={custOpen}
              onOpenChange={(o) => {
                setCustOpen(o)
                if (o) setCustSearch('')
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  id="pilih-pelanggan"
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={custOpen}
                  aria-label="Pilih Pelanggan"
                  className="w-full min-h-[44px] justify-between gap-2 bg-white px-3 font-normal"
                >
                  <span className="min-w-0 flex-1 truncate text-left">
                    {customerId === 'all'
                      ? 'Semua Barang'
                      : selectedCustomerOption
                        ? `${selectedCustomerOption.name}${selectedCustomerOption.companyName ? ` — ${selectedCustomerOption.companyName}` : ''}`
                        : 'Pilih pelanggan'}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[240px] p-0">
                <Command>
                  <CommandInput
                    value={custSearch}
                    onValueChange={setCustSearch}
                    placeholder="Ketik nama pelanggan…"
                  />
                  <CommandEmpty>
                    {customers.length === 0 ? 'Belum ada pelanggan' : 'Pelanggan tidak ditemukan'}
                  </CommandEmpty>
                  <CommandList className="max-h-60 overflow-y-auto scrollbar-thin">
                    <CommandGroup>
                      <CommandItem
                        value="Semua Barang"
                        keywords={['all', 'semua', 'barang']}
                        onSelect={() => {
                          setCustomerId('all')
                          setCustOpen(false)
                          setCustSearch('')
                        }}
                        className="min-h-[44px]"
                      >
                        <Check
                          className={`mr-2 h-4 w-4 shrink-0 ${customerId === 'all' ? 'opacity-100 text-emerald-600' : 'opacity-0'}`}
                          aria-hidden="true"
                        />
                        Semua Barang
                      </CommandItem>
                      {customers.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={`${c.name} ${c.companyName ?? ''} ${c.id}`}
                          onSelect={() => {
                            setCustomerId(c.id)
                            setCustOpen(false)
                            setCustSearch('')
                          }}
                          className="min-h-[44px]"
                        >
                          <Check
                            className={`mr-2 h-4 w-4 shrink-0 ${customerId === c.id ? 'opacity-100 text-emerald-600' : 'opacity-0'}`}
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {c.name}{c.companyName ? ` — ${c.companyName}` : ''}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          {customerId === 'all' && (
            <p className="text-xs text-muted-foreground lg:ml-auto self-center">
              Gunakan tombol Tambah untuk barang umum atau per pelanggan; pilih pelanggan untuk mengedit / menduplikat
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
                  <TableHead>Tanggal</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead className="text-right">Harga Jual</TableHead>
                  {showHpp && <TableHead className="text-right">HPP</TableHead>}
                  <TableHead>Keterangan</TableHead>
                  <TableHead>Status</TableHead>
                  {(showDuplicate || showEdit || showHapus) && <TableHead className="text-right">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow
                    key={it.id}
                    className="cursor-pointer"
                    title="Klik baris untuk melihat foto barang"
                    onClick={() => setViewPhoto(it)}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{it.code}</TableCell>
                    {/* Kolom Satuan dihapus — satuan tetap bisa diatur lewat form */}
                    <TableCell className="font-medium">
                      <div className="min-w-0 space-y-1">
                        <span className="block truncate" title={it.name}>{it.name}</span>
                        <CustomerChips customers={it.customers} />
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground" title="Tanggal dibuat">{formatTanggalDibuat(it.createdAt)}</TableCell>
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
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        {showToggle && (
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
                    {(showDuplicate || showEdit || showHapus) && (
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          {showDuplicate && (
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
                  <div
                    className="min-w-0 space-y-1 cursor-pointer"
                    onClick={() => setViewPhoto(it)}
                    title="Ketuk untuk melihat foto barang"
                  >
                    <p className="font-medium truncate" title={it.name}>{it.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{it.code}</p>
                    <CustomerChips customers={it.customers} />
                    {it.photoUrl && (
                      <img
                        src={it.photoUrl}
                        alt={`Foto ${it.name}`}
                        className="mt-1 h-14 w-14 rounded-md border border-stone-200 object-cover"
                      />
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    {showToggle && (
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
                  <p className="text-muted-foreground">Qty: <span className="font-semibold text-stone-700">{formatNum(it.qty)}</span></p>
                  <p className="text-muted-foreground">Harga Jual: <span className="font-semibold text-stone-700">{formatIDR(it.standardPrice)}</span></p>
                  <p className="text-muted-foreground">Tanggal: <span className="font-semibold text-stone-700">{formatTanggalDibuat(it.createdAt)}</span></p>
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
                {(showDuplicate || showEdit || showHapus) && (
                  <div className="flex gap-2 pt-1">
                    {showDuplicate && (
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

      {/* Dialog create / edit / duplikat — komponen bersama BarangFormDialog
          (sama persis dipakai tombol "Tambah Barang" di halaman Buat Invoice). */}
      <BarangFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        duplicateFrom={duplicateFrom}
        customers={customers}
        customerFilter={customerId}
        onSaved={() => void load()}
      />

      {/* Dialog lihat foto barang (klik baris tabel / kartu) */}
      <Dialog open={!!viewPhoto} onOpenChange={(o) => { if (!o) setViewPhoto(null) }}>
        <DialogContent className="sm:max-w-md p-4 sm:p-6 gap-3">
          <DialogHeader className="pr-8">
            <DialogTitle>Foto Barang</DialogTitle>
            <DialogDescription>
              {viewPhoto ? `${viewPhoto.code} — ${viewPhoto.name}` : ''}
            </DialogDescription>
          </DialogHeader>
          {viewPhoto?.photoUrl ? (
            <img
              src={viewPhoto.photoUrl}
              alt={`Foto ${viewPhoto.name}`}
              className="max-h-[55vh] w-full rounded-lg border border-stone-200 bg-white object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-stone-300 bg-stone-50/50 py-10 text-center">
              <ImagePlus className="h-8 w-8 text-stone-300" aria-hidden="true" />
              <p className="text-sm font-medium text-stone-600">Belum ada foto untuk barang ini</p>
              <p className="text-xs text-muted-foreground">Foto bisa ditambahkan lewat tombol Edit.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* AlertDialog hapus */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus barang?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name} akan dihapus permanen dari daftar barang.
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
