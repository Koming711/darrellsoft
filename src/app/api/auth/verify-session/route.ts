import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import {
  buildDefaultPermissions,
  buildDefaultSubPermissions,
} from '@/lib/permission-defaults'
import { getServerUser } from '@/lib/server-auth'
import { evaluateSubscriptionAccess, type SubscriptionAccessInfo } from '@/lib/subscription'

export async function POST(request: NextRequest) {
  try {
    const { username, sessionId, role } = await request.json()

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

    // ===== LOGIN 1 PERANGKAT (single-device session guard) =====
    // PERMINTAAN USER: toggle "Login 1 Perangkat" di Halaman Hak Akses → Keamanan
    // harus benar-benar berfungsi. Bila setting 'single_device' aktif (≠ 'false')
    // dan sessionId perangkat ini ≠ sesi tersimpan (ada login lebih baru di
    // perangkat lain), sesi dianggap tidak valid → klien menampilkan popup
    // peringatan multi-perangkat dengan opsi klaim ulang sesi (reclaim-session).
    // - Admin/superadmin dikecualikan (operator aplikasi — konsisten dengan
    //   pengecualian cek expired di atas).
    // - Fail-open: bila pemeriksaan gagal, sesi tetap dianggap valid.
    let singleDeviceMismatch: { warningMessage: string } | null = null
    try {
      if (!isAdminRole && sessionId) {
        const singleDeviceSetting = await db.setting.findUnique({ where: { key: 'single_device' } })
        if (singleDeviceSetting?.value !== 'false') {
          const storedSession = await db.setting.findUnique({ where: { key: `session_${username}` } })
          if (storedSession && storedSession.value !== sessionId) {
            const warningMsgSetting = await db.setting.findUnique({ where: { key: 'single_device_message' } })
            singleDeviceMismatch = {
              warningMessage: warningMsgSetting?.value || 'Akun Anda sedang digunakan di perangkat lain.',
            }
          }
        }
      }
    } catch (sessionCheckError) {
      console.error('verify-session single-device check error:', sessionCheckError)
    }

    if (singleDeviceMismatch) {
      return NextResponse.json({
        valid: false as const,
        warningMessage: singleDeviceMismatch.warningMessage,
        forceLogoutAvailable: true,
        permissions,
        securitySettings,
        grup,
        ...(subscriptionAccess ? { subscriptionAccess } : {}),
      }, { headers: cacheHeaders })
    }

    // Sesi selalu valid selama akun tidak expired dan (bila toggle aktif)
    // tidak dipindahkan ke perangkat lain oleh login yang lebih baru.
    return NextResponse.json(responseBase, { headers: cacheHeaders })
  } catch (error) {
    console.error('Verify session error:', error)
    return NextResponse.json({ valid: true }) // Fail open
  }
}
