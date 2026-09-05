'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  MapPin, Pencil, Phone, Plus, Power, PowerOff, Search, Trash2, Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import type { Customer, SessionUser } from '@/lib/types'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'Terjadi kesalahan'
}

interface CustomerFormState {
  name: string
  phone: string
  email: string
  address: string
  notes: string
  isActive: boolean
}

const EMPTY_FORM: CustomerFormState = {
  name: '', phone: '', email: '', address: '', notes: '', isActive: true,
}

function ActiveBadge({ active }: { active: boolean }) {
  return active
    ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px] shrink-0">Aktif</Badge>
    : <Badge variant="outline" className="bg-stone-100 text-stone-500 border-stone-200 text-[11px] shrink-0">Nonaktif</Badge>
}

export default function CustomersView({ user }: { user: SessionUser }) {
  const canManage = user.role !== 'KASIR'

  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState<CustomerFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setQuery(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // API saat ini mengembalikan array customer langsung
      const data = await apiFetch<Customer[]>(
        `/api/customers?q=${encodeURIComponent(query)}`
      )
      setCustomers(data)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (c: Customer) => {
    setEditing(c)
    setForm({
      name: c.name,
      phone: c.phone ?? '',
      email: c.email ?? '',
      address: c.address ?? '',
      notes: c.notes ?? '',
      isActive: c.isActive,
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Nama pelanggan wajib diisi')
      return
    }
    setSaving(true)
    try {
      const body = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
        ...(editing ? { isActive: form.isActive } : {}),
      }
      if (editing) {
        await apiFetch<{ customer: Customer }>(`/api/customers/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        toast.success('Pelanggan berhasil diperbarui')
      } else {
        await apiFetch<{ customer: Customer }>('/api/customers', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        toast.success('Pelanggan berhasil ditambahkan')
      }
      setDialogOpen(false)
      void load()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (c: Customer) => {
    try {
      await apiFetch<{ customer: Customer }>(`/api/customers/${c.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !c.isActive }),
      })
      toast.success(c.isActive ? `${c.name} dinonaktifkan` : `${c.name} diaktifkan`)
      void load()
    } catch (e) {
      toast.error(errText(e))
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiFetch<{ ok: boolean }>(`/api/customers/${deleteTarget.id}`, { method: 'DELETE' })
      toast.success('Pelanggan berhasil dihapus')
      setDeleteTarget(null)
      void load()
    } catch (e) {
      // 409 → pelanggan punya invoice, tampilkan pesan server
      toast.error(errText(e))
    } finally {
      setDeleting(false)
    }
  }

  const hasResults = customers.length > 0
  const countLabel = loading ? 'Memuat data…' : `${customers.length} pelanggan`

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Master Pelanggan</h1>
          <p className="text-sm text-muted-foreground mt-1">{countLabel}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari nama / kode / telepon…"
              aria-label="Cari pelanggan"
              className="pl-9 min-h-[44px]"
            />
          </div>
          <Button
            onClick={openCreate}
            disabled={!canManage}
            title={canManage ? 'Tambah pelanggan' : 'Hanya Admin/Manager yang dapat menambah'}
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
          <EmptyState filtered={query !== ''} />
        ) : (
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-stone-50">
                <TableRow className="bg-stone-50 hover:bg-stone-50">
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Telepon</TableHead>
                  <TableHead>Alamat</TableHead>
                  <TableHead className="text-center">Invoice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{c.code}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="whitespace-nowrap">{c.phone || '-'}</TableCell>
                    <TableCell className="max-w-52 truncate text-muted-foreground">{c.address || '-'}</TableCell>
                    <TableCell className="text-center tabular-nums">{c.invoiceCount ?? 0}</TableCell>
                    <TableCell><ActiveBadge active={c.isActive} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          disabled={!canManage}
                          onClick={() => openEdit(c)}
                          aria-label={`Edit ${c.name}`}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {(c.invoiceCount ?? 0) > 0 ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            disabled={!canManage}
                            onClick={() => void handleToggleActive(c)}
                            aria-label={c.isActive ? `Nonaktifkan ${c.name}` : `Aktifkan ${c.name}`}
                            title={c.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                          >
                            {c.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-destructive hover:text-destructive"
                            disabled={!canManage}
                            onClick={() => setDeleteTarget(c)}
                            aria-label={`Hapus ${c.name}`}
                            title="Hapus"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
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
          <EmptyState filtered={query !== ''} />
        ) : (
          customers.map((c) => (
            <Card key={c.id} className="p-0 gap-0">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{c.code}</p>
                  </div>
                  <ActiveBadge active={c.isActive} />
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p className="flex items-center gap-1.5 min-h-[20px]">
                    <Phone className="h-3.5 w-3.5 shrink-0" /> {c.phone || '-'}
                  </p>
                  <p className="flex items-start gap-1.5">
                    <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span className="line-clamp-2">{c.address || '-'}</span>
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">{c.invoiceCount ?? 0} invoice dibuat</p>
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 min-h-[44px]"
                    disabled={!canManage}
                    onClick={() => openEdit(c)}
                  >
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  {(c.invoiceCount ?? 0) > 0 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 min-h-[44px]"
                      disabled={!canManage}
                      onClick={() => void handleToggleActive(c)}
                    >
                      {c.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                      {c.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 min-h-[44px] text-destructive border-stone-200 hover:bg-destructive/10 hover:text-destructive"
                      disabled={!canManage}
                      onClick={() => setDeleteTarget(c)}
                    >
                      <Trash2 className="h-4 w-4" /> Hapus
                    </Button>
                  )}
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
            <DialogTitle>{editing ? 'Edit Pelanggan' : 'Tambah Pelanggan'}</DialogTitle>
            <DialogDescription>
              {editing
                ? `Kode ${editing.code} — perbarui data pelanggan.`
                : 'Kode pelanggan dibuat otomatis oleh sistem.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="cust-name">Nama <span className="text-destructive">*</span></Label>
              <Input
                id="cust-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nama pelanggan / toko"
                autoComplete="off"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="cust-phone">Telepon</Label>
                <Input
                  id="cust-phone"
                  type="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="08xxxxxxxxxx"
                  autoComplete="off"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cust-email">Email</Label>
                <Input
                  id="cust-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="nama@email.com"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cust-address">Alamat</Label>
              <Textarea
                id="cust-address"
                rows={2}
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Alamat lengkap pelanggan"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cust-notes">Catatan</Label>
              <Textarea
                id="cust-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Catatan tambahan (opsional)"
              />
            </div>
            {editing && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 p-3">
                <div>
                  <Label htmlFor="cust-active">Status Aktif</Label>
                  <p className="text-xs text-muted-foreground">Nonaktif = tidak muncul saat buat invoice.</p>
                </div>
                <Switch
                  id="cust-active"
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
            <AlertDialogTitle>Hapus pelanggan?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name} akan dihapus permanen. Jika pelanggan sudah memiliki invoice,
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

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="text-center py-12 px-4">
      <Users className="h-10 w-10 text-stone-300 mx-auto mb-2" />
      <p className="text-sm font-medium">{filtered ? 'Tidak ditemukan' : 'Belum ada pelanggan'}</p>
      <p className="text-xs text-muted-foreground mt-1">
        {filtered ? 'Coba kata kunci lain.' : 'Tambahkan pelanggan pertama Anda dengan tombol "+ Tambah".'}
      </p>
    </div>
  )
}
