'use client'

/**
 * Dialog Tambah / Edit / Duplikat Barang — diekstrak UTUH dari Master Barang
 * (components/views/items-view.tsx) supaya popup "tambah barang" yang SAMA
 * PERSIS bisa dipakai halaman lain, mis. tombol "Tambah Barang" di halaman
 * Buat Invoice. Isi & perilaku identik: foto barang, Untuk Pelanggan,
 * satuan (select), qty, harga jual *, harga modal + profit (sinkron dua
 * arah + info margin), keterangan, status aktif (edit saja), validasi &
 * toast sama. Save tetap via apiFetch /api/items (POST/PUT).
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { formatIDR, formatNum } from '@/lib/format'
import { UNIT_OPTIONS, type Item, type ItemCustomerRef } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhotoUpload } from '@/components/photo-upload'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { User } from 'lucide-react'

function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'Terjadi kesalahan'
}

/** Pilihan pelanggan utk select "Untuk Pelanggan" (struktur sama dgn items-view). */
export interface BarangCustomerOption {
  id: string
  name: string
  companyName: string | null
}

/** Ringkasan barang yang berhasil disimpan (dikirim ke onSaved). */
export interface BarangFormSavedItem {
  id: string
  name: string
  unit: string
  standardPrice: number
  hpp: number | null
  qty: number
}

/** Pilihan barang dr halaman Barang (Master Barang). Bila diisi, field
 *  "Nama Barang" di mode TAMBAH menjadi dropdown barang yg sudah ada —
 *  Simpan = daftarkan harga khusus (BarangCustomer) utk pelanggan terpilih,
 *  BUKAN membuat barang baru. Tak diisi → input teks bebas sprri sebelumnya. */
export interface BarangPickOption {
  id: string
  name: string
  unit: string
  standardPrice: number
  hpp: number | null
  /** Stok barang di Master Barang — mengisi kolom Qty saat barang dipilih
   *  (opsional; bila tidak tersedia Qty tetap tampil dgn nilai terakhir). */
  qty?: number
}

interface ItemFormState {
  name: string
  unit: string
  standardPrice: string
  hpp: string
  /** Bidang praktis: saat diisi → Harga Jual otomatis = Harga Modal + Profit */
  profit: string
  /** Jumlah stok barang */
  qty: string
  keterangan: string
  isActive: boolean
  /** Foto barang (data URL JPEG hasil kompresi ≤300KB); '' = tanpa foto */
  photoUrl: string
  /** Pelanggan tujuan saat create/duplicate ('none' = barang umum).
   *  Mode edit: 'keep' = tidak ada perubahan registrasi; id pelanggan = daftarkan barang
   *  ke pelanggan tsb (reg lama tidak berubah). */
  customerId: string
}

const EMPTY_FORM: ItemFormState = {
  name: '', unit: 'pcs', standardPrice: '', hpp: '', profit: '', qty: '', keterangan: '', isActive: true, photoUrl: '', customerId: 'none',
}

function toNum(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function profitOf(jual: string, modal: string): string {
  const j = toNum(jual)
  const m = toNum(modal)
  return j !== null && m !== null ? String(j - m) : ''
}

/** Chips nama pelanggan (salinan identik dari items-view — dipakai mode edit). */
function CustomerChips({ customers }: { customers?: ItemCustomerRef[] }) {
  if (!customers || customers.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-stone-400">
        <User className="h-3 w-3 shrink-0" aria-hidden="true" /> Umum (tanpa pelanggan)
      </span>
    )
  }
  return (
    <div className="flex flex-wrap gap-1">
      {customers.map((c) => (
        <Badge
          key={c.id}
          variant="outline"
          className="bg-stone-50 text-stone-600 border-stone-200 text-[10px] gap-1 max-w-[200px] font-normal"
          title={c.companyName ? `${c.name} — ${c.companyName}` : c.name}
        >
          <User className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{c.name}</span>
        </Badge>
      ))}
    </div>
  )
}

