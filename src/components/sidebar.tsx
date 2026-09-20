'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { ThemeToggle } from './theme-toggle'
import { LanguageToggle } from './language-toggle'
import { NotificationBell } from './notification-bell'
import { toast } from 'sonner'
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
  Home,
  MoreHorizontal,
  Wallet,
  ScrollText,
  UserCog,
  Banknote,
  Package,
  TrendingUp,
  PieChart,
  HandCoins,
  Coins,
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
    titleKey: 'riwayat_pembayaran' as TranslationKey,
    href: '/riwayat-pembayaran',
    icon: Banknote,
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
    titleKey: 'hutang_dagang' as TranslationKey,
    href: '/hutang-dagang',
    icon: HandCoins,
    featureId: 'hutang-dagang',
    section: 'dokumen',
  },
  {
    titleKey: 'piutang_dagang' as TranslationKey,
    href: '/piutang-dagang',
    icon: Coins,
    featureId: 'piutang-dagang',
    section: 'dokumen',
  },
  {
    titleKey: 'master_customer' as TranslationKey,
    href: '/master-customer',
    icon: Users,
    featureId: 'master-customer',
    section: 'dokumen',
  },
  {
    titleKey: 'master_barang' as TranslationKey,
    href: '/master-barang',
    icon: Package,
    featureId: 'master-barang',
    section: 'dokumen',
  },
  {
    titleKey: 'laporan_penjualan' as TranslationKey,
    href: '/laporan/penjualan',
    icon: TrendingUp,
    featureId: 'laporan',
    section: 'laporan',
  },
  {
    titleKey: 'laporan_rugi_laba' as TranslationKey,
    href: '/laporan/rugi-laba',
    icon: PieChart,
    featureId: 'laporan',
    section: 'laporan',
  },
  {
    titleKey: 'biaya_operasional' as TranslationKey,
    href: '/biaya-operasional',
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
    if (href === '/pembukaan') {
      return pathname === '/pembukaan'
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
                onClick={(e) => {
                  if (item.isPro) {
                    e.preventDefault()
                    toast.error(t('pro_feature_locked'))
                    return
                  }
                  startNavigation()
                  window.dispatchEvent(new CustomEvent('navigation-start'))
                  if (onToggle) onToggle()
                }}
                title={t(item.titleKey)}
                className={cn(
                  'flex items-center justify-center w-full py-2.5 rounded-lg transition-colors relative',
                  item.isPro ? 'opacity-60 cursor-not-allowed' : '',
                  isActive(item.href)
                    ? 'sidebar-active'
                    : 'hover:bg-white/10'
                )}
                style={isActive(item.href) ? { backgroundColor: 'rgba(255,255,255,0.15)', color: '#ffffff' } : { color: '#f1f5f9' }}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {item.isPro && (
                  <span className="absolute top-0 right-0 text-[8px] font-black leading-none px-1 py-0.5 rounded-sm bg-amber-500 text-white shadow">
                    PRO
                  </span>
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

  // Bottom nav items — show all, but mark locked ones with PRO badge.
  // Locked items appear in the bar (visible) but clicking shows a toast instead of navigating.
  // This mirrors the desktop sidebar & "Lainnya" popup behavior so PRO features are discoverable.
  const visibleItems = bottomNavItems.map(item => {
    if (!role || role === 'superadmin') return { ...item, isPro: false }
    const accessible = hasFeatureAccess(role, item.featureId)
    return { ...item, isPro: !accessible }
  })

  // All menu items for the "Lainnya" popup — mirror desktop sidebar behavior:
  // - hak-akses & pengguna: HIDDEN if not allowed
  // - other features: show with PRO badge if not allowed (visible but locked)
  const HIDDEN_WHEN_DENIED = ['hak-akses', 'pengguna']
  const allMenuItems = menuItems
    .map(item => {
      if (!role || role === 'superadmin') return { ...item, isPro: false }
      const accessible = hasFeatureAccess(role, item.featureId)
      return { ...item, isPro: !accessible }
    })
    .filter(item => !item.isPro || !HIDDEN_WHEN_DENIED.includes(item.featureId))

  // Group menu items by section — digabung agar seluruh menu muat 1 layar mobile
  const popupGroups: { key: string; labelKey?: TranslationKey; sections: (string | undefined)[] }[] = [
    { key: 'main', sections: [undefined] },
    { key: 'hitung', labelKey: 'section_total_cost_calc' as TranslationKey, sections: ['hitung_biaya_produksi'] },
    { key: 'dokumen', labelKey: 'section_documents' as TranslationKey, sections: ['dokumen'] },
    { key: 'laporan', labelKey: 'section_laporan' as TranslationKey, sections: ['laporan'] },
    { key: 'biaya', labelKey: 'section_biaya' as TranslationKey, sections: ['biaya', 'biaya_produksi'] },
    { key: 'master', labelKey: 'section_print_master' as TranslationKey, sections: ['master_cetakan'] },
    { key: 'admin', labelKey: 'section_administration' as TranslationKey, sections: ['administrasi', 'setting'] },
  ]

  // Check if current page is one of the bottom nav items
  const isOnBottomNavPage = visibleItems.some(item => isActive(item.href))

  return (
    <>
      {/* Full-page menu popup — compact, fit 1 layar mobile */}
      {showPopup && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="fixed inset-0 z-[60] lg:hidden flex flex-col"
          style={{ backgroundColor: '#1e40af' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-12 flex-shrink-0">
            <div className="flex items-center gap-2">
              <img src="/logo-ds.png" alt="Logo" className="w-7 h-7 rounded-lg object-contain" />
              <span className="text-white font-extrabold text-[15px] tracking-tight">darrellsoft.com</span>
            </div>
            <button
              onClick={() => setShowPopup(false)}
              aria-label="Tutup menu"
              className="p-2 -mr-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Menu items — grid padat, semua section muat dalam 1 layar tanpa scroll */}
          <div
            className="flex-1 overflow-y-auto px-3 pt-1 pb-[max(10px,env(safe-area-inset-bottom))] hide-scrollbar"
            style={{ maxHeight: 'calc(100dvh - 48px)' }}
          >
            {popupGroups.map((group) => {
              const sectionItems = allMenuItems.filter(item => group.sections.includes(item.section))
              if (sectionItems.length === 0) return null

              return (
                <div key={group.key} className="mb-1.5 [@media(max-height:700px)]:mb-1">
                  {group.labelKey && (
                    <div
                      className="pb-[3px] mb-1 border-b [@media(max-height:700px)]:mb-0.5"
                      style={{ borderColor: 'rgba(255,255,255,0.22)', borderWidth: '0.1px' }}
                    >
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-white/80 leading-none">
                        {t(group.labelKey!)}
                      </span>
                    </div>
                  )}
                  <div className="grid grid-cols-4 gap-1">
                    {sectionItems.map((item) => {
                      const active = isActive(item.href)
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          onClick={(e) => {
                            if (item.isPro) {
                              e.preventDefault()
                              toast.error(t('pro_feature_locked'))
                              return
                            }
                            startNavigation()
                            window.dispatchEvent(new CustomEvent('navigation-start'))
                            setShowPopup(false)
                          }}
                          className={cn(
                            // Cell padat: min 44px touch target, membesar halus di layar tinggi (≥800px)
                            'relative flex flex-col items-center justify-center gap-0.5 min-h-[44px] px-0.5 py-1 rounded-lg transition-colors',
                            '[@media(max-height:700px)]:py-0.5',
                            '[&>svg]:w-[18px] [&>svg]:h-[18px]',
                            '[@media(min-height:800px)]:min-h-[48px] [@media(min-height:800px)]:py-1.5 [@media(min-height:800px)]:gap-1',
                            item.isPro ? 'opacity-60 cursor-not-allowed' : '',
                            active
                              ? 'bg-white/20 text-white'
                              : 'text-white hover:bg-white/15'
                          )}
                        >
                          <item.icon strokeWidth={active ? 2.4 : 2} />
                          <span
                            className={cn(
                              'text-[9px] leading-[1.2] text-center font-medium line-clamp-2',
                              '[@media(max-height:700px)]:leading-[1.1]',
                              '[@media(min-height:800px)]:text-[10px]',
                              active && 'font-bold'
                            )}
                          >
                            {t(item.titleKey)}
                          </span>
                          {item.isPro && (
                            <span className="absolute top-0.5 right-0.5 text-[7px] font-black leading-none px-[3px] py-px rounded-sm bg-amber-500 text-white shadow">
                              PRO
                            </span>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Logout — compact */}
            {username && onLogout && (
              <div
                className="mt-1 pt-1.5"
                style={{ borderColor: 'rgba(255,255,255,0.22)', borderWidth: '0.1px', borderTopWidth: '0.1px' }}
              >
                <button
                  onClick={async () => {
                    setShowPopup(false)
                    if (onLogout) await onLogout()
                  }}
                  className="flex items-center justify-center gap-1.5 w-full min-h-[36px] py-1.5 rounded-lg text-red-300 hover:bg-white/15 hover:text-red-200 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-xs font-semibold">{t('keluar')}</span>
                </button>
              </div>
            )}
          </div>
        </motion.div>
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
                onClick={(e) => {
                  if (item.isPro) {
                    e.preventDefault()
                    toast.error(t('pro_feature_locked'))
                    return
                  }
                  startNavigation()
                  window.dispatchEvent(new CustomEvent('navigation-start'))
                }}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 h-full transition-colors',
                  item.isPro ? 'opacity-70' : '',
                  active
                    ? 'text-white'
                    : 'text-blue-200/70'
                )}
              >
                <item.icon className={cn('w-5 h-5 flex-shrink-0', active && 'drop-shadow-sm')} strokeWidth={active ? 2.5 : 1.8} />
                <span className={cn('text-[10px] leading-tight truncate w-full text-center px-0.5', active ? 'font-bold' : 'font-medium')}>
                  {t(item.shortTitleKey)}
                </span>
                {item.isPro && (
                  <span className="absolute top-0.5 right-1 text-[7px] font-black leading-none px-0.5 py-0.5 rounded-sm bg-amber-500 text-white shadow">
                    PRO
                  </span>
                )}
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

export function MobileHeader({ username, role, title, subtitle, userProfile }: { username?: string; role?: string; title?: string; subtitle?: string; userProfile?: { createdAt: string | null; validUntil: string | null } | null }) {
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
          <NotificationBell role={role} />
          <LanguageToggle compact />
          <ThemeToggle className="h-8 w-8" />
        </div>
        {/* Desktop: full date + account info (visible on md+) */}
        <div className="hidden md:flex flex-col items-end justify-center gap-1 flex-shrink-0">
          <div className="flex items-center gap-2">
            <NotificationBell role={role} />
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
