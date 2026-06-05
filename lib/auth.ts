// Authentication utility functions

export interface User {
  id?: string
  username: string
  password: string
  name?: string
  role?: string
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
}

export function clearAuthUser(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem('auth')
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
