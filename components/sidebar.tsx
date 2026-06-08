'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  Calculator,
  Scissors,
  FileText,
  DollarSign,
  Layers,
  History,
  Settings,
  Users,
  Shield,
  LogOut,
  X,
  Menu,
  Paintbrush,
  Sheet,
  Receipt,
  Truck,
  ShoppingCart,
  BookOpen,
  Store,
  ShoppingBag,
} from 'lucide-react'
import { getAuthUser } from '@/lib/auth'
import { hasFeatureAccess } from '@/lib/permissions'
import { useLanguage } from '@/contexts/language-context'
import { TranslationKey } from '@/lib/i18n'


// Menu items with their feature IDs for permission checking
const menuItems = [
  {
    titleKey: 'pembukaan' as TranslationKey,
    href: '/pembukaan',
    icon: BookOpen,
    featureId: 'pembukaan',
    section: undefined,
  },
  {
    titleKey: 'potong_kertas' as TranslationKey,
    href: '/potong-kertas',
    icon: Scissors,
    featureId: 'potong-kertas',
    section: 'hitung_biaya_produksi',
  },
  {
    titleKey: 'hitung_cetakan' as TranslationKey,
    href: '/hitung-cetakan',
    icon: Calculator,
    featureId: 'hitung-cetakan',
    section: 'hitung_biaya_produksi',
  },
  {
    titleKey: 'invoice' as TranslationKey,
    href: '/invoice',
    icon: Receipt,
    featureId: 'invoice',
    section: 'dokumen',
  },
  {
    titleKey: 'surat_jalan' as TranslationKey,
    href: '/surat-jalan',
    icon: Truck,
    featureId: 'surat-jalan',
    section: 'dokumen',
  },
  {
    titleKey: 'purchase_order' as TranslationKey,
    href: '/purchase-order',
    icon: ShoppingCart,
    featureId: 'purchase-order',
    section: 'dokumen',
  },
  {
    titleKey: 'riwayat_pembelian' as TranslationKey,
    href: '/riwayat-pembelian',
    icon: ShoppingBag,
    featureId: 'purchase-order',
    section: 'dokumen',
  },
  {
    titleKey: 'riwayat_penjualan' as TranslationKey,
    href: '/riwayat-penjualan',
    icon: Receipt,
    featureId: 'invoice',
    section: 'dokumen',
  },
  {
    titleKey: 'hitung_finishing' as TranslationKey,
    href: '/hitung-finishing',
    icon: Paintbrush,
    featureId: 'hitung-finishing',
    section: 'biaya_produksi',
  },
  {
    titleKey: 'hitung_ongkos_cetak' as TranslationKey,
    href: '/hitung-ongkos-cetak',
    icon: DollarSign,
    featureId: 'hitung-ongkos-cetak',
    section: 'biaya_produksi',
  },
  {
    titleKey: 'hitung_harga_kertas' as TranslationKey,
    href: '/hitung-harga-kertas',
    icon: FileText,
    featureId: 'hitung-harga-kertas',
    section: 'biaya_produksi',
  },

  {
    titleKey: 'master_harga_kertas' as TranslationKey,
    href: '/master-harga-kertas',
    icon: FileText,
    featureId: 'master-harga-kertas',
    section: 'master_cetakan',
  },
  {
    titleKey: 'master_ongkos_cetak' as TranslationKey,
    href: '/master-ongkos-cetak',
    icon: DollarSign,
    featureId: 'master-ongkos-cetak',
    section: 'master_cetakan',
  },
  {
    titleKey: 'master_finishing' as TranslationKey,
    href: '/master-finishing',
    icon: Layers,
    featureId: 'master-finishing',
    section: 'master_cetakan',
  },
  {
    titleKey: 'master_customer' as TranslationKey,
    href: '/master-customer',
    icon: Users,
    featureId: 'master-customer',
    section: 'master_cetakan',
  },
  {
    titleKey: 'master_toko_pemasok' as TranslationKey,
    href: '/master-toko-pemasok',
    icon: Store,
    featureId: 'master-toko-pemasok',
    section: 'master_cetakan',
  },
  {
    titleKey: 'hak_akses' as TranslationKey,
    href: '/administrasi/hak-akses',
    icon: Shield,
    featureId: 'hak-akses',
    section: 'administrasi',
  },
  {
    titleKey: 'pengguna' as TranslationKey,
    href: '/administrasi/pengguna',
    icon: Users,
    featureId: 'pengguna',
    section: 'administrasi',
  },
  {
    titleKey: 'pengaturan' as TranslationKey,
    href: '/administrasi/pengaturan',
    icon: Settings,
    featureId: 'pengaturan',
    section: 'setting',
  },
]

