// ============================================================
// Kontrak tipe data API Darrellsoft — dipakai server & client.
// Uang = string desimal. Tanggal = ISO string.
// ============================================================
import type { Role } from '@/lib/permissions'

export type { Role }

export interface CompanyDTO {
  id: string
  name: string
}

export interface UserDTO {
  id: string
  email: string
  name: string
  role: Role
  companyId: string
}

export interface BootstrapDTO {
  companies: CompanyDTO[]
  users: UserDTO[]
}

export interface CustomerDTO {
  id: string
  code: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  isActive: boolean
  createdAt: string
}

export interface ProductDTO {
  id: string
  code: string
  name: string
  unit: string
  sellingPrice: string
  costPrice: string
  stock: number
  isActive: boolean
  createdAt: string
}

export type PricePeriodStatus = 'AKTIF' | 'BERAKHIR' | 'NONAKTIF'

export interface CustomerPriceDTO {
  id: string
  customerId: string
  customerName: string
  customerCode: string
  productId: string
  productCode: string
  productName: string
  productUnit: string
  standardPrice: string
  sellingPrice: string
  unit: string
  validFrom: string
  validUntil: string | null
  isActive: boolean
  note: string | null
  createdAt: string
}

export type PriceSource = 'CUSTOMER_PRICE' | 'STANDARD' | 'MANUAL'

export interface ResolvedPriceDTO {
  productId: string
  price: string
  unit: string
  source: PriceSource
  customerPriceId: string | null
  validUntil: string | null
}

export type InvoiceStatus = 'UNPAID' | 'PARTIAL' | 'PAID'

export interface InvoiceItemDTO {
  id: string
  productId: string
  productCode: string
  productName: string
  unit: string
  quantity: string
  unitPrice: string
  costPrice: string
  priceSource: PriceSource
  manualReason: string | null
  subtotal: string
}

export interface InvoiceDTO {
  id: string
  number: string
  customerId: string
  customerName: string
  customerCode: string
  invoiceDate: string
  dueDate: string | null
  status: InvoiceStatus
  subtotal: string
  discount: string
  taxPercent: string
  taxAmount: string
  total: string
  amountPaid: string
  note: string | null
  items: InvoiceItemDTO[]
  createdAt: string
}

export interface InvoiceListItemDTO {
  id: string
  number: string
  customerId: string
  customerName: string
  invoiceDate: string
  dueDate: string | null
  status: InvoiceStatus
  subtotal: string
  discount: string
  taxPercent: string
  taxAmount: string
  total: string
  amountPaid: string
  itemCount: number
  createdAt: string
}

// ---- Payload ----

export interface CustomerInput {
  code: string
  name: string
  phone?: string | null
  email?: string | null
  address?: string | null
  isActive?: boolean
}

export interface ProductInput {
  code: string
  name: string
  unit: string
  sellingPrice: string
  costPrice: string
  stock?: number
  isActive?: boolean
}

export interface CustomerPriceInput {
  customerId: string
  productId: string
  sellingPrice: string
  unit?: string
  validFrom: string // 'YYYY-MM-DD'
  validUntil?: string | null // 'YYYY-MM-DD' | null
  isActive?: boolean
  note?: string | null
}

export interface ResolvePriceInput {
  customerId: string
  productIds: string[]
  date?: string // 'YYYY-MM-DD', default hari ini
}

export interface InvoiceItemInput {
  productId: string
  quantity: string
  unitPrice?: string // wajib bila MANUAL
  priceSource: PriceSource
  manualReason?: string | null
}

export interface InvoiceInput {
  customerId: string
  invoiceDate: string // 'YYYY-MM-DD'
  dueDate?: string | null
  discount?: string
  taxPercent?: string
  note?: string | null
  items: InvoiceItemInput[]
}

// ---- Laporan & dashboard ----

export interface MarginReportDTO {
  from: string
  to: string
  totals: {
    revenue: string
    discount: string
    taxAmount: string
    hpp: string
    grossProfit: string
    marginPercent: string
    invoiceCount: number
  }
  byInvoice: Array<{
    id: string
    number: string
    invoiceDate: string
    customerName: string
    subtotal: string
    discount: string
    taxAmount: string
    total: string
    hpp: string
    grossProfit: string
  }>
  byProduct: Array<{
    productId: string
    productCode: string
    productName: string
    quantity: string
    revenue: string
    hpp: string
    grossProfit: string
  }>
}

export interface DashboardDTO {
  stats: {
    customerCount: number
    productCount: number
    activePriceCount: number
    invoiceMonthCount: number
    revenueMonth: string
    marginMonth: string
    receivables: string
  }
  recentInvoices: InvoiceListItemDTO[]
  topProducts: Array<{ productId: string; productName: string; quantity: string; revenue: string }>
}
