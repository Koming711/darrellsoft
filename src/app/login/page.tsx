'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { Eye, EyeOff, Mail, Loader2, AlertCircle, CheckCircle, ArrowLeft, KeyRound, X, MessageCircle } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getAuthUser, setAuthUser } from '@/lib/auth'
import { useLanguage } from '@/contexts/language-context'
import { applyThemeAfterLogin } from '@/contexts/theme-context'
import { ThemeToggle } from '@/components/theme-toggle'
import { LanguageToggle } from '@/components/language-toggle'
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
  const nextUrl = (() => {
    const n = searchParams.get('next') ?? ''
    // hanya izinkan path internal relatif (hindari open redirect)
    return n.startsWith('/') && !n.startsWith('//') ? n : ''
  })()
  const goAfterAuth = () => {
    // Prioritas: ?next= eksplisit → arahan status langganan dari server (tagihan terbuka /
    // belum pilih paket) → beranda aplikasi.
    window.location.href = nextUrl || postLoginTargetRef.current || '/pembukaan'
  }
  // Arahan lanjut sesuai status langganan (diisi dari respons login server)
  const postLoginTargetRef = useRef('')
  const [showPassword, setShowPassword] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)

  // Login state
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')

  // Forgot password state — alur OTP WhatsApp ke nomor terdaftar:
  // step 'search' (cari akun) → 'otp' (kirim + verifikasi OTP) → 'reset' (password baru)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [fpStep, setFpStep] = useState<'search' | 'otp' | 'reset'>('search')
  const [fpIdentifier, setFpIdentifier] = useState('')
  const [fpLoading, setFpLoading] = useState(false)
  const [fpError, setFpError] = useState('')
  const [fpAccount, setFpAccount] = useState<{ name: string; username: string; userId: string; userType: string; maskedWhatsApp: string } | null>(null)
  const [fpOtpSent, setFpOtpSent] = useState(false)
  const [fpOtpCode, setFpOtpCode] = useState('')
  const [fpOtpCooldown, setFpOtpCooldown] = useState(0)
  const [fpDevCode, setFpDevCode] = useState('')
  const [fpNewPassword, setFpNewPassword] = useState('')
  const [fpConfirmPassword, setFpConfirmPassword] = useState('')
  const [fpShowPassword, setFpShowPassword] = useState(false)
  const [fpShowConfirm, setFpShowConfirm] = useState(false)
  const [fpSuccess, setFpSuccess] = useState(false)

  const router = useRouter()
  const { t } = useLanguage()
  const { resolvedTheme } = useTheme()

  // Pendaftaran akun kini memakai halaman khusus /daftar (alur baru dengan
  // OTP WhatsApp + StepIndicator). Semua link ?tab=register diarahkan ke sana.
  useEffect(() => {
    if (searchParams.get('tab') === 'register') {
      router.replace('/daftar')
    }
  }, [searchParams, router])

  // Check if already logged in + fetch company branding
  useEffect(() => {
    if (isRedirecting) return

    const authUser = getAuthUser()
    if (authUser) {
      setIsRedirecting(true)
      // Use hard navigation to ensure DashboardLayout reads fresh auth state
      goAfterAuth()
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

      // Arahan lanjut sesuai status langganan (tagihan terbuka / belum pilih paket)
      postLoginTargetRef.current = typeof data.subscriptionRedirect === 'string' ? data.subscriptionRedirect : ''

      // Popup "Akun Demo" dihapus — login langsung lanjut ke arahan berikutnya
      applyThemeAfterLogin()
      // Use hard navigation to ensure DashboardLayout reads fresh auth state
      // (router.push can fail in iframe contexts)
      goAfterAuth()
    } catch (err: any) {
      console.error('Login network error:', err)
      // Provide more specific error messages
      if (err?.name === 'AbortError') {
        setLoginError(t('permintaan_timeout'))
      } else if (err?.name === 'TypeError' && err?.message?.includes('fetch')) {
        setLoginError(t('tidak_terhubung_server'))
      } else {
        setLoginError(t('terjadi_kesalahan_jaringan_coba'))
      }
      setLoginLoading(false)
    }
  }

  // ===== Forgot password (OTP WhatsApp ke nomor terdaftar) =====

  // Cooldown countdown untuk kirim ulang OTP (1 detik per tick)
  useEffect(() => {
    if (fpOtpCooldown <= 0) return
    const id = setTimeout(() => setFpOtpCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [fpOtpCooldown])

  const requestFpOtp = async (account: { userId: string; userType: string }) => {
    setFpError('')
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send-otp', userId: account.userId, userType: account.userType }),
    })
    const data = await res.json()
    if (!res.ok) {
      if (typeof data.waitSeconds === 'number' && data.waitSeconds > 0) setFpOtpCooldown(data.waitSeconds)
      setFpError(data.error || t('terjadi_kesalahan'))
      return false
    }
    setFpOtpSent(true)
    setFpOtpCode('')
    setFpDevCode(data.devCode || '')
    setFpOtpCooldown(60)
    return true
  }

  // Step 1: cari akun by username/email → langsung kirim OTP ke WhatsApp terdaftar
  const handleFpSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setFpError('')
    setFpSuccess(false)

    if (!fpIdentifier.trim()) {
      setFpError(t('fp_identifier_wajib'))
      return
    }

    setFpLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search', identifier: fpIdentifier }),
      })
      const data = await res.json()

      if (res.status === 404) {
        setFpError(data.message || t('terjadi_kesalahan'))
        return
      }
      if (!res.ok) {
        setFpError(data.error || t('terjadi_kesalahan'))
        return
      }

      const account = { name: data.name, username: data.username, userId: data.userId, userType: data.userType, maskedWhatsApp: data.maskedWhatsApp || '' }
      setFpAccount(account)
      setFpStep('otp')
      // OTP langsung dikirim ke WhatsApp terdaftar begitu akun ditemukan
      await requestFpOtp(account)
    } catch {
      setFpError(t('terjadi_kesalahan_jaringan'))
    } finally {
      setFpLoading(false)
    }
  }

  // Kirim ulang OTP (tombol resend)
  const handleFpResend = async () => {
    if (!fpAccount) return
    setFpLoading(true)
    try {
      await requestFpOtp(fpAccount)
    } finally {
      setFpLoading(false)
    }
  }

  // Step 2: verifikasi OTP
  const handleFpVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setFpError('')

    if (!fpAccount) return
    if (fpOtpCode.trim().length !== 6) {
      setFpError(t('otp_wajib'))
      return
    }

    setFpLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify-otp', userId: fpAccount.userId, userType: fpAccount.userType, otpCode: fpOtpCode.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setFpError(data.error || t('terjadi_kesalahan'))
        return
      }

      setFpError('')
      setFpStep('reset')
    } catch {
      setFpError(t('terjadi_kesalahan_jaringan'))
    } finally {
      setFpLoading(false)
    }
  }

  // Step 3: simpan password baru
  const handleFpReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setFpError('')

    if (!fpAccount) return

    if (fpNewPassword.length < 6) {
      setFpError(t('password_baru_minimal_6'))
      return
    }

    if (fpNewPassword !== fpConfirmPassword) {
      setFpError(t('password_konfirmasi_tidak_sama'))
      return
    }

    setFpLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset',
          userId: fpAccount.userId,
          userType: fpAccount.userType,
          otpCode: fpOtpCode.trim(),
          newPassword: fpNewPassword,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setFpError(data.error || t('terjadi_kesalahan'))
        return
      }

      setFpSuccess(true)
    } catch {
      setFpError(t('terjadi_kesalahan_jaringan'))
    } finally {
      setFpLoading(false)
    }
  }

  const resetFpFields = () => {
    setFpStep('search')
    setFpIdentifier('')
    setFpError('')
    setFpAccount(null)
    setFpOtpSent(false)
    setFpOtpCode('')
    setFpOtpCooldown(0)
    setFpDevCode('')
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
      {/* Top bar: back button + theme toggle */}
      <div className="flex items-center justify-between w-fit mt-2">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('back')}
        </button>
      </div>
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <LanguageToggle compact className="bg-background/80 backdrop-blur-sm border border-border shadow-sm" />
        <ThemeToggle className="h-9 w-9 bg-background/80 backdrop-blur-sm border border-border shadow-sm" />
      </div>

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
          <h1 className="text-[27px] text-foreground" style={{ fontWeight: 900 }}>{t('app_name')}</h1>
          <p className="text-muted-foreground mt-2 text-base">{t('app_tagline')}</p>
        </div>

        {/* Card — tab "Daftar" dihapus: pendaftaran hanya lewat halaman /daftar */}
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          {/* Form Content */}
          <div className="p-6">
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
                    onClick={() => router.push('/daftar')}
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
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          &copy; Copyright by Darrell Soft 2026 All rights reserved
        </p>
      </div>
      </div>

      {/* ===== FORGOT PASSWORD DIALOG (OTP WhatsApp ke nomor terdaftar) ===== */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-card rounded-2xl shadow-2xl border border-border max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start gap-3 mb-5">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-blue-100 dark:bg-blue-900/30">
                <KeyRound className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-foreground">{t('lupa_password')}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{t('atur_ulang_password_email')}</p>
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
                    <p className="text-sm font-semibold text-green-800 dark:text-green-400">{t('password_berhasil_diubah_title')}</p>
                  </div>
                  <div className="ml-7">
                    <p className="text-sm text-green-700 dark:text-green-400 leading-relaxed">
                      {t('password_berhasil_diubah_prefix')}<strong>{fpAccount?.name}</strong>{t('password_berhasil_diubah_suffix')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeFpDialog}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl transition-colors"
                >
                  {t('masuk_sekarang')}
                </button>
              </div>
            ) : fpStep === 'search' ? (
              /* === STEP 1: Cari akun by username/email === */
              <form onSubmit={handleFpSearch} className="space-y-4">
                {fpError && (
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {fpError}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{t('fp_identifier_label')}</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder={t('fp_identifier_placeholder')}
                      required
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={fpIdentifier}
                      onChange={(e) => { setFpIdentifier(e.target.value); setFpError('') }}
                      className="w-full border border-input rounded-lg pl-9 pr-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{t('fp_otp_note')}</p>
                </div>

                <button
                  type="submit"
                  disabled={fpLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {fpLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('mencari')}</> : t('cari_akun')}
                </button>
                <button
                  type="button"
                  onClick={closeFpDialog}
                  className="w-full text-sm text-muted-foreground hover:text-foreground py-1 transition-colors"
                >
                  {t('kembali_ke_login')}
                </button>
              </form>
            ) : fpStep === 'otp' ? (
              /* === STEP 2: OTP terkirim ke WhatsApp terdaftar → verifikasi === */
              <form onSubmit={handleFpVerify} className="space-y-4">
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
                      {t('akun_ditemukan_prefix')}<strong>{fpAccount?.name}</strong> {fpAccount?.username ? `(${fpAccount.username})` : ''} {t('akun_ditemukan_suffix')}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/30 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <MessageCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <label className="block text-sm font-medium text-foreground">
                        {t('otp_kode_label')}
                      </label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {fpOtpSent ? (
                          <>
                            {t('fp_terkirim_ke')} <strong className="text-foreground">{fpAccount?.maskedWhatsApp}</strong>{t('otp_terkirim_suffix')}
                          </>
                        ) : (
                          t('fp_otp_note')
                        )}
                      </p>
                    </div>
                  </div>

                  {fpDevCode && (
                    <div className="rounded-lg bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 px-3 py-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                      {t('otp_dev_code')} <span className="tracking-widest">{fpDevCode}</span>
                    </div>
                  )}

                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={6}
                    placeholder={t('otp_kode_placeholder')}
                    value={fpOtpCode}
                    onChange={(e) => { setFpOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setFpError('') }}
                    className="w-full border border-input rounded-lg px-3 py-2.5 text-center text-lg font-semibold tracking-[0.4em] text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <button
                  type="submit"
                  disabled={fpLoading || fpOtpCode.length !== 6}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {fpLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('fp_memverifikasi')}</> : t('fp_verifikasi_otp')}
                </button>

                <button
                  type="button"
                  onClick={() => void handleFpResend()}
                  disabled={fpLoading || fpOtpCooldown > 0}
                  className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed py-1 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  {fpOtpCooldown > 0 ? `${t('otp_kirim_ulang_dalam')} ${fpOtpCooldown}${t('otp_detik')}` : t('otp_kirim_ulang')}
                </button>

                <button
                  type="button"
                  onClick={resetFpFields}
                  className="w-full text-sm text-muted-foreground hover:text-foreground py-1 transition-colors"
                >
                  {t('fp_ganti_akun')}
                </button>
              </form>
            ) : (
              /* === STEP 3: OTP terverifikasi → password baru === */
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
                      {t('akun_ditemukan_prefix')}<strong>{fpAccount?.name}</strong> {fpAccount?.username ? `(${fpAccount.username})` : ''} {t('akun_ditemukan_suffix')}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('password_baru_label')} <span className="text-xs text-muted-foreground">{t('minimal_6_karakter')}</span>
                  </label>
                  <div className="relative">
                    <input
                      type={fpShowPassword ? 'text' : 'password'}
                      placeholder={t('buat_password_baru')}
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
                    <p className="text-xs text-red-500 mt-1">{t('password_harus_minimal_6_prefix')}{fpNewPassword.length}{t('password_harus_minimal_6_suffix')}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{t('konfirmasi_password_baru_label')}</label>
                  <div className="relative">
                    <input
                      type={fpShowConfirm ? 'text' : 'password'}
                      placeholder={t('ulangi_password_baru')}
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
                    <p className="text-xs text-red-500 mt-1">{t('password_tidak_cocok')}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={fpLoading || fpNewPassword.length < 6 || fpConfirmPassword.length < 6 || fpNewPassword !== fpConfirmPassword}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {fpLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('menyimpan')}</> : t('ubah_password')}
                </button>

                <button
                  type="button"
                  onClick={resetFpFields}
                  className="w-full text-sm text-muted-foreground hover:text-foreground py-1 transition-colors"
                >
                  {t('fp_ganti_akun')}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
