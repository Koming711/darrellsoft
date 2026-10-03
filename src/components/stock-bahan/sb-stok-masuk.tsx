'use client'

/**
 * SbStokMasuk — tab "Stok Masuk" modul Stock Bahan.
 *
 * - CRUD transaksi penerimaan bahan: POST/PUT/DELETE /api/stock-bahan/masuk.
 * - Toolbar: pencarian (debounce 300ms), filter bahan, rentang tanggal, reset.
 * - Nomor transaksi otomatis dari server (STK-xxxx).
 * - Desktop: tabel. Mobile: kartu. Loading: Skeleton.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Loader2,
  PackagePlus,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { formatIDR, getTodayDate } from '@/lib/format'
import type { BahanItem, MasukItem, SuplierItem } from '@/lib/stock-bahan-types'
import { fmtQty, fmtTgl } from '@/components/stock-bahan/sb-shared'
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

export interface SbStokMasukProps {
  bahans: BahanItem[]
  supliers: SuplierItem[]
  canAdd: boolean
  canEdit: boolean
  canDelete: boolean
  onChanged: () => void
  preselectBahanId?: string
  onPreselectConsumed?: () => void
  addSignal: number
}

interface MasukForm {
  tanggal: string
  bahanId: string
  qty: string
  hargaBeli: string
  suplierId: string
  nomorNota: string
  catatan: string
}

const EMPTY_FORM: MasukForm = {
  tanggal: '',
  bahanId: 'none',
  qty: '',
  hargaBeli: '',
  suplierId: 'none',
  nomorNota: '',
  catatan: '',
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'Terjadi kesalahan'
}

export default function SbStokMasuk({
  bahans,
  supliers,
  canAdd,
  canEdit,
  canDelete,
  onChanged,
  preselectBahanId,
  onPreselectConsumed,
  addSignal,
}: SbStokMasukProps) {
  // ===== Daftar + filter =====
  const [rows, setRows] = useState<MasukItem[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [fBahan, setFBahan] = useState('all')
  const [fDari, setFDari] = useState('')
  const [fSampai, setFSampai] = useState('')

  // ===== Dialog tambah/edit =====
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<MasukItem | null>(null)
  const [form, setForm] = useState<MasukForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // ===== Hapus =====
  const [deleteTarget, setDeleteTarget] = useState<MasukItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const openAdd = useCallback(() => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, tanggal: getTodayDate() })
    setFormOpen(true)
  }, [])

  const openEdit = (m: MasukItem) => {
    setEditing(m)
    setForm({
      tanggal: m.tanggal,
      bahanId: m.bahanId,
      qty: String(m.qty),
      hargaBeli: m.hargaBeli ? String(m.hargaBeli) : '',
      suplierId: m.suplierId || 'none',
      nomorNota: m.nomorNota,
      catatan: m.catatan,
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
      const data = await apiFetch<MasukItem[]>(`/api/stock-bahan/masuk?${sp.toString()}`)
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

  // Opsi bahan aktif untuk form tambah; saat edit bahan dikunci (input disabled)
  const bahanAktif = useMemo(() => bahans.filter((b) => b.aktif), [bahans])
  const selectedBahan = useMemo(
    () => bahans.find((b) => b.id === form.bahanId) || null,
    [bahans, form.bahanId]
  )
  const suplierOptions = useMemo(
    () => supliers.filter((s) => s.aktif || s.id === form.suplierId),
    [supliers, form.suplierId]
  )

  const qtyNum = Number(form.qty) || 0
  const hargaNum = Number(form.hargaBeli) || 0
  const total = qtyNum * hargaNum

  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editing && form.bahanId === 'none') {
      toast.error('Bahan wajib dipilih')
      return
    }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      toast.error('Jumlah masuk harus lebih dari 0')
      return
    }
    const suplierId = form.suplierId === 'none' ? null : form.suplierId
    const suplierNama = suplierId ? (supliers.find((s) => s.id === suplierId)?.nama ?? '') : ''
    const payload = {
      bahanId: form.bahanId,
      tanggal: form.tanggal || getTodayDate(),
      qty: qtyNum,
      hargaBeli: hargaNum,
      suplierId,
      suplierNama,
      nomorNota: form.nomorNota.trim(),
      catatan: form.catatan.trim(),
    }
    setSaving(true)
    try {
      if (editing) {
        await apiFetch('/api/stock-bahan/masuk', {
          method: 'PUT',
          body: JSON.stringify({ id: editing.id, ...payload }),
        })
        toast.success('Perubahan stok masuk tersimpan')
      } else {
        await apiFetch('/api/stock-bahan/masuk', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        toast.success('Stok masuk tersimpan')
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
      await apiFetch(`/api/stock-bahan/masuk?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
      })
      toast.success('Transaksi stok masuk dihapus')
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
            placeholder="Cari nota / supplier / no…"
            aria-label="Cari transaksi stok masuk"
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
            <Plus className="h-4 w-4" /> Stok Masuk
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
          <PackagePlus className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">Belum ada transaksi stok masuk</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Catat penerimaan bahan untuk memulai.
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
                    <TableHead>No. Transaksi</TableHead>
                    <TableHead>Bahan</TableHead>
                    <TableHead className="text-right">Jumlah</TableHead>
                    <TableHead className="text-right">Harga Beli</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Nota</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm whitespace-nowrap">{fmtTgl(m.tanggal)}</TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                        {m.nomor}
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-sm font-medium">
                        {m.bahanNama}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                          +{fmtQty(m.qty)}
                        </span>{' '}
                        <span className="text-xs text-muted-foreground">{m.satuan}</span>
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap tabular-nums">
                        {formatIDR(m.hargaBeli)}
                      </TableCell>
                      <TableCell className="text-sm font-semibold whitespace-nowrap tabular-nums">
                        {formatIDR(m.total)}
                      </TableCell>
                      <TableCell className="max-w-36 truncate text-sm text-muted-foreground">
                        {m.suplierNama || '-'}
                      </TableCell>
                      <TableCell className="max-w-32 truncate font-mono text-xs text-muted-foreground">
                        {m.nomorNota || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-0.5">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`${aksiBtn} hover:text-violet-600`}
                              title="Edit"
                              aria-label={`Edit ${m.nomor}`}
                              onClick={() => openEdit(m)}
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
                              aria-label={`Hapus ${m.nomor}`}
                              onClick={() => setDeleteTarget(m)}
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
            {rows.map((m) => (
              <Card key={m.id} className="gap-0 rounded-xl py-0">
                <CardContent className="space-y-2 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{m.bahanNama}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{m.nomor}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`${aksiBtn} hover:text-violet-600`}
                          title="Edit"
                          aria-label={`Edit ${m.nomor}`}
                          onClick={() => openEdit(m)}
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
                          aria-label={`Hapus ${m.nomor}`}
                          onClick={() => setDeleteTarget(m)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-lg font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                      +{fmtQty(m.qty)}{' '}
                      <span className="text-xs font-normal text-muted-foreground">{m.satuan}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{fmtTgl(m.tanggal)}</p>
                  </div>
                  <div className="space-y-0.5 text-xs">
                    <p className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Harga beli</span>
                      <span className="tabular-nums">{formatIDR(m.hargaBeli)}</span>
                    </p>
                    <p className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Total</span>
                      <span className="font-semibold tabular-nums">{formatIDR(m.total)}</span>
                    </p>
                    <p className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Supplier</span>
                      <span className="min-w-0 truncate">{m.suplierNama || '-'}</span>
                    </p>
                    <p className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Nota</span>
                      <span className="min-w-0 truncate font-mono">{m.nomorNota || '-'}</span>
                    </p>
                    {m.catatan && (
                      <p className="flex justify-between gap-2">
                        <span className="shrink-0 text-muted-foreground">Catatan</span>
                        <span className="min-w-0 truncate">{m.catatan}</span>
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
            <DialogTitle>{editing ? 'Edit Stok Masuk' : 'Stok Masuk'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Perubahan akan menghitung ulang stok bahan terkait.'
                : 'Catat penerimaan bahan baru dari supplier.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sbm-tanggal">Tanggal</Label>
                <Input
                  id="sbm-tanggal"
                  type="date"
                  value={form.tanggal}
                  onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sbm-nomor">Nomor Transaksi</Label>
                <Input id="sbm-nomor" disabled value={editing ? editing.nomor : 'Otomatis (STK-xxxx)'} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="sbm-bahan">Bahan</Label>
                {editing ? (
                  <Input id="sbm-bahan" disabled value={editing.bahanNama} />
                ) : (
                  <Select
                    value={form.bahanId}
                    onValueChange={(v) => setForm({ ...form, bahanId: v })}
                  >
                    <SelectTrigger id="sbm-bahan" className="w-full">
                      <SelectValue placeholder="Pilih bahan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Pilih bahan…</SelectItem>
                      {bahanAktif.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.nama} (sisa {fmtQty(b.stok)} {b.satuan})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sbm-qty">Jumlah Masuk</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="sbm-qty"
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
                <Label htmlFor="sbm-harga">Harga Beli</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                    Rp
                  </span>
                  <Input
                    id="sbm-harga"
                    type="number"
                    min="0"
                    step="any"
                    value={form.hargaBeli}
                    onChange={(e) => setForm({ ...form, hargaBeli: e.target.value })}
                    placeholder="0"
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Total Harga</Label>
                <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm font-bold tabular-nums">
                  {formatIDR(total)}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sbm-suplier">Supplier</Label>
                <Select
                  value={form.suplierId}
                  onValueChange={(v) => setForm({ ...form, suplierId: v })}
                >
                  <SelectTrigger id="sbm-suplier" className="w-full">
                    <SelectValue placeholder="Pilih supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tanpa supplier</SelectItem>
                    {suplierOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nama}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="sbm-nota">Nomor Nota/Faktur</Label>
                <Input
                  id="sbm-nota"
                  value={form.nomorNota}
                  onChange={(e) => setForm({ ...form, nomorNota: e.target.value })}
                  placeholder="cth: NOTA-2026-001"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="sbm-catatan">Catatan</Label>
                <Input
                  id="sbm-catatan"
                  value={form.catatan}
                  onChange={(e) => setForm({ ...form, catatan: e.target.value })}
                  placeholder="Catatan tambahan (opsional)"
                />
              </div>
            </div>
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
            <AlertDialogTitle>Hapus transaksi stok masuk?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `Transaksi ${deleteTarget.nomor} (${deleteTarget.bahanNama}, +${fmtQty(deleteTarget.qty)} ${deleteTarget.satuan}) akan dihapus permanen dan stok bahan dihitung ulang.`
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
