'use client'

/**
 * SbSupplier — tab Data Supplier (CRUD master supplier modul Stock Bahan).
 *
 * - Pencarian nama (filter client-side) + tombol Tambah (izin canAdd).
 * - Form dialog: nama*, kontak, WhatsApp, alamat, catatan, status aktif (Switch).
 * - Hapus yang dipakai bahan/transaksi ditolak 409 (canDeactivate) → tawarkan
 *   AlertDialog kedua untuk menonaktifkan (PUT aktif:false).
 * - onChanged() dipanggil setelah tiap sukses agar shell me-refresh data.
 * - addSignal: shell menyuruh membuka dialog Tambah (dari FAB mobile).
 * - Desktop: tabel. Mobile: kartu. Skeleton baris saat memuat awal.
 */

import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Search, Trash2, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError, apiFetch } from '@/lib/client'
import type { SuplierItem } from '@/lib/stock-bahan-types'
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
import { Textarea } from '@/components/ui/textarea'
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

function StatusBadge({ aktif }: { aktif: boolean }) {
  return aktif ? (
    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400 whitespace-nowrap">
      Aktif
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-stone-200 bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400 whitespace-nowrap">
      Nonaktif
    </span>
  )
}

export interface SbSupplierProps {
  supliers: SuplierItem[]
  canAdd: boolean
  canEdit: boolean
  canDelete: boolean
  onChanged: () => void
  addSignal: number
}

const EMPTY_FORM = { nama: '', kontak: '', whatsapp: '', alamat: '', catatan: '' }

