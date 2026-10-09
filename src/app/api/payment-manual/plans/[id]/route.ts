import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

// PUT /api/payment-manual/plans/[id] — admin edit paket
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authErr = requireAdmin(request)
    if (authErr) return authErr

    const { id } = await params
    const body = await request.json()
    const { planName, price, durationMonths, maxAccounts, discountPercent, features, isActive, sortOrder } = body

    const existing = await db.subscriptionPlan.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Paket tidak ditemukan' }, { status: 404 })
    }

    const plan = await db.subscriptionPlan.update({
      where: { id },
      data: {
        ...(planName !== undefined ? { planName: String(planName).trim() } : {}),
        ...(price !== undefined ? { price: Number(price) } : {}),
        ...(durationMonths !== undefined ? { durationMonths: Number(durationMonths) } : {}),
        ...(maxAccounts !== undefined ? { maxAccounts: Number(maxAccounts) } : {}),
        ...(discountPercent !== undefined ? { discountPercent: Number(discountPercent) } : {}),
        ...(features !== undefined ? { features: JSON.stringify(Array.isArray(features) ? features : []) } : {}),
        ...(isActive !== undefined ? { isActive: !!isActive } : {}),
        ...(sortOrder !== undefined ? { sortOrder: Number(sortOrder) } : {}),
      },
    })

    return NextResponse.json({ plan })
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, 'Gagal mengubah paket') }, { status: 500 })
  }
}

// DELETE /api/payment-manual/plans/[id] — admin hapus paket (blokir jika masih dipakai transaksi)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authErr = requireAdmin(request)
    if (authErr) return authErr

    const { id } = await params

    const usedCount = await db.paymentTransaction.count({ where: { subscriptionPlanId: id } })
    if (usedCount > 0) {
      // Jangan hancurkan riwayat transaksi — nonaktifkan saja
      await db.subscriptionPlan.update({ where: { id }, data: { isActive: false } })
      return NextResponse.json({
        success: true,
        deactivated: true,
        message: 'Paket sudah dipakai transaksi, sehingga dinonaktifkan (bukan dihapus)',
      })
    }

    await db.subscriptionPlan.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, 'Gagal menghapus paket') }, { status: 500 })
  }
}
