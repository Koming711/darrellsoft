import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { sanitizeApiError, safeErrorLog } from '@/lib/api-error'

export async function POST(request: NextRequest) {
  try {
    const { email, newPassword, action } = await request.json()

    // Step 1: Search account by email
    if (!action || action === 'search') {
      if (!email || typeof email !== 'string' || !email.trim()) {
        return NextResponse.json({ error: 'Email wajib diisi' }, { status: 400 })
      }

      const trimmedEmail = email.trim().toLowerCase()

      const pengguna = await db.pengguna.findFirst({
        where: { email: trimmedEmail }
      })

      if (pengguna) {
        return NextResponse.json({
          found: true,
          name: pengguna.namaLengkap,
          username: pengguna.username,
          userType: 'pengguna',
          userId: pengguna.id,
        })
      }

      const calon = await db.calonPembeli.findFirst({
        where: { email: trimmedEmail }
      })

      if (calon) {
        return NextResponse.json({
          found: true,
          name: calon.nama,
          username: calon.username || '',
          userType: 'calon_pembeli',
          userId: calon.id,
        })
      }

      return NextResponse.json({
        found: false,
        message: 'Email tidak ditemukan. Pastikan email sudah benar.',
      }, { status: 404 })
    }

    // Reset password by email (direct)
    if (action === 'reset') {
      if (!email || typeof email !== 'string' || !email.trim()) {
        return NextResponse.json({ error: 'Email wajib diisi' }, { status: 400 })
      }

      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        return NextResponse.json({ error: 'Password baru minimal 6 karakter' }, { status: 400 })
      }

      const trimmedEmail = email.trim().toLowerCase()

      const pengguna = await db.pengguna.findFirst({
        where: { email: trimmedEmail }
      })

      if (pengguna) {
        await db.pengguna.update({
          where: { id: pengguna.id },
          data: { password: newPassword },
        })
        return NextResponse.json({ success: true, message: 'Password berhasil diubah. Silakan login dengan password baru Anda.' })
      }

      const calon = await db.calonPembeli.findFirst({
        where: { email: trimmedEmail }
      })

      if (calon) {
        await db.calonPembeli.update({
          where: { id: calon.id },
          data: { password: newPassword },
        })
        return NextResponse.json({ success: true, message: 'Password berhasil diubah. Silakan login dengan password baru Anda.' })
      }

      return NextResponse.json({ error: 'Email tidak ditemukan.' }, { status: 404 })
    }

    return NextResponse.json({ error: 'Action tidak valid' }, { status: 400 })

  } catch (error) {
    console.error('Forgot password error:', safeErrorLog(error))
    return NextResponse.json({ error: sanitizeApiError(error) }, { status: 500 })
  }
}
