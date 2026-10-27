'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * useLiveData — data panel admin dimuat ulang OTOMATIS (realtime-style).
 *
 * Cara kerja:
 * - Menjalankan `load({ silent: true })` setiap `intervalMs` (default 10s)
 *   TANPA mengosongkan data lama (tanpa kedip skeleton).
 * - Hanya aktif saat tab terlihat (document.visibilityState === 'visible') —
 *   hemat kuota serverless & database; begitu tab kembali terlihat atau
 *   window mendapat fokus, data langsung dimuat ulang seketika.
 * - Ada pengaman `inFlight`: refresh berikutnya dilewati bila refresh
 *   sebelumnya masih berjalan (tidak menumpuk permintaan).
 * - Halaman tetap memanggil `load()` sendiri untuk muatan awal & refresh
 *   manual (non-silent → boleh menampilkan skeleton).
 *
 * Return:
 * - lastUpdated: waktu terakhir data berhasil disegarkan (untuk LiveIndicator)
 * - refreshNow : paksa segarkan sekarang (silent)
 */
export interface LiveDataLoadOptions {
  silent?: boolean
}

export function useLiveData({
  load,
  intervalMs = 10000,
  enabled = true,
}: {
  load: (opts?: LiveDataLoadOptions) => unknown
  intervalMs?: number
  enabled?: boolean
}): { lastUpdated: Date | null; refreshNow: () => void } {
  const loadRef = useRef(load)
  loadRef.current = load
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const inFlight = useRef(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const tick = useCallback(async () => {
    if (!enabledRef.current || inFlight.current) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    inFlight.current = true
    try {
      await loadRef.current({ silent: true })
      setLastUpdated(new Date())
    } catch {
      // biarkan halaman menangani error-nya sendiri
    } finally {
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    const id = setInterval(tick, intervalMs)

    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick()
    }
    const onFocus = () => tick()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
    }
  }, [enabled, intervalMs, tick])

  return { lastUpdated, refreshNow: tick }
}
