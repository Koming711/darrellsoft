'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from './theme-toggle'
import { LanguageToggle } from './language-toggle'
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
  Paintbrush,
  Sheet,
  Receipt,
  Truck,
  ShoppingCart,
  BookOpen,
  Store,
  ShoppingBag,
  Home,
  MoreHorizontal,
  TrendingUp,
  Wallet,
  ScrollText,
  UserCog,
  Banknote,
  BarChart3,
} from 'lucide-react'
import { getAuthUser } from '@/lib/auth'
import { hasFeatureAccess } from '@/lib/permissions'
import { useLanguage } from '@/contexts/language-context'
import { TranslationKey } from '@/lib/i18n'
import { startNavigation } from '@/components/navigation-progress'


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
    icon: TrendingUp,
    featureId: 'invoice',
    section: 'dokumen',
  },
  {
    titleKey: 'rekap_penjualan' as TranslationKey,
    href: '/rekap-penjualan',
    icon: BarChart3,
    featureId: 'invoice',
    section: 'dokumen',
  },
  {
    titleKey: 'biaya' as TranslationKey,
    href: '/biaya',
    icon: Banknote,
    featureId: 'biaya',
    section: 'biaya',
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
    icon: ScrollText,
    featureId: 'master-harga-kertas',
    section: 'master_cetakan',
  },
  {
    titleKey: 'master_ongkos_cetak' as TranslationKey,
    href: '/master-ongkos-cetak',
    icon: Wallet,
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
    icon: UserCog,
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

// Bottom nav items — the 5 main items shown in the mobile bottom bar
// + "More" button that opens the full sidebar
// shortTitleKey is used for the bottom nav label (shorter text, translatable)
const bottomNavItems = [
  {
    titleKey: 'pembukaan' as TranslationKey,
    shortTitleKey: 'short_beranda' as TranslationKey,
    href: '/pembukaan',
    icon: BookOpen,
    featureId: 'pembukaan',
  },
  {
    titleKey: 'potong_kertas' as TranslationKey,
    shortTitleKey: 'short_potong' as TranslationKey,
    href: '/potong-kertas',
    icon: Scissors,
    featureId: 'potong-kertas',
  },
  {
    titleKey: 'hitung_cetakan' as TranslationKey,
    shortTitleKey: 'short_cetakan' as TranslationKey,
    href: '/hitung-cetakan',
    icon: Calculator,
    featureId: 'hitung-cetakan',
  },
  {
    titleKey: 'invoice' as TranslationKey,
    shortTitleKey: 'short_invoice' as TranslationKey,
    href: '/invoice',
    icon: Receipt,
    featureId: 'invoice',
  },
  {
    titleKey: 'master_harga_kertas' as TranslationKey,
    shortTitleKey: 'short_h_kertas' as TranslationKey,
    href: '/master-harga-kertas',
    icon: ScrollText,
    featureId: 'master-harga-kertas',
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
      {/* Backdrop — only visible on lg+ (desktop sidebar) or when sidebar is explicitly opened on mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar — slide-in overlay on mobile, always visible on lg+ */}
      <div
        className={cn(
          "fixed left-0 top-0 z-50 h-screen w-16 flex flex-col items-center transition-transform duration-300 ease-in-out border-r",
          // On mobile: hidden by default, slides in when isOpen
          isOpen ? "translate-x-0" : "-translate-x-full",
          // On desktop (lg+): always visible
          "lg:translate-x-0"
        )}
        style={{ backgroundColor: '#1e40af', borderColor: 'rgba(255,255,255,0.12)' }}
      >
        {/* Close button - only on mobile */}
        <div className="flex justify-center pt-2 lg:hidden">
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg transition-colors" style={{ color: '#93c5fd' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden pb-4 space-y-0.5 w-full hide-scrollbar">
          {/* Logo - Icon Only */}
          <div className="flex flex-col items-center mb-3 mt-2">
            <img
              src={'/logo-ds.png'}
              alt="Logo"
              className="w-9 h-9 rounded-lg object-contain shadow-none"
            />
          </div>

          {menuWithAccess.map((item, idx) => {
            // Show section label if this item has a section and the previous visible item doesn't share the same section
            const prevSection = idx > 0 ? (menuWithAccess[idx - 1] as any).section : undefined
            const showSection = item.section && item.section !== prevSection

            return (
            <div key={item.href}>
              {showSection && (
                <div className="my-2 mx-2">
                  <div className="border-t" style={{ borderColor: 'rgba(255,255,255,0.3)', borderWidth: '0.1px' }}></div>
                </div>
              )}
              <Link
                href={item.href}
                onClick={() => {
                  startNavigation()
                  window.dispatchEvent(new CustomEvent('navigation-start'))
                  if (onToggle) onToggle()
                }}
                title={t(item.titleKey)}
                className={cn(
                  'flex items-center justify-center w-full py-2.5 rounded-lg transition-colors relative',
                  item.isPro ? 'opacity-60' : '',
                  isActive(item.href)
                    ? 'sidebar-active'
                    : 'hover:bg-white/10'
                )}
                style={isActive(item.href) ? { backgroundColor: 'rgba(255,255,255,0.15)', color: '#ffffff' } : { color: '#f1f5f9' }}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {item.isPro && (
                  <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                )}
              </Link>
            </div>
            )
          })}
        </nav>

        {/* Logout */}
        <div className="py-2 border-t w-full flex justify-center" style={{ borderColor: 'rgba(255,255,255,0.3)', borderWidth: '0.1px' }}>
          <button
            onClick={async () => {
              if (onLogout) {
                await onLogout()
              }
              router.push('/')
            }}
            title={t('keluar')}
            className="p-2 rounded-lg text-red-400 hover:bg-white/10 transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </>
  )
}

// ===== Mobile Bottom Navigation Bar =====
interface MobileBottomNavProps {
  role?: string
  onMoreClick: () => void
  username?: string
  onLogout?: () => void | Promise<void>
}

export function MobileBottomNav({ role, onMoreClick, username, onLogout }: MobileBottomNavProps) {
  const pathname = usePathname()
  const { t } = useLanguage()
  const [showPopup, setShowPopup] = useState(false)

  const isActive = (href: string) => {
    if (href === '/potong-kertas') return pathname === '/potong-kertas'
    if (href === '/pembukaan') return pathname === '/pembukaan'
    return pathname.startsWith(href)
  }

  // Check which bottom nav items are accessible
  const visibleItems = bottomNavItems.filter(item => {
    if (!role || role === 'superadmin') return true
    return hasFeatureAccess(role, item.featureId)
  })

  // All menu items accessible by role
  const allMenuItems = menuItems.filter(item => {
    if (!role || role === 'superadmin') return true
    return hasFeatureAccess(role, item.featureId)
  })

  // Group menu items by section
  const sectionOrder: { key: string | undefined; labelKey: TranslationKey }[] = [
    { key: undefined, labelKey: 'section_beranda' as TranslationKey },
    { key: 'hitung_biaya_produksi', labelKey: 'section_total_cost_calc' as TranslationKey },
    { key: 'dokumen', labelKey: 'section_documents' as TranslationKey },
    { key: 'biaya', labelKey: 'section_expenses' as TranslationKey },
    { key: 'biaya_produksi', labelKey: 'section_production_cost' as TranslationKey },
    { key: 'master_cetakan', labelKey: 'section_print_master' as TranslationKey },
    { key: 'administrasi', labelKey: 'section_administration' as TranslationKey },
    { key: 'setting', labelKey: 'section_setting' as TranslationKey },
  ]

  // Check if current page is one of the bottom nav items
  const isOnBottomNavPage = visibleItems.some(item => isActive(item.href))

  return (
    <>
      {/* Full-page menu popup */}
      {showPopup && (
        <div className="fixed inset-0 z-[60] lg:hidden" style={{ backgroundColor: '#1e40af' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-2.5">
              <img src="/logo-ds.png" alt="Logo" className="w-8 h-8 rounded-lg object-contain" />
              <span className="text-white font-extrabold text-base tracking-tight">darrellsoft.com</span>
            </div>
            <button
              onClick={() => setShowPopup(false)}
              className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Menu items */}
          <div className="overflow-y-auto px-4 pb-8 hide-scrollbar" style={{ maxHeight: 'calc(100vh - 56px)' }}>
            {sectionOrder.map((section) => {
              const sectionItems = allMenuItems.filter(item => item.section === section.key)
              if (sectionItems.length === 0) return null

              return (
                <div key={section.key ?? 'main'} className="mb-4">
                  {section.key && (
                    <div className="py-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-white/85">
                        {t(section.labelKey)}
                      </span>
                      <div className="mt-1" style={{ borderColor: 'rgba(255,255,255,0.2)', borderWidth: '0.1px' }} />
                    </div>
                  )}
                  <div className="grid grid-cols-4 gap-2">
                    {sectionItems.map((item) => {
                      const active = isActive(item.href)
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => {
                            startNavigation()
                            window.dispatchEvent(new CustomEvent('navigation-start'))
                            setShowPopup(false)
                          }}
                          className={cn(
                            'flex flex-col items-center justify-center gap-2 p-4 rounded-xl transition-colors',
                            active
                              ? 'bg-white/20 text-white'
                              : 'text-white hover:bg-white/15'
                          )}
                        >
                          <item.icon className="w-7 h-7" strokeWidth={active ? 2.5 : 2} />
                          <span className={cn('text-xs leading-tight text-center', active ? 'font-bold' : 'font-medium')}>
                            {t(item.titleKey)}
                          </span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Logout */}
            {username && onLogout && (
              <div className="mt-4 pt-3" style={{ borderColor: 'rgba(255,255,255,0.2)', borderWidth: '0.1px' }}>
                <button
                  onClick={async () => {
                    setShowPopup(false)
                    if (onLogout) await onLogout()
                  }}
                  className="flex items-center justify-center gap-2 w-full p-4 rounded-xl text-red-300 hover:bg-white/15 hover:text-red-200 transition-colors"
                >
                  <LogOut className="w-6 h-6" />
                  <span className="text-sm font-semibold">{t('keluar')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 lg:hidden border-t safe-area-bottom"
        style={{ backgroundColor: '#1e40af', borderColor: 'rgba(255,255,255,0.3)', borderWidth: '0.1px' }}
      >
        <div className="flex items-stretch h-14">
          {visibleItems.map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  startNavigation()
                  window.dispatchEvent(new CustomEvent('navigation-start'))
                }}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 h-full transition-colors',
                  active
                    ? 'text-white'
                    : 'text-blue-200/70'
                )}
              >
                <item.icon className={cn('w-5 h-5 flex-shrink-0', active && 'drop-shadow-sm')} strokeWidth={active ? 2.5 : 1.8} />
                <span className={cn('text-[10px] leading-tight truncate w-full text-center px-0.5', active ? 'font-bold' : 'font-medium')}>
                  {t(item.shortTitleKey)}
                </span>
              </Link>
            )
          })}

          {/* More button — opens full-page menu popup */}
          <button
            onClick={() => setShowPopup(true)}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 h-full transition-colors',
              !isOnBottomNavPage
                ? 'text-white'
                : 'text-blue-200/70'
            )}
          >
            <MoreHorizontal className={cn('w-5 h-5 flex-shrink-0', !isOnBottomNavPage && 'drop-shadow-sm')} strokeWidth={!isOnBottomNavPage ? 2.5 : 1.8} />
            <span className={cn('text-[9px] leading-tight', !isOnBottomNavPage ? 'font-bold' : 'font-medium')}>
              {t('lainnya')}
            </span>
          </button>
        </div>
      </nav>
    </>
  )
}

function formatDateIndo(dateStr: string | null | undefined, lang: 'id' | 'en' = 'id'): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString(lang === 'en' ? 'en-US' : 'id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function MobileHeader({ username, title, subtitle, userProfile }: { username?: string; title?: string; subtitle?: string; userProfile?: { createdAt: string | null; validUntil: string | null } | null }) {
  const { t, language } = useLanguage()

  return (
    <header className="px-3 py-3 lg:py-3 sticky top-0 z-30 border-b" style={{ backgroundColor: 'var(--app-banner-bg)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2 lg:gap-3">

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
        <div className="flex-shrink-0 md:hidden flex items-center gap-1">
          <span className="text-[11px] hidden sm:block" style={{ color: 'var(--app-banner-text-muted)' }}>
            {new Date().toLocaleDateString(language === 'en' ? 'en-US' : 'id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
          <LanguageToggle compact />
          <ThemeToggle className="h-8 w-8" />
        </div>
        {/* Desktop: full date + account info (visible on md+) */}
        <div className="hidden md:flex flex-col items-end justify-center gap-1 flex-shrink-0">
          <div className="flex items-center gap-2">
            <LanguageToggle compact />
            <ThemeToggle className="h-8 w-8" />
            <span className="text-[13px] font-semibold" style={{ color: 'var(--app-banner-text)' }}>
              {new Date().toLocaleDateString(language === 'en' ? 'en-US' : 'id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {userProfile?.createdAt && (
              <span className="text-[11px]" style={{ color: 'var(--app-banner-text-muted)' }}>{t('registered')} {formatDateIndo(userProfile.createdAt, language)}</span>
            )}
            {userProfile?.validUntil && (
              <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">{t('expired_label')} {formatDateIndo(userProfile.validUntil, language)}</span>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
