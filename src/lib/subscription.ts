// /src/lib/subscription.ts
// SHARED server-side logic for the SaaS Subscription Management system.
// Satu akun pelanggan (Pengguna) = satu langganan.
// Pembayaran manual (QRIS / transfer bank) — aktivasi HANYA setelah Admin
// menyetujui pembayaran (idempoten, tidak pernah dari sisi browser).

import { Prisma } from '@prisma/client'

import { db } from '@/lib/db'
import { emitRealtime } from '@/lib/realtime-notify'

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
export const DAY_MS = 86_400_000

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

// ===== KODE UNIK 3 DIGIT (001–999) =====
/**
 * Alokasi kode unik 3 digit untuk membedakan transfer antar pelanggan.
 * - Rentang 001–999.
 * - TIDAK boleh bentrok dengan tagihan lain yang masih TERBUKA
 *   (menunggu_pembayaran / menunggu_verifikasi) maupun tagihan yang baru
 *   disetujui (7 hari terakhir) — agar nominal transfer tidak tertukar.
 * - Dipanggil DI DALAM transaksi DB agar aman dari alokasi ganda bersamaan.
 * - Return null bila semua kode habis → pemanggil memakai nominal polos
 *   (harga dasar tanpa kode) sebagai mekanisme alternatif yang aman.
 */
export async function allocateUniqueCode(tx: Prisma.TransactionClient): Promise<number | null> {
  const recentApprovedSince = new Date(Date.now() - 7 * 24 * 3600_000)
  const rows = await tx.subscriptionInvoice.findMany({
    where: {
      OR: [
        { status: { in: [INVOICE_STATUS.MENUNGGU_PEMBAYARAN, INVOICE_STATUS.MENUNGGU_VERIFIKASI] } },
        { status: INVOICE_STATUS.DISETUJUI, updatedAt: { gte: recentApprovedSince } },
      ],
    },
    select: { uniqueCode: true },
  })
  const used = new Set<number>()
  for (const r of rows) {
    if (typeof r.uniqueCode === 'number') used.add(r.uniqueCode)
  }
  if (used.size >= 999) return null
  // Coba 60x pilih acak (cepat saat beban rendah), lalu fallback scan urut.
  for (let i = 0; i < 60; i++) {
    const candidate = 1 + Math.floor(Math.random() * 999)
    if (!used.has(candidate)) return candidate
  }
  for (let c = 1; c <= 999; c++) {
    if (!used.has(c)) return c
  }
  return null
}

/** Format kode unik 3 digit: 42 → "042". */
export function formatUniqueCode(code: number | null | undefined): string {
  if (typeof code !== 'number') return '-'
  return String(code).padStart(3, '0')
}


// ===== DEFAULT PLAN SEEDING =====
const DEFAULT_FEATURES_BASIC = [
  'Semua fitur dasar Darrellsoft',
  'Buat Invoice & Surat Jalan',
  'Hitung Potong Kertas, Cetakan & Finishing',
  'Stock Bahan Baku',
  'Maksimal 1 akun pengguna',
]

const DEFAULT_FEATURES_TRIAL = [
  'Semua fitur dasar Darrellsoft',
  'Buat Invoice & Surat Jalan',
  'Hitung Potong Kertas, Cetakan & Finishing',
  'Stock Bahan Baku',
  'Maksimal 1 akun pengguna',
  'Dukungan email',
]

const DEFAULT_FEATURES_PRO = [
  'Seluruh fitur paket Basic',
  'Purchase Order & Master Data lengkap',
  'Laporan Laba Rugi & Penjualan POS',
  'Piutang & Hutang Dagang',
  'Maksimal 3 akun pengguna',
]

const DEFAULT_FEATURES_PREMIUM = [
  'Seluruh fitur paket Pro',
  'Maksimal 10 akun pengguna',
  'Prioritas dukungan pelanggan',
]

