'use client'

/**
 * SbPenyesuaian — tab "Penyesuaian Stok" (stok opname) modul Stock Bahan.
 *
 * - CRUD /api/stock-bahan/penyesuaian: bandingkan stok sistem vs fisik,
 *   simpan selisih, lalu stok sistem diubah ke stok fisik (recalc server).
 * - Form: Stok Sistem (readonly) → Stok Fisik (input) → Selisih (auto, berwarna),
 *   alasan wajib diisi.
 * - Desktop: tabel. Mobile: kartu. Loading: Skeleton.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Scale,
  Search,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { getTodayDate } from '@/lib/format'
import type { BahanItem, PenyesuaianItem } from '@/lib/stock-bahan-types'
import { fmtQty, fmtTgl } from '@/components/stock-bahan/sb-shared'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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

export interface SbPenyesuaianProps {
  bahans: BahanItem[]
  canAdd: boolean
  canEdit: boolean
  canDelete: boolean
  onChanged: () => void
  addSignal: number
}

interface PenyesuaianForm {
  tanggal: string
  bahanId: string
  stokFisik: string
  alasan: string
  catatan: string
}

const EMPTY_FORM: PenyesuaianForm = {
  tanggal: '',
  bahanId: 'none',
  stokFisik: '',
  alasan: '',
  catatan: '',
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'Terjadi kesalahan'
}

/** Selisih dengan tanda eksplisit: +3 / -3 / 0. */
function selisihText(n: number): string {
  if (n > 0) return `+${fmtQty(n)}`
  if (n < 0) return `-${fmtQty(Math.abs(n))}`
  return '0'
}

/** Warna selisih: emerald jika bertambah, red jika berkurang. */
function selisihColor(n: number): string {
  if (n > 0) return 'text-emerald-600 dark:text-emerald-400'
  if (n < 0) return 'text-red-600 dark:text-red-400'
  return 'text-muted-foreground'
}

