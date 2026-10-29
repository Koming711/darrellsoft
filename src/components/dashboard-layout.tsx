'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { Sidebar } from './sidebar-desktop'
import { MobileHeader, MobileBottomNav } from './sidebar'
import { CompanyDataPopup } from './company-data-popup'
import { SubscriptionGate } from './subscription-gate'
import { SubscriptionWaitingPopup } from './subscription-waiting-popup'
import type { SubscriptionAccessInfo } from '@/lib/subscription'
import { usePathname, useRouter } from 'next/navigation'
import { getAuthUser, setAuthUser, clearAuthUser, type User } from '@/lib/auth'
import { setGrupInfo } from '@/lib/permissions'
import { hasFeatureAccess, getFeatureIdForPath, getFirstAccessiblePath, saveRolePermissions } from '@/lib/permissions'
import { authFetch } from '@/lib/auth-fetch'
import { AlertTriangle, LogOut, Smartphone, ShieldAlert, TimerOff, Lock, Crown } from 'lucide-react'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/language-context'

// === MODULE-LEVEL SESSION CACHE ===
// Persists across navigations so DashboardLayout doesn't need to re-verify on every mount
interface CachedSession {
  user: any
  userProfile: { createdAt: string | null; validUntil: string | null } | null
  autoLogoutMin: number
  logoutWarningSec: number
  sessionWarning: string | null
  forceLogoutAvailable: boolean
  accountExpired: boolean
  subBlocked: boolean
  subInfo: SubscriptionAccessInfo | null
  cachedAt: number
}
let _sessionCache: CachedSession | null = null
const SESSION_CACHE_TTL = 120_000 // 2 minutes

function getSessionCache(): CachedSession | null {
  // Check module-level cache first
  if (_sessionCache && Date.now() - _sessionCache.cachedAt <= SESSION_CACHE_TTL) {
    return _sessionCache
  }
  // Fallback to sessionStorage
  if (typeof window !== 'undefined') {
    try {
      const stored = sessionStorage.getItem('__dashboard_session_cache')
      if (stored) {
        const parsed = JSON.parse(stored) as CachedSession
        if (Date.now() - parsed.cachedAt <= SESSION_CACHE_TTL) {
          _sessionCache = parsed
          return parsed
        }
        sessionStorage.removeItem('__dashboard_session_cache')
      }
    } catch {}
  }
  _sessionCache = null
  return null
}

function setSessionCache(data: Omit<CachedSession, 'cachedAt'>) {
  const entry = { ...data, cachedAt: Date.now() }
  _sessionCache = entry
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem('__dashboard_session_cache', JSON.stringify(entry))
    } catch {}
  }
}

function invalidateSessionCache() {
  _sessionCache = null
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem('__dashboard_session_cache')
    } catch {}
  }
}



interface DashboardLayoutProps {
  children: React.ReactNode
  title?: string
  subtitle?: string
}