/** Buat 4 paket default (Trial/Basic/Pro/Premium) + pengaturan pembayaran bila DB masih kosong. */
export async function ensureSubscriptionSeeded(): Promise<void> {
  const planCount = await db.subscriptionPlan.count()
  if (planCount === 0) {
    await db.subscriptionPlan.createMany({
      data: [
        {
          slug: 'trial', name: 'Trial', sortOrder: 0,
          description: 'Paket awal harga terjangkau untuk mencoba sistem.',
          monthlyPrice: 50000, originalPrice: null,
          features: JSON.stringify(DEFAULT_FEATURES_TRIAL),
          maxAccounts: 1,
          durationDays: 30, isActive: true, isPopular: false,
        },
        {
          slug: 'basic', name: 'Basic', sortOrder: 1,
          description: 'Untuk pengguna usaha kecil yang baru memulai.',
          monthlyPrice: 99000, originalPrice: null,
          features: JSON.stringify(DEFAULT_FEATURES_BASIC),
          maxAccounts: 1,
          durationDays: 30, isActive: true, isPopular: false,
        },
        {
          slug: 'pro', name: 'Pro', sortOrder: 2,
          description: 'Untuk usaha yang berkembang — laporan lengkap.',
          monthlyPrice: 199000, originalPrice: 249000,
          features: JSON.stringify(DEFAULT_FEATURES_PRO),
          maxAccounts: 3,
          durationDays: 30, isActive: true, isPopular: true,
        },
        {
          slug: 'premium', name: 'Premium', sortOrder: 3,
          description: 'Untuk usaha yang membutuhkan fitur lengkap.',
          monthlyPrice: 299000, originalPrice: 399000,
          features: JSON.stringify(DEFAULT_FEATURES_PREMIUM),
          maxAccounts: 10,
          durationDays: 30, isActive: true, isPopular: false,
        },
      ],
    })
    await addAuditLog({ action: 'plan_created', performedBy: 'system', notes: 'Seed 4 paket default (Trial/Basic/Pro/Premium)' })
  }
  await getPaymentSettings()
}

// ===== CUSTOMER RESOLUTION (Pengguna ATAU CalonPembeli) =====
/**
 * PENTING: pendaftaran mandiri (halaman Daftar) membuat akun di tabel
 * CalonPembeli (role demo) — BUKAN Pengguna. Seluruh modul langganan wajib
 * menemukan pelanggan di KEDUA tabel agar pelanggan bisa melihat status
 * verifikasi pembayarannya & admin bisa melihat data pelanggannya.
 */
export interface CustomerInfo {
  id: string
  username: string
  namaLengkap: string
  email: string
  nomorHP: string
  role: string
  source: 'pengguna' | 'calon'
}

/** Cari pelanggan berdasarkan userId — cek Pengguna dulu, lalu CalonPembeli. */
export async function findCustomerById(userId: string): Promise<CustomerInfo | null> {
  if (!userId) return null
  const p = await db.pengguna.findUnique({
    where: { id: userId },
    select: { id: true, username: true, namaLengkap: true, email: true, nomorHP: true, role: true },
  })
  if (p) return { ...p, source: 'pengguna' }
  const c = await db.calonPembeli.findUnique({
    where: { id: userId },
    select: { id: true, username: true, nama: true, email: true, nomorHP: true, role: true },
  })
  if (c) {
    return {
      id: c.id,
      username: c.username ?? '',
      namaLengkap: c.nama,
      email: c.email,
      nomorHP: c.nomorHP,
      role: c.role ?? 'demo',
      source: 'calon',
    }
  }
  return null
}

/**
 * Set masa berlaku AKSES akun pelanggan:
 * - Pengguna → kolom validUntil
 * - CalonPembeli → kolom expiredDate (mekanisme penguncian existing utk akun daftar mandiri)
 * Aman dipanggil utk tabel mana pun — record tidak ada dibiarkan (tidak gagalkan proses utama).
 * `client` = db atau tx transaksi.
 */
