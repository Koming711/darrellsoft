// POST /api/subscription/invoice — buat tagihan langganan untuk paket pilihan user login.
// KEAMANAN:
// - Nominal tagihan dihitung SERVER dari DB (bukan dari browser) — beku saat dibuat.
//   Nominal final = harga paket + kode unik 3 digit (001–999) untuk membedakan transfer.
// - Cegah tagihan ganda: 1 tagihan terbuka per (user, plan) — diperiksa DI DALAM
//   transaksi DB sehingga tombol ditekan berulang / request bersamaan tetap aman.
// - Cegah tagihan untuk paket non-aktif.
// - Tagihan menunggu_pembayaran yang sudah lewat dueDate otomatis ditandai
//   kedaluwarsa → pelanggan bisa membuat tagihan baru.
// - Paket Trial: dicegah diambil dua kali oleh akun yang sama (anti abuse).
// - Paket gratis (harga 0): langsung diaktifkan tanpa pembayaran, status aktif
//   dengan tanggal kedaluwarsa jelas — tetap tercatat sebagai TRIAL (role demo
//   tidak dipromosikan seperti pembayaran berbayar).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser } from '@/lib/server-auth'
import {
  getOrCreateSubscription,
  getPaymentSettings,
  generateUniqueInvoiceNumber,
  allocateUniqueCode,
  addAuditLog,
  addNotification,
  setAccessValidUntil,
  INVOICE_STATUS,
  SUB_STATUS,
} from '@/lib/subscription'

export const dynamic = 'force-dynamic'

const OPEN_STATUSES = [INVOICE_STATUS.MENUNGGU_PEMBAYARAN, INVOICE_STATUS.MENUNGGU_VERIFIKASI]

