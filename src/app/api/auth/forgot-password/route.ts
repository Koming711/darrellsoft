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

    // Reset password by phone (direct - used when user manually sets password)
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

    // Send password to WhatsApp ONLY — never show on screen (secure)
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

      // Check if WhatsApp API is configured first
      const apiKeySetting = await db.setting.findUnique({ where: { key: 'wa_api_key' } })
      const apiKey = apiKeySetting?.value?.trim()

      if (!apiKey) {
        return NextResponse.json({
          error: 'Fitur kirim password via WhatsApp belum dikonfigurasi oleh administrator. Silakan gunakan metode "Via Email" atau hubungi administrator.',
        }, { status: 400 })
      }

      // Generate random temporary password
      const tempPassword = generateRandomPassword(8)

      // Send password to WhatsApp FIRST (before updating DB)
      const waMessage = `🔐 *Reset Password Berhasil*\n\nHalo *${foundUser.name}*,\n\nPassword akun Anda telah direset. Berikut password baru Anda:\n\n🔑 *${tempPassword}*\n\nSilakan login dengan password di atas, lalu segera ubah password di menu profil untuk keamanan.\n\n— Darrell Soft`

      const waResult = await sendWhatsAppMessage(foundUser.nomorHP, waMessage)

      if (!waResult.success) {
        // WA failed — DO NOT update password, DO NOT show password on screen
        return NextResponse.json({
          error: `Gagal mengirim password ke WhatsApp: ${waResult.error}. Password tidak diubah. Silakan coba lagi atau gunakan metode "Via Email".`,
        }, { status: 500 })
      }

      // WA sent successfully — NOW update the password
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
