'use client'

// Layout Panel Admin Langganan — hanya admin & superadmin.
// Shell MINIMAL (pola Rajamesin): guard akses + wadah flex; sidebar, bar atas
// mobile, dan footer dirender oleh AdminPanel (page) — satu halaman, satu shell.
// Server-side tetap dilindungi requireAdmin() di /api/panel-admin/*.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getAuthUser } from '@/lib/auth'
import { Skeleton } from '@/components/ui/skeleton'
import { ShieldAlert } from 'lucide-react'

export default function PanelAdminLayout({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [authed, setAuthed] = useState(false)
  const [role, setRole] = useState('')

  useEffect(() => {
    const user = getAuthUser()
    const isAdmin = !!user && (user.role === 'admin' || user.role === 'superadmin')
    setAuthed(isAdmin)
    setRole(user?.role ?? '')
    setReady(true)
  }, [])

  return (
    <div
      data-panel-admin=""
      className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950"
    >
      {!ready ? (
        <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : !authed ? (
        <main className="flex flex-1 items-center justify-center px-4">
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <div className="rounded-full bg-red-100 p-4 dark:bg-red-950/50">
              <ShieldAlert className="h-8 w-8 text-red-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Akses ditolak</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Panel admin hanya dapat dibuka oleh akun <b>admin</b> atau <b>superadmin</b>.
                {role ? ` (Role Anda: ${role})` : ' Silakan login terlebih dahulu.'}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/login?next=/panel-admin"
                className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Login Masuk
              </Link>
              <Link
                href="/pembukaan"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Kembali ke Aplikasi
              </Link>
            </div>
          </div>
        </main>
      ) : (
        // Sidebar + konten hidup berdampingan di page (pola Rajamesin)
        <div className="flex w-full flex-1 items-stretch">{children}</div>
      )}
    </div>
  )
}
