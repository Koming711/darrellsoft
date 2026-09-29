'use client'

import { useState, useEffect, useRef } from 'react'
import { Phone, Loader2, AlertCircle, CheckCircle, XCircle, MessageCircle } from 'lucide-react'
import { useLanguage } from '@/contexts/language-context'

const PHONE_REGEX = /^(\+62|62|0)[0-9]{8,13}$/

function localNormalizePhone(raw: string): string {
  let p = (raw || '').replace(/\D/g, '')
  if (!p) return ''
  if (p.startsWith('620') && p.length > 11) p = '62' + p.slice(3)
  else if (p.startsWith('0')) p = '62' + p.slice(1)
  return p
}

export type Availability = 'idle' | 'invalid' | 'checking' | 'available' | 'taken'

/**
 * Nomor Handphone field with:
 *  - real-time availability check (/api/check-phone, debounced)
 *  - "Kirim OTP" button → sends WhatsApp OTP via /api/register/send-otp
 *  - OTP code input + 60s resend cooldown + dev-mode code banner
 *
 * Reports blocking state to the parent via onBlockedChange so the
 * "Daftar Akun" button can be disabled when the phone is taken/invalid.
 */
export function PhoneOtpField({
  value,
  onChange,
  otpCode,
  onOtpCodeChange,
  onBlockedChange,
}: {
  value: string
  onChange: (v: string) => void
  otpCode: string
  onOtpCodeChange: (v: string) => void
  onBlockedChange?: (blocked: boolean) => void
}) {
  const { t } = useLanguage()
  const [availability, setAvailability] = useState<Availability>('idle')
  const [otpSent, setOtpSent] = useState(false)
  const [otpSending, setOtpSending] = useState(false)
  const [otpError, setOtpError] = useState('')
  const [otpInfo, setOtpInfo] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [devCode, setDevCode] = useState('')
  const otpInputRef = useRef<HTMLInputElement>(null)
  const sentForRef = useRef('')

  const normalized = localNormalizePhone(value)
  const isFormatValid = PHONE_REGEX.test(value.trim().replace(/[\s\-]/g, ''))

  // Real-time phone availability (debounced 600ms)
  useEffect(() => {
    const raw = value.trim()
    setOtpError('')
    setOtpInfo('')
    if (!raw) {
      setAvailability('idle')
      return
    }
    if (!PHONE_REGEX.test(raw.replace(/[\s\-]/g, ''))) {
      setAvailability('invalid')
      return
    }
    setAvailability('checking')
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/check-phone?phone=${encodeURIComponent(raw)}`)
        const data = await res.json()
        setAvailability(data.available ? 'available' : 'taken')
      } catch {
        // Network error → don't block here; server re-validates on submit
        setAvailability('idle')
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [normalized])

  // Notify parent whether phone blocks registration
  useEffect(() => {
    onBlockedChange?.(availability === 'taken' || availability === 'invalid')
  }, [availability])

  // Resend cooldown countdown (1s tick)
  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  // Reset OTP state when the phone changes after a code was sent
  useEffect(() => {
    if (otpSent && sentForRef.current && sentForRef.current !== normalized) {
      setOtpSent(false)
      setOtpInfo('')
      setOtpError('')
      setDevCode('')
      onOtpCodeChange('')
    }
  }, [normalized])

  const handleSendOtp = async () => {
    setOtpError('')
    setOtpInfo('')
    if (!isFormatValid) {
      setOtpError('Format nomor handphone tidak valid. Gunakan format 08xxxxxxxxxx.')
      return
    }
    if (availability === 'taken') {
      setOtpError(t('nomor_hp_sudah_digunakan'))
      return
    }
    setOtpSending(true)
    try {
      const res = await fetch('/api/register/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomorHP: value.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.code === 'PHONE_EXISTS') setAvailability('taken')
        if (typeof data.waitSeconds === 'number' && data.waitSeconds > 0) setCooldown(data.waitSeconds)
        setOtpError(data.error || 'Gagal mengirim OTP. Silakan coba lagi.')
        return
      }
      sentForRef.current = normalized
      setOtpSent(true)
      onOtpCodeChange('')
      setCooldown(60)
      setDevCode(data.devCode || '')
      setOtpInfo(`${t('otp_terkirim_prefix')} ${value.trim()}${t('otp_terkirim_suffix')}`)
      setTimeout(() => otpInputRef.current?.focus(), 100)
    } catch {
      setOtpError('Terjadi kesalahan jaringan. Silakan coba lagi.')
    } finally {
      setOtpSending(false)
    }
  }

  const sendDisabled = otpSending || cooldown > 0 || availability === 'taken' || availability === 'checking'

  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1">
        {t('nomor_handphone')}
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="tel"
            placeholder={t('contoh_nomor_hp')}
            required
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`w-full border rounded-lg pl-9 pr-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              availability === 'taken' || availability === 'invalid' ? 'border-red-300' : 'border-input'
            }`}
          />
        </div>
        <button
          type="button"
          onClick={handleSendOtp}
          disabled={sendDisabled}
          className="flex-shrink-0 inline-flex items-center justify-center gap-1.5 px-3.5 rounded-lg text-sm font-semibold transition-colors border border-blue-600 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
        >
          {otpSending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="hidden sm:inline">{t('otp_mengirim')}</span>
            </>
          ) : otpSent ? (
            <>
              <MessageCircle className="w-4 h-4" />
              {cooldown > 0 ? `${t('otp_kirim_ulang_dalam')} ${cooldown}${t('otp_detik')}` : t('otp_kirim_ulang')}
            </>
          ) : (
            <>
              <MessageCircle className="w-4 h-4" />
              {t('kirim_otp')}
            </>
          )}
        </button>
      </div>

      {/* Availability feedback */}
      {availability === 'checking' && (
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          {t('nomor_hp_mengecek')}
        </p>
      )}
      {availability === 'invalid' && value.trim() !== '' && (
        <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
          <XCircle className="w-3 h-3 flex-shrink-0" />
          Format nomor tidak valid. Gunakan format 08xxxxxxxxxx.
        </p>
      )}
      {availability === 'taken' && (
        <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
          <XCircle className="w-3 h-3 flex-shrink-0" />
          {t('nomor_hp_sudah_digunakan')}
        </p>
      )}
      {availability === 'available' && (
        <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
          <CheckCircle className="w-3 h-3 flex-shrink-0" />
          {t('nomor_hp_tersedia')}
        </p>
      )}

      {/* OTP section — appears after code is sent */}
      {otpSent && (
        <div className="mt-3 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/30 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <MessageCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <label className="block text-sm font-medium text-foreground">
                {t('otp_kode_label')}
              </label>
              <p className="text-xs text-muted-foreground mt-0.5">{otpInfo}</p>
            </div>
          </div>

          {devCode && (
            <div className="rounded-lg bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 px-3 py-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
              {t('otp_dev_code')} <span className="tracking-widest">{devCode}</span>
            </div>
          )}

          <input
            ref={otpInputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={6}
            placeholder={t('otp_kode_placeholder')}
            value={otpCode}
            onChange={(e) => onOtpCodeChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="w-full border border-input rounded-lg px-3 py-2.5 text-center text-lg font-semibold tracking-[0.4em] text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />

          {otpError && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              {otpError}
            </p>
          )}
        </div>
      )}

      {/* Send failure error (before OTP section exists) */}
      {!otpSent && otpError && (
        <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          {otpError}
        </p>
      )}
    </div>
  )
}

export type UsernameStatus = 'idle' | 'short' | 'checking' | 'available' | 'taken'

/**
 * Debounced username availability check against /api/check-username.
 */
export function useUsernameCheck(username: string): UsernameStatus {
  const [status, setStatus] = useState<UsernameStatus>('idle')

  useEffect(() => {
    const u = username.trim()
    if (!u) {
      setStatus('idle')
      return
    }
    if (u.length < 3) {
      setStatus('short')
      return
    }
    setStatus('checking')
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/check-username?username=${encodeURIComponent(u)}`)
        const data = await res.json()
        setStatus(data.available ? 'available' : 'taken')
      } catch {
        // Network error → don't block; server re-validates on submit
        setStatus('idle')
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [username])

  return status
}
