'use client'

/**
 * SbStokKeluar — tab "Stok Keluar" modul Stock Bahan.
 *
 * - CRUD transaksi pemakaian bahan: POST/PUT/DELETE /api/stock-bahan/keluar.
 * - Validasi client: jumlah keluar tidak boleh melebihi stok, kecuali
 *   pengaturan "Allow Negative Stock" aktif (khusus admin, via /pengaturan).
 * - Toolbar: pencarian (debounce 300ms), filter bahan/tujuan/tanggal, reset, switch admin.
 * - Desktop: tabel. Mobile: kartu. Loading: Skeleton.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Loader2,
  PackageMinus,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { getTodayDate } from '@/lib/format'
import type { BahanItem, KeluarItem, StockPengaturan } from '@/lib/stock-bahan-types'
import { TUJUAN_KELUAR } from '@/lib/stock-bahan-types'
import { fmtQty, fmtTgl } from '@/components/stock-bahan/sb-shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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

export interface SbStokKeluarProps {
  bahans: BahanItem[]
  canAdd: boolean
  canEdit: boolean
  canDelete: boolean
  onChanged: () => void
  isAdmin: boolean
  preselectBahanId?: string
  onPreselectConsumed?: () => void
  addSignal: number
}

interface KeluarForm {
  tanggal: string
  bahanId: string
  qty: string
  tujuan: string
  catatan: string
}

const EMPTY_FORM: KeluarForm = {
  tanggal: '',
  bahanId: 'none',
  qty: '',
  tujuan: 'Produksi',
  catatan: '',
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'Terjadi kesalahan'
}

export default function SbStokKeluar({
  bahans,
  canAdd,
  canEdit,
  canDelete,
  onChanged,
  isAdmin,
  preselectBahanId,
  onPreselectConsumed,
  addSignal,
}: SbStokKeluarProps) {
  // ===== Daftar + filter =====
  const [rows, setRows] = useState<KeluarItem[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [fBahan, setFBahan] = useState('all')
  const [fTujuan, setFTujuan] = useState('all')
  const [fDari, setFDari] = useState('')
  const [fSampai, setFSampai] = useState('')

  // ===== Pengaturan admin =====
  const [allowNegative, setAllowNegative] = useState(false)

  // ===== Dialog tambah/edit =====
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<KeluarItem | null>(null)
  const [form, setForm] = useState<KeluarForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // ===== Hapus =====
  const [deleteTarget, setDeleteTarget] = useState<KeluarItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const openAdd = useCallback(() => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, tanggal: getTodayDate() })
    setFormOpen(true)
  }, [])

  const openEdit = (k: KeluarItem) => {
    setEditing(k)
    setForm({
      tanggal: k.tanggal,
      bahanId: k.bahanId,
      qty: String(k.qty),
      tujuan: k.tujuan || 'Produksi',
      catatan: k.catatan,
    })
    setFormOpen(true)
  }

  // preselectBahanId → buka form tambah dengan bahan terpilih (dari Data Bahan)
  useEffect(() => {
    if (!preselectBahanId) return
    if (canAdd) {
      setEditing(null)
      setForm({ ...EMPTY_FORM, tanggal: getTodayDate(), bahanId: preselectBahanId })
      setFormOpen(true)
    }
    onPreselectConsumed?.()
  }, [preselectBahanId, canAdd, onPreselectConsumed])

  // addSignal → buka dialog Tambah (dari FAB shell)
  useEffect(() => {
    if (addSignal > 0 && canAdd) openAdd()
  }, [addSignal, canAdd, openAdd])

  // Muat pengaturan "Allow Negative Stock" saat mount
  useEffect(() => {
    let cancelled = false
    apiFetch<StockPengaturan>('/api/stock-bahan/pengaturan')
      .then((p) => {
        if (!cancelled) setAllowNegative(Boolean(p?.allowNegativeStock))
      })
      .catch(() => {
        /* default: larang stok minus */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const toggleAllowNegative = async (checked: boolean) => {
    const prev = allowNegative
    setAllowNegative(checked)
    try {
      await apiFetch('/api/stock-bahan/pengaturan', {
        method: 'PUT',
        body: JSON.stringify({ allowNegativeStock: checked }),
      })
      toast.success(checked ? 'Stok minus diizinkan untuk stok keluar' : 'Stok minus kembali dilarang')
    } catch (err) {
      setAllowNegative(prev)
      toast.error(errText(err))
    }
  }

  // Debounce pencarian 300ms
  useEffect(() => {
    const t = window.setTimeout(() => setQ(search), 300)
    return () => window.clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    setListLoading(true)
    try {
      const sp = new URLSearchParams()
      if (q.trim()) sp.set('q', q.trim())
      if (fBahan !== 'all') sp.set('bahanId', fBahan)
      if (fTujuan !== 'all') sp.set('tujuan', fTujuan)
      if (fDari) sp.set('dari', fDari)
      if (fSampai) sp.set('sampai', fSampai)
      const data = await apiFetch<KeluarItem[]>(`/api/stock-bahan/keluar?${sp.toString()}`)
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setListLoading(false)
    }
  }, [q, fBahan, fTujuan, fDari, fSampai])

  useEffect(() => {
    load()
  }, [load])

  const resetFilters = () => {
    setSearch('')
    setFBahan('all')
    setFTujuan('all')
    setFDari('')
    setFSampai('')
  }

  const selectedBahan = useMemo(
    () => bahans.find((b) => b.id === form.bahanId) || null,
    [bahans, form.bahanId]
  )
  const qtyNum = Number(form.qty) || 0

  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const bahan = editing ? null : bahans.find((b) => b.id === form.bahanId)
    if (!editing && !bahan) {
      toast.error('Bahan wajib dipilih')
      return
    }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      toast.error('Jumlah keluar harus lebih dari 0')
      return
    }
    if (bahan && qtyNum > bahan.stok && !allowNegative) {
      toast.error(`Stok tidak cukup — sisa ${fmtQty(bahan.stok)} ${bahan.satuan}`)
      return
    }
    const payload = {
      bahanId: form.bahanId,
      tanggal: form.tanggal || getTodayDate(),
      qty: qtyNum,
      tujuan: form.tujuan,
      catatan: form.catatan.trim(),
    }
    setSaving(true)
    try {
      if (editing) {
        await apiFetch('/api/stock-bahan/keluar', {
          method: 'PUT',
          body: JSON.stringify({
            id: editing.id,
            tanggal: payload.tanggal,
            qty: payload.qty,
            tujuan: payload.tujuan,
            catatan: payload.catatan,
          }),
        })
        toast.success('Perubahan stok keluar tersimpan')
      } else {
        await apiFetch('/api/stock-bahan/keluar', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        toast.success('Stok keluar tersimpan')
      }
      setFormOpen(false)
      onChanged()
      load()
    } catch (err) {
      toast.error(errText(err))
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiFetch(`/api/stock-bahan/keluar?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
      })
      toast.success('Transaksi stok keluar dihapus')
      setDeleteTarget(null)
      onChanged()
      load()
    } catch (err) {
      toast.error(errText(err))
    } finally {
      setDeleting(false)
    }
  }

  const aksiBtn = 'h-8 w-8 text-muted-foreground'

  return (
    <div className="space-y-4">
      {/* ===== Toolbar ===== */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:flex-wrap">
        <div className="relative md:w-60">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari bahan / catatan / no…"
            aria-label="Cari transaksi stok keluar"
            className="min-h-[40px] pl-9"
          />
        </div>
        <Select value={fBahan} onValueChange={setFBahan}>
          <SelectTrigger className="w-full md:w-44" aria-label="Filter bahan">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Bahan</SelectItem>
            {bahans.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.nama}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fTujuan} onValueChange={setFTujuan}>
          <SelectTrigger className="w-full md:w-44" aria-label="Filter tujuan">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Tujuan</SelectItem>
            {TUJUAN_KELUAR.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={fDari}
          onChange={(e) => setFDari(e.target.value)}
          aria-label="Tanggal dari"
          className="w-full md:w-38"
        />
        <Input
          type="date"
          value={fSampai}
          onChange={(e) => setFSampai(e.target.value)}
          aria-label="Tanggal sampai"
          className="w-full md:w-38"
        />
        <Button variant="outline" size="sm" onClick={resetFilters} className="md:w-auto">
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </Button>
      </div>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Switch
              id="sb-allow-negative"
              checked={allowNegative}
              onCheckedChange={toggleAllowNegative}
            />
            <Label htmlFor="sb-allow-negative" className="cursor-pointer text-sm font-normal">
              Allow Negative Stock
            </Label>
          </div>
        )}
        {canAdd && (
          <Button onClick={openAdd} className="w-full md:ml-auto md:w-auto">
            <Plus className="h-4 w-4" /> Stok Keluar
          </Button>
        )}
      </div>

      {/* ===== Konten ===== */}
      {listLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <PackageMinus className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">Belum ada transaksi stok keluar</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Catat pemakaian bahan (produksi, sampel, rusak) untuk memulai.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {rows.length} transaksi ditampilkan
            {!allowNegative && ' — stok minus dilarang'}
          </p>

          {/* Desktop: tabel */}
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>No</TableHead>
                    <TableHead>Bahan</TableHead>
                    <TableHead className="text-right">Jumlah</TableHead>
                    <TableHead>Tujuan</TableHead>
                    <TableHead>Catatan</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((k) => (
                    <TableRow key={k.id}>
                      <TableCell className="text-sm whitespace-nowrap">{fmtTgl(k.tanggal)}</TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                        {k.nomor}
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-sm font-medium">
                        {k.bahanNama}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        <span className="text-sm font-bold text-orange-600 dark:text-orange-400">
                          −{fmtQty(k.qty)}
                        </span>{' '}
                        <span className="text-xs text-muted-foreground">{k.satuan}</span>
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{k.tujuan || '-'}</TableCell>
                      <TableCell className="max-w-48 truncate text-sm text-muted-foreground">
                        {k.catatan || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-0.5">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`${aksiBtn} hover:text-violet-600`}
                              title="Edit"
                              aria-label={`Edit ${k.nomor}`}
                              onClick={() => openEdit(k)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`${aksiBtn} hover:text-destructive`}
                              title="Hapus"
                              aria-label={`Hapus ${k.nomor}`}
                              onClick={() => setDeleteTarget(k)}
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
          </div>

          {/* Mobile: kartu */}
          <div className="grid max-h-96 grid-cols-1 gap-2.5 overflow-y-auto pr-0.5 md:hidden">
            {rows.map((k) => (
              <Card key={k.id} className="gap-0 rounded-xl py-0">
                <CardContent className="space-y-2 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{k.bahanNama}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{k.nomor}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`${aksiBtn} hover:text-violet-600`}
                          title="Edit"
                          aria-label={`Edit ${k.nomor}`}
                          onClick={() => openEdit(k)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`${aksiBtn} hover:text-destructive`}
                          title="Hapus"
                          aria-label={`Hapus ${k.nomor}`}
                          onClick={() => setDeleteTarget(k)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-lg font-bold text-orange-600 tabular-nums dark:text-orange-400">
                      −{fmtQty(k.qty)}{' '}
                      <span className="text-xs font-normal text-muted-foreground">{k.satuan}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{fmtTgl(k.tanggal)}</p>
                  </div>
                  <div className="space-y-0.5 text-xs">
                    <p className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Tujuan</span>
                      <span>{k.tujuan || '-'}</span>
                    </p>
                    {k.catatan && (
                      <p className="flex justify-between gap-2">
                        <span className="shrink-0 text-muted-foreground">Catatan</span>
                        <span className="min-w-0 truncate">{k.catatan}</span>
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* ===== Dialog Tambah/Edit ===== */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Stok Keluar' : 'Stok Keluar'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Perubahan akan menghitung ulang stok bahan terkait.'
                : 'Catat pemakaian bahan: produksi, sampel, rusak, atau internal.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sbk-tanggal">Tanggal</Label>
                <Input
                  id="sbk-tanggal"
                  type="date"
                  value={form.tanggal}
                  onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sbk-nomor">Nomor Transaksi</Label>
                <Input id="sbk-nomor" disabled value={editing ? editing.nomor : 'Otomatis (STK-xxxx)'} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="sbk-bahan">Bahan</Label>
                {editing ? (
                  <Input id="sbk-bahan" disabled value={editing.bahanNama} />
                ) : (
                  <Select
                    value={form.bahanId}
                    onValueChange={(v) => setForm({ ...form, bahanId: v })}
                  >
                    <SelectTrigger id="sbk-bahan" className="w-full">
                      <SelectValue placeholder="Pilih bahan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Pilih bahan…</SelectItem>
                      {bahans
                        .filter((b) => b.aktif)
                        .map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.nama} (sisa {fmtQty(b.stok)} {b.satuan})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
                {selectedBahan && (
                  <p className="text-xs text-muted-foreground">
                    Sisa stok: {fmtQty(selectedBahan.stok)} {selectedBahan.satuan}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sbk-qty">Jumlah Keluar</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="sbk-qty"
                    type="number"
                    min="0"
                    step="any"
                    value={form.qty}
                    onChange={(e) => setForm({ ...form, qty: e.target.value })}
                    placeholder="0"
                    required
                  />
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {selectedBahan?.satuan || (editing ? editing.satuan : '') || '-'}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sbk-tujuan">Tujuan</Label>
                <Select value={form.tujuan} onValueChange={(v) => setForm({ ...form, tujuan: v })}>
                  <SelectTrigger id="sbk-tujuan" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TUJUAN_KELUAR.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="sbk-catatan">Catatan</Label>
                <Input
                  id="sbk-catatan"
                  value={form.catatan}
                  onChange={(e) => setForm({ ...form, catatan: e.target.value })}
                  placeholder="Catatan tambahan (opsional)"
                />
              </div>
            </div>
            {selectedBahan && qtyNum > selectedBahan.stok && allowNegative && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
                Jumlah melebihi sisa stok ({fmtQty(selectedBahan.stok)} {selectedBahan.satuan}) —
                stok akan menjadi minus karena Allow Negative Stock aktif.
              </p>
            )}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? 'Simpan Perubahan' : 'Simpan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ===== AlertDialog Hapus ===== */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus transaksi stok keluar?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `Transaksi ${deleteTarget.nomor} (${deleteTarget.bahanNama}, −${fmtQty(deleteTarget.qty)} ${deleteTarget.satuan}) akan dihapus permanen dan stok bahan dihitung ulang.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                confirmDelete()
              }}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />} Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
