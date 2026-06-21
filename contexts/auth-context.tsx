'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { User, getAuthUser, clearAuthUser } from '@/lib/auth'

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const pathname = usePathname()

  // Re-read auth from localStorage on mount AND on every route change.
  // This is critical because AuthProvider lives at the root layout and only
  // mounts once for the whole SPA. Without re-reading on pathname change,
  // a user that logs in (or auto-logs-in via checkout payment) on one page
  // would still see `user === null` on the next page until a full reload.
  useEffect(() => {
    try {
      const authUser = getAuthUser()
      setUser(authUser)
    } catch (error) {
      console.error('Error loading auth user:', error)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [pathname])

  // Listen for same-tab auth changes (dispatched by setAuthUser/clearAuthUser)
  // and cross-tab changes (native 'storage' event).
  useEffect(() => {
    const handler = () => {
      try {
        const authUser = getAuthUser()
        setUser(authUser)
      } catch (error) {
        console.error('Error loading auth user:', error)
      }
    }
    window.addEventListener('auth-change', handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener('auth-change', handler)
      window.removeEventListener('storage', handler)
    }
  }, [])

  const logout = () => {
    try {
      clearAuthUser()
      setUser(null)
    } catch (error) {
      console.error('Error logging out:', error)
    }
  }

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
