'use client'

// Layout Panel Admin Langganan — hanya admin & superadmin.
// Navigasi: SIDEBAR menu (desktop, bisa diciutkan) + drawer Sheet (mobile).
// Semua sub-halaman panel-admin terkelompok: Utama · Langganan · Daftar Akun ·
// Laporan · Sistem. Server-side tetap dilindungi requireAdmin() di /api/panel-admin/*.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  LayoutDashboard,
  PackageOpen,
  Crown,
  ShieldCheck,
  Users,
  UserPlus,
  UserCheck,
  UserX,
  Clock,
  History,
  Wallet,
  Settings,
  BarChart3,
  Receipt,
  ScrollText,
  Users2,
  KeyRound,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronLeft,
  ShieldAlert,
} from 'lucide-react'

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  exact?: boolean
}

const MENU_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Utama',
    items: [{ href: '/panel-admin', label: 'Ringkasan', icon: LayoutDashboard, exact: true }],
  },
  {
    label: 'Langganan',
    items: [
      { href: '/panel-admin/kelola-paket', label: 'Kelola Paket', icon: PackageOpen },
      { href: '/panel-admin/paket-premium', label: 'Paket Premium', icon: Crown },
      { href: '/panel-admin/verifikasi-pembayaran', label: 'Verifikasi Pembayaran', icon: ShieldCheck },
      { href: '/panel-admin/riwayat-transaksi', label: 'Riwayat Transaksi', icon: History },
      { href: '/panel-admin/pengaturan-pembayaran', label: 'Pengaturan Pembayaran', icon: Wallet },
    ],
  },
  {
    label: 'Daftar Akun',
    items: [
      { href: '/panel-admin/kelola-pelanggan', label: 'Kelola Pelanggan', icon: Users },
      { href: '/panel-admin/akun-baru', label: 'Akun Baru', icon: UserPlus },
      { href: '/panel-admin/akun-aktif', label: 'Akun Aktif', icon: UserCheck },
      { href: '/panel-admin/akun-expired', label: 'Akun Expired', icon: Clock },
      { href: '/panel-admin/akun-ditolak', label: 'Akun Ditolak', icon: UserX },
      { href: '/panel-admin/pengaturan', label: 'Pengaturan Akun', icon: Settings },
    ],
  },
  {
    label: 'Laporan',
    items: [
      { href: '/panel-admin/laporan-bulanan', label: 'Laporan Bulanan', icon: BarChart3 },
      { href: '/panel-admin/riwayat-penjualan', label: 'Riwayat Penjualan', icon: Receipt },
      { href: '/panel-admin/laporan-audit', label: 'Laporan dan Audit', icon: ScrollText },
    ],
  },
  {
    label: 'Sistem',
    items: [
      { href: '/panel-admin/pengguna', label: 'Pengguna', icon: Users2 },
      { href: '/panel-admin/hak-akses', label: 'Hak Akses', icon: KeyRound },
    ],
  },
]

export default function PanelAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [ready, setReady] = useState(false)
  const [authed, setAuthed] = useState(false)
  const [role, setRole] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const user = getAuthUser()
    const isAdmin = !!user && (user.role === 'admin' || user.role === 'superadmin')
    setAuthed(isAdmin)
    setRole(user?.role ?? '')
    setReady(true)
  }, [])

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + '/')

  // Render menu sidebar (dipakai bersama oleh sidebar desktop & drawer mobile)
  const renderNav = (onNavigate?: () => void, showLabels = true) => (
    <nav className="flex flex-col" aria-label="Navigasi panel admin">
      {MENU_SECTIONS.map((section, si) => (
        <div key={section.label}>
          {showLabels ? (
            <div
              className={cn(
                'px-2.5 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80',
                si === 0 && 'pt-1',
              )}
            >
              {section.label}
            </div>
          ) : (
            si > 0 && <div className="mx-3 my-2 border-t border-border/60" />
          )}
          {section.items.map((item) => {
            const active = isActive(item.href, item.exact)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                title={item.label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'mt-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                  showLabels ? '' : 'justify-center px-0',
                  active
                    ? 'bg-emerald-50 font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'text-muted-foreground hover:bg-slate-100 hover:text-foreground dark:hover:bg-slate-800/60',
                )}
              >
                <item.icon className="h-4.5 w-4.5 shrink-0" />
                {showLabels && <span className="truncate">{item.label}</span>}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      {/* ===== Header ===== */}
      <header className="sticky top-0 z-30 border-b bg-white shadow-sm dark:bg-slate-950">
        <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-1.5">
            {/* Hamburger — drawer menu (mobile/tablet) */}
            {authed && (
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Buka menu panel admin">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 overflow-y-auto p-0">
                  <SheetHeader className="border-b px-4 py-3 text-left">
                    <SheetTitle className="flex items-center gap-2 text-sm font-bold">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600">
                        <ShieldCheck className="h-4.5 w-4.5 text-white" />
                      </span>
                      Panel Admin Langganan
                    </SheetTitle>
                  </SheetHeader>
                  <div className="px-3 pb-8 pt-2">{renderNav(() => setMobileOpen(false))}</div>
                </SheetContent>
              </Sheet>
            )}
            <Link
              href="/pembukaan"
              className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline">Kembali ke Aplikasi</span>
            </Link>
            <span className="hidden h-5 w-px bg-border md:block" />
            <div className="hidden min-w-0 items-center gap-2 md:flex">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600">
                <ShieldCheck className="h-4.5 w-4.5 text-white" />
              </span>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-sm font-bold">Panel Admin Langganan</div>
                <div className="text-[10px] text-muted-foreground">Darrellsoft SaaS</div>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Toggle ciutkan sidebar (desktop) */}
            {authed && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCollapsed((v) => !v)}
                aria-label={collapsed ? 'Perlebar menu samping' : 'Persempit menu samping'}
                className="hidden lg:inline-flex"
              >
                {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
              </Button>
            )}
            {authed && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold capitalize text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                {role}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ===== Body: sidebar + konten ===== */}
      <div className="flex w-full flex-1 items-stretch">
        {/* Sidebar desktop */}
        {authed && (
          <aside
            className={cn(
              'sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 overflow-y-auto border-r bg-white pb-6 transition-[width] duration-200 dark:bg-slate-950 lg:block',
              collapsed ? 'w-16' : 'w-64',
            )}
          >
            {renderNav(undefined, !collapsed)}
          </aside>
        )}

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {!ready ? (
            <div className="mx-auto max-w-6xl space-y-4">
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
      </div>

      {/* ===== Footer (menempel di bawah) ===== */}
      <footer className="mt-auto border-t bg-white py-4 dark:bg-slate-950">
        <div className="px-4 text-center text-[11px] text-muted-foreground">
          Panel Admin Langganan Darrellsoft — pembayaran diverifikasi manual; langganan hanya aktif setelah
          persetujuan admin.
        </div>
      </footer>
    </div>
  )
}
