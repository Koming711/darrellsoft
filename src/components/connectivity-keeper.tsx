'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { CloudOff, RefreshCw, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/language-context'
import type { DataEntity } from '@/lib/data-sync'
import { getQueueCount, isQueueableWrite, onQueueChange, queueAndSynthesize, replayQueue } from '@/lib/offline-queue'

/**
 * ConnectivityKeeper — membuat aplikasi "selalu on" & selalu up-to-date:
 *
 * 1. AUTO-RETRY GET (idempotent): request GET yang gagal karena jaringan
 *    drop sesaat / cold start serverless / koneksi DB stale di-retry
 *    otomatis maks 2x dengan backoff.
 *
 * 2. OFFLINE WRITE QUEUE: request tulis saat offline disimpan ke antrian
 *    (lihat lib/offline-queue.ts via authFetch). Komponen ini menjalankan
 *    sinkronisasi otomatis: saat kembali online, saat aplikasi dibuka lagi,
 *    berkala, dan saat Background Sync dibangunkan SW — TANPA reload.
 *
 * 3. REFRESH DATA TANPA RELOAD: begitu koneksi kembali (dan setelah antrian
 *    berhasil direplay), event 'data-change' di-dispatch supaya halaman yang
 *    terbuka mengambil data terbaru dari server. Tidak ada window.reload().
 *
 * 4. BANNER STATUS: indikator offline / sinkronisasi berjalan.
 */

declare global {
  interface Window {
    __dsFetchPatched?: boolean
  }
}

// Entity yang di-refresh saat koneksi kembali (agar halaman terbuka selalu update)
const REFRESH_ON_RECONNECT: DataEntity[] = [
  'customers',
  'items',
  'papers',
  'printing-costs',
  'finishings',
  'invoice',
  'settings',
  'riwayat-cetakan',
  'riwayat-potong-kertas',
  'biaya',
  'surat-jalan',
]

