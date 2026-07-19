import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { sanitizeApiError, safeErrorLog } from '@/lib/api-error'

export async function POST(request: NextRequest) {
  try {
    const { token, newPassword } = await request.json()

    if (!token || typeof token !== 'string' || !token.trim()) {
      return NextResponse.json({ error: 'Token reset password tidak valid' }, { status: 400 })
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json({ error: 'Password baru minimal 6 karakter' }, { status: 400 })
    }

    // Find the token
    const resetToken = await db.passwordResetToken.findUnique({
      where: { token: token.trim() },
    })

    if (!resetToken) {
      return NextResponse.json({ error: 'Token reset password tidak ditemukan atau sudah tidak valid' }, { status: 400 })
    }

    // Check if token is already used
    if (resetToken.used) {
      return NextResponse.json({ error: 'Token reset password sudah digunakan. Silakan ajukan permintaan reset password baru.' }, { status: 400 })
    }

    // Check if token is expired
    if (resetToken.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Token reset password sudah kedaluwarsa. Silakan ajukan permintaan reset password baru.' }, { status: 400 })
    }

    // Update the password based on user type
    if (resetToken.userType === 'pengguna') {
      await db.pengguna.update({
        where: { id: resetToken.userId },
        data: { password: newPassword },
      })
    } else if (resetToken.userType === 'calon_pembeli') {
      await db.calonPembeli.update({
        where: { id: resetToken.userId },
        data: { password: newPassword },
      })
    }

    // Mark token as used
    await db.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used: true },
    })

    return NextResponse.json({
      success: true,
      message: 'Password berhasil diubah. Silakan login dengan password baru Anda.',
    })

  } catch (error) {
    console.error('Reset password error:', safeErrorLog(error))
    return NextResponse.json({ error: sanitizeApiError(error) }, { status: 500 })
  }
}

// GET endpoint to verify token validity
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')

    if (!token || !token.trim()) {
      return NextResponse.json({ valid: false, error: 'Token tidak ditemukan' }, { status: 400 })
    }

    const resetToken = await db.passwordResetToken.findUnique({
      where: { token: token.trim() },
    })

    if (!resetToken) {
      return NextResponse.json({ valid: false, error: 'Token tidak valid' }, { status: 400 })
    }

    if (resetToken.used) {
      return NextResponse.json({ valid: false, error: 'Token sudah digunakan' }, { status: 400 })
    }

    if (resetToken.expiresAt < new Date()) {
      return NextResponse.json({ valid: false, error: 'Token sudah kedaluwarsa' }, { status: 400 })
    }

    return NextResponse.json({
      valid: true,
      email: resetToken.email,
    })

  } catch (error) {
    console.error('Verify reset token error:', safeErrorLog(error))
    return NextResponse.json({ valid: false, error: sanitizeApiError(error) }, { status: 500 })
  }
}
