'use client'

// customer-notification-bell — Lonceng notifikasi untuk PELANGGAN (role user/demo).
// Realtime via socket.io (notif-service) + polling 30s sebagai fallback.
// Admin memakai notification-bell.tsx (daftar pendaftaran) — komponen ini
// menampilkan notifikasi pribadi pelanggan: status pembayaran, pengingat
// langganan 7/3 hari, langganan berakhir, dll. (dari tabel Notification).

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CreditCard, CalendarClock, Info, UserPlus, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { authFetch } from '@/lib/auth-fetch'
import { getAuthUser } from '@/lib/auth'
import { playNotifSound, unlockAudioOnInteraction } from '@/lib/notif-sound'
import { subscribeRealtime, type RealtimeNotification } from '@/lib/realtime-client'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'

// Event antar-instance (bell mobile & desktop dirender dua-duanya di header).
// Instance yang menandai sudah-dibaca memberi tahu instance lain agar badge ikut hilang.
const SYNC_READ_EVENT = 'ds-customer-notif-read'
const SYNC_REFRESH_EVENT = 'ds-customer-notif-refresh'

interface NotifItem {
  id: string
  title: string
  body: string
  type: string
  link: string
  isRead: boolean
  createdAt: string
}

const POLL_INTERVAL = 30_000

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diff / 60_000)
  const hr = Math.floor(min / 60)
  const day = Math.floor(hr / 24)

  if (min < 1) return 'Baru saja'
  if (min < 60) return `${min} menit lalu`
  if (hr < 24) return `${hr} jam lalu`
  return `${day} hari lalu`
}

function typeIcon(type: string) {
  switch (type) {
    case 'payment':
      return <CreditCard className="w-4 h-4" />
    case 'subscription':
      return <CalendarClock className="w-4 h-4" />
    case 'registration':
      return <UserPlus className="w-4 h-4" />
    case 'system':
      return <Settings className="w-4 h-4" />
    default:
      return <Info className="w-4 h-4" />
  }
}

function typeBadgeClass(type: string): string {
  switch (type) {
    case 'payment':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
    case 'subscription':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
    case 'system':
      return 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300'
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-slate-300'
  }
}

interface CustomerNotificationBellProps {
  role?: string
  className?: string
}

export function CustomerNotificationBell({ role, className }: CustomerNotificationBellProps) {
  const router = useRouter()
  const [items, setItems] = useState<NotifItem[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const readyRef = useRef(false) // hindari suara pada fetch baseline pertama

  const isAdmin = role === 'admin' || role === 'superadmin'

  const fetchData = useCallback(async () => {
    try {
      const res = await authFetch('/api/notifications')
      if (!res.ok) return
      const json = await res.json()
      const list: NotifItem[] = json.notifications ?? []
      setItems(list)
      setUnread(json.unreadCount ?? list.filter((n) => !n.isRead).length)
    } catch {
      // silent fail — polling berikutnya mencoba lagi
    }
  }, [])

  // Baseline pertama tanpa suara; poll berkala setelahnya
  useEffect(() => {
    if (!role || isAdmin) return
    unlockAudioOnInteraction()
    fetchData().then(() => {
      readyRef.current = true
    })
    const timer = setInterval(fetchData, POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [role, isAdmin, fetchData])

  // Sinkronisasi antar-instance: satu bell dibaca → instance lain refresh/bersih
  useEffect(() => {
    if (!role || isAdmin) return
    const onRead = () => {
      setUnread(0)
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })))
    }
    const onRefresh = () => {
      fetchData()
    }
    window.addEventListener(SYNC_READ_EVENT, onRead)
    window.addEventListener(SYNC_REFRESH_EVENT, onRefresh)
    return () => {
      window.removeEventListener(SYNC_READ_EVENT, onRead)
      window.removeEventListener(SYNC_REFRESH_EVENT, onRefresh)
    }
  }, [role, isAdmin, fetchData])

  // REALTIME — push socket (room user:<id>) + polling fallback
  useEffect(() => {
    if (!role || isAdmin) return
    const user = getAuthUser()
    const unsubscribe = subscribeRealtime(
      (notif: RealtimeNotification) => {
        // Hanya notifikasi milik pelanggan ini (broadcast admin tidak relevan)
        if (notif.userId && notif.userId !== user?.id) return
        fetchData()
        if (readyRef.current) {
          playNotifSound()
          toast(notif.title, {
            id: notif.id, // dedupe antar komponen/langganan
            description: notif.body || undefined,
            duration: 6000,
          })
        }
      },
      { userId: user?.id || '', role: role || user?.role || '' },
    )
    return unsubscribe
  }, [role, isAdmin, fetchData])

  // Tutup popover = tandai semua sudah dibaca (badge hilang)
  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next && unread > 0) {
      authFetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true }),
      })
        .then(() => {
          setUnread(0)
          setItems((prev) => prev.map((n) => ({ ...n, isRead: true })))
          window.dispatchEvent(new Event(SYNC_READ_EVENT))
        })
        .catch(() => {})
    }
  }

  const handleItemClick = async (n: NotifItem) => {
    if (!n.isRead) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)))
      setUnread((u) => Math.max(0, u - 1))
      authFetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: n.id }),
      }).catch(() => {})
    }
    setOpen(false)
    if (n.link) {
      router.push(n.link)
      window.dispatchEvent(new Event(SYNC_REFRESH_EVENT))
    }
  }

  // Admin memakai notification-bell.tsx; belum tahu role → jangan render (hindari flash)
  if (!role || isAdmin) return null

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Notifikasi"
          className={cn(
            'relative inline-flex items-center justify-center rounded-lg transition-colors',
            'h-8 w-8 hover:bg-black/5 dark:hover:bg-white/10',
            className
          )}
          style={{ color: 'var(--app-banner-text)' }}
        >
          <Bell className="w-[18px] h-[18px]" />
          {unread > 0 && !open && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-background">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 p-0 max-h-[420px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Notifikasi</h3>
          {unread > 0 && <span className="text-[11px] font-medium text-red-500">{unread} baru</span>}
        </div>

        {/* Daftar notifikasi */}
        <div className="flex-1 overflow-y-auto hide-scrollbar max-h-[340px]">
          {items.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
              Belum ada notifikasi
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleItemClick(n)}
                    className={cn(
                      'w-full text-left px-4 py-3 transition-colors flex items-start gap-3',
                      'hover:bg-slate-50 dark:hover:bg-zinc-800/60',
                      !n.isRead && 'bg-primary/5 dark:bg-primary/10'
                    )}
                  >
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                        typeBadgeClass(n.type)
                      )}
                    >
                      {typeIcon(n.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          'text-sm truncate',
                          n.isRead
                            ? 'font-normal text-slate-700 dark:text-slate-200'
                            : 'font-semibold text-slate-900 dark:text-white'
                        )}
                      >
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                          {n.body}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1">
                        {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />}
                        <p className="text-[10px] text-slate-400">{timeAgo(n.createdAt)}</p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
