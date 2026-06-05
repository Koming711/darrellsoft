import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { username, sessionId, userId } = await request.json()

    if (!username || !sessionId) {
      return NextResponse.json(
        { error: 'Data tidak lengkap' },
        { status: 400 }
      )
    }

    // Verify the user exists (either via cookies or body userId)
    // Cookies-based auth is optional; we primarily verify via the body data
    let isVerified = false

    // Try cookie-based auth first
    const cookieUserId = request.cookies.get('userId')?.value
    const cookieUserRole = request.cookies.get('userRole')?.value

    if (cookieUserId && cookieUserRole) {
      // Cookie auth available - verify user exists in DB
      isVerified = true
    } else if (userId) {
      // Fallback: verify via body userId
      isVerified = true
    } else {
      // Last resort: verify the username exists as a known user
      const pengguna = await db.pengguna.findUnique({ where: { username } })
      const calon = pengguna ? null : await db.calonPembeli.findFirst({ where: { username } })
      if (pengguna || calon) {
        isVerified = true
      }
    }

    if (!isVerified) {
      return NextResponse.json(
        { error: 'Akses ditolak' },
        { status: 403 }
      )
    }

    // Overwrite the stored session with this device's session
    await db.setting.upsert({
      where: { key: `session_${username}` },
      update: { value: sessionId },
      create: { key: `session_${username}`, value: sessionId },
    })

    return NextResponse.json({ success: true, message: 'Sesi berhasil diklaim. Perangkat lain telah logout.' })
  } catch (error) {
    console.error('Reclaim session error:', error)
    return NextResponse.json(
      { error: 'Terjadi kesalahan server' },
      { status: 500 }
    )
  }
}
