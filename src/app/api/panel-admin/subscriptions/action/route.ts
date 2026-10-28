// POST /api/panel-admin/subscriptions/action — admin aktifkan / tangguhkan / aktifkan kembali akun.
// Body: { userId, action: 'activate'|'suspend'|'unsuspend', planId?, durationDays?, notes }
// activate  → aktivasi manual akun belum aktif: set paket + masa berlaku (hari), buka akses
// suspend → langganan ditangguhkan + Pengguna.validUntil dikunci (akses langsung terkunci)
// unsuspend → status dipulihkan sesuai tanggal + validUntil = endDate + masa tenggang
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAdmin } from '@/lib/server-auth'
import {
  addAuditLog,
  addNotification,
  findCustomerById,
  formatDate,
  getOrCreateSubscription,
  getPaymentSettings,
  setAccessValidUntil,
  SUB_STATUS,
  derivedSubscriptionStatus,
} from '@/lib/subscription'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const err = requireAdmin(request)
  if (err) return err
  try {
    const admin = getServerUser(request)!
    const adminRow = await db.pengguna.findUnique({ where: { id: admin.id }, select: { username: true } })
    const adminUsername = adminRow?.username || admin.id

    const body = await request.json().catch(() => ({}))
    const userId = String(body?.userId ?? '')
    const action = String(body?.action ?? '')
    const notes = String(body?.notes ?? '').slice(0, 500)

    if (!userId) return NextResponse.json({ error: 'userId wajib' }, { status: 400 })
    if (action !== 'activate' && action !== 'suspend' && action !== 'unsuspend') {
      return NextResponse.json({ error: "action harus 'activate', 'suspend', atau 'unsuspend'" }, { status: 400 })
    }
    if (action === 'suspend' && !notes.trim()) {
      return NextResponse.json({ error: 'Alasan penangguhan wajib diisi (catatan audit)' }, { status: 400 })
    }
    // Blokir aksi ke akun sendiri HANYA untuk suspend/unsuspend — aktivasi akun sendiri
    // (mis. superadmin mengaktifkan akunnya sendiri) sengaja diperbolehkan.
    if (userId === admin.id && action !== 'activate') {
      return NextResponse.json({ error: 'Tidak bisa menangguhkan akun sendiri' }, { status: 400 })
    }

    // Target bisa Pengguna ATAU CalonPembeli (pendaftaran mandiri)
    const target = await findCustomerById(userId)
    if (!target) return NextResponse.json({ error: 'Akun tidak ditemukan' }, { status: 404 })

    const settings = await getPaymentSettings()
    const graceDays = settings.gracePeriodDays ?? 7
    const sub = await getOrCreateSubscription(userId)
    const DAY_MS = 86_400_000

    // ---- AKTIVASI MANUAL (akun belum aktif) ----
    // Admin memilih paket + masa berlaku (hari). Status → aktif, akses dibuka s/d endDate + tenggang.
    if (action === 'activate') {
      const planId = String(body?.planId ?? '').trim()
      const durationRaw = Number(body?.durationDays)
      const plan = planId ? await db.subscriptionPlan.findUnique({ where: { id: planId } }) : null
      if (planId && !plan) return NextResponse.json({ error: 'Paket tidak ditemukan' }, { status: 400 })

      const durationDays =
        Number.isFinite(durationRaw) && durationRaw > 0 ? Math.floor(durationRaw) : plan?.durationDays ?? 30
      const now = new Date()
      const newEnd = new Date(now.getTime() + durationDays * DAY_MS)
      const graceEnd = new Date(newEnd.getTime() + graceDays * DAY_MS)
      const oldStatus = derivedSubscriptionStatus(sub)

      await db.customerSubscription.update({
        where: { id: sub.id },
        data: {
          status: SUB_STATUS.AKTIF,
          planId: plan?.id ?? sub.planId,
          startDate: now,
          endDate: newEnd,
          suspendReason: '',
        },
      })
      await setAccessValidUntil(db, userId, graceEnd)
      await addAuditLog({
        userId,
        subscriptionId: sub.id,
        action: 'subscription_activated',
        oldStatus,
        newStatus: SUB_STATUS.AKTIF,
        performedBy: adminUsername,
        notes:
          notes ||
          `Aktivasi manual${plan ? ` — paket ${plan.name}` : ''}, berlaku ${durationDays} hari s/d ${formatDate(newEnd)}`,
      })
      await addNotification({
        userId,
        title: 'Langganan Diaktifkan',
        body: `Langganan Anda telah diaktifkan oleh admin${plan ? ` — paket ${plan.name}` : ''}. Berlaku ${durationDays} hari hingga ${formatDate(newEnd)}.`,
        type: 'subscription',
        link: '/langganan-saya',
      })
      return NextResponse.json({
        success: true,
        message: `Langganan diaktifkan${plan ? ` — paket ${plan.name}` : ''}, berlaku s/d ${formatDate(newEnd)}.`,
      })
    }

    if (action === 'suspend') {
      const oldStatus = derivedSubscriptionStatus(sub)
      await db.customerSubscription.update({
        where: { id: sub.id },
        data: { status: SUB_STATUS.DITANGGUHKAN, suspendReason: notes },
      })
      // Kunci akses segera (Pengguna.validUntil / CalonPembeli.expiredDate)
      await setAccessValidUntil(db, userId, new Date(Date.now() - DAY_MS))
      await addAuditLog({
        userId,
        subscriptionId: sub.id,
        action: 'subscription_suspended',
        oldStatus,
        newStatus: SUB_STATUS.DITANGGUHKAN,
        performedBy: adminUsername,
        notes,
      })
      await addNotification({
        userId,
        title: 'Langganan Ditangguhkan',
        body: `Langganan Anda ditangguhkan oleh admin. Alasan: ${notes}. Hubungi admin untuk aktivasi kembali.`,
        type: 'subscription',
        link: '/langganan-saya',
      })
      return NextResponse.json({ success: true, message: 'Langganan ditangguhkan.' })
    }

    // unsuspend → pulihkan status sesuai tanggal
    const restoredStatus = sub.endDate
      ? derivedSubscriptionStatus({ status: SUB_STATUS.AKTIF, endDate: sub.endDate })
      : SUB_STATUS.BELUM_AKTIF
    const validUntil =
      sub.endDate && restoredStatus === SUB_STATUS.AKTIF
        ? new Date(new Date(sub.endDate).getTime() + graceDays * DAY_MS)
        : sub.endDate

    await db.customerSubscription.update({
      where: { id: sub.id },
      data: { status: restoredStatus, suspendReason: '' },
    })
    if (validUntil) {
      await setAccessValidUntil(db, userId, validUntil)
    }
    await addAuditLog({
      userId,
      subscriptionId: sub.id,
      action: 'subscription_unsuspended',
      oldStatus: SUB_STATUS.DITANGGUHKAN,
      newStatus: restoredStatus,
      performedBy: adminUsername,
      notes: notes || `Diaktifkan kembali — langganan berlaku hingga ${formatDate(sub.endDate)}`,
    })
    await addNotification({
      userId,
      title: 'Langganan Diaktifkan Kembali',
      body: `Langganan Anda telah diaktifkan kembali oleh admin. Berlaku hingga ${formatDate(sub.endDate)}.`,
      type: 'subscription',
      link: '/langganan-saya',
    })
    return NextResponse.json({ success: true, message: 'Langganan diaktifkan kembali.' })
  } catch (error) {
    console.error('POST /api/panel-admin/subscriptions/action error:', error)
    return NextResponse.json({ error: 'Gagal memproses aksi langganan' }, { status: 500 })
  }
}
