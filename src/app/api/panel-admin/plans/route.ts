// CRUD Paket Langganan — HANYA ADMIN (requireAdmin).
// GET    : semua paket (termasuk non-aktif) + jumlah pelanggan per paket
// POST   : tambah paket baru
// PUT    : ubah paket (harga, perincian/fitur, batas, masa berlaku, status aktif, harga coret)
// DELETE : hapus paket (ditolak bila masih dipakai tagihan/langganan — nonaktifkan saja)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, isAdmin, requireAdmin } from '@/lib/server-auth'
import { addAuditLog, ensureSubscriptionSeeded } from '@/lib/subscription'

export const dynamic = 'force-dynamic'

function parseFeatures(features: unknown): string[] {
  if (Array.isArray(features)) return features.map((f) => String(f).trim()).filter(Boolean)
  if (typeof features === 'string') {
    try {
      const arr = JSON.parse(features)
      if (Array.isArray(arr)) return arr.map((f) => String(f).trim()).filter(Boolean)
    } catch { /* fallthrough */ }
    return features.split('\n').map((s) => s.trim()).filter(Boolean)
  }
  return []
}

export async function GET(request: NextRequest) {
  const err = requireAdmin(request)
  if (err) return err
  try {
    await ensureSubscriptionSeeded()
    const [plans, perPlanCounts] = await Promise.all([
      db.subscriptionPlan.findMany({ orderBy: { sortOrder: 'asc' } }),
      db.customerSubscription.groupBy({ by: ['planId'], _count: { _all: true } }),
    ])
    const countMap = new Map(perPlanCounts.map((c) => [c.planId, c._count._all]))
    return NextResponse.json({
      plans: plans.map((p) => ({
        ...p,
        features: JSON.parse(p.features || '[]'),
        activeSubscribers: countMap.get(p.id) ?? 0,
      })),
    })
  } catch (error) {
    console.error('GET /api/panel-admin/plans error:', error)
    return NextResponse.json({ error: 'Gagal memuat paket' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const err = requireAdmin(request)
  if (err) return err
  try {
    const user = getServerUser(request)!
    const body = await request.json().catch(() => ({}))
    const name = String(body?.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'Nama paket wajib diisi' }, { status: 400 })
    const monthlyPrice = Number(body?.monthlyPrice)
    if (!isFinite(monthlyPrice) || monthlyPrice < 0) {
      return NextResponse.json({ error: 'Harga bulanan tidak valid' }, { status: 400 })
    }
    const originalPriceRaw = body?.originalPrice === null || body?.originalPrice === '' ? null : Number(body?.originalPrice)
    const originalPrice = originalPriceRaw !== null && isFinite(originalPriceRaw) && originalPriceRaw > monthlyPrice ? originalPriceRaw : null
    const slugBase = String(body?.slug ?? name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `paket-${Date.now()}`
    const slugExists = await db.subscriptionPlan.findUnique({ where: { slug: slugBase } })
    const slug = slugExists ? `${slugBase}-${Math.random().toString(36).slice(2, 5)}` : slugBase
    const durationDays = Math.max(1, Math.min(3650, Number(body?.durationDays) || 30))
    const maxAccounts = Math.max(1, Number(body?.maxAccounts) || 1)

    const plan = await db.subscriptionPlan.create({
      data: {
        slug,
        name,
        description: String(body?.description ?? '').slice(0, 500),
        monthlyPrice,
        originalPrice,
        features: JSON.stringify(parseFeatures(body?.features)),
        maxAccounts,
        durationDays,
        isActive: body?.isActive !== false,
        isPopular: body?.isPopular === true,
        sortOrder: Number(body?.sortOrder) || 99,
      },
    })
    await addAuditLog({ action: 'plan_created', performedBy: user.id, notes: `Paket ${name} dibuat (Rp ${monthlyPrice.toLocaleString('id-ID')})` })
    return NextResponse.json({ success: true, plan: { ...plan, features: JSON.parse(plan.features || '[]') } })
  } catch (error) {
    console.error('POST /api/panel-admin/plans error:', error)
    return NextResponse.json({ error: 'Gagal menambah paket' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const err = requireAdmin(request)
  if (err) return err
  try {
    const user = getServerUser(request)!
    const body = await request.json().catch(() => ({}))
    const id = String(body?.id ?? '')
    if (!id) return NextResponse.json({ error: 'ID paket wajib' }, { status: 400 })
    const existing = await db.subscriptionPlan.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Paket tidak ditemukan' }, { status: 404 })

    const data: Record<string, unknown> = {}
    if (body?.name !== undefined) data.name = String(body.name).trim()
    if (body?.description !== undefined) data.description = String(body.description).slice(0, 500)
    if (body?.monthlyPrice !== undefined) {
      const mp = Number(body.monthlyPrice)
      if (!isFinite(mp) || mp < 0) return NextResponse.json({ error: 'Harga bulanan tidak valid' }, { status: 400 })
      data.monthlyPrice = mp
    }
    if (body?.originalPrice !== undefined) {
      const opRaw = body.originalPrice === null || body.originalPrice === '' ? null : Number(body.originalPrice)
      const mp = data.monthlyPrice !== undefined ? Number(data.monthlyPrice) : existing.monthlyPrice
      data.originalPrice = opRaw !== null && isFinite(opRaw) && opRaw > mp ? opRaw : null
    }
    if (body?.features !== undefined) data.features = JSON.stringify(parseFeatures(body.features))
    if (body?.maxAccounts !== undefined) data.maxAccounts = Math.max(1, Number(body.maxAccounts) || 1)
    if (body?.durationDays !== undefined) data.durationDays = Math.max(1, Math.min(3650, Number(body.durationDays) || 30))
    if (body?.isActive !== undefined) data.isActive = !!body.isActive
    if (body?.isPopular !== undefined) {
      data.isPopular = !!body.isPopular
      if (body.isPopular === true) {
        // hanya satu paket populer
        await db.subscriptionPlan.updateMany({ where: { isPopular: true }, data: { isPopular: false } })
      }
    }
    if (body?.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder) || 0

    const plan = await db.subscriptionPlan.update({ where: { id }, data })
    await addAuditLog({
      action: 'plan_updated',
      performedBy: user.id,
      notes: `Paket ${plan.name} diubah — harga ${existing.monthlyPrice} → ${plan.monthlyPrice}, aktif: ${plan.isActive}`,
    })
    return NextResponse.json({ success: true, plan: { ...plan, features: JSON.parse(plan.features || '[]') } })
  } catch (error) {
    console.error('PUT /api/panel-admin/plans error:', error)
    return NextResponse.json({ error: 'Gagal mengubah paket' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const err = requireAdmin(request)
  if (err) return err
  try {
    const user = getServerUser(request)!
    const id = new URL(request.url).searchParams.get('id') ?? ''
    if (!id) return NextResponse.json({ error: 'ID paket wajib' }, { status: 400 })
    const invoiceCount = await db.subscriptionInvoice.count({ where: { planId: id } })
    if (invoiceCount > 0) {
      // Paket punya riwayat tagihan — jangan hapus (nominal tagihan lama harus tetap konsisten)
      await db.subscriptionPlan.update({ where: { id }, data: { isActive: false } })
      await addAuditLog({ action: 'plan_updated', performedBy: user.id, notes: `Paket dinonaktifkan (masih dipakai ${invoiceCount} tagihan)` })
      return NextResponse.json({ success: true, deactivated: true, message: 'Paket memiliki riwayat tagihan — dinonaktifkan saja agar riwayat tetap konsisten.' })
    }
    await db.customerSubscription.updateMany({ where: { planId: id }, data: { planId: null } })
    const plan = await db.subscriptionPlan.delete({ where: { id } })
    await addAuditLog({ action: 'plan_updated', performedBy: user.id, notes: `Paket ${plan.name} dihapus` })
    return NextResponse.json({ success: true, deleted: true })
  } catch (error) {
    console.error('DELETE /api/panel-admin/plans error:', error)
    return NextResponse.json({ error: 'Gagal menghapus paket' }, { status: 500 })
  }
}
