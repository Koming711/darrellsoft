// /src/lib/permission-defaults.ts
// SINGLE SOURCE OF TRUTH for all permission defaults
// Used by: hak-akses page, permissions.ts, login API route
// NEVER duplicate these definitions elsewhere!

// ===== FEATURE DEFINITIONS =====
export const SIMPLE_FEATURES = [
  { id: 'dashboard', name: 'Halaman Utama' },
  { id: 'pembukaan', name: 'Pembukaan' },
  { id: 'potong-kertas', name: 'Potong Kertas' },
  { id: 'hitung-cetakan', name: 'Hitung Cetakan' },
  { id: 'hitung-finishing', name: 'Hitung Finishing' },
  { id: 'hitung-ongkos-cetak', name: 'Hitung Ongkos Cetak' },
  { id: 'hitung-harga-kertas', name: 'Hitung Harga Kertas' },
  { id: 'riwayat', name: 'Riwayat' },
  { id: 'hak-akses', name: 'Hak Akses' },
  { id: 'pengguna', name: 'Pengguna & Pembeli' },
  { id: 'pengaturan', name: 'Pengaturan' },
  { id: 'invoice', name: 'Invoice' },
  { id: 'surat-jalan', name: 'Surat Jalan' },
  { id: 'purchase-order', name: 'Purchase Order' },
]

export const GROUP_FEATURES = [
  {
    id: 'master-customer', name: 'Master Customer',
    subPermissions: [
      { id: 'master-customer-lihat', name: 'Daftar Customer' },
      { id: 'master-customer-tambah', name: 'Tambah Customer' },
      { id: 'master-customer-edit', name: 'Edit Customer' },
      { id: 'master-customer-hapus', name: 'Hapus Customer' },
    ]
  },
  {
    id: 'master-harga-kertas', name: 'Master Harga Kertas',
    subPermissions: [
      { id: 'master-harga-kertas-lihat', name: 'Daftar Harga Kertas' },
      { id: 'master-harga-kertas-tambah', name: 'Tambah Harga Kertas' },
      { id: 'master-harga-kertas-edit', name: 'Edit Harga Kertas' },
      { id: 'master-harga-kertas-hapus', name: 'Hapus Harga Kertas' },
    ]
  },
  {
    id: 'master-ongkos-cetak', name: 'Master Ongkos Cetak',
    subPermissions: [
      { id: 'master-ongkos-cetak-lihat', name: 'Daftar Ongkos Cetak' },
      { id: 'master-ongkos-cetak-tambah', name: 'Tambah Ongkos Cetak' },
      { id: 'master-ongkos-cetak-edit', name: 'Edit Ongkos Cetak' },
      { id: 'master-ongkos-cetak-hapus', name: 'Hapus Ongkos Cetak' },
    ]
  },
  {
    id: 'master-finishing', name: 'Master Finishing',
    subPermissions: [
      { id: 'master-finishing-lihat', name: 'Daftar Finishing' },
      { id: 'master-finishing-tambah', name: 'Tambah Finishing' },
      { id: 'master-finishing-edit', name: 'Edit Finishing' },
      { id: 'master-finishing-hapus', name: 'Hapus Finishing' },
    ]
  },
  {
    id: 'master-toko-pemasok', name: 'Master Suplier',
    subPermissions: [
      { id: 'master-toko-pemasok-lihat', name: 'Daftar Suplier' },
      { id: 'master-toko-pemasok-tambah', name: 'Tambah Suplier' },
      { id: 'master-toko-pemasok-edit', name: 'Edit Suplier' },
      { id: 'master-toko-pemasok-hapus', name: 'Hapus Suplier' },
    ]
  },
  {
    id: 'daftar-pengguna', name: 'Daftar Pengguna',
    subPermissions: [
      { id: 'daftar-pengguna-tambah', name: 'Tambah' },
      { id: 'daftar-pengguna-edit', name: 'Edit' },
      { id: 'daftar-pengguna-hapus', name: 'Hapus' },
    ]
  },
  {
    id: 'calon-pembeli', name: 'Calon Pembeli',
    subPermissions: [
      { id: 'calon-pembeli-tambah', name: 'Tambah' },
      { id: 'calon-pembeli-edit', name: 'Edit' },
      { id: 'calon-pembeli-hapus', name: 'Hapus' },
      { id: 'calon-pembeli-konversi', name: 'Konversi' },
    ]
  },
  {
    id: 'pembeli', name: 'Daftar Pembeli',
    subPermissions: [
      { id: 'pembeli-tambah', name: 'Tambah' },
      { id: 'pembeli-edit', name: 'Edit' },
      { id: 'pembeli-hapus', name: 'Hapus' },
    ]
  },
]

