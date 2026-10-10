'use client'

/**
 * Dialog transaksi stok: MASUK / KELUAR / PENYESUAIAN (tambah & edit).
 * - Nomor transaksi otomatis (SM-/SK-/SA-YYMM-####) di sisi server.
 * - Masuk: harga beli + total otomatis + supplier + nomor nota.
 * - Keluar: tujuan penggunaan. Penyesuaian: stok sistem vs fisik → selisih otomatis.
 * - Server menolak stok minus kecuali "Izinkan Stok Minus" aktif.
 */

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { Bahan, BahanMutasi, PemasokRingkas } from './shared'
import { ALASAN_OPSI, TUJUAN_OPSI, errText, formatAngka, todayInput } from './shared'

export type MutasiJenis = 'masuk' | 'keluar' | 'penyesuaian'

const JUDUL: Record<MutasiJenis, string> = {
  masuk: 'Stok Masuk',
  keluar: 'Stok Keluar',
  penyesuaian: 'Penyesuaian Stok',
}

export function MutasiFormDialog({
  open, onOpenChange, jenis, bahanList, editing, pemasokList, onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  jenis: MutasiJenis
  bahanList: Bahan[]
  editing: BahanMutasi | null
  pemasokList: PemasokRingkas[]
  onSaved: () => void
}) {
  const isEdit = !!editing

  const [tanggal, setTanggal] = useState(todayInput())
  const [bahanId, setBahanId] = useState('')
  const [qty, setQty] = useState('')
  const [hargaBeli, setHargaBeli] = useState('')
  const [pemasok, setPemasok] = useState('')
  const [nomorNota, setNomorNota] = useState('')
  const [tujuan, setTujuan] = useState('')
  const [stokFisik, setStokFisik] = useState('')
  const [alasan, setAlasan] = useState('')
  const [keterangan, setKeterangan] = useState('')
  const [saving, setSaving] = useState(false)

  const bahan = useMemo(() => bahanList.find(b => b.id === bahanId) || null, [bahanList, bahanId])

  useEffect(() => {
    if (!open) return
    if (editing) {
      setTanggal(editing.tanggal || todayInput())
      setBahanId(editing.bahanId)
      setQty(String(editing.qty ?? ''))
      setHargaBeli(editing.hargaBeli ? String(editing.hargaBeli) : '')
      setPemasok(editing.pemasok || '')
      setNomorNota(editing.nomorNota || '')
      setTujuan(editing.tujuan || '')
      setStokFisik('')
      setAlasan(editing.alasan || '')
      setKeterangan(editing.keterangan || '')
    } else {
      setTanggal(todayInput())
      setBahanId('')
      setQty('')
      setHargaBeli('')
      setPemasok('')
      setNomorNota('')
      setTujuan('')
      setStokFisik('')
      setAlasan('')
      setKeterangan('')
    }
  }, [open, editing])

  // Prefill supplier & harga dari bahan terpilih (mode tambah)
  useEffect(() => {
    if (!open || editing || !bahan) return
    if (bahan.pemasok) setPemasok(bahan.pemasok)
    if (jenis === 'masuk' && bahan.hargaSatuan) setHargaBeli(String(bahan.hargaSatuan))
  }, [open, editing, bahan, jenis])

  const qtyNum = Number(qty) || 0
  const hargaNum = Number(hargaBeli) || 0
  const total = qtyNum * hargaNum
  const selisih = bahan && stokFisik !== '' ? Math.round((Number(stokFisik) - bahan.stok) * 1e6) / 1e6 : null

  // Untuk edit penyesuaian, qty boleh negatif (arah selisih)
  const qtyEditableLabel =
    jenis === 'penyesuaian' ? (isEdit ? 'Selisih (boleh −)' : 'Selisih otomatis') : 'Jumlah'

  async function submit() {
    if (!isEdit && !bahanId) {
      toast.error('Pilih bahan terlebih dahulu')
      return
    }
    if (jenis === 'penyesuaian' && !isEdit && selisih === null) {
      toast.error('Isi stok fisik')
      return
    }
    setSaving(true)
    try {
      if (isEdit) {
        await apiFetch('/api/stock-bahan/mutasi', {
          method: 'PUT',
          body: JSON.stringify({
            id: editing!.id,
            qty: jenis === 'penyesuaian' ? Number(qty) : Math.abs(Number(qty)),
            tanggal,
            ...(jenis === 'masuk' ? { hargaBeli: Number(hargaBeli) || 0, nomorNota, pemasok } : {}),
            ...(jenis === 'keluar' ? { tujuan } : {}),
            ...(jenis === 'penyesuaian' ? { alasan } : {}),
            keterangan,
          }),
        })
        toast.success(`${JUDUL[jenis]} diperbarui — stok dihitung ulang`)
      } else {
        await apiFetch('/api/stock-bahan/mutasi', {
          method: 'POST',
          body: JSON.stringify({
            bahanId,
            jenis,
            tanggal,
            ...(jenis === 'penyesuaian'
              ? { stokFisik: Number(stokFisik) }
              : { qty: Math.abs(qtyNum) }),
            ...(jenis === 'masuk' ? { hargaBeli: Number(hargaBeli) || 0, nomorNota, pemasok } : {}),
            ...(jenis === 'keluar' ? { tujuan } : {}),
            ...(jenis === 'penyesuaian' ? { alasan } : {}),
            keterangan,
          }),
        })
        toast.success(`${JUDUL[jenis]} tersimpan — nomor otomatis`)
      }
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !saving && onOpenChange(v)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit — ${JUDUL[jenis]}` : JUDUL[jenis]}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `No. ${editing!.nomor || '(tanpa nomor)'} — perubahan menghitung ulang stok.`
              : 'Nomor transaksi dibuat otomatis. Stok diperbarui setelah disimpan.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="mtg-tgl">Tanggal</Label>
              <Input id="mtg-tgl" type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} />
            </div>
            {!isEdit ? (
              <div className="grid gap-1.5">
                <Label>Bahan *</Label>
                <Select value={bahanId || undefined} onValueChange={setBahanId}>
                  <SelectTrigger><SelectValue placeholder="Pilih bahan" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {bahanList.map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.nama} ({formatAngka(b.stok)} {b.satuan})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label>Bahan</Label>
                <Input value={editing!.namaBahan || editing!.bahan?.nama || ''} disabled />
              </div>
            )}
          </div>

          {jenis === 'penyesuaian' && !isEdit && (
            <div className="rounded-lg border bg-stone-50 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Stok sistem</span>
                <span className="font-semibold">{bahan ? `${formatAngka(bahan.stok)} ${bahan.satuan}` : '— pilih bahan'}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">Selisih</span>
                <span className={`font-semibold ${(selisih ?? 0) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {bahan && selisih !== null ? `${selisih > 0 ? '+' : ''}${formatAngka(selisih)} ${bahan.satuan}` : '—'}
                </span>
              </div>
            </div>
          )}

          {jenis === 'penyesuaian' && !isEdit ? (
            <div className="grid gap-1.5">
              <Label htmlFor="mtg-fisik">Stok fisik *</Label>
              <Input id="mtg-fisik" type="number" min="0" step="any" inputMode="decimal"
                value={stokFisik} onChange={e => setStokFisik(e.target.value)}
                placeholder="Hasil hitung fisik" disabled={!bahan} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="mtg-qty">{qtyEditableLabel} *</Label>
                <Input id="mtg-qty" type="number" step="any" inputMode="decimal"
                  value={qty} onChange={e => setQty(e.target.value)} placeholder="0" />
              </div>
              <div className="grid gap-1.5">
                <Label>Satuan</Label>
                <Input
                  value={isEdit ? (editing!.satuanBahan || editing!.bahan?.satuan || '') : (bahan?.satuan || '')}
                  disabled placeholder="—" />
              </div>
            </div>
          )}

          {jenis === 'masuk' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="mtg-harga">Harga beli / satuan</Label>
                  <Input id="mtg-harga" type="number" min="0" step="any" inputMode="decimal"
                    value={hargaBeli} onChange={e => setHargaBeli(e.target.value)} placeholder="0" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Total harga</Label>
                  <Input value={`Rp ${formatAngka(Math.round(total))}`} disabled readOnly />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Supplier</Label>
                  {pemasokList.length > 0 ? (
                    <Select value={pemasok || 'tanpa'} onValueChange={v => setPemasok(v === 'tanpa' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="Pilih supplier" /></SelectTrigger>
                      <SelectContent>
                        {pemasokList.map(p => <SelectItem key={p.id} value={p.namaToko}>{p.namaToko}</SelectItem>)}
                        <SelectItem value="tanpa">Tanpa supplier</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={pemasok} onChange={e => setPemasok(e.target.value)} placeholder="Nama supplier" />
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="mtg-nota">Nomor nota / faktur</Label>
                  <Input id="mtg-nota" value={nomorNota} onChange={e => setNomorNota(e.target.value)} placeholder="mis. NB-00123" />
                </div>
              </div>
            </>
          )}

          {jenis === 'keluar' && (
            <div className="grid gap-1.5">
              <Label>Tujuan / penggunaan</Label>
              <Select value={tujuan || 'lainnya-x'} onValueChange={v => setTujuan(v === 'lainnya-x' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Pilih tujuan" /></SelectTrigger>
                <SelectContent>
                  {TUJUAN_OPSI.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  <SelectItem value="lainnya-x">Lainnya</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {jenis === 'penyesuaian' && (
            <div className="grid gap-1.5">
              <Label>Alasan penyesuaian</Label>
              <Select value={alasan || 'lainnya-a'} onValueChange={v => setAlasan(v === 'lainnya-a' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Pilih alasan" /></SelectTrigger>
                <SelectContent>
                  {ALASAN_OPSI.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  <SelectItem value="lainnya-a">Lainnya</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="mtg-ket">Catatan</Label>
            <Textarea id="mtg-ket" rows={2} value={keterangan} onChange={e => setKeterangan(e.target.value)} placeholder="Opsional" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="min-h-[44px]">Batal</Button>
          <Button
            onClick={submit}
            disabled={saving || (!isEdit && !bahanId)}
            className={`min-h-[44px] text-white ${jenis === 'keluar' ? 'bg-orange-600 hover:bg-orange-700' : jenis === 'penyesuaian' ? 'bg-stone-700 hover:bg-stone-800' : 'bg-emerald-600 hover:bg-emerald-700'}`}
          >
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {isEdit ? 'Simpan Perubahan' : `Catat ${jenis === 'penyesuaian' ? 'Penyesuaian' : JUDUL[jenis]}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
