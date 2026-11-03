// Catatan halaman terakhir per user (localStorage).
//
// Dipakai agar membuka/refresh aplikasi (root `/`, termasuk start_url PWA
// `/?source=pwa`) mengembalikan pengguna ke HALAMAN TERAKHIR sebelum
// ditutup/di-refresh — bukan selalu ke Beranda (/pembukaan).
//
// - Disimpan per userId (ds_last_route:<userId>) agar profil berbeda di
//   perangkat yang sama tidak saling mengganggu.
// - Rute funnel (landing, login, daftar, pemilihan paket, checkout) dan
//   konsol superadmin (/panel-admin) TIDAK dicatat & TIDAK dipulihkan.
// - Hanya pathname yang disimpan (tanpa query/hash) — pemulihan halaman
//   tetap prediktabel dan aman dari parameter usang.

const SAVE_BLOCKLIST = new Set(['/', '/login', '/daftar', '/pilih-paket', '/checkout'])

function keyFor(userId: string): string {
  return `ds_last_route:${userId}`
}

function normalizePath(path: string): string {
  const base = (path || '').split('?')[0].split('#')[0]
  const trimmed = base.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

function isValidAppPath(path: string): boolean {
  if (!path || path.length > 200) return false
  if (!path.startsWith('/') || path.startsWith('//')) return false
  const clean = normalizePath(path)
  if (SAVE_BLOCKLIST.has(clean)) return false
  if (clean.startsWith('/panel-admin')) return false
  return true
}

/** Catat halaman aplikasi terakhir milik user (dipanggil DashboardLayout tiap rute). */
export function saveLastRoute(userId: string, path: string): void {
  if (typeof window === 'undefined' || !userId || !isValidAppPath(path)) return
  try {
    localStorage.setItem(keyFor(userId), path)
  } catch {
    // penyimpanan penuh / diblokir — abaikan
  }
}

/** Ambil halaman terakhir user; null bila tidak ada / tidak valid untuk dipulihkan. */
export function getLastRoute(userId: string): string | null {
  if (typeof window === 'undefined' || !userId) return null
  try {
    const raw = localStorage.getItem(keyFor(userId))
    if (!raw || !isValidAppPath(raw)) return null
    return raw
  } catch {
    return null
  }
}

/** Hapus catatan halaman terakhir user (dipanggil saat logout via clearAuthUser). */
export function clearLastRoute(userId: string): void {
  if (typeof window === 'undefined' || !userId) return
  try {
    localStorage.removeItem(keyFor(userId))
  } catch {
    // ignore
  }
}
