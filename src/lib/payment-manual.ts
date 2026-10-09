// /src/lib/payment-manual.ts
// Shared server helpers for the Manual Payment System (transfer bank / QRIS).
// Status pembayaran: UNPAID | WAITING_VERIFICATION | PAID | REJECTED | EXPIRED | CANCELLED
// Status langganan : ACTIVE | EXPIRED | CANCELLED | SUSPENDED

import { db } from '@/lib/db'

export const PAYMENT_STATUSES = ['UNPAID', 'WAITING_VERIFICATION', 'PAID', 'REJECTED', 'EXPIRED', 'CANCELLED'] as const
export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'EXPIRED', 'CANCELLED', 'SUSPENDED'] as const

export const MAX_PROOF_FILE_BYTES = 2 * 1024 * 1024 // 2MB
export const ALLOWED_PROOF_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']

/** Generate nomor transaksi unik: TRX-YYYYMMDD-XXXXXX */
export function generateTransactionNumber(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `TRX-${y}${m}${d}-${rand}`
}

/**
 * Seed default SubscriptionPlan + PaymentSetting (idempotent).
 * Harga & durasi TIDAK permanen di kode — admin bisa ubah via Pengaturan Paket.
 */
export async function ensurePaymentDefaults(): Promise<void> {
  try {
    const planCount = await db.subscriptionPlan.count()
    if (planCount === 0) {
      // Guard race: hanya instance pertama yang berhasil insert paket pertama.
      // Jika instance lain sudah seed, langsung kembali.
      try {
        await db.subscriptionPlan.create({ data: { planName: 'Bulanan Ekonomis', price: 78000, durationMonths: 1, maxAccounts: 1, features: JSON.stringify(['Hitung ongkos cetak', 'Master harga kertas', 'Hitung finishing', 'Potong kertas', 'Maksimal 1 akun pengguna']), sortOrder: 1 } })
      } catch {
        return // sudah dibuat instance lain
      }
      await db.subscriptionPlan.createMany({
        data: [
          {
            planName: 'Bulanan',
            price: 128000,
            durationMonths: 1,
            maxAccounts: 2,
            discountPercent: 0,
            features: JSON.stringify([
              'Hitung ongkos cetak',
              'Master harga kertas',
              'Hitung finishing',
              'Potong kertas',
              'Riwayat cetakan',
              '2 akun pengguna',
            ]),
            sortOrder: 2,
          },
          {
            planName: '3 Bulanan',
            price: 357000,
            durationMonths: 3,
            maxAccounts: 2,
            discountPercent: 7,
            features: JSON.stringify([
              'Semua fitur Bulanan',
              '2 akun pengguna',
              'Hemat 7%',
            ]),
            sortOrder: 3,
          },
          {
            planName: '6 Bulanan',
            price: 648000,
            durationMonths: 6,
            maxAccounts: 2,
            discountPercent: 16,
            features: JSON.stringify([
              'Semua fitur Bulanan',
              '2 akun pengguna',
              'Hemat 16%',
            ]),
            sortOrder: 4,
          },
          {
            planName: 'Tahunan',
            price: 888000,
            durationMonths: 12,
            maxAccounts: 2,
            discountPercent: 42,
            features: JSON.stringify([
              'Semua fitur akuntansi lengkap',
              'Multi perangkat',
              'Master customer',
              'Laporan penjualan POS',
              'Priority support',
              'Hemat 42%',
            ]),
            sortOrder: 5,
          },
        ],
      })
      console.log('🌱 SubscriptionPlan seeded (5 paket default)')
    }

    const settingCount = await db.paymentSetting.count()
    if (settingCount === 0) {
      await db.paymentSetting.create({
        data: {
          bankName: 'Bank BCA',
          accountName: 'Darrell Soft',
          accountNumber: '1234567890',
          qrisProviderName: 'QRIS Darrell Soft',
          paymentInstructions:
            'Silakan transfer sesuai nominal yang tertera. Setelah transfer, unggah bukti pembayaran untuk diverifikasi oleh admin Darrellsoft.',
          paymentDeadlineHours: 24,
          bankTransferEnabled: true,
          qrisEnabled: true,
        },
      })
      console.log('🌱 PaymentSetting seeded (default)')
    }
  } catch (err) {
    console.error('ensurePaymentDefaults error:', err)
  }
}

/**
 * Buat notifikasi in-app (tabel Notification).
 * userId '' = notifikasi untuk semua admin.
 * Juga kirim email best-effort jika address tersedia dan SMTP terkonfigurasi.
 */
export async function createPaymentNotification(opts: {
  userId?: string
  title: string
  message?: string
  type?: 'info' | 'success' | 'warning' | 'error'
  link?: string
  emailTo?: string
}): Promise<void> {
  try {
    await db.notification.create({
      data: {
        userId: opts.userId ?? '',
        title: opts.title,
        message: opts.message ?? '',
        type: opts.type ?? 'info',
        link: opts.link ?? '',
      },
    })
  } catch (err) {
    console.error('createPaymentNotification (db) error:', err)
  }

  if (opts.emailTo) {
    try {
      const { sendEmail } = await import('@/lib/email')
      await sendEmail({
        to: opts.emailTo,
        subject: opts.title,
        html: `<p>${opts.message || opts.title}</p>`,
      })
    } catch {
      // Email opsional — gagal diam (SMTP belum dikonfigurasi)
    }
  }
}

/**
 * Hitung status efektif transaksi: UNPAID yang melewati expiresAt → EXPIRED.
 * Memperbarui record jika berubah (lazy expiry).
 */
export function effectivePaymentStatus(tx: { paymentStatus: string; expiresAt: Date }): string {
  if (tx.paymentStatus === 'UNPAID' && tx.expiresAt.getTime() < Date.now()) {
    return 'EXPIRED'
  }
  return tx.paymentStatus
}

/** Tandai transaksi UNPAID yang sudah lewat batas waktu sebagai EXPIRED (lazy). */
export async function expireStaleTransactions(): Promise<void> {
  try {
    await db.paymentTransaction.updateMany({
      where: { paymentStatus: 'UNPAID', expiresAt: { lt: new Date() } },
      data: { paymentStatus: 'EXPIRED' },
    })
    await db.userSubscription.updateMany({
      where: { subscriptionStatus: 'ACTIVE', endDate: { lt: new Date() } },
      data: { subscriptionStatus: 'EXPIRED' },
    })
  } catch (err) {
    console.error('expireStaleTransactions error:', err)
  }
}

/** Format Rupiah sederhana (server log / pesan) */
export function formatRupiah(value: number): string {
  return 'Rp ' + Math.round(value).toLocaleString('id-ID')
}
