import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getServerUser, isAdmin } from '@/lib/server-auth'
import { sendSecurityNotifications } from '@/lib/device-session'
import { invalidateDeviceGateCache } from '@/lib/device-gate-cache'

/**
 * API Manajemen Perangkat (Panel Admin — Login 1 Perangkat).
 *
 * GET    : daftar sesi perangkat aktif + riwayat sesi + riwayat login ditolak
 *          + statistik ringkas.
 * POST   : cabut sesi perangkat (action: 'revoke' | 'reset') — setelah dicabut,
 *          akun otomatis dapat login kembali di perangkat mana pun (akses
 *          terbuka). Setiap tindakan admin tercatat di AuditLog + notifikasi
 *          keamanan ke pemilik akun dan broadcast admin.
 * DELETE : hapus CATATAN (riwayat sesi non-aktif / catatan login ditolak) dari
 *          daftar — pembersihan data, TIDAK mengubah sesi aktif. Setiap hapus
 *          juga tercatat di AuditLog.
 */

function serializeSession(s: {
  id: string
  userId: string
  username: string
  userRole: string
  deviceName: string
  deviceType: string
  browser: string
  os: string
  loginAt: Date
  lastActivityAt: Date
  status: string
  logoutAt: Date | null
  revokedBy: string
}) {
  return {
    id: s.id,
    userId: s.userId,
    username: s.username,
    userRole: s.userRole,
    deviceName: s.deviceName,
    deviceType: s.deviceType,
    browser: s.browser,
    os: s.os,
    loginAt: s.loginAt,
    lastActivityAt: s.lastActivityAt,
    status: s.status,
    logoutAt: s.logoutAt,
    revokedBy: s.revokedBy,
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    if (!user || !isAdmin(user.role)) {
      return NextResponse.json({ error: 'Akses ditolak. Hanya admin yang dapat mengakses.' }, { status: 403 })
    }

    // Spec §6: riwayat pergantian perangkat + audit setiap tindakan admin.
    // view=audit → baris AuditLog utk aksi perangkat (device_revoke/device_reset).
    const view = request.nextUrl.searchParams.get('view')
    if (view === 'audit') {
      const logs = await db.auditLog.findMany({
        where: { aksi: { in: ['device_revoke', 'device_reset', 'device_takeover', 'device_session_delete', 'device_attempt_delete'] } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
      const userIds = Array.from(new Set(logs.map((l) => JSON.parse(l.detail || '{}').targetUserId).filter(Boolean)))
      const [penggunas, calons] = await Promise.all([
        db.pengguna.findMany({ where: { id: { in: userIds } }, select: { id: true, namaLengkap: true } }),
        db.calonPembeli.findMany({ where: { id: { in: userIds } }, select: { id: true, nama: true } }),
      ])
      const namaMap = new Map<string, string>()
      for (const p of penggunas) namaMap.set(p.id, p.namaLengkap)
      for (const c of calons) if (!namaMap.has(c.id)) namaMap.set(c.id, c.nama)
      return NextResponse.json(
        {
          audit: logs.map((l) => {
            let detail: Record<string, unknown> = {}
            try {
              detail = JSON.parse(l.detail || '{}')
            } catch {}
            const targetUserId = typeof detail.targetUserId === 'string' ? detail.targetUserId : ''
            return {
              id: l.id,
              aksi: l.aksi,
              aktorNama: l.aktorNama,
              createdAt: l.createdAt,
              targetUsername: typeof detail.targetUsername === 'string' ? detail.targetUsername : '',
              akunNama: namaMap.get(targetUserId) || '',
              deviceName: typeof detail.deviceName === 'string' ? detail.deviceName : '',
            }
          }),
        },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      )
    }

    const [active, history, attempts, revoked24h] = await Promise.all([
      db.deviceSession.findMany({
        where: { status: 'active' },
        orderBy: { lastActivityAt: 'desc' },
        take: 200,
      }),
      db.deviceSession.findMany({
        where: { status: { not: 'active' } },
        orderBy: { logoutAt: 'desc' },
        take: 100,
      }),
      db.deviceLoginAttempt.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      db.deviceLoginAttempt.count({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }),
    ])

    // Perkaya nama tampilan akun (Pengguna → namaLengkap; CalonPembeli → nama).
    const userIds = Array.from(new Set([...active, ...history].map((s) => s.userId)))
    const [penggunas, calons] = await Promise.all([
      db.pengguna.findMany({
        where: { id: { in: userIds } },
        select: { id: true, namaLengkap: true },
      }),
      db.calonPembeli.findMany({
        where: { id: { in: userIds } },
        select: { id: true, nama: true },
      }),
    ])
    const namaMap = new Map<string, string>()
    for (const p of penggunas) namaMap.set(p.id, p.namaLengkap)
    for (const c of calons) if (!namaMap.has(c.id)) namaMap.set(c.id, c.nama)

    const enrich = (list: ReturnType<typeof serializeSession>[]) =>
      list.map((s) => ({ ...s, akunNama: namaMap.get(s.userId) || '' }))

    return NextResponse.json({
      active: enrich(active.map(serializeSession)),
      history: enrich(history.map(serializeSession)),
      attempts: attempts.map((a) => ({
        id: a.id,
        userId: a.userId,
        username: a.username,
        deviceName: a.deviceName,
        deviceType: a.deviceType,
        browser: a.browser,
        os: a.os,
        reason: a.reason,
        createdAt: a.createdAt,
      })),
      stats: {
        activeCount: active.length,
        revokedCount: history.filter((s) => s.status === 'revoked').length,
        attempts24h: revoked24h,
      },
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    console.error('GET device-sessions error:', error)
    return NextResponse.json({ error: 'Gagal memuat data perangkat' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = getServerUser(request)
    if (!admin || !isAdmin(admin.role)) {
      return NextResponse.json({ error: 'Akses ditolak. Hanya admin yang dapat mencabut sesi perangkat.' }, { status: 403 })
    }

    const { sessionId, action } = await request.json()
    if (!sessionId || (action !== 'revoke' && action !== 'reset')) {
      return NextResponse.json({ error: 'Data tidak lengkap. Diperlukan sessionId dan action (revoke/reset).' }, { status: 400 })
    }

    const session = await db.deviceSession.findUnique({ where: { id: sessionId } })
    if (!session) {
      return NextResponse.json({ error: 'Sesi perangkat tidak ditemukan.' }, { status: 404 })
    }
    if (session.status !== 'active') {
      return NextResponse.json({ error: 'Sesi perangkat ini sudah tidak aktif.' }, { status: 400 })
    }

    const now = new Date()
    await db.$transaction([
      db.deviceSession.update({
        where: { id: session.id },
        data: { status: 'revoked', logoutAt: now, revokedBy: admin.id },
      }),
      // Audit log: setiap tindakan admin tercatat.
      db.auditLog.create({
        data: {
          grupId: null,
          aktorId: admin.id,
          aktorNama: admin.id,
          aksi: action === 'reset' ? 'device_reset' : 'device_revoke',
          detail: JSON.stringify({
            sessionId: session.id,
            targetUserId: session.userId,
            targetUsername: session.username,
            deviceName: session.deviceName,
            deviceType: session.deviceType,
            browser: session.browser,
            os: session.os,
            loginAt: session.loginAt,
            revokedAt: now,
          }),
        },
      }),
    ])

    // Notifikasi keamanan: pemilik akun + broadcast admin (popup in-app + riwayat).
    await sendSecurityNotifications({
      userId: session.userId,
      type: action === 'reset' ? 'device_reset' : 'device_revoked',
      title: action === 'reset' ? 'Reset Perangkat oleh Administrator' : 'Sesi Perangkat Dicabut',
      body:
        `${action === 'reset' ? 'Administrator telah melakukan RESET PERANGKAT' : 'Sesi perangkat Anda telah dicabut oleh administrator'} untuk akun "${session.username}".\n\n` +
        `Perangkat: ${session.deviceName}\nWaktu: ${now.toLocaleString('id-ID')}\n\n` +
        `Akses login kini terbuka — silakan login kembali dari perangkat Anda. ` +
        `Jika ini bukan Anda, segera hubungi administrator.`,
    })

    // Spec §4/§5: pencabutan efektif SEKETIKA di lapisan API — buang verdict
    // cache device-gate utk akun terkait (tanpa menunggu TTL 30 detik).
    invalidateDeviceGateCache(session.userId)

    return NextResponse.json({ success: true, message: 'Sesi perangkat berhasil dicabut. Akun dapat login kembali di perangkat lain.' })
  } catch (error) {
    console.error('POST device-sessions error:', error)
    return NextResponse.json({ error: 'Gagal mencabut sesi perangkat' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = getServerUser(request)
    if (!admin || !isAdmin(admin.role)) {
      return NextResponse.json({ error: 'Akses ditolak. Hanya admin yang dapat menghapus catatan perangkat.' }, { status: 403 })
    }

    const { type, id } = await request.json()
    if ((type !== 'session' && type !== 'attempt') || !id) {
      return NextResponse.json({ error: 'Data tidak lengkap. Diperlukan type (session/attempt) dan id.' }, { status: 400 })
    }

    if (type === 'session') {
      // HANYA sesi non-aktif yang boleh dihapus — sesi aktif harus lewat
      // Cabut Sesi / Reset dulu (menghindari perilaku tak konsisten: device
      // bisa re-register lazy / ter-kick tergantung riwayat akun).
      const session = await db.deviceSession.findUnique({ where: { id } })
      if (!session) {
        return NextResponse.json({ error: 'Catatan sesi tidak ditemukan.' }, { status: 404 })
      }
      if (session.status === 'active') {
        return NextResponse.json({ error: 'Sesi masih AKTIF. Gunakan "Cabut Sesi" atau "Reset" terlebih dahulu.' }, { status: 400 })
      }

      await db.$transaction([
        db.deviceSession.delete({ where: { id: session.id } }),
        db.auditLog.create({
          data: {
            grupId: null,
            aktorId: admin.id,
            aktorNama: admin.id,
            aksi: 'device_session_delete',
            detail: JSON.stringify({
              sessionId: session.id,
              targetUserId: session.userId,
              targetUsername: session.username,
              deviceName: session.deviceName,
              deviceType: session.deviceType,
              loginAt: session.loginAt,
              logoutAt: session.logoutAt,
              status: session.status,
            }),
          },
        }),
      ])
      invalidateDeviceGateCache(session.userId)
      return NextResponse.json({ success: true, message: 'Catatan sesi perangkat berhasil dihapus dari riwayat.' })
    }

    // type === 'attempt' — hapus catatan percobaan login ditolak.
    const attempt = await db.deviceLoginAttempt.findUnique({ where: { id } })
    if (!attempt) {
      return NextResponse.json({ error: 'Catatan login ditolak tidak ditemukan.' }, { status: 404 })
    }
    await db.$transaction([
      db.deviceLoginAttempt.delete({ where: { id: attempt.id } }),
      db.auditLog.create({
        data: {
          grupId: null,
          aktorId: admin.id,
          aktorNama: admin.id,
          aksi: 'device_attempt_delete',
          detail: JSON.stringify({
            attemptId: attempt.id,
            targetUsername: attempt.username,
            deviceName: attempt.deviceName,
            reason: attempt.reason,
            createdAt: attempt.createdAt,
          }),
        },
      }),
    ])
    return NextResponse.json({ success: true, message: 'Catatan login ditolak berhasil dihapus.' })
  } catch (error) {
    console.error('DELETE device-sessions error:', error)
    return NextResponse.json({ error: 'Gagal menghapus catatan perangkat' }, { status: 500 })
  }
}
