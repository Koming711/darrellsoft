'use client'

// Layout Panel Admin Langganan — hanya admin & superadmin.
// Sub-navigasi: Ringkasan · Kelola Paket · Verifikasi Pembayaran ·
// Kelola Pelanggan · Riwayat Transaksi · Pengaturan Pembayaran.
// Server-side tetap dilindungi requireAdmin() di semua API /api/panel-admin/*.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LayoutDashboard,
  PackageOpen,
  ShieldCheck,
  Users,
  History,
  Settings,
  ChevronLeft,
  ShieldAlert,
} from 'lucide-react'

const NAV = [
  { href: '/panel-admin', label: 'Ringkasan', icon: LayoutDashboard, exact: true },
  { href: '/panel-admin/kelola-paket', label: 'Kelola Paket', icon: PackageOpen },
  { href: '/panel-admin/verifikasi-pembayaran', label: 'Verifikasi Pembayaran', icon: ShieldCheck },
  { href: '/panel-admin/kelola-pelanggan', label: 'Kelola Pelanggan', icon: Users },
  { href: '/panel-admin/riwayat-transaksi', label: 'Riwayat Transaksi', icon: History },
  { href: '/panel-admin/pengaturan-pembayaran', label: 'Pengaturan Pembayaran', icon: Settings },
]

export default function PanelAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
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

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + '/')

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-30 border-b bg-white shadow-sm dark:bg-slate-950">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex h-14 items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link href="/pembukaan" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
                <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline">Kembali ke Aplikasi</span>
              </Link>
              <span className="h-5 w-px bg-border" />
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600">
                  <ShieldCheck className="h-4.5 w-4.5 text-white" />
                </div>
                <div className="leading-tight">
                  <div className="text-sm font-bold">Panel Admin Langganan</div>
                  <div className="text-[10px] text-muted-foreground">Darrellsoft SaaS</div>
                </div>
              </div>
            </div>
            {authed && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                  {role}
                </span>
              </div>
            )}
          </div>
          {/* Sub-nav */}
          {authed && (
            <nav className="-mb-px flex gap-1 overflow-x-auto pb-1" aria-label="Navigasi panel admin">
              {NAV.map((item) => {
                const active = isActive(item.href, item.exact)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2 text-xs font-medium transition-colors sm:text-sm',
                      active
                        ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {!ready ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
        ) : !authed ? (
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
              <Button asChild variant="outline">
                <Link href="/login?next=/panel-admin">Login Masuk</Link>
              </Button>
              <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
                <Link href="/pembukaan">Kembali ke Aplikasi</Link>
              </Button>
            </div>
          </div>
        ) : (
          children
        )}
      </main>

      <footer className="mt-auto border-t bg-white py-4 dark:bg-slate-950">
        <div className="mx-auto max-w-7xl px-4 text-center text-[11px] text-muted-foreground">
          Panel Admin Langganan Darrellsoft — pembayaran diverifikasi manual; langganan hanya aktif setelah
          persetujuan admin.
        </div>
      </footer>
    </div>
  )
}
