'use client'

import { useState, useEffect, Suspense } from 'react'
import { Eye, EyeOff, Phone, Mail, User as UserIcon, Loader2, AlertCircle, Info, CheckCircle, ArrowLeft, KeyRound, X } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getAuthUser, setAuthUser } from '@/lib/auth'
import { useLanguage } from '@/contexts/language-context'
import { toast } from 'sonner'
import { applyThemeAfterLogin } from '@/contexts/theme-context'
import { notifyDataChange } from '@/lib/data-sync'
import { useTheme } from 'next-themes'


export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>}>
      <LoginContent />
    </Suspense>
  )
}

function LoginContent() {
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<'login' | 'register'>(searchParams.get('tab') === 'register' ? 'register' : 'login')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)

  // Login state
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')

  // Register success state
  const [regSuccess, setRegSuccess] = useState(false)

  // Register state
  const [regNamaLengkap, setRegNamaLengkap] = useState('')
  const [regNomorHP, setRegNomorHP] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regUsername, setRegUsername] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regConfirmPassword, setRegConfirmPassword] = useState('')
  const [regError, setRegError] = useState('')
  const [regLoading, setRegLoading] = useState(false)

  // Forgot password state
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [fpEmail, setFpEmail] = useState('')
  const [fpLoading, setFpLoading] = useState(false)
  const [fpError, setFpError] = useState('')
  const [fpAccount, setFpAccount] = useState<{ name: string; username: string; userId: string; userType: string } | null>(null)
  const [fpNewPassword, setFpNewPassword] = useState('')
  const [fpConfirmPassword, setFpConfirmPassword] = useState('')
  const [fpShowPassword, setFpShowPassword] = useState(false)
  const [fpShowConfirm, setFpShowConfirm] = useState(false)
  const [fpSuccess, setFpSuccess] = useState(false)

  // Demo popup state
  const [demoPopupOpen, setDemoPopupOpen] = useState(false)
  const [demoPopupMsg, setDemoPopupMsg] = useState('')
  const [demoRemaining, setDemoRemaining] = useState<number | null>(null)

  const router = useRouter()
  const { t } = useLanguage()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  // Check if already logged in + fetch company branding
  useEffect(() => {
    if (isRedirecting) return

    const authUser = getAuthUser()
    if (authUser) {
      setIsRedirecting(true)
      // Use hard navigation to ensure DashboardLayout reads fresh auth state
      window.location.href = '/pembukaan'
      return
    }


  }, [isRedirecting])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)

    try {
      // Add timeout and retry for network resilience
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000) // 15s timeout

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      const data = await res.json()

      if (!res.ok) {
        setLoginError(data.error || 'Login gagal')
        setLoginLoading(false)
        return
      }

      // Save to localStorage (include sessionId for multi-device check)
      setAuthUser({
        id: data.id,
        username: data.username,
        name: data.name,
        role: data.role,
        sessionId: data.sessionId,
      })

      // Store permissions in localStorage
      if (data.permissions) {
        const allPerms: Record<string, { features: Record<string, boolean>; subPermissions: Record<string, Record<string, boolean>> }> = {}
        allPerms[data.role] = data.permissions
        // Merge with existing permissions from other roles (if any)
        try {
          const existing = localStorage.getItem('permissions')
          if (existing) {
            const parsed = JSON.parse(existing)
            Object.assign(allPerms, parsed)
          }
        } catch {}
        localStorage.setItem('permissions', JSON.stringify(allPerms))
      }

      // Show demo popup if applicable
      if (data.role === 'demo' && data.demoPopupMessage) {
        setDemoPopupMsg(data.demoPopupMessage)
        setDemoRemaining(data.demoRemainingDays ?? null)
        setDemoPopupOpen(true)
        setLoginLoading(false)
      } else {
        // Apply theme in background, don't block redirect
        applyThemeAfterLogin()
        // Use hard navigation to ensure DashboardLayout reads fresh auth state
        // (router.push can fail in iframe contexts)
        window.location.href = '/pembukaan'
      }
    } catch (err: any) {
      console.error('Login network error:', err)
      // Provide more specific error messages
      if (err?.name === 'AbortError') {
        setLoginError('Permintaan timeout. Server terlalu lama merespons. Coba lagi.')
      } else if (err?.name === 'TypeError' && err?.message?.includes('fetch')) {
        setLoginError('Tidak dapat terhubung ke server. Periksa koneksi internet Anda.')
      } else {
        setLoginError('Terjadi kesalahan jaringan. Coba lagi dalam beberapa detik.')
      }
      setLoginLoading(false)
    }
  }

  // Step 1: Search account by email
  const handleFpSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setFpError('')
    setFpAccount(null)
    setFpSuccess(false)
    setFpLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search', email: fpEmail }),
      })
      const data = await res.json()

      if (res.status === 404) {
        setFpError(data.message || 'Email tidak ditemukan')
        setFpLoading(false)
        return
      }

      if (!res.ok) {
        setFpError(data.error || 'Terjadi kesalahan')
        setFpLoading(false)
        return
      }

      setFpAccount({ name: data.name, username: data.username, userId: data.userId, userType: data.userType })
    } catch {
      setFpError('Terjadi kesalahan jaringan')
    } finally {
      setFpLoading(false)
    }
  }

  // Step 2: Reset password directly
  const handleFpReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setFpError('')

    if (fpNewPassword.length < 6) {
      setFpError('Password baru minimal 6 karakter')
      return
    }

    if (fpNewPassword !== fpConfirmPassword) {
      setFpError('Password dan konfirmasi password tidak sama')
      return
    }

    setFpLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset', email: fpEmail, newPassword: fpNewPassword }),
      })
      const data = await res.json()

      if (!res.ok) {
        setFpError(data.error || 'Terjadi kesalahan')
        setFpLoading(false)
        return
      }

      setFpSuccess(true)
    } catch {
      setFpError('Terjadi kesalahan jaringan')
    } finally {
      setFpLoading(false)
    }
  }



  const resetFpFields = () => {
    setFpEmail('')
    setFpError('')
    setFpAccount(null)
    setFpNewPassword('')
    setFpConfirmPassword('')
    setFpShowPassword(false)
    setFpShowConfirm(false)
    setFpSuccess(false)
  }

  const closeFpDialog = () => {
    setShowForgotPassword(false)
    resetFpFields()
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegError('')
    setRegLoading(true)

    if (!regNamaLengkap.trim() || !regNomorHP.trim() || !regEmail.trim() || !regUsername.trim() || !regPassword || !regConfirmPassword) {
      setRegError('Semua field wajib diisi')
      setRegLoading(false)
      return
    }

    if (regUsername.trim().length < 3) {
      setRegError('Username minimal 3 karakter')
      setRegLoading(false)
      return
    }

    if (regPassword.length < 6) {
      setRegError('Password minimal 6 karakter')
      setRegLoading(false)
      return
    }

    if (regPassword !== regConfirmPassword) {
      setRegError('Password dan konfirmasi password tidak sama')
      setRegLoading(false)
      return
    }

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          namaLengkap: regNamaLengkap.trim(),
          nomorHP: regNomorHP.trim(),
          email: regEmail.trim(),
          username: regUsername.trim(),
          password: regPassword,
        })
      })

      const data = await res.json()

      if (!res.ok) {
        setRegError(data.error || 'Pendaftaran gagal')
        return
      }

      // Pendaftaran berhasil — langsung auto-login
      if (data.id && data.role) {
        // Notify other tabs (e.g., admin's pengguna page) about the new calon pembeli
        notifyDataChange('calon-pembeli')
        toast.success('Pendaftaran berhasil! Selamat datang, ' + (data.name || data.username) + '!', { icon: <CheckCircle className="w-4 h-4 text-emerald-600" />, duration: 4000 })
        setAuthUser({
          id: data.id,
          username: data.username,
          name: data.name,
          role: data.role,
          sessionId: data.sessionId,
        })

        // Tandai bahwa user baru ini wajib mengisi Data Perusahaan.
        // Flag persisten ini dipantau oleh CompanyDataPopup di DashboardLayout —
        // popup "Lengkapi Data Perusahaan" akan muncul di /pembukaan (dan halaman
        // dashboard lainnya) sampai user mengisi & menyimpan data perusahaan.
        // Sama dengan flow checkout (role demo).
        localStorage.setItem('companyDataRequired', 'true')

        if (data.permissions) {
          const allPerms: Record<string, { features: Record<string, boolean>; subPermissions: Record<string, Record<string, boolean>> }> = {}
          allPerms[data.role] = data.permissions
          try {
            const existing = localStorage.getItem('permissions')
            if (existing) {
              const parsed = JSON.parse(existing)
              Object.assign(allPerms, parsed)
            }
          } catch {}
          localStorage.setItem('permissions', JSON.stringify(allPerms))
        }

        if (data.demoPopupMessage) {
          setDemoPopupMsg(data.demoPopupMessage)
          setDemoRemaining(data.demoRemainingDays ?? null)
          setDemoPopupOpen(true)
        } else {
          applyThemeAfterLogin()
          setTimeout(() => { window.location.href = '/pembukaan' }, 1500)
        }
      } else {
        // Notify other tabs about the new calon pembeli
        notifyDataChange('calon-pembeli')
        toast.success('Pendaftaran berhasil! Silakan tunggu konfirmasi dari administrator.', { icon: <CheckCircle className="w-4 h-4 text-emerald-600" />, duration: 5000 })
        setRegSuccess(true)
      }
    } catch (err) {
      setRegError('Terjadi kesalahan jaringan')
    } finally {
      setRegLoading(false)
    }
  }

  // Don't render login page if redirecting
  if (isRedirecting) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen flex flex-col px-4 py-8 bg-gradient-to-br from-blue-50 via-white to-slate-100 dark:from-black dark:via-[#111] dark:to-black`}>
      {/* Back button */}
      <button
        onClick={() => router.push('/')}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-fit mt-2"
      >
        <ArrowLeft className="w-4 h-4" />
        Kembali
      </button>

      <div className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="relative mb-6">
            <img
              src={'/logo-ds.png'}
              alt="Logo"
              className="w-[134px] h-[134px] rounded-2xl object-contain mx-auto shadow-none"
            />
          </div>
          <h1 className="text-3xl text-foreground" style={{ fontWeight: 900 }}>{t('app_name')}</h1>
          <p className="text-muted-foreground mt-2 text-base">{t('app_tagline')}</p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab('login')}
              className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${
                activeTab === 'login'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 bg-blue-50/50 dark:bg-blue-900/20'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('masuk')}
            </button>
            <button
              onClick={() => setActiveTab('register')}
              className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${
                activeTab === 'register'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 bg-blue-50/50 dark:bg-blue-900/20'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('daftar_akun')}
            </button>
          </div>

          {/* Form Content */}
          <div className="p-6">
            {activeTab === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                {/* Error Message */}
                {loginError && (
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {loginError}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('username')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('masukkan_username')}
                    required
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setLoginError('') }}
                    className="w-full border border-input rounded-lg px-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('password')}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder={t('masukkan_password')}
                      required
                      autoComplete="current-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setLoginError('') }}
                      className="w-full border border-input rounded-lg px-3 py-2.5 pr-10 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-0.5"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {loginLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('memproses')}
                    </>
                  ) : (
                    t('masuk')
                  )}
                </button>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {t('belum_punya_akun')}{' '}
                    <button
                      type="button"
                      onClick={() => setActiveTab('register')}
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                    >
                      {t('daftar_sekarang')}
                    </button>
                  </p>
                  <button
                    type="button"
                    onClick={() => { resetFpFields(); setShowForgotPassword(true) }}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                  >
                    {t('lupa_password')}
                  </button>
                </div>
              </form>
            ) : regSuccess ? (
              <div className="text-center py-4 space-y-4">
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Pendaftaran Berhasil!</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                    Akun Anda telah berhasil didaftarkan. Silakan tunggu konfirmasi dari administrator sebelum dapat login.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRegSuccess(false)
                    setActiveTab('login')
                    setRegNamaLengkap('')
                    setRegNomorHP('')
                    setRegEmail('')
                    setRegUsername('')
                    setRegPassword('')
                    setRegConfirmPassword('')
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl transition-colors"
                >
                  Kembali ke Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleRegister} className="space-y-3">
                {/* Error Message */}
                {regError && (
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {regError}
                  </div>
                )}

                {/* Nama Lengkap */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('nama_lengkap')}
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Masukkan nama lengkap"
                      required
                      value={regNamaLengkap}
                      onChange={(e) => setRegNamaLengkap(e.target.value)}
                      className="w-full border border-input rounded-lg pl-9 pr-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Nomor Handphone */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('nomor_handphone')}
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="tel"
                      placeholder="Contoh: 081234567890"
                      required
                      value={regNomorHP}
                      onChange={(e) => setRegNomorHP(e.target.value)}
                      className="w-full border border-input rounded-lg pl-9 pr-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('email')}
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="email"
                      placeholder="email@contoh.com"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="w-full border border-input rounded-lg pl-9 pr-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Username */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('username')} <span className="text-xs text-muted-foreground">(minimal 3 karakter)</span>
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Buat username"
                      required
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      minLength={3}
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      className={`w-full border rounded-lg pl-9 pr-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        regUsername.length > 0 && regUsername.length < 3 ? 'border-red-300' : 'border-input'
                      }`}
                    />
                  </div>
                  {regUsername.length > 0 && regUsername.length < 3 && (
                    <p className="text-xs text-red-500 mt-1">Username harus minimal 3 karakter ({regUsername.length}/3)</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('password')} <span className="text-xs text-muted-foreground">(minimal 6 karakter)</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Buat password"
                      required
                      autoComplete="new-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      minLength={6}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className={`w-full border rounded-lg px-3 py-2.5 pr-10 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        regPassword.length > 0 && regPassword.length < 6 ? 'border-red-300' : 'border-input'
                      }`}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-0.5"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {regPassword.length > 0 && regPassword.length < 6 && (
                    <p className="text-xs text-red-500 mt-1">Password harus minimal 6 karakter ({regPassword.length}/6)</p>
                  )}
                </div>

                {/* Konfirmasi Password */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('konfirmasi_password')}
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Ulangi password"
                      required
                      autoComplete="new-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      minLength={6}
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      className={`w-full border rounded-lg px-3 py-2.5 pr-10 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        regConfirmPassword.length > 0 && regConfirmPassword !== regPassword ? 'border-red-300' : 'border-input'
                      }`}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-0.5"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {regConfirmPassword.length > 0 && regConfirmPassword !== regPassword && (
                    <p className="text-xs text-red-500 mt-1">Password tidak cocok</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={regLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {regLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('mendaftar')}
                    </>
                  ) : (
                    t('daftar_akun')
                  )}
                </button>

                <p className="text-center text-sm text-muted-foreground">
                  {t('sudah_punya_akun')}{' '}
                  <button
                    type="button"
                    onClick={() => setActiveTab('login')}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                  >
                    {t('login_sekarang')}
                  </button>
                </p>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          &copy; Copyright by Darrell Soft 2026 All rights reserved
        </p>
      </div>
      </div>

      {/* ===== FORGOT PASSWORD DIALOG ===== */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-card rounded-2xl shadow-2xl border border-border max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start gap-3 mb-5">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-blue-100 dark:bg-blue-900/30">
                <KeyRound className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-foreground">Lupa Password?</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Atur ulang password Anda melalui email.</p>
              </div>
              <button
                type="button"
                onClick={closeFpDialog}
                className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* === SUCCESS STATE === */}
            {fpSuccess ? (
              <div className="space-y-4">
                <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <p className="text-sm font-semibold text-green-800 dark:text-green-400">Password Berhasil Diubah!</p>
                  </div>
                  <div className="ml-7">
                    <p className="text-sm text-green-700 dark:text-green-400 leading-relaxed">
                      Password untuk akun <strong>{fpAccount?.name}</strong> telah berhasil diubah. Silakan login dengan password baru Anda.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeFpDialog}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl transition-colors"
                >
                  Masuk Sekarang
                </button>
              </div>
            ) : !fpAccount ? (
              /* === STEP 1: Search account by email === */
              <form onSubmit={handleFpSearch} className="space-y-4">
                {fpError && (
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {fpError}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="email"
                      placeholder="Masukkan email akun Anda"
                      required
                      autoComplete="email"
                      value={fpEmail}
                      onChange={(e) => { setFpEmail(e.target.value); setFpError('') }}
                      className="w-full border border-input rounded-lg pl-9 pr-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Atur password baru langsung — tanpa perlu cek email.</p>
                </div>

                <button
                  type="submit"
                  disabled={fpLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {fpLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Mencari...</> : 'Cari Akun'}
                </button>
                <button
                  type="button"
                  onClick={closeFpDialog}
                  className="w-full text-sm text-muted-foreground hover:text-foreground py-1 transition-colors"
                >
                  {t('kembali_ke_login')}
                </button>
              </form>
            ) : (
              /* === STEP 2: Enter new password directly === */
              <form onSubmit={handleFpReset} className="space-y-4">
                {fpError && (
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {fpError}
                  </div>
                )}

                <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <p className="text-sm text-green-700 dark:text-green-400">
                      Akun <strong>{fpAccount.name}</strong> {fpAccount.username ? `(${fpAccount.username})` : ''} ditemukan
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Password Baru <span className="text-xs text-muted-foreground">(minimal 6 karakter)</span>
                  </label>
                  <div className="relative">
                    <input
                      type={fpShowPassword ? 'text' : 'password'}
                      placeholder="Buat password baru"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={fpNewPassword}
                      onChange={(e) => { setFpNewPassword(e.target.value); setFpError('') }}
                      className="w-full border border-input rounded-lg px-3 py-2.5 pr-10 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button type="button" tabIndex={-1} onClick={() => setFpShowPassword(!fpShowPassword)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-0.5">
                      {fpShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {fpNewPassword.length > 0 && fpNewPassword.length < 6 && (
                    <p className="text-xs text-red-500 mt-1">Password harus minimal 6 karakter ({fpNewPassword.length}/6)</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Konfirmasi Password Baru</label>
                  <div className="relative">
                    <input
                      type={fpShowConfirm ? 'text' : 'password'}
                      placeholder="Ulangi password baru"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={fpConfirmPassword}
                      onChange={(e) => { setFpConfirmPassword(e.target.value); setFpError('') }}
                      className={`w-full border rounded-lg px-3 py-2.5 pr-10 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        fpConfirmPassword.length > 0 && fpConfirmPassword !== fpNewPassword ? 'border-red-300' : 'border-input'
                      }`}
                    />
                    <button type="button" tabIndex={-1} onClick={() => setFpShowConfirm(!fpShowConfirm)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-0.5">
                      {fpShowConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {fpConfirmPassword.length > 0 && fpConfirmPassword !== fpNewPassword && (
                    <p className="text-xs text-red-500 mt-1">Password tidak cocok</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={fpLoading || fpNewPassword.length < 6 || fpConfirmPassword.length < 6 || fpNewPassword !== fpConfirmPassword}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {fpLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</> : 'Ubah Password'}
                </button>

                <button
                  type="button"
                  onClick={() => { setFpAccount(null); setFpError(''); setFpNewPassword(''); setFpConfirmPassword('') }}
                  className="w-full text-sm text-muted-foreground hover:text-foreground py-1 transition-colors"
                >
                  ← Ganti Email
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ===== DEMO POPUP DIALOG ===== */}
      {demoPopupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-card rounded-2xl shadow-2xl border border-amber-200 dark:border-amber-800 max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Info className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-foreground">Akun Demo</h3>
                {demoRemaining !== null && (
                  <p className="text-sm text-amber-700 dark:text-amber-400 font-semibold mt-0.5">
                    {demoRemaining} {t('hari_tersisa')}
                  </p>
                )}
              </div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-5">
              <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{demoPopupMsg}</p>
            </div>
            <button
              onClick={() => { setDemoPopupOpen(false); applyThemeAfterLogin(); window.location.href = '/pembukaan' }}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2.5 rounded-xl transition-colors"
              autoFocus
            >
              Ok
            </button>
            <button
              onClick={() => { setDemoPopupOpen(false); applyThemeAfterLogin(); window.location.href = '/pembukaan' }}
              className="w-full text-sm text-muted-foreground hover:text-foreground mt-3 py-1 transition-colors"
            >
              Masuk ke Halaman Utama
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
