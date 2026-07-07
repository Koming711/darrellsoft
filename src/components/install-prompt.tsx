'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Download, X, Smartphone, Monitor, Share, MoreVertical } from 'lucide-react'
import { useLanguage } from '@/contexts/language-context'

const T = {
  id: {
    install_app: 'Install Aplikasi',
    installed_title: 'Berhasil Diinstall!',
    installed_desc: 'Buka dari home screen untuk mulai',
    install_darrell: 'Install Darrell Soft',
    install_subtitle: 'Akses lebih cepat tanpa browser',
    like_app: 'Buka seperti Aplikasi',
    like_app_desc: 'Tampilan fullscreen tanpa address bar',
    quick_access: 'Akses Cepat dari Home Screen',
    quick_access_desc: 'Satu klik langsung buka aplikasi',
    works_offline: 'Works Offline',
    works_offline_desc: 'Data tersimpan lokal, tetap bisa diakses',
    install_ios_title: 'Cara Install di iPhone/iPad:',
    install_android_title: 'Cara Install di Android:',
    install_desktop_title: 'Cara Install di Desktop:',
    install_ios_step1_pre: '1. Tap',
    install_ios_step1_post: 'di toolbar Safari',
    install_ios_step2: '2. Pilih',
    install_ios_step3: '3. Tap',
    install_android_step1_pre: '1. Tap',
    install_android_step1_post: '(titik 3) di kanan atas Chrome',
    install_android_step2: '2. Pilih',
    install_android_step3: '3. Tap',
    install_desktop_chrome: 'Chrome: Klik icon ⓘ di address bar',
    install_desktop_edge: 'Edge: Menu → Apps → Install',
    install_desktop_safari: 'Safari: File → Add to Dock',
    try_again: 'Coba Lagi',
    installing: 'Menginstall...',
    waiting_browser: 'Menunggu browser...',
    install_now: 'Install Sekarang',
    add_to_home_screen: '"Add to Home Screen"',
    add: '"Add"',
    install_app_label: '"Install app"',
    install_label: '"Install"',
  },
  en: {
    install_app: 'Install App',
    installed_title: 'Successfully Installed!',
    installed_desc: 'Open from home screen to start',
    install_darrell: 'Install Darrell Soft',
    install_subtitle: 'Faster access without browser',
    like_app: 'Open like an App',
    like_app_desc: 'Fullscreen view without address bar',
    quick_access: 'Quick Access from Home Screen',
    quick_access_desc: 'One click to open the app instantly',
    works_offline: 'Works Offline',
    works_offline_desc: 'Data stored locally, still accessible',
    install_ios_title: 'How to Install on iPhone/iPad:',
    install_android_title: 'How to Install on Android:',
    install_desktop_title: 'How to Install on Desktop:',
    install_ios_step1_pre: '1. Tap',
    install_ios_step1_post: 'in Safari toolbar',
    install_ios_step2: '2. Select',
    install_ios_step3: '3. Tap',
    install_android_step1_pre: '1. Tap',
    install_android_step1_post: '(3 dots) at top right of Chrome',
    install_android_step2: '2. Select',
    install_android_step3: '3. Tap',
    install_desktop_chrome: 'Chrome: Click the ⓘ icon in address bar',
    install_desktop_edge: 'Edge: Menu → Apps → Install',
    install_desktop_safari: 'Safari: File → Add to Dock',
    try_again: 'Try Again',
    installing: 'Installing...',
    waiting_browser: 'Waiting for browser...',
    install_now: 'Install Now',
    add_to_home_screen: '"Add to Home Screen"',
    add: '"Add"',
    install_app_label: '"Install app"',
    install_label: '"Install"',
  },
} as const

