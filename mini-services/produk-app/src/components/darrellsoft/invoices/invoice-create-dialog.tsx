'use client'

import * as React from 'react'
import { Info } from 'lucide-react'
import { api } from '@/lib/client-api'
import { formatRp, toNumber, todayISO } from '@/lib/money'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/store/app-store'
import type { CustomerDTO, InvoiceDTO, InvoiceItemInput, ProductDTO, ResolvedPriceDTO } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { SearchSelectOption } from '@/components/shared/search-select'
import {
  computeSummary,
  createInitialDraft,
  nextItemKey,
  normalizeResolved,
  type DraftItem,
  type DraftState,
  type PendingPriceEdit,
  type RepriceMode,
} from './types'
import { ManualPriceDialog } from './manual-price-dialog'
import { RepriceConfirmDialog } from './reprice-confirm-dialog'
import { CreateSummaryPanel } from './create-summary-panel'
import { CreateHeaderFields } from './create-header-fields'
import { CreateItemsTable } from './create-items-table'

interface InvoiceCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
  /** izin manual_price — menentukan kolom harga dapat diedit atau hanya teks */
  canManualPrice: boolean
}

/**
 * Dialog Buat Invoice — inti integrasi Harga Customer:
 * memilih customer & barang, sistem menerapkan harga khusus customer
 * (bila aktif & berlaku) atau harga standar, dengan opsi override manual.
 */
