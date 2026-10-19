import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { normalizePhone, phoneVariants } from '@/lib/phone'
import { sanitizeError } from '@/lib/api-error'
import { sendOtpSchema, firstZodMessage, zodFieldErrors, displayPhone } from '@/lib/register-schema'

export const dynamic = 'force-dynamic'

const OTP_TTL_SECONDS = 5 * 60 // kode berlaku 5 menit
const RESEND_COOLDOWN_MS = 60 * 1000 // jeda minimal 60 detik antar kirim
const MAX_PER_WINDOW = 5 // maks 5 kode per nomor per 15 menit
const WINDOW_MS = 15 * 60 * 1000

function fail(message: string, status = 400, code?: string, fieldErrors?: Record<string, string>) {
  return NextResponse.json({ ok: false, message, code, fieldErrors }, { status })
}

/**
 * POST /api/auth/otp/send  { whatsapp }
 * Alur pendaftaran baru (halaman /daftar): kirim kode OTP via WhatsApp.
 * - Nomor dinormalisasi & diperiksa belum dipakai akun lain.
 * - Cooldown 60 detik + rate limit 5 kode / 15 menit.
 * - Saat setting 'otp_dev_mode' aktif (atau gateway WhatsApp gagal dikonfigurasi),
 *   kode dikembalikan sebagai demoCode agar pendaftaran tetap bisa diuji.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const parsed = sendOtpSchema.safeParse(body)
    if (!parsed.success) {
      return fail(firstZodMessage(parsed.error), 400, 'VALIDATION', zodFieldErrors(parsed.error))
    }
    const whatsapp = parsed.data.whatsapp
    const variants = phoneVariants(displayPhone(whatsapp))

    // Nomor tidak boleh sudah terdaftar (CalonPembeli / Pembeli / Pengguna)
    const [existingCalon, existingPembeli, existingPengguna] = await Promise.all([
      db.calonPembeli.findFirst({ where: { nomorHP: { in: variants } } }),
      db.pembeli.findFirst({ where: { nomorHP: { in: variants } } }),
      db.pengguna.findFirst({ where: { nomorHP: { in: variants } } }),
    ])
    if (existingCalon || existingPembeli || existingPengguna) {
      return fail(
        'Nomor WhatsApp sudah terdaftar. Silakan login atau gunakan nomor lain.',
        409,
        'WHATSAPP_TAKEN',
        { whatsapp: 'Nomor WhatsApp sudah terdaftar' }
      )
    }

    // Rate limit — maks 5 kode per 15 menit
    const windowStart = new Date(Date.now() - WINDOW_MS)
    const recentCount = await db.registerOtp.count({
      where: { nomorHP: whatsapp, createdAt: { gte: windowStart } },
    })
    if (recentCount >= MAX_PER_WINDOW) {
      return fail(
        'Terlalu banyak permintaan OTP untuk nomor ini. Coba lagi dalam 15 menit.',
        429,
        'OTP_RATE_LIMITED'
      )
    }

    // Cooldown 60 detik antar pengiriman
    const last = await db.registerOtp.findFirst({
      where: { nomorHP: whatsapp },
      orderBy: { createdAt: 'desc' },
    })
    if (last) {
      const elapsed = Date.now() - last.createdAt.getTime()
      if (elapsed < RESEND_COOLDOWN_MS) {
        const wait = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000)
        return fail(
          `Tunggu ${wait} detik sebelum meminta kode OTP lagi.`,
          429,
          'OTP_COOLDOWN'
        )
      }
    }

    // Buat kode baru & batalkan kode lama yang belum terpakai
    const code = String(Math.floor(100000 + Math.random() * 900000))
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000)

    await db.registerOtp.updateMany({
      where: { nomorHP: whatsapp, consumed: false },
      data: { consumed: true },
    })
    await db.registerOtp.create({
      data: { nomorHP: whatsapp, code, expiresAt },
    })

    const successMessage = `Kode OTP telah dikirim ke WhatsApp ${displayPhone(whatsapp)}`

    // Mode dev/preview — tanpa gateway WhatsApp, kode dikembalikan agar bisa diuji
    const devModeSetting = await db.setting.findUnique({ where: { key: 'otp_dev_mode' } })
    const devMode = devModeSetting?.value === 'true'
    if (devMode) {
      return NextResponse.json({
        ok: true,
        message: successMessage,
        demoCode: code,
        expiresInMinutes: OTP_TTL_SECONDS / 60,
      })
    }

    // Kirim via Fonnte (WhatsApp)
    const companySetting = await db.setting.findUnique({ where: { key: 'company_name' } })
    const appName = companySetting?.value?.trim() || 'Darrell Soft'
    const message =
      `*${appName}*\n\n` +
      `Kode verifikasi WhatsApp Anda:\n` +
      `*${code}*\n\n` +
      `Kode berlaku 5 menit.\n` +
      `Jangan bagikan kode ini kepada siapa pun.`

    const result = await sendWhatsAppMessage(whatsapp, message)
    if (!result.success) {
      // Gateway gagal → fallback mode demo supaya pendaftaran tidak terblokir
      console.warn('[auth/otp/send] Fonnte gagal, fallback demoCode:', result.error)
      return NextResponse.json({
        ok: true,
        message: successMessage,
        demoCode: code,
        expiresInMinutes: OTP_TTL_SECONDS / 60,
        gatewayError: result.error || null,
      })
    }

    return NextResponse.json({
      ok: true,
      message: successMessage,
      expiresInMinutes: OTP_TTL_SECONDS / 60,
    })
  } catch (error) {
    console.error('[auth/otp/send] error:', error)
    const msg = sanitizeError(error, 'Terjadi kesalahan server saat mengirim OTP.')
    return fail(msg, 500, 'SERVER_ERROR')
  }
}
