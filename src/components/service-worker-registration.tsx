'use client'

import { useEffect } from 'react'
import { scheduleOfflineWarmup } from '@/lib/offline-warmup'

// App version - bump this when deploying new content to force users to get fresh version
const APP_VERSION = '2026-10-03-v81'
const IS_DEV = process.env.NODE_ENV !== 'production'

export function ServiceWorkerRegistration() {
  useEffect(() => {
    // DEV MODE: aggressively remove any service worker + caches so the dev preview
    // always serves fresh code (stale SW was causing "halaman balik ke versi lama")
    if (IS_DEV) {
      try {
        if ('caches' in window) {
          caches.keys().then(names => names.forEach(n => caches.delete(n)))
        }
      } catch (e) {}
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(regs => {
          regs.forEach(reg => reg.unregister())
        }).catch(() => {})
      }
      return
    }

    // Always clean up old install_prompt_dismissed flag (we now use sessionStorage)
    // Also clean up old darrellsoft_installed flag that was preventing install popup from showing
    try {
      localStorage.removeItem('install_prompt_dismissed')
      localStorage.removeItem('darrellsoft_installed')
    } catch (e) {}

    // Force clear old version: check app version in localStorage
    // Baca versi TERSIMPAN SEBELUM diupdate — dipakai trigger warm-up
    // (versi berubah = deploy baru = cache asset lama sudah dibuang SW,
    // warm-up harus langsung jalan untuk mengisi ulang semua asset).
    let versionChangedForWarmup = false
    try {
      const storedVersion = localStorage.getItem('app_version')
      if (storedVersion && storedVersion !== APP_VERSION) {
        versionChangedForWarmup = true
        // Versi berubah — bersihkan key form lama SAJA, TANPA reload.
        // Reload paksa inilah penyebab "buka aplikasi suka di refresh".
        // Kode baru otomatis aktif pada kunjungan berikutnya (SW update
        // berjalan di latar; GET data network-first jadi data tetap fresh).
        console.log('App version changed:', storedVersion, '→', APP_VERSION, '- cleanup tanpa reload')

        // Clear old localStorage keys related to old form versions
        const keysToRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && (
            key.includes('potong-kertas') ||
            key.includes('hitung-cetakan') ||
            key.includes('hitung-finishing') ||
            key.includes('hitung-ongkos') ||
            key.includes('hitung-harga') ||
            key.includes('form-data-version') ||
            key.includes('potong-kertas-form-version') ||
            key.includes('dokupro') ||
            key.includes('install_prompt_dismissed') ||
            key === 'permissions'
          )) {
            keysToRemove.push(key)
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k))

        // Simpan versi baru — TANPA reload, TANPA unregister SW
        localStorage.setItem('app_version', APP_VERSION)
      }

      if (!storedVersion) {
        localStorage.setItem('app_version', APP_VERSION)
      }
    } catch (e) {
      console.log('Version check error:', e)
    }

    // Register service worker (only after version check passes)
    if ('serviceWorker' in navigator) {
      // KEBIJAKAN "SELALU STANDBY — TANPA AUTO-REFRESH":
      // Aplikasi TIDAK PERNAH me-reload dirinya sendiri — walau tidak dipakai
      // 1 hari, 1 minggu, atau lebih, dan walau ada deploy baru di antara
      // waktu itu. Dulu ada auto-reload pada 'controllerchange' (saat SW baru
      // skipWaiting mengambil alih) — itulah penyebab "buka aplikasi setelah
      // lama tidak dipakai, kok tiba-tiba refresh". Sekarang SW baru cukup
      // mengambil alih SENYAP di latar belakang: halaman yang terbuka terus
      // berjalan tanpa reload, data tetap fresh (GET API network-first), dan
      // versi kode baru otomatis dipakai pada cold start BERIKUTNYA (buka
      // ulang aplikasi) karena navigasi HTML juga network-first. Saat
      // offline, seluruh aplikasi tersaji dari cache (offline warm-up) —
      // selalu standby tanpa refresh.
      const registerSW = () => {
        navigator.serviceWorker
          .register('/sw.js', { scope: '/' })
          .then((reg) => {
            console.log('SW registered:', reg.scope)

            // OFFLINE WARM-UP: simpan SELURUH asset aplikasi (semua route +
            // chunk JS/CSS) ke Cache Storage saat online — aplikasi tetap
            // bisa dibuka penuh saat offline. Throttle internal 12 jam /
            // per versi, jalan di idle tanpa mengganggu user.
            scheduleOfflineWarmup(versionChangedForWarmup)

            // Wait for the service worker to be active
            if (reg.installing) {
              reg.installing.addEventListener('statechange', () => {
                if (reg.installing?.state === 'activated') {
                  console.log('SW activated - PWA should be installable now')
                  window.dispatchEvent(new Event('swactivated'))
                }
              })
            } else if (reg.active) {
              console.log('SW already active - PWA should be installable')
              window.dispatchEvent(new Event('swactivated'))
            }

            reg.addEventListener('updatefound', () => {
              const newWorker = reg.installing
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'activated') {
                    console.log('New SW activated')
                    window.dispatchEvent(new Event('swactivated'))
                  }
                })
              }
            })

            // CEK UPDATE SEGERA + BERKALA (tiap 60 dtk) — SENYAP, TANPA
            // reload: hanya menyiapkan SW baru di latar belakang agar versi
            // terbaru sudah tersimpan di cache saat aplikasi dibuka ulang
            // berikutnya (cold start). Halaman yang sedang terbuka tidak
            // pernah diganggu — aplikasi selalu standby dari cache.
            const checkForUpdate = () => {
              reg.update().catch(() => {})
            }
            checkForUpdate()
            setInterval(checkForUpdate, 60_000)
            window.addEventListener('online', () => {
              checkForUpdate()
              // Kembali online → pastikan cache asset lengkap (mis. warm-up
              // sebelumnya terlewat karena aplikasi dibuka saat offline)
              scheduleOfflineWarmup(false)
            })
          })
          .catch((err) => console.log('SW registration failed:', err))
      }

      if (document.readyState === 'complete') {
        registerSW()
      } else {
        window.addEventListener('load', registerSW)
      }
    }

    // Lock orientation to portrait for PWA (works in standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      try {
        const orientation = screen.orientation as any
        if (orientation && orientation.lock) {
          orientation.lock('portrait').catch(() => {
            // Orientation lock not supported or not in fullscreen
          })
        }
      } catch (e) {
        // Orientation API not available
      }
    }
  }, [])

  return null
}