// ===== SIMPLE FEATURE IDS (for server-side use) =====
export const SIMPLE_FEATURE_IDS = SIMPLE_FEATURES.map(f => f.id)
export const GROUP_FEATURE_IDS = GROUP_FEATURES.map(g => g.id)
export const ALL_FEATURE_IDS = [...SIMPLE_FEATURE_IDS, ...GROUP_FEATURE_IDS]

// ===== GROUP SUB-PERMISSION DEFINITIONS (for server-side use) =====
export const GROUP_SUB_DEFINITIONS = GROUP_FEATURES.map(g => ({
  id: g.id,
  subs: g.subPermissions.map(sp => sp.id)
}))

// ===== DEFAULT PERMISSION BUILDERS =====

/** Build default feature permissions for a role (simple boolean map) */
export function buildDefaultPermissions(roleId: string): Record<string, boolean> {
  const perms: Record<string, boolean> = {}

  for (const f of SIMPLE_FEATURES) {
    let allowed = false
    if (roleId === 'superadmin') allowed = true
    else if (roleId === 'admin') allowed = true
    else if (roleId === 'manager') allowed = ['dashboard', 'pembukaan', 'potong-kertas', 'hitung-cetakan', 'hitung-finishing', 'hitung-ongkos-cetak', 'hitung-harga-kertas', 'riwayat', 'invoice', 'surat-jalan', 'purchase-order'].includes(f.id)
    else if (roleId === 'demo') allowed = ['dashboard', 'pembukaan', 'potong-kertas', 'hitung-cetakan', 'hitung-finishing', 'hitung-ongkos-cetak', 'hitung-harga-kertas'].includes(f.id)
    else if (roleId === 'user') allowed = ['dashboard', 'pembukaan', 'potong-kertas', 'hitung-cetakan', 'hitung-finishing', 'hitung-ongkos-cetak', 'hitung-harga-kertas'].includes(f.id)
    perms[f.id] = allowed
  }

  for (const g of GROUP_FEATURES) {
    let anyAllowed = false
    if (roleId === 'superadmin' || roleId === 'admin') anyAllowed = true
    else if (roleId === 'manager') anyAllowed = true
    perms[g.id] = anyAllowed
  }

  return perms
}

/** Build default sub-permissions for a role */
export function buildDefaultSubPermissions(roleId: string): Record<string, Record<string, boolean>> {
  const allSubs: Record<string, Record<string, boolean>> = {}

  for (const group of GROUP_FEATURES) {
    const subs: Record<string, boolean> = {}
    const isFullAccess = roleId === 'superadmin' || roleId === 'admin'
    const isManager = roleId === 'manager'

    for (const sub of group.subPermissions) {
      if (isFullAccess) {
        subs[sub.id] = true
      } else if (isManager) {
        // Manager: lihat, tambah, edit allowed; hapus & konversi not allowed
        subs[sub.id] = sub.id.includes('lihat') || sub.id.includes('tambah') || sub.id.includes('edit')
      } else {
        subs[sub.id] = false
      }
    }
    allSubs[group.id] = subs
  }

  return allSubs
}

/** Get default permissions for a role (combined features + subPermissions) */
export function getDefaultPermissionsForRole(roleId: string) {
  return {
    features: buildDefaultPermissions(roleId),
    subPermissions: buildDefaultSubPermissions(roleId),
  }
}

/** Get ALL default permissions for all standard roles */
export function getAllDefaultPermissions() {
  const roles = ['superadmin', 'admin', 'manager', 'demo', 'user']
  const data: Record<string, ReturnType<typeof getDefaultPermissionsForRole>> = {}
  for (const role of roles) {
    data[role] = getDefaultPermissionsForRole(role)
  }
  return data
}
