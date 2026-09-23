import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { normalizePhone, phoneVariants } from '@/lib/phone'
import { sanitizeError } from '@/lib/api-error'

const PHONE_REGEX = /^(\+62|62|0)[0-9]{8,13}$/
const OTP_TTL_SECONDS = 5 * 60          // code valid for 5 minutes
const RESEND_COOLDOWN_MS = 60 * 1000    // min 60s between sends
const MAX_PER_WINDOW = 5                // max 5 codes per phone per 15 minutes
const WINDOW_MS = 15 * 60 * 1000

// POST /api/register/send-otp  { nomorHP }
// Sends a 6-digit OTP via WhatsApp (Fonnte) after checking the number is
// not already used by another account. Returns devCode only when the
// explicit 'otp_dev_mode' setting is 'true' (local/preview testing).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const rawPhone = String(body?.nomorHP || '').trim()

    if (!rawPhone) {
      return NextResponse.json({ error: 'Nomor handphone wajib diisi' }, { status: 400 })
    }

    if (!PHONE_REGEX.test(rawPhone.replace(/[\s\-]/g, ''))) {
      return NextResponse.json(
        { error: 'Format nomor handphone tidak valid. Gunakan format 08xxxxxxxxxx.' },
        { status: 400 }
      )
    }

    const normalized = normalizePhone(rawPhone)
    const variants = phoneVariants(rawPhone)

    // Nomor sudah dipakai? (CalonPembeli / Pembeli / Pengguna)
    const [existingCalon, existingPembeli, existingPengguna] = await Promise.all([
      db.calonPembeli.findFirst({ where: { nomorHP: { in: variants } } }),
      db.pembeli.findFirst({ where: { nomorHP: { in: variants } } }),
      db.pengguna.findFirst({ where: { nomorHP: { in: variants } } }),
    ])
    if (existingCalon || existingPembeli || existingPengguna) {
      return NextResponse.json(
        { error: 'Nomor handphone sudah digunakan. Silakan gunakan nomor lain.', code: 'PHONE_EXISTS' },
        { status: 409 }
      )
    }

    // Rate limit — max 5 OTP per 15 menit per nomor
    const windowStart = new Date(Date.now() - WINDOW_MS)
    const recentCount = await db.registerOtp.count({
      where: { nomorHP: normalized, createdAt: { gte: windowStart } },
    })
    if (recentCount >= MAX_PER_WINDOW) {
      return NextResponse.json(
        { error: 'Terlalu banyak permintaan OTP untuk nomor ini. Coba lagi dalam 15 menit.', code: 'OTP_RATE_LIMITED' },
        { status: 429 }
      )
    }

    // Cooldown 60 detik antar pengiriman
    const last = await db.registerOtp.findFirst({
      where: { nomorHP: normalized },
      orderBy: { createdAt: 'desc' },
    })
    if (last) {
      const elapsed = Date.now() - last.createdAt.getTime()
      if (elapsed < RESEND_COOLDOWN_MS) {
        const wait = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000)
        return NextResponse.json(
          { error: `Tunggu ${wait} detik sebelum meminta kode OTP lagi.`, code: 'OTP_COOLDOWN', waitSeconds: wait },
          { status: 429 }
        )
      }
    }

    // Buat kode OTP baru & batalkan kode lama yang belum terpakai
    const code = String(Math.floor(100000 + Math.random() * 900000))
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000)

    await db.registerOtp.updateMany({
      where: { nomorHP: normalized, consumed: false },
      data: { consumed: true },
    })
    await db.registerOtp.create({
      data: { nomorHP: normalized, code, expiresAt },
    })

    // Dev/preview mode — tanpa Fonnte, kode dikembalikan agar bisa diuji
    const devModeSetting = await db.setting.findUnique({ where: { key: 'otp_dev_mode' } })
    const devMode = devModeSetting?.value === 'true'
    if (devMode) {
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
      `Kode verifikasi WhatsApp Anda:\n` +
      `*${code}*\n\n` +
      `Kode berlaku 5 menit.\n` +
      `Jangan bagikan kode ini kepada siapa pun.`

    const result = await sendWhatsAppMessage(normalized, message)
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Gagal mengirim OTP WhatsApp. Silakan coba lagi.', code: 'OTP_SEND_FAILED' },
        { status: 502 }
      )
    }

    return NextResponse.json({ success: true, expiresInSeconds: OTP_TTL_SECONDS })
  } catch (error) {
    console.error('send-otp error:', error)
    const msg = sanitizeError(error, 'Terjadi kesalahan server saat mengirim OTP.')
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
