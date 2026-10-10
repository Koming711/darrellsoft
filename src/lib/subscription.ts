// /src/lib/subscription.ts
// SHARED server-side logic for the SaaS Subscription Management system.
// Satu akun pelanggan (Pengguna) = satu langganan.
// Pembayaran manual (QRIS / transfer bank) — aktivasi HANYA setelah Admin
// menyetujui pembayaran (idempoten, tidak pernah dari sisi browser).

import { db } from '@/lib/db'

// ===== STATUS CONSTANTS =====
export const INVOICE_STATUS = {
  MENUNGGU_PEMBAYARAN: 'menunggu_pembayaran',
  MENUNGGU_VERIFIKASI: 'menunggu_verifikasi',
  DISETUJUI: 'disetujui',
  DITOLAK: 'ditolak',
  KEDALUWARSA: 'kedaluwarsa',
  DIBATALKAN: 'dibatalkan',
} as const

export const SUB_STATUS = {
  BELUM_AKTIF: 'belum_aktif',
  AKTIF: 'aktif',
  AKAN_BERAKHIR: 'akan_berakhir',
  KEDALUWARSA: 'kedaluwarsa',
  DITANGGUHKAN: 'ditangguhkan',
  DIBATALKAN: 'dibatalkan',
} as const

export const PAYMENT_STATUS = {
  MENUNGGU_VERIFIKASI: 'menunggu_verifikasi',
  DISETUJUI: 'disetujui',
  DITOLAK: 'ditolak',
} as const

export const PAYMENT_METHODS = {
  QRIS: 'qris',
  TRANSFER_BANK: 'transfer_bank',
} as const

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  qris: 'QRIS (Manual)',
  transfer_bank: 'Transfer Bank',
}

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  menunggu_pembayaran: 'Menunggu Pembayaran',
  menunggu_verifikasi: 'Menunggu Verifikasi',
  disetujui: 'Disetujui',
  ditolak: 'Ditolak',
  kedaluwarsa: 'Kedaluwarsa',
  dibatalkan: 'Dibatalkan',
}

export const SUB_STATUS_LABEL: Record<string, string> = {
  belum_aktif: 'Belum Aktif',
  aktif: 'Aktif',
  akan_berakhir: 'Akan Berakhir',
  kedaluwarsa: 'Kedaluwarsa',
  ditangguhkan: 'Ditangguhkan',
  dibatalkan: 'Dibatalkan',
}

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  menunggu_verifikasi: 'Menunggu Verifikasi',
  disetujui: 'Disetujui',
  ditolak: 'Ditolak',
}

// Tanggal berakhir ≤ 7 hari lagi → status "Akan Berakhir"
export const EXPIRY_WARNING_DAYS = 7
const DAY_MS = 86_400_000

// ===== FORMATTERS =====
export function rupiah(n: number | null | undefined): string {
  return `Rp ${Math.round(n ?? 0).toLocaleString('id-ID')}`
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '-'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '-'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '-'
  return date.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// ===== DERIVED STATUS =====
/**
 * Status langganan turunan berdasarkan tanggal & status tersimpan.
 * - ditangguhkan / dibatalkan / belum_aktif → apa adanya
 * - endDate lewat → kedaluwarsa
 * - sisa ≤ 7 hari → akan_berakhir
 * - selain itu → aktif
 */
export function derivedSubscriptionStatus(sub: { status: string; endDate: Date | string | null }): string {
  if (sub.status === SUB_STATUS.DITANGGUHKAN || sub.status === SUB_STATUS.DIBATALKAN || sub.status === SUB_STATUS.BELUM_AKTIF) {
    return sub.status
  }
  if (!sub.endDate) return SUB_STATUS.BELUM_AKTIF
  const end = new Date(sub.endDate)
  const now = new Date()
  if (now.getTime() >= end.getTime()) return SUB_STATUS.KEDALUWARSA
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / DAY_MS)
  if (daysLeft <= EXPIRY_WARNING_DAYS) return SUB_STATUS.AKAN_BERAKHIR
  return SUB_STATUS.AKTIF
}

/** Sisa hari langganan (negatif = sudah berakhir). */
export function subscriptionDaysLeft(endDate: Date | string | null): number | null {
  if (!endDate) return null
  const end = new Date(endDate)
  if (isNaN(end.getTime())) return null
  return Math.ceil((end.getTime() - Date.now()) / DAY_MS)
}

