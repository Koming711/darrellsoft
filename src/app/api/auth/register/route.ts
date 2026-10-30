import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { seedUserData } from '@/lib/auto-seed'
import { sanitizeError } from '@/lib/api-error'
import { phoneVariants } from '@/lib/phone'
import { emitRealtime } from '@/lib/realtime-notify'
import { registerSchema, zodFieldErrors, displayPhone } from '@/lib/register-schema'
import { hashPassword } from '@/lib/password'
import {
  buildDefaultPermissions,
  buildDefaultSubPermissions,
} from '@/lib/permission-defaults'

export const dynamic = 'force-dynamic'

function fail(message: string, status = 400, code?: string, fieldErrors?: Record<string, string>) {
  return NextResponse.json({ ok: false, message, code, fieldErrors }, { status })
}

/**
 * POST /api/auth/register
 * Alur pendaftaran baru (halaman /daftar): akun baru + verifikasi OTP WhatsApp.
 *
 * Backend memakai model data Darrell Soft yang sudah ada:
 * - Pendaftar mandiri HANYA membuat CalonPembeli (status demo) — aktivasi
 *   tetap melalui persetujuan Admin di menu Calon Pembeli/Pengguna.
 * - OTP diverifikasi dari tabel RegisterOtp (maks 5 percobaan salah).
 * - Username / email / nomor HP harus unik (dengan pembersihan record yatim).
 * - Setelah berhasil: seed data contoh, notifikasi realtime ke admin,
 *   cookie sesi + permissions role demo → user diarahkan ke /pilih-paket.
 *
 * Kontrak respons mengikuti halaman /daftar:
 * { ok: true, message, redirect, id, username, name, role, sessionId, ... }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      return fail('Periksa kembali data Anda', 400, 'VALIDATION', zodFieldErrors(parsed.error))
    }
    const d = parsed.data

    // ===== Verifikasi OTP WhatsApp (RegisterOtp) =====
    const otpRecord = await db.registerOtp.findFirst({
      where: { nomorHP: d.whatsapp, consumed: false },
      orderBy: { createdAt: 'desc' },
    })

    if (!otpRecord) {
      return fail(
        'Kode OTP tidak ditemukan. Silakan minta kode baru.',
        400,
        'OTP_INVALID',
        { otp: 'Kode OTP tidak ditemukan. Silakan minta kode baru.' }
      )
    }
    if (otpRecord.expiresAt.getTime() < Date.now()) {
      return fail(
        'Kode OTP sudah kedaluwarsa. Silakan minta kode baru.',
        400,
        'OTP_EXPIRED',
        { otp: 'Kode OTP sudah kedaluwarsa. Silakan minta kode baru.' }
      )
    }
    if (otpRecord.attempts >= 5) {
      return fail(
        'Terlalu banyak percobaan salah. Silakan minta kode baru.',
        429,
        'OTP_TOO_MANY_ATTEMPTS',
        { otp: 'Terlalu banyak percobaan salah. Silakan minta kode baru.' }
      )
    }
    if (otpRecord.code !== d.otp) {
      await db.registerOtp.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      })
      const remaining = Math.max(0, 5 - (otpRecord.attempts + 1))
      return fail(`Kode OTP salah. Sisa percobaan: ${remaining}.`, 400, 'OTP_WRONG', {
        otp: `Kode OTP salah. Sisa percobaan: ${remaining}.`,
      })
    }

    // ===== Unik: username, email, nomor HP =====
    const fieldErrors: Record<string, string> = {}

    const existingCalonUsername = await db.calonPembeli.findFirst({ where: { username: d.username } })
    const existingUserUsername = await db.pengguna.findFirst({ where: { username: d.username, grupId: null } })
    if (existingCalonUsername) {
      fieldErrors.username = 'Username sudah digunakan'
    } else if (existingUserUsername) {
      if (existingUserUsername.role !== 'admin' && existingUserUsername.role !== 'superadmin') {
        const linkedPembeli = await db.pembeli.findFirst({ where: { penggunaId: existingUserUsername.id } })
        const linkedCalon = await db.calonPembeli.findFirst({ where: { userId: existingUserUsername.id } })
        if (!linkedPembeli && !linkedCalon) {
          // Record yatim (Pengguna tanpa Pembeli/CalonPembeli) — bersihkan lalu izinkan
          await db.pengguna.delete({ where: { id: existingUserUsername.id } })
        } else {
          fieldErrors.username = 'Username sudah digunakan'
        }
      } else {
        fieldErrors.username = 'Username sudah digunakan'
      }
    }

    const existingCalonEmail = await db.calonPembeli.findFirst({ where: { email: d.email } })
    const existingUserEmail = await db.pengguna.findFirst({ where: { email: d.email } })
    if (existingCalonEmail) {
      fieldErrors.email = 'Email sudah digunakan'
    } else if (existingUserEmail) {
      if (existingUserEmail.role !== 'admin' && existingUserEmail.role !== 'superadmin') {
        const linkedPembeli = await db.pembeli.findFirst({ where: { penggunaId: existingUserEmail.id } })
        const linkedCalon = await db.calonPembeli.findFirst({ where: { userId: existingUserEmail.id } })
        if (!linkedPembeli && !linkedCalon) {
          await db.pengguna.delete({ where: { id: existingUserEmail.id } })
        } else {
          fieldErrors.email = 'Email sudah digunakan'
        }
      } else {
        fieldErrors.email = 'Email sudah digunakan'
      }
    }

    const variants = phoneVariants(d.whatsapp)
    const existingCalonPhone = await db.calonPembeli.findFirst({ where: { nomorHP: { in: variants } } })
    const existingPembeliPhone = await db.pembeli.findFirst({ where: { nomorHP: { in: variants } } })
    const existingPenggunaPhone = await db.pengguna.findFirst({ where: { nomorHP: { in: variants } } })
    if (existingCalonPhone || existingPembeliPhone) {
      fieldErrors.whatsapp = 'Nomor WhatsApp sudah terdaftar'
    } else if (existingPenggunaPhone) {
      if (existingPenggunaPhone.role !== 'admin' && existingPenggunaPhone.role !== 'superadmin') {
        const linkedPembeli = await db.pembeli.findFirst({ where: { penggunaId: existingPenggunaPhone.id } })
        const linkedCalon = await db.calonPembeli.findFirst({ where: { userId: existingPenggunaPhone.id } })
        if (!linkedPembeli && !linkedCalon) {
          await db.pengguna.delete({ where: { id: existingPenggunaPhone.id } })
        } else {
          fieldErrors.whatsapp = 'Nomor WhatsApp sudah terdaftar'
        }
      } else {
        fieldErrors.whatsapp = 'Nomor WhatsApp sudah terdaftar'
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      return fail('Data sudah digunakan. Periksa kembali.', 409, 'DUPLICATE', fieldErrors)
    }

    // ===== OTP valid — tandai terpakai (satu kali pakai) =====
    await db.registerOtp.update({
      where: { id: otpRecord.id },
      data: { consumed: true },
    })

    // ===== Masa aktif demo dari settings =====
    const demoDaysSetting = await db.setting.findUnique({ where: { key: 'demo_days' } })
    const demoDays = parseInt(demoDaysSetting?.value || '7', 10) || 7
    const expiredDate = new Date()
    expiredDate.setDate(expiredDate.getDate() + demoDays)

    // ===== Buat CalonPembeli (bukan Pengguna — sama seperti alur lama) =====
    const calon = await db.calonPembeli.create({
      data: {
        nama: d.fullName,
        nomorHP: d.whatsapp,
        email: d.email,
        alamat: '',
        catatan: `Pendaftaran mandiri via halaman Daftar Akun${d.companyName ? ` — Perusahaan: ${d.companyName}` : ''}`,
        status: 'baru',
        role: 'demo',
        expiredDate,
        username: d.username,
        password: hashPassword(d.password), // bcrypt — jangan simpan plaintext
      },
    })

    // Seed data contoh untuk akun baru (harga kertas, ongkos cetak, finishing, customer)
    try {
      await seedUserData(calon.id)
    } catch (seedErr) {
      console.warn('⚠️ Seed data error for new user (non-fatal):', seedErr)
    }

    // Notifikasi realtime → semua admin: pendaftaran akun baru masuk
    emitRealtime({
      type: 'registration',
      title: 'Pendaftaran Akun Baru',
      body: `${d.fullName} (${d.username}) baru saja mendaftar via halaman Daftar Akun.`,
      link: '/administrasi/pengguna',
    })

    // ===== Sesi (single device) =====
    const sessionId = randomUUID()
    const singleDeviceSetting = await db.setting.findUnique({ where: { key: 'single_device' } })
    const singleDevice = singleDeviceSetting?.value !== 'false'

    if (singleDevice) {
      await db.setting.upsert({
        where: { key: `session_${d.username}` },
        update: { value: sessionId },
        create: { key: `session_${d.username}`, value: sessionId },
      })
    }

    // ===== Permissions role demo (defaults + kustomisasi admin) =====
    const role = 'demo'
    const defaultFeatures = buildDefaultPermissions(role)
    const defaultSubPermissions = buildDefaultSubPermissions(role)
    const features = { ...defaultFeatures }
    const subPermissions = JSON.parse(JSON.stringify(defaultSubPermissions))

    try {
      const customPermsSetting = await db.setting.findUnique({ where: { key: 'role_permissions' } })
      if (customPermsSetting?.value) {
        const allPerms = JSON.parse(customPermsSetting.value)
        if (allPerms[role]) {
          if (allPerms[role].features) {
            for (const [key, val] of Object.entries(allPerms[role].features)) {
              features[key] = Boolean(val)
            }
          }
          if (allPerms[role].subPermissions) {
            for (const [group, subs] of Object.entries(allPerms[role].subPermissions)) {
              if (typeof subs === 'object' && subs !== null && !Array.isArray(subs)) {
                subPermissions[group] = { ...(subPermissions[group] || {}), ...(subs as Record<string, boolean>) }
              }
            }
          }
        }
      }
    } catch {}

    // ===== Popup info demo =====
    const defaultDemoMsg = `Selamat datang! Anda sedang menggunakan akun demo.\n\nFitur yang tersedia:\n✅ Potong Kertas\n✅ Hitung Cetakan\n\nUntuk akses penuh ke semua fitur (Master Data, Riwayat, Pengaturan, dll), silakan hubungi administrator.`
    const demoMsgSetting = await db.setting.findUnique({ where: { key: 'demo_message' } })
    const demoPopupMessage = demoMsgSetting?.value || defaultDemoMsg
    const demoRemainingDays = Math.max(0, Math.ceil((expiredDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))

    // ===== Respons + cookie sesi =====
    const response = NextResponse.json(
      {
        ok: true,
        message: `Pendaftaran berhasil! Selamat datang, ${d.fullName}.`,
        registered: true,
        redirect: '/pilih-paket',
        id: calon.id,
        username: d.username,
        name: d.fullName,
        role: 'demo',
        sessionId,
        singleDevice,
        permissions: { features, subPermissions },
        demoPopupMessage,
        demoRemainingDays,
        whatsapp: displayPhone(d.whatsapp),
      },
      { status: 201 }
    )

    // Cookie pakai CalonPembeli ID sebagai userId — sama dengan alur lama
    response.cookies.set('userId', calon.id, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
    response.cookies.set('userRole', 'demo', { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })

    return response
  } catch (error) {
    console.error('[auth/register] error:', error)
    const msg = sanitizeError(error, 'Terjadi kesalahan server. Silakan coba lagi.')
    return fail(msg, 500, 'SERVER_ERROR')
  }
}
