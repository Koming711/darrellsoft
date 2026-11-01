'use client'

// ============================================================
// Dialog tambah/edit Harga Customer.
// Urutan field mengikuti spek bisnis: customer -> produk ->
// info produk -> harga khusus -> satuan -> periode -> status -> catatan.
// ============================================================

import * as React from 'react'
import { AlertCircle } from 'lucide-react'
import type { CustomerDTO, CustomerPriceDTO, CustomerPriceInput, ProductDTO } from '@/lib/types'
import { api } from '@/lib/client-api'
import { formatRp, todayISO } from '@/lib/money'
import { useToast } from '@/hooks/use-toast'
import { SearchSelect, type SearchSelectOption } from '@/components/shared/search-select'
import { MoneyInput } from '@/components/shared/money-input'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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

interface PriceFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Data yang sedang diedit; null = mode tambah. */
  editing: CustomerPriceDTO | null
  customers: CustomerDTO[]
  products: ProductDTO[]
  /** Dipanggil setelah berhasil simpan (untuk refetch). */
  onSaved: () => void
}

interface PriceFormState {
  customerId: string | null
  productId: string | null
  /** string desimal (mis. "4800.5"), null = kosong */
  price: string | null
  unit: string
  validFrom: string // 'YYYY-MM-DD'
  validUntil: string // '' = tidak ada batas
  isActive: boolean
  note: string
}

function initState(editing: CustomerPriceDTO | null): PriceFormState {
  if (editing) {
    return {
      customerId: editing.customerId,
      productId: editing.productId,
      price: editing.sellingPrice,
      unit: editing.unit,
      validFrom: editing.validFrom.slice(0, 10),
      validUntil: editing.validUntil ? editing.validUntil.slice(0, 10) : '',
      isActive: editing.isActive,
      note: editing.note ?? '',
    }
  }
  return {
    customerId: null,
    productId: null,
    price: null,
    unit: '',
    validFrom: todayISO(),
    validUntil: '',
    isActive: true,
    note: '',
  }
}

