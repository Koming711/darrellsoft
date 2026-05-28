'use client'

import { useState, useEffect, Suspense } from 'react'
import { Eye, EyeOff, Phone, Mail, User as UserIcon, Loader2, AlertCircle, Info, CheckCircle, ArrowLeft, KeyRound, MailCheck, Copy, Check, ExternalLink, MessageCircle } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { useLanguage } from '@/contexts/language-context'
import { toast } from 'sonner'
import { applyThemeAfterLogin } from '@/contexts/theme-context'
import { notifyDataChange } from '@/lib/data-sync'


export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>}>
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
  const [fpUsername, setFpUsername] = useState('')
  const [fpLoading, setFpLoading] = useState(false)
  const [fpError, setFpError] = useState('')
  // Step 1: account found
  const [fpAccount, setFpAccount] = useState<{ name: string; role: string; maskedEmail: string; hasEmail: boolean } | null>(null)
  // Step 2: result after sending (email or whatsapp)
  const [fpResult, setFpResult] = useState<{ emailSent: boolean; maskedEmail: string; message: string; resetUrl: string } | null>(null)
  const [fpSendingEmail, setFpSendingEmail] = useState(false)
  const [copied, setCopied] = useState(false)

  // Demo popup state
  const [demoPopupOpen, setDemoPopupOpen] = useState(false)
  const [demoPopupMsg, setDemoPopupMsg] = useState('')
  const [demoRemaining, setDemoRemaining] = useState<number | null>(null)

  const [loginBgColor, setLoginBgColor] = useState<string | null>(null)

  const router = useRouter()
  const { t } = useLanguage()

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

    // Fetch login bg color (public endpoint, no auth needed)
    fetch('/api/public-settings')
      .then(r => r.json())
      .then(data => {
        if (data.theme_login_color?.trim()) {
          setLoginBgColor(data.theme_login_color.trim())
          document.documentElement.style.setProperty('--app-login-bg', data.theme_login_color.trim())
        }
      })
      .catch(() => {})
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
      localStorage.setItem('auth', JSON.stringify({
        id: data.id,
        username: data.username,
        name: data.name,
        role: data.role,
        sessionId: data.sessionId,
      }))

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

  // Step 1: Search for account
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setFpError('')
    setFpAccount(null)
    setFpResult(null)
    setFpLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: fpUsername, action: 'search' }),
      })
      const data = await res.json()

      if (res.status === 404) {
        setFpError(data.message || 'Username tidak ditemukan')
        setFpLoading(false)
        return
      }

      if (!res.ok) {
        setFpError(data.error || 'Terjadi kesalahan')
        setFpLoading(false)
        return
      }

      setFpAccount({ name: data.name, role: data.role, maskedEmail: data.maskedEmail, hasEmail: data.hasEmail })
    } catch {
      setFpError('Terjadi kesalahan jaringan')
    } finally {
      setFpLoading(false)
    }
  }

  // Step 2a: Send email
  const handleSendEmail = async () => {
    setFpError('')
    setFpSendingEmail(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: fpUsername, action: 'send-email' }),
      })
      const data = await res.json()

      if (!res.ok) {
        setFpError(data.error || 'Terjadi kesalahan')
        setFpSendingEmail(false)
        return
      }

      setFpResult({ emailSent: data.emailSent, maskedEmail: data.maskedEmail, message: data.message, resetUrl: data.resetUrl || '' })
    } catch {
      setFpError('Terjadi kesalahan jaringan')
    } finally {
      setFpSendingEmail(false)
    }
  }

  // Step 2b: Send via WhatsApp
  const handleWhatsApp = async () => {
    setFpError('')
    setFpSendingEmail(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: fpUsername, action: 'whatsapp' }),
      })
      const data = await res.json()

      if (!res.ok) {
        setFpError(data.error || 'Terjadi kesalahan')
        setFpSendingEmail(false)
        return
      }

      // Open WhatsApp with pre-filled message containing reset link
      const waText = encodeURIComponent(
        `Halo Admin Darrell Soft, saya lupa password akun saya.\n\nUsername: ${data.username}\nNama: ${data.name}\n\nLink reset password: ${data.resetUrl}\n\nMohon bantuan untuk reset password. Terima kasih!`
      )
      const waUrl = `https://wa.me/6285888082208?text=${waText}`
      window.open(waUrl, '_blank')

      // Also show the link in the dialog as backup
      setFpResult({ emailSent: false, maskedEmail: '', message: 'Link reset password telah disiapkan. Cek WhatsApp Anda atau salin link di bawah.', resetUrl: data.resetUrl })
    } catch {
      setFpError('Terjadi kesalahan jaringan')
    } finally {
      setFpSendingEmail(false)
    }
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
        localStorage.setItem('auth', JSON.stringify({
          id: data.id,
          username: data.username,
          name: data.name,
          role: data.role,
          sessionId: data.sessionId,
        }))

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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col px-4 py-8" style={{ background: loginBgColor || 'linear-gradient(to bottom right, #EFF6FF, #ffffff, #f1f5f9)' }}>
      {/* Back button */}
      <button
        onClick={() => router.push('/')}
        className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors w-fit mt-2"
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
          <h1 className="text-3xl font-bold text-slate-800">{t('app_name')}</h1>
          <p className="text-slate-500 mt-2 text-base">{t('app_tagline')}</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab('login')}
              className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${
                activeTab === 'login'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t('masuk')}
            </button>
            <button
              onClick={() => setActiveTab('register')}
              className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${
                activeTab === 'register'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                  : 'text-slate-500 hover:text-slate-700'
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
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {loginError}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
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
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
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
                      className="w-full border border-slate-300 rounded-lg px-3 py-2.5 pr-10 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-0.5"
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
                  <p className="text-sm text-slate-500">
                    {t('belum_punya_akun')}{' '}
                    <button
                      type="button"
                      onClick={() => setActiveTab('register')}
                      className="text-blue-600 hover:text-blue-700 font-medium"
                    >
                      {t('daftar_sekarang')}
                    </button>
                  </p>
                  <button
                    type="button"
                    onClick={() => { setShowForgotPassword(true); setFpUsername(''); setFpError(''); setFpAccount(null); setFpResult(null) }}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {t('lupa_password')}
                  </button>
                </div>
              </form>
            ) : regSuccess ? (
              <div className="text-center py-4 space-y-4">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Pendaftaran Berhasil!</h3>
                  <p className="text-sm text-slate-600 mt-2 leading-relaxed">
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
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {regError}
                  </div>
                )}

                {/* Nama Lengkap */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('nama_lengkap')}
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Masukkan nama lengkap"
                      required
                      value={regNamaLengkap}
                      onChange={(e) => setRegNamaLengkap(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Nomor Handphone */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('nomor_handphone')}
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="tel"
                      placeholder="Contoh: 081234567890"
                      required
                      value={regNomorHP}
                      onChange={(e) => setRegNomorHP(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('email')}
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      placeholder="email@contoh.com"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Username */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('username')} <span className="text-xs text-slate-400">(minimal 3 karakter)</span>
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
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
                      className={`w-full border rounded-lg pl-9 pr-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        regUsername.length > 0 && regUsername.length < 3 ? 'border-red-300' : 'border-slate-300'
                      }`}
                    />
                  </div>
                  {regUsername.length > 0 && regUsername.length < 3 && (
                    <p className="text-xs text-red-500 mt-1">Username harus minimal 3 karakter ({regUsername.length}/3)</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('password')} <span className="text-xs text-slate-400">(minimal 6 karakter)</span>
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
                      className={`w-full border rounded-lg px-3 py-2.5 pr-10 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        regPassword.length > 0 && regPassword.length < 6 ? 'border-red-300' : 'border-slate-300'
                      }`}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-0.5"
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">
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
                      className={`w-full border rounded-lg px-3 py-2.5 pr-10 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        regConfirmPassword.length > 0 && regConfirmPassword !== regPassword ? 'border-red-300' : 'border-slate-300'
                      }`}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-0.5"
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

                <p className="text-center text-sm text-slate-500">
                  {t('sudah_punya_akun')}{' '}
                  <button
                    type="button"
                    onClick={() => setActiveTab('login')}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {t('login_sekarang')}
                  </button>
                </p>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          &copy; Copyright by Darrell Soft 2026 All rights reserved
        </p>
      </div>
      </div>

      {/* ===== FORGOT PASSWORD DIALOG ===== */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-800">{t('lupa_password')}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{t('lupa_password_desc')}</p>
              </div>
            </div>

            {/* Step 1: Search account */}
            {!fpAccount && !fpResult ? (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                {fpError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {fpError}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('username')}</label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder={t('masukkan_username')}
                      required
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={fpUsername}
                      onChange={(e) => { setFpUsername(e.target.value); setFpError('') }}
                      className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={fpLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {fpLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Mencari...</>
                  ) : (
                    'Cari Akun'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForgotPassword(false); setFpUsername(''); setFpError(''); setFpAccount(null); setFpResult(null) }}
                  className="w-full text-sm text-slate-500 hover:text-slate-700 py-1 transition-colors"
                >
                  {t('kembali_ke_login')}
                </button>
              </form>
            ) : fpAccount && !fpResult ? (
              /* Step 2: Choose method - Email or WhatsApp */
              <div className="space-y-4">
                {fpError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {fpError}
                  </div>
                )}

                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <p className="text-sm font-semibold text-green-800">Akun Ditemukan</p>
                  </div>
                  <div className="space-y-1 ml-7">
                    <p className="text-sm text-green-700"><span className="font-medium">Nama:</span> {fpAccount.name}</p>
                    <p className="text-sm text-green-700"><span className="font-medium">Role:</span> {fpAccount.role}</p>
                  </div>
                </div>

                <p className="text-sm text-slate-600 text-center font-medium">Pilih metode reset password:</p>

                {/* Email option */}
                {fpAccount.hasEmail && (
                  <button
                    type="button"
                    onClick={handleSendEmail}
                    disabled={fpSendingEmail}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    {fpSendingEmail ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Mengirim...</>
                    ) : (
                      <>
                        <Mail className="w-4 h-4" />
                        Kirim via Email ({fpAccount.maskedEmail})
                      </>
                    )}
                  </button>
                )}

                {/* WhatsApp option */}
                <button
                  type="button"
                  onClick={handleWhatsApp}
                  disabled={fpSendingEmail}
                  className="w-full bg-green-500 hover:bg-green-600 disabled:bg-green-400 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {fpSendingEmail ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Mengirim...</>
                  ) : (
                    <>
                      <MessageCircle className="w-4 h-4" />
                      Hubungi Admin via WhatsApp
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => { setFpAccount(null); setFpError('') }}
                  className="w-full text-sm text-slate-500 hover:text-slate-700 py-1 transition-colors"
                >
                  ← Cari Username Lain
                </button>
              </div>
            ) : fpResult ? (
              /* Step 3: Result */
              <div className="space-y-4">
                {fpResult.emailSent ? (
                  <>
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <MailCheck className="w-5 h-5 text-green-600" />
                        <p className="text-sm font-semibold text-green-800">Email Terkirim</p>
                      </div>
                      <div className="ml-7">
                        <p className="text-sm text-green-700 leading-relaxed">
                          Link reset password telah dikirim ke email <strong>{fpResult.maskedEmail}</strong>. Silakan cek inbox atau folder spam Anda.
                        </p>
                      </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <p className="text-sm text-blue-800 leading-relaxed">
                        Klik tautan dalam email untuk membuat password baru. Tautan berlaku selama <strong>1 jam</strong>.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="w-5 h-5 text-amber-600" />
                        <p className="text-sm font-semibold text-amber-800">Email Gagal Dikirim</p>
                      </div>
                      <div className="ml-7">
                        <p className="text-sm text-amber-700 leading-relaxed">
                          {fpResult.message}
                        </p>
                      </div>
                    </div>

                    {fpResult.resetUrl && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                        <p className="text-xs font-medium text-slate-600">Link Reset Password:</p>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            value={fpResult.resetUrl}
                            className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-700 select-all focus:outline-none"
                            onClick={(e) => (e.target as HTMLInputElement).select()}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(fpResult.resetUrl)
                              setCopied(true)
                              setTimeout(() => setCopied(false), 2000)
                            }}
                            className="flex-shrink-0 p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 transition-colors"
                            title="Salin link"
                          >
                            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
                          </button>
                        </div>
                        <a
                          href={fpResult.resetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Buka Link Reset Password
                        </a>
                      </div>
                    )}

                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <p className="text-sm text-blue-800 leading-relaxed">
                        Link berlaku selama <strong>1 jam</strong>. Simpan atau salin link ini sebelum menutup dialog.
                      </p>
                    </div>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => { setShowForgotPassword(false); setFpUsername(''); setFpError(''); setFpAccount(null); setFpResult(null); setCopied(false) }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl transition-colors"
                >
                  {t('kembali_ke_login')}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ===== DEMO POPUP DIALOG ===== */}
      {demoPopupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-amber-200 max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <Info className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-800">Akun Demo</h3>
                {demoRemaining !== null && (
                  <p className="text-sm text-amber-700 font-semibold mt-0.5">
                    {demoRemaining} {t('hari_tersisa')}
                  </p>
                )}
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
              <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{demoPopupMsg}</p>
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
              className="w-full text-sm text-slate-500 hover:text-slate-700 mt-3 py-1 transition-colors"
            >
              Masuk ke Halaman Utama
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
