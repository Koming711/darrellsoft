'use client'

// AdminSidebar — pola AdminSidebar Rajamesin (src/components/gomesin/admin-sidebar.tsx):
// sidebar bg-card + header logo, menu aktif SOLID + badge jumlah, seksi Sistem setelah
// divider, footer keluar; di MOBILE menjadi drawer slide-in dengan overlay.
// Menu & data disesuaikan dengan konten yang ada (panel admin langganan Darrellsoft).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  LayoutDashboard,
  Users,
  Crown,
  UserPlus,
  Receipt,
  FileText,
  Settings,
  ShieldCheck,
  ExternalLink,
  X,
  Building2,
  KeyRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAuthUser } from '@/lib/auth'
import { useAdminCountsStore } from '@/stores/admin-counts-store'

export type AdminTab =
  | 'beranda'
  | 'pelanggan'
  | 'paket'
  | 'pembayaran'
  | 'pengaturan'
  | 'transaksi'
  | 'grup'
  | 'laporan'
  | 'pengaturan-akun'
  | 'hak-akses'

const ADMIN_MENU: { tab: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { tab: 'beranda', label: 'Beranda Admin', icon: LayoutDashboard },
  // PERMINTAAN USER (dipulihkan): menu "Pengguna" KEMBALI ke sidebar. Tab 'pelanggan'
  // (Kelola Pengguna) memang tidak pernah dihapus — deep-link/redirect lama
  // (?tab=pelanggan) tetap berfungsi. Seksi pembayaran = "Pendaftar Baru",
  // Pengaturan (metode pembayaran) tetap menu sidebar tersendiri.
  { tab: 'pelanggan', label: 'Pengguna', icon: Users },
  { tab: 'paket', label: 'Paket', icon: Crown },
  { tab: 'pembayaran', label: 'Pendaftar Baru', icon: UserPlus },
  { tab: 'grup', label: 'Manajemen Grup', icon: Building2 },
  { tab: 'pengaturan', label: 'Pengaturan', icon: Settings },
  { tab: 'transaksi', label: 'Transaksi', icon: Receipt },
  { tab: 'laporan', label: 'Laporan', icon: FileText },
]

// Seksi Sistem (setelah divider — pola sub menu Rajamesin).
// PERMINTAAN USER: menu "Sistem" DIHAPUS — sub-tab "Pengguna" dihapus dan
// "Pengaturan Akun" DIPINDAH menjadi menu sidebar tersendiri (sejajar "Hak Akses").
const ADMIN_MENU_SISTEM: { tab: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { tab: 'pengaturan-akun', label: 'Pengaturan Akun', icon: Settings },
  { tab: 'hak-akses', label: 'Hak Akses', icon: KeyRound },
]

/**
 * Badge jumlah pendaftar BARU yang BELUM dilihat admin (pola Rajamesin: sidebar mem-fetch
 * data untuk hitungan). Sumber: /api/panel-admin/subscription-stats (field pembayaranBelumDilihat)
 * via useAdminCountsStore — polling 30s sebagai pengaman lintas perangkat.
 * PERMINTAAN USER: begitu halaman Pendaftar Baru dibuka (antrean ditandai sudah dilihat),
 * angka badge LANGSUNG hilang — store dibagikan dengan konten verifikasi, jadi pembaruan
 * tidak menunggu polling. Pendaftar baru berikutnya membuat badge muncul lagi.
 */
function useAdminCounts() {
  const pembayaranBelumDilihat = useAdminCountsStore((s) => s.pembayaranBelumDilihat)
  const refresh = useAdminCountsStore((s) => s.refresh)

  useEffect(() => {
    void refresh()
    const iv = setInterval(() => void refresh(), 30_000)
    return () => clearInterval(iv)
  }, [refresh])

  return { pembayaran: pembayaranBelumDilihat }
}

export function AdminSidebar({
  open,
  onClose,
  active,
  onNavigate,
}: {
  open: boolean
  onClose: () => void
  active: AdminTab
  onNavigate: (tab: AdminTab) => void
}) {
  const counts = useAdminCounts()
  const [role, setRole] = useState('')

  useEffect(() => {
    setRole(getAuthUser()?.role ?? '')
  }, [])

  const renderItem = (item: (typeof ADMIN_MENU)[number]) => {
    const isActive = active === item.tab
    // Badge: hanya Pendaftar Baru — jumlah pendaftar yang BELUM dilihat admin.
    // Hilang otomatis begitu halaman dibuka (mark-seen → store diperbarui konten).
    const count = item.tab === 'pembayaran' ? counts?.pembayaran : undefined
    return (
      <button
        key={item.tab}
        type="button"
        onClick={() => onNavigate(item.tab)}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
          isActive
            ? 'bg-emerald-600 text-white shadow-sm'
            : 'text-muted-foreground hover:bg-slate-100 hover:text-foreground dark:hover:bg-slate-800/60 dark:hover:text-slate-200',
        )}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{item.label}</span>
        {typeof count === 'number' && count > 0 && (
          <span
            className={cn(
              'ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold leading-none',
              isActive ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
            )}
          >
            {count}
          </span>
        )}
      </button>
    )
  }

  return (
    <>
      {/* Overlay mobile — pola Rajamesin */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} aria-hidden="true" />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full w-64 flex-col border-r border-border bg-card transition-transform duration-300',
          'lg:sticky lg:top-0 lg:z-30 lg:h-screen lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Menu panel admin"
      >
        {/* Header mobile */}
        <div className="flex items-center justify-between border-b border-border p-4 lg:hidden">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <span className="text-sm font-bold">Panel Admin Langganan</span>
          </div>
          <button onClick={onClose} aria-label="Tutup menu panel admin" className="rounded-md p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Header desktop */}
        <div className="hidden border-b border-border p-4 lg:block">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-600">
              <ShieldCheck className="h-4 w-4 text-white" />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-bold">Panel Admin Langganan</p>
              <p className="truncate text-[10px] capitalize text-muted-foreground">{role || 'admin'}</p>
            </div>
          </div>
        </div>

        {/* Menu */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {ADMIN_MENU.map(renderItem)}

          <div className="my-2 border-t border-border" />

          {ADMIN_MENU_SISTEM.map(renderItem)}
        </nav>

        {/* Footer — keluar dari panel (pola "Exit" Rajamesin) */}
        <div className="border-t border-border p-3">
          <Link
            href="/pembukaan"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-slate-100 hover:text-foreground dark:hover:bg-slate-800/60 dark:hover:text-slate-200"
          >
            <ExternalLink className="h-4 w-4 shrink-0" />
            Kembali ke Aplikasi
          </Link>
        </div>
      </aside>
    </>
  )
}
