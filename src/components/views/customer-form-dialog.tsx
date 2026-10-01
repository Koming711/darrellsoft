'use client'

/**
 * Dialog Tambah / Edit Pelanggan — diekstrak UTUH dari Master Pelanggan
 * (components/views/customers-view.tsx) supaya popup "tambah pelanggan" yang
 * SAMA PERSIS bisa dipakai halaman lain, mis. tombol "Tambah Customer" di
 * halaman Buat Invoice. Isi & perilaku identik: kode otomatis (preview via
 * /api/customers/next-code), nama *, telepon, email, alamat, catatan, status
 * aktif (edit saja), validasi & toast sama. Save tetap via apiFetch
 * /api/customers (POST/PUT).
 */

import { useEffect, useState } from 'react'
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

  const handleSave = async () => {
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Pelanggan' : 'Tambah Pelanggan'}</DialogTitle>
          <DialogDescription>
            {editing
              ? `Kode ${editing.code} — perbarui data pelanggan.`
              : 'Kode pelanggan dibuat otomatis oleh sistem.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
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
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Nama pelanggan / toko"
              autoComplete="off"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="cust-phone">Telepon</Label>
              <Input
                id="cust-phone"
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="08xxxxxxxxxx"
                autoComplete="off"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cust-email">Email</Label>
              <Input
                id="cust-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="nama@email.com"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cust-address">Alamat</Label>
            <Textarea
              id="cust-address"
              rows={2}
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="Alamat lengkap pelanggan"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cust-notes">Catatan</Label>
            <Textarea
              id="cust-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Catatan tambahan (opsional)"
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
        </div>
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