export function InvoiceCreateDialog({ open, onOpenChange, onCreated, canManualPrice }: InvoiceCreateDialogProps) {
  const { toast } = useToast()
  const companyId = useAppStore((s) => s.companyId)
  const userId = useAppStore((s) => s.userId)

  const [customers, setCustomers] = React.useState<CustomerDTO[]>([])
  const [products, setProducts] = React.useState<ProductDTO[]>([])
  const [mastersLoading, setMastersLoading] = React.useState(false)
  const [draft, setDraft] = React.useState<DraftState>(() => createInitialDraft(todayISO()))
  const [saving, setSaving] = React.useState(false)
  const [resolving, setResolving] = React.useState(false)
  const [submitAttempted, setSubmitAttempted] = React.useState(false)
  const [pendingEdit, setPendingEdit] = React.useState<PendingPriceEdit | null>(null)
  const [pendingReprice, setPendingReprice] = React.useState<{ customerId: string; date: string; manualCount: number } | null>(null)

  // Reset draft setiap kali dialog dibuka
  React.useEffect(() => {
    if (open) {
      setDraft(createInitialDraft(todayISO()))
      setSubmitAttempted(false)
      setPendingEdit(null)
      setPendingReprice(null)
    }
  }, [open])

  // Muat master customer & produk saat dialog terbuka
  React.useEffect(() => {
    if (!open || !companyId || !userId) return
    let cancelled = false
    setMastersLoading(true)
    Promise.all([api<CustomerDTO[]>('/api/customers'), api<ProductDTO[]>('/api/products')])
      .then(([c, p]) => {
        if (cancelled) return
        setCustomers(c)
        setProducts(p.filter((x) => x.isActive))
      })
      .catch((e: Error) => {
        if (!cancelled) {
          toast({ variant: 'destructive', title: 'Gagal memuat master data', description: e.message })
        }
      })
      .finally(() => {
        if (!cancelled) setMastersLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, companyId, userId, toast])

  const summary = React.useMemo(
    () => computeSummary(draft.items, draft.discount, draft.taxPercent),
    [draft.items, draft.discount, draft.taxPercent]
  )

  const taxNum = toNumber(draft.taxPercent)
  const taxInvalid = taxNum < 0 || taxNum > 100
  const discountInvalid = toNumber(draft.discount) > summary.subtotal

  const customerOptions: SearchSelectOption[] = React.useMemo(
    () => customers.map((c) => ({ value: c.id, label: c.name, description: c.code, keywords: [c.code] })),
    [customers]
  )

  const productOptions: SearchSelectOption[] = React.useMemo(
    () =>
      products.map((p) => ({
        value: p.id,
        label: p.name,
        description: `${p.code} · ${p.unit} · ${formatRp(p.sellingPrice)}`,
        keywords: [p.code],
      })),
    [products]
  )

  /** Panggil endpoint resolve harga customer. */
  async function resolvePrices(customerId: string, productIds: string[], date: string): Promise<ResolvedPriceDTO[]> {
    const data = await api<{ prices: ResolvedPriceDTO[] }>('/api/customer-prices/resolve', {
      method: 'POST',
      body: { customerId, productIds, date: date || undefined },
    })
    return normalizeResolved(data.prices)
  }

  /** Terapkan hasil resolve ke baris draft sesuai mode. */
  function applyResolved(rows: ResolvedPriceDTO[], mode: RepriceMode) {
    setDraft((d) => ({
      ...d,
      items: d.items.map((item) => {
        if (item.source === 'MANUAL' && mode === 'nonManual') return item
        const r = rows.find((x) => x.productId === item.productId)
        if (!r) return item
        return { ...item, unitPrice: r.price, unit: r.unit, source: r.source, manualReason: null }
      }),
    }))
  }

  /** Hitung ulang harga semua baris untuk kombinasi customer + tanggal. */
  async function repriceAll(customerId: string, date: string, mode: RepriceMode) {
    const ids = draft.items.map((it) => it.productId)
    if (!customerId || ids.length === 0) return
    setResolving(true)
    try {
      const rows = await resolvePrices(customerId, ids, date)
      applyResolved(rows, mode)
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Gagal menghitung ulang harga',
        description: e instanceof Error ? e.message : 'Terjadi kesalahan.',
      })
    } finally {
      setResolving(false)
    }
  }

  function handleCustomerChange(next: string | null) {
    if (next === draft.customerId) return
    const manualCount = draft.items.filter((it) => it.source === 'MANUAL').length
    setDraft((d) => ({ ...d, customerId: next }))
    if (!next || draft.items.length === 0) return
    if (manualCount > 0) {
      setPendingReprice({ customerId: next, date: draft.invoiceDate, manualCount })
    } else {
      void repriceAll(next, draft.invoiceDate, 'nonManual')
    }
  }

  function handleDateChange(next: string) {
    if (next === draft.invoiceDate) return
    const manualCount = draft.items.filter((it) => it.source === 'MANUAL').length
    setDraft((d) => ({ ...d, invoiceDate: next }))
    if (!next || !draft.customerId || draft.items.length === 0) return
    if (manualCount > 0) {
      setPendingReprice({ customerId: draft.customerId, date: next, manualCount })
    } else {
      void repriceAll(draft.customerId, next, 'nonManual')
    }
  }

  function handleRepriceReplaceAll() {
    if (!pendingReprice) return
    void repriceAll(pendingReprice.customerId, pendingReprice.date, 'all')
    setPendingReprice(null)
  }

  function handleRepriceKeepManual() {
    if (!pendingReprice) return
    void repriceAll(pendingReprice.customerId, pendingReprice.date, 'nonManual')
    setPendingReprice(null)
  }

  /** Tambah barang: tolak duplikat, lalu resolve harga untuk customer & tanggal aktif. */
  async function handleAddProduct(productId: string | null) {
    if (!productId || !draft.customerId) return
    if (draft.items.some((it) => it.productId === productId)) {
      toast({ title: 'Barang sudah ada di daftar' })
      return
    }
    const product = products.find((p) => p.id === productId)
    if (!product) return
    try {
      const rows = await resolvePrices(draft.customerId, [productId], draft.invoiceDate)
      const r = rows.find((x) => x.productId === productId)
      const item: DraftItem = {
        key: nextItemKey(),
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        unit: r?.unit ?? product.unit,
        quantity: '1',
        unitPrice: r?.price ?? product.sellingPrice,
        costPrice: product.costPrice,
        source: r?.source ?? 'STANDARD',
        manualReason: null,
      }
      setDraft((d) => ({ ...d, items: [...d.items, item] }))
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Gagal mengambil harga barang',
        description: e instanceof Error ? e.message : 'Terjadi kesalahan.',
      })
    }
  }

  /** Perubahan harga pada baris → wajib konfirmasi alasan manual. */
  function handlePriceChange(key: string, next: string | null) {
    const item = draft.items.find((it) => it.key === key)
    if (!item || next === item.unitPrice) return
    setPendingEdit({
      key,
      productName: `${item.productCode} · ${item.productName}`,
      previous: item.unitPrice,
      next,
      initialReason: item.manualReason,
    })
  }

  function confirmManualPrice(reason: string) {
    if (!pendingEdit) return
    const { key, next } = pendingEdit
    setDraft((d) => ({
      ...d,
      items: d.items.map((it) =>
        it.key === key ? { ...it, unitPrice: next, source: 'MANUAL' as const, manualReason: reason } : it
      ),
    }))
    setPendingEdit(null)
  }

  function updateQty(key: string, quantity: string) {
    setDraft((d) => ({ ...d, items: d.items.map((it) => (it.key === key ? { ...it, quantity } : it)) }))
  }

  function removeItem(key: string) {
    setDraft((d) => ({ ...d, items: d.items.filter((it) => it.key !== key) }))
  }

  async function handleSubmit() {
    setSubmitAttempted(true)
    if (!draft.customerId) {
      toast({ variant: 'destructive', title: 'Customer wajib dipilih' })
      return
    }
    if (!draft.invoiceDate) {
      toast({ variant: 'destructive', title: 'Tanggal invoice wajib diisi' })
      return
    }
    if (draft.items.length === 0) {
      toast({ variant: 'destructive', title: 'Tambahkan minimal satu barang' })
      return
    }
    if (draft.items.some((it) => toNumber(it.quantity) <= 0)) {
      toast({ variant: 'destructive', title: 'Qty harus lebih dari 0 pada semua baris' })
      return
    }
    if (discountInvalid) {
      toast({ variant: 'destructive', title: 'Diskon tidak boleh melebihi subtotal' })
      return
    }
    if (taxInvalid) {
      toast({ variant: 'destructive', title: 'Pajak harus antara 0 dan 100' })
      return
    }
    if (draft.items.some((it) => it.source === 'MANUAL' && (it.unitPrice === null || !it.manualReason))) {
      toast({ variant: 'destructive', title: 'Baris manual memerlukan harga dan alasan' })
      return
    }

    setSaving(true)
    try {
      const items: InvoiceItemInput[] = draft.items.map((it) => {
        const input: InvoiceItemInput = { productId: it.productId, quantity: it.quantity, priceSource: it.source }
        if (it.source === 'MANUAL') {
          if (it.unitPrice !== null) input.unitPrice = it.unitPrice
          if (it.manualReason) input.manualReason = it.manualReason
        }
        return input
      })
      const created = await api<InvoiceDTO>('/api/invoices', {
        method: 'POST',
        body: {
          customerId: draft.customerId,
          invoiceDate: draft.invoiceDate,
          dueDate: draft.dueDate || null,
          discount: draft.discount ?? '0',
          taxPercent: String(Math.min(Math.max(taxNum, 0), 100)),
          note: draft.note.trim() ? draft.note.trim() : null,
          items,
        },
      })
      toast({ title: `Invoice ${created.number} dibuat` })
      onCreated()
      onOpenChange(false)
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Gagal membuat invoice',
        description: e instanceof Error ? e.message : 'Terjadi kesalahan.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o) }}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Buat Invoice</DialogTitle>
          <DialogDescription>
            Harga otomatis mengikuti harga khusus customer yang berlaku, atau harga standar produk.
          </DialogDescription>
        </DialogHeader>

        <CreateHeaderFields
          draft={draft}
          submitAttempted={submitAttempted}
          disabled={saving || resolving}
          mastersLoading={mastersLoading}
          customerOptions={customerOptions}
          productOptions={productOptions}
          onInvoiceDateChange={handleDateChange}
          onDueDateChange={(v) => setDraft((d) => ({ ...d, dueDate: v }))}
          onCustomerChange={handleCustomerChange}
          onAddProduct={handleAddProduct}
        />

        <CreateItemsTable
          items={draft.items}
          canManualPrice={canManualPrice}
          disabled={saving || resolving}
          showQtyErrors={submitAttempted}
          onQtyChange={updateQty}
          onPriceChange={handlePriceChange}
          onRemove={removeItem}
        />

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-1.5">
            <Label htmlFor="inv-note">Catatan (opsional)</Label>
            <Textarea
              id="inv-note"
              rows={8}
              placeholder="Catatan untuk invoice ini..."
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              disabled={saving}
            />
            {resolving && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5" />
                Menghitung ulang harga sesuai customer &amp; tanggal...
              </p>
            )}
          </div>
          <CreateSummaryPanel
            summary={summary}
            discount={draft.discount}
            onDiscountChange={(v) => setDraft((d) => ({ ...d, discount: v }))}
            taxPercent={draft.taxPercent}
            onTaxPercentChange={(v) => setDraft((d) => ({ ...d, taxPercent: v }))}
            discountError={discountInvalid ? 'Diskon tidak boleh melebihi subtotal.' : null}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Batal
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving || resolving}>
            {saving ? 'Menyimpan...' : 'Simpan Invoice'}
          </Button>
        </DialogFooter>

        <ManualPriceDialog
          open={pendingEdit !== null}
          onOpenChange={(o) => {
            if (!o) setPendingEdit(null)
          }}
          productName={pendingEdit?.productName ?? ''}
          previousPrice={pendingEdit?.previous ?? null}
          nextPrice={pendingEdit?.next ?? null}
          initialReason={pendingEdit?.initialReason ?? null}
          onNextPriceChange={(v) => setPendingEdit((p) => (p ? { ...p, next: v } : p))}
          onConfirm={confirmManualPrice}
        />

        <RepriceConfirmDialog
          open={pendingReprice !== null}
          manualCount={pendingReprice?.manualCount ?? 0}
          onOpenChange={(o) => {
            if (!o) setPendingReprice(null)
          }}
          onReplaceAll={handleRepriceReplaceAll}
          onKeepManual={handleRepriceKeepManual}
        />
      </DialogContent>
    </Dialog>
  )
}
