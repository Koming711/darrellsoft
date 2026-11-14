'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CalendarClock, CheckCheck, ChevronDown, Info, Trash2, UserPlus, Volume2, VolumeX } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { authFetch } from '@/lib/auth-fetch'
import { getAuthUser } from '@/lib/auth'
import { useLanguage } from '@/contexts/language-context'
import { startNavigation } from '@/components/navigation-progress'
import { playNotifSound, unlockAudioOnInteraction } from '@/lib/notif-sound'
import { subscribeRealtime, type RealtimeNotification } from '@/lib/realtime-client'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface Registration {
  id: string
  nama: string
  email: string
  nomorHP: string
  username: string | null
  role: string
  createdAt: string
}

interface DbNotification {
  id: string
  title: string
  body: string
  type: string // registration | subscription | payment | system | info
  link: string
  isRead: boolean
  readAt: string | null
  createdAt: string
}

interface NotifResponse {
  count: number
  newCount: number
  registrations: Registration[]
}

interface ListResponse {
  notifications: DbNotification[]
  unreadCount: number
  hasMore: boolean
  total: number
}

type Category = 'all' | 'registration' | 'subscription' | 'system'

const STORAGE_KEY = 'notif-reg-last-seen'
const COUNT_KEY = 'notif-last-known-count'
const MUTE_KEY = 'notif-sound-muted'
const POLL_INTERVAL = 20_000 // 20 seconds — faster detection for timely sound
const PAGE_SIZE = 15

function timeAgo(dateStr: string, lang: 'id' | 'en'): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diff / 60_000)
  const hr = Math.floor(min / 60)
  const day = Math.floor(hr / 24)

  if (min < 1) return lang === 'en' ? 'Just now' : 'Baru saja'
  if (min < 60) return `${min} ${lang === 'en' ? 'minutes ago' : 'menit lalu'}`
  if (hr < 24) return `${hr} ${lang === 'en' ? 'hours ago' : 'jam lalu'}`
  return `${day} ${lang === 'en' ? 'days ago' : 'hari lalu'}`
}

function formatDateTime(dateStr: string, lang: 'id' | 'en'): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString(lang === 'en' ? 'en-GB' : 'id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function categoryOf(type: string): Exclude<Category, 'all'> {
  if (type === 'registration') return 'registration'
  if (type === 'subscription') return 'subscription'
  return 'system'
}

interface NotificationBellProps {
  role?: string
  className?: string
}

/**
 * NotificationBell — PUSAT NOTIFIKASI (ikon lonceng di header):
 *
 * - PERMINTAAN OWNER: ikon ini HANYA untuk admin/superadmin/manager.
 *   Role pelanggan (user/demo) tidak merender ikon ini — mereka cukup SATU
 *   ikon notifikasi (CustomerNotificationBell) supaya header tidak dobel.
 * - Badge merah = pendaftaran baru belum dilihat (admin) + notifikasi DB
 *   belum dibaca.
 * - Daftar notifikasi DB dengan kategori: Semua / Pendaftaran Akun /
 *   Masa Berlangganan / Informasi Sistem; tanggal & waktu.
 * - PERMINTAAN OWNER: daftar HANYA menampilkan notifikasi belum dibaca —
 *   begitu dibaca (diklik / Tandai Semua Dibaca) notif hilang otomatis
 *   dari daftar; data tetap tersimpan di DB (tidak dihapus permanen).
 * - Admin/superadmin tetap melihat daftar pendaftaran akun (CalonPembeli
 *   status "baru") di bagian atas — read state via localStorage timestamp.
 * - Popup & suara realtime ditangani NotificationPopupHost (tidak dobel di sini).
 */
