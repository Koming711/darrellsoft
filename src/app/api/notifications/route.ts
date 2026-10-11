import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getServerUser, requireAuth } from '@/lib/server-auth'
import { stripReminderRef } from '@/lib/subscription-reminders'

// GET: Fetch notifications (admin/superadmin/manager see all, others see own)
export async function GET(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const isAdmin = ['superadmin', 'admin', 'manager'].includes(user.role || '')

    const notifications = await db.notification.findMany({
      where: isAdmin ? {} : { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    const unreadCount = await db.notification.count({
      where: {
        isRead: false,
        ...(isAdmin ? {} : { userId: user.id }),
      },
    })

    return NextResponse.json({
      notifications: notifications.map((n) => ({ ...n, body: stripReminderRef(n.body) })),
      unreadCount,
    })
  } catch (error) {
    console.error('Notifications fetch error:', error)
    return NextResponse.json({ notifications: [], unreadCount: 0 }, { status: 200 })
  }
}

// POST: Mark one or all as read
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const body = await request.json()
    const { id, markAll } = body

    if (markAll) {
      const isAdmin = ['superadmin', 'admin', 'manager'].includes(user.role || '')
      await db.notification.updateMany({
        where: {
          isRead: false,
          ...(isAdmin ? {} : { userId: user.id }),
        },
        data: { isRead: true },
      })
      return NextResponse.json({ success: true })
    }

    if (id) {
      await db.notification.update({
        where: { id },
        data: { isRead: true },
      })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Provide id or markAll' }, { status: 400 })
  } catch (error) {
    console.error('Notifications update error:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

// DELETE: Delete a notification
export async function DELETE(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const isAdmin = ['superadmin', 'admin', 'manager'].includes(user.role || '')
    const notification = await db.notification.findUnique({ where: { id } })

    if (!notification) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (!isAdmin && notification.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await db.notification.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Notifications delete error:', error)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
