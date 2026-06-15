import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { ensureSeedData, seedUserData } from '@/lib/auto-seed'
import { buildDefaultPermissions, buildDefaultSubPermissions } from '@/lib/permission-defaults'
import { sanitizeError } from '@/lib/api-error'

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()

    // Auto-seed global data (users, settings) if not yet seeded
    await ensureSeedData(null)

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username dan password wajib diisi' },
        { status: 400 }
      )
    }

    // 1. Cari di Pengguna (user yang sudah dikonversi/disetujui admin)
    const pengguna = await db.pengguna.findUnique({
      where: { username }
    })

    if (pengguna) {
      if (pengguna.password !== password) {
        return NextResponse.json({ error: 'Username atau password salah' }, { status: 401 })
      }

      if (pengguna.validUntil) {
        if (new Date(pengguna.validUntil) < new Date()) {
          return NextResponse.json({ error: 'Akun sudah expired. Silahkan diperpanjang lagi akunnya.', expired: true }, { status: 403 })
        }
      }

      // For non-admin roles (user, demo, manager), verify they have a Pembeli record
      // This prevents "ghost" accounts that can login but don't appear in any list
      if (pengguna.role !== 'admin' && pengguna.role !== 'superadmin') {
        const pembeli = await db.pembeli.findFirst({
          where: { penggunaId: pengguna.id }
        })
        const calonCheck = await db.calonPembeli.findFirst({
          where: { userId: pengguna.id }
        })
        if (!pembeli && !calonCheck) {
          // Orphaned Pengguna - auto cleanup and deny login
          try {
            await db.calonPembeli.updateMany({
              where: { userId: pengguna.id },
              data: { userId: null }
            })
            await db.pengguna.delete({ where: { id: pengguna.id } })
          } catch {}
          return NextResponse.json({ error: 'Akun tidak terdaftar sebagai pembeli. Silakan daftar ulang.' }, { status: 403 })
        }
        if (!pembeli) {
          return NextResponse.json({ error: 'Akun tidak terdaftar sebagai pembeli. Hubungi administrator.' }, { status: 403 })
        }
      }

      return await buildLoginResponse(pengguna.id, pengguna.username, pengguna.namaLengkap, pengguna.role, pengguna.validUntil, username)
    }

    // 2. Tidak ditemukan di Pengguna → cek di CalonPembeli
    const calon = await db.calonPembeli.findFirst({
      where: { username }
    })

    if (calon) {
      if (calon.password !== password) {
        return NextResponse.json({ error: 'Username atau password salah' }, { status: 401 })
      }

      // Status "ditolak" → blokir
      if (calon.status === 'ditolak') {
        return NextResponse.json({ error: 'Pendaftaran Anda ditolak oleh administrator.', rejected: true }, { status: 403 })
      }

      // Check expiry date for CalonPembeli
      if (calon.expiredDate && new Date(calon.expiredDate) < new Date()) {
        return NextResponse.json({ error: 'Akun sudah expired. Silahkan diperpanjang lagi akunnya.', expired: true }, { status: 403 })
      }

      // Status "baru" atau "aktif" → langsung izinkan login
      // Pakai CalonPembeli ID sebagai userId, role = demo
      const role = calon.role || 'demo'
      return await buildLoginResponse(calon.id, calon.username || username, calon.nama, role, calon.expiredDate, calon.username || username)
    }

    // 3. Tidak ditemukan di mana pun
    return NextResponse.json({ error: 'Username atau password salah' }, { status: 401 })
  } catch (error) {
    console.error('Login error:', error)
    const message = sanitizeError(error, 'Terjadi kesalahan server')
    return NextResponse.json({ error: 'Terjadi kesalahan server', details: message }, { status: 500 })
  }
}

// Shared helper: build login response with session, cookies, permissions
async function buildLoginResponse(
  userId: string,
  username: string,
  name: string,
  role: string,
  validUntil: Date | null,
  usernameForSession: string
): Promise<NextResponse> {
  const sessionId = randomUUID()

  // Check single device setting
  const singleDeviceSetting = await db.setting.findUnique({ where: { key: 'single_device' } })
  const singleDevice = singleDeviceSetting?.value !== 'false'

  if (singleDevice || role === 'admin' || role === 'superadmin') {
    await db.setting.upsert({
      where: { key: `session_${usernameForSession}` },
      update: { value: sessionId },
      create: { key: `session_${usernameForSession}`, value: sessionId },
    })
  }

  // Get demo popup message and remaining days for demo users
  let demoPopupMessage: string | null = null
  let demoRemainingDays: number | null = null
  if (role === 'demo') {
    const defaultDemoMsg = `Selamat datang! Anda sedang menggunakan akun demo.\n\nFitur yang tersedia:\n✅ Potong Kertas\n✅ Hitung Cetakan\n\nUntuk akses penuh ke semua fitur (Master Data, Riwayat, Pengaturan, dll), silakan hubungi administrator.`
    const demoMsgSetting = await db.setting.findUnique({ where: { key: 'demo_message' } })
    demoPopupMessage = demoMsgSetting?.value || defaultDemoMsg
    if (validUntil) {
      const remaining = Math.ceil((new Date(validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      demoRemainingDays = Math.max(0, remaining)
    }
  }

  // Seed sample master data in background - don't block login response
  // This handles the case where existing accounts were created before auto-seed was added
  seedUserData(userId).catch(seedErr => {
    console.warn('⚠️ Seed data error during login (non-fatal):', seedErr)
  })

  // Load custom permissions from database
  // Start with defaults so new features are always included
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

  const response = NextResponse.json({
    id: userId,
    username,
    name,
    role,
    sessionId,
    singleDevice,
    permissions: { features, subPermissions },
    ...(demoPopupMessage ? { demoPopupMessage, demoRemainingDays } : {}),
  })

  response.cookies.set('userId', userId, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  response.cookies.set('userRole', role, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })

  return response
}