export function NotificationBell({ role, className }: NotificationBellProps) {
  const router = useRouter()
  const { t, language } = useLanguage()
  const [data, setData] = useState<NotifResponse | null>(null)
  const [list, setList] = useState<ListResponse | null>(null)
  const [listPage, setListPage] = useState(1)
  const [category, setCategory] = useState<Category>('all')
  const [open, setOpen] = useState(false)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [lastSeen, setLastSeen] = useState<string | null | undefined>(undefined) // undefined = not loaded yet
  const [muted, setMuted] = useState<boolean | undefined>(undefined) // undefined = not loaded
  const prevCountRef = useRef<number | null>(null) // baseline count for sound detection

  const isAdmin = role === 'admin' || role === 'superadmin'
  const isAdminChecked = !!role
  // PERMINTAAN OWNER: role pelanggan (user/demo) tidak menampilkan Pusat
  // Notifikasi — cukup satu ikon (CustomerNotificationBell). Admin/superadmin/
  // manager tetap melihat ikon ini.
  const isCustomerRole = role === 'user' || role === 'demo'
  const showBell = isAdminChecked && !isCustomerRole

  // Load lastSeen + muted + baseline count from localStorage (client-only)
  useEffect(() => {
    if (!showBell) return
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      setLastSeen(isAdmin ? stored : null)
      const mutedStored = localStorage.getItem(MUTE_KEY) === '1'
      setMuted(mutedStored)
      const countStored = localStorage.getItem(COUNT_KEY)
      prevCountRef.current = isAdmin && countStored !== null ? parseInt(countStored, 10) : null
    } catch {
      setLastSeen(null)
      setMuted(false)
    }
    // Unlock audio on first user interaction (browser autoplay policy)
    unlockAudioOnInteraction()
  }, [isAdmin, showBell])

  const fetchData = useCallback(async () => {
    if (!isAdmin || lastSeen === undefined || muted === undefined) return
    try {
      const res = await authFetch(`/api/notifications/registrations${lastSeen ? `?since=${encodeURIComponent(lastSeen)}` : ''}`)
      if (!res.ok) return
      const json: NotifResponse = await res.json()
      setData(json)

      const prev = prevCountRef.current
      if (prev !== null && json.count > prev && !muted) {
        playNotifSound('registration')
      }
      if (prev === null || json.count !== prev) {
        prevCountRef.current = json.count
        try {
          localStorage.setItem(COUNT_KEY, String(json.count))
        } catch {
          // ignore
        }
      }
    } catch {
      // silent fail
    }
  }, [isAdmin, lastSeen, muted])

  const fetchList = useCallback(async (page: number, append: boolean) => {
    try {
      // ?unread=1 — PERMINTAAN OWNER: pusat notifikasi hanya menampilkan yang BELUM dibaca;
      // begitu notif dibaca (klik / tandai semua), notif itu hilang otomatis dari daftar.
      const res = await authFetch(`/api/notifications?page=${page}&take=${PAGE_SIZE}&unread=1`)
      if (!res.ok) return
      const json: ListResponse = await res.json()
      setList((prev) =>
        append && prev
          ? {
              notifications: [...prev.notifications, ...json.notifications],
              unreadCount: json.unreadCount,
              hasMore: json.hasMore,
              total: json.total,
            }
          : json
      )
    } catch {
      // silent fail
    }
  }, [])

  // Initial fetch + polling — only after lastSeen is loaded.
  // Re-fetches immediately whenever lastSeen changes (e.g. after marking as read).
  useEffect(() => {
    if (!showBell || lastSeen === undefined) return
    fetchData()
    fetchList(1, false)
    setListPage(1)
    const timer = setInterval(fetchData, POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [showBell, lastSeen, fetchData, fetchList])

  // REALTIME — socket.io push (mini-services/notif-service).
  // Popup in-app + suara ditangani NotificationPopupHost; di sini cukup
  // muat ulang badge & daftar agar angka selalu segar.
  useEffect(() => {
    if (!showBell || lastSeen === undefined || muted === undefined) return
    const user = getAuthUser()
    const unsubscribe = subscribeRealtime(
      () => {
        fetchData()
        fetchList(1, false)
        setListPage(1)
      },
      { userId: user?.id || '', role: role || user?.role || '' },
    )
    return unsubscribe
  }, [showBell, lastSeen, muted, role, fetchData, fetchList])

  // Mark all as read when popover CLOSES — registration items yang sudah
  // dilihat hilang dari daftar pada poll berikutnya (behavior existing).
  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next && isAdmin) {
      const now = new Date().toISOString()
      try {
        localStorage.setItem(STORAGE_KEY, now)
        setLastSeen(now)
      } catch {
        // ignore
      }
    }
    if (next) {
      // Segarkan riwayat setiap kali dibuka
      fetchList(1, false)
      setListPage(1)
    }
  }

  const handleItemClick = (reg: Registration) => {
    setOpen(false)
    startNavigation()
    window.dispatchEvent(new CustomEvent('navigation-start'))
    router.push('/administrasi/pengguna')
    void reg
  }

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    try {
      localStorage.setItem(MUTE_KEY, next ? '1' : '0')
      window.dispatchEvent(new CustomEvent('ds-notif-settings-changed'))
    } catch {
      // ignore
    }
    if (!next) {
      playNotifSound('info')
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await authFetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true }),
      })
      // PERMINTAAN OWNER: semua dibaca = semua HILANG dari daftar (bukan cuma berubah abu-abu)
      setList((prev) =>
        prev
          ? { notifications: [], unreadCount: 0, hasMore: false, total: 0 }
          : prev
      )
    } catch {
      // silent
    }
  }

  // HAPUS SEMUA — PERMINTAAN OWNER: hapus PERMANEN seluruh isi pusat notifikasi
  // (semua notifikasi DB dalam scope user) langsung dari database.
  const handleDeleteAll = async () => {
    try {
      const res = await authFetch('/api/notifications?all=1', { method: 'DELETE' })
      if (res.ok) {
        // Kosongkan seluruh daftar + badge — notif DB sudah dihapus permanen di server
        setList({ notifications: [], unreadCount: 0, hasMore: false, total: 0 })
        // Sembunyikan juga daftar pendaftaran akun (admin), seperti saat popover ditutup
        const now = new Date().toISOString()
        try {
          localStorage.setItem(STORAGE_KEY, now)
        } catch {
          // ignore
        }
        setLastSeen(now)
        toast.success(t('notif_delete_all_success'))
      } else {
        toast.error(language === 'en' ? 'Failed to delete notifications' : 'Gagal menghapus notifikasi')
      }
    } catch {
      toast.error(language === 'en' ? 'Failed to delete notifications' : 'Gagal menghapus notifikasi')
    }
  }

  const handleNotifClick = async (n: DbNotification) => {
    if (!n.isRead) {
      // Optimistis: HAPUS dari daftar lalu tandai dibaca di server (fire & forget) —
      // notif yang dibaca hilang otomatis dari pusat notifikasi (permintaan owner).
      setList((prev) =>
        prev
          ? {
              ...prev,
              unreadCount: Math.max(0, prev.unreadCount - 1),
              notifications: prev.notifications.filter((x) => x.id !== n.id),
            }
          : prev
      )
      authFetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: n.id }),
      }).catch(() => {})
    }
    setOpen(false)
    if (n.link) {
      startNavigation()
      window.dispatchEvent(new CustomEvent('navigation-start'))
      router.push(n.link)
    }
  }

  const handleLoadMore = () => {
    const next = listPage + 1
    setListPage(next)
    fetchList(next, true)
  }

  const filteredNotifs = useMemo(() => {
    const items = list?.notifications ?? []
    if (category === 'all') return items
    return items.filter((n) => categoryOf(n.type) === category)
  }, [list, category])

  // Don't render: until role is known, or for customer roles (user/demo) —
  // pelanggan hanya memakai CustomerNotificationBell (1 ikon, permintaan owner).
  if (!showBell) return null

  const newCount = data?.newCount ?? 0
  const registrations = data?.registrations ?? []
  const visibleRegistrations = lastSeen
    ? registrations.filter(
        (r) => new Date(r.createdAt).getTime() > new Date(lastSeen).getTime()
      )
    : registrations

  const unreadDb = list?.unreadCount ?? 0
  const badgeCount = (isAdmin ? newCount : 0) + unreadDb

  const categories: { key: Category; label: string }[] = [
    { key: 'all', label: language === 'en' ? 'All' : 'Semua' },
    { key: 'registration', label: language === 'en' ? 'Registrations' : 'Pendaftaran' },
    { key: 'subscription', label: language === 'en' ? 'Subscription' : 'Langganan' },
    { key: 'system', label: language === 'en' ? 'System' : 'Sistem' },
  ]

  const showRegistrations = isAdmin && (category === 'all' || category === 'registration')

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('notif_center_title')}
          className={cn(
            'relative inline-flex items-center justify-center rounded-lg transition-colors',
            'h-8 w-8 hover:bg-black/5 dark:hover:bg-white/10',
            className
          )}
          style={{ color: 'var(--app-banner-text)' }}
        >
          <Bell className="w-[18px] h-[18px]" />
          {badgeCount > 0 && !open && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-background">
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-88 p-0 max-h-[520px] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {t('notif_center_title')}
          </h3>
          <div className="flex items-center gap-2">
            {badgeCount > 0 && (
              <span className="text-[11px] font-medium text-red-500">
                {badgeCount} {language === 'en' ? 'unread' : 'belum dibaca'}
              </span>
            )}
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? t('notif_sound_on') : t('notif_sound_off')}
              title={muted ? t('notif_sound_on') : t('notif_sound_off')}
              className="inline-flex items-center justify-center rounded-md h-6 w-6 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Kategori */}
        <div className="flex items-center gap-1 border-b border-slate-100 dark:border-zinc-800 px-2 py-1.5 overflow-x-auto hide-scrollbar">
          {categories.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              className={cn(
                'whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                category === c.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-zinc-800'
              )}
            >
              {c.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setConfirmDeleteAll(true)}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              {t('notif_delete_all')}
            </button>
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
            >
              <CheckCheck className="h-3 w-3" />
              {t('notif_mark_all_read')}
            </button>
          </div>
        </div>

        {/* Daftar */}
        <div className="flex-1 overflow-y-auto">
          {/* Pendaftaran akun (admin) — behavior existing dipertahankan */}
          {showRegistrations && visibleRegistrations.length > 0 && (
            <div>
              <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {t('notif_cat_registration')}
              </p>
              <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
                {visibleRegistrations.map((reg) => (
                  <li key={reg.id}>
                    <button
                      type="button"
                      onClick={() => handleItemClick(reg)}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-colors flex items-start gap-3"
                    >
                      <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0 text-xs font-bold uppercase">
                        {(reg.nama || '?').charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                          {reg.nama}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {reg.email}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {t('notif_new_registration')} · {timeAgo(reg.createdAt, language)}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Notifikasi DB — semua role */}
          {filteredNotifs.length === 0 && !(showRegistrations && visibleRegistrations.length > 0) ? (
            <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
              {t('notif_no_new')}
            </div>
          ) : (
            filteredNotifs.length > 0 && (
              <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
                {filteredNotifs.map((n) => {
                  const cat = categoryOf(n.type)
                  const CatIcon =
                    cat === 'registration' ? UserPlus : cat === 'subscription' ? CalendarClock : Info
                  const catLabel =
                    cat === 'registration'
                      ? t('notif_cat_registration')
                      : cat === 'subscription'
                        ? t('notif_cat_subscription')
                        : t('notif_cat_system')
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => handleNotifClick(n)}
                        className={cn(
                          'w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-colors flex items-start gap-3',
                          !n.isRead && 'bg-primary/[0.04] dark:bg-primary/[0.06]'
                        )}
                      >
                        <div
                          className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                            cat === 'registration' &&
                              'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400',
                            cat === 'subscription' &&
                              'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400',
                            cat === 'system' &&
                              'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-slate-400'
                          )}
                        >
                          <CatIcon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p
                              className={cn(
                                'text-sm truncate',
                                n.isRead
                                  ? 'font-normal text-slate-700 dark:text-slate-300'
                                  : 'font-semibold text-slate-900 dark:text-slate-100'
                              )}
                            >
                              {n.title}
                            </p>
                            {!n.isRead && (
                              <span
                                className="h-2 w-2 rounded-full bg-red-500 flex-shrink-0"
                                aria-label={language === 'en' ? 'Unread' : 'Belum dibaca'}
                              />
                            )}
                          </div>
                          {n.body && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 whitespace-pre-line">
                              {n.body}
                            </p>
                          )}
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {catLabel} · {formatDateTime(n.createdAt, language)}
                          </p>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )
          )}

          {/* Pagination */}
          {list?.hasMore && (
            <button
              type="button"
              onClick={handleLoadMore}
              className="w-full flex items-center justify-center gap-1 py-2.5 text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              {t('notif_load_more')}
            </button>
          )}
        </div>

        {/* Konfirmasi Hapus Semua — di dalam PopoverContent agar popover tidak tertutup saat dialog muncul */}
        <AlertDialog open={confirmDeleteAll} onOpenChange={setConfirmDeleteAll}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('notif_delete_all_confirm_title')}</AlertDialogTitle>
              <AlertDialogDescription>{t('notif_delete_all_confirm_desc')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('batal')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteAll}
                className="bg-red-500 text-white hover:bg-red-600 focus-visible:ring-red-500 dark:bg-red-500 dark:text-white dark:hover:bg-red-600"
              >
                {t('notif_delete_all')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PopoverContent>
    </Popover>
  )
}
