'use client'

import * as React from 'react'
import {
  BarChart3,
  Building2,
  FileText,
  LayoutDashboard,
  Menu,
  Package,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore, useCompanyUsers, useCurrentCompany, useCurrentUser, type PageKey } from '@/store/app-store'
import { api } from '@/lib/client-api'
import { ROLE_LABELS } from '@/lib/permissions'
import type { BootstrapDTO } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import DashboardPage from '@/components/darrellsoft/pages/dashboard-page'
import CustomersPage from '@/components/darrellsoft/pages/customers-page'
import ProductsPage from '@/components/darrellsoft/pages/products-page'
import CustomerPricesPage from '@/components/darrellsoft/pages/customer-prices-page'
import InvoicesPage from '@/components/darrellsoft/pages/invoices-page'
import ReportsPage from '@/components/darrellsoft/pages/reports-page'

/** Konstanta stabil agar selector zustand tidak membuat array baru tiap render. */
const EMPTY_COMPANIES: BootstrapDTO['companies'] = []

const NAV: Array<{ key: PageKey; label: string; icon: LucideIcon }> = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'customers', label: 'Customer', icon: Users },
  { key: 'products', label: 'Produk', icon: Package },
  { key: 'prices', label: 'Harga Customer', icon: Tags },
  { key: 'invoices', label: 'Invoice', icon: FileText },
  { key: 'reports', label: 'Laporan', icon: BarChart3 },
]

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-9 w-9 rounded-lg bg-emerald-600 text-white grid place-items-center font-bold text-lg shadow-sm">
        D
      </div>
      <div className="leading-tight">
        <p className="font-semibold tracking-tight">Darrellsoft</p>
        <p className="text-[11px] text-muted-foreground">Manajemen Penjualan</p>
      </div>
    </div>
  )
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const activePage = useAppStore((s) => s.activePage)
  const setActivePage = useAppStore((s) => s.setActivePage)
  return (
    <nav aria-label="Menu utama" className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = activePage === item.key
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setActivePage(item.key)
              onNavigate?.()
            }}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left',
              active
                ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
            )}
          >
            <item.icon className={cn('h-4.5 w-4.5 h-[18px] w-[18px]', active ? 'text-emerald-700' : 'text-zinc-400')} />
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}

function SessionSwitchers() {
  const company = useCurrentCompany()
  const user = useCurrentUser()
  const users = useCompanyUsers()
  const companies = useAppStore((s) => s.bootstrap?.companies ?? EMPTY_COMPANIES)
  const setCompany = useAppStore((s) => s.setCompany)
  const setUser = useAppStore((s) => s.setUser)

  return (
    <div className="flex items-center gap-2">
      <Select value={company?.id ?? ''} onValueChange={setCompany}>
        <SelectTrigger size="sm" className="w-[150px] sm:w-[190px] gap-1" aria-label="Pilih perusahaan">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <SelectValue placeholder="Perusahaan" />
        </SelectTrigger>
        <SelectContent>
          {companies.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={user?.id ?? ''} onValueChange={setUser}>
        <SelectTrigger size="sm" className="w-[150px] sm:w-[200px] gap-1" aria-label="Pilih pengguna">
          <SelectValue placeholder="Pengguna" />
        </SelectTrigger>
        <SelectContent>
          {users.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              <span className="flex items-center gap-2">
                <span className="truncate">{u.name}</span>
                <span className="text-[10px] uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 py-px">
                  {ROLE_LABELS[u.role]}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export default function AppShell() {
  const hydrated = useAppStore((s) => s.hydrated)
  const bootstrap = useAppStore((s) => s.bootstrap)
  const setBootstrap = useAppStore((s) => s.setBootstrap)
  const company = useCurrentCompany()
  const user = useCurrentUser()
  const activePage = useAppStore((s) => s.activePage)
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  // Render setelah mount agar state persist (localStorage) tidak memicu hydration mismatch
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    let cancelled = false
    api<BootstrapDTO>('/api/bootstrap')
      .then((data) => {
        if (!cancelled) setBootstrap(data)
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [setBootstrap])

  const content = React.useMemo(() => {
    if (!mounted || !hydrated || !bootstrap || !company || !user) return null
    switch (activePage) {
      case 'customers':
        return <CustomersPage />
      case 'products':
        return <ProductsPage />
      case 'prices':
        return <CustomerPricesPage />
      case 'invoices':
        return <InvoicesPage />
      case 'reports':
        return <ReportsPage />
      default:
        return <DashboardPage />
    }
  }, [activePage, mounted, hydrated, bootstrap, company, user])

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50/60">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-5">
          {/* Mobile menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="lg:hidden" aria-label="Buka menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b p-4">
                <SheetTitle asChild>
                  <div>
                    <BrandMark />
                  </div>
                </SheetTitle>
              </SheetHeader>
              <div className="p-3">
                <NavList onNavigate={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <div className="lg:hidden">
            <BrandMark />
          </div>

          <div className="hidden lg:flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{company?.name ?? 'Memuat...'}</span>
            {user && (
              <span className="text-muted-foreground">
                · {user.name} ({ROLE_LABELS[user.role]})
              </span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <SessionSwitchers />
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar desktop */}
        <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 border-r bg-white sticky top-14 self-start h-[calc(100vh-3.5rem)] overflow-y-auto">
          <div className="p-4 pb-2">
            <BrandMark />
          </div>
          <div className="p-3 pt-2 flex-1">
            <NavList />
          </div>
          <div className="p-4 border-t text-xs text-muted-foreground">
            Harga khusus per customer, otomatis diterapkan saat invoice dibuat.
          </div>
        </aside>

        {/* Konten */}
        <main className="flex-1 min-w-0">
          <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
            {loadError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                Gagal memuat data awal: {loadError}
              </div>
            ) : content === null ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-64" />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-24" />
                  ))}
                </div>
                <Skeleton className="h-72" />
              </div>
            ) : (
              content
            )}
          </div>
        </main>
      </div>

      {/* Footer sticky */}
      <footer className="mt-auto border-t bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-1 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} Darrellsoft · Harga Barang per Customer</p>
          <p>Prioritas harga: harga khusus customer → harga standar Master Produk</p>
        </div>
      </footer>
    </div>
  )
}
