import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server-auth'
import { ensurePaymentDefaults } from '@/lib/payment-manual'
import { sanitizeError } from '@/lib/api-error'

// GET /api/payment-manual/settings — info rekening & QRIS (publik, ditampilkan di checkout)
export async function GET() {
  try {
    await ensurePaymentDefaults()
    const settings = await db.paymentSetting.findFirst({ orderBy: { updatedAt: 'desc' } })
    return NextResponse.json({ settings })
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, 'Gagal memuat pengaturan pembayaran') }, { status: 500 })
  }
}

// PUT /api/payment-manual/settings — admin atur rekening / QRIS / petunjuk / batas waktu
export async function PUT(request: NextRequest) {
  try {
    const authErr = requireAdmin(request)
    if (authErr) return authErr

    const body = await request.json()
    const {
      bankName,
      accountName,
      accountNumber,
      qrisProviderName,
      qrisImageUrl,
      paymentInstructions,
      paymentDeadlineHours,
      bankTransferEnabled,
      qrisEnabled,
      isActive,
    } = body

    if (paymentDeadlineHours !== undefined && (Number(paymentDeadlineHours) < 1 || Number(paymentDeadlineHours) > 720)) {
      return NextResponse.json({ error: 'Batas waktu pembayaran harus 1–720 jam' }, { status: 400 })
    }

    let settings = await db.paymentSetting.findFirst({ orderBy: { updatedAt: 'desc' } })

    const data = {
      ...(bankName !== undefined ? { bankName: String(bankName) } : {}),
      ...(accountName !== undefined ? { accountName: String(accountName) } : {}),
      ...(accountNumber !== undefined ? { accountNumber: String(accountNumber) } : {}),
      ...(qrisProviderName !== undefined ? { qrisProviderName: String(qrisProviderName) } : {}),
      ...(qrisImageUrl !== undefined ? { qrisImageUrl: String(qrisImageUrl) } : {}),
      ...(paymentInstructions !== undefined ? { paymentInstructions: String(paymentInstructions) } : {}),
      ...(paymentDeadlineHours !== undefined ? { paymentDeadlineHours: Number(paymentDeadlineHours) } : {}),
      ...(bankTransferEnabled !== undefined ? { bankTransferEnabled: !!bankTransferEnabled } : {}),
      ...(qrisEnabled !== undefined ? { qrisEnabled: !!qrisEnabled } : {}),
      ...(isActive !== undefined ? { isActive: !!isActive } : {}),
    }

    if (settings) {
      settings = await db.paymentSetting.update({ where: { id: settings.id }, data })
    } else {
      settings = await db.paymentSetting.create({ data })
    }

    return NextResponse.json({ settings })
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, 'Gagal menyimpan pengaturan pembayaran') }, { status: 500 })
  }
}
