'use client'

import { useEffect } from 'react'
import { ShieldAlert, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'

/**
 * Guard Panel Admin — hanya role admin & superadmin yang boleh masuk.
 * Belum login → redirect ke /login. Role lain → kartu "Akses ditolak".
 * (API panel-admin tetap dipagari server-side oleh requireAdmin.)
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()

  useEffect(() => {
    if (!isLoading && !user) {
      window.location.href = '/login'
    }
  }, [isLoading, user])

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="sr-only">Mengalihkan ke halaman login…</span>
      </div>
    )
  }

  if (user.role !== 'admin' && user.role !== 'superadmin') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="bg-card border border-red-200 dark:border-red-800 rounded-2xl p-8 max-w-sm text-center shadow-sm">
          <div className="w-14 h-14 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-7 h-7 text-red-600" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">Akses Ditolak</h2>
          <p className="text-sm text-muted-foreground">
            Panel Admin hanya dapat diakses oleh Admin dan Superadmin.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
