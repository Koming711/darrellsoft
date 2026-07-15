'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { authFetch } from '@/lib/auth-fetch'
import { useLanguage } from '@/contexts/language-context'
import { startNavigation } from '@/components/navigation-progress'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'

interface Registration {
  id: string
  nama: string
  email: string
  nomorHP: string
  username: string | null
  role: string
  createdAt: string
}

interface NotifResponse {
  count: number
  newCount: number
  registrations: Registration[]
}

const STORAGE_KEY = 'notif-reg-last-seen'
const POLL_INTERVAL = 60_000 // 60 seconds

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

interface NotificationBellProps {
  role?: string
  className?: string
}

/**
 * NotificationBell — shows a bell icon with a red badge counting new account
 * registrations (CalonPembeli with status="baru") that the admin hasn't seen yet.
 *
 * - Visible ONLY for admin & superadmin roles.
 * - "Read" state is tracked via localStorage timestamp (last time the popover was opened).
 * - Polls the API every 60s for fresh data.
 * - Clicking a registration item navigates to /administrasi/pengguna.
 */
export function NotificationBell({ role, className }: NotificationBellProps) {
  const router = useRouter()
  const { t, language } = useLanguage()
  const [data, setData] = useState<NotifResponse | null>(null)
  const [open, setOpen] = useState(false)
  const [lastSeen, setLastSeen] = useState<string | null | undefined>(undefined) // undefined = not loaded yet

  // Only render for admin / superadmin
  const isAdmin = role === 'admin' || role === 'superadmin'
  const isAdminChecked = !!role

  // Load lastSeen from localStorage (client-only)
  useEffect(() => {
    if (!isAdmin) return
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      setLastSeen(stored)
    } catch {
      setLastSeen(null)
    }
  }, [isAdmin])

  const fetchData = useCallback(async () => {
    if (!isAdmin || lastSeen === undefined) return
    try {
      const res = await authFetch(`/api/notifications/registrations${lastSeen ? `?since=${encodeURIComponent(lastSeen)}` : ''}`)
      if (!res.ok) return
      const json: NotifResponse = await res.json()
      setData(json)
    } catch {
      // silent fail
    }
  }, [isAdmin, lastSeen])

  // Initial fetch + polling — only after lastSeen is loaded.
  // Re-fetches immediately whenever lastSeen changes (e.g. after marking as read).
  useEffect(() => {
    if (!isAdmin || lastSeen === undefined) return
    fetchData()
    const timer = setInterval(fetchData, POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [isAdmin, lastSeen, fetchData])

  // Mark all as read when popover opens
  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      const now = new Date().toISOString()
      try {
        localStorage.setItem(STORAGE_KEY, now)
        setLastSeen(now)
      } catch {
        // ignore
      }
    }
  }

  const handleItemClick = (reg: Registration) => {
    setOpen(false)
    startNavigation()
    window.dispatchEvent(new CustomEvent('navigation-start'))
    router.push('/administrasi/pengguna')
    // Suppress unused var lint
    void reg
  }

  const handleViewAll = () => {
    setOpen(false)
    startNavigation()
    window.dispatchEvent(new CustomEvent('navigation-start'))
    router.push('/administrasi/pengguna')
  }

  // Don't render until role is checked (avoid flash) and not admin
  if (!isAdminChecked || !isAdmin) return null

  const newCount = data?.newCount ?? 0
  const registrations = data?.registrations ?? []

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('notif_registrations')}
          className={cn(
            'relative inline-flex items-center justify-center rounded-lg transition-colors',
            'h-8 w-8 hover:bg-black/5 dark:hover:bg-white/10',
            className
          )}
          style={{ color: 'var(--app-banner-text)' }}
        >
          <Bell className="w-[18px] h-[18px]" />
          {newCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-background">
              {newCount > 99 ? '99+' : newCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-0 max-h-[420px] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {t('notif_registrations')}
          </h3>
          {newCount > 0 && (
            <span className="text-[11px] font-medium text-red-500">
              {newCount} {language === 'en' ? 'new' : 'baru'}
            </span>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto hide-scrollbar">
          {registrations.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
              {t('notif_no_new')}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
              {registrations.map((reg) => (
                <li key={reg.id}>
                  <button
                    type="button"
                    onClick={() => handleItemClick(reg)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-colors flex items-start gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0 text-xs font-bold uppercase">
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
          )}
        </div>

        {/* Footer */}
        {registrations.length > 0 && (
          <div className="border-t border-slate-100 dark:border-zinc-800 p-2">
            <button
              type="button"
              onClick={handleViewAll}
              className="w-full text-center text-xs font-medium text-primary hover:underline py-1.5"
            >
              {t('notif_view_all')}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
