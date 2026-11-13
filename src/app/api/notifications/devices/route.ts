// /api/notifications/devices — perangkat push notification (Web Push subscription)
// milik user yang login. Semua akses terautentikasi & terisolasi per user.
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getServerUser, requireAuth } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

function detectDeviceType(ua: string, explicit?: string): string {
  if (explicit && ['browser', 'android', 'desktop', 'ios'].includes(explicit)) return explicit
  const s = ua.toLowerCase()
  if (/iphone|ipad|ipod/.test(s)) return 'ios'
  if (/android/.test(s)) return 'android'
  return 'browser'
}

function maskEndpoint(endpoint: string): string {
  try {
    const u = new URL(endpoint)
    const tail = endpoint.slice(-8)
    return `${u.host}…${tail}`
  } catch {
    return `…${endpoint.slice(-8)}`
  }
}

// GET: daftar perangkat milik user (endpoint di-masking demi keamanan)
export async function GET(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const devices = await db.pushDevice.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      devices: devices.map((d) => ({
        id: d.id,
        deviceType: d.deviceType,
        userAgent: d.userAgent,
        isActive: d.isActive,
        lastUsedAt: d.lastUsedAt,
        createdAt: d.createdAt,
        endpointMasked: maskEndpoint(d.endpoint),
      })),
    })
  } catch (error) {
    console.error('Devices fetch error:', error)
    return NextResponse.json({ devices: [] }, { status: 200 })
  }
}

// POST: daftarkan / perbarui perangkat (upsert by endpoint unik)
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const body = await request.json()
    const endpoint = String(body?.subscription?.endpoint || '')
    const p256dh = String(body?.subscription?.keys?.p256dh || '')
    const auth = String(body?.subscription?.keys?.auth || '')
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: 'Subscription push tidak lengkap' }, { status: 400 })
    }

    const userAgent = String(body?.userAgent || request.headers.get('user-agent') || '').slice(0, 300)
    const deviceType = detectDeviceType(userAgent, body?.deviceType)

    const device = await db.pushDevice.upsert({
      where: { endpoint },
      update: {
        userId: user.id,
        p256dh,
        auth,
        deviceType,
        userAgent,
        isActive: true,
      },
      create: {
        userId: user.id,
        endpoint,
        p256dh,
        auth,
        deviceType,
        userAgent,
        isActive: true,
      },
    })

    return NextResponse.json({ success: true, id: device.id })
  } catch (error) {
    console.error('Device register error:', error)
    return NextResponse.json({ error: 'Gagal mendaftarkan perangkat' }, { status: 500 })
  }
}

// PATCH: aktifkan / nonaktifkan perangkat milik user
export async function PATCH(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const body = await request.json()
    const { id, isActive } = body
    if (!id || typeof isActive !== 'boolean') {
      return NextResponse.json({ error: 'id & isActive wajib' }, { status: 400 })
    }

    const device = await db.pushDevice.findUnique({ where: { id } })
    if (!device || device.userId !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await db.pushDevice.update({ where: { id }, data: { isActive } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Device patch error:', error)
    return NextResponse.json({ error: 'Gagal mengubah perangkat' }, { status: 500 })
  }
}

// DELETE: hapus perangkat milik user (?id= atau ?endpoint=)
export async function DELETE(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const endpoint = searchParams.get('endpoint')

    const where = id ? { id } : endpoint ? { endpoint } : null
    if (!where) {
      return NextResponse.json({ error: 'id atau endpoint wajib' }, { status: 400 })
    }

    const device = await db.pushDevice.findUnique({ where })
    if (!device || device.userId !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await db.pushDevice.delete({ where: { id: device.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Device delete error:', error)
    return NextResponse.json({ error: 'Gagal menghapus perangkat' }, { status: 500 })
  }
}
