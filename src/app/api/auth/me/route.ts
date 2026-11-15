import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server-auth'
import {
  validateDeviceSession,
  getSingleDeviceMessage,
} from '@/lib/device-session'

// GET /api/auth/me - Get current logged-in user's profile
// Termasuk validasi "Login 1 Perangkat" (pemulihan sesi & pembukaan aplikasi):
// perangkat yang tidak menjadi sesi aktif akun → 403 deviceConflict.
export async function GET(request: Request) {
  try {
    const authErr = requireAuth(request as any)
    if (authErr) return authErr

    const userId = (request as any).cookies.get('userId')?.value
    if (!userId) {
      return NextResponse.json({ error: 'User ID not found' }, { status: 401 })
    }

    const deviceToken = (request as any).cookies.get('dsDevice')?.value || ''
    const userAgent = (request as any).headers?.get?.('user-agent') || ''

    /** Validasi perangkat bila identitas akun sudah diketahui. */
    const guardDevice = async (username: string, role: string): Promise<NextResponse | null> => {
      if (!deviceToken) return null // klien lama → fail-open
      const check = await validateDeviceSession({
        userId,
        username,
        role,
        deviceToken,
        userAgent,
      })
      if (check.status !== 'conflict') return null
      const customMessage = await getSingleDeviceMessage()
      const message =
        check.kind === 'session_revoked'
          ? 'Sesi perangkat Anda telah dicabut oleh administrator. Silakan login kembali dari perangkat ini untuk mengaktifkan perangkat.'
          : (customMessage || 'Akun Anda sedang digunakan pada perangkat lain. Demi keamanan akun, satu akun hanya dapat digunakan pada satu perangkat.')
      return NextResponse.json(
        { error: message, deviceConflict: true, expired: false },
        { status: 403, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      )
    }

    const pengguna = await db.pengguna.findUnique({
      where: { id: userId },
      select: {
        id: true,
        namaLengkap: true,
        username: true,
        email: true,
        nomorHP: true,
        role: true,
        createdAt: true,
        validUntil: true,
      }
    })

    if (!pengguna) {
      // Check if this is a CalonPembeli user
      const calon = await db.calonPembeli.findUnique({
        where: { id: userId },
        select: {
          id: true,
          nama: true,
          username: true,
          email: true,
          nomorHP: true,
          role: true,
          createdAt: true,
          expiredDate: true,
        }
      })

      if (calon) {
        // Check CalonPembeli expiry
        if (calon.expiredDate && new Date(calon.expiredDate) < new Date()) {
          return NextResponse.json({ error: 'Akun sudah expired. Silahkan diperpanjang lagi akunnya.', expired: true }, { status: 403 })
        }
        // Validasi perangkat (Login 1 Perangkat)
        const deviceErr = await guardDevice(calon.username || '', calon.role || 'demo')
        if (deviceErr) return deviceErr
        return NextResponse.json({
          ...calon,
          namaLengkap: calon.nama,
          validUntil: calon.expiredDate,
        }, {
          headers: { 'Cache-Control': 'no-store, max-age=0' }
        })
      }

      return NextResponse.json({ error: 'Pengguna tidak ditemukan' }, { status: 404 })
    }

    // Check Pengguna expiry (except admin/superadmin)
    if (pengguna.role !== 'admin' && pengguna.role !== 'superadmin' && pengguna.validUntil && new Date(pengguna.validUntil) < new Date()) {
      return NextResponse.json({ error: 'Akun sudah expired. Silahkan diperpanjang lagi akunnya.', expired: true }, { status: 403 })
    }

    // Validasi perangkat (Login 1 Perangkat — semua role)
    const deviceErr = await guardDevice(pengguna.username, pengguna.role)
    if (deviceErr) return deviceErr

    return NextResponse.json(pengguna, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    })
  } catch (error) {
    console.error('Get profile error:', error)
    return NextResponse.json({ error: 'Gagal mengambil data profil' }, { status: 500 })
  }
}
