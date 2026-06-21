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
    return JSON.parse(authData)
  } catch {
    return null
  }
}

export function setAuthUser(user: User): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('auth', JSON.stringify(user))
  notifyAuthChange()
}

export function clearAuthUser(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem('auth')
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
