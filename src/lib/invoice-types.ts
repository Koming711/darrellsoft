/**
 * Tipe & label untuk modul Invoice (port dari modul InvoiceKu).
 * Status/tipe invoice, baris item, master barang, harga khusus.
 */

export type InvoiceStatus = 'BELUM_BAYAR' | 'LUNAS' | 'BATAL'
export type InvoiceType = 'REGULER' | 'DP' | 'PELUNASAN'

/** User ringkas untuk komponen invoice (dari useAuth) */
export interface InvoiceSessionUser {
  id: string
  name: string
  username: string
  role: string
}

/** Opsi pelanggan untuk picker (dari /api/customers — master Customer aplikasi utama) */
export interface CustomerOption {
  id: string
  code: string
  name: string
  phone: string
  email: string
  address: string
  isActive: boolean
}

export interface Item {
  id: string
  code: string
  name: string
  unit: string
  keterangan: string
  hpp: number
  hargaJual: number
  isActive: boolean
  createdAt: string
}

export interface PriceRow {
  itemId: string
  code: string
  name: string
  unit: string
  hpp: number
  hargaJual: number
  customPrice: number | null
}

export interface InvoiceLine {
  id: string
  itemId: string | null
  description: string
  unit: string
  qty: number
  price: number
  hpp: number
  isCustomPrice: boolean
  lineTotal: number
}

export interface InvoiceCustomer {
  id: string
  code: string
  name: string
  phone: string
  address: string
  email?: string | null
}

export interface Invoice {
  id: string
  number: string
  date: string
  dueDate: string | null
  status: InvoiceStatus
  type: InvoiceType
  subtotal: number
  discount: number
  taxRate: number
  taxAmount: number
  total: number
  /** Untuk invoice DP: nominal uang muka yang dibayar */
  dpAmount: number
  /** Untuk invoice PELUNASAN: nominal pelunasan */
  paidAmount: number
  /** Sisa tagihan terkini (dihitung server; 0 jika LUNAS/BATAL) */
  sisa: number
  parentInvoiceId: string | null
  /** Hanya untuk type=PELUNASAN: invoice DP yang direferensikan */
  parent?: InvoiceParent | null
  /** Hanya untuk type=DP: daftar invoice pelunasan terkait */
  settlements?: InvoiceSettlementRow[]
  notes: string | null
  customer: InvoiceCustomer
  items: InvoiceLine[]
}

/** Ringkasan invoice DP untuk print/template pelunasan */
export interface InvoiceParent {
  id: string
  number: string
  date: string
  status: InvoiceStatus
  subtotal: number
  discount: number
  taxRate: number
  taxAmount: number
  total: number
  dpAmount: number
  /** Σ nominal pelunasan aktif (status ≠ BATAL) milik invoice DP ini */
  settlementTotal: number
  customer: InvoiceCustomer
  items: InvoiceLine[]
}

export interface InvoiceSettlementRow {
  id: string
  number: string
  date: string
  paidAmount: number
  status: InvoiceStatus
}

export interface InvoiceListRow {
  id: string
  number: string
  customerId: string | null
  customerName: string
  date: string
  dueDate: string | null
  status: InvoiceStatus
  type: InvoiceType
  itemCount: number
  total: number
  /** Untuk DP: nominal DP; untuk PELUNASAN: nominal pelunasan */
  dpAmount: number
  paidAmount: number
  /** Σ pelunasan aktif milik invoice DP ini (0 selain DP) */
  settlementTotal: number
  /** Sisa tagihan terkini (0 jika LUNAS/BATAL; PELUNASAN = sisa DP setelah bayar ini) */
  sisa: number
  /** Untuk PELUNASAN: nomor invoice DP induk */
  parentNumber: string | null
}

export interface InvoiceListResponse {
  invoices: InvoiceListRow[]
  summary: { count: number; total: number }
}

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  BELUM_BAYAR: 'Belum Bayar',
  LUNAS: 'Lunas',
  BATAL: 'Batal',
}

export const TYPE_LABEL: Record<InvoiceType, string> = {
  REGULER: 'Reguler',
  DP: 'DP',
  PELUNASAN: 'Pelunasan',
}

export const UNIT_OPTIONS = ['pcs', 'box', 'dus', 'sak', 'kg', 'gr', 'ltr', 'ml', 'pack', 'm', 'roll', 'set', 'rim', 'lembar'] as const

/** Normalisasi status lama: 'draft'/'pending' dianggap BELUM_BAYAR */
export function normalizeStatus(status: string): InvoiceStatus {
  if (status === 'LUNAS' || status === 'BATAL' || status === 'BELUM_BAYAR') return status
  return 'BELUM_BAYAR'
}

export function normalizeType(type: string | null | undefined): InvoiceType {
  if (type === 'DP' || type === 'PELUNASAN') return type
  return 'REGULER'
}
