'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
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

  // Load user from localStorage on mount
  useEffect(() => {
    try {
      const authUser = getAuthUser()
      if (authUser) {
        setUser(authUser)
      }
    } catch (error) {
      console.error('Error loading auth user:', error)
    } finally {
      setIsLoading(false)
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
