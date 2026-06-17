'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Calculator,
  Scissors,
  FileText,
  DollarSign,
  Layers,
  Settings,
  Users,
  Shield,
  LogOut,
  Paintbrush,
  Receipt,
  Truck,
  ShoppingCart,
  BookOpen,
  Store,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { getAuthUser } from '@/lib/auth'
import { hasFeatureAccess } from '@/lib/permissions'
import { useLanguage } from '@/contexts/language-context'
import { TranslationKey } from '@/lib/i18n'
import { startNavigation } from '@/components/navigation-progress'
import { useSidebarCollapse } from '@/hooks/use-sidebar-collapse'

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

// Section rendering order with their i18n label keys
const sectionOrder: { key: string | undefined; labelKey: TranslationKey }[] = [
  { key: undefined, labelKey: 'pembukaan' as TranslationKey },
  { key: 'hitung_biaya_produksi', labelKey: 'hitung_biaya_produksi' as TranslationKey },
  { key: 'dokumen', labelKey: 'dokumen' as TranslationKey },
  { key: 'biaya_produksi', labelKey: 'biaya_produksi' as TranslationKey },
  { key: 'master_cetakan', labelKey: 'master_cetakan' as TranslationKey },
  { key: 'administrasi', labelKey: 'administrasi' as TranslationKey },
  { key: 'setting', labelKey: 'setting' as TranslationKey },
]

interface SidebarProps {
  username?: string
  role?: string
  onLogout?: () => void | Promise<void>
  permVersion?: number
}

/**
 * Sidebar — Desktop-only collapsible navigation.
 *
 * Design reference: extracted `sidebar.tsx` (white background, emerald accent,
 * expand/collapse to icon-only). Adapted to this app's menu, permissions,
 * routing and i18n.
 *
 * - Visible only on `lg:` and up (`hidden lg:flex`).
 * - Expanded width: `w-64` (with labels). Collapsed width: `w-16` (icon only).
 * - Collapse state persists in localStorage via `useSidebarCollapse`.
 * - Mobile continues to use the existing bottom nav (`MobileBottomNav`).
 */
export function Sidebar({ username, role, onLogout, permVersion: _permVersion }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useLanguage()
  const { collapsed, toggle } = useSidebarCollapse()

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
    .map((item) => {
      if (!role || role === 'superadmin') return { ...item, isPro: false }
      const accessible = hasFeatureAccess(role, item.featureId)
      return { ...item, isPro: !accessible }
    })
    .filter((item) => !item.isPro || !HIDDEN_WHEN_DENIED.includes(item.featureId))

  const handleLogout = async () => {
    if (onLogout) {
      await onLogout()
    }
    router.push('/')
  }

  return (
    <aside
      className={cn(
        'hidden lg:flex fixed left-0 top-0 z-40 h-screen flex-col border-r bg-white transition-all duration-300 ease-in-out print:hidden',
        collapsed ? 'w-16' : 'w-64'
      )}
      style={{ borderColor: 'var(--border)' }}
    >
      {/* ===== Header / Branding ===== */}
      <div
        className={cn(
          'flex h-14 items-center border-b transition-all duration-300',
          collapsed ? 'justify-center px-2' : 'justify-between px-4'
        )}
        style={{ borderColor: 'var(--border)' }}
      >
        <Link
          href="/pembukaan"
          onClick={() => {
            startNavigation()
            window.dispatchEvent(new CustomEvent('navigation-start'))
          }}
          className={cn(
            'flex items-center overflow-hidden transition-all duration-300',
            collapsed ? 'gap-0' : 'gap-2.5'
          )}
          title={t('app_name')}
        >
          <img
            src="/logo-ds.png"
            alt="Logo"
            className="h-8 w-8 shrink-0 rounded-lg object-contain"
          />
          <span
            className={cn(
              'whitespace-nowrap text-base font-bold text-gray-900 transition-all duration-300',
              collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
            )}
          >
            {t('app_name')}
          </span>
        </Link>
      </div>

      {/* ===== Navigation ===== */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3 hide-scrollbar">
        {sectionOrder.map((section) => {
          const sectionItems = menuWithAccess.filter((item) => item.section === section.key)
          if (sectionItems.length === 0) return null

          return (
            <div key={section.key ?? 'main'} className="mb-1">
              {/* Section label — hidden when collapsed */}
              <p
                className={cn(
                  'mb-1 overflow-hidden px-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400 transition-all duration-300',
                  collapsed ? 'h-0 opacity-0' : 'h-auto py-1.5 opacity-100'
                )}
              >
                {section.key ? t(section.labelKey) : t('pembukaan')}
              </p>

              {/* Collapsed divider */}
              {collapsed && section.key && (
                <div className="my-2 mx-2 border-t" style={{ borderColor: 'var(--border)' }} />
              )}

              <ul className="space-y-0.5">
                {sectionItems.map((item) => {
                  const active = isActive(item.href)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => {
                          startNavigation()
                          window.dispatchEvent(new CustomEvent('navigation-start'))
                        }}
                        title={collapsed ? t(item.titleKey) : undefined}
                        className={cn(
                          'flex w-full items-center rounded-lg text-sm transition-colors relative',
                          collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                          item.isPro ? 'opacity-60' : '',
                          active
                            ? 'bg-emerald-50 font-medium text-emerald-700'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        )}
                      >
                        <item.icon className="h-5 w-5 shrink-0" />
                        <span
                          className={cn(
                            'whitespace-nowrap overflow-hidden transition-all duration-300',
                            collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
                          )}
                        >
                          {t(item.titleKey)}
                        </span>
                        {item.isPro && (
                          <span
                            className={cn(
                              'absolute rounded-full bg-amber-500',
                              collapsed ? 'top-1 right-1.5 h-1.5 w-1.5' : 'top-2 right-2 h-1.5 w-1.5'
                            )}
                          />
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>

      {/* ===== Bottom: Logout + Collapse toggle ===== */}
      <div
        className="border-t px-2 py-3"
        style={{ borderColor: 'var(--border)' }}
      >
        {/* Logout */}
        <button
          onClick={handleLogout}
          title={t('keluar')}
          className={cn(
            'flex w-full items-center rounded-lg text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900',
            collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
          )}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span
            className={cn(
              'whitespace-nowrap overflow-hidden transition-all duration-300',
              collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
            )}
          >
            {t('keluar')}
          </span>
        </button>

        {/* Collapse / Expand toggle — desktop only */}
        <button
          onClick={toggle}
          aria-label={collapsed ? 'Perbesar sidebar' : 'Perkecil sidebar'}
          title={collapsed ? 'Perbesar sidebar' : 'Perkecil sidebar'}
          className={cn(
            'mt-1 flex w-full items-center rounded-lg text-sm text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700',
            collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5 shrink-0" />
          ) : (
            <ChevronLeft className="h-5 w-5 shrink-0" />
          )}
          <span
            className={cn(
              'whitespace-nowrap overflow-hidden transition-all duration-300',
              collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
            )}
          >
            Perkecil
          </span>
        </button>
      </div>
    </aside>
  )
}