/** Status tagihan turunan — tagihan menunggu_pembayaran yang lewat dueDate → kedaluwarsa. */
export function derivedInvoiceStatus(inv: { status: string; dueDate: Date | string }): string {
  if (inv.status !== INVOICE_STATUS.MENUNGGU_PEMBAYARAN) return inv.status
  const due = new Date(inv.dueDate)
  if (!isNaN(due.getTime()) && Date.now() > due.getTime() + DAY_MS) return INVOICE_STATUS.KEDALUWARSA
  return inv.status
}

// ===== INVOICE NUMBER =====
/** Nomor tagihan unik: SUB-YYMMDD-XXXX (acak). Diverifikasi unik di DB. */
export async function generateUniqueInvoiceNumber(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const now = new Date()
    const ym = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
    const candidate = `SUB-${ym}-${rand}`
    const exists = await db.subscriptionInvoice.findUnique({ where: { invoiceNumber: candidate } })
    if (!exists) return candidate
  }
  // fallback ultra-unik
  return `SUB-${Date.now().toString(36).toUpperCase()}`
}

// ===== PAYMENT SETTINGS (singleton) =====
export async function getPaymentSettings() {
  const existing = await db.paymentSettings.findUnique({ where: { key: 'default' } })
  if (existing) return existing
  return db.paymentSettings.create({ data: { key: 'default' } })
}

// ===== DEFAULT PLAN SEEDING =====
const DEFAULT_FEATURES_BASIC = [
  'Semua fitur dasar Darrellsoft',
  'Buat Invoice & Surat Jalan',
  'Hitung Potong Kertas, Cetakan & Finishing',
  'Stock Bahan Baku',
  'Maksimal 1 akun pengguna',
  'Batas 200 transaksi / bulan',
  'Penyimpanan 1 GB',
]

const DEFAULT_FEATURES_PRO = [
  'Seluruh fitur paket Basic',
  'Purchase Order & Master Data lengkap',
  'Laporan Laba Rugi & Penjualan POS',
  'Piutang & Hutang Dagang',
  'Maksimal 3 akun pengguna',
  'Batas 1.000 transaksi / bulan',
  'Penyimpanan 5 GB',
]

const DEFAULT_FEATURES_PREMIUM = [
  'Seluruh fitur paket Pro',
  'Maksimal 10 akun pengguna',
  'Transaksi tanpa batas',
  'Penyimpanan 20 GB',
  'Prioritas dukungan pelanggan',
]

/** Buat 3 paket default + pengaturan pembayaran bila DB masih kosong. */
export async function ensureSubscriptionSeeded(): Promise<void> {
  const planCount = await db.subscriptionPlan.count()
  if (planCount === 0) {
    await db.subscriptionPlan.createMany({
      data: [
        {
          slug: 'basic', name: 'Basic', sortOrder: 1,
          description: 'Untuk pengguna usaha kecil yang baru memulai.',
          monthlyPrice: 99000, originalPrice: null,
          features: JSON.stringify(DEFAULT_FEATURES_BASIC),
          maxAccounts: 1, maxTransactions: 200, maxStorageMb: 1024,
          durationDays: 30, isActive: true, isPopular: false,
        },
        {
          slug: 'pro', name: 'Pro', sortOrder: 2,
          description: 'Untuk usaha yang berkembang — laporan lengkap.',
          monthlyPrice: 199000, originalPrice: 249000,
          features: JSON.stringify(DEFAULT_FEATURES_PRO),
          maxAccounts: 3, maxTransactions: 1000, maxStorageMb: 5120,
          durationDays: 30, isActive: true, isPopular: true,
        },
        {
          slug: 'premium', name: 'Premium', sortOrder: 3,
          description: 'Untuk usaha yang membutuhkan fitur lengkap.',
          monthlyPrice: 299000, originalPrice: 399000,
          features: JSON.stringify(DEFAULT_FEATURES_PREMIUM),
          maxAccounts: 10, maxTransactions: null, maxStorageMb: 20480,
          durationDays: 30, isActive: true, isPopular: false,
        },
      ],
    })
    await addAuditLog({ action: 'plan_created', performedBy: 'system', notes: 'Seed 3 paket default (Basic/Pro/Premium)' })
  }
  await getPaymentSettings()
}

// ===== SUBSCRIPTION HELPERS =====
/** Get-or-create langganan milik satu pengguna. */
export async function getOrCreateSubscription(userId: string) {
  const existing = await db.customerSubscription.findUnique({
    where: { userId },
    include: { plan: true },
  })
  if (existing) return existing
  return db.customerSubscription.create({
    data: { userId },
    include: { plan: true },
  })
}

