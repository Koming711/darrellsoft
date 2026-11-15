import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getServerUser, isAdmin } from '@/lib/server-auth'
import { sendSecurityNotifications } from '@/lib/device-session'

/**
 * API Manajemen Perangkat (Panel Admin — Login 1 Perangkat).
 *
 * GET  : daftar sesi perangkat aktif + riwayat sesi + riwayat login ditolak
 *        + statistik ringkas.
 * POST : cabut sesi perangkat (action: 'revoke' | 'reset') — setelah dicabut,
 *        akun otomatis dapat login kembali di perangkat mana pun (akses
 *        terbuka). Setiap tindakan admin tercatat di AuditLog + notifikasi
 *        keamanan ke pemilik akun dan broadcast admin.
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

    return NextResponse.json({ success: true, message: 'Sesi perangkat berhasil dicabut. Akun dapat login kembali di perangkat lain.' })
  } catch (error) {
    console.error('POST device-sessions error:', error)
    return NextResponse.json({ error: 'Gagal mencabut sesi perangkat' }, { status: 500 })
  }
}