interface BarangFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Barang yang diedit (mode edit) — null/undefined saat create/duplikat */
  editing?: Item | null
  /** Sumber duplikasi (mode salin) — null/undefined saat create/edit biasa */
  duplicateFrom?: Item | null
  /** Daftar pelanggan utk select "Untuk Pelanggan" */
  customers?: BarangCustomerOption[]
  /** Daftar barang dr halaman Barang utk dropdown "Nama Barang" (mode tambah).
   *  Isi → pilih barang yg sudah ada (simpan = tambah harga khusus per
   *  pelanggan) atau "+ Barang baru" utk tetap bikin barang baru.
   *  Kosong/tidak diisi → input teks bebas seperti sebelumnya. */
  barangOptions?: BarangPickOption[]
  /** 'all' = bebas pilih pelanggan (termasuk barang umum); id spesifik = select terkunci mengikuti filter */
  customerFilter?: string
  /** Teks bantuan saat select pelanggan terkunci (customerFilter spesifik).
   *  Default = teks Master Barang; halaman lain (mis. Buat Invoice) bisa
   *  memberi teks yang lebih sesuai konteks. */
  lockedCustomerNote?: string
  /** Judul popup saat mode TAMBAH (bukan edit/duplikat). Default
   *  "Tambah Barang" — halaman Harga Customer menimpa dgn
   *  "Tambah Harga Customer" supaya sesuai konteks halamannya. */
  addTitle?: string
  /** Posisi blok "Untuk Pelanggan" di mode tambah. false (default) =
   *  setelah Foto Barang (urutan Master Barang); true = di ATAS
   *  "Nama Barang" — dipakai popup Tambah Harga Customer (pelanggan
   *  dipilih dulu sebelum memilih barang). */
  customerFieldFirst?: boolean
  /** Dipanggil setelah barang berhasil disimpan (item hasil save + customerId terpilih) */
  onSaved?: (item: BarangFormSavedItem | null, customerId: string) => void
}