export async function addAuditLog(entry: {
  userId?: string | null
  subscriptionId?: string | null
  invoiceId?: string | null
  action: string
  oldStatus?: string
  newStatus?: string
  performedBy?: string
  notes?: string
}) {
  try {
    await db.subscriptionAuditLog.create({
      data: {
        userId: entry.userId ?? null,
        subscriptionId: entry.subscriptionId ?? null,
        invoiceId: entry.invoiceId ?? null,
        action: entry.action,
        oldStatus: entry.oldStatus ?? '',
        newStatus: entry.newStatus ?? '',
        performedBy: entry.performedBy ?? 'system',
        notes: entry.notes ?? '',
      },
    })
  } catch (e) {
    console.error('audit log error:', e)
  }
}

export async function addNotification(entry: {
  userId: string
  title: string
  body?: string
  type?: string
  link?: string
}) {
  try {
    await db.notification.create({
      data: {
        userId: entry.userId,
        title: entry.title,
        body: entry.body ?? '',
        type: entry.type ?? 'info',
        link: entry.link ?? '',
      },
    })
  } catch (e) {
    console.error('notification error:', e)
  }
}

// ===== ADMIN REVIEW (aktivasi & penolakan — IDEMPOTEN) =====
export interface ReviewResult {
  ok: boolean
  httpStatus: number
  message: string
  idempotent?: boolean
  newEndDate?: Date
  planName?: string
  isPlanChange?: boolean
}

/**
 * Admin menyetujui / menolak pembayaran.
 * - IDEMPOTEN: persetujuan ganda TIDAK menambah masa aktif dua kali.
 *   Guard: updateMany kondisional (status harus masih menunggu_verifikasi).
 * - Aktivasi/Perpanjangan otomatis:
 *   • Pelanggan baru / sudah kedaluwarsa / ganti paket → periode baru mulai SEKARANG.
 *   • Perpanjangan sebelum berakhir (paket sama) → ditambahkan dari tanggal berakhir tercatat.
 * - Pengguna.validUntil di-set = endDate + masa tenggang (mengunci akses via mekanisme existing).
 * - Semua dalam satu transaksi DB + audit log + notifikasi pelanggan.
 */