export function InstallPrompt() {
  const { language } = useLanguage()
  const t = T[language]
  const [showPrompt, setShowPrompt] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isAndroid, setIsAndroid] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [canAutoInstall, setCanAutoInstall] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installSuccess, setInstallSuccess] = useState(false)
  const [waitingForPrompt, setWaitingForPrompt] = useState(false)
  const [showManualInstall, setShowManualInstall] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const hasInitRef = useRef(false)

  // Check for the deferred prompt captured by the inline script in <head>
  const checkForPrompt = useCallback(() => {
    if (typeof window === 'undefined') return false
    if ((window as any).__deferredInstallPrompt) {
      setCanAutoInstall(true)
      return true
    }
    return false
  }, [])

  useEffect(() => {
    // Check if already running as standalone PWA
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://')

    if (isStandaloneMode) {
      setIsStandalone(true)
      return
    }

    if (hasInitRef.current) return
    hasInitRef.current = true

    // Detect platform
    const ua = navigator.userAgent
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream
    const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua)
    setIsIOS(isIOSDevice && isSafari)
    setIsAndroid(/Android/.test(ua) && !isIOSDevice)

    // Check if inline script already captured the prompt
    checkForPrompt()

    // Listen for beforeinstallprompt directly as backup
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      ;(window as any).__deferredInstallPrompt = e
      setCanAutoInstall(true)
      setWaitingForPrompt(false)
      setShowManualInstall(false)
    }

    // Listen for app installed event
    const handleAppInstalled = () => {
      setCanAutoInstall(false)
      ;(window as any).__deferredInstallPrompt = null
      setInstallSuccess(true)
      setInstalling(false)
      setWaitingForPrompt(false)
      setShowPrompt(false)
      setDismissed(true)
      setTimeout(() => {
        setInstallSuccess(false)
      }, 3000)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleAppInstalled)

    // Poll for the deferred prompt every 500ms for up to 30 seconds
    let pollCount = 0
    const pollInterval = setInterval(() => {
      if (checkForPrompt() || pollCount >= 60) {
        clearInterval(pollInterval)
      }
      pollCount++
    }, 500)

    // Don't auto-show the full-screen install prompt overlay (it blocks the page view).
    // Instead, just mark as dismissed so only the floating FAB button shows.
    // Users can click the FAB to see the install dialog if they want.
    const showTimer = setTimeout(() => {
      if (sessionStorage.getItem('install_dismissed') === '1') return
      setDismissed(true)
    }, 5500)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleAppInstalled)
      clearInterval(pollInterval)
      clearTimeout(showTimer)
    }
  }, [checkForPrompt])

  const handleInstallClick = async () => {
    const promptEvent = (window as any).__deferredInstallPrompt

    if (promptEvent) {
      setInstalling(true)
      try {
        await promptEvent.prompt()
        const { outcome } = await promptEvent.userChoice
        if (outcome === 'accepted') {
          setShowPrompt(false)
        } else {
          setInstalling(false)
        }
      } catch (e) {
        console.log('Install prompt error:', e)
        setInstalling(false)
      }
      ;(window as any).__deferredInstallPrompt = null
      setCanAutoInstall(false)
    } else {
      setWaitingForPrompt(true)

      let retryCount = 0
      const retryInterval = setInterval(() => {
        if ((window as any).__deferredInstallPrompt) {
          clearInterval(retryInterval)
          setWaitingForPrompt(false)
          const prompt = (window as any).__deferredInstallPrompt
          setInstalling(true)
          ;(window as any).__deferredInstallPrompt = null
          setCanAutoInstall(false)
          prompt.prompt().then(() => {
            prompt.userChoice.then(({ outcome }: { outcome: string }) => {
              if (outcome === 'accepted') {
                setShowPrompt(false)
              } else {
                setInstalling(false)
              }
            })
          }).catch(() => {
            setInstalling(false)
          })
        }
        retryCount++
        if (retryCount >= 6) {
          clearInterval(retryInterval)
          setWaitingForPrompt(false)
          setShowManualInstall(true)
        }
      }, 500)
    }
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    setDismissed(true)
    sessionStorage.setItem('install_dismissed', '1')
  }

  // Don't show anything if running as standalone PWA
  if (isStandalone) return null

  // Show success message after install
  if (installSuccess) {
    return (
      <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setInstallSuccess(false)} />
        <div
          className="relative bg-white rounded-2xl shadow-2xl max-w-[240px] w-full overflow-hidden text-center py-6 px-5"
          style={{ animation: 'installPopIn 0.3s ease-out forwards' }}
        >
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-2">
            <Download className="w-5 h-5 text-blue-700" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">{t.installed_title}</h3>
          <p className="text-[10px] text-slate-500 mt-1">{t.installed_desc}</p>
        </div>
        <style>{`
          @keyframes installPopIn {
            0% { opacity: 0; transform: scale(0.9); }
            100% { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </div>
    )
  }

  // Floating install FAB
  const showFab = dismissed && !showPrompt && !installSuccess

  return (
    <>
      {showFab && (
        <button
          onClick={() => { setDismissed(false); setShowPrompt(true); setShowManualInstall(false); sessionStorage.removeItem('install_dismissed'); }}
          className="fixed bottom-4 right-4 z-[9998] w-12 h-12 rounded-full text-white shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
          style={{ background: 'linear-gradient(135deg, #074290, #0a5eb8)' }}
          title={t.install_app}
        >
          <Download className="w-5 h-5" />
        </button>
      )}

      {showPrompt && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" onClick={handleDismiss}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white rounded-2xl shadow-2xl max-w-[280px] w-full overflow-hidden"
            style={{ animation: 'installPopIn 0.3s ease-out forwards' }}
          >
            {/* Header */}
            <div className="relative px-4 pt-5 pb-4 text-center" style={{ background: 'linear-gradient(135deg, #074290, #0a5eb8)' }}>
              <button
                onClick={handleDismiss}
                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              >
                <X className="w-3 h-3 text-white" />
              </button>
              <h2 className="text-base font-bold text-white">{t.install_darrell}</h2>
              <p className="text-[10px] text-blue-200 mt-0.5">{t.install_subtitle}</p>
            </div>

            {/* Benefits */}
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-md bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Monitor className="w-3.5 h-3.5 text-blue-700" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-800">{t.like_app}</p>
                  <p className="text-[10px] text-slate-500">{t.like_app_desc}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-md bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Download className="w-3.5 h-3.5 text-blue-700" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-800">{t.quick_access}</p>
                  <p className="text-[10px] text-slate-500">{t.quick_access_desc}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-md bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Smartphone className="w-3.5 h-3.5 text-blue-700" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-800">{t.works_offline}</p>
                  <p className="text-[10px] text-slate-500">{t.works_offline_desc}</p>
                </div>
              </div>
            </div>

            {/* Action */}
            <div className="px-4 pb-4">
              {isIOS ? (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-[10px] font-semibold text-slate-700 mb-1.5">{t.install_ios_title}</p>
                  <div className="flex items-center gap-1 text-[10px] text-slate-600">
                    <span>{t.install_ios_step1_pre}</span>
                    <Share className="w-3 h-3 text-blue-500" />
                    <span>{t.install_ios_step1_post}</span>
                  </div>
                  <p className="text-[10px] text-slate-600 mt-0.5">{t.install_ios_step2} <strong>{t.add_to_home_screen}</strong></p>
                  <p className="text-[10px] text-slate-600 mt-0.5">{t.install_ios_step3} <strong>{t.add}</strong></p>
                </div>
              ) : showManualInstall ? (
                <div className="space-y-2">
                  {isAndroid ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-700 mb-1.5">{t.install_android_title}</p>
                      <div className="flex items-center gap-1 text-[10px] text-slate-600">
                        <span>{t.install_android_step1_pre}</span>
                        <MoreVertical className="w-3 h-3 text-slate-600" />
                        <span>{t.install_android_step1_post}</span>
                      </div>
                      <p className="text-[10px] text-slate-600 mt-0.5">{t.install_android_step2} <strong>{t.install_app_label}</strong></p>
                      <p className="text-[10px] text-slate-600 mt-0.5">{t.install_android_step3} <strong>{t.install_label}</strong></p>
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <p className="text-[10px] font-semibold text-slate-700 mb-1.5">{t.install_desktop_title}</p>
                      <p className="text-[10px] text-slate-600">{t.install_desktop_chrome}</p>
                      <p className="text-[10px] text-slate-600">{t.install_desktop_edge}</p>
                      <p className="text-[10px] text-slate-600">{t.install_desktop_safari}</p>
                    </div>
                  )}
                  <button
                    onClick={handleInstallClick}
                    className="w-full py-2 rounded-lg text-xs font-bold text-white transition-all active:scale-[0.98]"
                    style={{ background: 'linear-gradient(to right, #074290, #0a5eb8)' }}
                  >
                    {t.try_again}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleInstallClick}
                  disabled={installing || waitingForPrompt}
                  className="w-full py-2.5 rounded-lg text-xs font-bold text-white shadow-md transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait"
                  style={{ background: 'linear-gradient(to right, #074290, #0a5eb8)', boxShadow: installing || waitingForPrompt ? 'none' : '0 4px 14px rgba(7, 66, 144, 0.35)' }}
                >
                  {installing ? t.installing : waitingForPrompt ? t.waiting_browser : t.install_now}
                </button>
              )}
            </div>
          </div>

          <style>{`
            @keyframes installPopIn {
              0% { opacity: 0; transform: scale(0.9); }
              100% { opacity: 1; transform: scale(1); }
            }
          `}</style>
        </div>
      )}
    </>
  )
}
