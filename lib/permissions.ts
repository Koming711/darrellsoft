// /src/lib/permissions.ts
// Central permission system for role-based access control
// Default definitions are in permission-defaults.ts (single source of truth)

import {
  buildDefaultPermissions,
  buildDefaultSubPermissions,
  getDefaultPermissionsForRole,
  getAllDefaultPermissions,
  ALL_FEATURE_IDS,
} from './permission-defaults'

// Re-export for convenience
export { ALL_FEATURE_IDS, getDefaultPermissionsForRole, getAllDefaultPermissions }

// ===== GET PERMISSIONS FROM LOCALSTORAGE =====
interface StoredPermissionData {
  [roleId: string]: {
    features: Record<string, boolean>
    subPermissions: Record<string, Record<string, boolean>>
  }
}

function getStoredPermissionData(): StoredPermissionData | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = localStorage.getItem('permissions')
    if (stored) return JSON.parse(stored)
  } catch {}
  return null
}

function setStoredPermissionData(data: StoredPermissionData) {
  if (typeof window === 'undefined') return
  localStorage.setItem('permissions', JSON.stringify(data))
}

// ===== PUBLIC API =====

/** Get all features a role can access — always merges stored with defaults so new features appear */
export function getFeaturePermissions(roleId: string): Record<string, boolean> {
  const defaults = buildDefaultPermissions(roleId)
  const stored = getStoredPermissionData()
  if (stored && stored[roleId]) {
    // Merge: stored overrides defaults, but new features from defaults are kept
    return { ...defaults, ...stored[roleId].features }
  }
  return defaults
}

/** Get sub-permissions for a role and feature — always merges with defaults */
export function getSubPermissions(roleId: string, featureId: string): Record<string, boolean> {
  const defaults = buildDefaultSubPermissions(roleId)
  const defaultSubs = defaults[featureId] || {}
  const stored = getStoredPermissionData()
  if (stored && stored[roleId]) {
    const subs = stored[roleId].subPermissions[featureId]
    if (subs) return { ...defaultSubs, ...subs }
  }
  return defaultSubs
}

/** Check if a role has page-level access to a feature */
export function hasFeatureAccess(roleId: string, featureId: string): boolean {
  return getFeaturePermissions(roleId)[featureId] || false
}

/** Check if a role has a specific sub-permission (CRUD operation) */
export function hasSubPermission(roleId: string, featureId: string, subId: string): boolean {
  return getSubPermissions(roleId, featureId)[subId] || false
}

/** Save all permissions (called from hak-akses page) */
export function saveAllPermissions(data: StoredPermissionData) {
  setStoredPermissionData(data)
  // Dispatch event so DashboardLayout can re-render sidebar immediately
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('permissions-updated'))
  }
}

/** Save permissions for a specific role */
export function saveRolePermissions(
  roleId: string,
  features: Record<string, boolean>,
  subPermissions: Record<string, Record<string, boolean>>
) {
  const stored = getStoredPermissionData() || {}
  stored[roleId] = { features, subPermissions }
  setStoredPermissionData(stored)
  // Dispatch event so DashboardLayout can re-render sidebar immediately
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('permissions-updated'))
  }
}

/** Map pathname to feature ID for permission checking */
export function getFeatureIdForPath(pathname: string): string | null {
  if (pathname === '/dashboard') return 'dashboard'
  if (pathname === '/pembukaan') return 'pembukaan'
  if (pathname === '/potong-kertas') return 'potong-kertas'
  if (pathname === '/hitung-cetakan') return 'hitung-cetakan'
  if (pathname === '/hitung-finishing') return 'hitung-finishing'
  if (pathname === '/hitung-ongkos-cetak') return 'hitung-ongkos-cetak'
  if (pathname === '/hitung-harga-kertas') return 'hitung-harga-kertas'
  if (pathname === '/master-harga-kertas') return 'master-harga-kertas'
  if (pathname === '/master-ongkos-cetak') return 'master-ongkos-cetak'
  if (pathname === '/master-finishing') return 'master-finishing'
  if (pathname === '/master-customer') return 'master-customer'
  if (pathname === '/master-toko-pemasok') return 'master-toko-pemasok'
  if (pathname === '/riwayat') return 'riwayat'
  if (pathname === '/invoice') return 'invoice'
  if (pathname === '/surat-jalan') return 'surat-jalan'
  if (pathname === '/purchase-order') return 'purchase-order'
  if (pathname === '/administrasi/hak-akses') return 'hak-akses'
  if (pathname === '/administrasi/pengguna') return 'pengguna'
  if (pathname === '/administrasi/pengaturan') return 'pengaturan'
  if (pathname === '/administrasi') return 'pengguna' // default to first accessible admin feature
  return null
}

/** Map feature ID back to a pathname */
export function getPathForFeatureId(featureId: string): string | null {
  const map: Record<string, string> = {
    'dashboard': '/dashboard',
    'pembukaan': '/pembukaan',
    'potong-kertas': '/potong-kertas',
    'hitung-cetakan': '/hitung-cetakan',
    'hitung-finishing': '/hitung-finishing',
    'hitung-ongkos-cetak': '/hitung-ongkos-cetak',
    'hitung-harga-kertas': '/hitung-harga-kertas',
    'master-harga-kertas': '/master-harga-kertas',
    'master-ongkos-cetak': '/master-ongkos-cetak',
    'master-finishing': '/master-finishing',
    'master-customer': '/master-customer',
    'master-toko-pemasok': '/master-toko-pemasok',
    'riwayat': '/riwayat',
    'invoice': '/invoice',
    'surat-jalan': '/surat-jalan',
    'purchase-order': '/purchase-order',
    'hak-akses': '/administrasi/hak-akses',
    'pengguna': '/administrasi/pengguna',
    'pengaturan': '/administrasi/pengaturan',
  }
  return map[featureId] || null
}

/** Get the first accessible page path for a role (used for redirect when access denied) */
export function getFirstAccessiblePath(roleId: string): string | null {
  // Priority order for default landing pages
  const priorityFeatures = ['dashboard', 'pembukaan', 'potong-kertas', 'hitung-cetakan', 'invoice', 'riwayat']
  const features = getFeaturePermissions(roleId)

  for (const featureId of priorityFeatures) {
    if (features[featureId]) {
      const path = getPathForFeatureId(featureId)
      if (path) return path
    }
  }

  // Fall back to any accessible feature
  for (const [featureId, allowed] of Object.entries(features)) {
    if (allowed) {
      const path = getPathForFeatureId(featureId)
      if (path) return path
    }
  }

  return null
}
