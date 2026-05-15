import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// Helper: build default permissions (server-side)
function buildDefaultPermissions(roleId: string): Record<string, boolean> {
  const simpleFeatures = ['potong-kertas', 'hitung-cetakan', 'hitung-finishing', 'hitung-ongkos-cetak', 'hitung-harga-kertas', 'riwayat', 'hak-akses', 'pengguna', 'pengaturan']
  const groupFeatures = ['master-customer', 'master-harga-kertas', 'master-ongkos-cetak', 'master-finishing', 'daftar-pengguna', 'calon-pembeli', 'pembeli']
  const perms: Record<string, boolean> = {}
  for (const f of simpleFeatures) {
    let allowed = false
    if (roleId === 'superadmin') allowed = true
    else if (roleId === 'admin') allowed = true
    else if (roleId === 'manager') allowed = ['potong-kertas', 'hitung-cetakan', 'hitung-finishing', 'hitung-ongkos-cetak', 'hitung-harga-kertas', 'riwayat'].includes(f)
    else if (roleId === 'demo' || roleId === 'user') allowed = ['potong-kertas', 'hitung-cetakan', 'hitung-finishing', 'hitung-ongkos-cetak', 'hitung-harga-kertas'].includes(f)
    perms[f] = allowed
  }
  for (const g of groupFeatures) {
    perms[g] = roleId === 'superadmin' || roleId === 'admin' || roleId === 'manager'
  }
  return perms
}

function buildDefaultSubPermissions(roleId: string): Record<string, Record<string, boolean>> {
  const groupDefs = [
    { id: 'master-customer', subs: ['master-customer-tambah', 'master-customer-edit', 'master-customer-hapus'] },
    { id: 'master-harga-kertas', subs: ['master-harga-kertas-lihat', 'master-harga-kertas-tambah', 'master-harga-kertas-edit', 'master-harga-kertas-hapus'] },
    { id: 'master-ongkos-cetak', subs: ['master-ongkos-cetak-lihat', 'master-ongkos-cetak-tambah', 'master-ongkos-cetak-edit', 'master-ongkos-cetak-hapus'] },
    { id: 'master-finishing', subs: ['master-finishing-lihat', 'master-finishing-tambah', 'master-finishing-edit', 'master-finishing-hapus'] },
    { id: 'daftar-pengguna', subs: ['daftar-pengguna-tambah', 'daftar-pengguna-edit', 'daftar-pengguna-hapus'] },
    { id: 'calon-pembeli', subs: ['calon-pembeli-tambah', 'calon-pembeli-edit', 'calon-pembeli-hapus', 'calon-pembeli-konversi'] },
    { id: 'pembeli', subs: ['pembeli-tambah', 'pembeli-edit', 'pembeli-hapus'] },
  ]
  const allSubs: Record<string, Record<string, boolean>> = {}
  const isFull = roleId === 'superadmin' || roleId === 'admin'
  const isManager = roleId === 'manager'
  for (const group of groupDefs) {
    const subs: Record<string, boolean> = {}
    for (const sub of group.subs) {
      if (isFull) subs[sub] = true
      else if (isManager) subs[sub] = sub.includes('tambah') || sub.includes('edit')
      else subs[sub] = false
    }
    allSubs[group.id] = subs
  }
  return allSubs
}

export async function POST(request: NextRequest) {
  try {
    const { username, sessionId, role } = await request.json()

    if (!username || !sessionId) {
      return NextResponse.json({ valid: true })
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

    // Admin and superadmin always have session tracking (regardless of single_device setting)
    const isAdminRole = role === 'admin' || role === 'superadmin'

    // Load security settings (auto-logout, warning) in the same response
    let securitySettings: { auto_logout_min: number; logout_warning_sec: number } = { auto_logout_min: 0, logout_warning_sec: 0 }
    try {
      const allSettings = await db.setting.findMany({
        where: { key: { in: ['auto_logout_min', 'logout_warning_sec'] } }
      })
      for (const s of allSettings) {
        if (s.key === 'auto_logout_min') securitySettings.auto_logout_min = parseInt(s.value || '0', 10) || 0
        if (s.key === 'logout_warning_sec') securitySettings.logout_warning_sec = parseInt(s.value || '0', 10) || 0
      }
    } catch {}

    // Check single device setting
    const singleDeviceSetting = await db.setting.findUnique({ where: { key: 'single_device' } })
    const singleDevice = singleDeviceSetting?.value !== 'false'

    const cacheHeaders = { 'Cache-Control': 'no-store, max-age=0' }
    const responseBase = { valid: true as const, permissions, securitySettings }

    if (!singleDevice && !isAdminRole) {
      return NextResponse.json(responseBase, { headers: cacheHeaders })
    }

    // Get stored session for this username
    const stored = await db.setting.findUnique({
      where: { key: `session_${username}` }
    })

    // If no stored session or session matches, it's valid
    if (!stored || stored.value === sessionId) {
      return NextResponse.json(responseBase, { headers: cacheHeaders })
    }

    // Session mismatch - another device logged in
    const warningMsgSetting = await db.setting.findUnique({ where: { key: 'single_device_message' } })
    const warningMessage = warningMsgSetting?.value || 'Akun Anda sedang digunakan di perangkat lain.'

    return NextResponse.json({
      valid: false,
      warningMessage,
      forceLogoutAvailable: true,
      permissions,
      securitySettings,
    }, { headers: cacheHeaders })
  } catch (error) {
    console.error('Verify session error:', error)
    return NextResponse.json({ valid: true }) // Fail open
  }
}