export function DashboardLayout({ children, title, subtitle }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<any>(null)
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useLanguage()
  // Sidebar desktop kini SELALU icon-only (w-14) — margin konten mengikuti lebar itu.
  // Saat hover, sidebar melebar sebagai OVERLAY (fixed) — konten tidak bergeser.
  const desktopMargin = 'lg:ml-14'

  // === SESSION CHECK STATE ===
  const [sessionWarning, setSessionWarning] = useState<string | null>(null)
  const [forceLogoutAvailable, setForceLogoutAvailable] = useState(false)
  const [isReclaiming, setIsReclaiming] = useState(false)
  const [accountExpired, setAccountExpired] = useState(false)
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

  // === SUBSCRIPTION GATE STATE (aplikasi terkunci selama pembayaran belum diverifikasi admin) ===
  const [subBlocked, setSubBlocked] = useState(false)
  const [subInfo, setSubInfo] = useState<SubscriptionAccessInfo | null>(null)
  const [subRechecking, setSubRechecking] = useState(false)
  // Popup "Aplikasi Belum Dapat Digunakan" di beranda (/pembukaan) saat
  // konfirmasi pembayaran pelanggan masih menunggu verifikasi admin.
  const [subPopupOpen, setSubPopupOpen] = useState(false)
  // Ref sinkron dgn state — dipakai saat menulis cache (nilai terbaru tanpa dependensi efek)
  const subStateRef = useRef<{ blocked: boolean; info: SubscriptionAccessInfo | null }>({ blocked: false, info: null })

  // === INIT GUARD (prevent double init in StrictMode) ===
  const initDoneRef = useRef(false)

  // === USER PROFILE (for header dates) ===
  const [userProfile, setUserProfile] = useState<{ createdAt: string | null; validUntil: string | null } | null>(null)

  // === PERMISSION VERSION (forces re-render of Sidebar when permissions update) ===
  const [permVersion, setPermVersion] = useState(0)

  // === INSTANT RESTORE FROM CACHE (useLayoutEffect runs before browser paint) ===
  // This eliminates the loading spinner flash on client-side navigation.
  // On SSR, cache is null so this is a no-op (spinner shows on first load as expected).
  useLayoutEffect(() => {
    const cache = getSessionCache()
    if (cache) {
      setUser(cache.user)
      setSessionWarning(cache.sessionWarning ?? null)
      setForceLogoutAvailable(cache.forceLogoutAvailable ?? false)
      setAccountExpired(cache.accountExpired ?? false)
      // Auto-logout dinonaktifkan (sesi selalu aktif, logout hanya manual).
      // Cache lama di localStorage bisa menyimpan nilai > 0 — dipaksa 0.
      setAutoLogoutMin(0)
      setLogoutWarningSec(0)
      setUserProfile(cache.userProfile ?? null)
      // Pulihkan juga status gate langganan — agar aplikasi TIDAK sempat tampil
      // (bahkan sekilas) saat sesi cached ternyata masih terkunci verifikasi.
      subStateRef.current = { blocked: cache.subBlocked ?? false, info: cache.subInfo ?? null }
      setSubBlocked(cache.subBlocked ?? false)
      setSubInfo(cache.subInfo ?? null)
      setReady(true)
    }
  }, [])

  // Listen for permission updates from hak-akses page (immediate re-render)
  useEffect(() => {
    const handler = () => setPermVersion(v => v + 1)
    window.addEventListener('permissions-updated', handler)
    return () => window.removeEventListener('permissions-updated', handler)
  }, [])

  // === LOGOUT HANDLER ===
  const handleLogout = useCallback(() => {
    clearAuthUser()
    invalidateSessionCache()
    // Bersihkan cache data API di service worker agar data pribadi akun lama
    // tidak tersaji offline ke pengguna berikutnya di perangkat yang sama
    try {
      if (typeof caches !== 'undefined') {
        caches.delete('darrell-api-runtime').catch(() => {})
      }
    } catch {}
    setAccountExpired(false)
    setSessionWarning(null)
    setForceLogoutAvailable(false)
    if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current)
    if (autoLogoutIntervalRef.current) clearInterval(autoLogoutIntervalRef.current)
    sessionIntervalRef.current = null
    autoLogoutIntervalRef.current = null
    window.location.href = '/'
  }, [])

  // Stay logged in handler (resets activity + dismisses countdown)
  const handleStayLoggedIn = useCallback(() => {
    lastActivityRef.current = Date.now()
    countdownActiveRef.current = false
    setShowCountdown(false)
    setCountdown(0)
  }, [])

  // === APPLY VERIFY-SESSION RESPONSE (dipakai init, bg refresh, interval 10s, recheck manual) ===
  const applyVerifyData = useCallback((data: {
    valid?: boolean
    expired?: boolean
    warningMessage?: string
    forceLogoutAvailable?: boolean
    permissions?: { features: Record<string, boolean>; subPermissions: Record<string, Record<string, boolean>> }
    securitySettings?: { auto_logout_min?: number; logout_warning_sec?: number }
    subscriptionAccess?: SubscriptionAccessInfo | null
    grup?: { grupId: string; peran: string; status: string; izin: string[] } | null
  }) => {
    const authUser = getAuthUser()
    if (data.securitySettings) {
      setAutoLogoutMin(data.securitySettings.auto_logout_min || 0)
      setLogoutWarningSec(data.securitySettings.logout_warning_sec || 0)
    }
    if (data.permissions && authUser?.role) {
      saveRolePermissions(authUser.role, data.permissions.features, data.permissions.subPermissions)
      setPermVersion(v => v + 1)
    }
    // RBAC grup perusahaan: sinkronkan izin menu anggota/owner (poll 10 detik)
    if (data.grup !== undefined) {
      setGrupInfo(data.grup ? data.grup : null)
      setPermVersion(v => v + 1)
    }
    if (!data.valid) {
      if (data.expired) {
        setAccountExpired(true)
        setSessionWarning(data.warningMessage || t('akun_sudah_expired'))
      } else if (data.warningMessage) {
        setSessionWarning(data.warningMessage)
        setForceLogoutAvailable(!!data.forceLogoutAvailable)
      }
    }
    // === SUBSCRIPTION GATE: kunci/buka aplikasi sesuai keputusan server ===
    if (data.subscriptionAccess) {
      const blocked = !data.subscriptionAccess.allowed
      subStateRef.current = { blocked, info: data.subscriptionAccess }
      setSubBlocked(blocked)
      setSubInfo(data.subscriptionAccess)
    }
  }, [t])

  // === MANUAL RECHECK (tombol "Periksa Status Verifikasi" di layar gate) ===
  const handleSubscriptionRecheck = useCallback(async () => {
    const authUser = getAuthUser()
    if (!authUser) return
    setSubRechecking(true)
    try {
      const res = await authFetch('/api/auth/verify-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUser.username, sessionId: authUser.sessionId, role: authUser.role }),
      })
      const data = await res.json()
      applyVerifyData(data)
      if (data.subscriptionAccess?.allowed) {
        toast.success('Pembayaran disetujui — aplikasi dapat digunakan.')
      } else if (data.subscriptionAccess) {
        toast.info(data.subscriptionAccess.message)
      } else {
        toast.info('Status belum berubah — menunggu verifikasi admin.')
      }
    } catch {
      toast.error('Gagal memeriksa status. Coba lagi.')
    } finally {
      setSubRechecking(false)
    }
  }, [applyVerifyData])

  // === POPUP BERANDA: pembayaran menunggu verifikasi admin ===
  // reason 'menunggu_verifikasi' (konfirmasi pembayaran sudah terkirim):
  // di beranda (/pembukaan) aplikasi tampil normal + popup pemberitahuan;
  // di rute modul lain tetap layar gate penuh — modul tidak bisa dipakai.
  const subWaitingVerification = subBlocked && subInfo?.reason === 'menunggu_verifikasi'
  const onPembukaan = pathname === '/pembukaan'
  useEffect(() => {
    // Auto-muncul saat mendarat di beranda; tutup saat pindah rute atau
    // saat langganan sudah disetujui (subBlocked false).
    setSubPopupOpen(subWaitingVerification && onPembukaan)
  }, [subWaitingVerification, onPembukaan])

  // === INITIAL AUTH + SETTINGS LOAD (runs once) ===
  useEffect(() => {
    if (initDoneRef.current) return
    initDoneRef.current = true

    // If cache was already restored by useLayoutEffect, skip the full init.
    // Just do a background refresh to keep session data up-to-date.
    const existingCache = getSessionCache()
    if (existingCache) {
      // State was already restored by useLayoutEffect — just do background refresh
      // Do a background session refresh without blocking UI
      const bgRefresh = async () => {
        const authUser = getAuthUser()
        if (!authUser) return
        try {
          const sessionRes = await authFetch('/api/auth/verify-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: authUser.username, sessionId: authUser.sessionId, role: authUser.role }),
          })
          const data = await sessionRes.json()
          applyVerifyData(data)
          // Update cache with fresh data
          setSessionCache({
            user: authUser,
            userProfile: existingCache.userProfile,
            autoLogoutMin: data.securitySettings?.auto_logout_min || 0,
            logoutWarningSec: data.securitySettings?.logout_warning_sec || 0,
            sessionWarning: data.valid ? null : (data.warningMessage || null),
            forceLogoutAvailable: data.valid ? false : !!data.forceLogoutAvailable,
            accountExpired: data.valid ? false : !!data.expired,
            subBlocked: subStateRef.current.blocked,
            subInfo: subStateRef.current.info,
          })
        } catch {
          // Background refresh failed — keep using cached data
        }
      }
      bgRefresh()
      return
    }

    let cancelled = false

    const init = async () => {
      try {
        let authUser = getAuthUser()
        if (!authUser) {
          // Bootstrap sesi: cookie login masih ada tetapi localStorage 'auth'
          // kosong (mis. dibersihkan browser / di-evict). Cookie userId yang
          // masih valid = sesi sah → pulihkan sesi dari server agar user
          // tetap langsung masuk Beranda tanpa harus login ulang.
          let hasSessionCookie = false
          try {
            hasSessionCookie = /(?:^|;\s*)userId=/.test(document.cookie)
          } catch {}
          if (hasSessionCookie) {
            try {
              const meRes = await fetch('/api/auth/me', { cache: 'no-store' })
              if (meRes.ok) {
                const me = await meRes.json()
                if (me?.id && me?.username) {
                  const restored: User = {
                    id: me.id,
                    username: me.username,
                    name: me.namaLengkap || me.username,
                    role: me.role || '',
                  }
                  setAuthUser(restored)
                  if (!cancelled) {
                    setUser(restored)
                    setUserProfile({ createdAt: me.createdAt || null, validUntil: me.validUntil || null })
                    setReady(true)
                  }
                  // Evaluasi gate langganan segera (jangan tunggu interval 10s)
                  ;(async () => {
                    try {
                      const vRes = await authFetch('/api/auth/verify-session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: restored.username, sessionId: restored.sessionId, role: restored.role }),
                      })
                      const vData = await vRes.json()
                      if (!cancelled) applyVerifyData(vData)
                    } catch {}
                  })()
                  return
                }
              }
            } catch {}
          }
          if (!cancelled) setReady(true)
          return
        }
        if (cancelled) return
        setUser(authUser)

        // Fetch user profile for header dates (fire and forget)
        authFetch('/api/auth/me')
          .then(r => {
            if (r.status === 403) return r.json().then(data => {
              if (data?.expired && !cancelled) {
                setAccountExpired(true)
                setSessionWarning(data.error || t('akun_expired_perpanjang'))
              }
              return null
            })
            return r.ok ? r.json() : null
          })
          .then(data => { if (data && !cancelled) {
            setUserProfile({ createdAt: data.createdAt || null, validUntil: data.validUntil || null })
            // Update cache with profile data
            const currentCache = getSessionCache()
            if (currentCache) {
              setSessionCache({ ...currentCache, userProfile: { createdAt: data.createdAt || null, validUntil: data.validUntil || null } })
            }
          } })
          .catch(() => {})

        // Wait for session verification BEFORE checking permissions
        try {
          const sessionRes = await authFetch('/api/auth/verify-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: authUser.username, sessionId: authUser.sessionId, role: authUser.role }),
          })
          if (cancelled) return
          const data = await sessionRes.json()
          if (cancelled) return

          applyVerifyData(data)

          // Update session cache with verified data
          setSessionCache({
            user: authUser,
            userProfile: null,
            autoLogoutMin: data.securitySettings?.auto_logout_min || 0,
            logoutWarningSec: data.securitySettings?.logout_warning_sec || 0,
            sessionWarning: data.valid ? null : (data.warningMessage || null),
            forceLogoutAvailable: data.valid ? false : !!data.forceLogoutAvailable,
            accountExpired: data.valid ? false : !!data.expired,
            subBlocked: subStateRef.current.blocked,
            subInfo: subStateRef.current.info,
          })

          // === AUTO-BACKUP CHECK ===
          // Check if auto-backup is due and trigger it silently
          if (data.valid && authUser.role !== 'superadmin') {
            authFetch('/api/database/auto-backup', { method: 'POST' })
              .then(r => r.ok ? r.json() : null)
              .then(backupData => {
                if (backupData?.success && !backupData?.skipped) {
                  console.log(`✅ Auto backup: ${backupData.fileName} (${backupData.totalRows} records)`)
                }
              })
              .catch(() => {}) // silent fail
          }
        } catch {
          // Session verification failed - continue anyway
        }

      } catch {
        // On error, don't redirect — just show the page
      } finally {
        if (!cancelled) {
          setReady(true)
          // Cache session data for instant navigation
          const authUser = getAuthUser()
          if (authUser) {
            setSessionCache({
              user: authUser,
              userProfile: null, // will be updated by authFetch below
              autoLogoutMin: 0,
              logoutWarningSec: 0,
              sessionWarning: null,
              forceLogoutAvailable: false,
              accountExpired: false,
              subBlocked: subStateRef.current.blocked,
              subInfo: subStateRef.current.info,
            })
          }
        }
      }
    }

    init()

    return () => { cancelled = true }
  }, [])

  // === PERMISSION CHECK ON ROUTE CHANGE ===
  useEffect(() => {
    if (!user || !ready) return
    if (user.role === 'superadmin') { setNoAccess(false); return }

    const featureId = getFeatureIdForPath(pathname)
    if (featureId) {
      const allowed = hasFeatureAccess(user.role, featureId)
      setNoAccess(!allowed)
    } else {
      setNoAccess(false)
    }
  }, [pathname, user, ready, permVersion])

  // === PERIODIC SESSION CHECK (every 10s) ===
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
        applyVerifyData(data)
      })
      .catch(() => {})
    }, 10000)

    return () => {
      if (sessionIntervalRef.current) {
        clearInterval(sessionIntervalRef.current)
        sessionIntervalRef.current = null
      }
    }
  }, [ready, user, applyVerifyData])

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

      if (elapsed >= autoLogoutSec) {
        handleLogout()
        return
      }

      if (logoutWarningSec > 0 && elapsed >= autoLogoutSec - logoutWarningSec) {
        countdownActiveRef.current = true
        setShowCountdown(true)
        setCountdown(Math.ceil(autoLogoutSec - elapsed))
      } else if (countdownActiveRef.current) {
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
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--app-content-bg, hsl(var(--background)))' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--app-content-bg, hsl(var(--background)))' }}>
        <div className="text-center p-8">
          <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4 mx-auto">
            <AlertTriangle className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">{t('not_logged_in')}</h2>
          <p className="text-sm text-muted-foreground mb-4">{t('login_required_msg')}</p>
          <button
            onClick={() => {
              clearAuthUser()
              window.location.href = '/login'
            }}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
          >
            {t('masuk')}
          </button>
        </div>
      </div>
    )
  }

  // === SUBSCRIPTION GATE: aplikasi TERKUNCI selama pembayaran belum diverifikasi admin ===
  // Seluruh isi aplikasi diganti layar pemblokiran — tidak ada modul yang bisa diakses.
  // PENGECUALIAN: reason 'menunggu_verifikasi' di beranda (/pembukaan) — aplikasi tampil
  // normal dan cukup popup pemberitahuan (sesuai permintaan: login → beranda + popup).
  if (subBlocked && !(subWaitingVerification && onPembukaan)) {
    return (
      <SubscriptionGate
        info={subInfo}
        rechecking={subRechecking}
        onRecheck={handleSubscriptionRecheck}
        onLogout={handleLogout}
      />
    )
  }

  // === NO ACCESS SCREEN (PRO) ===
  // Compute back navigation info
  const berandaPath = user ? (getFirstAccessiblePath(user.role) || '/pembukaan') : '/pembukaan'
  const backLabelMap: Record<string, string> = {
    '/invoice': t('kembali_ke_beranda'),
    '/surat-jalan': t('kembali_ke_beranda'),
    '/purchase-order': t('kembali_ke_beranda'),
    '/riwayat-pembelian': t('kembali_ke_beranda'),
    '/riwayat-penjualan': t('kembali_ke_beranda'),
  }
  const backPathMap: Record<string, string> = {
    '/invoice': berandaPath,
    '/surat-jalan': berandaPath,
    '/purchase-order': berandaPath,
    '/riwayat-pembelian': berandaPath,
    '/riwayat-penjualan': berandaPath,
  }
  const backLabel = backLabelMap[pathname] || t('kembali_ke_beranda')
  const backPath = backPathMap[pathname] || (user ? (getFirstAccessiblePath(user.role) || '/pembukaan') : '/pembukaan')

  if (noAccess) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--app-content-bg)' }}>
        <Sidebar
          username={user?.username || 'User'}
          role={user?.role}
          onLogout={handleLogout}
        />
        <div className={`${desktopMargin} transition-all duration-300`}>
          <MobileHeader username={user?.username} role={user?.role} title={title} subtitle={subtitle} userProfile={userProfile} />
          <main className="p-4 pb-20 lg:py-8 lg:pb-8 lg:px-[3mm]">
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
              <div className="w-20 h-20 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-5 relative">
                <Lock className="w-9 h-9 text-amber-500" />
                <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center">
                  <Crown className="w-4 h-4 text-white" />
                </div>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 mb-3">
                <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">{t('fitur_pro')}</span>
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">{t('fitur_belum_tersedia')}</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                {t('fitur_belum_diaktifkan_prefix')}<span className="font-semibold text-foreground">{title}</span>{t('fitur_belum_diaktifkan_suffix')}
                {t('hubungi_admin')}
              </p>
              <a
                href="/pembukaan"
                onClick={(e) => {
                  e.preventDefault()
                  window.location.replace('/pembukaan')
                }}
                className="mt-5 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors no-underline inline-block cursor-pointer"
              >
                {backLabel}
              </a>
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
        permVersion={permVersion}
      />

      <div className={`${desktopMargin} transition-all duration-300`}>
        <MobileHeader
          username={user?.username}
          role={user?.role}
          title={title}
          subtitle={subtitle}
          userProfile={userProfile}
        />

        {/* Main Content — extra bottom padding on mobile for bottom nav + safe area.
            Margin kiri/kanan desktop 3mm untuk SEMUA halaman (permintaan user). Mobile tetap p-4. */}
        <main className="p-4 pb-20 lg:py-8 lg:pb-8 lg:px-[3mm]">
          {children}
        </main>
      </div>

      {/* ===== Mobile Bottom Navigation ===== */}
      <MobileBottomNav role={user?.role} onMoreClick={() => setSidebarOpen(true)} username={user?.username} onLogout={handleLogout} />

      {/* ===== MODAL: ACCOUNT EXPIRED ===== */}
      {accountExpired && sessionWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="rounded-2xl shadow-2xl border border-red-200 dark:border-red-800 max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200" style={{ backgroundColor: 'var(--card)' }}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <TimerOff className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">{t('account_expired')}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{t('account_expired_desc')}</p>
              </div>
            </div>
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-5">
              <p className="text-sm text-red-700 dark:text-red-400 leading-relaxed">{sessionWarning}</p>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => router.push('/pilih-paket')}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl transition-colors"
              >
                <span className="flex items-center justify-center gap-2">
                  <Crown className="w-4 h-4" /> {t('perpanjang_langganan')}
                </span>
              </button>
              <button
                onClick={handleLogout}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl transition-colors"
                autoFocus
              >
                <span className="flex items-center justify-center gap-2">
                  <LogOut className="w-4 h-4" /> {t('ok_mengerti')}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL: SESSION WARNING (Multi-Device) ===== */}
      {sessionWarning && !accountExpired && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="rounded-2xl shadow-2xl border border-red-200 dark:border-red-800 max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200" style={{ backgroundColor: 'var(--card)' }}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                {forceLogoutAvailable ? <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400" /> : <Smartphone className="w-5 h-5 text-red-600 dark:text-red-400" />}
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">{t('peringatan_keamanan')}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{t('akun_digunakan_di_perangkat_lain')}</p>
              </div>
            </div>
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-5">
              <p className="text-sm text-red-700 dark:text-red-400 leading-relaxed">{sessionWarning}</p>
            </div>
            {forceLogoutAvailable ? (
              <div className="space-y-2.5">
                <button
                  onClick={async () => {
                    setIsReclaiming(true)
                    try {
                      const authUser = getAuthUser()
                      if (!authUser?.sessionId) {
                        toast.error(t('session_data_not_found'))
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
                        toast.success(t('other_device_logged_out'))
                      } else {
                        toast.error(data.error || t('reclaim_session_failed'))
                      }
                    } catch {
                      toast.error(t('terjadi_kesalahan_jaringan'))
                    }
                    setIsReclaiming(false)
                  }}
                  disabled={isReclaiming}
                  className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-400 text-white font-semibold py-2.5 rounded-xl transition-colors"
                  autoFocus
                >
                  {isReclaiming ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {t('memproses')}</>
                  ) : (
                    <><ShieldAlert className="w-4 h-4" /> {t('paksa_logout_perangkat_lain')}</>
                  )}
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 border-2 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 font-semibold py-2.5 rounded-xl transition-colors"
                >
                  <LogOut className="w-4 h-4" /> {t('logout_dari_sini')}
                </button>
              </div>
            ) : (
              <button
                onClick={handleLogout}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl transition-colors"
                autoFocus
              >
                {t('ok_logout')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ===== MODAL: AUTO-LOGOUT COUNTDOWN ===== */}
      {showCountdown && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="rounded-2xl shadow-2xl border border-amber-200 dark:border-amber-800 max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200" style={{ backgroundColor: 'var(--card)' }}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">{t('session_ending')}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{t('session_ending_desc')}</p>
              </div>
            </div>
            <div className="text-center py-5">
              <div className="text-6xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">{countdown}</div>
              <p className="text-sm text-muted-foreground mt-2">{t('detik_tersisa')}</p>
            </div>
            <button
              onClick={handleStayLoggedIn}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2.5 rounded-xl transition-colors"
              autoFocus
            >
              {t('tetap_login')}
            </button>
          </div>
        </div>
      )}

      {/* ===== POPUP: APLIKASI BELUM DAPAT DIGUNAKAN (beranda, menunggu verifikasi admin) ===== */}
      <SubscriptionWaitingPopup
        info={subInfo}
        open={subPopupOpen}
        onOpenChange={setSubPopupOpen}
        rechecking={subRechecking}
        onRecheck={() => { void handleSubscriptionRecheck() }}
      />

      {/* ===== MODAL: COMPANY DATA POPUP (untuk demo user baru dari checkout) ===== */}
      {user && <CompanyDataPopup />}
    </div>
  )
}
