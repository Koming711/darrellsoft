// ============================================================
// Tipe internal draft pembuatan invoice & utilitas perhitungan.
// Hanya dipakai di sisi klien (folder invoices).
// ============================================================
import type { PriceSource, ResolvedPriceDTO } from '@/lib/types'
import { lineTotal, toNumber } from '@/lib/money'

/** Baris barang pada draft invoice (sebelum disimpan). */
export interface DraftItem {
  key: string
  productId: string
  productCode: string
  productName: string
  unit: string
  quantity: string
  unitPrice: string | null
  costPrice: string
  source: PriceSource
  manualReason: string | null
}

/** Draft invoice pada dialog Buat Invoice. */
export interface DraftState {
  customerId: string | null
  invoiceDate: string
  dueDate: string | null
  discount: string | null
  taxPercent: string
  note: string
  items: DraftItem[]
}

/** Mode pembaruan harga saat customer / tanggal invoice berubah. */
export type RepriceMode = 'nonManual' | 'all'

/** Editan harga manual yang menunggu konfirmasi alasan. */
export interface PendingPriceEdit {
  key: string
  productName: string
  previous: string | null
  next: string | null
  initialReason: string | null
}

let itemKeyCounter = 0

/** Kunci unik sederhana untuk baris draft. */
export function nextItemKey(): string {
  itemKeyCounter += 1
  return `draft-item-${itemKeyCounter}`
}

/** Draft kosong dengan tanggal invoice hari ini. */
export function createInitialDraft(today: string): DraftState {
  return {
    customerId: null,
    invoiceDate: today,
    dueDate: null,
    discount: null,
    taxPercent: '0',
    note: '',
    items: [],
  }
}

export interface DraftSummary {
  subtotal: number
  discount: number
  taxPercent: number
  taxAmount: number
  dpp: number
  total: number
  margin: number
  marginPercent: number
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/** Hitung ringkasan draft: subtotal, diskon, pajak, total, dan estimasi margin. */
export function computeSummary(items: DraftItem[], discountRaw: string | null, taxPercentRaw: string): DraftSummary {
  const subtotal = round2(items.reduce((acc, it) => acc + lineTotal(it.quantity, it.unitPrice), 0))
  const discountRequested = toNumber(discountRaw)
  const discount = round2(Math.min(Math.max(discountRequested, 0), subtotal))
  const taxPercent = Math.min(Math.max(toNumber(taxPercentRaw), 0), 100)
  const dpp = round2(subtotal - discount)
  const taxAmount = round2((dpp * taxPercent) / 100)
  const total = round2(dpp + taxAmount)
  const margin = round2(
    items.reduce((acc, it) => acc + (toNumber(it.unitPrice) - toNumber(it.costPrice)) * toNumber(it.quantity), 0)
  )
  const marginPercent = subtotal > 0 ? Math.round((margin / subtotal) * 1000) / 10 : 0
  return { subtotal, discount, taxPercent, taxAmount, dpp, total, margin, marginPercent }
}

/** Normalisasi respons resolve harga (bisa array atau objek tunggal) menjadi array. */
export function normalizeResolved(data: ResolvedPriceDTO[] | ResolvedPriceDTO): ResolvedPriceDTO[] {
  return Array.isArray(data) ? data : [data]
}
