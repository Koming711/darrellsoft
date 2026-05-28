import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { sanitizeApiError, safeErrorLog } from '@/lib/api-error'
import { sendWhatsAppMessage, generateRandomPassword } from '@/lib/whatsapp'

export async function POST(request: NextRequest) {
  try {
    const { email, phone, newPassword, action } = await request.json()

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

    // Search by phone number
    if (action === 'search-phone') {
      if (!phone || typeof phone !== 'string' || !phone.trim()) {
        return NextResponse.json({ error: 'Nomor WhatsApp wajib diisi' }, { status: 400 })
      }

      const phoneVariants = getPhoneVariants(phone)

      const pengguna = await db.pengguna.findFirst({
        where: { OR: phoneVariants.map(p => ({ nomorHP: p })) }
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

      const calon = await db.calonPembeli.findFirst({
        where: { OR: phoneVariants.map(p => ({ nomorHP: p })) }
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

    // Reset password by phone (direct)
    if (action === 'reset-phone') {
      if (!phone || typeof phone !== 'string' || !phone.trim()) {
        return NextResponse.json({ error: 'Nomor WhatsApp wajib diisi' }, { status: 400 })
      }

      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        return NextResponse.json({ error: 'Password baru minimal 6 karakter' }, { status: 400 })
      }

      const phoneVariants = getPhoneVariants(phone)

      const pengguna = await db.pengguna.findFirst({
        where: { OR: phoneVariants.map(p => ({ nomorHP: p })) }
      })

      if (pengguna) {
        await db.pengguna.update({
          where: { id: pengguna.id },
          data: { password: newPassword },
        })
        return NextResponse.json({ success: true, message: 'Password berhasil diubah. Silakan login dengan password baru Anda.' })
      }

      const calon = await db.calonPembeli.findFirst({
        where: { OR: phoneVariants.map(p => ({ nomorHP: p })) }
      })

      if (calon) {
        await db.calonPembeli.update({
          where: { id: calon.id },
          data: { password: newPassword },
        })
        return NextResponse.json({ success: true, message: 'Password berhasil diubah. Silakan login dengan password baru Anda.' })
      }

      return NextResponse.json({ error: 'Nomor WhatsApp tidak ditemukan.' }, { status: 404 })
    }

    // Send password to WhatsApp (generate random password & send via WA API)
    if (action === 'send-wa') {
      if (!phone || typeof phone !== 'string' || !phone.trim()) {
        return NextResponse.json({ error: 'Nomor WhatsApp wajib diisi' }, { status: 400 })
      }

      const phoneVariants = getPhoneVariants(phone)

      // Find account by phone
      let foundUser: { id: string; name: string; username: string; nomorHP: string; type: string } | null = null

      const pengguna = await db.pengguna.findFirst({
        where: { OR: phoneVariants.map(p => ({ nomorHP: p })) }
      })

      if (pengguna) {
        foundUser = { id: pengguna.id, name: pengguna.namaLengkap, username: pengguna.username, nomorHP: pengguna.nomorHP, type: 'pengguna' }
      } else {
        const calon = await db.calonPembeli.findFirst({
          where: { OR: phoneVariants.map(p => ({ nomorHP: p })) }
        })

        if (calon) {
          foundUser = { id: calon.id, name: calon.nama, username: calon.username || '', nomorHP: calon.nomorHP, type: 'calon_pembeli' }
        }
      }

      if (!foundUser) {
        return NextResponse.json({ error: 'Nomor WhatsApp tidak ditemukan.' }, { status: 404 })
      }

      // Generate random temporary password
      const tempPassword = generateRandomPassword(8)

      // Update the password in database
      if (foundUser.type === 'pengguna') {
        await db.pengguna.update({
          where: { id: foundUser.id },
          data: { password: tempPassword },
        })
      } else {
        await db.calonPembeli.update({
          where: { id: foundUser.id },
          data: { password: tempPassword },
        })
      }

      // Send password to WhatsApp
      const waMessage = `🔐 *Reset Password Berhasil*\n\nHalo *${foundUser.name}*,\n\nPassword akun Anda telah direset. Berikut password sementara Anda:\n\n🔑 *${tempPassword}*\n\nSilakan login dengan password di atas, lalu segera ubah password Anda di menu profil untuk keamanan.\n\n— Darrell Soft`

      const waResult = await sendWhatsAppMessage(foundUser.nomorHP, waMessage)

      if (!waResult.success) {
        // Password was updated but WA failed — still return success with a warning
        return NextResponse.json({
          success: true,
          passwordSent: false,
          waError: waResult.error,
          message: 'Password berhasil diubah, tapi gagal dikirim ke WhatsApp. Silakan gunakan metode lain atau hubungi administrator.',
          tempPassword: tempPassword, // Only show when WA fails
        })
      }

      return NextResponse.json({
        success: true,
        passwordSent: true,
        message: `Password baru telah dikirim ke WhatsApp ${maskPhone(foundUser.nomorHP)}. Silakan cek WhatsApp Anda dan login dengan password yang dikirim.`,
      })
    }

    return NextResponse.json({ error: 'Action tidak valid' }, { status: 400 })

  } catch (error) {
    console.error('Forgot password error:', safeErrorLog(error))
    return NextResponse.json({ error: sanitizeApiError(error) }, { status: 500 })
  }
}

/** Generate phone number variants for flexible matching */
function getPhoneVariants(phone: string): string[] {
  let normalizedPhone = phone.trim().replace(/[\s\-()]/g, '')
  const variants = [normalizedPhone]

  if (normalizedPhone.startsWith('0')) {
    variants.push('+62' + normalizedPhone.substring(1))
    variants.push('62' + normalizedPhone.substring(1))
  }
  if (normalizedPhone.startsWith('+62')) {
    variants.push('0' + normalizedPhone.substring(3))
    variants.push('62' + normalizedPhone.substring(3))
  }
  if (normalizedPhone.startsWith('62') && !normalizedPhone.startsWith('+')) {
    variants.push('0' + normalizedPhone.substring(2))
    variants.push('+62' + normalizedPhone.substring(2))
  }

  return variants
}

/** Mask phone number for privacy: 081234567890 → 0812****7890 */
function maskPhone(phone: string): string {
  if (phone.length < 8) return phone
  const start = phone.substring(0, 4)
  const end = phone.substring(phone.length - 4)
  const middle = '*'.repeat(Math.min(phone.length - 8, 4))
  return `${start}${middle}${end}`
}