export function ConnectivityKeeper() {
  const [offline, setOffline] = useState(false)
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [showSyncDone, setShowSyncDone] = useState(false)
  const { t } = useLanguage()
  const pendingRef = useRef(0)
  const hadNetworkErrorRef = useRef(false)

  const runSync = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    setSyncing(true)
    try {
      const r = await replayQueue()
      pendingRef.current = r.remaining
      setPending(r.remaining)
      if (r.synced > 0) {
        toast.success(t('sync_done_toast'))
        setShowSyncDone(true)
        setTimeout(() => setShowSyncDone(false), 2500)
      }
    } finally {
      setSyncing(false)
    }
  }, [t])

  useEffect(() => {
    setOffline(!navigator.onLine)

    // Antrian awal + ikuti perubahan antrian dari mana pun
    getQueueCount().then(n => {
      pendingRef.current = n
      setPending(n)
      if (n > 0 && navigator.onLine) {
        // Ada sisa antrian saat aplikasi dibuka → sinkronkan setelah siap
        setTimeout(() => runSync(), 3000)
      }
    })
    const unsubQueue = onQueueChange(n => {
      pendingRef.current = n
      setPending(n)
    })

    // Toast saat ada perubahan disimpan offline
    const handleQueued = () => {
      toast(t('offline_saved_toast'), { duration: 5000 })
    }
    window.addEventListener('offline-queued', handleQueued)

    // Pesan dari service worker (Background Sync) → jalankan sinkron
    let swHandler: ((e: MessageEvent) => void) | null = null
    if ('serviceWorker' in navigator) {
      swHandler = (e: MessageEvent) => {
        if (e.data?.type === 'OFFLINE_SYNC') runSync()
      }
      navigator.serviceWorker.addEventListener('message', swHandler)
    }

    // ---- 1) Patch window.fetch sekali: auto-retry GET/HEAD ----
    if (!window.__dsFetchPatched) {
      window.__dsFetchPatched = true
      const originalFetch = window.fetch.bind(window)

      window.fetch = async (
        input: RequestInfo | URL,
        init?: RequestInit
      ): Promise<Response> => {
        const method = String(
          init?.method ?? (input instanceof Request ? input.method : 'GET')
        ).toUpperCase()

        // ---- TULISAN (POST/PUT/PATCH/DELETE): antrian offline ----
        // Menangkap fetch mentah dari komponen/wrapper apa pun (apiFetch,
        // fetcher, dsb). authFetch sudah mengantri sebelum sampai sini —
        // tidak ada duplikasi (patch mengembalikan Response, bukan throw).
        if (method !== 'GET' && method !== 'HEAD') {
          if (input instanceof Request) return originalFetch(input, init)
          const urlStr = input instanceof URL ? input.href : input
          const body = init?.body ?? null
          let hdrs: Record<string, string> = {}
          const h = init?.headers
          if (h instanceof Headers) hdrs = Object.fromEntries(h.entries())
          else if (h && typeof h === 'object') hdrs = { ...(h as Record<string, string>) }

          if (isQueueableWrite(urlStr, method, body)) {
            if (!navigator.onLine) {
              return queueAndSynthesize(urlStr, method, hdrs, body)
            }
            try {
              return await originalFetch(input, init)
            } catch {
              // Jaringan gagal saat mengirim tulisan → antrikan
              return queueAndSynthesize(urlStr, method, hdrs, body)
            }
          }
          return originalFetch(input, init)
        }

        // ---- GET/HEAD: auto-retry ----
        const MAX_RETRIES = 2
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            const res = await originalFetch(input, init)
            if (res.ok) {
              hadNetworkErrorRef.current = false
              return res
            }
            const retriable =
              res.status === 500 ||
              res.status === 502 ||
              res.status === 503 ||
              res.status === 504
            if (!retriable || attempt === MAX_RETRIES) {
              if (retriable) hadNetworkErrorRef.current = true
              return res
            }
          } catch (error) {
            // Offline total: jangan buang waktu retry, fail fast.
            // Service worker akan menyajikan data cache bila tersedia.
            if (attempt === MAX_RETRIES || !navigator.onLine) {
              hadNetworkErrorRef.current = true
              throw error
            }
          }
          // Offline → jangan retry
          if (!navigator.onLine) {
            hadNetworkErrorRef.current = true
            return originalFetch(input, init)
          }
          await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)))
        }
        return originalFetch(input, init)
      }
    }

    // ---- 2) Reconnect: sinkron antrian + refresh data TANPA reload ----
    const refreshVisibleData = () => {
      REFRESH_ON_RECONNECT.forEach(entity => {
        try {
          window.dispatchEvent(new CustomEvent('data-change', { detail: { entity, source: 'reconnect' } }))
        } catch {}
      })
    }

    const handleOnline = () => {
      setOffline(false)
      // Beri jaringan waktu stabil lalu: 1) kirim antrian offline,
      // 2) refresh data halaman yang terbuka (network-first SW).
      setTimeout(() => {
        runSync()
        refreshVisibleData()
      }, 1200)
    }
    const handleOffline = () => setOffline(true)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        if (pendingRef.current > 0) runSync()
        else if (hadNetworkErrorRef.current) {
          hadNetworkErrorRef.current = false
          refreshVisibleData()
        }
      }
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', handleVisibility)

    // ---- 3) Interval cadangan: tiap 60 dtk kalau ada antrian tertunda ----
    const interval = setInterval(() => {
      if (navigator.onLine && pendingRef.current > 0) runSync()
    }, 60_000)

    return () => {
      window.removeEventListener('offline-queued', handleQueued)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibility)
      if (swHandler && 'serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', swHandler)
      }
      clearInterval(interval)
      unsubQueue()
    }
  }, [runSync, t])

  // ---- 4) Banner status ----
  if (offline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed inset-x-0 top-0 z-[9999] bg-amber-500 text-white shadow-md"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium">
          <CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            {t('offline_banner')}
            {pending > 0 ? ` · ${pending} ${t('offline_pending')}` : ''}
          </span>
          {pending > 0 && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-2 py-0.5" aria-hidden="true">
              <RefreshCw className="h-3 w-3" />
              {t('sync_running')}
            </span>
          )}
        </div>
      </div>
    )
  }

  if (pending > 0 || syncing) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed inset-x-0 top-0 z-[9999] bg-emerald-600 text-white shadow-md"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium">
          <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
          <span className="min-w-0 truncate">
            {t('sync_running')}
            {pending > 0 ? ` (${pending})` : ''}
          </span>
        </div>
      </div>
    )
  }

  if (showSyncDone) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed inset-x-0 top-0 z-[9999] bg-emerald-600 text-white shadow-md"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">{t('sync_done_toast')}</span>
        </div>
      </div>
    )
  }

  return null
}