export async function setAccessValidUntil(
  client: Prisma.TransactionClient,
  userId: string,
  until: Date | null,
): Promise<void> {
  if (!userId) return
  try {
    const updated = await client.pengguna.updateMany({ where: { id: userId }, data: { validUntil: until } })
    if (updated.count === 0) {
      await client.calonPembeli.updateMany({ where: { id: userId }, data: { expiredDate: until } })
    }
  } catch (e) {
    console.error('setAccessValidUntil error:', e)
  }
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
  // Notifikasi realtime dikirim SETELAH transaksi commit (fire-and-forget).
  // Holder object agar TypeScript tidak menyempitkan tipe dari assignment di dalam callback.
  const realtimeRef: { current: { userId: string; title: string; body: string } | null } = { current: null }

  const result = await db.$transaction(async (tx) => {
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
      realtimeRef.current = {
        userId: payment.userId,
        title: 'Pembayaran Ditolak',
        body: `Pembayaran untuk tagihan ${payment.invoice.invoiceNumber} ditolak oleh admin. Alasan: ${reason || 'Tidak memenuhi ketentuan'}.`,
      }
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

    // Akses akun diperpanjang = endDate + masa tenggang → mekanisme penguncian existing tetap bekerja
    // (Pengguna.validUntil ATAU CalonPembeli.expiredDate — tergantung asal akun)
    await setAccessValidUntil(tx, payment.userId, graceEnd)

    // Akun pendaftaran mandiri (CalonPembeli): setelah pembayaran disetujui,
    // aktifkan status & lepas batasan demo (role demo → user) sesuai langganan yang dibayar.
    await tx.calonPembeli.updateMany({
      where: { id: payment.userId, role: 'demo' },
      data: { role: 'user', status: 'aktif' },
    }).catch(() => { /* bukan CalonPembeli — abaikan */ })

    await tx.notification.create({
      data: {
        userId: payment.userId,
        title: 'Pembayaran Disetujui',
        body: `Pembayaran ${rupiah(payment.amount)} untuk tagihan ${invoice.invoiceNumber} disetujui. Langganan ${invoice.planName} aktif hingga ${formatDate(newEnd)}.`,
        type: 'payment',
        link: '/langganan-saya',
      },
    })

    realtimeRef.current = {
      userId: payment.userId,
      title: 'Pembayaran Disetujui',
      body: `Pembayaran ${rupiah(payment.amount)} untuk tagihan ${invoice.invoiceNumber} disetujui. Langganan ${invoice.planName} aktif hingga ${formatDate(newEnd)}.`,
    }

    return {
      ok: true,
      httpStatus: 200,
      message: 'Pembayaran disetujui dan langganan diaktifkan.',
      newEndDate: newEnd,
      planName: invoice.planName,
      isPlanChange,
    }
  })

  // Flush notifikasi realtime (di luar transaksi — tidak mempengaruhi hasil)
  const rt = realtimeRef.current
  if (result.ok && rt) {
    emitRealtime({
      type: 'payment',
      title: rt.title,
      body: rt.body,
      link: '/langganan-saya',
      userId: rt.userId,
    })
  }

  return result
}

// ===== SUBSCRIPTION ACCESS GATE =====
/**
 * Evaluasi apakah sebuah akun boleh MENGGUNAKAN aplikasi (modul-modul utama).
 * Aturan (permintaan pemilik): selama pembayaran BELUM diverifikasi/disetujui
 * Admin, aplikasi TIDAK bisa digunakan — pelanggan hanya bisa melihat status
 * tagihan/langganannya.
 *
 * Role yang TIDAK pernah diblokir (ditangani pemanggil): admin, superadmin,
 * manager. Role 'user' (akun lama / hasil aktivasi manual Admin / hasil konversi
 * CalonPembeli) juga dikecualikan oleh pemanggil agar alur lama tetap berfungsi.
 *
 * BUKAN write-operation: hanya membaca DB (aman dipanggil tiap beberapa detik).
 */
export interface SubscriptionAccessSubscription {
  planName: string | null
  status: string
  endDate: string | null
  daysLeft: number | null
}

export interface SubscriptionAccessInvoice {
  id: string
  invoiceNumber: string
  planName: string
  amount: number
  status: string
  dueDate: string
}

export interface SubscriptionAccessInfo {
  allowed: boolean
  // ok | belum_pilih_paket | menunggu_pembayaran | menunggu_verifikasi | ditolak | ditangguhkan | dibatalkan
  reason: string
  message: string
  subscription: SubscriptionAccessSubscription | null
  openInvoice: SubscriptionAccessInvoice | null
}

