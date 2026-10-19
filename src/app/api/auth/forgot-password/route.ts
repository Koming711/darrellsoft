// POST /api/auth/forgot-password — Lupa password via OTP WhatsApp ke nomor TERDAFTAR.
// Alur: search (cari akun by username/email) → send-otp (kirim OTP ke nomor terdaftar
// akun — BUKAN nomor yang diketik user) → verify-otp → reset (verifikasi ulang OTP,
// konsumsi, lalu update password).
// KEAMANAN:
// - Nomor WhatsApp tidak pernah diambil dari input user — selalu dari DB akun.
// - OTP 6 digit, berlaku 5 menit, cooldown kirim 60 detik, rate limit 5 kode/15 menit,
//   maksimal 5 percobaan salah per kode.
// - Password di-hash (bcrypt) sebelum disimpan.
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { sanitizeApiError, safeErrorLog } from '@/lib/api-error'
import { hashPassword } from '@/lib/password'
import { normalizePhone, maskPhone } from '@/lib/phone'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

const PHONE_REGEX = /^(\+62|62|0)[0-9]{8,13}$/
const OTP_TTL_SECONDS = 5 * 60          // kode berlaku 5 menit
const RESEND_COOLDOWN_MS = 60 * 1000    // jeda minimal 60 detik antar kirim
const MAX_PER_WINDOW = 5                // maks 5 kode per nomor per 15 menit
const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5                  // maks percobaan salah per kode

type FoundAccount =
  | { kind: 'pengguna'; id: string; name: string; username: string; nomorHP: string }
  | { kind: 'calon'; id: string; name: string; username: string; nomorHP: string }

/** Cari akun Pengguna / CalonPembeli berdasarkan username ATAU email. */
async function findAccount(identifierRaw: string): Promise<FoundAccount | null> {
  const identifier = identifierRaw.trim()
  if (!identifier) return null
  const email = identifier.toLowerCase()

  const pengguna = await db.pengguna.findFirst({
    where: { OR: [{ username: identifier }, { email }] },
  })
  if (pengguna) {
    return {
      kind: 'pengguna',
      id: pengguna.id,
      name: pengguna.namaLengkap,
      username: pengguna.username,
      nomorHP: pengguna.nomorHP,
    }
  }

  const calon = await db.calonPembeli.findFirst({
    where: { OR: [{ username: identifier }, { email }] },
  })
  if (calon) {
    return {
      kind: 'calon',
      id: calon.id,
      name: calon.nama,
      username: calon.username || '',
      nomorHP: calon.nomorHP,
    }
  }

  return null
}

/** Ambil ulang akun dari DB berdasarkan id + kind (dipakai setelah step search). */
async function getAccountById(userId: string, userType: string): Promise<FoundAccount | null> {
  if (userType === 'pengguna') {
    const row = await db.pengguna.findUnique({ where: { id: userId } })
    if (!row) return null
    return { kind: 'pengguna', id: row.id, name: row.namaLengkap, username: row.username, nomorHP: row.nomorHP }
  }
  if (userType === 'calon_pembeli') {
    const row = await db.calonPembeli.findUnique({ where: { id: userId } })
    if (!row) return null
    return { kind: 'calon', id: row.id, name: row.nama, username: row.username || '', nomorHP: row.nomorHP }
  }
  return null
}

function accountPhone(account: FoundAccount): string | null {
  const raw = (account.nomorHP || '').trim()
  if (!raw || !PHONE_REGEX.test(raw.replace(/[\s\-]/g, ''))) return null
  return normalizePhone(raw)
}

/**
 * Verifikasi kode OTP untuk sebuah nomor (dipakai verify-otp & reset).
 * Return null bila valid, atau pesan error siap kirim ke client.
 */
