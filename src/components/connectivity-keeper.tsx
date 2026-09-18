'use client'

import { useEffect, useState } from 'react'
import { CloudOff, RefreshCw } from 'lucide-react'

/**
 * ConnectivityKeeper — membuat aplikasi "selalu on":
 *
 * 1. AUTO-RETRY GET (idempotent): request GET yang gagal karena jaringan
 *    drop sesaat / cold start serverless / koneksi DB stale di-retry
 *    otomatis maks 2x dengan backoff. Tidak ada polling/timer → kuota
 *    Vercel & Supabase TIDAK terpakai tambahan.
 *
 * 2. RECONNECT OTOMATIS: saat kembali online (atau user buka lagi aplikasi
 *    setelah ditinggal) dan sebelumnya ada request yang gagal, halaman
 *    dimuat ulang OTOMATIS — user tidak perlu refresh manual. Reload hanya
 *    terjadi jika memang ada request yang gagal (hemat kuota) dan maksimal
 *    1x per menit.
 *
 * 3. BANNER OFFLINE: indikator jelas saat tidak ada internet, dengan info
 *    bahwa data yang pernah dibuka tetap tersedia (disajikan service worker
 *    dari cache). Tombol "Coba lagi" tersedia tapi tidak wajib.
 */

const AUTO_RELOAD_COOLDOWN_MS = 60_000

declare global {
  interface Window {
    __dsFetchPatched?: boolean
  }
}

export function ConnectivityKeeper() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    setOffline(!navigator.onLine)

    let hadNetworkError = false
    let lastAutoReload = 0

    const markSuccess = () => {
      hadNetworkError = false
    }
    const markFailure = () => {
      hadNetworkError = true
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

        // Hanya request idempotent yang boleh di-retry (mutasi tidak —
        // mencegah data ganda saat jaringan tidak stabil)
        if (method !== 'GET' && method !== 'HEAD') {
          return originalFetch(input, init)
        }

        const MAX_RETRIES = 2
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            const res = await originalFetch(input, init)
            if (res.ok) {
              markSuccess()
              return res
            }
            const retriable =
              res.status === 500 ||
              res.status === 502 ||
              res.status === 503 ||
              res.status === 504
            if (!retriable || attempt === MAX_RETRIES) {
              if (retriable) markFailure()
              return res
            }
          } catch (error) {
            // Offline total: jangan buang waktu retry, fail fast.
            // Service worker akan menyajikan data cache bila tersedia.
            if (attempt === MAX_RETRIES || !navigator.onLine) {
              markFailure()
              throw error
            }
          }
          // Offline → jangan retry
          if (!navigator.onLine) {
            markFailure()
            return originalFetch(input, init)
          }
          await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)))
        }
        return originalFetch(input, init)
      }
    }

    // ---- 2) Reconnect otomatis tanpa reload manual ----
    const maybeAutoReload = () => {
      if (!hadNetworkError) return
      const now = Date.now()
      if (now - lastAutoReload < AUTO_RELOAD_COOLDOWN_MS) return
      lastAutoReload = now
      hadNetworkError = false
      window.location.reload()
    }

    const handleOnline = () => {
      setOffline(false)
      if (hadNetworkError) {
        // Kembali online setelah gagal → muat data terbaru otomatis
        setTimeout(maybeAutoReload, 500)
      }
    }
    const handleOffline = () => setOffline(true)
    const handleVisibility = () => {
      // User buka lagi aplikasi setelah ditinggal → pulihkan jika ada request gagal
      if (document.visibilityState === 'visible' && navigator.onLine) {
        maybeAutoReload()
      }
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  // ---- 3) Banner offline ----
  if (!offline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[9999] bg-amber-500 text-white shadow-md"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex max-w-3xl items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium">
        <CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">
          Anda sedang offline — data yang pernah dibuka tetap tersedia.
        </span>
        <button
          onClick={() => window.location.reload()}
          className="ml-1 flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 transition-colors hover:bg-white/30"
          aria-label="Muat ulang halaman"
        >
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          Coba lagi
        </button>
      </div>
    </div>
  )
}
