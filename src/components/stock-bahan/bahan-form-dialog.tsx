'use client'

/**
 * Dialog Tambah/Edit Bahan — semua field spesifikasi:
 * kode (auto), nama, kategori, satuan, stok (awal/ubah), stok minimum,
 * harga modal, supplier, lokasi penyimpanan, status aktif, catatan.
 */

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { Bahan, PemasokRingkas } from './shared'
import { KATEGORI_OPTIONS, SATUAN_OPTIONS, errText } from './shared'

interface PoRingkas {
  id: string
  nomor: string
  tanggal: string
  pihakKedua: string
}

interface FormState {
  nama: string
  kategori: string
  satuan: string
  stok: string
  stokMin: string
  hargaSatuan: string
  pemasok: string
  lokasi: string
  referensiPo: string
  aktif: boolean
  keterangan: string
}

const emptyForm: FormState = {
  nama: '', kategori: '', satuan: 'pcs', stok: '', stokMin: '', hargaSatuan: '',
  pemasok: '', lokasi: '', referensiPo: '', aktif: true, keterangan: '',
}

export function BahanFormDialog({
  open, onOpenChange, editing, pemasokList, onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: Bahan | null
  pemasokList: PemasokRingkas[]
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const isEdit = !!editing

  // Daftar nomor PO untuk dropdown Referensi PO
  const [poList, setPoList] = useState<PoRingkas[]>([])
  const [poDropdownOpen, setPoDropdownOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(
      editing
        ? {
            nama: editing.nama,
            kategori: editing.kategori || '',
            satuan: editing.satuan || 'pcs',
            stok: String(editing.stok ?? ''),
            stokMin: String(editing.stokMin ?? ''),
            hargaSatuan: editing.hargaSatuan ? String(editing.hargaSatuan) : '',
            pemasok: editing.pemasok || '',
            lokasi: editing.lokasi || '',
            referensiPo: (editing as Bahan).referensiPo || '',
            aktif: editing.aktif,
            keterangan: editing.keterangan || '',
          }
        : { ...emptyForm },
    )
    // Muat daftar PO (nomor + suplier) untuk dropdown referensi
    apiFetch<{ success?: boolean; data?: PoRingkas[] }>('/api/history?docType=purchase-order')
      .then(res => setPoList(Array.isArray(res?.data) ? res.data.slice(0, 100) : []))
      .catch(() => setPoList([]))
  }, [open, editing])

  const set = (k: keyof FormState, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

  // Saring PO berdasarkan teks yang diketik (nomor / suplier)
  const filteredPoList = poList.filter(p => {
    const q = form.referensiPo.toLowerCase().trim()
    if (!q) return true
    return p.nomor.toLowerCase().includes(q) || (p.pihakKedua || '').toLowerCase().includes(q)
  })

  async function submit() {
    if (!form.nama.trim()) {
      toast.error('Nama bahan wajib diisi')
      return
    }
    if (!form.satuan.trim()) {
      toast.error('Satuan wajib diisi')
      return
    }
    setSaving(true)
    try {
      const payload = {
        nama: form.nama.trim(),
        kategori: form.kategori,
        satuan: form.satuan.trim(),
        stok: Number(form.stok) || 0,
        stokMin: Number(form.stokMin) || 0,
        hargaSatuan: Number(form.hargaSatuan) || 0,
        pemasok: form.pemasok,
        lokasi: form.lokasi,
        referensiPo: form.referensiPo.trim(),
        aktif: form.aktif,
        keterangan: form.keterangan,
      }
      if (isEdit) {
        await apiFetch('/api/stock-bahan', { method: 'PUT', body: JSON.stringify({ id: editing!.id, ...payload }) })
        toast.success('Bahan diperbarui')
      } else {
        await apiFetch('/api/stock-bahan', { method: 'POST', body: JSON.stringify(payload) })
        toast.success(`Bahan "${payload.nama}" ditambahkan`)
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
          <DialogTitle>{isEdit ? 'Edit Bahan' : 'Tambah Bahan'}</DialogTitle>
          <DialogDescription>
            {isEdit ? `Kode ${editing!.kode} — ubah data bahan.` : 'Kode bahan dibuat otomatis (BHN-001, …).'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <div className="grid gap-1.5">
            <Label htmlFor="bhn-nama">Nama bahan *</Label>
            <Input id="bhn-nama" value={form.nama} onChange={e => set('nama', e.target.value)}
              placeholder="mis. Kertas Kraft 250gsm" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Kategori</Label>
              <Select value={form.kategori || 'lainnya-none'} onValueChange={v => set('kategori', v === 'lainnya-none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
                <SelectContent>
                  {KATEGORI_OPTIONS.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                  <SelectItem value="lainnya-none">Tanpa kategori</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Satuan *</Label>
              <Select value={form.satuan} onValueChange={v => set('satuan', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SATUAN_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="bhn-stok">{isEdit ? 'Stok saat ini' : 'Stok awal'}</Label>
              <Input id="bhn-stok" type="number" min="0" step="any" inputMode="decimal"
                value={form.stok} onChange={e => set('stok', e.target.value)} placeholder="0" />
              {isEdit && <p className="text-[11px] text-muted-foreground">Perubahan stok tercatat sebagai penyesuaian.</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bhn-min">Stok minimum</Label>
              <Input id="bhn-min" type="number" min="0" step="any" inputMode="decimal"
                value={form.stokMin} onChange={e => set('stokMin', e.target.value)} placeholder="0" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bhn-harga">Harga modal / {form.satuan || 'satuan'}</Label>
              <Input id="bhn-harga" type="number" min="0" step="any" inputMode="decimal"
                value={form.hargaSatuan} onChange={e => set('hargaSatuan', e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Supplier</Label>
              {pemasokList.length > 0 ? (
                <Select value={form.pemasok || 'tanpa'} onValueChange={v => set('pemasok', v === 'tanpa' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Pilih supplier" /></SelectTrigger>
                  <SelectContent>
                    {pemasokList.map(p => <SelectItem key={p.id} value={p.namaToko}>{p.namaToko}</SelectItem>)}
                    <SelectItem value="tanpa">Tanpa supplier</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input value={form.pemasok} onChange={e => set('pemasok', e.target.value)}
                  placeholder="mis. Toko Kertas Maju Jaya" />
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bhn-lokasi">Lokasi penyimpanan</Label>
              <Input id="bhn-lokasi" value={form.lokasi} onChange={e => set('lokasi', e.target.value)}
                placeholder="mis. Gudang A — Rak 2" />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="bhn-refpo">Referensi PO</Label>
            <Popover open={poDropdownOpen} onOpenChange={setPoDropdownOpen}>
              <PopoverAnchor asChild>
                <div className="relative">
                  <Input
                    id="bhn-refpo"
                    value={form.referensiPo}
                    onChange={e => { set('referensiPo', e.target.value); setPoDropdownOpen(true) }}
                    onFocus={() => setPoDropdownOpen(true)}
                    placeholder="Ketik atau pilih nomor PO…"
                    className="pr-9"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Tampilkan daftar PO"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    onMouseDown={e => { e.preventDefault(); setPoDropdownOpen(!poDropdownOpen) }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                </div>
              </PopoverAnchor>
              <PopoverContent
                align="start"
                className="p-0 w-[var(--radix-popover-trigger-width)] max-h-60 overflow-y-auto"
                onOpenAutoFocus={e => e.preventDefault()}
              >
                {filteredPoList.length > 0 ? (
                  <div>
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase bg-slate-50 border-b border-slate-100 sticky top-0">Riwayat Purchase Order</div>
                    {filteredPoList.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={e => { e.preventDefault(); set('referensiPo', p.nomor); setPoDropdownOpen(false) }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${form.referensiPo === p.nomor ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-slate-700 hover:bg-emerald-50 hover:text-emerald-700'}`}
                      >
                        <span className="font-semibold text-xs text-emerald-700">{p.nomor}</span>
                        {p.pihakKedua && <span className="ml-1.5 truncate">{p.pihakKedua}</span>}
                        {p.tanggal && <span className="block text-[11px] text-slate-400 mt-0.5">{p.tanggal}</span>}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-3 text-sm text-slate-400 text-center">
                    {form.referensiPo.trim() ? 'Tidak ada PO yang cocok' : 'Belum ada Purchase Order'}
                  </div>
                )}
              </PopoverContent>
            </Popover>
            <p className="text-[11px] text-muted-foreground">Nomor PO pembelian bahan ini (opsional).</p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="bhn-catatan">Catatan</Label>
            <Textarea id="bhn-catatan" rows={2} value={form.keterangan}
              onChange={e => set('keterangan', e.target.value)} placeholder="Opsional" />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Status aktif</p>
              <p className="text-xs text-muted-foreground">Nonaktif untuk bahan yang sudah tidak dipakai.</p>
            </div>
            <Switch checked={form.aktif} onCheckedChange={v => set('aktif', v)} aria-label="Status aktif bahan" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="min-h-[44px]">Batal</Button>
          <Button onClick={submit} disabled={saving} className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700">
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {isEdit ? 'Simpan Perubahan' : 'Tambah Bahan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
