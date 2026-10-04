'use client'

/**
 * Dialog Tambah / Edit Pelanggan — diekstrak UTUH dari Master Pelanggan
 * (components/views/customers-view.tsx) supaya popup "tambah pelanggan" yang
 * SAMA PERSIS bisa dipakai halaman lain, mis. tombol "Tambah Customer" di
 * halaman Buat Invoice. Isi & perilaku identik: kode otomatis (preview via
 * /api/customers/next-code), nama *, telepon, email, alamat, catatan, status
 * aktif (edit saja), validasi & toast sama. Save tetap via apiFetch
 * /api/customers (POST/PUT).
 *
 * Mobile: bila perangkat mendukung Web Contact Picker API (Chrome Android),
 * tampil tombol "Isi Nama & Telepon dari Phone Book" — pilih kontak dari
 * phone book HP, nama + nomor telepon terisi otomatis. Kolom tetap bisa
 * diketik/diedit manual kapan saja. Di perangkat yang tidak mendukung
 * (desktop / iOS Safari) tombol tidak tampil dan tetap ketik manual;
 * autocomplete name/tel membantu saran isi bawaan keyboard.
 */

import { useEffect, useState } from 'react'
import { BookUser } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import type { Customer } from '@/lib/types'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'Terjadi kesalahan'
}

/* ==== Web Contact Picker API (Chrome Android) — tipe mini ==== */
interface PickerContact {
  name?: string[]
  tel?: string[]
}
interface ContactsManager {
  select(properties: string[], options?: { multiple?: boolean }): Promise<PickerContact[]>
}
type NavigatorWithContacts = Navigator & { contacts?: ContactsManager }

/**
 * Respons API /api/customers (POST & PUT) berupa OBJEK customer LANGSUNG
 * (bukan dibungkus { customer }). Bentuk bungusan lama tetap ditoleransi.
 */
function unwrapCustomer(data: unknown): Customer | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Partial<Customer> & { customer?: Partial<Customer> }
  const c = d.customer ?? d
  return c.id && c.name
    ? (c as Customer)
    : null
}

/** Ringkasan pelanggan yang berhasil disimpan (dikirim ke onSaved). */
export interface CustomerFormSavedCustomer {
  id: string
  code: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
}

interface CustomerFormState {
  name: string
  phone: string
  email: string
  address: string
  notes: string
  isActive: boolean
}

const EMPTY_FORM: CustomerFormState = {
  name: '', phone: '', email: '', address: '', notes: '', isActive: true,
}

