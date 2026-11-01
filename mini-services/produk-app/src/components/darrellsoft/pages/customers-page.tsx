'use client'

import * as React from 'react'
import { Pencil, Plus, Search, Trash2, Users } from 'lucide-react'
import { api } from '@/lib/client-api'
import type { CustomerDTO } from '@/lib/types'
import { useAppStore } from '@/store/app-store'
import { useCan } from '@/hooks/use-can'
import { useToast } from '@/hooks/use-toast'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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

interface CustomerFormState {
  code: string
  name: string
  phone: string
  email: string
  address: string
  isActive: boolean
}

const EMPTY_FORM: CustomerFormState = {
  code: '',
  name: '',
  phone: '',
  email: '',
  address: '',
  isActive: true,
}

const HEAD_CELL = 'bg-zinc-50 px-3 py-2.5 text-xs uppercase tracking-wide text-muted-foreground'
const BODY_CELL = 'px-3 py-2.5'

export default function CustomersPage() {
  const { toast } = useToast()
  const can = useCan()
  const canWrite = can('customers:write')
  const companyId = useAppStore((s) => s.companyId)
  const userId = useAppStore((s) => s.userId)

  const [customers, setCustomers] = React.useState<CustomerDTO[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [debouncedSearch, setDebouncedSearch] = React.useState('')
  const [refreshTick, setRefreshTick] = React.useState(0)

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<CustomerDTO | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [form, setForm] = React.useState<CustomerFormState>(EMPTY_FORM)

  const [deleteTarget, setDeleteTarget] = React.useState<CustomerDTO | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  // Debounce pencarian 300ms
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // Muat daftar customer (reload saat sesi perusahaan/pengguna berubah)
  React.useEffect(() => {
    if (!companyId || !userId) return
    let cancelled = false
    setLoading(true)
    api<CustomerDTO[]>('/api/customers', { params: { q: debouncedSearch, includeInactive: '1' } })
      .then((rows) => {
        if (cancelled) return
        setCustomers(rows)
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        toast({ title: 'Gagal memuat customer', description: (e as Error).message, variant: 'destructive' })
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

  const openEdit = (c: CustomerDTO) => {
    setEditing(c)
    setForm({
      code: c.code,
      name: c.name,
      phone: c.phone ?? '',
      email: c.email ?? '',
      address: c.address ?? '',
      isActive: c.isActive,
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast({ title: 'Validasi gagal', description: 'Kode dan nama customer wajib diisi.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const body = {
        code: form.code.trim(),
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        isActive: form.isActive,
      }
      if (editing) {
        await api<CustomerDTO>(`/api/customers/${editing.id}`, { method: 'PUT', body })
        toast({ title: 'Berhasil', description: `Customer "${body.name}" berhasil diperbarui.` })
      } else {
        await api<CustomerDTO>('/api/customers', { method: 'POST', body })
        toast({ title: 'Berhasil', description: `Customer "${body.name}" berhasil ditambahkan.` })
      }
      setDialogOpen(false)
      setRefreshTick((t) => t + 1)
    } catch (e) {
      toast({ title: 'Gagal menyimpan customer', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteConfirm = async () => {
    const target = deleteTarget
    if (!target) return
    setDeleting(true)
    try {
      await api<void>(`/api/customers/${target.id}`, { method: 'DELETE' })
      toast({ title: 'Berhasil', description: `Customer "${target.name}" berhasil dihapus.` })
      setDeleteTarget(null)
      setRefreshTick((t) => t + 1)
    } catch (e) {
      toast({ title: 'Gagal menghapus customer', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  const showSkeleton = loading && customers.length === 0

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Customer"
        description="Data master customer perusahaan Anda."
        actions={
          canWrite ? (
            <Button onClick={openAdd}>
              <Plus />
              Tambah Customer
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
            placeholder="Cari kode atau nama customer..."
            aria-label="Cari customer"
            className="pl-9"
          />
        </div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {loading ? 'Memuat...' : `${customers.length} customer`}
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
      ) : customers.length === 0 ? (
        <div className="rounded-lg border bg-white">
          <EmptyState
            icon={Users}
            title={debouncedSearch ? 'Tidak ada customer yang cocok' : 'Belum ada customer'}
            description={
              debouncedSearch
                ? `Tidak ditemukan customer untuk pencarian "${debouncedSearch}".`
                : 'Mulai dengan menambahkan customer pertama untuk perusahaan Anda.'
            }
            action={
              canWrite && !debouncedSearch ? { label: 'Tambah Customer', onClick: openAdd } : undefined
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
                    <TableHead className={HEAD_CELL}>Telepon</TableHead>
                    <TableHead className={HEAD_CELL}>Email</TableHead>
                    <TableHead className={HEAD_CELL}>Status</TableHead>
                    <TableHead className={`${HEAD_CELL} text-right`}>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className={`${BODY_CELL} font-mono text-[13px]`}>{c.code}</TableCell>
                      <TableCell className={`${BODY_CELL} font-medium`}>{c.name}</TableCell>
                      <TableCell className={BODY_CELL}>{c.phone || '-'}</TableCell>
                      <TableCell className={BODY_CELL}>
                        <span className="block max-w-[200px] truncate" title={c.email ?? undefined}>
                          {c.email || '-'}
                        </span>
                      </TableCell>
                      <TableCell className={BODY_CELL}>
                        {c.isActive ? (
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
                            onClick={() => openEdit(c)}
                            disabled={!canWrite}
                            title={canWrite ? 'Edit customer' : 'Anda tidak memiliki izin'}
                          >
                            <Pencil />
                            <span className="sr-only">Edit {c.name}</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(c)}
                            disabled={!canWrite}
                            title={canWrite ? 'Hapus customer' : 'Anda tidak memiliki izin'}
                          >
                            <Trash2 />
                            <span className="sr-only">Hapus {c.name}</span>
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

      {/* Dialog tambah / edit customer */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o && !saving) setDialogOpen(false)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Customer' : 'Tambah Customer'}</DialogTitle>
            <DialogDescription>
              {editing
                ? `Perbarui data customer ${editing.name}.`
                : 'Isi data customer baru untuk perusahaan Anda.'}
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
                <Label htmlFor="customer-code">
                  Kode <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="customer-code"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="CUST-001"
                  disabled={saving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="customer-name">
                  Nama <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="customer-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="PT Maju Jaya"
                  disabled={saving}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="customer-phone">Telepon</Label>
                <Input
                  id="customer-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="0812xxxxxxx"
                  disabled={saving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="customer-email">Email</Label>
                <Input
                  id="customer-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="nama@perusahaan.com"
                  disabled={saving}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="customer-address">Alamat</Label>
              <Textarea
                id="customer-address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Alamat lengkap customer"
                rows={3}
                disabled={saving}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <Label htmlFor="customer-active">Customer aktif</Label>
                <p className="text-xs text-muted-foreground">Nonaktifkan bila customer tidak lagi digunakan.</p>
              </div>
              <Switch
                id="customer-active"
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                disabled={saving}
              />
            </div>
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
            <AlertDialogTitle>Hapus customer {deleteTarget?.name}?</AlertDialogTitle>
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
