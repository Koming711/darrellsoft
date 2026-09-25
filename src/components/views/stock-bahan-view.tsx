'use client'

/**
 * StockBahanView — kelola stok bahan baku cetak (kertas, tinta, kimia, dll.).
 * - CRUD bahan (kode auto BHN-001, ...).
 * - Mutasi stok MASUK / KELUAR cepat dengan keterangan; stok tidak bisa minus.
 * - Riwayat mutasi per bahan; perubahan stok manual tercatat sebagai penyesuaian.
 * - Kartu ringkasan: total jenis bahan, stok rendah (≤ stok minimum), nilai stok.
 * - Desktop: tabel. Mobile: kartu. Mengikuti konvensi UI aplikasi.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Boxes,
  History,
  Layers,
  Loader2,
  PackageMinus,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { formatIDR } from '@/lib/format'
import type { SessionUser } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface Bahan {
  id: string
  kode: string
  nama: string
  kategori: string
  satuan: string
  stok: number
  stokMin: number
  hargaSatuan: number
  keterangan: string
  createdAt: string
  updatedAt: string
}

interface BahanMutasi {
  id: string
  bahanId: string
  jenis: 'masuk' | 'keluar' | 'penyesuaian'
  qty: number
  stokSetelah: number
  keterangan: string
  createdAt: string
  bahan?: { kode: string; nama: string; satuan: string }
}

const SATUAN_OPTIONS = ['pcs', 'lembar', 'rim', 'box', 'pack', 'roll', 'kg', 'gram', 'liter', 'ml', 'tube', 'kaleng']

const emptyForm = {
  nama: '',
  kategori: '',
  satuan: 'pcs',
  stok: '',
  stokMin: '',
  hargaSatuan: '',
  keterangan: '',
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'Terjadi kesalahan'
}

function formatWaktu(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function StockBahanView({
  user,
  canAdd,
  canEdit,
  canDelete,
}: {
  user: SessionUser
  canAdd: boolean
  canEdit: boolean
  canDelete: boolean
}) {
  const [list, setList] = useState<Bahan[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Form tambah/edit bahan
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Bahan | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)

  // Mutasi masuk/keluar
  const [mutasiOpen, setMutasiOpen] = useState(false)
  const [mutasiBahan, setMutasiBahan] = useState<Bahan | null>(null)
  const [mutasiJenis, setMutasiJenis] = useState<'masuk' | 'keluar'>('masuk')
  const [mutasiQty, setMutasiQty] = useState('')
  const [mutasiKet, setMutasiKet] = useState('')
  const [mutasiSaving, setMutasiSaving] = useState(false)

  // Riwayat mutasi
  const [riwayatOpen, setRiwayatOpen] = useState(false)
  const [riwayatBahan, setRiwayatBahan] = useState<Bahan | null>(null)
  const [riwayatList, setRiwayatList] = useState<BahanMutasi[]>([])
  const [riwayatLoading, setRiwayatLoading] = useState(false)

  // Hapus
  const [deleteTarget, setDeleteTarget] = useState<Bahan | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadList = useCallback(async () => {
    try {
      const data = await apiFetch<Bahan[]>('/api/stock-bahan')
      setList(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const filtered = useMemo(() => {
    const f = search.trim().toLowerCase()
    if (!f) return list
    return list.filter(
      (b) =>
        b.nama.toLowerCase().includes(f) ||
        b.kode.toLowerCase().includes(f) ||
        b.kategori.toLowerCase().includes(f)
    )
  }, [list, search])

  const stats = useMemo(() => {
    const lowStock = list.filter((b) => b.stokMin > 0 && b.stok <= b.stokMin).length
    const nilai = list.reduce((acc, b) => acc + b.stok * b.hargaSatuan, 0)
    return { total: list.length, lowStock, nilai }
  }, [list])

  const isLow = (b: Bahan) => b.stokMin > 0 && b.stok <= b.stokMin

  /* ---------- CRUD ---------- */

  const openAdd = () => {
    setEditing(null)
    setForm({ ...emptyForm })
    setFormOpen(true)
  }

  const openEdit = (b: Bahan) => {
    setEditing(b)
    setForm({
      nama: b.nama,
      kategori: b.kategori,
      satuan: b.satuan,
      stok: String(b.stok),
      stokMin: String(b.stokMin),
      hargaSatuan: String(b.hargaSatuan),
      keterangan: b.keterangan,
    })
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (form.nama.trim() === '') {
      toast.error('Nama bahan wajib diisi')
      return
    }
    setSaving(true)
    try {
      const payload = {
        nama: form.nama.trim(),
        kategori: form.kategori.trim(),
        satuan: form.satuan,
        stok: Number(form.stok) || 0,
        stokMin: Number(form.stokMin) || 0,
        hargaSatuan: Number(form.hargaSatuan) || 0,
        keterangan: form.keterangan,
      }
      if (editing) {
        await apiFetch('/api/stock-bahan', { method: 'PUT', body: JSON.stringify({ id: editing.id, ...payload }) })
        toast.success('Bahan diperbarui')
      } else {
        await apiFetch('/api/stock-bahan', { method: 'POST', body: JSON.stringify(payload) })
        toast.success('Bahan ditambahkan')
      }
      setFormOpen(false)
      await loadList()
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
      await apiFetch(`/api/stock-bahan?id=${encodeURIComponent(deleteTarget.id)}`, { method: 'DELETE' })
      toast.success('Bahan dihapus')
      setDeleteTarget(null)
      await loadList()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setDeleting(false)
    }
  }

  /* ---------- Mutasi ---------- */

  const openMutasi = (b: Bahan, jenis: 'masuk' | 'keluar') => {
    setMutasiBahan(b)
    setMutasiJenis(jenis)
    setMutasiQty('')
    setMutasiKet('')
    setMutasiOpen(true)
  }

  const handleMutasi = async () => {
    if (!mutasiBahan) return
    const qty = Number(mutasiQty)
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error('Jumlah harus lebih dari 0')
      return
    }
    setMutasiSaving(true)
    try {
      await apiFetch('/api/stock-bahan/mutasi', {
        method: 'POST',
        body: JSON.stringify({ bahanId: mutasiBahan.id, jenis: mutasiJenis, qty, keterangan: mutasiKet }),
      })
      toast.success(mutasiJenis === 'masuk' ? 'Stok masuk tercatat' : 'Stok keluar tercatat')
      setMutasiOpen(false)
      await loadList()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setMutasiSaving(false)
    }
  }

  /* ---------- Riwayat ---------- */

  const openRiwayat = async (b: Bahan) => {
    setRiwayatBahan(b)
    setRiwayatOpen(true)
    setRiwayatLoading(true)
    try {
      const data = await apiFetch<BahanMutasi[]>(`/api/stock-bahan/mutasi?bahanId=${encodeURIComponent(b.id)}`)
      setRiwayatList(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error(errText(e))
      setRiwayatList([])
    } finally {
      setRiwayatLoading(false)
    }
  }

  const mutasiBadge = (jenis: string) =>
    jenis === 'masuk'
      ? 'bg-emerald-100 text-emerald-700'
      : jenis === 'keluar'
        ? 'bg-red-100 text-red-700'
        : 'bg-amber-100 text-amber-700'

  /* ---------- Render ---------- */

  const stokBadge = (b: Bahan) => (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
        b.stok <= 0
          ? 'bg-red-100 text-red-700'
          : isLow(b)
            ? 'bg-amber-100 text-amber-700'
            : 'bg-emerald-100 text-emerald-700'
      )}
    >
      {isLow(b) && b.stok > 0 && <AlertTriangle className="h-3 w-3" />}
      {b.stok.toLocaleString('id-ID')} {b.satuan}
    </span>
  )

  const actionButtons = (b: Bahan, compact = false) => (
    <div className={cn('flex items-center', compact ? 'gap-1' : 'gap-1 justify-end')}>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
        onClick={() => openMutasi(b, 'masuk')}
        aria-label={`Stok masuk ${b.nama}`}
        title="Stok Masuk"
      >
        <PackagePlus className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
        onClick={() => openMutasi(b, 'keluar')}
        aria-label={`Stok keluar ${b.nama}`}
        title="Stok Keluar"
      >
        <PackageMinus className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-stone-700"
        onClick={() => void openRiwayat(b)}
        aria-label={`Riwayat ${b.nama}`}
        title="Riwayat Mutasi"
      >
        <History className="h-4 w-4" />
      </Button>
      {canEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-stone-700"
          onClick={() => openEdit(b)}
          aria-label={`Edit ${b.nama}`}
          title="Edit"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      )}
      {canDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={() => setDeleteTarget(b)}
          aria-label={`Hapus ${b.nama}`}
          title="Hapus"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Stock Bahan</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Kelola stok bahan baku cetak — kertas, tinta, dan bahan lainnya.
          </p>
        </div>
        {canAdd && (
          <Button onClick={openAdd} className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px] shrink-0">
            <Plus className="h-4 w-4 mr-1" />
            Tambah Bahan
          </Button>
        )}
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-0 gap-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
              <Boxes className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Total Jenis Bahan</p>
              <p className="text-lg font-bold leading-tight">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="p-0 gap-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Stok Rendah</p>
              <p className="text-lg font-bold leading-tight">{stats.lowStock}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="p-0 gap-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-100">
              <Layers className="h-5 w-5 text-teal-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Nilai Stok</p>
              <p className="text-lg font-bold leading-tight truncate">{formatIDR(stats.nilai)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pencarian */}
      <div className="relative sm:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama / kode / kategori…"
          aria-label="Cari bahan"
          className="pl-9 min-h-[44px]"
        />
      </div>

      {/* Konten */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center">
          <Boxes className="h-10 w-10 text-stone-300 mx-auto mb-2" />
          <p className="text-sm font-medium">{search ? 'Tidak ada bahan yang cocok' : 'Belum ada bahan'}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {search ? 'Coba ubah kata kunci pencarian.' : 'Tambahkan bahan pertama Anda dengan tombol "Tambah Bahan".'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop: tabel */}
          <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
            <div className="max-h-96 overflow-y-auto scrollbar-thin">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-stone-50">
                  <TableRow className="bg-stone-50 hover:bg-stone-50">
                    <TableHead>Bahan</TableHead>
                    <TableHead>Stok</TableHead>
                    <TableHead className="text-right">Harga Satuan</TableHead>
                    <TableHead className="text-right">Nilai</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>
                        <p className="font-medium">{b.nama}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {b.kode}{b.kategori ? ` · ${b.kategori}` : ''}
                        </p>
                      </TableCell>
                      <TableCell>{stokBadge(b)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatIDR(b.hargaSatuan)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatIDR(b.stok * b.hargaSatuan)}</TableCell>
                      <TableCell>{actionButtons(b)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Mobile: kartu */}
          <div className="md:hidden space-y-3">
            {filtered.map((b) => (
              <Card key={b.id} className="p-0 gap-0">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{b.nama}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {b.kode}{b.kategori ? ` · ${b.kategori}` : ''}
                      </p>
                    </div>
                    {stokBadge(b)}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Harga satuan: <span className="font-medium text-stone-700">{formatIDR(b.hargaSatuan)}</span></span>
                    <span>Nilai: <span className="font-medium text-stone-700">{formatIDR(b.stok * b.hargaSatuan)}</span></span>
                  </div>
                  {actionButtons(b, true)}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Dialog tambah/edit bahan */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-[440px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Bahan' : 'Tambah Bahan'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Perubahan stok manual akan tercatat sebagai penyesuaian di riwayat mutasi.'
                : 'Kode bahan dibuat otomatis (BHN-001, BHN-002, …).'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="bahan-nama">Nama Bahan *</Label>
              <Input
                id="bahan-nama"
                value={form.nama}
                onChange={(e) => setForm({ ...form, nama: e.target.value })}
                placeholder="mis. Art Paper 150gsm"
                className="min-h-[44px]"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="bahan-kategori">Kategori</Label>
                <Input
                  id="bahan-kategori"
                  value={form.kategori}
                  onChange={(e) => setForm({ ...form, kategori: e.target.value })}
                  placeholder="mis. Kertas, Tinta"
                  className="min-h-[44px]"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Satuan</Label>
                <Select value={form.satuan} onValueChange={(v) => setForm({ ...form, satuan: v })}>
                  <SelectTrigger className="min-h-[44px]" aria-label="Satuan bahan">
                    <SelectValue placeholder="Pilih satuan" />
                  </SelectTrigger>
                  <SelectContent>
                    {SATUAN_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="bahan-stok">{editing ? 'Stok Saat Ini' : 'Stok Awal'}</Label>
                <Input
                  id="bahan-stok"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={form.stok}
                  onChange={(e) => setForm({ ...form, stok: e.target.value })}
                  placeholder="0"
                  className="min-h-[44px]"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bahan-stokmin">Stok Minimum</Label>
                <Input
                  id="bahan-stokmin"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={form.stokMin}
                  onChange={(e) => setForm({ ...form, stokMin: e.target.value })}
                  placeholder="0"
                  className="min-h-[44px]"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bahan-harga">Harga Satuan (Rp)</Label>
              <Input
                id="bahan-harga"
                type="number"
                inputMode="numeric"
                min={0}
                step="any"
                value={form.hargaSatuan}
                onChange={(e) => setForm({ ...form, hargaSatuan: e.target.value })}
                placeholder="0"
                className="min-h-[44px]"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bahan-ket">Keterangan</Label>
              <Textarea
                id="bahan-ket"
                value={form.keterangan}
                onChange={(e) => setForm({ ...form, keterangan: e.target.value })}
                placeholder="Catatan tambahan (opsional)"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog mutasi masuk/keluar */}
      <Dialog open={mutasiOpen} onOpenChange={setMutasiOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              {mutasiJenis === 'masuk' ? 'Stok Masuk' : 'Stok Keluar'} — {mutasiBahan?.nama}
            </DialogTitle>
            <DialogDescription>
              Stok saat ini: {mutasiBahan?.stok.toLocaleString('id-ID')} {mutasiBahan?.satuan}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="mutasi-qty">Jumlah ({mutasiBahan?.satuan}) *</Label>
              <Input
                id="mutasi-qty"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={mutasiQty}
                onChange={(e) => setMutasiQty(e.target.value)}
                placeholder="0"
                className="min-h-[44px]"
                autoFocus
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mutasi-ket">Keterangan</Label>
              <Input
                id="mutasi-ket"
                value={mutasiKet}
                onChange={(e) => setMutasiKet(e.target.value)}
                placeholder={mutasiJenis === 'masuk' ? 'mis. Pembelian dari suplier' : 'mis. Dipakai produksi'}
                className="min-h-[44px]"
              />
            </div>
            {mutasiJenis === 'keluar' && mutasiBahan && Number(mutasiQty) > mutasiBahan.stok && (
              <p className="text-xs font-medium text-red-600">
                Melebihi stok saat ini ({mutasiBahan.stok.toLocaleString('id-ID')} {mutasiBahan.satuan})
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMutasiOpen(false)} disabled={mutasiSaving}>
              Batal
            </Button>
            <Button
              onClick={() => void handleMutasi()}
              disabled={mutasiSaving}
              className={mutasiJenis === 'masuk' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-600 hover:bg-orange-700'}
            >
              {mutasiSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {mutasiJenis === 'masuk' ? 'Catat Masuk' : 'Catat Keluar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog riwayat mutasi */}
      <Dialog open={riwayatOpen} onOpenChange={setRiwayatOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Riwayat Mutasi — {riwayatBahan?.nama}</DialogTitle>
            <DialogDescription>
              Stok saat ini: {riwayatBahan?.stok.toLocaleString('id-ID')} {riwayatBahan?.satuan}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto scrollbar-thin -mx-1 px-1">
            {riwayatLoading ? (
              <div className="space-y-2 py-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
              </div>
            ) : riwayatList.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Belum ada mutasi.</p>
            ) : (
              <div className="space-y-2 py-1">
                {riwayatList.map((m) => {
                  // masuk selalu +, keluar selalu −, penyesuaian mengikuti tanda qty (bisa negatif)
                  const sign = m.jenis === 'keluar' || m.qty < 0 ? '−' : '+'
                  return (
                  <div key={m.id} className="flex items-start justify-between gap-2 rounded-lg border border-stone-200 p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', mutasiBadge(m.jenis))}>
                          {m.jenis}
                        </span>
                        <span className="text-sm font-semibold">
                          {sign}
                          {Math.abs(m.qty).toLocaleString('id-ID')} {riwayatBahan?.satuan}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {m.keterangan || '—'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium">Stok: {m.stokSetelah.toLocaleString('id-ID')}</p>
                      <p className="text-[10px] text-muted-foreground">{formatWaktu(m.createdAt)}</p>
                    </div>
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Konfirmasi hapus */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus bahan?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.nama} beserta seluruh riwayat mutasinya akan dihapus permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
            >
              {deleting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