export function PriceFormDialog({ open, onOpenChange, editing, customers, products, onSaved }: PriceFormDialogProps) {
  const { toast } = useToast()
  const [form, setForm] = React.useState<PriceFormState>(() => initState(editing))
  const [saving, setSaving] = React.useState(false)
  const [fieldError, setFieldError] = React.useState<string | null>(null)
  const [conflictError, setConflictError] = React.useState<string | null>(null)

  const selectedProduct = React.useMemo(
    () => products.find((p) => p.id === form.productId) ?? null,
    [products, form.productId]
  )
  const selectedCustomer = React.useMemo(
    () => customers.find((c) => c.id === form.customerId) ?? null,
    [customers, form.customerId]
  )

  // Opsi hanya customer/produk aktif; customer/produk yang sedang diedit tetap disertakan walau nonaktif.
  const customerOptions = React.useMemo<SearchSelectOption[]>(
    () =>
      customers
        .filter((c) => c.isActive || c.id === (editing?.customerId ?? null))
        .map((c) => ({ value: c.id, label: c.name, description: c.code, keywords: [c.code] })),
    [customers, editing]
  )

  const productOptions = React.useMemo<SearchSelectOption[]>(
    () =>
      products
        .filter((p) => p.isActive || p.id === (editing?.productId ?? null))
        .map((p) => ({ value: p.id, label: p.name, description: `${p.code} - ${p.unit}`, keywords: [p.code] })),
    [products, editing]
  )

  const patchForm = (patch: Partial<PriceFormState>) => {
    setFieldError(null)
    setForm((f) => ({ ...f, ...patch }))
  }

  /** Prefill satuan otomatis dari produk yang dipilih (masih bisa diubah manual). */
  const handleProductChange = (value: string | null) => {
    const product = value ? products.find((p) => p.id === value) ?? null : null
    setConflictError(null)
    setFieldError(null)
    setForm((f) => ({ ...f, productId: value, unit: product ? product.unit : f.unit }))
  }

  /** Perubahan periode menghapus pesan konflik lama agar user bisa mencoba periode baru. */
  const handleDateChange = (patch: Partial<PriceFormState>) => {
    setConflictError(null)
    patchForm(patch)
  }

  function validate(): string | null {
    if (!form.customerId) return 'Customer wajib dipilih.'
    if (!form.productId) return 'Barang / produk wajib dipilih.'
    if (form.price === null || form.price.trim() === '' || Number(form.price) < 0) {
      return 'Harga khusus customer wajib diisi (minimal 0).'
    }
    if (!form.validFrom) return 'Tanggal mulai berlaku wajib diisi.'
    if (form.validUntil && form.validUntil < form.validFrom) {
      return 'Tanggal akhir berlaku tidak boleh sebelum tanggal mulai.'
    }
    return null
  }

  async function handleSubmit() {
    setConflictError(null)
    const error = validate()
    if (error) {
      setFieldError(error)
      return
    }
    setFieldError(null)
    // Type guard setelah validasi agar payload bebas null.
    if (!form.customerId || !form.productId || form.price === null || !form.validFrom) return

    const customerName = selectedCustomer?.name ?? ''
    const productName = selectedProduct?.name ?? ''
    const body: CustomerPriceInput = {
      customerId: form.customerId,
      productId: form.productId,
      sellingPrice: form.price,
      unit: form.unit.trim() || selectedProduct?.unit || undefined,
      validFrom: form.validFrom,
      validUntil: form.validUntil ? form.validUntil : null,
      isActive: form.isActive,
      note: form.note.trim() ? form.note.trim() : null,
    }

    setSaving(true)
    try {
      if (editing) {
        await api(`/api/customer-prices/${editing.id}`, { method: 'PUT', body })
      } else {
        await api('/api/customer-prices', { method: 'POST', body })
      }
      toast({
        title: editing ? 'Harga customer diperbarui' : 'Harga customer ditambahkan',
        description: `${customerName} - ${productName}`,
      })
      onSaved()
      onOpenChange(false)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan harga.'
      // Konflik periode (HTTP 409): tampilkan di dalam dialog agar user bisa memperbaiki periode.
      if (message.includes('Sudah ada harga khusus') || message.includes('periode yang sama')) {
        setConflictError(message)
      } else {
        toast({ variant: 'destructive', title: 'Gagal menyimpan harga', description: message })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Harga Customer' : 'Tambah Harga Customer'}</DialogTitle>
          <DialogDescription>
            Harga khusus akan otomatis dipakai saat membuat invoice untuk customer ini selama masa berlakunya.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* 1. Customer */}
          <div className="grid gap-1.5">
            <Label htmlFor="price-customer">
              Customer <span className="text-destructive">*</span>
            </Label>
            <SearchSelect
              id="price-customer"
              value={form.customerId}
              onChange={(v) => patchForm({ customerId: v })}
              options={customerOptions}
              placeholder="Pilih customer"
              searchPlaceholder="Cari customer..."
            />
          </div>

          {/* 2. Barang / Produk */}
          <div className="grid gap-1.5">
            <Label htmlFor="price-product">
              Barang / Produk <span className="text-destructive">*</span>
            </Label>
            <SearchSelect
              id="price-product"
              value={form.productId}
              onChange={handleProductChange}
              options={productOptions}
              placeholder="Pilih barang / produk"
              searchPlaceholder="Cari barang / produk..."
            />
          </div>

          {/* 3. Info produk (otomatis setelah produk dipilih) */}
          {selectedProduct && (
            <div className="grid grid-cols-3 gap-2 rounded-md bg-zinc-50 p-3 text-sm">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Kode</p>
                <p className="truncate font-mono text-xs font-medium">{selectedProduct.code}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Nama</p>
                <p className="truncate font-medium">{selectedProduct.name}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Harga Standar</p>
                <p className="truncate font-medium">{formatRp(selectedProduct.sellingPrice)}</p>
              </div>
            </div>
          )}

          {/* 4. Harga khusus */}
          <div className="grid gap-1.5">
            <Label htmlFor="price-value">
              Harga Khusus Customer <span className="text-destructive">*</span>
            </Label>
            <MoneyInput
              id="price-value"
              value={form.price}
              onChange={(v) => patchForm({ price: v })}
              aria-label="Harga khusus customer"
            />
          </div>

          {/* 5. Satuan (prefill dari produk) */}
          <div className="grid gap-1.5">
            <Label htmlFor="price-unit">Satuan</Label>
            <Input
              id="price-unit"
              value={form.unit}
              onChange={(e) => patchForm({ unit: e.target.value })}
              placeholder="mis. pcs, dus, kg"
            />
          </div>

          {/* 6 & 7. Periode berlaku */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="price-from">
                Tanggal Mulai Berlaku <span className="text-destructive">*</span>
              </Label>
              <Input
                id="price-from"
                type="date"
                value={form.validFrom}
                onChange={(e) => handleDateChange({ validFrom: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="price-until">Tanggal Akhir Berlaku (opsional)</Label>
              <Input
                id="price-until"
                type="date"
                value={form.validUntil}
                onChange={(e) => handleDateChange({ validUntil: e.target.value })}
              />
            </div>
          </div>

          {/* 8. Status aktif */}
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="price-active">Aktifkan harga ini</Label>
              <p className="text-xs text-muted-foreground">Harga nonaktif tidak dipakai saat membuat invoice.</p>
            </div>
            <Switch id="price-active" checked={form.isActive} onCheckedChange={(v) => patchForm({ isActive: v })} />
          </div>

          {/* 9. Catatan */}
          <div className="grid gap-1.5">
            <Label htmlFor="price-note">Catatan (opsional)</Label>
            <Textarea
              id="price-note"
              value={form.note}
              onChange={(e) => patchForm({ note: e.target.value })}
              rows={2}
              placeholder="mis. kesepakatan harga kontrak 2025"
            />
          </div>

          {conflictError && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Periode harga bentrok</AlertTitle>
              <AlertDescription>{conflictError}</AlertDescription>
            </Alert>
          )}
          {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Batal
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {saving ? 'Menyimpan...' : editing ? 'Simpan Perubahan' : 'Simpan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
