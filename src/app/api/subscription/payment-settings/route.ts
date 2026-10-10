// GET  /api/subscription/payment-settings — PUBLIC: info QRIS & rekening tujuan pembayaran.
// PUT  (di /api/panel-admin/payment-settings) — hanya admin.
import { NextResponse } from 'next/server'
import { getPaymentSettings } from '@/lib/subscription'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const s = await getPaymentSettings()
    return NextResponse.json({
      qrisImageUrl: s.qrisImageUrl,
      qrisReceiverName: s.qrisReceiverName,
      bankName: s.bankName,
      bankAccountNumber: s.bankAccountNumber,
      bankAccountName: s.bankAccountName,
      paymentInstructions: s.paymentInstructions,
      paymentDueHours: s.paymentDueHours,
      gracePeriodDays: s.gracePeriodDays,
    })
  } catch (error) {
    console.error('GET /api/subscription/payment-settings error:', error)
    return NextResponse.json({ error: 'Gagal memuat pengaturan pembayaran' }, { status: 500 })
  }
}
