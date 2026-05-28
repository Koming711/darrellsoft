'use client'

import { useState, useEffect, Suspense } from 'react'
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle, KeyRound, ArrowLeft } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>}>
      <ResetPasswordContent />
    </Suspense>
  )
}

function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const router = useRouter()

  const [verifying, setVerifying] = useState(true)
  const [tokenValid, setTokenValid] = useState(false)
  const [tokenError, setTokenError] = useState('')
  const [maskedEmail, setMaskedEmail] = useState('')

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!token) {
      setTokenError('Token reset password tidak ditemukan. Silakan ajukan permintaan reset password baru.')
      setVerifying(false)
      return
    }

    // Verify the token
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.valid) {
          setTokenValid(true)
          // Mask the email
          const email = data.email || ''
          const parts = email.split('@')
          if (parts.length === 2) {
            setMaskedEmail(`${parts[0].substring(0, 2)}***@${parts[1]}`)
          }
        } else {
          setTokenValid(false)
          setTokenError(data.error || 'Token tidak valid')
        }
      })
      .catch(() => {
        setTokenError('Terjadi kesalahan saat memverifikasi token')
      })
      .finally(() => {
        setVerifying(false)
      })
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (newPassword.length < 6) {
      setError('Password baru minimal 6 karakter')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Password dan konfirmasi password tidak sama')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Gagal mereset password')
        setLoading(false)
        return
      }

      setSuccess(true)
    } catch {
      setError('Terjadi kesalahan jaringan')
    } finally {
      setLoading(false)
    }
  }

  // Verifying state
  if (verifying) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 text-sm">Memverifikasi token...</p>
        </div>
      </div>
    )
  }

  // Invalid token state
  if (!tokenValid && !verifying) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-7 h-7 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Token Tidak Valid</h2>
            <p className="text-sm text-slate-600 mb-6">{tokenError}</p>
            <button
              onClick={() => router.push('/login')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl transition-colors"
            >
              Kembali ke Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-7 h-7 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Password Berhasil Diubah!</h2>
            <p className="text-sm text-slate-600 mb-6">
              Password Anda telah berhasil direset. Silakan login dengan password baru Anda.
            </p>
            <button
              onClick={() => router.push('/login')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl transition-colors"
            >
              Masuk ke Akun
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Reset password form
  return (
    <div className="min-h-screen flex flex-col px-4 py-8" style={{ background: 'linear-gradient(to bottom right, #EFF6FF, #ffffff, #f1f5f9)' }}>
      <button
        onClick={() => router.push('/login')}
        className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors w-fit mt-2"
      >
        <ArrowLeft className="w-4 h-4" />
        Kembali ke Login
      </button>

      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-md">
          {/* Logo and Title */}
          <div className="text-center mb-8 flex flex-col items-center">
            <div className="relative mb-6">
              <div className="w-[100px] h-[100px] rounded-2xl bg-blue-100 flex items-center justify-center mx-auto">
                <KeyRound className="w-12 h-12 text-blue-600" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Reset Password</h1>
            <p className="text-slate-500 mt-2 text-sm">
              {maskedEmail ? `Untuk akun email ${maskedEmail}` : 'Buat password baru untuk akun Anda'}
            </p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 font-medium flex items-center gap-2 mb-4">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Password Baru
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Masukkan password baru (minimal 6 karakter)"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setError('') }}
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
                {newPassword.length > 0 && newPassword.length < 6 && (
                  <p className="text-xs text-red-500 mt-1">Password harus minimal 6 karakter ({newPassword.length}/6)</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Konfirmasi Password Baru
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Ulangi password baru"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setError('') }}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 pr-10 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                  <p className="text-xs text-red-500 mt-1">Password tidak cocok</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || newPassword.length < 6 || confirmPassword.length < 6 || newPassword !== confirmPassword}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  'Simpan Password Baru'
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">
            &copy; Copyright by Darrell Soft 2026 All rights reserved
          </p>
        </div>
      </div>
    </div>
  )
}
