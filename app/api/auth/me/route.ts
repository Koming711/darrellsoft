import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server-auth'

// GET /api/auth/me - Get current logged-in user's profile
export async function GET(request: Request) {
  try {
    const authErr = requireAuth(request as any)
    if (authErr) return authErr

    const userId = (request as any).cookies.get('userId')?.value
    if (!userId) {
      return NextResponse.json({ error: 'User ID not found' }, { status: 401 })
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

    return NextResponse.json(pengguna, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    })
  } catch (error) {
    console.error('Get profile error:', error)
    return NextResponse.json({ error: 'Gagal mengambil data profil' }, { status: 500 })
  }
}
