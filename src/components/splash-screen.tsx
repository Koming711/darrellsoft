'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

/** Rute tanpa splash screen — halaman pendaftaran (alur OTP) tidak memakai splash. */
const SPLASH_EXCLUDED_ROUTES = ['/daftar']

/** Key sessionStorage — penanda splash sudah tampil di sesi browser ini. */
const SPLASH_SESSION_KEY = 'ds_splash_shown'

/**
 * Splash logo DarrellSoft — hanya tampil SATU KALI per sesi browser
 * (pembukaan aplikasi pertama kali). Setelah itu SEMUA pembukaan menu,
 * refresh, maupun hard-navigation membuka aplikasi LANGSUNG tanpa splash.
 *
 * Cara kerja:
 * 1. Saat splash pertama mulai tampil, sessionStorage 'ds_splash_shown' langsung
 *    diisi. Bila pengguna berpindah halaman sebelum splash selesai, load
 *    berikutnya tetap langsung terbuka.
 * 2. Script inline di layout.tsx membaca key itu SEBELUM first paint dan
 *    memasang atribut data-splash="off" pada <html>.
 * 3. CSS di globals.css memakai atribut tersebut untuk menyembunyikan overlay
 *    splash & memaksa konten terlihat — bahkan bila React lambat/gagal
 *    hydrate. Mencegah "menu tidak bisa dibuka, selalu muncul splash".
 *
 * Halaman pendaftaran (/daftar) TANPA splash sesuai permintaan.
 */
export function SplashScreen({ children }: { children: React.ReactNode }) {
  const [showSplash, setShowSplash] = useState(true)
  const pathname = usePathname()
  const skipSplash = SPLASH_EXCLUDED_ROUTES.some(
    (r) => pathname === r || pathname?.startsWith(`${r}/`),
  )

  useEffect(() => {
    if (skipSplash) return

    // Tandai sesi ini sudah melihat splash — SEKARANG (bukan setelah timer),
    // agar navigasi apapun sesudahnya langsung terbuka tanpa splash.
    try {
      sessionStorage.setItem(SPLASH_SESSION_KEY, '1')
    } catch {
      /* storage penuh / private mode — splash berperilaku seperti dulu */
    }

    // Durasi singkat supaya pembukaan aplikasi tetap berlogo namun tidak mengganggu.
    const timer = setTimeout(() => {
      setShowSplash(false)
    }, 1500)

    return () => clearTimeout(timer)
  }, [skipSplash])

  // Halaman pendaftaran: render langsung tanpa splash & tanpa visibility hidden
  if (skipSplash) return <>{children}</>

  return (
    <>
      {/* Always render children so data fetching starts immediately,
          even while splash overlay is visible */}
      <div className="ds-splash-wrap" style={{ visibility: showSplash ? 'hidden' : 'visible' }}>
        {children}
      </div>

      {/* Splash overlay on top - does NOT block children from mounting */}
      {showSplash && (
        <div
          className="ds-splash-overlay fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: '#074290' }}
        >
          <div className="flex flex-col items-center animate-splash">
            <img
              src="/logo-ds.png"
              alt="www.darrellsoft.com"
              className="w-50 h-50 md:w-65 md:h-65 object-contain shadow-none drop-shadow-lg"
            />
            <h1 className="mt-4 text-2xl md:text-3xl font-extrabold text-white tracking-tight drop-shadow-md">
              www.darrellsoft.com
            </h1>
            <p className="mt-1.5 text-sm md:text-base text-white/80 font-medium tracking-wide">
              Aplikasi hitung cepat cetakan
            </p>
            <div className="mt-5 flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
          <style jsx>{`
            @keyframes splash {
              0% { opacity: 0; transform: scale(0.85); }
              20% { opacity: 1; transform: scale(1); }
              90% { opacity: 1; transform: scale(1); }
              100% { opacity: 1; transform: scale(1); }
            }
            .animate-splash {
              animation: splash 1.5s ease-out forwards;
            }
          `}</style>
        </div>
      )}
    </>
  )
}
