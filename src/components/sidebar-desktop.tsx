'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  Calculator,
  Scissors,
  Layers,
  Settings,
  Users,
  ShieldCheck,
  LogOut,
  Paintbrush,
  Receipt,
  Truck,
  ClipboardList,
  Store,
  Home,
  Wallet,
  UserCog,
  Banknote,
  Package,
  TrendingUp,
  PieChart,
  HandCoins,
  Coins,
  Printer,
  FileStack,
  Tags,
  PiggyBank,
} from 'lucide-react'
import { getAuthUser } from '@/lib/auth'
import { hasFeatureAccess } from '@/lib/permissions'
import { useLanguage } from '@/contexts/language-context'
import { TranslationKey } from '@/lib/i18n'
import { startNavigation } from '@/components/navigation-progress'
import { toast } from 'sonner'

// ===== Theme tokens — DS logo blue background =====
const SIDEBAR_BG = '#1e40af'
const SIDEBAR_BORDER = 'rgba(255,255,255,0.12)'

// Module-level cache for sidebar scroll position.
// Survives component re-mounts across route navigations so the sidebar
// doesn't jump back to the top when a menu item is clicked.
let savedSidebarScroll = 0

// Menu items with their feature IDs for permission checking
const menuItems = [
  {
    titleKey: 'pembukaan' as TranslationKey,
    href: '/pembukaan',
    icon: Home,
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
    icon: ClipboardList,
    featureId: 'purchase-order',
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
    titleKey: 'hutang_dagang' as TranslationKey,
    href: '/hutang-dagang',
    icon: HandCoins,
    featureId: 'hutang-dagang',
    section: 'laporan',
  },
  {
    titleKey: 'piutang_dagang' as TranslationKey,
    href: '/piutang-dagang',
    icon: Coins,
    featureId: 'piutang-dagang',
    section: 'laporan',
  },
  {
    titleKey: 'biaya_operasional' as TranslationKey,
    href: '/biaya-operasional',
    icon: Wallet,
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
    icon: Printer,
    featureId: 'hitung-ongkos-cetak',
    section: 'biaya_produksi',
  },
  {
    titleKey: 'hitung_harga_kertas' as TranslationKey,
    href: '/hitung-harga-kertas',
    icon: FileStack,
    featureId: 'hitung-harga-kertas',
    section: 'biaya_produksi',
  },
  {
    titleKey: 'master_harga_kertas' as TranslationKey,
    href: '/master-harga-kertas',
    icon: Tags,
    featureId: 'master-harga-kertas',
    section: 'master_cetakan',
  },
  {
    titleKey: 'master_ongkos_cetak' as TranslationKey,
    href: '/master-ongkos-cetak',
    icon: PiggyBank,
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
    icon: ShieldCheck,
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

// Section rendering order with their i18n label keys (using dedicated section_* keys for
// proper ID/EN translations of the UPPERCASE sidebar section headers).
const sectionOrder: { key: string | undefined; labelKey: TranslationKey }[] = [
  { key: undefined, labelKey: 'section_beranda' as TranslationKey },
  { key: 'hitung_biaya_produksi', labelKey: 'section_total_cost_calc' as TranslationKey },
  { key: 'dokumen', labelKey: 'section_documents' as TranslationKey },
  { key: 'laporan', labelKey: 'section_laporan' as TranslationKey },
  { key: 'biaya', labelKey: 'section_expenses' as TranslationKey },
  { key: 'biaya_produksi', labelKey: 'section_production_cost' as TranslationKey },
  { key: 'master_cetakan', labelKey: 'section_print_master' as TranslationKey },
  { key: 'administrasi', labelKey: 'section_administration' as TranslationKey },
  { key: 'setting', labelKey: 'section_setting' as TranslationKey },
]

interface SidebarProps {
  username?: string
  role?: string
  onLogout?: () => void | Promise<void>
  permVersion?: number
}

/**
 * Sidebar — Desktop-only, ICON-ONLY navigation rail.
 *
 * - Background: DS logo blue (`#1e40af`), tulisan terang.
 * - HANYA IKON (w-14). Saat kursor hover di atas sebuah ikon, NAMA menu
 *   muncul di sebelah kanan ikon (flyout) dengan tulisan putih terang.
 * - Flyout memakai position:fixed agar tidak terpotong overflow <nav>.
 * - Visible only on `lg:` and up (`hidden lg:flex`).
 * - Mobile continues to use the existing bottom nav (`MobileBottomNav`).
 */
export function Sidebar({ username, role, onLogout, permVersion: _permVersion }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useLanguage()
  const navRef = useRef<HTMLElement>(null)
  // Flyout = nama menu yang tampil di sebelah ikon saat kursor hover
  const [flyout, setFlyout] = useState<{ x: number; y: number; label: string } | null>(null)
  const showFlyout = (e: React.MouseEvent<HTMLElement>, label: string) => {
    const r = e.currentTarget.getBoundingClientRect()
    setFlyout({ x: r.right + 10, y: r.top + r.height / 2, label })
  }

  // Flag: while we are programmatically restoring scroll, ignore scroll
  // events so they don't overwrite the saved position with the transient 0
  // that Next.js' scroll-reset produces right after navigation.
  const isRestoringRef = useRef(false)

  // Restore sidebar scroll position on mount / route change.
  // Without this, clicking a menu item re-mounts the <nav> with scrollTop=0,
  // making the sidebar jump back to the top (Next.js resets scroll on nav).
  useEffect(() => {
    if (!navRef.current || savedSidebarScroll <= 0) return

    let cancelled = false
    const restore = () => {
      if (cancelled) return
      const nav = navRef.current
      if (!nav) return
      // Only restore once the nav is tall enough to hold the saved offset
      // (menu items may render async and grow the scrollHeight).
      if (nav.scrollHeight >= savedSidebarScroll) {
        isRestoringRef.current = true
        nav.scrollTop = savedSidebarScroll
        // Release the guard on the next frame so subsequent user scrolls are tracked again
        requestAnimationFrame(() => { isRestoringRef.current = false })
      }
    }
    // Schedule restores across several frames to win the race against
    // browser/Next.js scroll reset and async menu rendering.
    const rafs: number[] = []
    for (let i = 0; i < 6; i++) {
      rafs.push(requestAnimationFrame(restore))
    }
    const t1 = window.setTimeout(restore, 50)
    const t2 = window.setTimeout(restore, 150)
    const t3 = window.setTimeout(restore, 300)

    return () => {
      cancelled = true
      isRestoringRef.current = false
      rafs.forEach((r) => cancelAnimationFrame(r))
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
    }
  }, [pathname])

  // Continuously track scroll position so it's always up-to-date when a
  // navigation happens (navigations can occur between scroll events).
  // Ignore scroll events that we triggered ourselves during restore.
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const handleScroll = () => {
      if (isRestoringRef.current) return
      savedSidebarScroll = nav.scrollTop
    }
    nav.addEventListener('scroll', handleScroll, { passive: true })
    return () => nav.removeEventListener('scroll', handleScroll)
  }, [])

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
      className="hidden lg:flex fixed left-0 top-0 z-40 h-screen w-14 flex-col print:hidden"
      style={{ backgroundColor: SIDEBAR_BG, borderRight: `1px solid ${SIDEBAR_BORDER}` }}
    >
      {/* ===== Header / Branding ===== */}
      <div
        className="flex h-14 items-center justify-center px-2"
        style={{ borderBottom: `1px solid ${SIDEBAR_BORDER}` }}
      >
        <Link
          href="/pembukaan"
          onClick={() => {
            startNavigation()
            window.dispatchEvent(new CustomEvent('navigation-start'))
          }}
          title={t('app_name')}
        >
          <img
            src="/logo-ds.png"
            alt="Logo"
            className="h-8 w-8 shrink-0 rounded-lg object-contain"
          />
        </Link>
      </div>

      {/* ===== Navigation ===== */}
      <nav ref={navRef} className="flex-1 overflow-y-auto overflow-x-hidden py-3 hide-scrollbar">
        {sectionOrder.map((section) => {
          const sectionItems = menuWithAccess.filter((item) => item.section === section.key)
          if (sectionItems.length === 0) return null

          return (
            <div key={section.key ?? 'main'} className="mb-1">
              {/* Divider antar section (label teks tidak tampil — rail icon-only) */}
              {section.key && (
                <div className="my-2 mx-3" style={{ borderTop: `1px solid ${SIDEBAR_BORDER}` }} />
              )}

              <ul className="flex flex-col items-center space-y-0.5 px-1">
                {sectionItems.map((item) => {
                  const active = isActive(item.href)
                  return (
                    <li key={item.href}>
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
                        }}
                        aria-label={t(item.titleKey)}
                        onMouseEnter={(e) => showFlyout(e, t(item.titleKey))}
                        onMouseLeave={() => setFlyout(null)}
                        className={cn(
                          // Icon-only: kotak rapat di sekeliling ikon; nama muncul via flyout saat hover
                          'flex w-fit items-center justify-center rounded-lg px-2 py-2.5 text-sm transition-colors relative',
                          item.isPro ? 'opacity-60 cursor-not-allowed' : '',
                          active
                            ? 'bg-white/15 font-medium text-white'
                            : 'text-blue-100 hover:bg-white/10 hover:text-white'
                        )}
                      >
                        <item.icon className="h-5 w-5 shrink-0" />
                        {item.isPro && (
                          <span className="absolute top-0 right-0 text-[8px] font-black leading-none px-1 py-0.5 rounded-sm bg-amber-500 text-white shadow">
                            PRO
                          </span>
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
        className="py-3"
        style={{ borderTop: `1px solid ${SIDEBAR_BORDER}` }}
      >
        <div className="flex flex-col items-center space-y-0.5 px-1">
          {/* Logout */}
          <button
            onClick={handleLogout}
            aria-label={t('keluar')}
            onMouseEnter={(e) => showFlyout(e, t('keluar'))}
            onMouseLeave={() => setFlyout(null)}
            className="flex w-fit items-center justify-center rounded-lg px-2 py-2.5 text-sm text-blue-100 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-5 w-5 shrink-0" />
          </button>
        </div>
      </div>

      {/* ===== Flyout nama menu — muncul di kanan ikon saat hover, tulisan putih terang ===== */}
      {flyout && (
        <div
          className="pointer-events-none fixed z-[70] -translate-y-1/2 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-semibold text-white shadow-xl ring-1 ring-white/25"
          style={{ left: flyout.x, top: flyout.y, backgroundColor: 'rgba(15,23,42,0.95)' }}
        >
          {flyout.label}
        </div>
      )}
    </aside>
  )
}
