/**
 * Helper server bersama untuk modul Invoice (dipakai /api/invoices, /api/invoices/:id,
 * dan /api/export/invoices). Diadaptasi dari InvoiceKu ke konvensi aplikasi ini:
 * auth via header (x-user-id/x-user-role), isolasi data per-user, dan tanggal
 * disimpan sebagai string 'yyyy-mm-dd' pada kolom invoiceDate/dueDate.
 */
import { db } from '@/lib/db'
import { round2 } from '@/lib/format'
import type {
  Invoice,
  InvoiceCustomer,
  InvoiceLine,
  InvoiceSettlementRow,
  InvoiceStatus,
  InvoiceType,
} from '@/lib/types'
import type { Prisma } from '@prisma/client'

// ===== Primitif validasi =====

export function err(status: number, message: string): Response {
  return Response.json({ error: message }, { status })
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export function optStr(v: unknown): string | null {
  const s = str(v)
  return s === '' ? null : s
}

export function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function isInvoiceStatus(v: unknown): v is InvoiceStatus {
  return v === 'BELUM_BAYAR' || v === 'LUNAS' || v === 'BATAL'
}

export function isInvoiceType(v: unknown): v is InvoiceType {
  return v === 'REGULER' || v === 'DP' || v === 'PELUNASAN'
}

/** yyyy-mm-dd dari Date (waktu lokal server) */
export function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Parse input tanggal (yyyy-mm-dd atau ISO) → 'yyyy-mm-dd' string, atau null. */
export function parseDateStr(v: unknown): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v)
  return isNaN(d.getTime()) ? null : ymd(d)
}

// ===== Perhitungan sisa tagihan =====

/** Σ paidAmount settlement aktif (status ≠ BATAL). */
export function activeSettlementTotal(
  settlements: Array<{ paidAmount: number; status: string }> | undefined | null
): number {
  if (!settlements || settlements.length === 0) return 0
  return round2(settlements.reduce((s, x) => (x.status === 'BATAL' ? s : s + x.paidAmount), 0))
}

/**
 * Definisi sisa universal:
 * status BATAL/LUNAS → 0. REGULER → max(0, total). DP → max(0, total - dp - settlementTotal).
 * PELUNASAN → max(0, parent.total - parent.dpAmount - parent.settlementTotal).
 */
export function computeSisa(input: {
  status: InvoiceStatus
  type: InvoiceType
  total: number
  dpAmount?: number
  settlementTotal?: number
  parent?: { total: number; dpAmount: number; settlementTotal: number } | null
}): number {
  if (input.status === 'BATAL' || input.status === 'LUNAS') return 0
  if (input.type === 'PELUNASAN') {
    if (!input.parent) return 0
    return Math.max(0, round2(input.parent.total - input.parent.dpAmount - input.parent.settlementTotal))
  }
  if (input.type === 'DP') {
    return Math.max(0, round2(input.total - (input.dpAmount ?? 0) - (input.settlementTotal ?? 0)))
  }
  return Math.max(0, round2(input.total))
}

/** Σ settlement aktif per parentInvoiceId (satu query groupBy) — untuk list & export. */
export async function settlementTotalsByParent(parentIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (parentIds.length === 0) return map
  const groups = await db.invoice.groupBy({
    by: ['parentInvoiceId'],
    where: { parentInvoiceId: { in: parentIds }, type: 'PELUNASAN', status: { not: 'BATAL' } },
    _sum: { paidAmount: true },
  })
  for (const g of groups) {
    if (g.parentInvoiceId) map.set(g.parentInvoiceId, round2(g._sum.paidAmount ?? 0))
  }
  return map
}

