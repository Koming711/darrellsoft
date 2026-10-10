'use client'

/**
 * Transaksi tabs — Stok Masuk, Stok Keluar, dan Penyesuaian Stok.
 * Semua CUD memicu onRefresh() sehingga stok di tab lain ikut terbarui.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { formatIDR } from '@/lib/format'
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
import {
  TUJUAN_OPTIONS,
  errText,
  fmtNum,
  fmtTanggal,
  toInputDate,
  type AdjustmentTx,
  type Material,
  type StockInTx,
  type StockOutTx,
  type Supplier,
} from './shared'

// ==================== Sub-komponen bersama ====================

function MaterialSelect({
  materials,
  value,
  onChange,
  id,
}: {
  materials: Material[]
  value: string
  onChange: (v: string) => void
  id?: string
}) {
  const aktif = materials.filter(m => m.aktif)
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="min-h-[44px]">
        <SelectValue placeholder="Pilih bahan" />
      </SelectTrigger>
      <SelectContent className="max-h-64">
        {aktif.length === 0 && (
          <div className="px-3 py-2 text-sm text-muted-foreground">Belum ada bahan aktif</div>
        )}
        {aktif.map(m => (
          <SelectItem key={m.id} value={m.id}>
            {m.nama} ({fmtNum(m.stok)} {m.satuan})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function TxEmpityState({ pesan }: { pesan: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <p className="text-sm font-medium">Belum ada transaksi</p>
        <p className="mt-1 text-xs text-muted-foreground">{pesan}</p>
      </CardContent>
    </Card>
  )
}

interface TxCommonProps {
  materials: Material[]
  onRefresh: () => void
  preselectMaterialId?: string | null
  onConsumePreselect?: () => void
  /** Sinyal dari FAB: buka form tambah saat nilai berubah (> 0). */
  formNonce?: number
}

// ==================== STOK MASUK ====================

