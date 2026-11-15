import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import {
  buildDefaultPermissions,
  buildDefaultSubPermissions,
} from '@/lib/permission-defaults'
import { getServerUser } from '@/lib/server-auth'
import { evaluateSubscriptionAccess, type SubscriptionAccessInfo } from '@/lib/subscription'
import {
  validateDeviceSession,
  getSingleDeviceMessage,
} from '@/lib/device-session'

export async function POST(request: NextRequest) {
  try {
    const { username, sessionId, role, deviceToken } = await request.json()

    // sessionId dipakai untuk cek "Login 1 Perangkat" (saat toggle aktif —
    // setting 'single_device' ≠ 'false'). Username tetap penanda pemanggil sah.
    if (!username) {
      return NextResponse.json({ valid: true })
    }

    // === CHECK ACCOUNT EXPIRY ===
    // Admin and superadmin are exempt from expiry checks
    const isAdminRole = role === 'admin' || role === 'superadmin'
    if (!isAdminRole) {
      // 1. Check Pengguna.validUntil
      // findFirst: username kini per-namespace (grup vs pengelola bisa sama)
      const pengguna = await db.pengguna.findFirst({
        where: { username },
        select: { validUntil: true, id: true }
      })
      if (pengguna?.validUntil && new Date(pengguna.validUntil) < new Date()) {
        return NextResponse.json({
          valid: false,
          expired: true,
          warningMessage: 'Akun sudah expired. Silahkan diperpanjang lagi akunnya.',
          permissions: { features: {}, subPermissions: {} },
          securitySettings: { auto_logout_min: 0, logout_warning_sec: 0 },
        }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
      }

      // 2. Check CalonPembeli.expiredDate (if the user is a CalonPembeli)
      const calon = await db.calonPembeli.findFirst({
        where: { username },
        select: { expiredDate: true }
      })
      if (calon?.expiredDate && new Date(calon.expiredDate) < new Date()) {
        return NextResponse.json({
          valid: false,
          expired: true,
          warningMessage: 'Akun sudah expired. Silahkan diperpanjang lagi akunnya.',
          permissions: { features: {}, subPermissions: {} },
          securitySettings: { auto_logout_min: 0, logout_warning_sec: 0 },
        }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
      }

      // 3. Check Pembeli.expiredDate (if the user is linked to a Pembeli record)
      if (pengguna?.id) {
        const pembeli = await db.pembeli.findFirst({
          where: { penggunaId: pengguna.id },
          select: { expiredDate: true }
        })
        if (pembeli?.expiredDate && new Date(pembeli.expiredDate) < new Date()) {
          return NextResponse.json({
            valid: false,
            expired: true,
            warningMessage: 'Akun sudah expired. Silahkan diperpanjang lagi akunnya.',
            permissions: { features: {}, subPermissions: {} },
            securitySettings: { auto_logout_min: 0, logout_warning_sec: 0 },
          }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
        }
      }

      // 4. GRUP PERUSAHAAN: anggota nonaktif / grup dinonaktifkan → sesi tidak valid
      if (pengguna?.id) {
        const grupMember = await db.grupAnggota.findFirst({
          where: { memberId: pengguna.id, status: { not: 'keluar' } },
          select: { status: true, grupId: true, peran: true, izin: true, grup: { select: { status: true } } },
        })
        if (grupMember) {
          if (grupMember.status === 'nonaktif') {
            return NextResponse.json({
              valid: false,
              expired: true,
              warningMessage: 'Akun Anda dinonaktifkan oleh Owner grup.',
              permissions: { features: {}, subPermissions: {} },
              securitySettings: { auto_logout_min: 0, logout_warning_sec: 0 },
            }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
          }
          if (grupMember.grup.status === 'dinonaktifkan') {
            return NextResponse.json({
              valid: false,
              expired: true,
              warningMessage: 'Grup perusahaan dinonaktifkan. Hubungi admin Darrellsoft.',
              permissions: { features: {}, subPermissions: {} },
              securitySettings: { auto_logout_min: 0, logout_warning_sec: 0 },
            }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
          }
        }
      }
    }

    // === LOAD LATEST PERMISSIONS FROM DATABASE ===
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
              features[key] = val as boolean
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

    const permissions = { features, subPermissions }

    // === SUBSCRIPTION ACCESS GATE ===
    // Aturan pemilik: selama pembayaran BELUM diverifikasi Admin, aplikasi tidak
    // bisa digunakan. Identitas diambil dari cookie/header login (bukan body)
    // agar tidak bisa dipalsukan dari klien. Role admin/superadmin/manager dan
    // role 'user' (akun lama / aktivasi manual Admin) tidak pernah diblokir.
    let subscriptionAccess: SubscriptionAccessInfo | null = null
    try {
      const serverUser = getServerUser(request)
      if (serverUser) {
        const effectiveRole = serverUser.role || role || ''
        const exempt =
          effectiveRole === 'admin' ||
          effectiveRole === 'superadmin' ||
          effectiveRole === 'manager' ||
          effectiveRole === 'user'
        if (!exempt) {
          subscriptionAccess = await evaluateSubscriptionAccess(serverUser.id)
        }
      }
    } catch (gateError) {
      // Jangan pernah gagalkan verify-session karena gate — fail-open seperti cek lain.
      console.error('verify-session subscriptionAccess error:', gateError)
    }

    // === SECURITY SETTINGS ===
    // Kebijakan produk: sesi TIDAK berakhir otomatis. Auto-logout idle
    // dimatikan permanen (0) — sesi hanya berakhir lewat logout manual oleh
    // user itu sendiri di aplikasi.
    const securitySettings: { auto_logout_min: number; logout_warning_sec: number } = {
      auto_logout_min: 0,
      logout_warning_sec: 0,
    }

    const cacheHeaders = { 'Cache-Control': 'no-store, max-age=0' }

    // ===== Info grup perusahaan (RBAC menu klien — sinkron tiap poll) =====
    let grup: { grupId: string; peran: string; status: string; izin: string[] } | null = null
    try {
      const pu = await db.pengguna.findFirst({ where: { username }, select: { id: true } })
      const memberId = pu?.id || getServerUser(request)?.id || ''
      if (memberId) {
        const gm = await db.grupAnggota.findFirst({
          where: { memberId, status: { not: 'keluar' } },
          select: { grupId: true, peran: true, status: true, izin: true },
        })
        if (gm) {
          let izin: string[] = []
          try {
            const parsed = JSON.parse(gm.izin || '[]')
            if (Array.isArray(parsed)) izin = parsed.filter((x: unknown) => typeof x === 'string')
          } catch {}
          grup = { grupId: gm.grupId, peran: gm.peran, status: gm.status, izin }
        }
      }
    } catch {}

    const responseBase = {
      valid: true as const,
      permissions,
      securitySettings,
      grup,
      ...(subscriptionAccess ? { subscriptionAccess } : {}),
    }

    // ===== LOGIN 1 PERANGKAT (validasi sesi perangkat di server) =====
    // PERMINTAAN USER: 1 akun hanya boleh aktif pada 1 perangkat. Validasi
    // berjalan di server pada polling sesi ini (pembukaan halaman aplikasi,
    // pemulihan sesi, dan setiap 10 detik saat aplikasi aktif):
    // - Bila sesi aktif akun milik perangkat LAIN → perangkat ini ditolak
    //   (valid:false + deviceConflict) → klien memaksa logout + peringatan.
    // - Bila sesi perangkat ini DICABUT ADMINISTRATOR → wajib login ulang.
    // - Perangkat belum terdaftar (pasca deploy / logout normal) → didaftar
    //   otomatis sebagai perangkat aktif.
    // - Berlaku untuk SEMUA role (termasuk admin/superadmin).
    // - Fail-open: bila pemeriksaan gagal, sesi tetap dianggap valid.
    try {
      const serverUser = getServerUser(request)
      let userId = serverUser?.id || ''
      const effectiveUsername = username || ''
      if (!userId && username) {
        // Fallback identitas via username (klien tanpa cookie/header).
        const pu = await db.pengguna.findFirst({ where: { username }, select: { id: true, role: true } })
        if (pu) {
          userId = pu.id
        } else {
          const cu = await db.calonPembeli.findFirst({ where: { username }, select: { id: true } })
          if (cu) userId = cu.id
        }
      }
      if (userId) {
        const tokenFromCookie = request.cookies.get('dsDevice')?.value || ''
        const deviceCheck = await validateDeviceSession({
          userId,
          username: effectiveUsername,
          role: serverUser?.role || role || '',
          deviceToken: deviceToken || tokenFromCookie,
          userAgent: request.headers.get('user-agent') || '',
        })
        if (deviceCheck.status === 'conflict') {
          const customMessage = await getSingleDeviceMessage()
          const message =
            deviceCheck.kind === 'session_revoked'
              ? 'Sesi perangkat Anda telah dicabut oleh administrator. Silakan login kembali dari perangkat ini untuk mengaktifkan perangkat.'
              : (customMessage || 'Akun Anda sedang digunakan pada perangkat lain. Demi keamanan akun, satu akun hanya dapat digunakan pada satu perangkat.')
          return NextResponse.json({
            valid: false as const,
            deviceConflict: true,
            warningMessage: message,
            forceLogoutAvailable: false,
            permissions,
            securitySettings,
            grup,
            ...(subscriptionAccess ? { subscriptionAccess } : {}),
          }, { headers: cacheHeaders })
        }
      }
    } catch (sessionCheckError) {
      console.error('verify-session device check error:', sessionCheckError)
    }

    // Sesi selalu valid selama akun tidak expired dan perangkat ini adalah
    // perangkat aktif akun (Login 1 Perangkat).
    return NextResponse.json(responseBase, { headers: cacheHeaders })
  } catch (error) {
    console.error('Verify session error:', error)
    return NextResponse.json({ valid: true }) // Fail open
  }
}