/** Sisa untuk baris list/export (settlementMap + data minimal invoice DP induk). */
export function computeListSisa(
  row: {
    id: string
    status: string
    type: string
    total: number
    dpAmount: number
    parentInvoiceId: string | null
  },
  settlementMap: Map<string, number>,
  parentById: Map<string, { status: string; total: number; dpAmount: number }>
): number {
  if (row.type === 'PELUNASAN') {
    if (!row.parentInvoiceId) return 0
    const parent = parentById.get(row.parentInvoiceId)
    if (!parent) return 0
    return computeSisa({
      status: row.status as InvoiceStatus,
      type: 'PELUNASAN',
      total: row.total,
      parent: {
        total: parent.total,
        dpAmount: parent.dpAmount,
        settlementTotal: settlementMap.get(row.parentInvoiceId) ?? 0,
      },
    })
  }
  return computeSisa({
    status: row.status as InvoiceStatus,
    type: row.type as InvoiceType,
    total: row.total,
    dpAmount: row.dpAmount,
    settlementTotal: row.type === 'DP' ? (settlementMap.get(row.id) ?? 0) : 0,
  })
}

// ===== Detail & mapping =====

type InvoiceDetailRow = Prisma.InvoiceGetPayload<{
  include: {
    customer: true
    lineItems: true
    parentInvoice: {
      include: {
        customer: true
        lineItems: true
        settlements: { select: { paidAmount: true; status: true } }
      }
    }
    settlements: {
      orderBy: [{ invoiceDate: 'asc' }, { createdAt: 'asc' }]
      select: {
        id: true
        invoiceNumber: true
        invoiceDate: true
        paidAmount: true
        status: true
        userId: true
      }
    }
  }
}>

/** Nama pembuat invoice: lookup Pengguna by userId. */
async function creatorNames(userIds: Array<string | null>): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((v): v is string => Boolean(v)))]
  const map = new Map<string, string>()
  if (ids.length === 0) return map
  const rows = await db.pengguna.findMany({
    where: { id: { in: ids } },
    select: { id: true, namaLengkap: true, username: true },
  })
  for (const r of rows) map.set(r.id, r.namaLengkap || r.username)
  return map
}

function mapCustomer(c: {
  id: string
  code: string | null
  name: string
  phone: string | null
  address: string | null
} | null): InvoiceCustomer {
  return {
    id: c?.id ?? '',
    code: c?.code ?? '',
    name: c?.name ?? '',
    phone: c?.phone ?? null,
    address: c?.address ?? null,
  }
}

function mapLines(
  items: Array<{
    id: string
    itemId: string | null
    description: string
    unit: string
    qty: number
    price: number
    hpp: number
    isCustomPrice: boolean
    lineTotal: number
  }>,
  hideHpp: boolean
): InvoiceLine[] {
  return items.map((li) => ({
    id: li.id,
    itemId: li.itemId,
    description: li.description,
    unit: li.unit,
    qty: li.qty,
    price: li.price,
    hpp: hideHpp ? null : li.hpp,
    isCustomPrice: li.isCustomPrice,
    lineTotal: li.lineTotal,
  }))
}

