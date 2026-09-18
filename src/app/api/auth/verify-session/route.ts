import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import {
  buildDefaultPermissions,
  buildDefaultSubPermissions,
} from '@/lib/permission-defaults'

export async function POST(request: NextRequest) {
  try {
    const { username, sessionId, role } = await request.json()

    if (!username || !sessionId) {
      return NextResponse.json({ valid: true })
    }

    // === CHECK ACCOUNT EXPIRY ===
    // Admin and superadmin are exempt from expiry checks
    const isAdminRole = role === 'admin' || role === 'superadmin'
    if (!isAdminRole) {
      // 1. Check Pengguna.validUntil
      const pengguna = await db.pengguna.findUnique({
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

    const permissions = { features, subPermissions }

    // === SECURITY SETTINGS ===
    // Kebijakan produk: sesi TIDAK berakhir otomatis. Auto-logout idle
    // dimatikan permanen (0) — sesi hanya berakhir lewat logout manual oleh
    // user itu sendiri di aplikasi.
    const securitySettings: { auto_logout_min: number; logout_warning_sec: number } = {
      auto_logout_min: 0,
      logout_warning_sec: 0,
    }

    const cacheHeaders = { 'Cache-Control': 'no-store, max-age=0' }
    const responseBase = { valid: true as const, permissions, securitySettings }

    // Sesi selalu valid selama akun tidak expired. Login di perangkat lain
    // TIDAK lagi mengeluarkan perangkat ini (multi-device tetap login).
    return NextResponse.json(responseBase, { headers: cacheHeaders })
  } catch (error) {
    console.error('Verify session error:', error)
    return NextResponse.json({ valid: true }) // Fail open
  }
}
