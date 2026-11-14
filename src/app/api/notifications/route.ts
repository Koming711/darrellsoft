import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getServerUser, requireAuth } from '@/lib/server-auth'
import { stripReminderRef } from '@/lib/subscription-reminders'

// GET: Fetch notifications (pusat notifikasi semua role).
// - Admin/superadmin/manager: notifikasi broadcast admin (userId="") + miliknya.
// - Role lain: HANYA notifikasi miliknya (isolasi per user/grup).
// Query: ?page=1&take=15 (pagination riwayat), ?since=ISO (polling popup murah),
//        ?unread=1 (PERMINTAAN OWNER: pusat notifikasi hanya menampilkan yang BELUM
//        dibaca — begitu dibaca notif otomatis hilang dr daftar; data tetap tersimpan di DB).
export async function GET(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const isAdmin = ['superadmin', 'admin', 'manager'].includes(user.role || '')
    const scopeWhere = isAdmin ? { userId: { in: ['', user.id] } } : { userId: user.id }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const take = Math.min(50, Math.max(1, parseInt(searchParams.get('take') || '15', 10) || 15))
    const since = searchParams.get('since')

    const where: Record<string, unknown> = { ...scopeWhere }
    if (since) {
      const d = new Date(since)
      if (!isNaN(d.getTime())) where.createdAt = { gt: d }
    }

    // ?unread=1 → daftar hanya notifikasi belum dibaca (hilang otomatis saat dibaca)
    const unreadOnly = searchParams.get('unread') === '1'
    const listWhere = unreadOnly ? { ...where, isRead: false } : where

    const [notifications, unreadCount, total] = await Promise.all([
      db.notification.findMany({
        where: listWhere,
        orderBy: { createdAt: 'desc' },
        skip: since ? 0 : (page - 1) * take,
        take,
      }),
      db.notification.count({ where: { ...scopeWhere, isRead: false } }),
      // total untuk pagination dihitung pada set yang sedang ditampilkan
      // (unreadOnly → total notifikasi belum dibaca, agar "Muat lebih banyak" konsisten)
      db.notification.count({ where: listWhere }),
    ])

    return NextResponse.json({
      notifications: notifications.map((n) => ({ ...n, body: stripReminderRef(n.body) })),
      unreadCount,
      hasMore: since ? false : page * take < total,
      total,
    })
  } catch (error) {
    console.error('Notifications fetch error:', error)
    return NextResponse.json({ notifications: [], unreadCount: 0, hasMore: false }, { status: 200 })
  }
}

// POST: Mark one or all as read (mencatat readAt).
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const body = await request.json()
    const { id, markAll } = body

    const isAdmin = ['superadmin', 'admin', 'manager'].includes(user.role || '')
    const scopeWhere = isAdmin ? { userId: { in: ['', user.id] } } : { userId: user.id }

    if (markAll) {
      await db.notification.updateMany({
        where: { isRead: false, ...scopeWhere },
        data: { isRead: true, readAt: new Date() },
      })
      return NextResponse.json({ success: true })
    }

    if (id) {
      const notification = await db.notification.findUnique({ where: { id } })
      if (!notification) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      // Otorisasi: user hanya boleh membaca notifikasinya; admin boleh
      // notifikasi broadcast admin (userId="") + miliknya.
      const allowed =
        notification.userId === user.id || (isAdmin && ['', user.id].includes(notification.userId))
      if (!allowed) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      await db.notification.update({
        where: { id },
        data: { isRead: true, readAt: new Date() },
      })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Provide id or markAll' }, { status: 400 })
  } catch (error) {
    console.error('Notifications update error:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

// DELETE: Delete a notification (?id=) or ALL notifications in scope (?all=1).
export async function DELETE(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const { searchParams } = new URL(request.url)

    const isAdmin = ['superadmin', 'admin', 'manager'].includes(user.role || '')
    const scopeWhere = isAdmin ? { userId: { in: ['', user.id] } } : { userId: user.id }

    // ?all=1 — PERMINTAAN OWNER: tombol "Hapus Semua" di Pusat Notifikasi.
    // Hapus permanen SEMUA notifikasi dalam scope user (admin: broadcast + miliknya;
    // role lain: miliknya saja) + bersihkan riwayat NotificationDelivery terkait.
    if (searchParams.get('all') === '1') {
      const rows = await db.notification.findMany({ where: scopeWhere, select: { id: true } })
      const ids = rows.map((n) => n.id)
      if (ids.length > 0) {
        await db.notificationDelivery.deleteMany({ where: { notificationId: { in: ids } } })
        await db.notification.deleteMany({ where: { id: { in: ids } } })
      }
      return NextResponse.json({ success: true, deleted: ids.length })
    }

    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const notification = await db.notification.findUnique({ where: { id } })

    if (!notification) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const allowed =
      notification.userId === user.id ||
      (isAdmin && ['', user.id].includes(notification.userId))
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await db.notification.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Notifications delete error:', error)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
