'use client'

import { useEffect } from 'react'

// App version - bump this when deploying new content to force users to get fresh version
const APP_VERSION = '2026-09-20-v47'
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
    try {
      const storedVersion = localStorage.getItem('app_version')
      if (storedVersion && storedVersion !== APP_VERSION) {
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
      // CATATAN: TIDAK ADA auto-reload saat SW baru mengambil alih
      // (controllerchange). Reload paksa saat user sedang memakai aplikasi
      // adalah keluhan utama "aplikasi suka di refresh". SW baru (skipWaiting)
      // aktif di latar belakang; kode baru dipakai pada buka berikutnya.
      // Data TETAP fresh karena semua GET API network-first di sw.js.
      const registerSW = () => {
        navigator.serviceWorker
          .register('/sw.js', { scope: '/' })
          .then((reg) => {
            console.log('SW registered:', reg.scope)

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

            // CEK UPDATE SEGERA + BERKALA (tiap 60 dtk) — KRITICAL:
            // PWA yang masih "resume" dari memori (tidak pernah reload) TIDAK
            // pernah mengecek SW baru, sehingga user terus melihat versi lama
            // walau deploy sudah selesai (keluhan "belum ada perubahan").
            // Dengan reg.update() berkala + controllerchange auto-reload di
            // atas, setiap deploy otomatis diterapkan maksimal 1 menit setelah
            // aplikasi dibuka/diresume — tanpa perlu tutup-buka aplikasi.
            const checkForUpdate = () => {
              reg.update().catch(() => {})
            }
            checkForUpdate()
            setInterval(checkForUpdate, 60_000)
            window.addEventListener('online', checkForUpdate)
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
