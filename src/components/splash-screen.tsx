'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

/** Rute tanpa splash screen — halaman pendaftaran (alur OTP) tidak memakai splash. */
const SPLASH_EXCLUDED_ROUTES = ['/daftar']

/**
 * Splash logo DarrellSoft — TAMPIL DI SETIAP REFRESH / pembukaan aplikasi.
 * Sebelumnya hanya 1x per sesi (sessionStorage) — sekarang selalu tampil agar
 * setiap refresh memberi pengalaman loading berlogo www.darrellsoft.com
 * (menggantikan kesan "halaman verifikasi" yang pernah muncul saat Vercel
 * mengaktifkan security challenge sementara).
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

    // Selalu tampil di setiap load halaman penuh (refresh), durasi singkat
    // supaya tidak mengganggu penggunaan rutin.
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
      <div style={{ visibility: showSplash ? 'hidden' : 'visible' }}>
        {children}
      </div>

      {/* Splash overlay on top - does NOT block children from mounting */}
      {showSplash && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: '#074290' }}>
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
