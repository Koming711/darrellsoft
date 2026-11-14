'use client'

// notification-popup-host — PUSAT POPUP NOTIFIKASI IN-APP (semua role).
//
// Sumber notifikasi (dedupe anti-ganda antar kanal & antar tab):
//   1. Realtime socket.io  (event 'notif:new' — saat app aktif)
//   2. Service Worker push (postMessage 'NOTIF_NEW' — app fokus; SW tidak
//      menampilkan notifikasi sistem saat app fokus → tidak dobel)
//   3. Polling ringan 60s  (GET /api/notifications?since= — fallback)
//
// Tampilan: kartu popup tidak menghalangi (kanan bawah desktop / bawah
// mobile) — judul, isi, tanggal & waktu, tombol Lihat Detail + Tutup.
// Suara berbeda per jenis (pendaftaran vs langganan) via notif-sound.
// Preferensi: popup (notif-popup-off) & suara (notif-sound-muted) di
// localStorage — diatur lewat Pengaturan → Notifikasi.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CalendarClock, UserPlus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAuthUser } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'
import { playNotifSound, unlockAudioOnInteraction, type NotifSoundKind } from '@/lib/notif-sound'
import { subscribeRealtime, type RealtimeNotification } from '@/lib/realtime-client'

interface PopupItem {
  id: string
  type: string
  title: string
  body: string
  link: string
  createdAt: string
}

const POPUP_OFF_KEY = 'notif-popup-off'
const SOUND_MUTE_KEY = 'notif-sound-muted'
const DEDUPE_WINDOW_MS = 90_000

function isPopupOff(): boolean {
  try {
    return localStorage.getItem(POPUP_OFF_KEY) === '1'
  } catch {
    return false
  }
}

export function isSoundMuted(): boolean {
  try {
    return localStorage.getItem(SOUND_MUTE_KEY) === '1'
  } catch {
    return false
  }
}

function soundKindFor(type: string): NotifSoundKind {
  if (type === 'registration') return 'registration'
  if (type === 'subscription') return 'subscription'
  return 'info'
}

function typeIconNode(type: string, className: string) {
  if (type === 'registration') return <UserPlus className={className} />
  if (type === 'subscription') return <CalendarClock className={className} />
  return <Bell className={className} />
}