/** Detail invoice lengkap: parent utk PELUNASAN, settlements utk DP (termasuk BATAL). */
export async function fetchInvoiceDetail(id: string) {
  return db.invoice.findUnique({
    where: { id },
    include: {
      customer: true,
      lineItems: { orderBy: { id: 'asc' } },
      parentInvoice: {
        include: {
          customer: true,
          lineItems: { orderBy: { id: 'asc' } },
          settlements: { select: { paidAmount: true, status: true } },
        },
      },
      settlements: {
        orderBy: [{ invoiceDate: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          paidAmount: true,
          status: true,
          userId: true,
        },
      },
    },
  }) as Promise<InvoiceDetailRow | null>
}

/** Bentuk respons detail (Invoice) dari baris DB — hideHpp untuk role kasir. */
export async function mapInvoiceDetail(
  inv: InvoiceDetailRow,
  hideHpp: boolean
): Promise<Invoice> {
  const userIds: Array<string | null> = [inv.userId, inv.parentInvoice?.userId ?? null]
  for (const s of inv.settlements) userIds.push(s.userId)
  const creatorMap = await creatorNames(userIds)

  const base: Invoice = {
    id: inv.id,
    number: inv.invoiceNumber,
    date: inv.invoiceDate,
    dueDate: inv.dueDate || null,
    status: inv.status as InvoiceStatus,
    type: inv.type as InvoiceType,
    subtotal: inv.subTotal,
    discount: inv.discount,
    taxRate: inv.taxRate,
    taxAmount: inv.taxAmount,
    total: inv.grandTotal,
    dpAmount: inv.dpAmount,
    paidAmount: inv.paidAmount,
    parentInvoiceId: inv.parentInvoiceId,
    sisa: 0,
    notes: inv.notes || null,
    createdByName: creatorMap.get(inv.userId ?? '') ?? '',
    customer: mapCustomer(inv.customer),
    items: mapLines(inv.lineItems, hideHpp),
  }

  if (inv.type === 'PELUNASAN') {
    const p = inv.parentInvoice
    const parentSettlementTotal = p ? activeSettlementTotal(p.settlements) : 0
    base.sisa = computeSisa({
      status: base.status,
      type: 'PELUNASAN',
      total: base.total,
      parent: p
        ? { total: p.grandTotal, dpAmount: p.dpAmount, settlementTotal: parentSettlementTotal }
        : null,
    })
    if (p) {
      base.parent = {
        id: p.id,
        number: p.invoiceNumber,
        date: p.invoiceDate,
        status: p.status as InvoiceStatus,
        subtotal: p.subTotal,
        discount: p.discount,
        taxRate: p.taxRate,
        taxAmount: p.taxAmount,
        total: p.grandTotal,
        dpAmount: p.dpAmount,
        settlementTotal: parentSettlementTotal,
        customer: mapCustomer(p.customer),
        items: mapLines(p.lineItems, hideHpp),
        createdByName: creatorMap.get(p.userId ?? '') ?? '',
      }
    }
    return base
  }

  if (inv.type === 'DP') {
    base.sisa = computeSisa({
      status: base.status,
      type: 'DP',
      total: base.total,
      dpAmount: base.dpAmount,
      settlementTotal: activeSettlementTotal(inv.settlements),
    })
    const sMap = creatorMap
    base.settlements = inv.settlements.map(
      (s): InvoiceSettlementRow => ({
        id: s.id,
        number: s.invoiceNumber,
        date: s.invoiceDate,
        paidAmount: s.paidAmount,
        status: s.status as InvoiceStatus,
        createdByName: sMap.get(s.userId ?? '') ?? '',
      })
    )
    return base
  }

  base.sisa = computeSisa({ status: base.status, type: 'REGULER', total: base.total })
  return base
}

// ===== Penomoran =====

/** Nomor invoice INV-YYYYMMDD-#### — count prefix + loop cek unik (dalam transaction). */
export async function nextInvoiceNumber(
  tx: Prisma.TransactionClient,
  dateStr: string
): Promise<string> {
  const prefix = `INV-${dateStr.replace(/-/g, '')}`
  let seq = (await tx.invoice.count({ where: { invoiceNumber: { startsWith: prefix } } })) + 1
  for (;;) {
    const number = `${prefix}-${String(seq).padStart(4, '0')}`
    const dup = await tx.invoice.findUnique({ where: { invoiceNumber: number } })
    if (!dup) return number
    seq += 1
  }
}

// ===== Sinkronisasi DocumentHistory (laporan penjualan & riwayat) =====

type SyncRow = {
  id: string
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  customerName: string
  customerPhone: string
  customerAddress: string
  type: string
  status: string
  subTotal: number
  discount: number
  taxRate: number
  taxAmount: number
  grandTotal: number
  dpAmount: number
  paidAmount: number
  notes: string
  userId: string | null
  parentInvoiceId: string | null
  lineItems: Array<{ description: string; qty: number; unit: string; price: number }>
  parentInvoice?: { invoiceNumber: string } | null
}

async function loadSyncRow(id: string): Promise<SyncRow | null> {
  return db.invoice.findUnique({
    where: { id },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      dueDate: true,
      customerName: true,
      customerPhone: true,
      customerAddress: true,
      type: true,
      status: true,
      subTotal: true,
      discount: true,
      taxRate: true,
      taxAmount: true,
      grandTotal: true,
      dpAmount: true,
      paidAmount: true,
      notes: true,
      userId: true,
      parentInvoiceId: true,
      lineItems: { orderBy: { id: 'asc' }, select: { description: true, qty: true, unit: true, price: true } },
      parentInvoice: { select: { invoiceNumber: true } },
    },
  })
}

