'use client'

/**
 * SupplierTab — CRUD Data Supplier bahan.
 * Supplier dipakai pada transaksi Stok Masuk. Supplier yang sudah dipakai
 * transaksi tidak bisa hard delete — hanya dinonaktifkan.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, MessageCircle, Pencil, Plus, Power, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { errText, type Supplier } from './shared'

const emptyForm = { nama: '', kontak: '', whatsapp: '', alamat: '', catatan: '' }

export function SupplierTab({ onRefresh }: { onRefresh: () => void }) {
  const [list, setList] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const [confirmDel, setConfirmDel] = useState<Supplier | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch<{ data: Supplier[] }>('/api/stock-bahan/suppliers')
      setList(res.data)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(s => `${s.nama} ${s.kontak} ${s.alamat}`.toLowerCase().includes(q))
  }, [list, search])

  const openAdd = useCallback(() => {
    setEditing(null)
    setForm(emptyForm)
    setFormOpen(true)
  }, [])

  const openEdit = useCallback((s: Supplier) => {
    setEditing(s)
    setForm({ nama: s.nama, kontak: s.kontak, whatsapp: s.whatsapp, alamat: s.alamat, catatan: s.catatan })
    setFormOpen(true)
  }, [])

  const submit = useCallback(async () => {
    if (!form.nama.trim()) return toast.error('Nama supplier wajib diisi')
    setSaving(true)
    try {
      const payload = {
        nama: form.nama.trim(),
        kontak: form.kontak.trim(),
        whatsapp: form.whatsapp.trim(),
        alamat: form.alamat.trim(),
        catatan: form.catatan.trim(),
      }
      if (editing) {
        await apiFetch('/api/stock-bahan/suppliers', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, ...payload }),
        })
        toast.success('Supplier diperbarui')
      } else {
        await apiFetch('/api/stock-bahan/suppliers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        toast.success('Supplier ditambahkan')
      }
      setFormOpen(false)
      onRefresh()
      fetchList()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setSaving(false)
    }
  }, [editing, form, onRefresh, fetchList])

  const toggleAktif = useCallback(
    async (s: Supplier) => {
      try {
        await apiFetch('/api/stock-bahan/suppliers', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: s.id, aktif: !s.aktif }),
        })
        toast.success(s.aktif ? `${s.nama} dinonaktifkan` : `${s.nama} diaktifkan kembali`)
        onRefresh()
        fetchList()
      } catch (e) {
        toast.error(errText(e))
      }
    },
    [onRefresh, fetchList]
  )

  const doDelete = useCallback(async () => {
    if (!confirmDel) return
    setDeleting(true)
    try {
      await apiFetch(`/api/stock-bahan/suppliers?id=${encodeURIComponent(confirmDel.id)}`, { method: 'DELETE' })
      toast.success('Supplier dihapus')
      setConfirmDel(null)
      fetchList()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setDeleting(false)
    }
  }, [confirmDel, fetchList])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari supplier…" className="pl-8" aria-label="Cari supplier" />
        </div>
        <Button onClick={openAdd} className="gap-1.5 min-h-[44px]">
          <Plus className="h-4 w-4" /> Tambah Supplier
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-sm font-medium">Belum ada supplier</p>
            <p className="text-xs text-muted-foreground">Tambahkan supplier untuk dipilih saat Stok Masuk.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <div className="max-h-[calc(100vh-380px)] overflow-y-auto stock-scroll">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead>Nama Supplier</TableHead>
                      <TableHead>Kontak</TableHead>
                      <TableHead>WhatsApp</TableHead>
                      <TableHead>Alamat</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(s => (
                      <TableRow key={s.id} className={cn(!s.aktif && 'opacity-50')}>
                        <TableCell className="font-medium">{s.nama}</TableCell>
                        <TableCell className="text-sm">{s.kontak || '—'}</TableCell>
                        <TableCell className="text-sm">
                          {s.whatsapp ? (
                            <a
                              href={`https://wa.me/${s.whatsapp.replace(/[^0-9]/g, '')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-emerald-600 hover:underline"
                            >
                              <MessageCircle className="h-3.5 w-3.5" /> {s.whatsapp}
                            </a>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-sm max-w-[220px] truncate" title={s.alamat}>{s.alamat || '—'}</TableCell>
                        <TableCell>
                          {s.aktif ? (
                            <Badge variant="outline" className="text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200">Aktif</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[11px]">Nonaktif</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(s)} aria-label={`Edit ${s.nama}`} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className={cn('h-8 w-8', s.aktif ? 'text-amber-600' : 'text-emerald-600')} onClick={() => toggleAktif(s)} aria-label={`${s.aktif ? 'Nonaktifkan' : 'Aktifkan'} ${s.nama}`} title={s.aktif ? 'Nonaktifkan' : 'Aktifkan'}>
                              <Power className="h-4 w-4" />
                            </Button>
                            {!s.punyaTransaksi && (
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={() => setConfirmDel(s)} aria-label={`Hapus ${s.nama}`} title="Hapus">
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
            </CardContent>
          </Card>

          <div className="grid gap-3 md:hidden">
            {filtered.map(s => (
              <Card key={s.id} className={cn(!s.aktif && 'opacity-50')}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">{s.nama}</p>
                      <p className="text-xs text-muted-foreground">{s.kontak || '—'}</p>
                    </div>
                    {s.aktif ? (
                      <Badge variant="outline" className="text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200">Aktif</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px]">Nonaktif</Badge>
                    )}
                  </div>
                  {s.whatsapp && (
                    <a href={`https://wa.me/${s.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-emerald-600">
                      <MessageCircle className="h-3.5 w-3.5" /> {s.whatsapp}
                    </a>
                  )}
                  {s.alamat && <p className="text-xs text-muted-foreground">{s.alamat}</p>}
                  <div className="grid grid-cols-3 gap-2">
                    <Button size="sm" variant="outline" className="h-9 text-xs" onClick={() => openEdit(s)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" className={cn('h-9 text-xs', s.aktif ? 'text-amber-600 border-amber-200' : 'text-emerald-600 border-emerald-200')} onClick={() => toggleAktif(s)}>
                      <Power className="h-3.5 w-3.5 mr-1" /> {s.aktif ? 'Nonaktif' : 'Aktifkan'}
                    </Button>
                    {!s.punyaTransaksi && (
                      <Button size="sm" variant="outline" className="h-9 text-xs text-rose-600 border-rose-200" onClick={() => setConfirmDel(s)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Hapus
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Dialog form supplier */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Supplier' : 'Tambah Supplier'}</DialogTitle>
            <DialogDescription>Supplier dapat dipilih saat transaksi Stok Masuk.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="sp-nama">Nama Supplier *</Label>
              <Input id="sp-nama" value={form.nama} onChange={e => setForm(f => ({ ...f, nama: e.target.value }))} placeholder="cth: PT Sumber Kertas Jaya" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="sp-kontak">Kontak</Label>
                <Input id="sp-kontak" value={form.kontak} onChange={e => setForm(f => ({ ...f, kontak: e.target.value }))} placeholder="Nama PIC" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sp-wa">WhatsApp</Label>
                <Input id="sp-wa" value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="08xxxxxxxxxx" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sp-alamat">Alamat</Label>
              <Textarea id="sp-alamat" rows={2} value={form.alamat} onChange={e => setForm(f => ({ ...f, alamat: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sp-catatan">Catatan</Label>
              <Textarea id="sp-catatan" rows={2} value={form.catatan} onChange={e => setForm(f => ({ ...f, catatan: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Batal</Button>
            <Button onClick={submit} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? 'Simpan' : 'Tambah'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDel} onOpenChange={o => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus supplier?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDel?.nama} akan dihapus permanen. Supplier ini belum dipakai transaksi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={e => { e.preventDefault(); doDelete() }} className="bg-rose-600 text-white hover:bg-rose-700" disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
