import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { sanitizeApiError, safeErrorLog } from '@/lib/api-error'

export async function POST(request: NextRequest) {
  try {
    const { email, phone, newPassword, action } = await request.json()

    // Step 1: Search account by email or phone
    if (!action || action === 'search') {
      if (action !== 'search-phone') {
        // Search by email (default)
        if (!email || typeof email !== 'string' || !email.trim()) {
          return NextResponse.json({ error: 'Email wajib diisi' }, { status: 400 })
        }

        const trimmedEmail = email.trim().toLowerCase()

        // Search in Pengguna table
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

        // Search in CalonPembeli table
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
    }

    // Search by phone number
    if (action === 'search-phone') {
      if (!phone || typeof phone !== 'string' || !phone.trim()) {
        return NextResponse.json({ error: 'Nomor WhatsApp wajib diisi' }, { status: 400 })
      }

      // Normalize phone: remove spaces, dashes, etc.
      let normalizedPhone = phone.trim().replace(/[\s\-()]/g, '')

      // Try to find with various formats
      const phoneVariants = [normalizedPhone]

      // If starts with 0, also try with +62 and 62
      if (normalizedPhone.startsWith('0')) {
        phoneVariants.push('+62' + normalizedPhone.substring(1))
        phoneVariants.push('62' + normalizedPhone.substring(1))
      }
      // If starts with +62, also try with 0 and 62
      if (normalizedPhone.startsWith('+62')) {
        phoneVariants.push('0' + normalizedPhone.substring(3))
        phoneVariants.push('62' + normalizedPhone.substring(3))
      }
      // If starts with 62 (without +), also try with 0 and +62
      if (normalizedPhone.startsWith('62') && !normalizedPhone.startsWith('+')) {
        phoneVariants.push('0' + normalizedPhone.substring(2))
        phoneVariants.push('+62' + normalizedPhone.substring(2))
      }

      // Search in Pengguna table
      const pengguna = await db.pengguna.findFirst({
        where: {
          OR: phoneVariants.map(p => ({ nomorHP: p }))
        }
      })

      if (pengguna) {
        return NextResponse.json({
          found: true,
          name: pengguna.namaLengkap,
          username: pengguna.username,
          userType: 'pengguna',
          userId: pengguna.id,
          phone: pengguna.nomorHP,
        })
      }

      // Search in CalonPembeli table
      const calon = await db.calonPembeli.findFirst({
        where: {
          OR: phoneVariants.map(p => ({ nomorHP: p }))
        }
      })

      if (calon) {
        return NextResponse.json({
          found: true,
          name: calon.nama,
          username: calon.username || '',
          userType: 'calon_pembeli',
          userId: calon.id,
          phone: calon.nomorHP,
        })
      }

      return NextResponse.json({
        found: false,
        message: 'Nomor WhatsApp tidak ditemukan. Pastikan nomor sudah benar.',
      }, { status: 404 })
    }

    // Step 2: Reset password directly (by email)
    if (action === 'reset') {
      if (!email || typeof email !== 'string' || !email.trim()) {
        return NextResponse.json({ error: 'Email wajib diisi' }, { status: 400 })
      }

      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        return NextResponse.json({ error: 'Password baru minimal 6 karakter' }, { status: 400 })
      }

      const trimmedEmail = email.trim().toLowerCase()

      // Search in Pengguna table
      const pengguna = await db.pengguna.findFirst({
        where: { email: trimmedEmail }
      })

      if (pengguna) {
        await db.pengguna.update({
          where: { id: pengguna.id },
          data: { password: newPassword },
        })

        return NextResponse.json({
          success: true,
          message: 'Password berhasil diubah. Silakan login dengan password baru Anda.',
        })
      }

      // Search in CalonPembeli table
      const calon = await db.calonPembeli.findFirst({
        where: { email: trimmedEmail }
      })

      if (calon) {
        await db.calonPembeli.update({
          where: { id: calon.id },
          data: { password: newPassword },
        })

        return NextResponse.json({
          success: true,
          message: 'Password berhasil diubah. Silakan login dengan password baru Anda.',
        })
      }

      return NextResponse.json({
        error: 'Email tidak ditemukan.',
      }, { status: 404 })
    }

    // Reset password by phone number
    if (action === 'reset-phone') {
      if (!phone || typeof phone !== 'string' || !phone.trim()) {
        return NextResponse.json({ error: 'Nomor WhatsApp wajib diisi' }, { status: 400 })
      }

      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        return NextResponse.json({ error: 'Password baru minimal 6 karakter' }, { status: 400 })
      }

      let normalizedPhone = phone.trim().replace(/[\s\-()]/g, '')
      const phoneVariants = [normalizedPhone]
      if (normalizedPhone.startsWith('0')) {
        phoneVariants.push('+62' + normalizedPhone.substring(1))
        phoneVariants.push('62' + normalizedPhone.substring(1))
      }
      if (normalizedPhone.startsWith('+62')) {
        phoneVariants.push('0' + normalizedPhone.substring(3))
        phoneVariants.push('62' + normalizedPhone.substring(3))
      }
      if (normalizedPhone.startsWith('62') && !normalizedPhone.startsWith('+')) {
        phoneVariants.push('0' + normalizedPhone.substring(2))
        phoneVariants.push('+62' + normalizedPhone.substring(2))
      }

      // Search in Pengguna table
      const pengguna = await db.pengguna.findFirst({
        where: {
          OR: phoneVariants.map(p => ({ nomorHP: p }))
        }
      })

      if (pengguna) {
        await db.pengguna.update({
          where: { id: pengguna.id },
          data: { password: newPassword },
        })

        return NextResponse.json({
          success: true,
          message: 'Password berhasil diubah. Silakan login dengan password baru Anda.',
        })
      }

      // Search in CalonPembeli table
      const calon = await db.calonPembeli.findFirst({
        where: {
          OR: phoneVariants.map(p => ({ nomorHP: p }))
        }
      })

      if (calon) {
        await db.calonPembeli.update({
          where: { id: calon.id },
          data: { password: newPassword },
        })

        return NextResponse.json({
          success: true,
          message: 'Password berhasil diubah. Silakan login dengan password baru Anda.',
        })
      }

      return NextResponse.json({
        error: 'Nomor WhatsApp tidak ditemukan.',
      }, { status: 404 })
    }

    return NextResponse.json({ error: 'Action tidak valid' }, { status: 400 })

  } catch (error) {
    console.error('Forgot password error:', safeErrorLog(error))
    return NextResponse.json({ error: sanitizeApiError(error) }, { status: 500 })
  }
}
