'use client'

import { Eye, Pencil, Plus, Scissors, Search, Trash2, Loader2 } from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { toast } from 'sonner'
import { getAuthUser } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'
import { hasSubPermission } from '@/lib/permissions'
import { notifyDataChange } from '@/lib/data-sync'
import { useDataChange } from '@/hooks/use-data-change'
import { formatNumberID, formatRupiah } from '@/lib/paper-cutting'

interface MasterKertas {
  id: string
  name: string
  width: number
  height: number
  price: number
  unit: string
  status: string
  createdAt: string
  updatedAt: string
}

interface FormData {
  name: string
  width: string
  height: string
  price: string
  unit: string
  status: string
}

const EMPTY_FORM: FormData = {
  name: '',
  width: '',
  height: '',
  price: '',
  unit: 'lembar',
  status: 'aktif',
}

export default function MasterKertasPage() {
  const currentUser = getAuthUser()
  const canAdd = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-kertas', 'master-kertas-tambah')
  const canEdit = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-kertas', 'master-kertas-edit')
  const canDelete = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-kertas', 'master-kertas-hapus')

  const [papers, setPapers] = useState<MasterKertas[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Dialog state
  const [formOpen, setFormOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editingPaper, setEditingPaper] = useState<MasterKertas | null>(null)
  const [detailPaper, setDetailPaper] = useState<MasterKertas | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MasterKertas | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchPapers()
  }, [])

  useDataChange(['master-kertas'], () => {
    fetchPapers()
  })

  const fetchPapers = async () => {
    try {
      setLoading(true)
      const res = await authFetch('/api/master-kertas')
      if (!res.ok) throw new Error('Gagal memuat data')
      const data = await res.json()
      setPapers(Array.isArray(data) ? data : [])
    } catch {
      toast.error('Gagal memuat data Master Kertas')
    } finally {
      setLoading(false)
    }
  }

  // Filter pencarian sederhana
  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return papers
    return papers.filter(p =>
      p.name.toLowerCase().includes(q) ||
      `${p.width}x${p.height}`.includes(q)
    )
  }, [papers, searchTerm])

  const openAdd = () => {
    setEditingPaper(null)
    setFormData(EMPTY_FORM)
    setFormOpen(true)
  }

  const openEdit = (paper: MasterKertas) => {
    setEditingPaper(paper)
    setFormData({
      name: paper.name,
      width: String(paper.width),
      height: String(paper.height),
      price: String(paper.price),
      unit: paper.unit || 'lembar',
      status: paper.status || 'aktif',
    })
    setFormOpen(true)
  }

  const openDetail = (paper: MasterKertas) => {
    setDetailPaper(paper)
    setDetailOpen(true)
  }

  const openDelete = (paper: MasterKertas) => {
    setDeleteTarget(paper)
    setDeleteOpen(true)
  }

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      toast.error('Nama kertas wajib diisi')
      return false
    }
    if (!(parseFloat(formData.width) > 0) || !(parseFloat(formData.height) > 0)) {
      toast.error('Lebar dan panjang harus lebih dari 0')
      return false
    }
    if (formData.price && parseFloat(formData.price) < 0) {
      toast.error('Harga tidak boleh negatif')
      return false
    }
    return true
  }

  const handleSave = async () => {
    if (!validateForm()) return
    try {
      setSaving(true)
      const isEdit = !!editingPaper
      const res = await authFetch(isEdit ? `/api/master-kertas/${editingPaper!.id}` : '/api/master-kertas', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          width: parseFloat(formData.width),
          height: parseFloat(formData.height),
          price: parseFloat(formData.price) || 0,
          unit: formData.unit,
          status: formData.status,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan')
      toast.success(isEdit ? 'Kertas berhasil diubah' : 'Kertas berhasil ditambahkan')
      setFormOpen(false)
      notifyDataChange('master-kertas')
      await fetchPapers()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      setDeleting(true)
      const res = await authFetch(`/api/master-kertas/${deleteTarget.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus')
      toast.success(`Kertas "${deleteTarget.name}" dihapus`)
      setDeleteOpen(false)
      setDeleteTarget(null)
      notifyDataChange('master-kertas')
      await fetchPapers()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <DashboardLayout title="Master Kertas" subtitle="Kelola ukuran dan harga kertas untuk fitur Potong Kertas">
      <div className="space-y-4 sm:space-y-6">
        {/* Header actions */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Cari nama kertas atau ukuran..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              aria-label="Cari kertas"
            />
          </div>
          {canAdd && (
            <Button onClick={openAdd} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="h-4 w-4 mr-1" /> Tambah Kertas
            </Button>
          )}
        </div>

        {/* Daftar kertas */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Scissors className="h-10 w-10 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">
                {searchTerm ? 'Tidak ada kertas yang cocok dengan pencarian' : 'Belum ada data kertas'}
              </p>
              <p className="text-sm text-slate-400 mt-1">
                Tambahkan ukuran kertas agar bisa dipakai di halaman Potong Kertas
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Tabel desktop */}
            <Card className="hidden md:block">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">No</TableHead>
                      <TableHead>Nama Kertas</TableHead>
                      <TableHead>Ukuran</TableHead>
                      <TableHead className="text-right">Harga</TableHead>
                      <TableHead>Satuan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p, i) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-slate-400">{i + 1}</TableCell>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>{formatNumberID(p.width, 2)} × {formatNumberID(p.height, 2)} cm</TableCell>
                        <TableCell className="text-right">{p.price > 0 ? formatRupiah(p.price) : '-'}</TableCell>
                        <TableCell className="capitalize">{p.unit}</TableCell>
                        <TableCell>
                          <Badge variant={p.status === 'aktif' ? 'default' : 'secondary'}
                            className={p.status === 'aktif' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : ''}>
                            {p.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDetail(p)} aria-label="Detail">
                              <Eye className="h-4 w-4 text-slate-500" />
                            </Button>
                            {canEdit && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)} aria-label="Edit">
                                <Pencil className="h-4 w-4 text-amber-600" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDelete(p)} aria-label="Hapus">
                                <Trash2 className="h-4 w-4 text-rose-600" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Kartu mobile */}
            <div className="md:hidden space-y-3">
              {filtered.map((p, i) => (
                <Card key={p.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">#{i + 1}</span>
                          <p className="font-semibold truncate">{p.name}</p>
                        </div>
                        <p className="text-sm text-slate-500 mt-1">
                          {formatNumberID(p.width, 2)} × {formatNumberID(p.height, 2)} cm
                        </p>
                        <p className="text-sm text-slate-500">
                          {p.price > 0 ? `${formatRupiah(p.price)} / ${p.unit}` : 'Harga belum diisi'}
                        </p>
                      </div>
                      <Badge variant={p.status === 'aktif' ? 'default' : 'secondary'}
                        className={p.status === 'aktif' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 shrink-0' : 'shrink-0'}>
                        {p.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                    </div>
                    <div className="flex gap-2 mt-3 pt-3 border-t">
                      <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => openDetail(p)}>
                        <Eye className="h-4 w-4 mr-1" /> Detail
                      </Button>
                      {canEdit && (
                        <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => openEdit(p)}>
                          <Pencil className="h-4 w-4 mr-1 text-amber-600" /> Edit
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => openDelete(p)}>
                          <Trash2 className="h-4 w-4 mr-1 text-rose-600" /> Hapus
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* Dialog tambah/edit */}
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingPaper ? 'Edit Kertas' : 'Tambah Kertas'}</DialogTitle>
              <DialogDescription>
                {editingPaper ? 'Ubah data ukuran kertas' : 'Tambahkan ukuran kertas baru ke master'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="mk-name">Nama Kertas</Label>
                <Input id="mk-name" placeholder="Contoh: HVS, Art Paper, Ivory"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div>
                <Label>Ukuran Kertas (cm)</Label>
                <div className="flex items-center gap-2 mt-1.5">
                  <Input type="number" step="0.1" min="0" placeholder="Lebar"
                    aria-label="Lebar kertas"
                    value={formData.width}
                    onChange={(e) => setFormData({ ...formData, width: e.target.value })} />
                  <span className="text-slate-400">×</span>
                  <Input type="number" step="0.1" min="0" placeholder="Panjang"
                    aria-label="Panjang kertas"
                    value={formData.height}
                    onChange={(e) => setFormData({ ...formData, height: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mk-price">Harga (Rp)</Label>
                <Input id="mk-price" type="number" min="0" placeholder="Contoh: 75000"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Satuan</Label>
                  <Select value={formData.unit} onValueChange={(v) => setFormData({ ...formData, unit: v })}>
                    <SelectTrigger aria-label="Satuan harga"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lembar">Lembar</SelectItem>
                      <SelectItem value="rim">Rim</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                    <SelectTrigger aria-label="Status kertas"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aktif">Aktif</SelectItem>
                      <SelectItem value="nonaktif">Nonaktif</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Batal</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Simpan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog detail */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Detail Kertas</DialogTitle>
            </DialogHeader>
            {detailPaper && (
              <div className="space-y-2 py-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Nama</span><span className="font-medium">{detailPaper.name}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Ukuran</span><span className="font-medium">{formatNumberID(detailPaper.width, 2)} × {formatNumberID(detailPaper.height, 2)} cm</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Harga</span><span className="font-medium">{detailPaper.price > 0 ? `${formatRupiah(detailPaper.price)} / ${detailPaper.unit}` : '-'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Status</span>
                  <Badge variant={detailPaper.status === 'aktif' ? 'default' : 'secondary'}
                    className={detailPaper.status === 'aktif' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : ''}>
                    {detailPaper.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDetailOpen(false)}>Tutup</Button>
              {canEdit && detailPaper && (
                <Button onClick={() => { setDetailOpen(false); openEdit(detailPaper) }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Pencil className="h-4 w-4 mr-1" /> Edit
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Konfirmasi hapus */}
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus kertas ini?</AlertDialogTitle>
              <AlertDialogDescription>
                Kertas <span className="font-semibold">{deleteTarget?.name}</span> akan dihapus permanen dari Master Kertas. Riwayat potong yang sudah tersimpan tidak ikut terhapus.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDelete() }}
                className="bg-rose-600 hover:bg-rose-700 text-white" disabled={deleting}>
                {deleting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Hapus
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  )
}