interface SidebarProps {
  username?: string
  role?: string
  onLogout?: () => void | Promise<void>
  isOpen?: boolean
  onToggle?: () => void
  permVersion?: number
}

export function Sidebar({ username, role, onLogout, isOpen = true, onToggle, permVersion }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useLanguage()

  const isActive = (href: string) => {
    if (href === '/potong-kertas') {
      return pathname === '/potong-kertas'
    }
    return pathname.startsWith(href)
  }

  // Determine which menu items are accessible:
  // - hak-akses & pengguna: HIDDEN if not allowed (not shown at all)
  // - other features: show with PRO badge if not allowed (visible but locked)
  const HIDDEN_WHEN_DENIED = ['hak-akses', 'pengguna']
  const menuWithAccess = menuItems
    .map(item => {
      if (!role || role === 'superadmin') return { ...item, isPro: false }
      const accessible = hasFeatureAccess(role, item.featureId)
      return { ...item, isPro: !accessible }
    })
    .filter(item => !item.isPro || !HIDDEN_WHEN_DENIED.includes(item.featureId))

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed left-0 top-0 z-50 h-screen w-52 flex flex-col transition-transform duration-300 ease-in-out",
          "[background-color:var(--app-sidebar-bg)] [border-color:var(--app-sidebar-border)]",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Close button - top right */}
        <div className="flex justify-end px-2 pt-2">
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--app-sidebar-text-muted)' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.06)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-4 pb-4 space-y-1">
          {/* Logo + App Name - Centered */}
          <div className="flex flex-col items-center gap-2 mb-3 mt-1">
            <div className="relative">
              <img
                src={'/logo-ds.png'}
                alt="Logo"
                className="w-[54px] h-[54px] rounded-lg object-contain shadow-none"
              />
            </div>
            <div className="text-center">
              <h1 className="text-[17px] font-bold" style={{ color: 'var(--app-sidebar-text)' }}>{t('app_name')}</h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--app-sidebar-text-muted)' }}>{t('app_tagline')}</p>
            </div>
          </div>

          {menuWithAccess.map((item, idx) => {
            // Show section label if this item has a section and the previous visible item doesn't share the same section
            const prevSection = idx > 0 ? (menuWithAccess[idx - 1] as any).section : undefined
            const showSection = item.section && item.section !== prevSection

            return (
            <div key={item.href}>
              {showSection && (
                <div className="mt-4 mb-1 px-3">
                  <div className="border-t mb-2" style={{ borderColor: 'var(--app-sidebar-border)' }}></div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--app-sidebar-text-muted)' }}>
                    {t(item.section as TranslationKey)}
                  </span>
                </div>
              )}
              {item.submenu ? (
                <div>
                  <Link
                    href={item.href}
                    onClick={onToggle}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors',
                      isActive(item.href)
                        ? 'sidebar-active'
                        : 'hover:bg-black/5 dark:hover:bg-white/10'
                    )}
                    style={isActive(item.href) ? { backgroundColor: 'var(--app-sidebar-active-bg)', color: 'var(--app-sidebar-active-text)' } : { color: 'var(--app-sidebar-text)' }}
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    <span className={cn("transition-opacity", !isOpen && "lg:opacity-100 opacity-0")}>{t(item.titleKey)}</span>
                  </Link>
                  <div className="ml-4 lg:ml-8 mt-1 space-y-1">
                    {item.submenu
                      .filter(sub => !role || role === 'superadmin' || hasFeatureAccess(role, sub.featureId))
                      .map((subItem) => (
                        <Link
                          key={subItem.href}
                          href={subItem.href}
                          onClick={onToggle}
                          className={cn(
                            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                            pathname === subItem.href
                              ? 'sidebar-active'
                              : 'hover:bg-black/5 dark:hover:bg-white/10'
                          )}
                          style={pathname === subItem.href ? { backgroundColor: 'var(--app-sidebar-active-bg)', color: 'var(--app-sidebar-active-text)' } : { color: 'var(--app-sidebar-text-muted)' }}
                        >
                          <subItem.icon className="w-4 h-4 flex-shrink-0" />
                          <span className={cn("transition-opacity", !isOpen && "lg:opacity-100 opacity-0")}>{t(subItem.titleKey)}</span>
                        </Link>
                      ))
                    }
                  </div>
                </div>
              ) : (
                <Link
                  href={item.href}
                  onClick={onToggle}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors',
                    item.isPro ? 'opacity-60' : '',
                    isActive(item.href)
                      ? 'sidebar-active'
                      : 'hover:bg-black/5 dark:hover:bg-white/10'
                  )}
                  style={isActive(item.href) ? { backgroundColor: 'var(--app-sidebar-active-bg)', color: 'var(--app-sidebar-active-text)' } : { color: 'var(--app-sidebar-text)' }}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  <span className={cn("transition-opacity flex-1", !isOpen && "lg:opacity-100 opacity-0")}>{t(item.titleKey)}</span>
                  {item.isPro && (
                    <span className="text-[9px] font-bold px-1.5 py-px rounded bg-amber-500 text-white leading-tight">PRO</span>
                  )}
                </Link>
              )}
            </div>
            )
          })}
        </nav>

        {/* User Info & Logout */}
        <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--app-sidebar-border)' }}>
          {username && (
            <div className={cn("mb-1.5 px-2 py-1.5 rounded-md transition-opacity", !isOpen && "lg:opacity-100 opacity-0")} style={{ backgroundColor: 'var(--app-sidebar-active-bg)' }}>
              <div className="flex items-center justify-between gap-1.5">
                <p className="text-[14px] font-medium truncate" style={{ color: 'var(--app-sidebar-text)' }}>{username}</p>
                {role && (
                  <span className={cn(
                    "text-[11px] font-bold px-1.5 py-px rounded-full whitespace-nowrap flex-shrink-0",
                    role === 'superadmin' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                    role === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' :
                    role === 'manager' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                    role === 'demo' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                  )}>
                    {role}
                  </span>
                )}
              </div>
            </div>
          )}
          <button
            onClick={async () => {
              if (onLogout) {
                await onLogout()
              }
              router.push('/')
            }}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[15px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            <span className={cn("transition-opacity", !isOpen && "lg:opacity-100 opacity-0")}>{t('keluar')}</span>
          </button>
        </div>
      </div>
    </>
  )
}