export function NotificationPopupHost() {
  const router = useRouter()
  const [current, setCurrent] = useState<PopupItem | null>(null)
  const [queue, setQueue] = useState<PopupItem[]>([])

  const seenRef = useRef<Map<string, number>>(new Map())
  const bcRef = useRef<BroadcastChannel | null>(null)
  const lastPollRef = useRef<string>(new Date().toISOString())
  const popupOffRef = useRef<boolean>(false)
  const soundMutedRef = useRef<boolean>(false)
  const [popupOff, setPopupOff] = useState(false)

  const readPrefs = useCallback(() => {
    popupOffRef.current = isPopupOff()
    soundMutedRef.current = isSoundMuted()
    setPopupOff(popupOffRef.current)
  }, [])

  // Sinkronkan preferensi antar komponen/tab (Pengaturan mengubah → host ikut)
  useEffect(() => {
    readPrefs()
    const handler = () => readPrefs()
    window.addEventListener('ds-notif-settings-changed', handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener('ds-notif-settings-changed', handler)
      window.removeEventListener('storage', handler)
    }
  }, [readPrefs])

  useEffect(() => {
    unlockAudioOnInteraction()
    try {
      bcRef.current = new BroadcastChannel('ds-notif-popup')
      bcRef.current.onmessage = (ev: MessageEvent) => {
        const key = ev?.data?.key
        if (key) seenRef.current.set(key, Date.now())
      }
    } catch {
      /* BroadcastChannel tak didukung — abaikan */
    }
    return () => {
      try {
        bcRef.current?.close()
      } catch {
        /* ignore */
      }
    }
  }, [])

  const markRead = useCallback((id: string) => {
    if (!id) return
    authFetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {})
  }, [])

  const showItem = useCallback((item: PopupItem) => {
    // Dedupe 1: signature (type|title|body) — kanal berbeda utk notif sama
    const sig = `${item.type}|${item.title}|${item.body}`
    const now = Date.now()
    const lastSig = seenRef.current.get(sig)
    if (lastSig && now - lastSig < DEDUPE_WINDOW_MS) return
    // Dedupe 2: id notifikasi DB (polling & SW push pakai id DB yang sama)
    if (item.id) {
      const lastId = seenRef.current.get(item.id)
      if (lastId && now - lastId < DEDUPE_WINDOW_MS) return
      seenRef.current.set(item.id, now)
    }
    seenRef.current.set(sig, now)

    // Beri tahu tab lain agar tidak menampilkan popup yang sama
    try {
      bcRef.current?.postMessage({ key: sig })
      if (item.id) bcRef.current?.postMessage({ key: item.id })
    } catch {
      /* ignore */
    }

    // Suara (kecuali dimatikan) — tidak berulang utk notifikasi yang sama
    // karena fungsi ini hanya dipanggil sekali per notifikasi (dedupe di atas)
    if (!soundMutedRef.current) playNotifSound(soundKindFor(item.type))

    // Popup (kecuali dimatikan)
    if (popupOffRef.current) return
    setCurrent((prev) => {
      if (prev) {
        setQueue((q) => [...q.slice(-4), item])
        return prev
      }
      return item
    })
  }, [])

  // 1) Realtime socket.io
  useEffect(() => {
    const user = getAuthUser()
    const unsubscribe = subscribeRealtime(
      (notif: RealtimeNotification) => {
        showItem({
          id: notif.id || '',
          type: notif.type || 'info',
          title: notif.title || '',
          body: notif.body || '',
          link: notif.link || '',
          createdAt: notif.createdAt || new Date().toISOString(),
        })
      },
      { userId: user?.id || '', role: user?.role || '' }
    )
    return unsubscribe
  }, [showItem])

  // 2) Service Worker push (saat app fokus) + navigasi dari notifikasi sistem
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event?.data
      if (!data || typeof data !== 'object') return
      if (data.type === 'NOTIF_NEW' && data.payload) {
        const p = data.payload
        showItem({
          id: String(p.id || ''),
          type: String(p.type || 'info'),
          title: String(p.title || ''),
          body: String(p.body || ''),
          link: String(p.link || ''),
          createdAt: new Date().toISOString(),
        })
      } else if (data.type === 'NOTIF_NAVIGATE' && data.payload?.link) {
        router.push(String(data.payload.link))
      }
    }
    navigator.serviceWorker?.addEventListener('message', handler)
    return () => navigator.serviceWorker?.removeEventListener('message', handler)
  }, [showItem, router])

  // 2b) Tes notifikasi dari Pengaturan → Notifikasi
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (!detail || typeof detail !== 'object') return
      showItem({
        id: String(detail.id || ''),
        type: String(detail.type || 'info'),
        title: String(detail.title || ''),
        body: String(detail.body || ''),
        link: String(detail.link || ''),
        createdAt: String(detail.createdAt || new Date().toISOString()),
      })
    }
    window.addEventListener('ds-notif-test-popup', handler)
    return () => window.removeEventListener('ds-notif-test-popup', handler)
  }, [showItem])

  // 3) Polling fallback ringan (60s) — hanya notifikasi BARU sejak poll terakhir
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await authFetch(
          `/api/notifications?since=${encodeURIComponent(lastPollRef.current)}&take=5`
        )
        lastPollRef.current = new Date().toISOString()
        if (!res.ok) return
        const json = await res.json()
        const items: PopupItem[] = Array.isArray(json.notifications) ? json.notifications : []
        // Tampilkan dari terlama → terbaru agar urutan wajar
        items
          .slice()
          .reverse()
          .forEach((n) =>
            showItem({
              id: n.id,
              type: n.type,
              title: n.title,
              body: n.body,
              link: n.link || '',
              createdAt: n.createdAt,
            })
          )
      } catch {
        /* silent */
      }
    }
    const timer = setInterval(poll, 60_000)
    return () => clearInterval(timer)
  }, [showItem])

  const closeCurrent = useCallback(() => {
    setCurrent(null)
    setQueue((q) => {
      const [next, ...rest] = q
      if (next) setCurrent(next)
      return rest
    })
  }, [])

  const openDetail = useCallback(
    (item: PopupItem) => {
      markRead(item.id)
      closeCurrent()
      if (item.link) {
        router.push(item.link)
      }
    },
    [markRead, closeCurrent, router]
  )

  // Jangan render apa pun bila popup dimatikan (suara tetap jalan di atas)
  if (popupOff) return null
  if (!current) return null

  const created = new Date(current.createdAt)
  const timeLabel = isNaN(created.getTime())
    ? ''
    : created.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] w-[calc(100vw-2rem)] max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300"
      role="alert"
      aria-live="polite"
    >
      <div className="rounded-xl border bg-background shadow-xl overflow-hidden">
        <div className="flex items-start gap-3 p-4 pb-2">
          <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
            {typeIconNode(current.type, 'h-4 w-4')}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-snug break-words">{current.title}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{timeLabel}</p>
          </div>
          <button
            type="button"
            onClick={closeCurrent}
            aria-label="Tutup notifikasi"
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {current.body && (
          <div className="px-4 pb-3">
            <p className="max-h-40 overflow-y-auto whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
              {current.body}
            </p>
          </div>
        )}
        <div className={cn('flex items-center gap-2 border-t bg-muted/40 px-4 py-2.5')}>
          {current.link && (
            <button
              type="button"
              onClick={() => openDetail(current)}
              className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Lihat Detail
            </button>
          )}
          <button
            type="button"
            onClick={closeCurrent}
            className="inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition-colors hover:bg-muted"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  )
}
