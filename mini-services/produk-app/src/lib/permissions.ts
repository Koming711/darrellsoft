// Matrix izin berbasis peran — dipakai bersama oleh server (API) dan klien (UI).
export type Role = 'OWNER' | 'ADMIN' | 'SALES' | 'STAFF'

export type Permission =
  | 'customers:write'
  | 'products:write'
  | 'prices:read'
  | 'prices:write'
  | 'invoices:read'
  | 'invoices:write'
  | 'invoices:pay'
  | 'invoices:delete'
  | 'manual_price'
  | 'reports:read'

export const PERMISSION_MATRIX: Record<Permission, Role[]> = {
  'customers:write': ['OWNER', 'ADMIN'],
  'products:write': ['OWNER', 'ADMIN'],
  'prices:read': ['OWNER', 'ADMIN', 'SALES', 'STAFF'],
  'prices:write': ['OWNER', 'ADMIN'],
  'invoices:read': ['OWNER', 'ADMIN', 'SALES', 'STAFF'],
  'invoices:write': ['OWNER', 'ADMIN', 'SALES'],
  'invoices:pay': ['OWNER', 'ADMIN'],
  'invoices:delete': ['OWNER', 'ADMIN'],
  'manual_price': ['OWNER', 'ADMIN', 'SALES'],
  'reports:read': ['OWNER', 'ADMIN', 'SALES', 'STAFF'],
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  SALES: 'Staf Penjualan',
  STAFF: 'Staf',
}

export const PERMISSION_LABELS: Record<Permission, string> = {
  'customers:write': 'mengelola customer',
  'products:write': 'mengelola produk',
  'prices:read': 'melihat harga customer',
  'prices:write': 'mengelola harga customer',
  'invoices:read': 'melihat invoice',
  'invoices:write': 'membuat/mengubah invoice',
  'invoices:pay': 'mencatat pembayaran',
  'invoices:delete': 'menghapus invoice',
  'manual_price': 'mengubah harga manual pada invoice',
  'reports:read': 'melihat laporan',
}

export function can(role: Role | undefined | null, perm: Permission): boolean {
  if (!role) return false
  return PERMISSION_MATRIX[perm]?.includes(role) ?? false
}
