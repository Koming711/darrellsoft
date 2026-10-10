'use client'

/**
 * KategoriTab — CRUD master kategori bahan.
 * - Daftar kategori + jumlah bahan yang memakainya.
 * - Rename kategori otomatis mengubah kategori di semua bahan terkait (API cascade).
 * - Hapus ditolak oleh API bila kategori masih dipakai bahan.
 */

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Pencil, Plus, Search, Tags, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { errText } from './shared'

interface Kategori {
  id: string
  nama: string
  catatan: string
  jumlahBahan: number
}

export function KategoriTab({
  onRefresh,
  onManageBahan,
}: {
  onRefresh: () => void
  /** Pindah ke tab Data Bahan (mis. untuk memindahkan bahan sebelum hapus kategori). */
  onManageBahan?: () => void
}) {
  const [list, setList] = useState<Kategori[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Kategori | null>(null)
  const [form, setForm] = useState({ nama: '', catatan: '' })
  const [saving, setSaving] = useState(false)

  const [confirmDel, setConfirmDel] = useState<Kategori | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch<{ data: Kategori[] }>('/api/stock-bahan/kategori')
      setList(res.data)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = list.filter(k =>
    search.trim() === '' ||
    `${k.nama} ${k.catatan}`.toLowerCase().includes(search.trim().toLowerCase())
  )

  const openAdd = useCallback(() => {
    setEditing(null)
    setForm({ nama: '', catatan: '' })
    setFormOpen(true)
  }, [])

  const openEdit = useCallback((k: Kategori) => {
    setEditing(k)
    setForm({ nama: k.nama, catatan: k.catatan })
    setFormOpen(true)
  }, [])

  const save = useCallback(async () => {
    if (!form.nama.trim()) {
      toast.error('Nama kategori wajib diisi')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await apiFetch('/api/stock-bahan/kategori', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, nama: form.nama, catatan: form.catatan }),
        })
        toast.success('Kategori diperbarui')
      } else {
        await apiFetch('/api/stock-bahan/kategori', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nama: form.nama, catatan: form.catatan }),
        })
        toast.success('Kategori ditambahkan')
      }
      setFormOpen(false)
      await load()
      onRefresh()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setSaving(false)
    }
  }, [editing, form, load, onRefresh])

  const doDelete = useCallback(async () => {
    if (!confirmDel) return
    setDeleting(true)
    try {
      await apiFetch(`/api/stock-bahan/kategori?id=${confirmDel.id}`, { method: 'DELETE' })
      toast.success('Kategori dihapus')
      setConfirmDel(null)
      await load()
      onRefresh()
    } catch (e) {
      // 409 = masih dipakai bahan → tawarkan kelola bahan.
      toast.error(errText(e), {
        action: onManageBahan
          ? { label: 'Ke Data Bahan', onClick: () => onManageBahan() }
          : undefined,
      })
      setConfirmDel(null)
    } finally {
      setDeleting(false)
    }
  }, [confirmDel, load, onRefresh, onManageBahan])

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari kategori…"
            className="pl-8"
            aria-label="Cari kategori"
          />
        </div>
        <Button size="sm" className="gap-1.5" onClick={openAdd}>
          <Plus className="h-4 w-4" /> Tambah Kategori
        </Button>
      </div>

      {/* Konten */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Tags className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">
            {list.length === 0 ? 'Belum ada kategori' : 'Tidak ada kategori yang cocok'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {list.length === 0
              ? 'Tambahkan kategori untuk mengelompokkan bahan, cth: Kertas, Tinta, Packaging.'
              : 'Coba kata kunci lain.'}
          </p>
          {list.length === 0 && (
            <Button size="sm" className="mt-4 gap-1.5" onClick={openAdd}>
              <Plus className="h-4 w-4" /> Tambah Kategori
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop: tabel */}
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Nama Kategori</TableHead>
                  <TableHead className="text-center">Jumlah Bahan</TableHead>
                  <TableHead>Catatan</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((k, i) => (
                  <TableRow key={k.id}>
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="text-sm font-semibold">{k.nama}</TableCell>
                    <TableCell className="text-center">
                      <span
                        className={cn(
                          'inline-block min-w-8 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums',
                          k.jumlahBahan > 0
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {k.jumlahBahan}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-sm text-muted-foreground">
                      {k.catatan || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          aria-label={`Edit kategori ${k.nama}`}
                          onClick={() => openEdit(k)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          aria-label={`Hapus kategori ${k.nama}`}
                          onClick={() => setConfirmDel(k)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: kartu */}
          <div className="space-y-2 md:hidden">
            {filtered.map(k => (
              <div key={k.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight">{k.nama}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {k.jumlahBahan} bahan{catatanSuffix(k.catatan)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9"
                      aria-label={`Edit kategori ${k.nama}`}
                      onClick={() => openEdit(k)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 text-destructive hover:text-destructive"
                      aria-label={`Hapus kategori ${k.nama}`}
                      onClick={() => setConfirmDel(k)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Dialog tambah/edit */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Kategori' : 'Tambah Kategori'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Mengubah nama kategori juga mengubah kategori di semua bahan yang memakainya.'
                : 'Nama kategori harus unik.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="kt-nama">Nama Kategori *</Label>
              <Input
                id="kt-nama"
                value={form.nama}
                onChange={e => setForm(f => ({ ...f, nama: e.target.value }))}
                placeholder="cth: Kertas, Tinta, Packaging"
                onKeyDown={e => {
                  if (e.key === 'Enter' && !saving) save()
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="kt-catatan">Catatan</Label>
              <Input
                id="kt-catatan"
                value={form.catatan}
                onChange={e => setForm(f => ({ ...f, catatan: e.target.value }))}
                placeholder="opsional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button onClick={save} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? 'Simpan' : 'Tambah'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog konfirmasi hapus */}
      <Dialog open={!!confirmDel} onOpenChange={o => !o && setConfirmDel(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus Kategori?</DialogTitle>
            <DialogDescription>
              Kategori <span className="font-semibold text-foreground">{confirmDel?.nama}</span> akan
              dihapus permanen.{' '}
              {confirmDel && confirmDel.jumlahBahan > 0
                ? `Kategori ini dipakai ${confirmDel.jumlahBahan} bahan dan tidak dapat dihapus.`
                : 'Kategori ini belum dipakai bahan manapun.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDel(null)} disabled={deleting}>
              Batal
            </Button>
            <Button variant="destructive" onClick={doDelete} disabled={deleting} className="gap-1.5">
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function catatanSuffix(catatan: string): string {
  return catatan ? ` · ${catatan}` : ''
}