export default function SbSupplier({ supliers, canAdd, canEdit, canDelete, onChanged, addSignal }: SbSupplierProps) {
  const [searchInput, setSearchInput] = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SuplierItem | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [fAktif, setFAktif] = useState(true)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<SuplierItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [deactivateTarget, setDeactivateTarget] = useState<SuplierItem | null>(null)
  const [deactivating, setDeactivating] = useState(false)

  // Skeleton baris untuk muat awal (data datang dari shell)
  const [initialLoading, setInitialLoading] = useState(true)
  useEffect(() => {
    if (supliers.length > 0) {
      setInitialLoading(false)
      return
    }
    const t = setTimeout(() => setInitialLoading(false), 800)
    return () => clearTimeout(t)
  }, [supliers])

  // Sinyal dari shell (FAB mobile / aksi cepat) → buka dialog Tambah
  useEffect(() => {
    if (addSignal > 0 && canAdd) {
      setEditing(null)
      setForm(EMPTY_FORM)
      setFAktif(true)
      setDialogOpen(true)
    }
  }, [addSignal, canAdd])

  const filtered = useMemo(() => {
    const q = searchInput.trim().toLowerCase()
    if (!q) return supliers
    return supliers.filter((s) => s.nama.toLowerCase().includes(q))
  }, [supliers, searchInput])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFAktif(true)
    setDialogOpen(true)
  }

  const openEdit = (s: SuplierItem) => {
    setEditing(s)
    setForm({ nama: s.nama, kontak: s.kontak, whatsapp: s.whatsapp, alamat: s.alamat, catatan: s.catatan })
    setFAktif(s.aktif)
    setDialogOpen(true)
  }

  const save = async () => {
    const nama = form.nama.trim()
    if (!nama) {
      toast.error('Nama supplier wajib diisi')
      return
    }
    setSaving(true)
    try {
      const body = {
        nama,
        kontak: form.kontak.trim(),
        whatsapp: form.whatsapp.trim(),
        alamat: form.alamat.trim(),
        catatan: form.catatan.trim(),
        aktif: fAktif,
      }
      if (editing) {
        await apiFetch<SuplierItem>('/api/stock-bahan/suplier', {
          method: 'PUT',
          body: JSON.stringify({ id: editing.id, ...body }),
        })
        toast.success('Supplier berhasil diperbarui')
      } else {
        await apiFetch<SuplierItem>('/api/stock-bahan/suplier', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        toast.success('Supplier berhasil ditambahkan')
      }
      setDialogOpen(false)
      onChanged()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiFetch<{ success: boolean }>(
        `/api/stock-bahan/suplier?id=${encodeURIComponent(deleteTarget.id)}`,
        { method: 'DELETE' }
      )
      toast.success('Supplier berhasil dihapus')
      setDeleteTarget(null)
      onChanged()
    } catch (e) {
      // 409 canDeactivate → supplier dipakai bahan/transaksi, tawarkan nonaktifkan
      if (e instanceof ApiError && e.status === 409) {
        setDeactivateTarget(deleteTarget)
        setDeleteTarget(null)
      } else {
        toast.error(errText(e))
      }
    } finally {
      setDeleting(false)
    }
  }

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return
    setDeactivating(true)
    try {
      await apiFetch<SuplierItem>('/api/stock-bahan/suplier', {
        method: 'PUT',
        body: JSON.stringify({ id: deactivateTarget.id, aktif: false }),
      })
      toast.success('Supplier dinonaktifkan')
      setDeactivateTarget(null)
      onChanged()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setDeactivating(false)
    }
  }

  const countLabel = initialLoading ? 'Memuat data…' : `${filtered.length} supplier`

  return (
    <div className="space-y-4">
      {/* Header + toolbar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg md:text-xl font-bold tracking-tight">Data Supplier</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{countLabel}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 sm:w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari nama supplier…"
              aria-label="Cari supplier"
              className="pl-9 min-h-[44px]"
            />
          </div>
          {canAdd && (
            <Button onClick={openCreate} className="min-h-[44px] w-full sm:w-auto">
              <Plus className="h-4 w-4" /> Tambah Supplier
            </Button>
          )}
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
        {initialLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState searched={searchInput.trim() !== ''} />
        ) : (
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-stone-50">
                <TableRow className="bg-stone-50 hover:bg-stone-50">
                  <TableHead className="min-w-40">Nama</TableHead>
                  <TableHead className="min-w-36">Kontak</TableHead>
                  <TableHead className="min-w-36">WhatsApp</TableHead>
                  <TableHead className="min-w-44">Alamat</TableHead>
                  <TableHead className="min-w-36">Catatan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-semibold">{s.nama}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{s.kontak || '-'}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{s.whatsapp || '-'}</TableCell>
                    <TableCell className="max-w-52 truncate text-muted-foreground" title={s.alamat}>
                      {s.alamat || '-'}
                    </TableCell>
                    <TableCell className="max-w-40 truncate text-muted-foreground" title={s.catatan}>
                      {s.catatan || '-'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge aktif={s.aktif} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          disabled={!canEdit}
                          onClick={() => openEdit(s)}
                          aria-label={`Edit ${s.nama}`}
                          title={canEdit ? 'Edit' : 'Tidak punya izin edit'}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-red-600 hover:text-red-700 hover:bg-red-50"
                          disabled={!canDelete || deleting}
                          onClick={() => setDeleteTarget(s)}
                          aria-label={`Hapus ${s.nama}`}
                          title={canDelete ? 'Hapus' : 'Tidak punya izin hapus'}
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
      <div className="md:hidden space-y-2.5">
        {initialLoading ? (
          [1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
        ) : filtered.length === 0 ? (
          <EmptyState searched={searchInput.trim() !== ''} />
        ) : (
          filtered.map((s) => (
            <Card key={s.id} className="p-0 gap-0">
              <CardContent className="p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-snug">{s.nama}</p>
                  <StatusBadge aktif={s.aktif} />
                </div>
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  <p>Kontak: {s.kontak || '-'}</p>
                  <p>WhatsApp: {s.whatsapp || '-'}</p>
                  {s.alamat && <p className="truncate" title={s.alamat}>{s.alamat}</p>}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 flex-1 text-xs"
                    disabled={!canEdit}
                    onClick={() => openEdit(s)}
                    aria-label={`Edit ${s.nama}`}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 flex-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                    disabled={!canDelete || deleting}
                    onClick={() => setDeleteTarget(s)}
                    aria-label={`Hapus ${s.nama}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Hapus
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* ===== Dialog tambah/edit ===== */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!saving) setDialogOpen(o)
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Supplier' : 'Tambah Supplier'}</DialogTitle>
            <DialogDescription>
              {editing ? `Perubahan tersimpan untuk supplier ${editing.nama}.` : 'Lengkapi data supplier bahan baku.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3.5 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="sb-sup-nama">
                Nama <span className="text-red-600">*</span>
              </Label>
              <Input
                id="sb-sup-nama"
                value={form.nama}
                onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
                placeholder="Nama supplier / toko"
                disabled={saving}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sb-sup-kontak">Kontak</Label>
              <Input
                id="sb-sup-kontak"
                value={form.kontak}
                onChange={(e) => setForm((f) => ({ ...f, kontak: e.target.value }))}
                placeholder="Nama PIC / telepon"
                disabled={saving}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sb-sup-wa">WhatsApp</Label>
              <Input
                id="sb-sup-wa"
                value={form.whatsapp}
                onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
                placeholder="08xxxxxxxxxx"
                disabled={saving}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sb-sup-alamat">Alamat</Label>
              <Textarea
                id="sb-sup-alamat"
                rows={2}
                value={form.alamat}
                onChange={(e) => setForm((f) => ({ ...f, alamat: e.target.value }))}
                placeholder="Alamat supplier"
                disabled={saving}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sb-sup-catatan">Catatan</Label>
              <Input
                id="sb-sup-catatan"
                value={form.catatan}
                onChange={(e) => setForm((f) => ({ ...f, catatan: e.target.value }))}
                placeholder="Catatan tambahan (opsional)"
                disabled={saving}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-stone-200 p-3">
              <div>
                <Label htmlFor="sb-sup-aktif">Status aktif</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Supplier nonaktif tidak muncul sebagai pilihan transaksi</p>
              </div>
              <Switch id="sb-sup-aktif" checked={fAktif} onCheckedChange={setFAktif} disabled={saving} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button onClick={() => void save()} disabled={saving || form.nama.trim() === ''}>
              {saving ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== AlertDialog hapus ===== */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus supplier {deleteTarget?.nama}?</AlertDialogTitle>
            <AlertDialogDescription>
              Supplier akan dihapus permanen. Jika masih dipakai pada data bahan/transaksi, hapus akan ditolak dan Anda
              bisa menonaktifkannya sebagai gantinya.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              {deleting ? 'Menghapus…' : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== AlertDialog nonaktifkan (setelah 409 canDeactivate) ===== */}
      <AlertDialog open={deactivateTarget !== null} onOpenChange={(o) => { if (!o) setDeactivateTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nonaktifkan supplier {deactivateTarget?.nama}?</AlertDialogTitle>
            <AlertDialogDescription>
              Supplier ini dipakai pada data bahan/transaksi sehingga tidak bisa dihapus. Statusnya akan diubah menjadi
              nonaktif dan data lama tetap utuh.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivating}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={deactivating}
              onClick={(e) => {
                e.preventDefault()
                void confirmDeactivate()
              }}
            >
              {deactivating ? 'Memproses…' : 'Nonaktifkan'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function EmptyState({ searched }: { searched: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <Truck className="h-8 w-8 text-stone-300" aria-hidden="true" />
      <p className="text-sm font-medium">{searched ? 'Tidak ada supplier yang cocok' : 'Belum ada supplier'}</p>
      <p className="text-xs text-muted-foreground">
        {searched ? 'Coba kata kunci lain.' : 'Tambahkan supplier untuk dipakai pada data bahan dan stok masuk.'}
      </p>
    </div>
  )
}