export default function SbPenyesuaian({
  bahans,
  canAdd,
  canEdit,
  canDelete,
  onChanged,
  addSignal,
}: SbPenyesuaianProps) {
  // ===== Daftar + filter =====
  const [rows, setRows] = useState<PenyesuaianItem[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [fBahan, setFBahan] = useState('all')
  const [fDari, setFDari] = useState('')
  const [fSampai, setFSampai] = useState('')

  // ===== Dialog tambah/edit =====
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PenyesuaianItem | null>(null)
  const [form, setForm] = useState<PenyesuaianForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // ===== Hapus =====
  const [deleteTarget, setDeleteTarget] = useState<PenyesuaianItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const openAdd = useCallback(() => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, tanggal: getTodayDate() })
    setFormOpen(true)
  }, [])

  const openEdit = (p: PenyesuaianItem) => {
    setEditing(p)
    setForm({
      tanggal: p.tanggal,
      bahanId: p.bahanId,
      stokFisik: String(p.stokFisik),
      alasan: p.alasan,
      catatan: p.catatan,
    })
    setFormOpen(true)
  }

  // addSignal → buka dialog Tambah (dari FAB shell)
  useEffect(() => {
    if (addSignal > 0 && canAdd) openAdd()
  }, [addSignal, canAdd, openAdd])

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
      if (fDari) sp.set('dari', fDari)
      if (fSampai) sp.set('sampai', fSampai)
      const data = await apiFetch<PenyesuaianItem[]>(`/api/stock-bahan/penyesuaian?${sp.toString()}`)
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setListLoading(false)
    }
  }, [q, fBahan, fDari, fSampai])

  useEffect(() => {
    load()
  }, [load])

  const resetFilters = () => {
    setSearch('')
    setFBahan('all')
    setFDari('')
    setFSampai('')
  }

  const selectedBahan = useMemo(
    () => bahans.find((b) => b.id === form.bahanId) || null,
    [bahans, form.bahanId]
  )

  // Stok sistem: saat tambah = stok bahan saat ini; saat edit = snapshot transaksi
  const stokSistem = editing ? editing.stokSistem : (selectedBahan?.stok ?? 0)
  const satuan = editing ? editing.satuan : (selectedBahan?.satuan ?? '')
  const fisikNum = Number(form.stokFisik)
  const fisikValid = form.stokFisik !== '' && Number.isFinite(fisikNum) && fisikNum >= 0
  const selisih = fisikValid ? fisikNum - stokSistem : null

  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editing && form.bahanId === 'none') {
      toast.error('Bahan wajib dipilih')
      return
    }
    if (!fisikValid) {
      toast.error('Stok fisik wajib diisi dengan angka yang sah (≥ 0)')
      return
    }
    if (form.alasan.trim() === '') {
      toast.error('Alasan penyesuaian wajib diisi')
      return
    }
    const payload = {
      bahanId: form.bahanId,
      tanggal: form.tanggal || getTodayDate(),
      stokFisik: fisikNum,
      alasan: form.alasan.trim(),
      catatan: form.catatan.trim(),
    }
    setSaving(true)
    try {
      if (editing) {
        await apiFetch('/api/stock-bahan/penyesuaian', {
          method: 'PUT',
          body: JSON.stringify({
            id: editing.id,
            tanggal: payload.tanggal,
            stokFisik: payload.stokFisik,
            alasan: payload.alasan,
            catatan: payload.catatan,
          }),
        })
        toast.success('Perubahan penyesuaian tersimpan')
      } else {
        await apiFetch('/api/stock-bahan/penyesuaian', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        toast.success('Penyesuaian stok tersimpan')
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
      await apiFetch(`/api/stock-bahan/penyesuaian?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
      })
      toast.success('Transaksi penyesuaian dihapus')
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
            placeholder="Cari bahan / alasan / no…"
            aria-label="Cari transaksi penyesuaian"
            className="min-h-[40px] pl-9"
          />
        </div>
        <Select value={fBahan} onValueChange={setFBahan}>
          <SelectTrigger className="w-full md:w-48" aria-label="Filter bahan">
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
        {canAdd && (
          <Button onClick={openAdd} className="w-full md:ml-auto md:w-auto">
            <Plus className="h-4 w-4" /> Penyesuaian
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
          <Scale className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">Belum ada penyesuaian stok</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Lakukan stok opname untuk menyamakan stok sistem dengan stok fisik.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{rows.length} transaksi ditampilkan</p>

          {/* Desktop: tabel */}
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>No</TableHead>
                    <TableHead>Bahan</TableHead>
                    <TableHead className="text-right">Stok Sistem</TableHead>
                    <TableHead className="text-right">Stok Fisik</TableHead>
                    <TableHead className="text-right">Selisih</TableHead>
                    <TableHead>Alasan</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm whitespace-nowrap">{fmtTgl(p.tanggal)}</TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                        {p.nomor}
                      </TableCell>
                      <TableCell className="max-w-44 truncate text-sm font-medium">
                        {p.bahanNama}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap tabular-nums">
                        {fmtQty(p.stokSistem)}{' '}
                        <span className="text-xs text-muted-foreground">{p.satuan}</span>
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap tabular-nums">
                        {fmtQty(p.stokFisik)}{' '}
                        <span className="text-xs text-muted-foreground">{p.satuan}</span>
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right text-sm font-bold whitespace-nowrap tabular-nums',
                          selisihColor(p.selisih)
                        )}
                      >
                        {selisihText(p.selisih)}
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-sm text-muted-foreground">
                        {p.alasan}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-0.5">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`${aksiBtn} hover:text-violet-600`}
                              title="Edit"
                              aria-label={`Edit ${p.nomor}`}
                              onClick={() => openEdit(p)}
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
                              aria-label={`Hapus ${p.nomor}`}
                              onClick={() => setDeleteTarget(p)}
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
            {rows.map((p) => (
              <Card key={p.id} className="gap-0 rounded-xl py-0">
                <CardContent className="space-y-2 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{p.bahanNama}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{p.nomor}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`${aksiBtn} hover:text-violet-600`}
                          title="Edit"
                          aria-label={`Edit ${p.nomor}`}
                          onClick={() => openEdit(p)}
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
                          aria-label={`Hapus ${p.nomor}`}
                          onClick={() => setDeleteTarget(p)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <p
                      className={cn(
                        'text-lg font-bold tabular-nums',
                        selisihColor(p.selisih)
                      )}
                    >
                      {selisihText(p.selisih)}{' '}
                      <span className="text-xs font-normal text-muted-foreground">{p.satuan}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{fmtTgl(p.tanggal)}</p>
                  </div>
                  <div className="space-y-0.5 text-xs">
                    <p className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Stok sistem</span>
                      <span className="tabular-nums">
                        {fmtQty(p.stokSistem)} {p.satuan}
                      </span>
                    </p>
                    <p className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Stok fisik</span>
                      <span className="font-semibold tabular-nums">
                        {fmtQty(p.stokFisik)} {p.satuan}
                      </span>
                    </p>
                    <p className="flex justify-between gap-2">
                      <span className="shrink-0 text-muted-foreground">Alasan</span>
                      <span className="min-w-0 truncate">{p.alasan}</span>
                    </p>
                    {p.catatan && (
                      <p className="flex justify-between gap-2">
                        <span className="shrink-0 text-muted-foreground">Catatan</span>
                        <span className="min-w-0 truncate">{p.catatan}</span>
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
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Penyesuaian Stok' : 'Penyesuaian Stok'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Perubahan akan menghitung ulang stok bahan terkait.'
                : 'Stok opname: samakan stok sistem dengan hasil hitung fisik di gudang.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sbp-tanggal">Tanggal</Label>
                <Input
                  id="sbp-tanggal"
                  type="date"
                  value={form.tanggal}
                  onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sbp-nomor">Nomor Transaksi</Label>
                <Input id="sbp-nomor" disabled value={editing ? editing.nomor : 'Otomatis (STK-xxxx)'} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="sbp-bahan">Bahan</Label>
                {editing ? (
                  <Input id="sbp-bahan" disabled value={editing.bahanNama} />
                ) : (
                  <Select
                    value={form.bahanId}
                    onValueChange={(v) => setForm({ ...form, bahanId: v })}
                  >
                    <SelectTrigger id="sbp-bahan" className="w-full">
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
              </div>

              {/* 3 kotak: Stok Sistem / Stok Fisik / Selisih */}
              <div className="grid grid-cols-3 gap-2 sm:col-span-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Stok Sistem</Label>
                  <div className="flex h-9 items-center rounded-md border bg-muted/40 px-2.5 text-sm font-semibold tabular-nums">
                    {stokSistem ? fmtQty(stokSistem) : '0'}{' '}
                    {satuan && <span className="ml-1 text-[11px] text-muted-foreground">{satuan}</span>}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sbp-fisik" className="text-xs">
                    Stok Fisik
                  </Label>
                  <Input
                    id="sbp-fisik"
                    type="number"
                    min="0"
                    step="any"
                    value={form.stokFisik}
                    onChange={(e) => setForm({ ...form, stokFisik: e.target.value })}
                    placeholder="0"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Selisih</Label>
                  <div
                    className={cn(
                      'flex h-9 items-center rounded-md border bg-muted/40 px-2.5 text-sm font-bold tabular-nums',
                      selisih !== null && selisihColor(selisih)
                    )}
                  >
                    {selisih !== null ? selisihText(selisih) : '-'}
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground sm:col-span-2">
                Contoh: Sistem 100 kg, fisik 97 kg → selisih -3 kg.
              </p>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="sbp-alasan">Alasan</Label>
                <Input
                  id="sbp-alasan"
                  value={form.alasan}
                  onChange={(e) => setForm({ ...form, alasan: e.target.value })}
                  placeholder="cth: Stok opname gudang, bahan rusak"
                  required
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="sbp-catatan">Catatan</Label>
                <Input
                  id="sbp-catatan"
                  value={form.catatan}
                  onChange={(e) => setForm({ ...form, catatan: e.target.value })}
                  placeholder="Catatan tambahan (opsional)"
                />
              </div>
            </div>

            {/* Ringkasan sebelum submit */}
            {satuan && fisikValid && selisih !== null && selisih !== 0 && (
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
                Stok sistem akan diubah dari{' '}
                <span className="font-semibold tabular-nums">
                  {fmtQty(stokSistem)} {satuan}
                </span>{' '}
                →{' '}
                <span className={cn('font-semibold tabular-nums', selisihColor(selisih))}>
                  {fmtQty(fisikNum)} {satuan}
                </span>{' '}
                (selisih {selisihText(selisih)})
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
            <AlertDialogTitle>Hapus transaksi penyesuaian?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `Transaksi ${deleteTarget.nomor} (${deleteTarget.bahanNama}, selisih ${selisihText(deleteTarget.selisih)} ${deleteTarget.satuan}) akan dihapus permanen dan stok bahan dihitung ulang.`
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