export function BarangFormDialog({
  open,
  onOpenChange,
  editing = null,
  duplicateFrom = null,
  customers = [],
  barangOptions = [],
  customerFilter = 'all',
  lockedCustomerNote = 'Mengikuti filter pelanggan aktif di atas.',
  addTitle = 'Tambah Barang',
  customerFieldFirst = false,
  onSaved,
}: BarangFormDialogProps) {
  const [form, setForm] = useState<ItemFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  /** Barang dipilih dr dropdown (mode tambah, saat barangOptions diisi).
   *  '' = belum memilih; '__new__' = bikin barang baru (nama diketik manual). */
  const [pickedId, setPickedId] = useState('')

  // Isi form setiap kali dialog dibuka — replika openCreate/openEdit/openDuplicate
  // di items-view (sama persis).
  useEffect(() => {
    if (!open) return
    setPickedId('')
    if (editing) {
      const modalStr = editing.hpp != null ? String(editing.hpp) : ''
      setForm({
        name: editing.name,
        unit: editing.unit,
        standardPrice: String(editing.standardPrice),
        hpp: modalStr,
        profit: profitOf(String(editing.standardPrice), modalStr),
        qty: String(editing.qty ?? 0),
        keterangan: editing.keterangan ?? '',
        isActive: editing.isActive,
        photoUrl: editing.photoUrl ?? '',
        customerId: 'keep',
      })
    } else if (duplicateFrom) {
      const modalStr = duplicateFrom.hpp != null ? String(duplicateFrom.hpp) : ''
      setForm({
        name: duplicateFrom.name,
        unit: duplicateFrom.unit,
        standardPrice: String(duplicateFrom.standardPrice),
        hpp: modalStr,
        profit: profitOf(String(duplicateFrom.standardPrice), modalStr),
        qty: String(duplicateFrom.qty ?? 0),
        keterangan: duplicateFrom.keterangan ?? '',
        isActive: true,
        photoUrl: duplicateFrom.photoUrl ?? '',
        customerId: duplicateFrom.customers && duplicateFrom.customers.length > 0
          ? duplicateFrom.customers[0].id
          : (customerFilter !== 'all' ? customerFilter : 'none'),
      })
    } else {
      setForm({ ...EMPTY_FORM, customerId: customerFilter !== 'all' ? customerFilter : 'none' })
    }
  }, [open, editing, duplicateFrom, customerFilter])

  // Barang yg sedang dipilih di dropdown (hanya relevan di mode tambah,
  // saat barangOptions diisi). Null = belum memilih / mode barang baru.
  const pickedBarang = !editing && !duplicateFrom
    ? (barangOptions.find((b) => b.id === pickedId) ?? null)
    : null

  /** Pilih barang dr dropdown → prefill nama/satuan/qty/harga jual & modal
   *  dr master barang. '__new__' = bikin barang baru (nama diketik manual).
   *  Ganti ke '__new__' mengosongkan nama agar tak sengaja bikin duplikat.
   *  Qty IKUT terisi dr stok master — kolom Qty tidak pernah hilang saat
   *  barang dipilih (bila qty tak tersedia, nilai terakhir dipertahankan). */
  const handlePickBarang = (v: string) => {
    setPickedId(v)
    if (v === '__new__') {
      setForm((f) => ({ ...f, name: '' }))
      return
    }
    const b = barangOptions.find((x) => x.id === v)
    if (!b) return
    setForm((f) => {
      const hppStr = b.hpp != null ? String(b.hpp) : ''
      return {
        ...f,
        name: b.name,
        unit: b.unit || f.unit,
        standardPrice: String(b.standardPrice),
        hpp: hppStr,
        profit: profitOf(String(b.standardPrice), hppStr),
        qty: b.qty != null ? String(b.qty) : f.qty,
      }
    })
  }

  // Profit = harga jual − harga modal; Margin = profit / harga jual × 100
  const marginInfo = (() => {
    const std = Number(form.standardPrice)
    const hpp = Number(form.hpp)
    if (form.standardPrice === '' || form.hpp === '' || !Number.isFinite(std) || !Number.isFinite(hpp) || std <= 0) {
      return null
    }
    const profit = std - hpp
    const margin = (profit / std) * 100
    return { profit, margin, negative: margin < 0 }
  })()

  /* Sinkronisasi dua arah: Jual ↔ Profit dengan Modal sebagai dasar.
   - Ubah Harga Jual → Profit = Jual − Modal
   - Ubah Harga Modal → Profit mengikuti Jual; bila Jual kosong tapi Profit terisi → Jual = Modal + Profit
   - Ubah Profit → Jual = Modal + Profit */
  const setJual = (v: string) => {
    setForm((f) => ({ ...f, standardPrice: v, profit: profitOf(v, f.hpp) }))
  }
  const setModal = (v: string) => {
    setForm((f) => {
      const jual = toNum(f.standardPrice)
      const modal = toNum(v)
      if (jual !== null && modal !== null) {
        return { ...f, hpp: v, profit: String(jual - modal) }
      }
      const profit = toNum(f.profit)
      if (profit !== null && modal !== null) {
        return { ...f, hpp: v, standardPrice: String(modal + profit) }
      }
      return { ...f, hpp: v, profit: f.standardPrice !== '' || f.profit === '' ? '' : f.profit }
    })
  }
  const setProfit = (v: string) => {
    setForm((f) => {
      const modal = toNum(f.hpp)
      const profit = toNum(v)
      if (modal !== null && profit !== null) {
        return { ...f, profit: v, standardPrice: String(modal + profit) }
      }
      return { ...f, profit: v }
    })
  }

  const handleSave = async () => {
    const std = Number(form.standardPrice)
    if (!form.name.trim()) {
      toast.error('Nama barang wajib diisi')
      return
    }
    if (form.standardPrice === '' || !Number.isFinite(std) || std < 0) {
      toast.error('Harga jual wajib diisi (min 0)')
      return
    }
    // Barang SUDAH ADA dipilih dr dropdown → Simpan = daftarkan harga khusus
    // (BarangCustomer) utk pelanggan terpilih via /api/harga-customer;
    // TIDAK membuat barang baru (mencegah duplikat nama barang).
    // Qty tetap disertakan: bila user mengubahnya, stok barang di Master
    // Barang ikut diperbarui oleh API (nilai sama = stok tak berubah).
    if (pickedBarang) {
      if (!form.customerId || form.customerId === 'none') {
        toast.error('Pilih pelanggan untuk mengatur harga khusus barang ini')
        return
      }
      const pickedQty = form.qty.trim() === '' ? 0 : Number(form.qty)
      if (!Number.isFinite(pickedQty) || pickedQty < 0) {
        toast.error('Qty tidak boleh negatif')
        return
      }
      setSaving(true)
      try {
        await apiFetch('/api/harga-customer', {
          method: 'POST',
          body: JSON.stringify({
            customerId: form.customerId,
            barangId: pickedBarang.id,
            price: std,
            qty: pickedQty,
          }),
        })
        const custName = customers.find((c) => c.id === form.customerId)?.name
        toast.success(
          custName
            ? `Harga khusus ditambahkan untuk ${custName}`
            : 'Harga khusus ditambahkan'
        )
        onOpenChange(false)
        onSaved?.(
          {
            id: pickedBarang.id,
            name: pickedBarang.name,
            unit: pickedBarang.unit,
            standardPrice: std,
            hpp: pickedBarang.hpp,
            qty: pickedQty,
          },
          form.customerId
        )
      } catch (e) {
        toast.error(errText(e))
      } finally {
        setSaving(false)
      }
      return
    }
    const hppNum = form.hpp === '' ? null : Number(form.hpp)
    if (hppNum !== null && (!Number.isFinite(hppNum) || hppNum < 0)) {
      toast.error('HPP tidak boleh negatif')
      return
    }
    const qtyNum = form.qty.trim() === '' ? 0 : Number(form.qty)
    if (!Number.isFinite(qtyNum) || qtyNum < 0) {
      toast.error('Qty tidak boleh negatif')
      return
    }
    setSaving(true)
    try {
      const formCustomerName = customers.find((c) => c.id === form.customerId)?.name
      const body = {
        name: form.name.trim(),
        unit: form.unit,
        standardPrice: std,
        hpp: hppNum,
        qty: qtyNum,
        keterangan: form.keterangan.trim(),
        photoUrl: form.photoUrl || null,
        ...(editing
          ? {
              isActive: form.isActive,
              // Mode edit: kirim customerId hanya bila user memilih pelanggan di select "Tambah Untuk Pelanggan"
              ...(form.customerId !== 'keep' ? { customerId: form.customerId } : {}),
            }
          : { customerId: form.customerId !== 'none' ? form.customerId : undefined }),
      }
      let saved: BarangFormSavedItem | null = null
      if (editing) {
        const data = await apiFetch<{ item: Item }>(`/api/items/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        toast.success('Barang berhasil diperbarui')
        saved = data?.item
          ? { id: data.item.id, name: data.item.name, unit: data.item.unit, standardPrice: data.item.standardPrice, hpp: data.item.hpp, qty: data.item.qty }
          : null
      } else {
        const data = await apiFetch<{ item: Omit<Item, 'customers' | 'isActive'> & { isActive?: boolean } }>('/api/items', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        toast.success(
          formCustomerName
            ? `Barang berhasil ditambahkan untuk ${formCustomerName}`
            : 'Barang berhasil ditambahkan'
        )
        saved = data?.item
          ? { id: data.item.id, name: data.item.name, unit: data.item.unit, standardPrice: data.item.standardPrice, hpp: data.item.hpp, qty: data.item.qty }
          : null
      }
      onOpenChange(false)
      onSaved?.(saved, form.customerId)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setSaving(false)
    }
  }

  // Blok "Untuk Pelanggan" (hanya mode tambah/duplikat). Posisi default =
  // setelah Foto Barang (urutan Master Barang); halaman Harga Customer
  // (customerFieldFirst) menaruhnya DI ATAS "Nama Barang" supaya pelanggan
  // dipilih lebih dulu sebelum memilih barang.
  const customerField = !editing ? (
    <div className="grid gap-1.5">
      <Label htmlFor="item-customer">Untuk Pelanggan</Label>
      {customerFilter !== 'all' ? (
        <>
          <Select value={form.customerId} onValueChange={(v) => setForm((f) => ({ ...f, customerId: v }))} disabled>
            <SelectTrigger id="item-customer" className="w-full min-h-[44px]" aria-label="Pelanggan tujuan">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {customers.filter((c) => c.id === customerFilter).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {/* Nama pelanggan = nama yang terisi di Master Customer */}
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">{lockedCustomerNote}</p>
        </>
      ) : (
        <>
          <Select value={form.customerId} onValueChange={(v) => setForm((f) => ({ ...f, customerId: v }))}>
            <SelectTrigger id="item-customer" className="w-full min-h-[44px]" aria-label="Pelanggan tujuan">
              <SelectValue placeholder="Pilih pelanggan (opsional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Barang umum (tanpa pelanggan) —</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {/* Nama pelanggan = nama yang terisi di Master Customer */}
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Barang umum (tanpa pelanggan) bisa dipakai untuk semua pelanggan.
          </p>
        </>
      )}
    </div>
  ) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-4 sm:p-6 gap-3 sm:gap-4 max-h-[calc(100dvh-2rem)] overflow-y-auto scrollbar-thin">
        <DialogHeader className="pr-8">
          <DialogTitle>{editing ? 'Edit Barang' : duplicateFrom ? 'Duplikat Barang' : addTitle}</DialogTitle>
          <DialogDescription>
            {editing
              ? `Kode ${editing.code} — perbarui data barang.`
              : duplicateFrom
                ? `Salinan dari ${duplicateFrom.code} — ${duplicateFrom.name}. Kode baru dibuat otomatis.`
                : 'Kode barang dibuat otomatis oleh sistem.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:gap-4">
          {/* MODE HARGA CUSTOMER: "Untuk Pelanggan" di ATAS "Nama Barang" */}
          {customerFieldFirst && customerField}
          <div className="grid gap-1.5">
            <Label htmlFor="item-name">Nama Barang <span className="text-destructive">*</span></Label>
            {!editing && !duplicateFrom && barangOptions.length > 0 ? (
              <>
                {/* Dropdown barang dr halaman Barang (mode tambah, bila
                    barangOptions diisi — mis. halaman Harga Customer).
                    value='' (belum memilih) → Radix menampilkan placeholder
                    & tetap controlled (tanpa warning React). */}
                <Select value={pickedId} onValueChange={handlePickBarang}>
                  <SelectTrigger
                    id="item-name"
                    className="w-full min-h-[44px]"
                    aria-label="Pilih barang"
                    data-testid="barang-pilih-nama"
                  >
                    <SelectValue placeholder="Pilih barang (dari halaman Barang)" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 overflow-y-auto scrollbar-thin">
                    {barangOptions.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="__new__">+ Barang baru (ketik manual)</SelectItem>
                  </SelectContent>
                </Select>
                {pickedId === '' && (
                  <p className="text-[11px] text-muted-foreground">
                    Pilih barang yang sudah ada, atau &quot;+ Barang baru&quot; untuk membuat barang baru.
                  </p>
                )}
                {pickedBarang && (
                  <p className="text-[11px] text-muted-foreground">
                    Barang dari halaman Barang (satuan {pickedBarang.unit || '-'}). Simpan = tambah harga khusus untuk pelanggan yang dipilih; bila Qty diubah, stok barang di Master Barang ikut diperbarui.
                  </p>
                )}
                {pickedId === '__new__' && (
                  <Input
                    id="item-name-new"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Nama barang / layanan"
                    autoComplete="off"
                    autoFocus
                  />
                )}
              </>
            ) : (
              <Input
                id="item-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nama barang / layanan"
                autoComplete="off"
              />
            )}
          </div>
          <PhotoUpload value={form.photoUrl} onChange={(v) => setForm((f) => ({ ...f, photoUrl: v }))} label="Foto Barang" />
          {/* POSISI DEFAULT: "Untuk Pelanggan" setelah Foto Barang (Master
              Barang / Buat Invoice — urutan lama tetap sama) */}
          {!customerFieldFirst && customerField}
          {editing && (
            <div className="grid gap-1.5">
              <Label>Pelanggan Terdaftar</Label>
              <CustomerChips customers={editing.customers} />
              <div className="grid gap-1.5 mt-1">
                <Label htmlFor="item-assign-customer">Tambah Untuk Pelanggan</Label>
                <Select value={form.customerId} onValueChange={(v) => setForm((f) => ({ ...f, customerId: v }))}>
                  <SelectTrigger id="item-assign-customer" className="w-full min-h-[44px]" aria-label="Daftarkan barang ke pelanggan">
                    <SelectValue placeholder="Pilih pelanggan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">— Tidak berubah —</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {/* Nama pelanggan = nama yang terisi di Master Customer */}
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Pilih pelanggan untuk mendaftarkan barang ini (chip pelanggan di atas ikut bertambah). Harga khusus yang sudah ada tidak berubah.
                </p>
              </div>
            </div>
          )}
          {/* Kolom Qty SELALU tampil — termasuk saat barang SUDAH ADA dipilih
              dr dropdown (mis. Tambah Harga Customer). Saat barang dipilih,
              Qty otomatis terisi stok dr Master Barang; bila diubah & disimpan,
              API harga-customer memperbarui stok barang (lihat handleSave). */}
          <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="item-unit">Satuan</Label>
              <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}>
                <SelectTrigger id="item-unit" className="w-full min-h-[44px]" aria-label="Satuan barang">
                  <SelectValue placeholder="Pilih satuan" />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_OPTIONS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="item-qty">Qty</Label>
              <Input
                id="item-qty"
                type="number"
                inputMode="numeric"
                min={0}
                step="any"
                value={form.qty}
                onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
                placeholder="0"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="item-price">Harga Jual (Rp) <span className="text-destructive">*</span></Label>
            <Input
              id="item-price"
              type="number"
              inputMode="numeric"
              min={0}
              step="any"
              value={form.standardPrice}
              onChange={(e) => setJual(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="grid gap-1.5">
            <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="item-modal">Harga Modal (Rp)</Label>
                <Input
                  id="item-modal"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step="any"
                  value={form.hpp}
                  onChange={(e) => setModal(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="item-profit">Profit (Rp)</Label>
                <Input
                  id="item-profit"
                  type="number"
                  inputMode="numeric"
                  step="any"
                  value={form.profit}
                  onChange={(e) => setProfit(e.target.value)}
                  placeholder="Otomatis dari Harga Jual − Modal"
                  className={marginInfo?.negative ? 'text-red-600' : ''}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Isi Modal + Profit → Harga Jual terisi otomatis. Isi Harga Jual → Profit terhitung sendiri.
            </p>
            {marginInfo && (
              <div className={`text-xs rounded-md px-2 py-1.5 ${marginInfo.negative ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                Profit: <span className="font-semibold">{formatIDR(marginInfo.profit)}</span>
                {' '}(Margin: {formatNum(marginInfo.margin, 1)}%)
                {marginInfo.negative ? ' — rugi! Harga Jual lebih kecil dari Modal.' : ''}
              </div>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="item-keterangan">Keterangan</Label>
            <Input
              id="item-keterangan"
              value={form.keterangan}
              onChange={(e) => setForm((f) => ({ ...f, keterangan: e.target.value }))}
              placeholder="Keterangan tambahan (opsional)"
              maxLength={500}
              autoComplete="off"
            />
          </div>
          {editing && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 p-3">
              <div>
                <Label htmlFor="item-active">Status Aktif</Label>
                <p className="text-xs text-muted-foreground">Nonaktif = tidak muncul saat buat invoice.</p>
              </div>
              <Switch
                id="item-active"
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                className="data-[state=checked]:bg-emerald-600"
              />
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 border-t border-stone-100 pt-3 mt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="min-h-[44px]">
            Batal
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px]"
          >
            {saving ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