function buildDhDataJson(inv: SyncRow): string {
  const total = inv.grandTotal
  const dpPercent = inv.type === 'DP' && total > 0 ? (inv.dpAmount / total) * 100 : 0
  return JSON.stringify({
    nomor: inv.invoiceNumber,
    tanggal: inv.invoiceDate,
    client: {
      nama: inv.customerName,
      kontak: inv.customerPhone || '',
      alamat: inv.customerAddress || '',
    },
    items: inv.lineItems.map((li, i) => ({
      id: `item-${i}`,
      deskripsi: li.description,
      qty: li.qty,
      satuan: li.unit,
      harga: li.price,
    })),
    ppn: inv.taxRate,
    dp: dpPercent,
    dpAmount: inv.dpAmount,
    originalTotal: total,
    catatan: inv.notes || '',
    tanggalJatuhTempo: inv.dueDate || '',
    tanggalPelunasan: inv.type === 'PELUNASAN' ? inv.invoiceDate : '',
    lunas: inv.status === 'LUNAS',
    referensiInvoiceId: inv.parentInvoiceId || '',
    referensiInvoiceNomor: inv.parentInvoice?.invoiceNumber || '',
    uangCapek: 0,
  })
}

/**
 * Buat / perbarui / hapus entri DocumentHistory untuk satu invoice agar
 * Laporan Penjualan dan halaman Riwayat tetap konsisten.
 * status BATAL → entri dihapus; selain itu → upsert dataJson terbaru.
 */
export async function syncInvoiceHistory(invoiceId: string): Promise<void> {
  const inv = await loadSyncRow(invoiceId)
  if (!inv) return
  const docType = inv.type === 'PELUNASAN' ? 'invoice-pelunasan' : 'invoice'
  const existing = await db.documentHistory.findFirst({
    where: { docType, nomor: inv.invoiceNumber, userId: inv.userId },
    select: { id: true },
  })
  if (inv.status === 'BATAL') {
    if (existing) await db.documentHistory.delete({ where: { id: existing.id } })
    return
  }
  const payload = {
    docType,
    nomor: inv.invoiceNumber,
    tanggal: inv.invoiceDate,
    pihakKedua: inv.customerName,
    total: String(inv.type === 'PELUNASAN' ? inv.paidAmount : inv.grandTotal),
    dataJson: buildDhDataJson(inv),
    userId: inv.userId,
  }
  if (existing) {
    await db.documentHistory.update({ where: { id: existing.id }, data: payload })
  } else {
    await db.documentHistory.create({ data: payload })
  }
}

/**
 * Hitung ulang status invoice DP induk setelah settlement berubah (PUT status / DELETE PELUNASAN).
 * Parent BATAL tetap BATAL; selain itu LUNAS jika sisa <= 0, else BELUM_BAYAR.
 */
export async function recomputeParentStatus(
  tx: Prisma.TransactionClient,
  parentInvoiceId: string
): Promise<void> {
  const parent = await tx.invoice.findUnique({
    where: { id: parentInvoiceId },
    select: {
      id: true,
      status: true,
      grandTotal: true,
      dpAmount: true,
      settlements: { select: { paidAmount: true, status: true } },
    },
  })
  if (!parent || parent.status === 'BATAL') return
  const sisa = computeSisa({
    status: 'BELUM_BAYAR',
    type: 'DP',
    total: parent.grandTotal,
    dpAmount: parent.dpAmount,
    settlementTotal: activeSettlementTotal(parent.settlements),
  })
  const next: InvoiceStatus = sisa <= 0 ? 'LUNAS' : 'BELUM_BAYAR'
  if (parent.status !== next) {
    await tx.invoice.update({ where: { id: parent.id }, data: { status: next } })
  }
}

/** Hapus entri DocumentHistory milik satu invoice (dipakai saat invoice dihapus). */
export async function deleteInvoiceHistory(
  invoiceNumber: string,
  userId: string | null,
  type: string
): Promise<void> {
  const docType = type === 'PELUNASAN' ? 'invoice-pelunasan' : 'invoice'
  await db.documentHistory.deleteMany({ where: { docType, nomor: invoiceNumber, userId } })
}
