'use client'

/**
 * Pengaturan → Notifikasi — /administrasi/pengaturan/notifikasi
 *
 * Pengaturan notifikasi per perangkat (semua role login):
 * - Popup notifikasi in-app (aktif/nonaktif) — disimpan localStorage per perangkat
 * - Suara notifikasi (aktif/nonaktif) + tombol tes suara (pendaftaran & langganan)
 * - Push notification (izin perangkat + subscribe/unsubscribe) + tombol tes notifikasi
 * - Status izin notifikasi perangkat (granted / denied / default / unsupported)
 * - Daftar perangkat terhubung: status aktif, jenis perangkat, terakhir dipakai,
 *   aktif/nonaktifkan & hapus.
 *
 * Hak akses:
 * - Admin & Super Admin: menerima notifikasi pendaftaran akun (popup/push).
 * - Owner & anggota grup: menerima pengingat langganan grupnya.
 * - Preferensi di halaman ini hanya berlaku untuk perangkat ini.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Bell,
  BellOff,
  CalendarClock,
  Check,
  Monitor,
  Smartphone,
  Tablet,
  Trash2,
  Volume2,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { authFetch } from '@/lib/auth-fetch'
import { useLanguage } from '@/contexts/language-context'
import { playNotifSound, type NotifSoundKind } from '@/lib/notif-sound'
import {
  currentPermission,
  isPushSubscribed,
  isPushSupported,
  requestNotificationPermission,
  subscribePush,
  unsubscribePush,
} from '@/lib/push-client'

const POPUP_OFF_KEY = 'notif-popup-off'
const SOUND_MUTE_KEY = 'notif-sound-muted'

interface DeviceRow {
  id: string
  deviceType: string
  userAgent: string
  isActive: boolean
  lastUsedAt: string | null
  createdAt: string
  endpointMasked: string
}

function deviceIcon(t: string) {
  if (t === 'android') return Smartphone
  if (t === 'ios') return Tablet
  return Monitor
}

function deviceLabel(t: string, lang: 'id' | 'en'): string {
  const map: Record<string, { id: string; en: string }> = {
    android: { id: 'Android / Chrome HP', en: 'Android / Chrome mobile' },
    ios: { id: 'iPhone / iPad (PWA)', en: 'iPhone / iPad (PWA)' },
    desktop: { id: 'Desktop / Laptop', en: 'Desktop / Laptop' },
    browser: { id: 'Browser', en: 'Browser' },
  }
  return (map[t] ? map[t][lang] : t) || t
}

export default function PengaturanNotifikasiPage() {
  const { t, language } = useLanguage()
  const [popupOn, setPopupOn] = useState(true)
  const [soundOn, setSoundOn] = useState(true)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [subscribed, setSubscribed] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [loadingDevices, setLoadingDevices] = useState(true)

  const loadDevices = useCallback(async () => {
    setLoadingDevices(true)
    try {
      const res = await authFetch('/api/notifications/devices')
      const json = await res.json()
      setDevices(Array.isArray(json.devices) ? json.devices : [])
    } catch {
      setDevices([])
    } finally {
      setLoadingDevices(false)
    }
  }, [])

  useEffect(() => {
    try {
      setPopupOn(localStorage.getItem(POPUP_OFF_KEY) !== '1')
      setSoundOn(localStorage.getItem(SOUND_MUTE_KEY) !== '1')
    } catch {
      /* ignore */
    }
    setPermission(currentPermission())
    if (isPushSupported()) {
      isPushSubscribed().then(setSubscribed)
    }
    loadDevices()
    const onChange = () => {
      try {
        setPopupOn(localStorage.getItem(POPUP_OFF_KEY) !== '1')
        setSoundOn(localStorage.getItem(SOUND_MUTE_KEY) !== '1')
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('ds-notif-settings-changed', onChange)
    return () => window.removeEventListener('ds-notif-settings-changed', onChange)
  }, [loadDevices])

  const saveToggle = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value)
      window.dispatchEvent(new CustomEvent('ds-notif-settings-changed'))
    } catch {
      /* ignore */
    }
  }

  const handlePopupToggle = (on: boolean) => {
    setPopupOn(on)
    saveToggle(POPUP_OFF_KEY, on ? '0' : '1')
  }

  const handleSoundToggle = (on: boolean) => {
    setSoundOn(on)
    saveToggle(SOUND_MUTE_KEY, on ? '0' : '1')
    if (on) playNotifSound('info')
  }

  const handleTestSound = (kind: NotifSoundKind) => {
    if (!soundOn) {
      toast.info(
        language === 'en' ? 'Sound is off. Turn it on first.' : 'Suara sedang nonaktif. Aktifkan dulu.'
      )
      return
    }
    playNotifSound(kind)
  }

  const handleTestNotification = () => {
    if (!popupOn) {
      toast.info(
        language === 'en' ? 'Popup is off. Turn it on first.' : 'Popup sedang nonaktif. Aktifkan dulu.'
      )
      return
    }
    window.dispatchEvent(
      new CustomEvent('ds-notif-test-popup', {
        detail: {
          id: `test-${Date.now()}`,
          type: 'info',
          title: language === 'en' ? 'Test Notification' : 'Notifikasi Tes',
          body:
            language === 'en'
              ? 'This is what an in-app notification popup looks like.'
              : 'Beginilah tampilan popup notifikasi di dalam aplikasi.',
          link: '/administrasi/pengaturan/notifikasi',
          createdAt: new Date().toISOString(),
        },
      })
    )
  }

  const handleEnablePush = async () => {
    setPushBusy(true)
    try {
      const perm = await requestNotificationPermission()
      setPermission(perm)
      if (perm === 'granted') {
        const res = await subscribePush()
        if (res.ok) {
          setSubscribed(true)
          toast.success(
            language === 'en'
              ? 'Notifications enabled on this device.'
              : 'Notifikasi berhasil diaktifkan di perangkat ini.'
          )
        } else {
          toast.error(
            language === 'en' ? 'Failed to register push device.' : 'Gagal mendaftarkan perangkat push.'
          )
        }
      } else if (perm === 'denied') {
        toast.error(
          language === 'en'
            ? 'Blocked. Open the padlock icon in the address bar > Site settings > Notifications > Allow.'
            : 'Diblokir. Buka ikon gembok di address bar > Setelan situs > Notifikasi > Izinkan.',
          { duration: 10000 }
        )
      }
      loadDevices()
    } finally {
      setPushBusy(false)
    }
  }

  const handleDisablePush = async () => {
    setPushBusy(true)
    try {
      await unsubscribePush()
      setSubscribed(false)
      toast.success(
        language === 'en' ? 'Push disabled on this device.' : 'Push dinonaktifkan di perangkat ini.'
      )
      loadDevices()
    } finally {
      setPushBusy(false)
    }
  }

  const toggleDevice = async (d: DeviceRow) => {
    try {
      await authFetch('/api/notifications/devices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: d.id, isActive: !d.isActive }),
      })
      loadDevices()
    } catch {
      toast.error(language === 'en' ? 'Failed to update device.' : 'Gagal mengubah perangkat.')
    }
  }

  const removeDevice = async (d: DeviceRow) => {
    try {
      await authFetch(`/api/notifications/devices?id=${encodeURIComponent(d.id)}`, {
        method: 'DELETE',
      })
      toast.success(language === 'en' ? 'Device removed.' : 'Perangkat dihapus.')
      loadDevices()
    } catch {
      toast.error(language === 'en' ? 'Failed to delete device.' : 'Gagal menghapus perangkat.')
    }
  }

  const permissionLabel = () => {
    if (permission === 'unsupported')
      return language === 'en' ? 'Not supported by this browser' : 'Tidak didukung browser ini'
    if (permission === 'granted') return language === 'en' ? 'Allowed' : 'Diizinkan'
    if (permission === 'denied') return language === 'en' ? 'Blocked' : 'Diblokir'
    return language === 'en' ? 'Not asked yet' : 'Belum diminta'
  }

  const permBadge = () => {
    if (permission === 'granted')
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
    if (permission === 'denied') return 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
    return 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-slate-400'
  }

  return (
    <DashboardLayout title={t('settings_notif_title')} subtitle={t('settings_notif_subtitle')}>
      <div className="mx-auto max-w-3xl space-y-4">
        {/* Preferensi popup & suara */}
        <section className="rounded-xl border bg-card p-4 md:p-6">
          <h2 className="mb-1 text-sm font-semibold">{t('settings_notif_pref_title')}</h2>
          <p className="mb-4 text-xs text-muted-foreground">{t('settings_notif_pref_desc')}</p>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Bell className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                <div>
                  <p className="text-sm font-medium">{t('settings_notif_popup')}</p>
                  <p className="text-xs text-muted-foreground">{t('settings_notif_popup_desc')}</p>
                </div>
              </div>
              <Switch
                checked={popupOn}
                onCheckedChange={handlePopupToggle}
                aria-label={t('settings_notif_popup')}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Volume2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium">{t('settings_notif_sound')}</p>
                  <p className="text-xs text-muted-foreground">{t('settings_notif_sound_desc')}</p>
                </div>
              </div>
              <Switch
                checked={soundOn}
                onCheckedChange={handleSoundToggle}
                aria-label={t('settings_notif_sound')}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <span className="text-xs font-medium text-muted-foreground">
                {t('settings_notif_test_sound')}:
              </span>
              <Button variant="outline" size="sm" onClick={() => handleTestSound('registration')}>
                <Bell className="mr-1.5 h-3.5 w-3.5" />
                {t('settings_notif_test_reg')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleTestSound('subscription')}>
                <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                {t('settings_notif_test_sub')}
              </Button>
            </div>
          </div>
        </section>

        {/* Push notification */}
        <section className="rounded-xl border bg-card p-4 md:p-6">
          <h2 className="mb-1 text-sm font-semibold">{t('settings_notif_push_title')}</h2>
          <p className="mb-4 text-xs text-muted-foreground">{t('settings_notif_push_desc')}</p>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t('settings_notif_perm_status')}:
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${permBadge()}`}>
              {permissionLabel()}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                subscribed
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                  : 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-slate-400'
              }`}
            >
              {subscribed
                ? language === 'en'
                  ? 'Push active'
                  : 'Push aktif'
                : language === 'en'
                  ? 'Push inactive'
                  : 'Push nonaktif'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!subscribed ? (
              <Button
                onClick={handleEnablePush}
                disabled={pushBusy || !isPushSupported() || permission === 'denied'}
                size="sm"
              >
                {pushBusy ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Bell className="mr-1.5 h-3.5 w-3.5" />
                )}
                {t('settings_notif_enable_push')}
              </Button>
            ) : (
              <Button variant="outline" onClick={handleDisablePush} disabled={pushBusy} size="sm">
                {pushBusy ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <BellOff className="mr-1.5 h-3.5 w-3.5" />
                )}
                {t('settings_notif_disable_push')}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleTestNotification}>
              <Bell className="mr-1.5 h-3.5 w-3.5" />
              {t('settings_notif_test_popup')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadDevices}
              disabled={loadingDevices}
              aria-label={language === 'en' ? 'Refresh' : 'Muat ulang'}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingDevices ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {permission === 'denied' && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              {t('settings_notif_blocked_help')}
            </div>
          )}
          {!isPushSupported() && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-slate-400">
              {t('settings_notif_unsupported_help')}
            </div>
          )}
        </section>

        {/* Perangkat terhubung */}
        <section className="rounded-xl border bg-card p-4 md:p-6">
          <h2 className="mb-1 text-sm font-semibold">{t('settings_notif_devices_title')}</h2>
          <p className="mb-4 text-xs text-muted-foreground">{t('settings_notif_devices_desc')}</p>

          {loadingDevices ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {language === 'en' ? 'Loading…' : 'Memuat…'}
            </div>
          ) : devices.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('settings_notif_devices_empty')}
            </div>
          ) : (
            <ul className="divide-y">
              {devices.map((d) => {
                const Icon = deviceIcon(d.deviceType)
                return (
                  <li key={d.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-zinc-800">
                        <Icon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{deviceLabel(d.deviceType, language)}</p>
                          {d.isActive ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                              {language === 'en' ? 'Active' : 'Aktif'}
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-zinc-800 dark:text-slate-400">
                              {language === 'en' ? 'Inactive' : 'Nonaktif'}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {d.endpointMasked}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {d.lastUsedAt
                            ? `${language === 'en' ? 'Last used' : 'Terakhir dipakai'}: ${new Date(
                                d.lastUsedAt
                              ).toLocaleString(language === 'en' ? 'en-GB' : 'id-ID')}`
                            : `${language === 'en' ? 'Registered' : 'Terdaftar'}: ${new Date(
                                d.createdAt
                              ).toLocaleString(language === 'en' ? 'en-GB' : 'id-ID')}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleDevice(d)}
                        aria-label={
                          d.isActive ? t('settings_notif_deactivate') : t('settings_notif_activate')
                        }
                      >
                        {d.isActive ? (
                          <>
                            <BellOff className="mr-1 h-3 w-3" />
                            {t('settings_notif_deactivate')}
                          </>
                        ) : (
                          <>
                            <Check className="mr-1 h-3 w-3" />
                            {t('settings_notif_activate')}
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDevice(d)}
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                        aria-label={t('settings_notif_delete')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </DashboardLayout>
  )
}