export async function POST(request: NextRequest) {
  try {
    const user = getServerUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Anda harus login terlebih dahulu' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const planId = typeof body?.planId === 'string' ? body.planId : ''
    if (!planId) {
      return NextResponse.json({ error: 'Paket belum dipilih' }, { status: 400 })
    }

    const plan = await db.subscriptionPlan.findUnique({ where: { id: planId } })
    if (!plan || !plan.isActive) {
      return NextResponse.json({ error: 'Paket tidak tersedia atau tidak aktif' }, { status: 400 })
    }

    const settings = await getPaymentSettings()
    const now = new Date()
    const dueDate = new Date(now.getTime() + (settings.paymentDueHours || 24) * 3600_000)

    const sub = await getOrCreateSubscription(user.id)
    const isPlanChange = !!sub.planId && sub.planId !== plan.id
    const invoiceNumber = await generateUniqueInvoiceNumber()

    // ===== TRANSAKSI: kadaluarsakan tagihan lama → dedupe → trial → buat tagihan =====
    const result = await db.$transaction(async (tx) => {
      // 1. Tagihan menunggu_pembayaran yang sudah lewat batas waktu → kedaluwarsa (persist),
      //    supaya pelanggan bisa membuat tagihan baru (alur tagihan kedaluwarsa).
      await tx.subscriptionInvoice.updateMany({
        where: {
          userId: user.id,
          status: INVOICE_STATUS.MENUNGGU_PEMBAYARAN,
          dueDate: { lt: now },
        },
        data: { status: INVOICE_STATUS.KEDALUWARSA },
      })

      // 2. Cegah tagihan ganda untuk paket yang sama (di dalam tx — anti double-click/race)
      const openInvoice = await tx.subscriptionInvoice.findFirst({
        where: {
          userId: user.id,
          planId,
          status: { in: OPEN_STATUSES },
        },
        orderBy: { createdAt: 'desc' },
      })
      if (openInvoice) {
        return { conflict: openInvoice }
      }

      // 3. Kelayakan Trial — satu akun hanya sekali memakai paket Trial
      if (plan.slug === 'trial') {
        const [trialSub, trialPaidInvoice] = await Promise.all([
          tx.customerSubscription.findFirst({
            where: { userId: user.id, planId: plan.id, status: { notIn: [SUB_STATUS.BELUM_AKTIF, SUB_STATUS.DIBATALKAN] } },
            select: { id: true },
          }),
          tx.subscriptionInvoice.findFirst({
            where: { userId: user.id, planId: plan.id, status: INVOICE_STATUS.DISETUJUI },
            select: { id: true },
          }),
        ])
        if (trialSub || trialPaidInvoice) {
          return { trialUsed: true as const }
        }
      }

      const snapshot = {
        name: plan.name,
        slug: plan.slug,
        features: JSON.parse(plan.features || '[]'),
        durationDays: plan.durationDays,
        maxAccounts: plan.maxAccounts,
      }

      // ===== 4A. Paket GRATIS (harga 0) → aktifkan langsung tanpa pembayaran =====
      if (plan.monthlyPrice <= 0) {
        const freeInvoice = await tx.subscriptionInvoice.create({
          data: {
            invoiceNumber,
            userId: user.id,
            planId: plan.id,
            subscriptionId: sub.id,
            planName: plan.name,
            amount: 0,
            uniqueCode: null,
            originalPrice: plan.originalPrice,
            planSnapshot: JSON.stringify(snapshot),
            status: INVOICE_STATUS.DISETUJUI,
            dueDate,
            billingPeriodStart: now,
            billingPeriodEnd: new Date(now.getTime() + plan.durationDays * 24 * 3600_000),
            isPlanChange,
          },
        })
        const newEnd = new Date(now.getTime() + plan.durationDays * 24 * 3600_000)
        await tx.customerSubscription.update({
          where: { id: sub.id },
          data: {
            status: SUB_STATUS.AKTIF,
            planId: plan.id,
            startDate: now,
            endDate: newEnd,
          },
        })
        // Akses akun mengikuti masa trial (mendukung akun CalonPembeli & Pengguna)
        await setAccessValidUntil(tx, user.id, newEnd)
        return { invoice: freeInvoice, freeActivated: true as const }
      }

      // ===== 4B. Paket berbayar → alokasi kode unik + nominal final beku =====
      const uniqueCode = await allocateUniqueCode(tx)
      const amount = plan.monthlyPrice + (uniqueCode ?? 0)

      const invoice = await tx.subscriptionInvoice.create({
        data: {
          invoiceNumber,
          userId: user.id,
          planId: plan.id,
          subscriptionId: sub.id,
          planName: plan.name,
          amount, // BEKU = harga + kode unik — tidak ikut perubahan harga paket
          uniqueCode,
          originalPrice: plan.originalPrice,
          planSnapshot: JSON.stringify(snapshot),
          status: INVOICE_STATUS.MENUNGGU_PEMBAYARAN,
          dueDate,
          isPlanChange,
        },
      })

      // Status langganan masih belum_aktif → tetap belum_aktif; aktif hanya via approval admin.
      if (sub.status === SUB_STATUS.BELUM_AKTIF) {
        await tx.customerSubscription.update({
          where: { id: sub.id },
          data: { status: SUB_STATUS.BELUM_AKTIF },
        })
      }

      return { invoice }
    })

    // ===== Tagihan ganda → arahkan ke tagihan terbuka yang ada =====
    if ('conflict' in result && result.conflict) {
      return NextResponse.json(
        {
          error: `Masih ada tagihan terbuka untuk paket ${result.conflict.planName} (${result.conflict.invoiceNumber}). Selesaikan atau tunggu verifikasi tagihan tersebut.`,
          existingInvoiceId: result.conflict.id,
        },
        { status: 409 },
      )
    }

    if ('trialUsed' in result && result.trialUsed) {
      return NextResponse.json(
        { error: 'Paket Trial hanya dapat dipilih satu kali untuk setiap akun. Silakan pilih paket berbayar untuk melanjutkan.' },
        { status: 403 },
      )
    }

    const invoice = result.invoice!

    // ===== Audit + notifikasi (non-fatal, di luar transaksi) =====
    await addAuditLog({
      userId: user.id,
      subscriptionId: sub.id,
      invoiceId: invoice.id,
      action: 'invoice_created',
      newStatus: invoice.status,
      performedBy: user.id,
      notes: `Tagihan ${invoiceNumber} — ${plan.name} Rp ${invoice.amount.toLocaleString('id-ID')}${typeof invoice.uniqueCode === 'number' ? ` (kode unik ${String(invoice.uniqueCode).padStart(3, '0')})` : ''}${isPlanChange ? ' (ganti paket)' : ''}`,
    })

    if ('freeActivated' in result && result.freeActivated) {
      // Trial gratis aktif tanpa pembayaran
      await addAuditLog({
        userId: user.id,
        subscriptionId: sub.id,
        invoiceId: invoice.id,
        action: 'subscription_activated',
        oldStatus: sub.status,
        newStatus: SUB_STATUS.AKTIF,
        performedBy: 'system',
        notes: `Paket gratis/trial ${plan.name} diaktifkan otomatis — berlaku ${plan.durationDays} hari (tanpa pembayaran).`,
      })
      await addNotification({
        userId: user.id,
        title: 'Trial Aktif',
        body: `Paket ${plan.name} gratis telah aktif — berlaku ${plan.durationDays} hari sampai ${new Date(invoice.billingPeriodEnd || dueDate).toLocaleDateString('id-ID')}.`,
        type: 'subscription',
        link: '/langganan-saya',
      })
      await addNotification({
        userId: '',
        title: 'Trial Gratis Dimulai',
        body: `${user.id} memulai paket gratis ${plan.name} (${plan.durationDays} hari).`,
        type: 'subscription',
        link: '/panel-admin/pelanggan',
      })
    } else {
      // Notifikasi untuk admin (userId="" = broadcast admin)
      await addNotification({
        userId: '',
        title: 'Tagihan Baru Dibuat',
        body: `Tagihan ${invoiceNumber} — paket ${plan.name}. Menunggu pembayaran pelanggan.`,
        type: 'payment',
        link: '/panel-admin/pembayaran?tab=verifikasi',
      })
    }

    return NextResponse.json({
      success: true,
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount,
        basePrice: plan.monthlyPrice,
        uniqueCode: invoice.uniqueCode,
        originalPrice: invoice.originalPrice,
        planName: invoice.planName,
        status: invoice.status,
        dueDate: invoice.dueDate,
        isPlanChange: invoice.isPlanChange,
        freeActivated: 'freeActivated' in result && result.freeActivated,
      },
    })
  } catch (error) {
    console.error('POST /api/subscription/invoice error:', error)
    return NextResponse.json({ error: 'Gagal membuat tagihan' }, { status: 500 })
  }
}
