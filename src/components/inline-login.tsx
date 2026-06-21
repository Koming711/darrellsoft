'use client'

import { useState } from 'react'
import { Key, Eye, EyeOff, Phone, Mail, User as UserIcon, Loader2, AlertCircle, Info } from 'lucide-react'
import { useLanguage } from '@/contexts/language-context'
import { setAuthUser } from '@/lib/auth'


export function InlineLogin({ onSuccess }: { onSuccess: (user: any) => void }) {
  const { t } = useLanguage()

  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Login state
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')

  // Register state
  const [regNamaLengkap, setRegNamaLengkap] = useState('')
  const [regNomorHP, setRegNomorHP] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regUsername, setRegUsername] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regConfirmPassword, setRegConfirmPassword] = useState('')
  const [regError, setRegError] = useState('')
  const [regLoading, setRegLoading] = useState(false)

  // Demo popup state
  const [demoPopupOpen, setDemoPopupOpen] = useState(false)
  const [demoPopupMsg, setDemoPopupMsg] = useState('')
  const [demoRemaining, setDemoRemaining] = useState<number | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })

      const data = await res.json()

      if (!res.ok) {
        setLoginError(data.error || 'Login gagal')
        setLoginLoading(false)
        return
      }

      setAuthUser({
        id: data.id,
        username: data.username,
        name: data.name,
        role: data.role,
        sessionId: data.sessionId,
      })

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

      if (data.role === 'demo' && data.demoPopupMessage) {
        setDemoPopupMsg(data.demoPopupMessage)
        setDemoRemaining(data.demoRemainingDays ?? null)
        setDemoPopupOpen(true)
        setLoginLoading(false)
      } else {
        onSuccess(data)
      }
    } catch (err) {
      setLoginError('Terjadi kesalahan jaringan')
      setLoginLoading(false)
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

      setAuthUser({
        id: data.id,
        username: data.username,
        name: data.name,
        role: data.role,
        sessionId: data.sessionId,
      })

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

      if (data.role === 'demo' && data.demoPopupMessage) {
        setDemoPopupMsg(data.demoPopupMessage)
        setDemoRemaining(data.demoRemainingDays ?? null)
        setDemoPopupOpen(true)
      } else {
        onSuccess(data)
      }
    } catch (err) {
      setRegError('Terjadi kesalahan jaringan')
    } finally {
      setRegLoading(false)
    }
  }

  const handleDemoOk = () => {
    setDemoPopupOpen(false)
    // Reload the page to reinitialize with new auth
    window.location.reload()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-100 dark:from-slate-900 dark:via-card dark:to-slate-900 flex items-center justify-center px-4 py-8">
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
          <h1 className="text-3xl font-bold text-foreground">{t('app_name')}</h1>
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
                {loginError && (
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {loginError}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{t('username')}</label>
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
                  <label className="block text-sm font-medium text-foreground mb-1">{t('password')}</label>
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
                    <><Loader2 className="w-4 h-4 animate-spin" /> {t('memproses')}</>
                  ) : (
                    t('masuk')
                  )}
                </button>
                <p className="text-center text-sm text-muted-foreground">
                  {t('belum_punya_akun')}{' '}
                  <button type="button" onClick={() => setActiveTab('register')} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium">
                    {t('daftar_sekarang')}
                  </button>
                </p>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-3">
                {regError && (
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {regError}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{t('nama_lengkap')}</label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input type="text" placeholder="Masukkan nama lengkap" required value={regNamaLengkap} onChange={(e) => setRegNamaLengkap(e.target.value)}
                      className="w-full border border-input rounded-lg pl-9 pr-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{t('nomor_handphone')}</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input type="tel" placeholder="Contoh: 081234567890" required value={regNomorHP} onChange={(e) => setRegNomorHP(e.target.value)}
                      className="w-full border border-input rounded-lg pl-9 pr-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{t('email')}</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input type="email" placeholder="email@contoh.com" required value={regEmail} onChange={(e) => setRegEmail(e.target.value)}
                      className="w-full border border-input rounded-lg pl-9 pr-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('username')} <span className="text-xs text-muted-foreground">(minimal 3 karakter)</span>
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input type="text" placeholder="Buat username" required autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} minLength={3}
                      value={regUsername} onChange={(e) => setRegUsername(e.target.value)}
                      className={`w-full border rounded-lg pl-9 pr-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        regUsername.length > 0 && regUsername.length < 3 ? 'border-red-300' : 'border-input'
                      }`} />
                  </div>
                  {regUsername.length > 0 && regUsername.length < 3 && (
                    <p className="text-xs text-red-500 mt-1">Username harus minimal 3 karakter ({regUsername.length}/3)</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('password')} <span className="text-xs text-muted-foreground">(minimal 6 karakter)</span>
                  </label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} placeholder="Buat password" required autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} minLength={6}
                      value={regPassword} onChange={(e) => setRegPassword(e.target.value)}
                      className={`w-full border rounded-lg px-3 py-2.5 pr-10 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        regPassword.length > 0 && regPassword.length < 6 ? 'border-red-300' : 'border-input'
                      }`} />
                    <button type="button" tabIndex={-1} onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-0.5">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {regPassword.length > 0 && regPassword.length < 6 && (
                    <p className="text-xs text-red-500 mt-1">Password harus minimal 6 karakter ({regPassword.length}/6)</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{t('konfirmasi_password')}</label>
                  <div className="relative">
                    <input type={showConfirmPassword ? 'text' : 'password'} placeholder="Ulangi password" required autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} minLength={6}
                      value={regConfirmPassword} onChange={(e) => setRegConfirmPassword(e.target.value)}
                      className={`w-full border rounded-lg px-3 py-2.5 pr-10 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        regConfirmPassword.length > 0 && regConfirmPassword !== regPassword ? 'border-red-300' : 'border-input'
                      }`} />
                    <button type="button" tabIndex={-1} onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-0.5">
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {regConfirmPassword.length > 0 && regConfirmPassword !== regPassword && (
                    <p className="text-xs text-red-500 mt-1">Password tidak cocok</p>
                  )}
                </div>

                <button type="submit" disabled={regLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                  {regLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {t('mendaftar')}</>
                  ) : (
                    t('daftar_akun')
                  )}
                </button>
                <p className="text-center text-sm text-muted-foreground">
                  {t('sudah_punya_akun')}{' '}
                  <button type="button" onClick={() => setActiveTab('login')} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium">
                    {t('login_sekarang')}
                  </button>
                </p>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          &copy; Copyright by www.darrellsoft.com 2026 All rights reserved
        </p>
      </div>

      {/* Demo Popup */}
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
                  <p className="text-sm text-amber-700 dark:text-amber-400 font-semibold mt-0.5">{demoRemaining} {t('hari_tersisa')}</p>
                )}
              </div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-5">
              <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{demoPopupMsg}</p>
            </div>
            <button onClick={handleDemoOk} className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2.5 rounded-xl transition-colors" autoFocus>
              Ok
            </button>
            <button onClick={handleDemoOk} className="w-full text-sm text-muted-foreground hover:text-foreground mt-3 py-1 transition-colors">
              Masuk ke Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
