'use client'

// enable-notification-prompt — permintaan izin notifikasi PERTAMA kali
// (setelah install PWA / login pertama).
//
// ATURAN PENTING:
// - Browser tidak selalu mengizinkan prompt otomatis → tampilkan PENJELASAN
//   dulu, izin diminta lewat TOMBOL yang ditekan user (user gesture).
// - Jangan bertanya lagi jika user menolak (permission !== 'default' tidak
//   pernah memunculkan prompt; "Nanti Saja" menyimpan flag localStorage).
// - Jika izin diblokir → tampilkan panduan membuka pengaturan izin browser.
// - "Nanti Saja" → notifikasi in-app tetap berjalan; tombol Aktifkan
//   tersedia di Pengaturan → Notifikasi.

import { useEffect, useState } from 'react'
import { Bell, BellOff, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/language-context'
import { getAuthUser } from '@/lib/auth'
import {
  currentPermission,
  isPushSupported,
  requestNotificationPermission,
  subscribePush,
} from '@/lib/push-client'

const ASKED_KEY = 'notif-permission-asked-v1'

export function EnableNotificationPrompt() {
  const { language } = useLanguage()
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    try {
      // Hanya user yang sudah login (prompt dipasang di DashboardLayout)
      const user = getAuthUser()
      if (!user?.id) return
      // Sudah pernah dimunculkan / sudah dijawab → jangan tanya lagi
      if (localStorage.getItem(ASKED_KEY) === '1') return
      // Izin sudah diputuskan browser → jangan tanya lagi
      if (currentPermission() !== 'default') return
      // Browser/perangkat tidak mendukung push → jangan tanya (in-app tetap jalan)
      if (!isPushSupported()) return

      // Delay kecil agar tidak bentrok dengan UI saat pertama masuk
      const timer = setTimeout(() => setVisible(true), 4000)
      return () => clearTimeout(timer)
    } catch {
      /* ignore */
    }
  }, [])

  const dismiss = () => {
    try {
      localStorage.setItem(ASKED_KEY, '1')
    } catch {
      /* ignore */
    }
    setVisible(false)
  }

  const enable = async () => {
    setBusy(true)
    try {
      const permission = await requestNotificationPermission()
      if (permission === 'granted') {
        const res = await subscribePush()
        if (res.ok) {
          toast.success(
            language === 'en'
              ? 'Notifications enabled on this device.'
              : 'Notifikasi berhasil diaktifkan di perangkat ini.'
          )
        } else {
          toast.info(
            language === 'en'
              ? 'Permission granted, but push registration failed. In-app notifications still work.'
              : 'Izin diberikan, namun pendaftaran push gagal. Notifikasi dalam aplikasi tetap berfungsi.'
          )
        }
      } else if (permission === 'denied') {
        toast.error(
          language === 'en'
            ? 'Notifications blocked. Open the padlock icon in the address bar > Site settings > Notifications > Allow.'
            : 'Notifikasi diblokir. Buka ikon gembok di address bar > Setelan situs > Notifikasi > Izinkan.',
          { duration: 10000 }
        )
      }
    } catch {
      /* ignore */
    } finally {
      try {
        localStorage.setItem(ASKED_KEY, '1')
      } catch {
        /* ignore */
      }
      setBusy(false)
      setVisible(false)
    }
  }

  if (!visible) return null

  return (
    <div className="fixed inset-x-4 bottom-4 z-[110] mx-auto max-w-md animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="rounded-xl border bg-background shadow-2xl overflow-hidden">
        <div className="flex items-start gap-3 p-4 pb-2">
          <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
            <Bell className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold leading-snug">
              {language === 'en' ? 'ENABLE DARRELLSOFT NOTIFICATIONS' : 'AKTIFKAN NOTIFIKASI DARRELLSOFT'}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              {language === 'en'
                ? 'Enable notifications so you never miss important information from Darrellsoft.'
                : 'Aktifkan notifikasi agar Anda tidak ketinggalan informasi penting dari Darrellsoft.'}
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label={language === 'en' ? 'Close' : 'Tutup'}
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 pb-3">
          <p className="text-[11px] font-medium text-muted-foreground">
            {language === 'en' ? 'By enabling notifications, you will receive:' : 'Dengan mengaktifkan notifikasi, Anda akan menerima:'}
          </p>
          <ul className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <ShieldCheck className="h-3 w-3 flex-shrink-0 text-emerald-500" />
              {language === 'en' ? 'Important notifications from the app.' : 'Pemberitahuan penting dari aplikasi.'}
            </li>
            <li className="flex items-center gap-1.5">
              <Bell className="h-3 w-3 flex-shrink-0 text-amber-500" />
              {language === 'en' ? 'Subscription renewal reminders.' : 'Pengingat masa berlangganan.'}
            </li>
            <li className="flex items-center gap-1.5">
              <BellOff className="h-3 w-3 flex-shrink-0 text-slate-400" />
              {language === 'en' ? 'Account & service info per your access rights.' : 'Informasi akun & layanan sesuai hak akses Anda.'}
            </li>
          </ul>
        </div>

        <div className="flex items-center gap-2 border-t bg-muted/40 px-4 py-3">
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {busy
              ? language === 'en'
                ? 'Enabling…'
                : 'Mengaktifkan…'
              : language === 'en'
                ? 'Enable Notifications'
                : 'Aktifkan Notifikasi'}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex h-9 items-center justify-center rounded-lg border px-3 text-xs font-medium transition-colors hover:bg-muted"
          >
            {language === 'en' ? 'Maybe Later' : 'Nanti Saja'}
          </button>
        </div>
      </div>
    </div>
  )
}