async function verifyOtpForPhone(phone: string, otpValue: string): Promise<{ error: string; status: number } | null> {
  if (!/^[0-9]{6}$/.test(otpValue)) {
    return { error: 'Kode OTP wajib diisi (6 digit angka).', status: 400 }
  }

  const otpRecord = await db.registerOtp.findFirst({
    where: { nomorHP: phone, consumed: false },
    orderBy: { createdAt: 'desc' },
  })

  if (!otpRecord) {
    return { error: 'Kode OTP tidak ditemukan atau sudah tidak berlaku. Silakan kirim OTP baru.', status: 400 }
  }
  if (otpRecord.expiresAt.getTime() < Date.now()) {
    return { error: 'Kode OTP sudah kedaluwarsa. Silakan kirim OTP baru.', status: 400 }
  }
  if (otpRecord.attempts >= MAX_ATTEMPTS) {
    return { error: 'Terlalu banyak percobaan salah. Silakan kirim OTP baru.', status: 429 }
  }
  if (otpRecord.code !== otpValue) {
    await db.registerOtp.update({
      where: { id: otpRecord.id },
      data: { attempts: { increment: 1 } },
    })
    const remaining = Math.max(0, MAX_ATTEMPTS - (otpRecord.attempts + 1))
    return {
      error: remaining > 0
        ? `Kode OTP salah. Sisa ${remaining} percobaan.`
        : 'Kode OTP salah. Silakan kirim OTP baru.',
      status: 400,
    }
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const action = typeof body?.action === 'string' ? body.action : 'search'

    // ===== STEP 1: Cari akun by username/email → balas dengan nomor WA tersamar =====
    if (action === 'search') {
      const identifier = typeof body?.identifier === 'string' ? body.identifier : ''
      if (!identifier.trim()) {
        return NextResponse.json({ error: 'Masukkan username atau email akun Anda.' }, { status: 400 })
      }

      const account = await findAccount(identifier)
      if (!account) {
        return NextResponse.json({
          found: false,
          message: 'Akun tidak ditemukan. Pastikan username atau email sudah benar.',
        }, { status: 404 })
      }

      const phone = accountPhone(account)
      if (!phone) {
        return NextResponse.json({
          error: 'Akun ini tidak memiliki nomor WhatsApp terdaftar. Silakan hubungi administrator.',
          code: 'NO_WHATSAPP',
        }, { status: 400 })
      }

      return NextResponse.json({
        found: true,
        name: account.name,
        username: account.username,
        userType: account.kind === 'pengguna' ? 'pengguna' : 'calon_pembeli',
        userId: account.id,
        maskedWhatsApp: maskPhone(account.nomorHP),
      })
    }

    // ===== STEP 2a: Kirim OTP ke WhatsApp terdaftar akun =====
    if (action === 'send-otp') {
      const userId = typeof body?.userId === 'string' ? body.userId : ''
      const userType = typeof body?.userType === 'string' ? body.userType : ''
      if (!userId || !userType) {
        return NextResponse.json({ error: 'Permintaan tidak valid.' }, { status: 400 })
      }

      const account = await getAccountById(userId, userType)
      if (!account) {
        return NextResponse.json({ error: 'Akun tidak ditemukan.' }, { status: 404 })
      }
      const phone = accountPhone(account)
      if (!phone) {
        return NextResponse.json({
          error: 'Akun ini tidak memiliki nomor WhatsApp terdaftar. Silakan hubungi administrator.',
          code: 'NO_WHATSAPP',
        }, { status: 400 })
      }

      // Rate limit — maks 5 kode per 15 menit per nomor
      const windowStart = new Date(Date.now() - WINDOW_MS)
      const recentCount = await db.registerOtp.count({
        where: { nomorHP: phone, createdAt: { gte: windowStart } },
      })
      if (recentCount >= MAX_PER_WINDOW) {
        return NextResponse.json(
          { error: 'Terlalu banyak permintaan OTP untuk nomor ini. Coba lagi dalam 15 menit.', code: 'OTP_RATE_LIMITED' },
          { status: 429 },
        )
      }

      // Cooldown 60 detik antar pengiriman
      const last = await db.registerOtp.findFirst({
        where: { nomorHP: phone },
        orderBy: { createdAt: 'desc' },
      })
      if (last) {
        const elapsed = Date.now() - last.createdAt.getTime()
        if (elapsed < RESEND_COOLDOWN_MS) {
          const wait = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000)
          return NextResponse.json(
            { error: `Tunggu ${wait} detik sebelum meminta kode OTP lagi.`, code: 'OTP_COOLDOWN', waitSeconds: wait },
            { status: 429 },
          )
        }
      }

      // Buat kode baru & batalkan kode lama yang belum terpakai
      const code = String(Math.floor(100000 + Math.random() * 900000))
      const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000)

      await db.registerOtp.updateMany({
        where: { nomorHP: phone, consumed: false },
        data: { consumed: true },
      })
      await db.registerOtp.create({
        data: { nomorHP: phone, code, expiresAt },
      })

      // Mode dev/preview — tanpa gateway WhatsApp, kode dikembalikan agar bisa diuji
      const devModeSetting = await db.setting.findUnique({ where: { key: 'otp_dev_mode' } })
      if (devModeSetting?.value === 'true') {
        return NextResponse.json({
          success: true,
          expiresInSeconds: OTP_TTL_SECONDS,
          devMode: true,
          devCode: code,
        })
      }

      // Kirim via Fonnte (WhatsApp)
      const companySetting = await db.setting.findUnique({ where: { key: 'company_name' } })
      const appName = companySetting?.value?.trim() || 'Darrell Soft'
      const message =
        `*${appName}*\n\n` +
        `Kode reset password Anda:\n` +
        `*${code}*\n\n` +
        `Kode berlaku 5 menit.\n` +
        `Jangan bagikan kode ini kepada siapa pun.`

      const result = await sendWhatsAppMessage(account.nomorHP, message)
      if (!result.success) {
        console.error('[forgot-password] Fonnte gagal:', result.error)
        return NextResponse.json(
          { error: result.error || 'Gagal mengirim OTP WhatsApp. Silakan coba lagi.', code: 'OTP_SEND_FAILED' },
          { status: 502 },
        )
      }

      return NextResponse.json({ success: true, expiresInSeconds: OTP_TTL_SECONDS })
    }

    // ===== STEP 2b: Verifikasi kode OTP =====
    if (action === 'verify-otp') {
      const userId = typeof body?.userId === 'string' ? body.userId : ''
      const userType = typeof body?.userType === 'string' ? body.userType : ''
      const otpCode = typeof body?.otpCode === 'string' ? body.otpCode.trim() : ''
      if (!userId || !userType) {
        return NextResponse.json({ error: 'Permintaan tidak valid.' }, { status: 400 })
      }

      const account = await getAccountById(userId, userType)
      if (!account) {
        return NextResponse.json({ error: 'Akun tidak ditemukan.' }, { status: 404 })
      }
      const phone = accountPhone(account)
      if (!phone) {
        return NextResponse.json({ error: 'Akun ini tidak memiliki nomor WhatsApp terdaftar.' }, { status: 400 })
      }

      const otpError = await verifyOtpForPhone(phone, otpCode)
      if (otpError) {
        return NextResponse.json({ error: otpError.error }, { status: otpError.status })
      }

      return NextResponse.json({ success: true, message: 'Kode OTP terverifikasi. Silakan buat password baru.' })
    }

    // ===== STEP 3: Reset password (verifikasi ulang OTP + konsumsi kode) =====
    if (action === 'reset') {
      const userId = typeof body?.userId === 'string' ? body.userId : ''
      const userType = typeof body?.userType === 'string' ? body.userType : ''
      const otpCode = typeof body?.otpCode === 'string' ? body.otpCode.trim() : ''
      const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : ''

      if (!userId || !userType) {
        return NextResponse.json({ error: 'Permintaan tidak valid.' }, { status: 400 })
      }
      if (!newPassword || newPassword.length < 6) {
        return NextResponse.json({ error: 'Password baru minimal 6 karakter' }, { status: 400 })
      }

      const account = await getAccountById(userId, userType)
      if (!account) {
        return NextResponse.json({ error: 'Akun tidak ditemukan.' }, { status: 404 })
      }
      const phone = accountPhone(account)
      if (!phone) {
        return NextResponse.json({ error: 'Akun ini tidak memiliki nomor WhatsApp terdaftar.' }, { status: 400 })
      }

      // Verifikasi ulang di server — kode yang sama harus masih valid
      const otpError = await verifyOtpForPhone(phone, otpCode)
      if (otpError) {
        return NextResponse.json({ error: otpError.error }, { status: otpError.status })
      }

      // Konsumsi kode OTP ( sekali pakai)
      const otpRecord = await db.registerOtp.findFirst({
        where: { nomorHP: phone, consumed: false },
        orderBy: { createdAt: 'desc' },
      })
      if (otpRecord) {
        await db.registerOtp.update({
          where: { id: otpRecord.id },
          data: { consumed: true },
        })
      }

      if (account.kind === 'pengguna') {
        await db.pengguna.update({
          where: { id: account.id },
          data: { password: hashPassword(newPassword) }, // bcrypt
        })
      } else {
        await db.calonPembeli.update({
          where: { id: account.id },
          data: { password: hashPassword(newPassword) }, // bcrypt
        })
      }

      return NextResponse.json({
        success: true,
        message: 'Password berhasil diubah. Silakan login dengan password baru Anda.',
      })
    }

    return NextResponse.json({ error: 'Action tidak valid' }, { status: 400 })
  } catch (error) {
    console.error('Forgot password error:', safeErrorLog(error))
    return NextResponse.json({ error: sanitizeApiError(error) }, { status: 500 })
  }
}
