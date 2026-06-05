import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

// GET: Fetch notifications (admin/superadmin/manager see all, others see own)
export async function GET() {
  try {
    const authUser = getAuthUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isAdmin = ['superadmin', 'admin', 'manager'].includes(authUser.role || '')

    const notifications = await db.notification.findMany({
      where: isAdmin ? {} : { userId: authUser.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    const unreadCount = await db.notification.count({
      where: {
        isRead: false,
        ...(isAdmin ? {} : { userId: authUser.id }),
      },
    })

    return NextResponse.json({ notifications, unreadCount })
  } catch (error) {
    console.error('Notifications fetch error:', error)
    return NextResponse.json({ notifications: [], unreadCount: 0 }, { status: 200 })
  }
}

// POST: Mark one or all as read
export async function POST(request: NextRequest) {
  try {
    const authUser = getAuthUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id, markAll } = body

    if (markAll) {
      const isAdmin = ['superadmin', 'admin', 'manager'].includes(authUser.role || '')
      await db.notification.updateMany({
        where: {
          isRead: false,
          ...(isAdmin ? {} : { userId: authUser.id }),
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
    const authUser = getAuthUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const isAdmin = ['superadmin', 'admin', 'manager'].includes(authUser.role || '')
    const notification = await db.notification.findUnique({ where: { id } })

    if (!notification) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (!isAdmin && notification.userId !== authUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await db.notification.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Notifications delete error:', error)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