export function StokMasukTab({
  materials,
  suppliers,
  onRefresh,
  preselectMaterialId,
  onConsumePreselect,
  formNonce = 0,
}: TxCommonProps & { suppliers: Supplier[] }) {
  const [list, setList] = useState<StockInTx[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<StockInTx | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    tanggal: toInputDate(new Date()),
    materialId: '',
    supplierId: 'tanpa',
    jumlah: '',
    hargaBeli: '',
    nomorNota: '',
    catatan: '',
  })

  const [confirmDel, setConfirmDel] = useState<StockInTx | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch<{ data: StockInTx[] }>('/api/stock-bahan/masuk')
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

  // Preselect bahan dari aksi cepat di tab lain.
  useEffect(() => {
    if (preselectMaterialId) {
      setEditing(null)
      setForm({
        tanggal: toInputDate(new Date()),
        materialId: preselectMaterialId,
        supplierId: 'tanpa',
        jumlah: '',
        hargaBeli: '',
        nomorNota: '',
        catatan: '',
      })
      setFormOpen(true)
      onConsumePreselect?.()
    }
  }, [preselectMaterialId, onConsumePreselect])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(t =>
      `${t.nomor} ${t.nomorNota} ${t.catatan} ${t.material?.nama || ''} ${t.supplier?.nama || ''}`
        .toLowerCase()
        .includes(q)
    )
  }, [list, search])

  const totalTerpilih = filtered.reduce((a, t) => a + (t.totalHarga || 0), 0)

  const openAdd = useCallback(() => {
    setEditing(null)
    setForm({
      tanggal: toInputDate(new Date()),
      materialId: '',
      supplierId: 'tanpa',
      jumlah: '',
      hargaBeli: '',
      nomorNota: '',
      catatan: '',
    })
    setFormOpen(true)
  }, [])

  // FAB: buka form tambah saat sinyal berubah.
  useEffect(() => {
    if (formNonce > 0) openAdd()
  }, [formNonce, openAdd])

  const openEdit = useCallback((t: StockInTx) => {
    setEditing(t)
    setForm({
      tanggal: toInputDate(t.tanggal),
      materialId: t.materialId,
      supplierId: t.supplierId || 'tanpa',
      jumlah: String(t.jumlah),
      hargaBeli: String(t.hargaBeli || ''),
      nomorNota: t.nomorNota || '',
      catatan: t.catatan || '',
    })
    setFormOpen(true)
  }, [])

  const submit = useCallback(async () => {
    if (!form.materialId) return toast.error('Bahan wajib dipilih')
    const jumlahNum = Number(form.jumlah)
    if (!Number.isFinite(jumlahNum) || jumlahNum <= 0)
      return toast.error('Jumlah masuk harus lebih dari 0')
    setSaving(true)
    try {
      const payload = {
        tanggal: form.tanggal,
        materialId: form.materialId,
        supplierId: form.supplierId === 'tanpa' ? null : form.supplierId,
        jumlah: jumlahNum,
        hargaBeli: Number(form.hargaBeli) || 0,
        nomorNota: form.nomorNota.trim(),
        catatan: form.catatan.trim(),
      }
      if (editing) {
        await apiFetch('/api/stock-bahan/masuk', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, ...payload }),
        })
        toast.success('Transaksi diperbarui — stok dihitung ulang')
      } else {
        const res = await apiFetch<StockInTx>('/api/stock-bahan/masuk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        toast.success(`Stok masuk tersimpan${res.stokSekarang != null ? ` — stok sekarang ${fmtNum(res.stokSekarang)}` : ''}`)
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

  const doDelete = useCallback(async () => {
    if (!confirmDel) return
    setDeleting(true)
    try {
      await apiFetch(`/api/stock-bahan/masuk?id=${encodeURIComponent(confirmDel.id)}`, { method: 'DELETE' })
      toast.success('Transaksi dihapus — stok dihitung ulang')
      setConfirmDel(null)
      onRefresh()
      fetchList()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setDeleting(false)
    }
  }, [confirmDel, onRefresh, fetchList])

  const supplierNama = (t: StockInTx) => t.supplier?.nama || '—'
  const materialSatuan = (t: StockInTx) => t.material?.satuan || ''

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nomor / bahan / nota…" className="pl-8" aria-label="Cari stok masuk" />
        </div>
        <div className="flex items-center gap-2">
          {filtered.length > 0 && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Total: <strong className="text-foreground">{formatIDR(totalTerpilih)}</strong>
            </span>
          )}
          <Button onClick={openAdd} className="gap-1.5 min-h-[44px]">
            <Plus className="h-4 w-4" /> Stok Masuk
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <TxEmpityState pesan="Catat pembelian bahan lewat tombol “Stok Masuk”." />
      ) : (
        <>
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <div className="max-h-[calc(100vh-380px)] overflow-y-auto stock-scroll">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead>No. Transaksi</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Bahan</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                      <TableHead className="text-right">Harga Beli</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(t => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-xs">{t.nomor}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{fmtTanggal(t.tanggal)}</TableCell>
                        <TableCell>
                          <p className="text-sm font-medium">{t.material?.nama || '—'}</p>
                          {t.nomorNota && <p className="text-xs text-muted-foreground">Nota: {t.nomorNota}</p>}
                        </TableCell>
                        <TableCell className="text-sm">{supplierNama(t)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-emerald-600">+{fmtNum(t.jumlah)} {materialSatuan(t)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{t.hargaBeli > 0 ? formatIDR(t.hargaBeli) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-semibold">{t.totalHarga > 0 ? formatIDR(t.totalHarga) : '—'}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(t)} aria-label={`Edit ${t.nomor}`} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={() => setConfirmDel(t)} aria-label={`Hapus ${t.nomor}`} title="Hapus">
                              <Trash2 className="h-4 w-4" />
                            </Button>
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
            {filtered.map(t => (
              <Card key={t.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">{t.material?.nama || '—'}</p>
                      <p className="text-xs text-muted-foreground font-mono">{t.nomor} · {fmtTanggal(t.tanggal)}</p>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-emerald-600">+{fmtNum(t.jumlah)} {materialSatuan(t)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>Supplier: {supplierNama(t)}</p>
                    {t.hargaBeli > 0 && <p>Harga: {formatIDR(t.hargaBeli)} · Total: <strong className="text-foreground">{formatIDR(t.totalHarga)}</strong></p>}
                    {t.nomorNota && <p>Nota: {t.nomorNota}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" className="h-9 text-xs" onClick={() => openEdit(t)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" className="h-9 text-xs text-rose-600 border-rose-200" onClick={() => setConfirmDel(t)}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Hapus
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Dialog form stok masuk */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Stok Masuk' : 'Stok Masuk'}</DialogTitle>
            <DialogDescription>
              Nomor transaksi dibuat otomatis (SM-YYMM-0001). Stok bahan bertambah otomatis.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="sm-tanggal">Tanggal</Label>
              <Input id="sm-tanggal" type="date" value={form.tanggal} onChange={e => setForm(f => ({ ...f, tanggal: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Bahan *</Label>
              <MaterialSelect materials={materials} value={form.materialId} onChange={v => setForm(f => ({ ...f, materialId: v }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="sm-jumlah">Jumlah Masuk *</Label>
                <Input id="sm-jumlah" type="number" min="0" step="any" value={form.jumlah} onChange={e => setForm(f => ({ ...f, jumlah: e.target.value }))} placeholder="0" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sm-harga">Harga Beli / {materials.find(m => m.id === form.materialId)?.satuan || 'satuan'}</Label>
                <Input id="sm-harga" type="number" min="0" value={form.hargaBeli} onChange={e => setForm(f => ({ ...f, hargaBeli: e.target.value }))} placeholder="0" />
              </div>
            </div>
            {(Number(form.hargaBeli) > 0 && Number(form.jumlah) > 0) && (
              <p className="text-sm font-semibold text-right">Total: {formatIDR(Number(form.hargaBeli) * Number(form.jumlah))}</p>
            )}
            <div className="grid gap-1.5">
              <Label>Supplier</Label>
              <Select value={form.supplierId} onValueChange={v => setForm(f => ({ ...f, supplierId: v }))}>
                <SelectTrigger className="min-h-[44px]"><SelectValue placeholder="Tanpa supplier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tanpa">Tanpa supplier</SelectItem>
                  {suppliers.filter(s => s.aktif).map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sm-nota">Nomor Nota / Faktur</Label>
              <Input id="sm-nota" value={form.nomorNota} onChange={e => setForm(f => ({ ...f, nomorNota: e.target.value }))} placeholder="cth: NOTA-001" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sm-catatan">Catatan</Label>
              <Textarea id="sm-catatan" rows={2} value={form.catatan} onChange={e => setForm(f => ({ ...f, catatan: e.target.value }))} placeholder="cth: Stok awal" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Batal</Button>
            <Button onClick={submit} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? 'Simpan' : 'Simpan Masuk'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDel} onOpenChange={o => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus transaksi stok masuk?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDel?.nomor} — {confirmDel?.material?.nama} (+{fmtNum(confirmDel?.jumlah || 0)}). Stok akan dihitung ulang otomatis.
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

// ==================== STOK KELUAR ====================

export function StokKeluarTab({
  materials,
  onRefresh,
  preselectMaterialId,
  onConsumePreselect,
  formNonce = 0,
}: TxCommonProps) {
  const [list, setList] = useState<StockOutTx[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<StockOutTx | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    tanggal: toInputDate(new Date()),
    materialId: '',
    jumlah: '',
    tujuan: 'Produksi',
    catatan: '',
  })

  const [confirmDel, setConfirmDel] = useState<StockOutTx | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch<{ data: StockOutTx[] }>('/api/stock-bahan/keluar')
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

  useEffect(() => {
    if (preselectMaterialId) {
      setEditing(null)
      setForm({ tanggal: toInputDate(new Date()), materialId: preselectMaterialId, jumlah: '', tujuan: 'Produksi', catatan: '' })
      setFormOpen(true)
      onConsumePreselect?.()
    }
  }, [preselectMaterialId, onConsumePreselect])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(t => `${t.nomor} ${t.tujuan} ${t.catatan} ${t.material?.nama || ''}`.toLowerCase().includes(q))
  }, [list, search])

  const stokBahan = materials.find(m => m.id === form.materialId)

  const openAdd = useCallback(() => {
    setEditing(null)
    setForm({ tanggal: toInputDate(new Date()), materialId: '', jumlah: '', tujuan: 'Produksi', catatan: '' })
    setFormOpen(true)
  }, [])

  // FAB: buka form tambah saat sinyal berubah.
  useEffect(() => {
    if (formNonce > 0) openAdd()
  }, [formNonce, openAdd])

  const openEdit = useCallback((t: StockOutTx) => {
    setEditing(t)
    setForm({
      tanggal: toInputDate(t.tanggal),
      materialId: t.materialId,
      jumlah: String(t.jumlah),
      tujuan: t.tujuan,
      catatan: t.catatan || '',
    })
    setFormOpen(true)
  }, [])

  const submit = useCallback(async () => {
    if (!form.materialId) return toast.error('Bahan wajib dipilih')
    const jumlahNum = Number(form.jumlah)
    if (!Number.isFinite(jumlahNum) || jumlahNum <= 0)
      return toast.error('Jumlah keluar harus lebih dari 0')
    setSaving(true)
    try {
      const payload = {
        tanggal: form.tanggal,
        materialId: form.materialId,
        jumlah: jumlahNum,
        tujuan: form.tujuan,
        catatan: form.catatan.trim(),
      }
      if (editing) {
        await apiFetch('/api/stock-bahan/keluar', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, ...payload }),
        })
        toast.success('Transaksi diperbarui — stok dihitung ulang')
      } else {
        const res = await apiFetch<StockOutTx>('/api/stock-bahan/keluar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        toast.success(`Stok keluar tersimpan${res.stokSekarang != null ? ` — stok sekarang ${fmtNum(res.stokSekarang)}` : ''}`)
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

  const doDelete = useCallback(async () => {
    if (!confirmDel) return
    setDeleting(true)
    try {
      await apiFetch(`/api/stock-bahan/keluar?id=${encodeURIComponent(confirmDel.id)}`, { method: 'DELETE' })
      toast.success('Transaksi dihapus — stok dihitung ulang')
      setConfirmDel(null)
      onRefresh()
      fetchList()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setDeleting(false)
    }
  }, [confirmDel, onRefresh, fetchList])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nomor / bahan / tujuan…" className="pl-8" aria-label="Cari stok keluar" />
        </div>
        <Button onClick={openAdd} className="gap-1.5 min-h-[44px]">
          <Plus className="h-4 w-4" /> Stok Keluar
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <TxEmpityState pesan="Catat pemakaian bahan (produksi, sampel, rusak, internal)." />
      ) : (
        <>
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <div className="max-h-[calc(100vh-380px)] overflow-y-auto stock-scroll">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead>No. Transaksi</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Bahan</TableHead>
                      <TableHead>Tujuan</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(t => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-xs">{t.nomor}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{fmtTanggal(t.tanggal)}</TableCell>
                        <TableCell className="text-sm font-medium">{t.material?.nama || '—'}</TableCell>
                        <TableCell className="text-sm">
                          {t.tujuan}
                          {t.catatan && <p className="text-xs text-muted-foreground">{t.catatan}</p>}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-rose-600">−{fmtNum(t.jumlah)} {t.material?.satuan || ''}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(t)} aria-label={`Edit ${t.nomor}`} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={() => setConfirmDel(t)} aria-label={`Hapus ${t.nomor}`} title="Hapus">
                              <Trash2 className="h-4 w-4" />
                            </Button>
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
            {filtered.map(t => (
              <Card key={t.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">{t.material?.nama || '—'}</p>
                      <p className="text-xs text-muted-foreground font-mono">{t.nomor} · {fmtTanggal(t.tanggal)}</p>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-rose-600">−{fmtNum(t.jumlah)} {t.material?.satuan || ''}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Tujuan: <span className="text-foreground font-medium">{t.tujuan}</span>{t.catatan ? ` · ${t.catatan}` : ''}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" className="h-9 text-xs" onClick={() => openEdit(t)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" className="h-9 text-xs text-rose-600 border-rose-200" onClick={() => setConfirmDel(t)}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Hapus
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Stok Keluar' : 'Stok Keluar'}</DialogTitle>
            <DialogDescription>
              Nomor transaksi otomatis (SK-YYMM-0001). Stok bahan berkurang otomatis
              {stokBahan ? ` — tersedia ${fmtNum(stokBahan.stok)} ${stokBahan.satuan}` : ''}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="sk-tanggal">Tanggal</Label>
              <Input id="sk-tanggal" type="date" value={form.tanggal} onChange={e => setForm(f => ({ ...f, tanggal: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Bahan *</Label>
              <MaterialSelect materials={materials} value={form.materialId} onChange={v => setForm(f => ({ ...f, materialId: v }))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sk-jumlah">Jumlah Keluar *</Label>
              <Input id="sk-jumlah" type="number" min="0" step="any" value={form.jumlah} onChange={e => setForm(f => ({ ...f, jumlah: e.target.value }))} placeholder="0" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sk-tujuan">Tujuan / Penggunaan</Label>
              <Select value={form.tujuan} onValueChange={v => setForm(f => ({ ...f, tujuan: v }))}>
                <SelectTrigger id="sk-tujuan"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TUJUAN_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sk-catatan">Catatan</Label>
              <Textarea id="sk-catatan" rows={2} value={form.catatan} onChange={e => setForm(f => ({ ...f, catatan: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Batal</Button>
            <Button onClick={submit} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? 'Simpan' : 'Simpan Keluar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDel} onOpenChange={o => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus transaksi stok keluar?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDel?.nomor} — {confirmDel?.material?.nama} (−{fmtNum(confirmDel?.jumlah || 0)}). Stok akan dihitung ulang otomatis.
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

// ==================== PENYESUAIAN STOK ====================

export function PenyesuaianTab({ materials, onRefresh }: TxCommonProps) {
  const [list, setList] = useState<AdjustmentTx[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({
    tanggal: toInputDate(new Date()),
    materialId: '',
    stokFisik: '',
    alasan: '',
    catatan: '',
  })
  const [confirmDel, setConfirmDel] = useState<AdjustmentTx | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch<{ data: AdjustmentTx[] }>('/api/stock-bahan/penyesuaian')
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

  const bahanTerpilih = materials.find(m => m.id === form.materialId)
  const selisih =
    form.materialId && form.stokFisik !== ''
      ? Number(form.stokFisik) - (bahanTerpilih?.stok ?? 0)
      : null

  const openAdd = useCallback(() => {
    setForm({ tanggal: toInputDate(new Date()), materialId: '', stokFisik: '', alasan: '', catatan: '' })
    setFormOpen(true)
  }, [])

  const submit = useCallback(async () => {
    if (!form.materialId) return toast.error('Bahan wajib dipilih')
    const fisik = Number(form.stokFisik)
    if (!Number.isFinite(fisik) || fisik < 0) return toast.error('Stok fisik tidak boleh negatif')
    setSaving(true)
    try {
      const res = await apiFetch<AdjustmentTx>('/api/stock-bahan/penyesuaian', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tanggal: form.tanggal,
          materialId: form.materialId,
          stokFisik: fisik,
          alasan: form.alasan.trim(),
          catatan: form.catatan.trim(),
        }),
      })
      toast.success(`Penyesuaian tersimpan — stok sekarang ${fmtNum(res.stokSekarang ?? fisik)}`)
      setFormOpen(false)
      onRefresh()
      fetchList()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setSaving(false)
    }
  }, [form, onRefresh, fetchList])

  const doDelete = useCallback(async () => {
    if (!confirmDel) return
    setDeleting(true)
    try {
      await apiFetch(`/api/stock-bahan/penyesuaian?id=${encodeURIComponent(confirmDel.id)}`, { method: 'DELETE' })
      toast.success('Penyesuaian dihapus — stok dihitung ulang')
      setConfirmDel(null)
      onRefresh()
      fetchList()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setDeleting(false)
    }
  }, [confirmDel, onRefresh, fetchList])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground sm:text-sm">
          Dipakai saat stok fisik berbeda dengan stok sistem. Setelah disimpan, stok sistem
          mengikuti stok fisik dan tercatat di Riwayat.
        </p>
        <Button onClick={openAdd} className="gap-1.5 min-h-[44px] shrink-0">
          <Plus className="h-4 w-4" /> Penyesuaian
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : list.length === 0 ? (
        <TxEmpityState pesan="Belum ada penyesuaian stok." />
      ) : (
        <>
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <div className="max-h-[calc(100vh-380px)] overflow-y-auto stock-scroll">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead>No.</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Bahan</TableHead>
                      <TableHead className="text-right">Stok Sistem</TableHead>
                      <TableHead className="text-right">Stok Fisik</TableHead>
                      <TableHead className="text-right">Selisih</TableHead>
                      <TableHead>Alasan</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map(t => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-xs">{t.nomor}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{fmtTanggal(t.tanggal)}</TableCell>
                        <TableCell className="text-sm font-medium">{t.material?.nama || '—'}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{fmtNum(t.stokSistem)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{fmtNum(t.stokFisik)}</TableCell>
                        <TableCell className={cn('text-right tabular-nums font-semibold text-sm', t.selisih < 0 ? 'text-rose-600' : t.selisih > 0 ? 'text-emerald-600' : 'text-muted-foreground')}>
                          {t.selisih > 0 ? '+' : ''}{fmtNum(t.selisih)}
                        </TableCell>
                        <TableCell className="text-sm">{t.alasan || '—'}</TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" onClick={() => setConfirmDel(t)} aria-label={`Hapus ${t.nomor}`} title="Hapus">
                              <Trash2 className="h-4 w-4" />
                            </Button>
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
            {list.map(t => (
              <Card key={t.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">{t.material?.nama || '—'}</p>
                      <p className="text-xs text-muted-foreground font-mono">{t.nomor} · {fmtTanggal(t.tanggal)}</p>
                    </div>
                    <span className={cn('text-sm font-bold tabular-nums', t.selisih < 0 ? 'text-rose-600' : 'text-emerald-600')}>
                      {t.selisih > 0 ? '+' : ''}{fmtNum(t.selisih)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sistem {fmtNum(t.stokSistem)} → Fisik <span className="font-semibold text-foreground">{fmtNum(t.stokFisik)}</span> {t.material?.satuan || ''}
                    {t.alasan ? ` · ${t.alasan}` : ''}
                  </p>
                  <Button size="sm" variant="outline" className="h-9 w-full text-xs text-rose-600 border-rose-200" onClick={() => setConfirmDel(t)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Hapus
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Penyesuaian Stok</DialogTitle>
            <DialogDescription>
              Hitung stok fisik di gudang, lalu masukkan di sini. Nomor otomatis (SA-YYMM-0001).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="sa-tanggal">Tanggal</Label>
              <Input id="sa-tanggal" type="date" value={form.tanggal} onChange={e => setForm(f => ({ ...f, tanggal: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Bahan *</Label>
              <MaterialSelect materials={materials} value={form.materialId} onChange={v => setForm(f => ({ ...f, materialId: v }))} />
            </div>
            {bahanTerpilih && (
              <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stok sistem</span>
                  <span className="font-semibold tabular-nums">{fmtNum(bahanTerpilih.stok)} {bahanTerpilih.satuan}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Selisih (fisik − sistem)</span>
                  <span className={cn('font-bold tabular-nums', selisih != null && selisih < 0 ? 'text-rose-600' : selisih != null && selisih > 0 ? 'text-emerald-600' : '')}>
                    {selisih != null ? `${selisih > 0 ? '+' : ''}${fmtNum(selisih)}` : '—'}
                  </span>
                </div>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="sa-fisik">Stok Fisik *</Label>
              <Input id="sa-fisik" type="number" min="0" step="any" value={form.stokFisik} onChange={e => setForm(f => ({ ...f, stokFisik: e.target.value }))} placeholder="Hasil hitung fisik" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sa-alasan">Alasan Penyesuaian</Label>
              <Input id="sa-alasan" value={form.alasan} onChange={e => setForm(f => ({ ...f, alasan: e.target.value }))} placeholder="cth: stok opname bulanan" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sa-catatan">Catatan</Label>
              <Textarea id="sa-catatan" rows={2} value={form.catatan} onChange={e => setForm(f => ({ ...f, catatan: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Batal</Button>
            <Button onClick={submit} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan Penyesuaian
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDel} onOpenChange={o => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus penyesuaian?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDel?.nomor} — {confirmDel?.material?.nama}. Stok akan dihitung ulang tanpa penyesuaian ini.
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