function formatDateIndo(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function MobileHeader({ onMenuToggle, username, title, subtitle, userProfile }: { onMenuToggle: () => void; username?: string; title?: string; subtitle?: string; userProfile?: { createdAt: string | null; validUntil: string | null } | null }) {
  const { t } = useLanguage()

  return (
    <header className="px-3 py-3 lg:py-3 sticky top-0 z-30 border-b" style={{ backgroundColor: 'var(--app-banner-bg)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2 lg:gap-3">
        <button
          onClick={onMenuToggle}
          className="p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ color: 'var(--app-banner-text-muted)' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.06)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <Menu className="w-6 h-6 lg:w-5 lg:h-5" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex-shrink-0">
            <img src={'/logo-ds.png'} alt="Logo" className="w-[32px] h-[32px] lg:w-[32px] lg:h-[32px] rounded-lg object-contain shadow-none" />
          </div>
          {title ? (
            <div className="min-w-0">
              <h1 className="text-base font-bold truncate lg:text-sm" style={{ color: 'var(--app-banner-text)' }}>{title}</h1>
              {subtitle && <p className="text-[11px] truncate lg:text-[10px]" style={{ color: 'var(--app-banner-text-muted)' }}>{subtitle}</p>}
            </div>
          ) : (
            <span className="font-extrabold text-base lg:text-[17px] truncate" style={{ color: 'var(--app-banner-text)' }}>{t('app_name')}</span>
          )}
        </div>
        {/* Mobile: simple date (hidden on md+) */}
        <div className="flex-shrink-0 md:hidden">
          <span className="text-[11px] hidden sm:block" style={{ color: 'var(--app-banner-text-muted)' }}>
            {new Date().toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
        </div>
        {/* Desktop: full date + account info (visible on md+) */}
        <div className="hidden md:flex flex-col items-end justify-center gap-1 flex-shrink-0">
          <span className="text-[13px] font-semibold" style={{ color: 'var(--app-banner-text)' }}>
            {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
          <div className="flex items-center gap-3">
            {userProfile?.createdAt && (
              <span className="text-[11px]" style={{ color: 'var(--app-banner-text-muted)' }}>Daftar: {formatDateIndo(userProfile.createdAt)}</span>
            )}
            {userProfile?.validUntil && (
              <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Expired: {formatDateIndo(userProfile.validUntil)}</span>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
