import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { seedUserData } from '@/lib/auto-seed'
import { sanitizeError } from '@/lib/api-error'
import { normalizePhone, phoneVariants } from '@/lib/phone'
import {
  buildDefaultPermissions,
  buildDefaultSubPermissions,
} from '@/lib/permission-defaults'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { namaLengkap, nomorHP, email, username, password, otpCode } = body

    // Validasi field wajib
    if (!namaLengkap || !nomorHP || !email || !username || !password) {
      return NextResponse.json(
        { error: 'Semua field wajib diisi' },
        { status: 400 }
      )
    }

    if (username.length < 3) {
      return NextResponse.json({ error: 'Username minimal 3 karakter' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password minimal 6 karakter' }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Format email tidak valid' }, { status: 400 })
    }

    const phoneRegex = /^(\+62|62|0)[0-9]{8,13}$/
    if (!phoneRegex.test(nomorHP.replace(/[\s\-]/g, ''))) {
      return NextResponse.json({ error: 'Format nomor handphone tidak valid' }, { status: 400 })
    }

    // Cek username sudah digunakan di calon pembeli atau pengguna
    const existingCalon = await db.calonPembeli.findFirst({ where: { username } })
    if (existingCalon) {
      return NextResponse.json(
        { error: 'Nama Username sudah ada. silahkan gunakan username lain.', code: 'USERNAME_EXISTS' },
        { status: 409 }
      )
    }

    const existingUser = await db.pengguna.findUnique({ where: { username } })
    if (existingUser) {
      // Check if this Pengguna is orphaned (no linked Pembeli and not admin/superadmin)
      // This can happen when a user was deleted from Pembeli/CalonPembeli but Pengguna remained
      if (existingUser.role !== 'admin' && existingUser.role !== 'superadmin') {
        const linkedPembeli = await db.pembeli.findFirst({
          where: { penggunaId: existingUser.id }
        })
        const linkedCalon = await db.calonPembeli.findFirst({
          where: { userId: existingUser.id }
        })
        if (!linkedPembeli && !linkedCalon) {
          // Orphaned record - auto cleanup then allow registration
          await db.pengguna.delete({ where: { id: existingUser.id } })
        } else {
          return NextResponse.json(
            { error: 'Nama Username sudah ada. silahkan gunakan username lain.', code: 'USERNAME_EXISTS' },
            { status: 409 }
          )
        }
      } else {
        return NextResponse.json(
          { error: 'Nama Username sudah ada. silahkan gunakan username lain.', code: 'USERNAME_EXISTS' },
          { status: 409 }
        )
      }
    }

    // Cek email sudah digunakan
    const existingCalonEmail = await db.calonPembeli.findFirst({ where: { email } })
    if (existingCalonEmail) {
      return NextResponse.json({ error: 'Email sudah terdaftar' }, { status: 409 })
    }

    const existingEmail = await db.pengguna.findFirst({ where: { email } })
    if (existingEmail) {
      // Check if orphaned (same logic as username check)
      if (existingEmail.role !== 'admin' && existingEmail.role !== 'superadmin') {
        const linkedPembeli = await db.pembeli.findFirst({
          where: { penggunaId: existingEmail.id }
        })
        const linkedCalon = await db.calonPembeli.findFirst({
          where: { userId: existingEmail.id }
        })
        if (!linkedPembeli && !linkedCalon) {
          // Orphaned record - auto cleanup
          await db.pengguna.delete({ where: { id: existingEmail.id } })
        } else {
          return NextResponse.json({ error: 'Email sudah terdaftar' }, { status: 409 })
        }
      } else {
        return NextResponse.json({ error: 'Email sudah terdaftar' }, { status: 409 })
      }
    }

    // Cek nomor handphone sudah digunakan (CalonPembeli / Pembeli / Pengguna)
    const phoneVariantList = phoneVariants(nomorHP)
    const existingCalonPhone = await db.calonPembeli.findFirst({ where: { nomorHP: { in: phoneVariantList } } })
    if (existingCalonPhone) {
      return NextResponse.json(
        { error: 'Nomor handphone sudah digunakan. Silakan gunakan nomor lain.', code: 'PHONE_EXISTS' },
        { status: 409 }
      )
    }

    const existingPembeliPhone = await db.pembeli.findFirst({ where: { nomorHP: { in: phoneVariantList } } })
    if (existingPembeliPhone) {
      return NextResponse.json(
        { error: 'Nomor handphone sudah digunakan. Silakan gunakan nomor lain.', code: 'PHONE_EXISTS' },
        { status: 409 }
      )
    }

    const existingPenggunaPhone = await db.pengguna.findFirst({ where: { nomorHP: { in: phoneVariantList } } })
    if (existingPenggunaPhone) {
      if (existingPenggunaPhone.role !== 'admin' && existingPenggunaPhone.role !== 'superadmin') {
        const linkedPembeli = await db.pembeli.findFirst({
          where: { penggunaId: existingPenggunaPhone.id }
        })
        const linkedCalon = await db.calonPembeli.findFirst({
          where: { userId: existingPenggunaPhone.id }
        })
        if (!linkedPembeli && !linkedCalon) {
          // Orphaned record - auto cleanup then allow registration
          await db.pengguna.delete({ where: { id: existingPenggunaPhone.id } })
        } else {
          return NextResponse.json(
            { error: 'Nomor handphone sudah digunakan. Silakan gunakan nomor lain.', code: 'PHONE_EXISTS' },
            { status: 409 }
          )
        }
      } else {
        return NextResponse.json(
          { error: 'Nomor handphone sudah digunakan. Silakan gunakan nomor lain.', code: 'PHONE_EXISTS' },
          { status: 409 }
        )
      }
    }

    // Verifikasi OTP WhatsApp — wajib untuk pendaftaran mandiri
    const otpValue = String(otpCode || '').trim()
    if (!/^[0-9]{6}$/.test(otpValue)) {
      return NextResponse.json(
        { error: 'Kode OTP wajib diisi. Klik "Kirim OTP" untuk menerima kode via WhatsApp.', code: 'OTP_REQUIRED' },
        { status: 400 }
      )
    }

    const normalizedPhone = normalizePhone(nomorHP)
    const otpRecord = await db.registerOtp.findFirst({
      where: { nomorHP: normalizedPhone, consumed: false },
      orderBy: { createdAt: 'desc' },
    })

    if (!otpRecord) {
      return NextResponse.json(
        { error: 'Kode OTP tidak ditemukan atau sudah tidak berlaku. Silakan kirim OTP baru.', code: 'OTP_NOT_FOUND' },
        { status: 400 }
      )
    }

    if (otpRecord.expiresAt.getTime() < Date.now()) {
      return NextResponse.json(
        { error: 'Kode OTP sudah kedaluwarsa. Silakan kirim OTP baru.', code: 'OTP_EXPIRED' },
        { status: 400 }
      )
    }

    if (otpRecord.attempts >= 5) {
      return NextResponse.json(
        { error: 'Terlalu banyak percobaan salah. Silakan kirim OTP baru.', code: 'OTP_TOO_MANY_ATTEMPTS' },
        { status: 429 }
      )
    }

    if (otpRecord.code !== otpValue) {
      await db.registerOtp.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      })
      const remaining = Math.max(0, 5 - (otpRecord.attempts + 1))
      return NextResponse.json(
        { error: `Kode OTP salah. Sisa percobaan: ${remaining}.`, code: 'OTP_INVALID' },
        { status: 400 }
      )
    }

    // OTP valid — tandai sudah terpakai (satu kali pakai)
    await db.registerOtp.update({
      where: { id: otpRecord.id },
      data: { consumed: true },
    })

    // Ambil masa aktif demo dari settings
    const demoDaysSetting = await db.setting.findUnique({ where: { key: 'demo_days' } })
    const demoDays = parseInt(demoDaysSetting?.value || '7', 10) || 7

    const expiredDate = new Date()
    expiredDate.setDate(expiredDate.getDate() + demoDays)

    // HANYA buat CalonPembeli (TIDAK buat Pengguna)
    // Data muncul di Calon Pembeli saja, bukan Daftar User
    const calon = await db.calonPembeli.create({
      data: {
        nama: namaLengkap,
        nomorHP,
        email,
        alamat: '',
        catatan: 'Pendaftaran mandiri via halaman Daftar Akun',
        status: 'baru',
        role: 'demo',
        expiredDate,
        username,
        password,
      }
    })

    // Seed sample master data for new account (harga kertas, ongkos cetak, finishing, customer)
    try {
      await seedUserData(calon.id)
    } catch (seedErr) {
      console.warn('⚠️ Seed data error for new user (non-fatal):', seedErr)
    }

    // Generate session untuk langsung login
    const sessionId = randomUUID()
    const singleDeviceSetting = await db.setting.findUnique({ where: { key: 'single_device' } })
    const singleDevice = singleDeviceSetting?.value !== 'false'

    if (singleDevice) {
      await db.setting.upsert({
        where: { key: `session_${username}` },
        update: { value: sessionId },
        create: { key: `session_${username}`, value: sessionId },
      })
    }

    // Build permissions untuk role demo
    // Start with defaults so new features are always included
    const role = 'demo'
    const defaultFeatures = buildDefaultPermissions(role)
    const defaultSubPermissions = buildDefaultSubPermissions(role)
    let features = { ...defaultFeatures }
    let subPermissions = JSON.parse(JSON.stringify(defaultSubPermissions))

    try {
      const customPermsSetting = await db.setting.findUnique({ where: { key: 'role_permissions' } })
      if (customPermsSetting?.value) {
        const allPerms = JSON.parse(customPermsSetting.value)
        if (allPerms[role]) {
          // Merge: custom overrides defaults, but new features from defaults are kept
          if (allPerms[role].features) {
            for (const [key, val] of Object.entries(allPerms[role].features)) {
              features[key] = val
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

    // Demo popup message
    let demoPopupMessage: string | null = null
    let demoRemainingDays: number | null = null
    const defaultDemoMsg = `Selamat datang! Anda sedang menggunakan akun demo.\n\nFitur yang tersedia:\n✅ Potong Kertas\n✅ Hitung Cetakan\n\nUntuk akses penuh ke semua fitur (Master Data, Riwayat, Pengaturan, dll), silakan hubungi administrator.`
    const demoMsgSetting = await db.setting.findUnique({ where: { key: 'demo_message' } })
    demoPopupMessage = demoMsgSetting?.value || defaultDemoMsg
    const remaining = Math.ceil((expiredDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    demoRemainingDays = Math.max(0, remaining)

    // Return auth data + cookies → langsung bisa masuk
    const response = NextResponse.json({
      id: calon.id,
      username,
      name: namaLengkap,
      role: 'demo',
      sessionId,
      singleDevice,
      permissions: { features, subPermissions },
      demoPopupMessage,
      demoRemainingDays,
      registered: true,
    }, { status: 201 })

    // Set cookies pakai CalonPembeli ID sebagai userId
    response.cookies.set('userId', calon.id, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
    response.cookies.set('userRole', 'demo', { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })

    return response
  } catch (error) {
    console.error('Register error:', error)
    const msg = sanitizeError(error, 'Terjadi kesalahan server. Silakan coba lagi.')
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
