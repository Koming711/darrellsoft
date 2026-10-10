'use client'

/**
 * SbDataBahan — tab "Data Bahan" modul Stock Bahan.
 *
 * - Toolbar: pencarian, filter kategori, filter status (via statusStok),
 *   switch "Nonaktif" untuk melihat bahan nonaktif, tombol Tambah.
 * - CRUD master bahan: POST/PUT/DELETE /api/stock-bahan.
 *   Hapus ditolak 409 bila bahan sudah punya transaksi → tawarkan nonaktifkan.
 * - Dialog Detail: fetch /api/stock-bahan/{id} (info, ringkasan, sub-tab
 *   Riwayat/Masuk/Keluar/Penyesuaian, riwayat harga beli).
 * - Aksi cepat Stok Masuk/Keluar didelegasikan ke shell (pindah tab + preselect).
 * - Desktop: tabel. Mobile: kartu. Loading: Skeleton 5 baris.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  Eye,
  Loader2,
  PackageMinus,
  PackagePlus,
  PackageSearch,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { ApiError, apiFetch } from '@/lib/client'
import { formatIDR } from '@/lib/format'
import { cn } from '@/lib/utils'
import type {
  BahanItem,
  KeluarItem,
  MasukItem,
  PenyesuaianItem,
  RiwayatItem,
  SuplierItem,
} from '@/lib/stock-bahan-types'
import { KATEGORI_BAHAN, SATUAN_BAHAN, statusStok } from '@/lib/stock-bahan-types'
import { SbJenisBadge, SbStatusBadge, fmtQty, fmtTgl } from '@/components/stock-bahan/sb-shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

export interface SbDataBahanProps {
  bahans: BahanItem[]
  loading: boolean
  canAdd: boolean
  canEdit: boolean
  canDelete: boolean
  supliers: SuplierItem[]
  onChanged: () => void
  onQuickMasuk: (bahanId: string) => void
  onQuickKeluar: (bahanId: string) => void
  addSignal: number
}

// ===== Tipe respons dialog detail =====
interface BahanDetailResponse {
  bahan: BahanItem
  ringkasan: { totalMasuk: number; totalKeluar: number; jumlahTransaksi: number; nilaiStok: number }
  masuk: MasukItem[]
  keluar: KeluarItem[]
  penyesuaian: PenyesuaianItem[]
  riwayat: RiwayatItem[]
  riwayatHarga: { tanggal: string; hargaBeli: number; qty: number; suplierNama: string; nomor: string }[]
}

type DetailTab = 'riwayat' | 'masuk' | 'keluar' | 'penyesuaian'

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: 'riwayat', label: 'Riwayat' },
  { id: 'masuk', label: 'Stok Masuk' },
  { id: 'keluar', label: 'Stok Keluar' },
  { id: 'penyesuaian', label: 'Penyesuaian' },
]

// ===== Form tambah/edit =====
interface FormState {
  nama: string
  kategori: string
  satuan: string
  stokMin: string
  hargaSatuan: string
  suplierId: string
  lokasi: string
  stokAwal: string
  keterangan: string
  aktif: boolean
}

const EMPTY_FORM: FormState = {
  nama: '',
  kategori: 'none',
  satuan: 'pcs',
  stokMin: '',
  hargaSatuan: '',
  suplierId: 'none',
  lokasi: '',
  stokAwal: '',
  keterangan: '',
  aktif: true,
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'Terjadi kesalahan'
}

function InfoItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</p>
      <div className="mt-0.5 text-sm font-medium break-words">{children}</div>
    </div>
  )
}

function TabEmpty({ text }: { text: string }) {
  return <p className="py-8 text-center text-xs text-muted-foreground">{text}</p>
}

export default function SbDataBahan({
  bahans,
  loading,
  canAdd,
  canEdit,
  canDelete,
  supliers,
  onChanged,
  onQuickMasuk,
  onQuickKeluar,
  addSignal,
}: SbDataBahanProps) {
  // ===== Filter toolbar =====
  const [search, setSearch] = useState('')
  const [filterKategori, setFilterKategori] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showNonaktif, setShowNonaktif] = useState(false)

  // ===== Dialog tambah/edit =====
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<BahanItem | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // ===== Dialog detail =====
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<BahanDetailResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailTab, setDetailTab] = useState<DetailTab>('riwayat')

  // ===== Hapus / nonaktifkan =====
  const [deleteTarget, setDeleteTarget] = useState<BahanItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deactivateTarget, setDeactivateTarget] = useState<BahanItem | null>(null)

  const openAdd = useCallback(() => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
  }, [])

  const openEdit = (b: BahanItem) => {
    setEditing(b)
    setForm({
      nama: b.nama,
      kategori: b.kategori || 'none',
      satuan: b.satuan || 'pcs',
      stokMin: String(b.stokMin),
      hargaSatuan: b.hargaSatuan ? String(b.hargaSatuan) : '',
      suplierId: b.suplierId || 'none',
      lokasi: b.lokasi,
      stokAwal: '',
      keterangan: b.keterangan,
      aktif: b.aktif,
    })
    setFormOpen(true)
  }

  const openDetail = useCallback((id: string) => {
    setDetail(null)
    setDetailTab('riwayat')
    setDetailId(id)
    setDetailOpen(true)
  }, [])

  // addSignal → buka dialog Tambah (dari FAB shell)
  useEffect(() => {
    if (addSignal > 0 && canAdd) openAdd()
  }, [addSignal, canAdd, openAdd])

  // Fetch detail saat dialog dibuka
  useEffect(() => {
    if (!detailOpen || !detailId) return
    let cancelled = false
    setDetailLoading(true)
    apiFetch<BahanDetailResponse>(`/api/stock-bahan/${detailId}`)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch((e) => {
        if (!cancelled) toast.error(errText(e))
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [detailOpen, detailId])

  // ===== Filter klien =====
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return bahans
      .filter((b) => (showNonaktif ? !b.aktif : b.aktif))
      .filter((b) => (filterKategori === 'all' ? true : b.kategori === filterKategori))
      .filter((b) => (filterStatus === 'all' ? true : statusStok(b.stok, b.stokMin) === filterStatus))
      .filter((b) => (q ? b.nama.toLowerCase().includes(q) || b.kode.toLowerCase().includes(q) : true))
  }, [bahans, search, filterKategori, filterStatus, showNonaktif])

  // ===== Simpan (tambah/edit) =====
  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (form.nama.trim() === '') {
      toast.error('Nama bahan wajib diisi')
      return
    }
    setSaving(true)
    try {
      const suplierId = form.suplierId === 'none' ? null : form.suplierId
      const suplierNama = suplierId ? (supliers.find((s) => s.id === suplierId)?.nama ?? '') : ''
      const payload = {
        nama: form.nama.trim(),
        kategori: form.kategori === 'none' ? '' : form.kategori,
        satuan: form.satuan,
        stokMin: Number(form.stokMin) || 0,
        hargaSatuan: Number(form.hargaSatuan) || 0,
        suplierId,
        suplierNama,
        lokasi: form.lokasi.trim(),
        keterangan: form.keterangan.trim(),
      }
      if (editing) {
        await apiFetch('/api/stock-bahan', {
          method: 'PUT',
          body: JSON.stringify({ id: editing.id, ...payload, aktif: form.aktif }),
        })
        toast.success(`Bahan "${form.nama.trim()}" diperbarui`)
      } else {
        await apiFetch('/api/stock-bahan', {
          method: 'POST',
          body: JSON.stringify({ ...payload, stokAwal: Number(form.stokAwal) || 0 }),
        })
        toast.success(`Bahan "${form.nama.trim()}" ditambahkan`)
      }
      setFormOpen(false)
      onChanged()
    } catch (err) {
      toast.error(errText(err))
    } finally {
      setSaving(false)
    }
  }

  // ===== Hapus + fallback nonaktifkan (409) =====
  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiFetch(`/api/stock-bahan?id=${encodeURIComponent(deleteTarget.id)}`, { method: 'DELETE' })
      toast.success(`Bahan "${deleteTarget.nama}" dihapus`)
      setDeleteTarget(null)
      onChanged()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setDeactivateTarget(deleteTarget)
        setDeleteTarget(null)
      } else {
        toast.error(errText(err))
      }
    } finally {
      setDeleting(false)
    }
  }

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return
    try {
      await apiFetch('/api/stock-bahan', {
        method: 'PUT',
        body: JSON.stringify({ id: deactivateTarget.id, aktif: false }),
      })
      toast.success(`Bahan "${deactivateTarget.nama}" dinonaktifkan`)
      onChanged()
    } catch (err) {
      toast.error(errText(err))
    } finally {
      setDeactivateTarget(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* ===== Toolbar ===== */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:flex-wrap">
        <div className="relative md:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama / kode bahan…"
            aria-label="Cari bahan"
            className="min-h-[40px] pl-9"
          />
        </div>
        <Select value={filterKategori} onValueChange={setFilterKategori}>
          <SelectTrigger className="w-full md:w-44" aria-label="Filter kategori">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Kategori</SelectItem>
            {KATEGORI_BAHAN.map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full md:w-40" aria-label="Filter status stok">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="aman">Aman</SelectItem>
            <SelectItem value="menipis">Menipis</SelectItem>
            <SelectItem value="habis">Habis</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 md:ml-1">
          <Switch id="sb-show-nonaktif" checked={showNonaktif} onCheckedChange={setShowNonaktif} />
          <Label htmlFor="sb-show-nonaktif" className="cursor-pointer text-sm font-normal">
            Nonaktif
          </Label>
        </div>
        {canAdd && (
          <Button onClick={openAdd} className="w-full md:ml-auto md:w-auto">
            <Plus className="h-4 w-4" /> Tambah Bahan
          </Button>
        )}
      </div>

      {/* ===== Konten ===== */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <PackageSearch className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">Tidak ada bahan yang cocok</p>
          <p className="mt-1 text-xs text-muted-foreground">Coba ubah kata kunci atau filter.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {filtered.length} bahan{showNonaktif ? ' nonaktif' : ''} ditampilkan
          </p>

          {/* Desktop: tabel */}
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Kode</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead className="text-right">Stok</TableHead>
                    <TableHead className="text-right">Minimum</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((b) => {
                    const st = statusStok(b.stok, b.stokMin)
                    return (
                      <TableRow key={b.id} className={cn(!b.aktif && 'opacity-60')}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{b.nama}</p>
                              <p className="font-mono text-[11px] text-muted-foreground">{b.kode}</p>
                            </div>
                            {!b.aktif && <Badge variant="secondary" className="shrink-0">Nonaktif</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                          {b.kode}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{b.kategori || '-'}</TableCell>
                        <TableCell className="text-sm font-bold whitespace-nowrap tabular-nums">
                          {fmtQty(b.stok)} {b.satuan}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
                          {fmtQty(b.stokMin)} {b.satuan}
                        </TableCell>
                        <TableCell>
                          <SbStatusBadge status={st} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              title="Detail"
                              aria-label={`Detail ${b.nama}`}
                              onClick={() => openDetail(b.id)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-violet-600"
                                title="Edit"
                                aria-label={`Edit ${b.nama}`}
                                onClick={() => openEdit(b)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/10"
                              title="Stok Masuk"
                              aria-label={`Stok masuk ${b.nama}`}
                              onClick={() => onQuickMasuk(b.id)}
                            >
                              <PackagePlus className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-500/10"
                              title="Stok Keluar"
                              aria-label={`Stok keluar ${b.nama}`}
                              onClick={() => onQuickKeluar(b.id)}
                            >
                              <PackageMinus className="h-4 w-4" />
                            </Button>
                            {canDelete && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                title="Hapus"
                                aria-label={`Hapus ${b.nama}`}
                                onClick={() => setDeleteTarget(b)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Mobile: kartu */}
          <div className="grid max-h-96 grid-cols-1 gap-2.5 overflow-y-auto pr-0.5 md:hidden">
            {filtered.map((b) => {
              const st = statusStok(b.stok, b.stokMin)
              return (
                <Card key={b.id} className="gap-0 rounded-xl py-0">
                  <CardContent className="space-y-2.5 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{b.nama}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{b.kode}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-violet-600"
                            title="Edit"
                            aria-label={`Edit ${b.nama}`}
                            onClick={() => openEdit(b)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            title="Hapus"
                            aria-label={`Hapus ${b.nama}`}
                            onClick={() => setDeleteTarget(b)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-0.5 text-xs">
                      <p className="text-muted-foreground">
                        Stok:{' '}
                        <span className="font-bold tabular-nums text-foreground">
                          {fmtQty(b.stok)} {b.satuan}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        Minimum:{' '}
                        <span className="tabular-nums text-foreground">
                          {fmtQty(b.stokMin)} {b.satuan}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <SbStatusBadge status={st} />
                      {!b.aktif && <Badge variant="secondary">Nonaktif</Badge>}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => openDetail(b.id)}
                      >
                        <Eye className="h-3.5 w-3.5" /> Detail
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 border-emerald-200 text-xs text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                        title="Stok Masuk"
                        onClick={() => onQuickMasuk(b.id)}
                      >
                        <PackagePlus className="h-3.5 w-3.5" /> Masuk
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 border-amber-200 text-xs text-amber-700 hover:bg-amber-50 dark:border-amber-500/30 dark:text-amber-400 dark:hover:bg-amber-500/10"
                        title="Stok Keluar"
                        onClick={() => onQuickKeluar(b.id)}
                      >
                        <PackageMinus className="h-3.5 w-3.5" /> Keluar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {/* ===== Dialog Tambah/Edit ===== */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Bahan' : 'Tambah Bahan'}</DialogTitle>
            <DialogDescription>
              {editing
                ? `Ubah data master bahan ${editing.nama}.`
                : 'Daftarkan bahan baru ke master stok bahan.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="sb-nama">Nama Bahan *</Label>
              <Input
                id="sb-nama"
                value={form.nama}
                onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
                placeholder="cth: Kertas Ivory 120gsm"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sb-kategori">Kategori</Label>
              <Select
                value={form.kategori}
                onValueChange={(v) => setForm((f) => ({ ...f, kategori: v }))}
              >
                <SelectTrigger id="sb-kategori" className="w-full">
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tanpa kategori</SelectItem>
                  {KATEGORI_BAHAN.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sb-satuan">Satuan</Label>
              <Select value={form.satuan} onValueChange={(v) => setForm((f) => ({ ...f, satuan: v }))}>
                <SelectTrigger id="sb-satuan" className="w-full">
                  <SelectValue placeholder="Pilih satuan" />
                </SelectTrigger>
                <SelectContent>
                  {SATUAN_BAHAN.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sb-stokmin">Stok Minimum</Label>
              <Input
                id="sb-stokmin"
                type="number"
                min={0}
                step="any"
                value={form.stokMin}
                onChange={(e) => setForm((f) => ({ ...f, stokMin: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sb-harga">{editing ? 'Harga Modal Terakhir' : 'Harga Modal'}</Label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                  Rp
                </span>
                <Input
                  id="sb-harga"
                  type="number"
                  min={0}
                  step="any"
                  value={form.hargaSatuan}
                  onChange={(e) => setForm((f) => ({ ...f, hargaSatuan: e.target.value }))}
                  placeholder="0"
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="sb-suplier">Supplier</Label>
              <Select
                value={form.suplierId}
                onValueChange={(v) => setForm((f) => ({ ...f, suplierId: v }))}
              >
                <SelectTrigger id="sb-suplier" className="w-full">
                  <SelectValue placeholder="Pilih supplier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tanpa supplier</SelectItem>
                  {supliers
                    .filter((s) => s.aktif)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nama}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sb-lokasi">Lokasi Penyimpanan</Label>
              <Input
                id="sb-lokasi"
                value={form.lokasi}
                onChange={(e) => setForm((f) => ({ ...f, lokasi: e.target.value }))}
                placeholder="cth: Rak A2"
              />
            </div>
            {editing ? (
              <div className="flex items-end pb-1">
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Stok hanya berubah lewat Stok Masuk/Keluar/Penyesuaian.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="sb-stokawal">Stok Awal (Opsional)</Label>
                <Input
                  id="sb-stokawal"
                  type="number"
                  min={0}
                  step="any"
                  value={form.stokAwal}
                  onChange={(e) => setForm((f) => ({ ...f, stokAwal: e.target.value }))}
                  placeholder="0"
                />
                <p className="text-[11px] text-muted-foreground">Isi jika bahan sudah punya stok.</p>
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="sb-keterangan">Keterangan</Label>
              <Textarea
                id="sb-keterangan"
                value={form.keterangan}
                onChange={(e) => setForm((f) => ({ ...f, keterangan: e.target.value }))}
                placeholder="Catatan tambahan…"
                rows={2}
              />
            </div>
            {editing && (
              <div className="flex items-center justify-between gap-3 rounded-xl border p-3 sm:col-span-2">
                <div className="min-w-0">
                  <Label htmlFor="sb-aktif" className="text-sm font-medium">
                    Bahan Aktif
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Bahan nonaktif disembunyikan dari daftar utama & pilihan transaksi.
                  </p>
                </div>
                <Switch
                  id="sb-aktif"
                  checked={form.aktif}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, aktif: v }))}
                />
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 pt-1 sm:col-span-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
                Batal
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? 'Simpan Perubahan' : 'Tambah Bahan'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ===== Dialog Detail ===== */}
      <Dialog
        open={detailOpen}
        onOpenChange={(o) => {
          setDetailOpen(o)
          if (!o) setDetailId(null)
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          {detailLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
              <div className="grid grid-cols-2 gap-2 pt-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 rounded-xl" />
                ))}
              </div>
              <Skeleton className="h-44 rounded-xl" />
            </div>
          ) : !detail ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Gagal memuat detail bahan. Tutup lalu buka kembali.
            </p>
          ) : (
            <DetailBody data={detail} tab={detailTab} onTabChange={setDetailTab} />
          )}
        </DialogContent>
      </Dialog>

      {/* ===== AlertDialog hapus ===== */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus bahan {deleteTarget?.nama}?</AlertDialogTitle>
            <AlertDialogDescription>Tindakan tidak bisa dibatalkan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== AlertDialog nonaktifkan (fallback 409) ===== */}
      <AlertDialog open={!!deactivateTarget} onOpenChange={(o) => { if (!o) setDeactivateTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bahan sudah punya transaksi. Nonaktifkan?</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateTarget?.nama} tidak bisa dihapus karena sudah dipakai dalam transaksi.
              Bahan akan dinonaktifkan agar tidak muncul di transaksi baru.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void confirmDeactivate()
              }}
            >
              Nonaktifkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ===== Isi dialog detail =====

function DetailBody({
  data,
  tab,
  onTabChange,
}: {
  data: BahanDetailResponse
  tab: DetailTab
  onTabChange: (t: DetailTab) => void
}) {
  const b = data.bahan
  const st = statusStok(b.stok, b.stokMin)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base leading-tight font-bold">{b.nama}</p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{b.kode}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <SbStatusBadge status={st} />
          {!b.aktif && <Badge variant="secondary">Nonaktif</Badge>}
        </div>
      </div>

      {/* Info master */}
      <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
        <InfoItem label="Kode">{b.kode}</InfoItem>
        <InfoItem label="Kategori">{b.kategori || '-'}</InfoItem>
        <InfoItem label="Supplier">{b.suplierNama || '-'}</InfoItem>
        <InfoItem label="Stok Saat Ini">
          <span className="font-bold tabular-nums">
            {fmtQty(b.stok)} {b.satuan}
          </span>
        </InfoItem>
        <InfoItem label="Stok Minimum">
          <span className="tabular-nums">
            {fmtQty(b.stokMin)} {b.satuan}
          </span>
        </InfoItem>
        <InfoItem label="Harga Modal Terakhir">
          <span className="tabular-nums">{formatIDR(b.hargaSatuan)}</span>
        </InfoItem>
        <InfoItem label="Lokasi">{b.lokasi || '-'}</InfoItem>
        <InfoItem label="Catatan">{b.keterangan || '-'}</InfoItem>
      </div>

      {/* Ringkasan mini */}
      <div className="grid grid-cols-3 gap-2">
        <div className="min-w-0 rounded-xl bg-muted/50 p-2.5">
          <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Total Masuk</p>
          <p className="truncate text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {fmtQty(data.ringkasan.totalMasuk)} {b.satuan}
          </p>
        </div>
        <div className="min-w-0 rounded-xl bg-muted/50 p-2.5">
          <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Total Keluar</p>
          <p className="truncate text-sm font-bold tabular-nums text-amber-700 dark:text-amber-400">
            {fmtQty(data.ringkasan.totalKeluar)} {b.satuan}
          </p>
        </div>
        <div className="min-w-0 rounded-xl bg-muted/50 p-2.5">
          <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Nilai Stok</p>
          <p className="truncate text-sm font-bold tabular-nums">
            {formatIDR(data.ringkasan.nilaiStok)}
          </p>
        </div>
      </div>

      {/* Sub-tab pill */}
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Detail mutasi bahan">
        {DETAIL_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTabChange(t.id)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap transition-colors',
              tab === t.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Konten sub-tab */}
      <div className="max-h-72 overflow-y-auto rounded-xl border">
        {tab === 'riwayat' &&
          (data.riwayat.length === 0 ? (
            <TabEmpty text="Belum ada mutasi stok." />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>No</TableHead>
                      <TableHead>Jenis</TableHead>
                      <TableHead className="text-right">Masuk</TableHead>
                      <TableHead className="text-right">Keluar</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.riwayat.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs whitespace-nowrap">{fmtTgl(r.tanggal)}</TableCell>
                        <TableCell className="font-mono text-[11px] whitespace-nowrap text-muted-foreground">
                          {r.nomor}
                        </TableCell>
                        <TableCell>
                          <SbJenisBadge jenis={r.jenis} />
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-emerald-700 dark:text-emerald-400">
                          {r.masuk > 0 ? fmtQty(r.masuk) : '-'}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-amber-700 dark:text-amber-400">
                          {r.keluar > 0 ? fmtQty(r.keluar) : '-'}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold tabular-nums">
                          {fmtQty(r.saldo)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-2 p-2 md:hidden">
                {data.riwayat.map((r) => (
                  <div key={r.id} className="space-y-1 rounded-lg border p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">{r.nomor}</span>
                      <SbJenisBadge jenis={r.jenis} />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">{fmtTgl(r.tanggal)}</span>
                      <span className="tabular-nums">
                        {r.masuk > 0 && (
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                            +{fmtQty(r.masuk)}
                          </span>
                        )}
                        {r.keluar > 0 && (
                          <span className="font-semibold text-amber-700 dark:text-amber-400">
                            -{fmtQty(r.keluar)}
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          {' '}
                          → saldo {fmtQty(r.saldo)} {r.satuan}
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ))}

        {tab === 'masuk' &&
          (data.masuk.length === 0 ? (
            <TabEmpty text="Belum ada stok masuk." />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>No</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                      <TableHead className="text-right">Harga</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Nota</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.masuk.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs whitespace-nowrap">{fmtTgl(m.tanggal)}</TableCell>
                        <TableCell className="font-mono text-[11px] whitespace-nowrap text-muted-foreground">
                          {m.nomor}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold whitespace-nowrap tabular-nums">
                          {fmtQty(m.qty)} {m.satuan}
                        </TableCell>
                        <TableCell className="text-right text-xs whitespace-nowrap tabular-nums">
                          {formatIDR(m.hargaBeli)}
                        </TableCell>
                        <TableCell className="max-w-32 truncate text-xs">{m.suplierNama || '-'}</TableCell>
                        <TableCell className="font-mono text-[11px] whitespace-nowrap text-muted-foreground">
                          {m.nomorNota || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-2 p-2 md:hidden">
                {data.masuk.map((m) => (
                  <div key={m.id} className="space-y-1 rounded-lg border p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">{m.nomor}</span>
                      <span className="text-[11px] text-muted-foreground">{fmtTgl(m.tanggal)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold tabular-nums">
                        {fmtQty(m.qty)} {m.satuan}
                      </span>
                      <span className="tabular-nums">{formatIDR(m.hargaBeli)}</span>
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">
                      Supplier: {m.suplierNama || '-'}
                      {m.nomorNota ? ` · Nota ${m.nomorNota}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </>
          ))}

        {tab === 'keluar' &&
          (data.keluar.length === 0 ? (
            <TabEmpty text="Belum ada stok keluar." />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>No</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                      <TableHead>Tujuan</TableHead>
                      <TableHead>Catatan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.keluar.map((k) => (
                      <TableRow key={k.id}>
                        <TableCell className="text-xs whitespace-nowrap">{fmtTgl(k.tanggal)}</TableCell>
                        <TableCell className="font-mono text-[11px] whitespace-nowrap text-muted-foreground">
                          {k.nomor}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold whitespace-nowrap tabular-nums">
                          {fmtQty(k.qty)} {k.satuan}
                        </TableCell>
                        <TableCell className="max-w-28 truncate text-xs">{k.tujuan || '-'}</TableCell>
                        <TableCell className="max-w-40 truncate text-xs text-muted-foreground">
                          {k.catatan || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-2 p-2 md:hidden">
                {data.keluar.map((k) => (
                  <div key={k.id} className="space-y-1 rounded-lg border p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">{k.nomor}</span>
                      <span className="text-[11px] text-muted-foreground">{fmtTgl(k.tanggal)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold tabular-nums">
                        {fmtQty(k.qty)} {k.satuan}
                      </span>
                      <span className="truncate text-muted-foreground">{k.tujuan || '-'}</span>
                    </div>
                    {k.catatan && (
                      <p className="truncate text-[11px] text-muted-foreground">{k.catatan}</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          ))}

        {tab === 'penyesuaian' &&
          (data.penyesuaian.length === 0 ? (
            <TabEmpty text="Belum ada penyesuaian stok." />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>No</TableHead>
                      <TableHead className="text-right">Sistem</TableHead>
                      <TableHead className="text-right">Fisik</TableHead>
                      <TableHead className="text-right">Selisih</TableHead>
                      <TableHead>Alasan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.penyesuaian.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs whitespace-nowrap">{fmtTgl(a.tanggal)}</TableCell>
                        <TableCell className="font-mono text-[11px] whitespace-nowrap text-muted-foreground">
                          {a.nomor}
                        </TableCell>
                        <TableCell className="text-right text-xs whitespace-nowrap tabular-nums">
                          {fmtQty(a.stokSistem)}
                        </TableCell>
                        <TableCell className="text-right text-xs whitespace-nowrap tabular-nums">
                          {fmtQty(a.stokFisik)}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold whitespace-nowrap tabular-nums">
                          <span
                            className={cn(
                              a.selisih > 0 && 'text-emerald-700 dark:text-emerald-400',
                              a.selisih < 0 && 'text-red-600 dark:text-red-400',
                              a.selisih === 0 && 'text-muted-foreground'
                            )}
                          >
                            {a.selisih > 0 ? `+${fmtQty(a.selisih)}` : fmtQty(a.selisih)}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-36 truncate text-xs text-muted-foreground">
                          {a.alasan || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-2 p-2 md:hidden">
                {data.penyesuaian.map((a) => (
                  <div key={a.id} className="space-y-1 rounded-lg border p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">{a.nomor}</span>
                      <span className="text-[11px] text-muted-foreground">{fmtTgl(a.tanggal)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="tabular-nums">
                        Sistem {fmtQty(a.stokSistem)} → Fisik {fmtQty(a.stokFisik)}
                      </span>
                      <span
                        className={cn(
                          'font-semibold tabular-nums',
                          a.selisih > 0 && 'text-emerald-700 dark:text-emerald-400',
                          a.selisih < 0 && 'text-red-600 dark:text-red-400',
                          a.selisih === 0 && 'text-muted-foreground'
                        )}
                      >
                        {a.selisih > 0 ? `+${fmtQty(a.selisih)}` : fmtQty(a.selisih)}
                      </span>
                    </div>
                    {a.alasan && (
                      <p className="truncate text-[11px] text-muted-foreground">{a.alasan}</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          ))}
      </div>

      {/* Riwayat harga beli */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold">Riwayat Harga Beli</p>
        {data.riwayatHarga.length === 0 ? (
          <p className="text-xs text-muted-foreground">Belum ada riwayat harga</p>
        ) : (
          <div className="space-y-1">
            {data.riwayatHarga.map((h, i) => (
              <div key={`${h.nomor}-${i}`} className="flex items-center gap-2 text-xs">
                <span className="w-20 shrink-0 text-muted-foreground">{fmtTgl(h.tanggal)}</span>
                <span className="font-semibold tabular-nums">{formatIDR(h.hargaBeli)}</span>
                <span className="truncate text-muted-foreground">{h.suplierNama || '-'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