export async function evaluateSubscriptionAccess(userId: string): Promise<SubscriptionAccessInfo> {
  const [sub, openInv] = await Promise.all([
    db.customerSubscription.findUnique({
      where: { userId },
      select: { status: true, endDate: true, plan: { select: { name: true } } },
    }),
    // Tagihan terbaru yang masih "terbuka": belum dibayar, sedang diverifikasi,
    // atau pembayarannya ditolak Admin (agar pelanggan punya jalur ajukan ulang).
    db.subscriptionInvoice.findFirst({
      where: {
        userId,
        status: {
          in: [INVOICE_STATUS.MENUNGGU_PEMBAYARAN, INVOICE_STATUS.MENUNGGU_VERIFIKASI, INVOICE_STATUS.DITOLAK],
        },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, invoiceNumber: true, planName: true, amount: true, status: true, dueDate: true },
    }),
  ])

  const subscription: SubscriptionAccessSubscription | null = sub
    ? {
        planName: sub.plan?.name ?? null,
        status: derivedSubscriptionStatus(sub),
        endDate: sub.endDate ? sub.endDate.toISOString() : null,
        daysLeft: subscriptionDaysLeft(sub.endDate),
      }
    : null

  const openInvoice: SubscriptionAccessInvoice | null = openInv
    ? {
        id: openInv.id,
        invoiceNumber: openInv.invoiceNumber,
        planName: openInv.planName,
        amount: openInv.amount,
        status: openInv.status,
        dueDate: openInv.dueDate.toISOString(),
      }
    : null

  const ok = (message: string): SubscriptionAccessInfo =>
    ({ allowed: true, reason: 'ok', message, subscription, openInvoice })
  const blocked = (reason: string, message: string): SubscriptionAccessInfo =>
    ({ allowed: false, reason, message, subscription, openInvoice })

  // Langganan berjalan (termasuk akan_berakhir & kedaluwarsa dalam masa tenggang —
  // kedaluwarsa keras tetap dikunci oleh cek validUntil/expiredDate di login &
  // verify-session) → aplikasi boleh digunakan, termasuk saat ada tagihan
  // perpanjangan/ganti paket yang sedang diproses.
  const accessAllowedStatuses: string[] = [SUB_STATUS.AKTIF, SUB_STATUS.AKAN_BERAKHIR, SUB_STATUS.KEDALUWARSA]
  if (subscription && accessAllowedStatuses.includes(subscription.status)) {
    return ok('Langganan aktif.')
  }

  if (subscription?.status === SUB_STATUS.DITANGGUHKAN) {
    return blocked(
      'ditangguhkan',
      'Langganan Anda ditangguhkan oleh admin. Hubungi administrator untuk mengaktifkan kembali.',
    )
  }
  if (subscription?.status === SUB_STATUS.DIBATALKAN) {
    return blocked(
      'dibatalkan',
      'Langganan Anda dibatalkan. Pilih paket kembali untuk mengaktifkan layanan.',
    )
  }

  // Belum aktif / belum pernah berlangganan → tergantung tagihan terbuka:
  if (openInvoice?.status === INVOICE_STATUS.MENUNGGU_VERIFIKASI) {
    return blocked(
      'menunggu_verifikasi',
      `Bukti pembayaran tagihan ${openInvoice.invoiceNumber} sudah diterima dan sedang diverifikasi admin. Aplikasi dapat digunakan setelah pembayaran disetujui.`,
    )
  }
  if (openInvoice?.status === INVOICE_STATUS.MENUNGGU_PEMBAYARAN) {
    return blocked(
      'menunggu_pembayaran',
      `Tagihan ${openInvoice.invoiceNumber} belum dibayar. Selesaikan pembayaran untuk mengaktifkan langganan Anda.`,
    )
  }
  if (openInvoice?.status === INVOICE_STATUS.DITOLAK) {
    return blocked(
      'ditolak',
      `Pembayaran untuk tagihan ${openInvoice.invoiceNumber} ditolak oleh admin. Silakan ajukan ulang pembayaran atau pilih paket lain.`,
    )
  }
  return blocked(
    'belum_pilih_paket',
    'Anda belum memiliki langganan aktif. Pilih paket untuk mulai menggunakan aplikasi.',
  )
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
