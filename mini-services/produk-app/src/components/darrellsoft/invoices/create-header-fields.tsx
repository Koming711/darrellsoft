'use client'

import type { DraftState } from './types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchSelect, type SearchSelectOption } from '@/components/shared/search-select'

interface CreateHeaderFieldsProps {
  draft: DraftState
  submitAttempted: boolean
  disabled: boolean
  mastersLoading: boolean
  customerOptions: SearchSelectOption[]
  productOptions: SearchSelectOption[]
  /** ubah tanggal invoice — memicu hitung ulang harga di induk */
  onInvoiceDateChange: (value: string) => void
  onDueDateChange: (value: string | null) => void
  onCustomerChange: (value: string | null) => void
  onAddProduct: (value: string | null) => void
}

/** Baris atas dialog Buat Invoice: tanggal, jatuh tempo, customer, dan pemilih barang. */
export function CreateHeaderFields({
  draft,
  submitAttempted,
  disabled,
  mastersLoading,
  customerOptions,
  productOptions,
  onInvoiceDateChange,
  onDueDateChange,
  onCustomerChange,
  onAddProduct,
}: CreateHeaderFieldsProps) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="inv-date">
            Tanggal Invoice <span className="text-destructive">*</span>
          </Label>
          <Input
            id="inv-date"
            type="date"
            value={draft.invoiceDate}
            onChange={(e) => onInvoiceDateChange(e.target.value)}
            disabled={disabled}
          />
          {submitAttempted && !draft.invoiceDate && <p className="text-xs text-destructive">Tanggal invoice wajib diisi.</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-due">Jatuh Tempo (opsional)</Label>
          <Input
            id="inv-due"
            type="date"
            value={draft.dueDate ?? ''}
            onChange={(e) => onDueDateChange(e.target.value || null)}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            Customer <span className="text-destructive">*</span>
          </Label>
          <SearchSelect
            value={draft.customerId}
            onChange={onCustomerChange}
            options={customerOptions}
            placeholder={mastersLoading ? 'Memuat...' : 'Pilih customer...'}
            searchPlaceholder="Cari customer..."
            emptyText="Tidak ada customer"
            allowClear
            disabled={disabled || mastersLoading}
          />
          {submitAttempted && !draft.customerId && <p className="text-xs text-destructive">Customer wajib dipilih.</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Tambah Barang</Label>
        <SearchSelect
          value={null}
          onChange={onAddProduct}
          options={productOptions}
          placeholder={draft.customerId ? 'Pilih barang untuk ditambahkan...' : 'Pilih customer terlebih dahulu...'}
          searchPlaceholder="Cari barang..."
          emptyText="Tidak ada barang aktif"
          disabled={!draft.customerId || mastersLoading || disabled}
        />
        {!draft.customerId && (
          <p className="text-xs text-muted-foreground">Pilih customer untuk mengaktifkan pemilihan barang.</p>
        )}
        {submitAttempted && draft.items.length === 0 && (
          <p className="text-xs text-destructive">Tambahkan minimal satu barang.</p>
        )}
      </div>
    </>
  )
}
