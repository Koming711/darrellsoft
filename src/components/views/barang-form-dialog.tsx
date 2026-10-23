'use client'

/**
 * Dialog Tambah / Edit / Duplikat Barang — diekstrak UTUH dari Master Barang
 * (components/views/items-view.tsx) supaya popup "tambah barang" yang SAMA
 * PERSIS bisa dipakai halaman lain, mis. tombol "Tambah Barang" di halaman
 * Buat Invoice. Isi & perilaku identik: foto barang, Untuk Pelanggan,
 * satuan (select), qty, harga jual *, harga modal + profit (sinkron dua
 * arah + info margin), keterangan, status aktif (edit saja), validasi &
 * toast sama. Save tetap via apiFetch /api/items (POST/PUT).
 *
 * Redesain UI (logika & props TIDAK berubah): form terbagi 3 seksi
 * (Informasi Barang / Harga & Stok / Lainnya), input rupiah dengan prefix
 * "Rp", callout margin dengan ikon, header/footer menempel saat form
 * di-scroll.
 */

import { useEffect, useState, type ReactNode } from 'react'
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
import { TrendingDown, TrendingUp, User } from 'lucide-react'

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
          className="bg-emerald-50/60 text-emerald-800 border-emerald-200/70 text-[10px] gap-1 max-w-[200px] font-normal"
          title={c.companyName ? `${c.name} — ${c.companyName}` : c.name}
        >
          <User className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{c.name}</span>
        </Badge>
      ))}
    </div>
  )
}

/** Judul seksi form dengan aksen bar hijau. */
function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-4 w-1 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
      <h3 className="text-[13px] font-semibold text-stone-800 leading-tight">{children}</h3>
    </div>
  )
}

/** Input angka dengan prefix "Rp" di dalam kotak. */
function RupiahInput(props: React.ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden="true">
        Rp
      </span>
      <Input {...props} className={`pl-10 ${props.className ?? ''}`} />
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
  /** 'all' = bebas pilih pelanggan (termasuk barang umum); id spesifik = select terkunci mengikuti filter */
  customerFilter?: string
  /** Teks bantuan saat select pelanggan terkunci (customerFilter spesifik).
   *  Default = teks Master Barang; halaman lain (mis. Buat Invoice) bisa
   *  memberi teks yang lebih sesuai konteks. */
  lockedCustomerNote?: string
  /** Dipanggil setelah barang berhasil disimpan (item hasil save + customerId terpilih) */
  onSaved?: (item: BarangFormSavedItem | null, customerId: string) => void
}

export function BarangFormDialog({
  open,
  onOpenChange,
  editing = null,
  duplicateFrom = null,
  customers = [],
  customerFilter = 'all',
  lockedCustomerNote = 'Mengikuti filter pelanggan aktif di atas.',
  onSaved,
}: BarangFormDialogProps) {
  const [form, setForm] = useState<ItemFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // Isi form setiap kali dialog dibuka — replika openCreate/openEdit/openDuplicate
  // di items-view (sama persis).
  useEffect(() => {
    if (!open) return
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl p-0 gap-0 flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden">
        {/* Header menempel di atas saat form di-scroll */}
        <DialogHeader className="shrink-0 border-b border-stone-100 px-4 sm:px-6 pt-4 sm:pt-5 pb-3 pr-12 text-left">
          <DialogTitle>{editing ? 'Edit Barang' : duplicateFrom ? 'Duplikat Barang' : 'Tambah Barang'}</DialogTitle>
          <DialogDescription>
            {editing
              ? `Kode ${editing.code} — perbarui data barang.`
              : duplicateFrom
                ? `Salinan dari ${duplicateFrom.code} — ${duplicateFrom.name}. Kode baru dibuat otomatis.`
                : 'Kode barang dibuat otomatis oleh sistem.'}
          </DialogDescription>
        </DialogHeader>

        {/* Isi form — scroll di tengah, header & footer tetap terlihat */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-4 sm:px-6 py-4 space-y-5">
          {/* ===== Seksi: Informasi Barang ===== */}
          <section className="space-y-3.5" aria-label="Informasi barang">
            <SectionTitle>Informasi Barang</SectionTitle>
            <div className="grid gap-1.5">
              <Label htmlFor="item-name">Nama Barang <span className="text-destructive">*</span></Label>
              <Input
                id="item-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nama barang / layanan"
                autoComplete="off"
              />
            </div>
            <PhotoUpload value={form.photoUrl} onChange={(v) => setForm((f) => ({ ...f, photoUrl: v }))} label="Foto Barang" />
            {!editing && (
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
                            {c.name}{c.companyName ? ` — ${c.companyName}` : ''}
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
                            {c.name}{c.companyName ? ` — ${c.companyName}` : ''}
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
            )}
            {editing && (
              <div className="grid gap-1.5">
                <Label>Pelanggan Terdaftar</Label>
                <CustomerChips customers={editing.customers} />
                <div className="grid gap-1.5 mt-1 rounded-lg border border-stone-200 bg-stone-50/60 p-3">
                  <Label htmlFor="item-assign-customer">Tambah Untuk Pelanggan</Label>
                  <Select value={form.customerId} onValueChange={(v) => setForm((f) => ({ ...f, customerId: v }))}>
                    <SelectTrigger id="item-assign-customer" className="w-full min-h-[44px] bg-white" aria-label="Daftarkan barang ke pelanggan">
                      <SelectValue placeholder="Pilih pelanggan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keep">— Tidak berubah —</SelectItem>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}{c.companyName ? ` — ${c.companyName}` : ''}
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
          </section>

          {/* ===== Seksi: Harga & Stok ===== */}
          <section className="space-y-3.5 border-t border-stone-100 pt-4" aria-label="Harga dan stok">
            <SectionTitle>Harga &amp; Stok</SectionTitle>
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
              <RupiahInput
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
            <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="item-modal">Harga Modal (Rp)</Label>
                <RupiahInput
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
                <RupiahInput
                  id="item-profit"
                  type="number"
                  inputMode="numeric"
                  step="any"
                  value={form.profit}
                  onChange={(e) => setProfit(e.target.value)}
                  placeholder="Otomatis"
                  className={marginInfo?.negative ? 'text-red-600' : ''}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Isi Modal + Profit → Harga Jual terisi otomatis. Isi Harga Jual → Profit terhitung sendiri.
            </p>
            {marginInfo && (
              <div
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${marginInfo.negative ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
                role="status"
              >
                {marginInfo.negative
                  ? <TrendingDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                  : <TrendingUp className="h-4 w-4 shrink-0" aria-hidden="true" />}
                <span>
                  Profit: <span className="font-semibold">{formatIDR(marginInfo.profit)}</span>
                  {' '}· Margin: <span className="font-semibold">{formatNum(marginInfo.margin, 1)}%</span>
                  {marginInfo.negative ? ' — rugi! Harga Jual lebih kecil dari Modal.' : ''}
                </span>
              </div>
            )}
          </section>

          {/* ===== Seksi: Lainnya ===== */}
          <section className="space-y-3.5 border-t border-stone-100 pt-4" aria-label="Lainnya">
            <SectionTitle>Lainnya</SectionTitle>
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
          </section>
        </div>

        {/* Footer menempel di bawah saat form di-scroll */}
        <DialogFooter className="shrink-0 gap-2 border-t border-stone-100 bg-stone-50/70 px-4 sm:px-6 py-3 mt-0">
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
