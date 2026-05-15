'use client'

import { useEffect } from 'react'

// App version - bump this when deploying new content to force users to get fresh version
const APP_VERSION = '2025-05-13-v2'

export function ServiceWorkerRegistration() {
  useEffect(() => {
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
        // Version mismatch - clear ALL caches and force hard reload
        console.log('App version changed:', storedVersion, '→', APP_VERSION, '- Force clearing caches...')

        // Clear all localStorage keys related to old form versions
        const keysToRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && (
            key.includes('potong-kertas') ||
            key.includes('hitung-cetakan') ||
            key.includes('form-data-version') ||
            key.includes('potong-kertas-form-version') ||
            key.includes('install_prompt_dismissed')
          )) {
            keysToRemove.push(key)
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k))

        // Delete all caches
        if ('caches' in window) {
          caches.keys().then(names => {
            names.forEach(name => caches.delete(name))
          })
        }

        // Unregister all service workers
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(regs => {
            regs.forEach(reg => reg.unregister())
          })
        }

        // Store new version BEFORE reload to prevent loop
        localStorage.setItem('app_version', APP_VERSION)

        // Force hard reload (bypass cache)
        window.location.reload()
        return
      }

      if (!storedVersion) {
        localStorage.setItem('app_version', APP_VERSION)
      }
    } catch (e) {
      console.log('Version check error:', e)
    }

    // Register service worker (only after version check passes)
    if ('serviceWorker' in navigator) {
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

            // Check for updates periodically
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