interface CustomerFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pelanggan yang diedit (mode edit) — null/undefined saat tambah */
  editing?: Customer | null
  /** Dipanggil setelah pelanggan berhasil disimpan (data hasil save) */
  onSaved?: (customer: CustomerFormSavedCustomer | null) => void
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  editing = null,
  onSaved,
}: CustomerFormDialogProps) {
  const [form, setForm] = useState<CustomerFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  // Preview kode otomatis (mis. "CUST-006") untuk dialog Tambah.
  const [nextCode, setNextCode] = useState('')
  // true bila perangkat mendukung Contact Picker API (Chrome Android) —
  // dicek tiap kali dialog dibuka.
  const [contactPickable, setContactPickable] = useState(false)
  // true bila perangkat layar sentuh (HP/tablet) — dipakai utk petunjuk
  // ketika Contact Picker tidak tersedia.
  const [isTouchDevice, setIsTouchDevice] = useState(false)

  // Isi form setiap kali dialog dibuka — replika openCreate/openEdit di
  // customers-view (sama persis). Mode tambah juga memuat preview kode
  // berikutnya; jika gagal, biarkan senyap (placeholder saja).
  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        name: editing.name,
        phone: editing.phone ?? '',
        email: editing.email ?? '',
        address: editing.address ?? '',
        notes: editing.notes ?? '',
        isActive: editing.isActive,
      })
    } else {
      setForm(EMPTY_FORM)
      setNextCode('')
      apiFetch<{ code: string }>('/api/customers/next-code')
        .then((d) => setNextCode(d.code))
        .catch(() => {})
    }
  }, [open, editing])

  // Deteksi dukungan Contact Picker API + layar sentuh setiap dialog dibuka.
  useEffect(() => {
    if (!open) return
    setContactPickable(
      typeof (navigator as NavigatorWithContacts).contacts?.select === 'function'
    )
    try {
      setIsTouchDevice(window.matchMedia('(pointer: coarse)').matches)
    } catch {
      setIsTouchDevice(false)
    }
  }, [open])

  /** Ambil nama + nomor telepon dari phone book HP (Contact Picker API). */
  const pickFromPhoneBook = async () => {
    const contacts = (navigator as NavigatorWithContacts).contacts
    if (!contacts?.select) {
      toast.error('Perangkat tidak mendukung pemilih kontak')
      return
    }
    try {
      const picked = await contacts.select(['name', 'tel'], { multiple: false })
      // User menutup picker tanpa memilih — biarkan form apa adanya.
      if (!picked || picked.length === 0) return
      const name = picked[0]?.name?.[0]?.trim() ?? ''
      const tel = picked[0]?.tel?.[0]?.trim() ?? ''
      if (!name && !tel) {
        toast.error('Kontak tidak memiliki nama / nomor telepon')
        return
      }
      setForm((f) => ({
        ...f,
        name: name || f.name,
        phone: tel || f.phone,
      }))
      toast.success('Data kontak dimasukkan — silakan koreksi bila perlu')
    } catch (e) {
      // User membatalkan picker bawaan HP — bukan error.
      if (e instanceof DOMException && e.name === 'AbortError') return
      toast.error('Gagal mengambil kontak dari phone book')
    }
  }

  const handleSave = async () => {
    if (saving) return // cegah dobel submit (klik ganda / Enter)
    if (!form.name.trim()) {
      toast.error('Nama pelanggan wajib diisi')
      return
    }
    setSaving(true)
    try {
      const body = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
        ...(editing ? { isActive: form.isActive } : {}),
      }
      let saved: CustomerFormSavedCustomer | null = null
      if (editing) {
        const data = await apiFetch<unknown>(`/api/customers/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        toast.success('Pelanggan berhasil diperbarui')
        const c = unwrapCustomer(data)
        saved = c
          ? { id: c.id, code: c.code, name: c.name, phone: c.phone, email: c.email, address: c.address }
          : null
      } else {
        const data = await apiFetch<unknown>('/api/customers', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        toast.success('Pelanggan berhasil ditambahkan')
        const c = unwrapCustomer(data)
        saved = c
          ? { id: c.id, code: c.code, name: c.name, phone: c.phone, email: c.email, address: c.address }
          : null
      }
      onOpenChange(false)
      onSaved?.(saved)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Pelanggan' : 'Tambah Pelanggan'}</DialogTitle>
          <DialogDescription>
            {editing
              ? `Kode ${editing.code} — perbarui data pelanggan.`
              : 'Kode pelanggan dibuat otomatis oleh sistem.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void handleSave()
          }}
        >
          {contactPickable && (
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] w-full border-dashed"
              onClick={() => void pickFromPhoneBook()}
              disabled={saving}
            >
              <BookUser className="mr-2 h-4 w-4" />
              Isi Nama &amp; Telepon dari Phone Book
            </Button>
          )}
          {!contactPickable && isTouchDevice && (
            <p className="-mt-1 text-xs leading-relaxed text-muted-foreground">
              Isi otomatis dari phone book hanya tersedia di aplikasi Chrome (Android).
              Semua kolom di bawah tetap bisa diketik manual — di iPhone, saran kontak
              dapat muncul di atas keyboard saat mengetik.
            </p>
          )}
          {!editing && (
            <div className="grid gap-1.5">
              <Label htmlFor="cust-code">Kode (otomatis)</Label>
              <Input
                id="cust-code"
                value={nextCode}
                readOnly
                disabled
                placeholder="Otomatis oleh sistem"
              />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="cust-name">Nama <span className="text-destructive">*</span></Label>
            <Input
              id="cust-name"
              name="name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Nama pelanggan / toko"
              autoComplete="name"
              className="text-base sm:text-sm"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="cust-phone">Telepon</Label>
              <Input
                id="cust-phone"
                name="tel"
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="08xxxxxxxxxx"
                autoComplete="tel"
                className="text-base sm:text-sm"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cust-email">Email</Label>
              <Input
                id="cust-email"
                name="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="nama@email.com"
                autoComplete="off"
                className="text-base sm:text-sm"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cust-address">Alamat</Label>
            <Textarea
              id="cust-address"
              name="address"
              rows={2}
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="Alamat lengkap pelanggan"
              className="text-base sm:text-sm"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cust-notes">Catatan</Label>
            <Textarea
              id="cust-notes"
              name="notes"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Catatan tambahan (opsional)"
              className="text-base sm:text-sm"
            />
          </div>
          {editing && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 p-3">
              <div>
                <Label htmlFor="cust-active">Status Aktif</Label>
                <p className="text-xs text-muted-foreground">Nonaktif = tidak muncul saat buat invoice.</p>
              </div>
              <Switch
                id="cust-active"
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                className="data-[state=checked]:bg-emerald-600"
              />
            </div>
          )}
        </form>
        <DialogFooter className="gap-2">
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
