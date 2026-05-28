import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { sanitizeApiError, safeErrorLog } from '@/lib/api-error'
import { sendEmail, getPasswordResetEmailHtml } from '@/lib/email'
import { randomBytes } from 'crypto'

// Step 1: Search for account by username
export async function POST(request: NextRequest) {
  try {
    const { username, action } = await request.json()

    if (!username || typeof username !== 'string' || !username.trim()) {
      return NextResponse.json({ error: 'Username wajib diisi' }, { status: 400 })
    }

    const trimmedUsername = username.trim().toLowerCase()

    // Search in Pengguna table
    const pengguna = await db.pengguna.findUnique({
      where: { username: trimmedUsername }
    })

    let userEmail: string | null = null
    let userName: string | null = null
    let userId: string | null = null
    let userRole: string = 'user'
    let userType: string = 'pengguna'

    if (pengguna) {
      userEmail = pengguna.email
      userName = pengguna.namaLengkap
      userId = pengguna.id
      userRole = pengguna.role
      userType = 'pengguna'
    } else {
      // Search in CalonPembeli table
      const calon = await db.calonPembeli.findFirst({
        where: { username: trimmedUsername }
      })

      if (calon) {
        userEmail = calon.email
        userName = calon.nama
        userId = calon.id
        userRole = calon.role || 'demo'
        userType = 'calon_pembeli'
      }
    }

    if (!userName || !userId) {
      return NextResponse.json({
        found: false,
        message: 'Username tidak ditemukan. Pastikan username sudah benar.',
      }, { status: 404 })
    }

    // Mask the email for privacy
    let maskedEmail = '***'
    if (userEmail && userEmail.trim()) {
      const emailParts = userEmail.split('@')
      if (emailParts.length === 2) {
        maskedEmail = `${emailParts[0].substring(0, 2)}***@${emailParts[1]}`
      }
    }

    // Step 1: Just search - return account info
    if (!action || action === 'search') {
      return NextResponse.json({
        found: true,
        name: userName,
        role: userRole,
        maskedEmail,
        hasEmail: !!(userEmail && userEmail.trim()),
      })
    }

    // Step 2: Send email - generate token & send
    if (action === 'send-email') {
      if (!userEmail || !userEmail.trim()) {
        return NextResponse.json({
          error: 'Akun ini tidak memiliki email terdaftar. Gunakan opsi WhatsApp untuk reset password.',
        }, { status: 400 })
      }

      // Generate reset token
      const token = randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now

      // Invalidate any existing unused tokens for this user
      await db.passwordResetToken.updateMany({
        where: {
          userId,
          used: false,
          expiresAt: { gt: new Date() },
        },
        data: { used: true },
      })

      // Save the new token
      await db.passwordResetToken.create({
        data: {
          token,
          email: userEmail,
          userType,
          userId,
          expiresAt,
        },
      })

      // Build reset URL
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.darrellsoft.com'
      const resetUrl = `${appUrl}/reset-password?token=${token}`

      // Send email
      const emailSent = await sendEmail({
        to: userEmail,
        subject: 'Reset Password - Darrell Soft',
        html: getPasswordResetEmailHtml(resetUrl, userName),
      })

      if (emailSent) {
        return NextResponse.json({
          emailSent: true,
          maskedEmail,
          resetUrl: '',
          message: `Link reset password telah dikirim ke email ${maskedEmail}. Silakan cek inbox atau folder spam Anda.`,
        })
      }

      // Email failed — return reset URL as fallback
      return NextResponse.json({
        emailSent: false,
        maskedEmail,
        resetUrl,
        message: `Email gagal dikirim ke ${maskedEmail}. Gunakan link di bawah atau hubungi admin via WhatsApp.`,
      })
    }

    // Step 2b: WhatsApp - generate token & return link for WhatsApp message
    if (action === 'whatsapp') {
      // Generate reset token
      const token = randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now

      // Invalidate any existing unused tokens for this user
      await db.passwordResetToken.updateMany({
        where: {
          userId,
          used: false,
          expiresAt: { gt: new Date() },
        },
        data: { used: true },
      })

      // Save the new token
      await db.passwordResetToken.create({
        data: {
          token,
          email: userEmail || '',
          userType,
          userId,
          expiresAt,
        },
      })

      // Build reset URL
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.darrellsoft.com'
      const resetUrl = `${appUrl}/reset-password?token=${token}`

      return NextResponse.json({
        whatsapp: true,
        resetUrl,
        name: userName,
        username: trimmedUsername,
      })
    }

    return NextResponse.json({ error: 'Action tidak valid' }, { status: 400 })

  } catch (error) {
    console.error('Forgot password error:', safeErrorLog(error))
    return NextResponse.json({ error: sanitizeApiError(error) }, { status: 500 })
  }
}
