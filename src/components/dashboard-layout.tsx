'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Sidebar, MobileHeader } from './sidebar'
import { useRouter, usePathname } from 'next/navigation'
import { getAuthUser, clearAuthUser } from '@/lib/auth'
import { hasFeatureAccess, getFeatureIdForPath, saveRolePermissions } from '@/lib/permissions'
import { authFetch } from '@/lib/auth-fetch'
import { AlertTriangle, LogOut, Smartphone, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'

interface DashboardLayoutProps {
  children: React.ReactNode
  title?: string
  subtitle?: string
}

export function DashboardLayout({ children, title, subtitle }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<any>(null)
  const router = useRouter()
  const pathname = usePathname()

  // === SESSION CHECK STATE ===
  const [sessionWarning, setSessionWarning] = useState<string | null>(null)
  const [forceLogoutAvailable, setForceLogoutAvailable] = useState(false)
  const [isReclaiming, setIsReclaiming] = useState(false)
  const sessionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // === AUTO-LOGOUT STATE ===
  const lastActivityRef = useRef(Date.now())
  const countdownActiveRef = useRef(false)
  const [autoLogoutMin, setAutoLogoutMin] = useState(0)
  const [logoutWarningSec, setLogoutWarningSec] = useState(0)
  const [showCountdown, setShowCountdown] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const autoLogoutIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // === NO ACCESS STATE ===
  const [noAccess, setNoAccess] = useState(false)

  // === USER PROFILE (for header dates) ===
  const [userProfile, setUserProfile] = useState<{ createdAt: string | null; validUntil: string | null } | null>(null)

  // === PERMISSION VERSION (forces re-render of Sidebar when permissions update) ===
  const [permVersion, setPermVersion] = useState(0)

  // Listen for permission updates from hak-akses page (immediate re-render)
  useEffect(() => {
    const handler = () => setPermVersion(v => v + 1)
    window.addEventListener('permissions-updated', handler)
    return () => window.removeEventListener('permissions-updated', handler)
  }, [])

  // === LOGOUT HANDLER ===
  const handleLogout = useCallback(() => {
    clearAuthUser()
    if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current)
    if (autoLogoutIntervalRef.current) clearInterval(autoLogoutIntervalRef.current)
    sessionIntervalRef.current = null
    autoLogoutIntervalRef.current = null
    router.push('/')
  }, [router])

  // Stay logged in handler (resets activity + dismisses countdown)
  const handleStayLoggedIn = useCallback(() => {
    lastActivityRef.current = Date.now()
    countdownActiveRef.current = false
    setShowCountdown(false)
    setCountdown(0)
  }, [])

  // === INITIAL AUTH + SETTINGS LOAD ===
  useEffect(() => {
    let cancelled = false

    const init = async () => {
      try {
        const authUser = getAuthUser()
        if (!authUser) {
          router.push('/')
          setReady(true)
          return
        }
        if (cancelled) return
        setUser(authUser)

        // Fetch user profile for header dates (fire and forget)
        authFetch('/api/auth/me')
          .then(r => r.ok ? r.json() : null)
          .then(data => { if (data && !cancelled) setUserProfile({ createdAt: data.createdAt || null, validUntil: data.validUntil || null }) })
          .catch(() => {})

        // Check page-level permissions
        const featureId = getFeatureIdForPath(pathname)
        if (featureId && authUser.role && authUser.role !== 'superadmin') {
          if (!hasFeatureAccess(authUser.role, featureId)) {
            setNoAccess(true)
            setReady(true)
            return
          }
        }

        // Wait for session verification BEFORE setting ready
        // This ensures auth is validated before children start fetching data
        try {
          const sessionRes = await authFetch('/api/auth/verify-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: authUser.username, sessionId: authUser.sessionId, role: authUser.role }),
          })
          if (cancelled) return
          const data = await sessionRes.json()
          if (cancelled) return

          // Load security settings from verify-session response
          if (data.securitySettings) {
            setAutoLogoutMin(data.securitySettings.auto_logout_min || 0)
            setLogoutWarningSec(data.securitySettings.logout_warning_sec || 0)
          }
          // Sync latest permissions from server to localStorage
          if (data.permissions && authUser.role) {
            saveRolePermissions(authUser.role, data.permissions.features, data.permissions.subPermissions)
            setPermVersion(v => v + 1)
          }
          if (!data.valid && data.warningMessage) {
            setSessionWarning(data.warningMessage)
            setForceLogoutAvailable(!!data.forceLogoutAvailable)
          }
        } catch {
          // Session verification failed (network error etc.) - continue anyway
          // Don't block the entire app if verify-session is down
        }

      } catch {
        router.push('/')
      } finally {
        if (!cancelled) setReady(true)
      }
    }

    init()

    return () => { cancelled = true }
  }, [router])

  // === PERMISSION CHECK ON ROUTE CHANGE ===
  useEffect(() => {
    if (!user || !ready) return
    if (user.role === 'superadmin') { setNoAccess(false); return }

    const featureId = getFeatureIdForPath(pathname)
    if (featureId) {
      const allowed = hasFeatureAccess(user.role, featureId)
      setNoAccess(!allowed)
      if (!allowed) {
        router.replace('/')
      }
    } else {
      setNoAccess(false)
    }
  }, [pathname, user, ready, router, permVersion])

  // === PERIODIC SESSION CHECK (every 30s) ===
  useEffect(() => {
    if (!ready || !user) return

    sessionIntervalRef.current = setInterval(() => {
      const authUser = getAuthUser()
      if (!authUser || !authUser.sessionId) return

      authFetch('/api/auth/verify-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUser.username, sessionId: authUser.sessionId, role: authUser.role }),
      })
      .then(r => r.json())
      .then(data => {
        if (!data.valid && data.warningMessage) {
          setSessionWarning(data.warningMessage)
          setForceLogoutAvailable(!!data.forceLogoutAvailable)
        }
        // Sync latest permissions from server to localStorage
        if (data.permissions && authUser.role) {
          saveRolePermissions(authUser.role, data.permissions.features, data.permissions.subPermissions)
          setPermVersion(v => v + 1) // force re-render of Sidebar
        }
        // Sync security settings
        if (data.securitySettings) {
          setAutoLogoutMin(data.securitySettings.auto_logout_min || 0)
          setLogoutWarningSec(data.securitySettings.logout_warning_sec || 0)
        }
      })
      .catch(() => {})
    }, 10000) // sync every 10 seconds

    return () => {
      if (sessionIntervalRef.current) {
        clearInterval(sessionIntervalRef.current)
        sessionIntervalRef.current = null
      }
    }
  }, [ready, user])

  // === ACTIVITY LISTENERS ===
  useEffect(() => {
    const events = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'] as const
    const handler = () => { lastActivityRef.current = Date.now() }
    events.forEach(e => window.addEventListener(e, handler, { passive: true }))
    return () => events.forEach(e => window.removeEventListener(e, handler))
  }, [])

  // === AUTO-LOGOUT INTERVAL ===
  useEffect(() => {
    if (!ready) return

    autoLogoutIntervalRef.current = setInterval(() => {
      if (autoLogoutMin === 0) return

      const elapsed = (Date.now() - lastActivityRef.current) / 1000
      const autoLogoutSec = autoLogoutMin * 60

      // Trigger logout
      if (elapsed >= autoLogoutSec) {
        handleLogout()
        return
      }

      // Show/update countdown warning
      if (logoutWarningSec > 0 && elapsed >= autoLogoutSec - logoutWarningSec) {
        countdownActiveRef.current = true
        setShowCountdown(true)
        setCountdown(Math.ceil(autoLogoutSec - elapsed))
      } else if (countdownActiveRef.current) {
        // User became active again, dismiss countdown
        countdownActiveRef.current = false
        setShowCountdown(false)
        setCountdown(0)
      }
    }, 1000)

    return () => {
      if (autoLogoutIntervalRef.current) {
        clearInterval(autoLogoutIntervalRef.current)
        autoLogoutIntervalRef.current = null
      }
    }
  }, [ready, autoLogoutMin, logoutWarningSec, handleLogout])

  // === LOADING STATE ===
  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) return null

  // === NO ACCESS SCREEN ===
  if (noAccess) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--app-content-bg)' }}>
        <Sidebar
          username={user?.username || 'User'}
          role={user?.role}
          onLogout={handleLogout}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
        />
        <div className="transition-all duration-300">
          <MobileHeader onMenuToggle={() => setSidebarOpen(!sidebarOpen)} username={user?.username} title={title} subtitle={subtitle} userProfile={userProfile} />
          <main className="p-4 lg:p-8">
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Akses Ditolak</h2>
              <p className="text-sm text-slate-500 max-w-md">
                Anda tidak memiliki izin untuk mengakses halaman ini.
                Hubungi administrator jika Anda membutuhkan akses.
              </p>
              <button
                onClick={() => router.push('/')}
                className="mt-4 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors"
              >
                Kembali ke Beranda
              </button>
            </div>
          </main>
        </div>
      </div>
    )
  }

  // === RENDER ===
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--app-content-bg)' }}>
      <Sidebar
        username={user?.username || 'User'}
        role={user?.role}
        onLogout={handleLogout}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        permVersion={permVersion}
      />

      <div className="transition-all duration-300">
        <MobileHeader
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
          username={user?.username}
          title={title}
          subtitle={subtitle}
          userProfile={userProfile}
        />

        {/* Main Content */}
        <main className="p-4 lg:p-8">
          {children}
        </main>
      </div>

      {/* ===== MODAL: SESSION WARNING (Multi-Device) ===== */}
      {sessionWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="rounded-2xl shadow-2xl border border-red-200 max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200" style={{ backgroundColor: 'var(--app-popup-bg)' }}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                {forceLogoutAvailable ? <ShieldAlert className="w-5 h-5 text-red-600" /> : <Smartphone className="w-5 h-5 text-red-600" />}
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Peringatan Keamanan</h3>
                <p className="text-xs text-slate-500 mt-0.5">Akun digunakan di perangkat lain</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5">
              <p className="text-sm text-red-700 leading-relaxed">{sessionWarning}</p>
            </div>
            {forceLogoutAvailable ? (
              <div className="space-y-2.5">
                <button
                  onClick={async () => {
                    setIsReclaiming(true)
                    try {
                      const authUser = getAuthUser()
                      if (!authUser?.sessionId) {
                        toast.error('Data sesi tidak ditemukan, silakan login ulang')
                        setIsReclaiming(false)
                        handleLogout()
                        return
                      }
                      const res = await authFetch('/api/auth/reclaim-session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: authUser.username, sessionId: authUser.sessionId, userId: authUser.id }),
                      })
                      const data = await res.json()
                      if (res.ok) {
                        setSessionWarning(null)
                        setForceLogoutAvailable(false)
                        toast.success('Perangkat lain berhasil di-logout')
                      } else {
                        toast.error(data.error || 'Gagal mengklaim sesi. Silakan coba lagi.')
                      }
                    } catch {
                      toast.error('Terjadi kesalahan jaringan')
                    }
                    setIsReclaiming(false)
                  }}
                  disabled={isReclaiming}
                  className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-400 text-white font-semibold py-2.5 rounded-xl transition-colors"
                  autoFocus
                >
                  {isReclaiming ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Memproses...</>
                  ) : (
                    <><ShieldAlert className="w-4 h-4" /> Paksa Logout Perangkat Lain</>
                  )}
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 border-2 border-red-200 text-red-600 hover:bg-red-50 font-semibold py-2.5 rounded-xl transition-colors"
                >
                  <LogOut className="w-4 h-4" /> Logout dari Sini
                </button>
              </div>
            ) : (
              <button
                onClick={handleLogout}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl transition-colors"
                autoFocus
              >
                OK, Logout
              </button>
            )}
          </div>
        </div>
      )}

      {/* ===== MODAL: AUTO-LOGOUT COUNTDOWN ===== */}
      {showCountdown && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="rounded-2xl shadow-2xl border border-amber-200 max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200" style={{ backgroundColor: 'var(--app-popup-bg)' }}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Sesi Akan Berakhir</h3>
                <p className="text-xs text-slate-500 mt-0.5">Anda tidak aktif, akan otomatis logout</p>
              </div>
            </div>
            <div className="text-center py-5">
              <div className="text-6xl font-bold text-amber-600 tabular-nums">{countdown}</div>
              <p className="text-sm text-slate-500 mt-2">detik tersisa</p>
            </div>
            <button
              onClick={handleStayLoggedIn}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2.5 rounded-xl transition-colors"
              autoFocus
            >
              Tetap Login
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
