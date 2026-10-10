'use client'

/**
 * DataBahanTab — CRUD master bahan.
 * Desktop: tabel. Mobile: kartu. Form dialog tambah/edit + dialog detail
 * dengan ringkasan stok + riwayat terakhir bahan.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Boxes,
  Eye,
  Layers,
  Loader2,
  PackageMinus,
  PackagePlus,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { formatIDR } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  KATEGORI_OPTIONS,
  SATUAN_OPTIONS,
  StatusBadge,
  errText,
  fmtNum,
  fmtWaktu,
  toInputDate,
  type Material,
  type Movement,
} from './shared'

const emptyForm = {
  kode: '',
  nama: '',
  kategori: 'Kertas',
  satuan: 'pcs',
  stok: '',
  stokMin: '',
  hargaModal: '',
  lokasi: '',
  catatan: '',
}

export function DataBahanTab({
  materials,
  loading,
  onRefresh,
  onQuickAction,
  formNonce = 0,
  kategoriMaster = [],
}: {
  materials: Material[]
  loading: boolean
  onRefresh: () => void
  /** Buka dialog Stok Masuk/Keluar dari tab lain (spec §11 detail). */
  onQuickAction?: (materialId: string, jenis: 'masuk' | 'keluar') => void
  /** Sinyal dari FAB: setiap perubahan nilai > 0 membuka form tambah. */
  formNonce?: number
  /** Daftar kategori dari master Kategori (union dgn kategori di bahan). */
  kategoriMaster?: string[]
}) {
  const [search, setSearch] = useState('')
  const [filterKategori, setFilterKategori] = useState('semua')
  const [filterStatus, setFilterStatus] = useState('semua')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Material | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const [detail, setDetail] = useState<Material | null>(null)
  const [detailMovements, setDetailMovements] = useState<Movement[] | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [confirmDel, setConfirmDel] = useState<Material | null>(null)
  const [deleting, setDeleting] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return materials.filter(b => {
      if (q && !`${b.nama} ${b.kode} ${b.kategori}`.toLowerCase().includes(q)) return false
      if (filterKategori !== 'semua' && b.kategori !== filterKategori) return false
      if (filterStatus === 'aktif' && !b.aktif) return false
      if (filterStatus === 'nonaktif' && b.aktif) return false
      if (['aman', 'menipis', 'habis'].includes(filterStatus) && b.status !== filterStatus) return false
      return true
    })
  }, [materials, search, filterKategori, filterStatus])

  const kategoriTersedia = useMemo(() => {
    const set = new Set(kategoriMaster)
    for (const b of materials) if (b.kategori) set.add(b.kategori)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [kategoriMaster, materials])

  const openAdd = useCallback(() => {
    setEditing(null)
    setForm(emptyForm)
    setFormOpen(true)
  }, [])

  // FAB / aksi cepat: buka form tambah saat sinyal berubah.
  useEffect(() => {
    if (formNonce > 0) openAdd()
  }, [formNonce, openAdd])

  const openEdit = useCallback((b: Material) => {
    setEditing(b)
    setForm({
      kode: b.kode,
      nama: b.nama,
      kategori: b.kategori || 'Lainnya',
      satuan: b.satuan,
      stok: '', // stok tidak diedit dari master — lewat transaksi
      stokMin: String(b.stokMin || ''),
      hargaModal: String(b.hargaModal || ''),
      lokasi: b.lokasi || '',
      catatan: b.catatan || '',
    })
    setFormOpen(true)
  }, [])

  const openDetail = useCallback(async (b: Material) => {
    setDetail(b)
    setDetailMovements(null)
    setDetailLoading(true)
    try {
      const res = await apiFetch<{ data: Movement[] }>(
        `/api/stock-bahan/mutasi?materialId=${encodeURIComponent(b.id)}&limit=50`
      )
      setDetailMovements(res.data)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const submit = useCallback(async () => {
    if (!form.nama.trim()) return toast.error('Nama bahan wajib diisi')
    if (!form.satuan.trim()) return toast.error('Satuan wajib diisi')
    setSaving(true)
    try {
      if (editing) {
        await apiFetch('/api/stock-bahan', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editing.id,
            kode: form.kode.trim(),
            nama: form.nama.trim(),
            kategori: form.kategori,
            satuan: form.satuan.trim(),
            stokMin: Number(form.stokMin) || 0,
            lokasi: form.lokasi.trim(),
            catatan: form.catatan.trim(),
          }),
        })
        toast.success('Bahan diperbarui')
      } else {
        await apiFetch('/api/stock-bahan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kode: form.kode.trim(),
            nama: form.nama.trim(),
            kategori: form.kategori,
            satuan: form.satuan.trim(),
            stok: Number(form.stok) || 0,
            stokMin: Number(form.stokMin) || 0,
            hargaModal: Number(form.hargaModal) || 0,
            lokasi: form.lokasi.trim(),
            catatan: form.catatan.trim(),
          }),
        })
        toast.success('Bahan ditambahkan')
      }
      setFormOpen(false)
      onRefresh()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setSaving(false)
    }
  }, [editing, form, onRefresh])

  const toggleAktif = useCallback(
    async (b: Material) => {
      try {
        await apiFetch('/api/stock-bahan', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: b.id, aktif: !b.aktif }),
        })
        toast.success(b.aktif ? `${b.nama} dinonaktifkan` : `${b.nama} diaktifkan kembali`)
        onRefresh()
      } catch (e) {
        toast.error(errText(e))
      }
    },
    [onRefresh]
  )

  const doDelete = useCallback(async () => {
    if (!confirmDel) return
    setDeleting(true)
    try {
      await apiFetch(`/api/stock-bahan?id=${encodeURIComponent(confirmDel.id)}`, { method: 'DELETE' })
      toast.success('Bahan dihapus')
      setConfirmDel(null)
      onRefresh()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setDeleting(false)
    }
  }, [confirmDel, onRefresh])

  return (
    <div className="space-y-4">
      {/* Header aksi — desktop + mobile */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari bahan / kode…"
            className="pl-8"
            aria-label="Cari bahan"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filterKategori} onValueChange={setFilterKategori}>
            <SelectTrigger className="w-[140px]" aria-label="Filter kategori">
              <SelectValue placeholder="Kategori" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="semua">Semua Kategori</SelectItem>
              {(kategoriTersedia.length ? kategoriTersedia : KATEGORI_OPTIONS).map(k => (
                <SelectItem key={k} value={k}>{k}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[130px]" aria-label="Filter status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="semua">Semua Status</SelectItem>
              <SelectItem value="aman">Aman</SelectItem>
              <SelectItem value="menipis">Menipis</SelectItem>
              <SelectItem value="habis">Habis</SelectItem>
              <SelectItem value="aktif">Aktif</SelectItem>
              <SelectItem value="nonaktif">Nonaktif</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={openAdd} className="gap-1.5 min-h-[44px]">
            <Plus className="h-4 w-4" /> Tambah Bahan
          </Button>
        </div>
      </div>

      {/* Konten: tabel desktop / kartu mobile */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Boxes className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium">Belum ada bahan</p>
            <p className="text-xs text-muted-foreground">
              Tambahkan bahan pertama Anda dengan tombol &ldquo;Tambah Bahan&rdquo;.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop — tabel */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <div className="max-h-[calc(100vh-380px)] overflow-y-auto stock-scroll">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead>Nama / Kode</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead className="text-right">Stok</TableHead>
                      <TableHead className="text-right">Minimum</TableHead>
                      <TableHead>Satuan</TableHead>
                      <TableHead className="text-right">Harga Modal</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(b => (
                      <TableRow key={b.id} className={cn(!b.aktif && 'opacity-50')}>
                        <TableCell>
                          <button
                            onClick={() => openDetail(b)}
                            className="text-left font-medium hover:underline"
                            aria-label={`Detail ${b.nama}`}
                          >
                            {b.nama}
                          </button>
                          <div className="text-xs text-muted-foreground">{b.kode}</div>
                        </TableCell>
                        <TableCell className="text-sm">{b.kategori || '—'}</TableCell>
                        <TableCell className={cn('text-right font-semibold tabular-nums', b.status === 'habis' && 'text-rose-600', b.status === 'menipis' && 'text-amber-600')}>
                          {fmtNum(b.stok)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{fmtNum(b.stokMin)}</TableCell>
                        <TableCell className="text-sm">{b.satuan}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{b.hargaModal > 0 ? formatIDR(b.hargaModal) : '—'}</TableCell>
                        <TableCell>
                          {b.aktif ? <StatusBadge status={b.status} /> : <Badge variant="outline" className="text-[11px]">Nonaktif</Badge>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openDetail(b)} aria-label={`Detail ${b.nama}`} title="Detail">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(b)} aria-label={`Edit ${b.nama}`} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600" onClick={() => onQuickAction?.(b.id, 'masuk')} aria-label={`Stok masuk ${b.nama}`} title="Stok Masuk">
                              <PackagePlus className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={() => onQuickAction?.(b.id, 'keluar')} aria-label={`Stok keluar ${b.nama}`} title="Stok Keluar">
                              <PackageMinus className="h-4 w-4" />
                            </Button>
                            {b.punyaTransaksi ? (
                              <Button size="icon" variant="ghost" className={cn('h-8 w-8', b.aktif ? 'text-amber-600' : 'text-emerald-600')} onClick={() => toggleAktif(b)} aria-label={`${b.aktif ? 'Nonaktifkan' : 'Aktifkan'} ${b.nama}`} title={b.aktif ? 'Nonaktifkan' : 'Aktifkan'}>
                                <Power className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={() => setConfirmDel(b)} aria-label={`Hapus ${b.nama}`} title="Hapus">
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

          {/* Mobile — kartu */}
          <div className="grid gap-3 md:hidden">
            {filtered.map(b => (
              <Card key={b.id} className={cn(!b.aktif && 'opacity-50')}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <button onClick={() => openDetail(b)} className="text-left" aria-label={`Detail ${b.nama}`}>
                      <p className="font-semibold leading-tight">{b.nama}</p>
                      <p className="text-xs text-muted-foreground">{b.kode} · {b.kategori || '—'}</p>
                    </button>
                    {b.aktif ? <StatusBadge status={b.status} /> : <Badge variant="outline" className="text-[11px]">Nonaktif</Badge>}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className={cn('text-2xl font-bold tabular-nums', b.status === 'habis' && 'text-rose-600', b.status === 'menipis' && 'text-amber-600')}>
                      {fmtNum(b.stok)}
                    </span>
                    <span className="text-sm text-muted-foreground">{b.satuan}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      Min: {fmtNum(b.stokMin)} {b.satuan}
                    </span>
                  </div>
                  {b.hargaModal > 0 && (
                    <p className="text-xs text-muted-foreground">Harga modal: {formatIDR(b.hargaModal)} / {b.satuan}</p>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <Button size="sm" variant="outline" className="h-9 gap-1 text-xs" onClick={() => openDetail(b)}>
                      <Eye className="h-3.5 w-3.5" /> Detail
                    </Button>
                    <Button size="sm" variant="outline" className="h-9 gap-1 text-xs border-emerald-300 text-emerald-700" onClick={() => onQuickAction?.(b.id, 'masuk')}>
                      <PackagePlus className="h-3.5 w-3.5" /> Masuk
                    </Button>
                    <Button size="sm" variant="outline" className="h-9 gap-1 text-xs border-rose-300 text-rose-700" onClick={() => onQuickAction?.(b.id, 'keluar')}>
                      <PackageMinus className="h-3.5 w-3.5" /> Keluar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Dialog Form Tambah/Edit */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Bahan' : 'Tambah Bahan'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Stok diubah lewat Stok Masuk / Stok Keluar / Penyesuaian — bukan dari form ini.'
                : 'Kode bahan dikosongkan untuk nomor otomatis (BHN-001, …).'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="bh-kode">Kode Bahan</Label>
                <Input id="bh-kode" value={form.kode} onChange={e => setForm(f => ({ ...f, kode: e.target.value }))} placeholder="Otomatis" disabled={!!editing && editing.punyaTransaksi} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bh-kategori">Kategori</Label>
                <Select value={form.kategori} onValueChange={v => setForm(f => ({ ...f, kategori: v }))}>
                  <SelectTrigger id="bh-kategori"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(kategoriTersedia.length ? kategoriTersedia : KATEGORI_OPTIONS).map(k => (
                      <SelectItem key={k} value={k}>{k}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Kelola kategori via menu Kategori.</p>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bh-nama">Nama Bahan *</Label>
              <Input id="bh-nama" value={form.nama} onChange={e => setForm(f => ({ ...f, nama: e.target.value }))} placeholder="cth: Kertas Kraft" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="bh-satuan">Satuan *</Label>
                <Select value={form.satuan} onValueChange={v => setForm(f => ({ ...f, satuan: v }))}>
                  <SelectTrigger id="bh-satuan"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SATUAN_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bh-stokmin">Stok Minimum</Label>
                <Input id="bh-stokmin" type="number" min="0" value={form.stokMin} onChange={e => setForm(f => ({ ...f, stokMin: e.target.value }))} placeholder="0" />
              </div>
            </div>
            {!editing && (
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="bh-stok">Stok Awal</Label>
                  <Input id="bh-stok" type="number" min="0" value={form.stok} onChange={e => setForm(f => ({ ...f, stok: e.target.value }))} placeholder="0" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="bh-harga">Harga Modal (Rp)</Label>
                  <Input id="bh-harga" type="number" min="0" value={form.hargaModal} onChange={e => setForm(f => ({ ...f, hargaModal: e.target.value }))} placeholder="0" />
                </div>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="bh-lokasi">Lokasi Penyimpanan</Label>
              <Input id="bh-lokasi" value={form.lokasi} onChange={e => setForm(f => ({ ...f, lokasi: e.target.value }))} placeholder="cth: Rak A1" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bh-catatan">Catatan</Label>
              <Textarea id="bh-catatan" rows={2} value={form.catatan} onChange={e => setForm(f => ({ ...f, catatan: e.target.value }))} />
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

      {/* Dialog Detail */}
      <Dialog open={!!detail} onOpenChange={o => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-primary" />
                  {detail.nama}
                </DialogTitle>
                <DialogDescription>{detail.kode} · {detail.kategori || 'Tanpa kategori'} · {detail.satuan}</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <div className="rounded-lg border p-2.5">
                  <p className="text-xs text-muted-foreground">Stok Saat Ini</p>
                  <p className="text-lg font-bold tabular-nums">{fmtNum(detail.stok)} <span className="text-xs font-normal text-muted-foreground">{detail.satuan}</span></p>
                </div>
                <div className="rounded-lg border p-2.5">
                  <p className="text-xs text-muted-foreground">Stok Minimum</p>
                  <p className="text-lg font-bold tabular-nums">{fmtNum(detail.stokMin)}</p>
                </div>
                <div className="rounded-lg border p-2.5">
                  <p className="text-xs text-muted-foreground">Harga Modal Terakhir</p>
                  <p className="text-lg font-bold tabular-nums">{detail.hargaModal > 0 ? formatIDR(detail.hargaModal) : '—'}</p>
                </div>
              </div>
              {detail.lokasi && <p className="text-xs text-muted-foreground">Lokasi: {detail.lokasi}</p>}
              <div className="mt-1">
                <p className="mb-2 text-sm font-semibold">Riwayat Stok</p>
                {detailLoading ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Memuat riwayat…
                  </div>
                ) : !detailMovements || detailMovements.length === 0 ? (
                  <p className="py-3 text-sm text-muted-foreground">Belum ada mutasi stok.</p>
                ) : (
                  <div className="max-h-56 overflow-y-auto rounded-lg border stock-scroll">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-8 text-xs">Tanggal</TableHead>
                          <TableHead className="h-8 text-xs">No.</TableHead>
                          <TableHead className="h-8 text-xs">Jenis</TableHead>
                          <TableHead className="h-8 text-right text-xs">Masuk</TableHead>
                          <TableHead className="h-8 text-right text-xs">Keluar</TableHead>
                          <TableHead className="h-8 text-right text-xs">Saldo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailMovements.map(m => (
                          <TableRow key={m.id}>
                            <TableCell className="text-xs whitespace-nowrap">{fmtWaktu(m.tanggal).split(' ')[0]}</TableCell>
                            <TableCell className="text-xs">{m.refNomor}</TableCell>
                            <TableCell className="text-xs">{m.jenis === 'masuk' ? 'Masuk' : m.jenis === 'keluar' ? 'Keluar' : 'Penyesuaian'}</TableCell>
                            <TableCell className="text-right text-xs tabular-nums text-emerald-600">{m.masuk > 0 ? `+${fmtNum(m.masuk)}` : '—'}</TableCell>
                            <TableCell className="text-right text-xs tabular-nums text-rose-600">{m.keluar > 0 ? `−${fmtNum(m.keluar)}` : '—'}</TableCell>
                            <TableCell className="text-right text-xs font-semibold tabular-nums">{fmtNum(m.saldo)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" className="border-emerald-300 text-emerald-700" onClick={() => { setDetail(null); onQuickAction?.(detail.id, 'masuk') }}>
                  <PackagePlus className="h-4 w-4 mr-1" /> Stok Masuk
                </Button>
                <Button variant="outline" className="border-rose-300 text-rose-700" onClick={() => { setDetail(null); onQuickAction?.(detail.id, 'keluar') }}>
                  <PackageMinus className="h-4 w-4 mr-1" /> Stok Keluar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Konfirmasi hapus */}
      <AlertDialog open={!!confirmDel} onOpenChange={o => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus bahan?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDel?.nama} ({confirmDel?.kode}) akan dihapus permanen. Bahan ini belum
              memiliki transaksi sehingga aman dihapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => { e.preventDefault(); doDelete() }}
              className="bg-rose-600 text-white hover:bg-rose-700"
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
