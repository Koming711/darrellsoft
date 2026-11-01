// Authentication utility functions

export interface User {
  id?: string
  username: string
  /** Password is only present on the login form payload, never persisted to
   *  localStorage. Marked optional so the stored auth user (id/username/name/
   *  role/sessionId) satisfies this type. */
  password?: string
  name?: string
  role?: string
  sessionId?: string
  /** Info grup perusahaan (owner/anggota) — ikut disimpan ke grup_info. */
  grup?: { grupId: string; peran: string; status: string; izin: string[] } | null
}

// Custom event name dispatched whenever localStorage 'auth' changes.
// AuthProvider listens for this (plus 'storage' for cross-tab) so that the
// `user` state stays in sync even when auth is written from another component
// (e.g. PaymentDialog auto-login) without a full page reload.
export const AUTH_CHANGE_EVENT = 'auth-change'

function notifyAuthChange() {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT))
  } catch {
    // ignore (very old browsers)
  }
}

export function getAuthUser(): User | null {
  if (typeof window === 'undefined') return null

  const authData = localStorage.getItem('auth')
  if (!authData) return null
  try {
    const parsed = JSON.parse(authData) as User
    // Self-heal: cookie sesi bisa terhapus sendiri (dibersihkan browser /
    // WebView dgn kebijakan cookie) sementara localStorage bertahan — tanpa
    // sinkron ini UI masih "login" tapi semua API berbasis cookie membalas
    // 401 / daftar kosong (mis. dropdown Harga Customer tidak berisi).
    ensureAuthCookies(parsed)
    return parsed
  } catch {
    return null
  }
}

const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 10 // 10 tahun — sama dgn login

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : null
}

/**
 * Sinkronkan cookie sesi (userId/userRole) dgn identitas di localStorage.
 *
 * Cookie ini memang tidak httpOnly (logout pun menghapusnya via
 * document.cookie), jadi menulisnya ulang dari klien konsisten dgn model
 * keamanan aplikasi. Atribut cookie disamakan dgn yang di-set API login
 * (path=/, max-age 10 tahun, samesite=lax).
 *
 * Bila cookie ditolak browser sepenuhnya, tulisan ini gagal diam-diam —
 * permintaan API masih bisa terautentikasi lewat header x-user-id/
 * x-user-role pada fetch yang memakai authFetch.
 */
export function ensureAuthCookies(user?: User): void {
  if (typeof document === 'undefined') return
  let u = user
  if (!u) {
    try {
      const raw = localStorage.getItem('auth')
      u = raw ? (JSON.parse(raw) as User) : null
    } catch {
      u = null
    }
  }
  if (!u?.id) return
  const wantId = u.id
  const wantRole = u.role || ''
  if (
    readCookie('userId') === wantId &&
    (!wantRole || readCookie('userRole') === wantRole)
  ) {
    return // sudah sinkron — jangan tulis ulang tiap panggilan
  }
  try {
    const attrs = `path=/; max-age=${AUTH_COOKIE_MAX_AGE}; samesite=lax`
    document.cookie = `userId=${encodeURIComponent(wantId)}; ${attrs}`
    if (wantRole) document.cookie = `userRole=${encodeURIComponent(wantRole)}; ${attrs}`
  } catch {
    // cookie diblokir browser — biarkan authFetch mengirim header identitas
  }
}

export function setAuthUser(user: User): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('auth', JSON.stringify(user))
  // Pastikan cookie sesi ikut ter-set — alur login non-API (mis. auto-login
  // PaymentDialog) tidak melewati endpoint login yang men-set cookie.
  ensureAuthCookies(user)
  // Info grup perusahaan (RBAC menu anggota grup) — sinkron dgn cache klien
  try {
    if (user.grup) {
      localStorage.setItem('grup_info', JSON.stringify(user.grup))
    }
  } catch {
    // ignore
  }
  notifyAuthChange()
}

export function clearAuthUser(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem('auth')
  // Hapus juga cache RBAC grup perusahaan
  try {
    localStorage.removeItem('grup_info')
  } catch {
    // ignore
  }
  // Logout manual harus menghapus JUGA cookie sesi (userId, userRole) yang
  // di-set oleh API login. Tanpa ini server masih menganggap browser login
  // dan pengguna bisa "ter-logged in" kembali secara tidak sengaja.
  try {
    document.cookie = 'userId=; Max-Age=0; path=/'
    document.cookie = 'userRole=; Max-Age=0; path=/'
  } catch {
    // ignore
  }
  notifyAuthChange()
}

export function isAuthenticated(): boolean {
  return getAuthUser() !== null
}

export function logout(): void {
  clearAuthUser()
}

/**
 * Get auth headers for API requests.
 * Includes x-user-id and x-user-role so server can identify the user
 * for strict per-user data isolation.
 */
export function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const user = getAuthUser()
  if (!user) return {}
  const headers: Record<string, string> = {}
  if (user.id) headers['x-user-id'] = user.id
  if (user.role) headers['x-user-role'] = user.role
  return headers
}
