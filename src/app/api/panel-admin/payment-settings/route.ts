// Pengaturan Pembayaran (QRIS, rekening bank, instruksi, tenggang) — HANYA ADMIN.
// GET : baca pengaturan (QRIS image dikirim apa adanya — admin perlu melihatnya)
// PUT : simpan pengaturan (QRIS image data URL ≤500KB)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAdmin } from '@/lib/server-auth'
import { addAuditLog, getPaymentSettings } from '@/lib/subscription'

export const dynamic = 'force-dynamic'

const MAX_QRIS_BYTES = 500 * 1024

export async function GET(request: NextRequest) {
  const err = requireAdmin(request)
  if (err) return err
  try {
    const s = await getPaymentSettings()
    return NextResponse.json({ settings: s })
  } catch (error) {
    console.error('GET /api/panel-admin/payment-settings error:', error)
    return NextResponse.json({ error: 'Gagal memuat pengaturan' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const err = requireAdmin(request)
  if (err) return err
  try {
    const user = getServerUser(request)!
    const body = await request.json().catch(() => ({}))
    const data: Record<string, unknown> = {}

    if (body?.qrisImageUrl !== undefined) {
      const q = String(body.qrisImageUrl)
      if (q === '') {
        data.qrisImageUrl = ''
      } else {
        if (!q.startsWith('data:image/')) {
          return NextResponse.json({ error: 'Gambar QRIS harus berupa JPG/PNG' }, { status: 400 })
        }
        const b64 = q.slice(q.indexOf(',') + 1)
        const bytes = Math.floor((b64.length * 3) / 4)
        if (bytes > MAX_QRIS_BYTES) {
          return NextResponse.json({ error: `Ukuran gambar QRIS maksimal 500KB (±${Math.round(bytes / 1024)}KB)` }, { status: 400 })
        }
        data.qrisImageUrl = q
      }
    }
    if (body?.qrisReceiverName !== undefined) data.qrisReceiverName = String(body.qrisReceiverName).slice(0, 120)
    if (body?.bankName !== undefined) data.bankName = String(body.bankName).slice(0, 80)
    if (body?.bankAccountNumber !== undefined) data.bankAccountNumber = String(body.bankAccountNumber).slice(0, 40)
    if (body?.bankAccountName !== undefined) data.bankAccountName = String(body.bankAccountName).slice(0, 120)
    if (body?.paymentInstructions !== undefined) data.paymentInstructions = String(body.paymentInstructions).slice(0, 2000)
    if (body?.paymentDueHours !== undefined) data.paymentDueHours = Math.max(1, Math.min(720, Number(body.paymentDueHours) || 24))
    if (body?.gracePeriodDays !== undefined) data.gracePeriodDays = Math.max(0, Math.min(90, Number(body.gracePeriodDays) || 0))

    await getPaymentSettings() // pastikan row singleton ada
    const settings = await db.paymentSettings.update({ where: { key: 'default' }, data })
    await addAuditLog({ action: 'settings_updated', performedBy: user.id, notes: 'Pengaturan pembayaran diperbarui' })
    return NextResponse.json({ success: true, settings })
  } catch (error) {
    console.error('PUT /api/panel-admin/payment-settings error:', error)
    return NextResponse.json({ error: 'Gagal menyimpan pengaturan' }, { status: 500 })
  }
}