export async function reviewPayment(
  paymentId: string,
  action: 'approve' | 'reject',
  adminUsername: string,
  reason = '',
): Promise<ReviewResult> {
  return db.$transaction(async (tx) => {
    const payment = await tx.subscriptionPayment.findUnique({
      where: { id: paymentId },
      include: { invoice: true },
    })
    if (!payment) {
      return { ok: false, httpStatus: 404, message: 'Pembayaran tidak ditemukan' }
    }
    if (payment.status !== PAYMENT_STATUS.MENUNGGU_VERIFIKASI) {
      return {
        ok: false,
        httpStatus: 409,
        idempotent: true,
        message: `Pembayaran sudah diproses sebelumnya (${PAYMENT_STATUS_LABEL[payment.status] ?? payment.status}). Tidak ada perubahan.`,
      }
    }

    // ---- REJECT ----
    if (action === 'reject') {
      const guard = await tx.subscriptionPayment.updateMany({
        where: { id: paymentId, status: PAYMENT_STATUS.MENUNGGU_VERIFIKASI },
        data: {
          status: PAYMENT_STATUS.DITOLAK,
          reviewedBy: adminUsername,
          reviewedAt: new Date(),
          rejectionReason: reason || 'Tidak memenuhi ketentuan',
        },
      })
      if (guard.count === 0) {
        return { ok: false, httpStatus: 409, idempotent: true, message: 'Pembayaran sudah diproses sebelumnya.' }
      }
      await tx.subscriptionInvoice.update({
        where: { id: payment.invoiceId },
        data: { status: INVOICE_STATUS.DITOLAK },
      })
      await tx.subscriptionAuditLog.create({
        data: {
          userId: payment.userId,
          invoiceId: payment.invoiceId,
          action: 'payment_rejected',
          oldStatus: PAYMENT_STATUS.MENUNGGU_VERIFIKASI,
          newStatus: PAYMENT_STATUS.DITOLAK,
          performedBy: adminUsername,
          notes: reason,
        },
      })
      await tx.notification.create({
        data: {
          userId: payment.userId,
          title: 'Pembayaran Ditolak',
          body: `Pembayaran untuk tagihan ${payment.invoice.invoiceNumber} ditolak. Alasan: ${reason || 'Tidak memenuhi ketentuan'}. Silakan ajukan ulang dengan bukti yang benar.`,
          type: 'payment',
          link: '/langganan-saya',
        },
      })
      return { ok: true, httpStatus: 200, message: 'Pembayaran ditolak.' }
    }

    // ---- APPROVE ----
    const guard = await tx.subscriptionPayment.updateMany({
      where: { id: paymentId, status: PAYMENT_STATUS.MENUNGGU_VERIFIKASI },
      data: {
        status: PAYMENT_STATUS.DISETUJUI,
        reviewedBy: adminUsername,
        reviewedAt: new Date(),
      },
    })
    if (guard.count === 0) {
      return { ok: false, httpStatus: 409, idempotent: true, message: 'Pembayaran sudah diproses sebelumnya.' }
    }

    const invoice = payment.invoice
    const plan = await tx.subscriptionPlan.findUnique({ where: { id: invoice.planId } })
    const settings = await tx.paymentSettings.findUnique({ where: { key: 'default' } })
    const graceDays = settings?.gracePeriodDays ?? 7

    let sub = await tx.customerSubscription.findUnique({ where: { userId: payment.userId } })
    if (!sub) {
      sub = await tx.customerSubscription.create({ data: { userId: payment.userId } })
    }

    const now = new Date()
    const isPlanChange = !!sub.planId && sub.planId !== invoice.planId
    const subSuspended = sub.status === SUB_STATUS.DITANGGUHKAN || sub.status === SUB_STATUS.DIBATALKAN
    const endStillFuture = !!sub.endDate && new Date(sub.endDate).getTime() > now.getTime()
    // Perpanjangan dari tanggal berakhir tercatat HANYA bila: paket sama, belum berakhir, tidak ditangguhkan
    const extendFromEnd = !isPlanChange && !subSuspended && endStillFuture
    const base = extendFromEnd && sub.endDate ? new Date(sub.endDate) : now
    const durationDays = plan?.durationDays ?? 30
    const newEnd = new Date(base.getTime() + durationDays * DAY_MS)
    const graceEnd = new Date(newEnd.getTime() + graceDays * DAY_MS)
    const newStart = extendFromEnd && sub.startDate ? sub.startDate : now

    await tx.customerSubscription.update({
      where: { id: sub.id },
      data: {
        planId: invoice.planId,
        status: SUB_STATUS.AKTIF,
        startDate: newStart,
        endDate: newEnd,
        gracePeriodEnd: graceEnd,
        suspendReason: '',
      },
    })

    await tx.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: {
        status: INVOICE_STATUS.DISETUJUI,
        billingPeriodStart: base,
        billingPeriodEnd: newEnd,
      },
    })

    await tx.subscriptionAuditLog.create({
      data: {
        userId: payment.userId,
        subscriptionId: sub.id,
        invoiceId: invoice.id,
        action: 'payment_approved',
        oldStatus: PAYMENT_STATUS.MENUNGGU_VERIFIKASI,
        newStatus: PAYMENT_STATUS.DISETUJUI,
        performedBy: adminUsername,
        notes: `${invoice.planName} — ${formatDate(base)} s/d ${formatDate(newEnd)}${isPlanChange ? ' (ganti paket)' : ''}`,
      },
    })
    await tx.subscriptionAuditLog.create({
      data: {
        userId: payment.userId,
        subscriptionId: sub.id,
        action: 'subscription_activated',
        oldStatus: sub.status,
        newStatus: SUB_STATUS.AKTIF,
        performedBy: adminUsername,
        notes: `Langganan aktif hingga ${formatDate(newEnd)}`,
      },
    })

    // validUntil = endDate + masa tenggang → mekanisme penguncian akses existing tetap bekerja
    await tx.pengguna.update({
      where: { id: payment.userId },
      data: { validUntil: graceEnd },
    }).catch(() => { /* pengguna mungkin sudah dihapus — jangan gagalkan approval */ })

    await tx.notification.create({
      data: {
        userId: payment.userId,
        title: 'Pembayaran Disetujui',
        body: `Pembayaran ${rupiah(payment.amount)} untuk tagihan ${invoice.invoiceNumber} disetujui. Langganan ${invoice.planName} aktif hingga ${formatDate(newEnd)}.`,
        type: 'payment',
        link: '/langganan-saya',
      },
    })

    return {
      ok: true,
      httpStatus: 200,
      message: 'Pembayaran disetujui dan langganan diaktifkan.',
      newEndDate: newEnd,
      planName: invoice.planName,
      isPlanChange,
    }
  })
}

// ===== CSV EXPORT =====
export function toCsv(rows: (string | number | null)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = cell === null || cell === undefined ? '' : String(cell)
          return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(';'),
    )
    .join('\n')
}
