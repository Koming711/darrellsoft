'use client'

// AdminPanel — panel admin SATU HALAMAN, pola AdminView Rajamesin:
// semua seksi hidup dalam satu route (/panel-admin), navigasi via state URL
// ?tab=<seksi>&sub=<sub-tab> agar deep-link tetap bisa dibagikan.
// Konten = komponen lama yang sudah ada (tidak ditulis ulang) — sesuai
// permintaan "ganti panel admin … dan sesuaikan dengan conten yang ada".

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Menu,
  UserPlus,
  UserCheck,
  Clock,
  UserX,
  CreditCard,
  ShieldCheck,
  Wallet,
  BarChart3,
  Receipt,
  ScrollText,
  Users2,
  KeyRound,
  Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { HubTabs, type HubTab } from './hub-tabs'
import { AdminSidebar, type AdminTab } from './admin-sidebar'
import { BerandaContent } from './beranda-content'
import { KelolaPelangganContent } from './kelola-pelanggan/content'
import { AkunListPage } from './akun-list'
import { KelolaPaketContent } from './kelola-paket/content'
import { VerifikasiPembayaranContent } from './verifikasi-pembayaran/content'
import { PengaturanPembayaranContent } from './pengaturan-pembayaran/content'
import { RiwayatTransaksiContent } from './riwayat-transaksi/content'
import { LaporanBulananContent } from './laporan-bulanan/content'
import { RiwayatPenjualanContent } from './riwayat-penjualan/content'
import { LaporanAuditContent } from './laporan-audit/content'
import { PenggunaContent } from '@/app/administrasi/pengguna/page'
import { HakAksesContent } from '@/app/administrasi/hak-akses/page'
import { PengaturanAkunContent } from './pengaturan/content'

interface SectionDef {
  title: string
  desc: string
  /** Sub-tab (pola HubTabs lama — dipertahankan persis) */
  subs?: HubTab[]
}

const SECTIONS: Record<AdminTab, SectionDef> = {
  beranda: {
    title: 'Beranda Admin',
    desc: 'Kondisi langganan & pendapatan Darrellsoft.',
  },
  pelanggan: {
    title: 'Pelanggan',
    desc: 'Kelola langganan & daftar akun pelanggan.',
    subs: [
      { key: 'langganan', label: 'Langganan', icon: CreditCard },
      { key: 'baru', label: 'Baru', icon: UserPlus },
      { key: 'aktif', label: 'Aktif', icon: UserCheck },
      { key: 'expired', label: 'Expired', icon: Clock },
      { key: 'ditolak', label: 'Ditolak', icon: UserX },
    ],
  },
  paket: {
    title: 'Paket',
    desc: 'CRUD paket langganan & perincian fitur.',
  },
  pembayaran: {
    title: 'Pembayaran',
    desc: 'Verifikasi pembayaran manual & metode pembayaran.',
    subs: [
      { key: 'verifikasi', label: 'Verifikasi', icon: ShieldCheck },
      { key: 'pengaturan', label: 'Pengaturan', icon: Wallet },
    ],
  },
  transaksi: {
    title: 'Transaksi',
    desc: 'Riwayat pembayaran langganan semua pelanggan.',
  },
  laporan: {
    title: 'Laporan',
    desc: 'Rekap bulanan, penjualan, dan audit.',
    subs: [
      { key: 'bulanan', label: 'Bulanan', icon: BarChart3 },
      { key: 'penjualan', label: 'Penjualan', icon: Receipt },
      { key: 'audit', label: 'Audit', icon: ScrollText },
    ],
  },
  sistem: {
    title: 'Sistem',
    desc: 'Pengguna, hak akses, dan pengaturan akun.',
    subs: [
      { key: 'pengguna', label: 'Pengguna', icon: Users2 },
      { key: 'hak-akses', label: 'Hak Akses', icon: KeyRound },
      { key: 'akun', label: 'Pengaturan Akun', icon: Settings },
    ],
  },
}

function AdminPanelInner() {
  const router = useRouter()
  const params = useSearchParams()
  const rawTab = params.get('tab') || 'beranda'
  const tab: AdminTab = rawTab in SECTIONS ? (rawTab as AdminTab) : 'beranda'
  const rawSub = params.get('sub') || ''
  const subs = SECTIONS[tab].subs
  const activeSub = subs?.some((s) => s.key === rawSub) ? rawSub : subs?.[0]?.key || ''

  const [drawerOpen, setDrawerOpen] = useState(false)

  const navigate = (t: AdminTab, sub?: string) => {
    const q = sub ? `?tab=${t}&sub=${sub}` : `?tab=${t}`
    router.replace(`/panel-admin${q}`, { scroll: false })
  }

  const renderContent = () => {
    switch (tab) {
      case 'beranda':
        return <BerandaContent />
      case 'pelanggan':
        // TANPA baris sub-tab di atas konten (permintaan user: hapus tulisan
        // Langganan/Baru/Aktif/Expired/Ditolak di atas judul "Kelola Pelanggan").
        // Sub tetap bisa diakses via deep-link ?sub= dan kartu ringkasan di
        // AkunListPage; daftar akun juga terjangkau dari Sistem › Pengaturan Akun.
        return (
          <>
            {activeSub === 'langganan' && <KelolaPelangganContent />}
            {activeSub === 'baru' && <AkunListPage kategori="baru" />}
            {activeSub === 'aktif' && <AkunListPage kategori="aktif" />}
            {activeSub === 'expired' && <AkunListPage kategori="expired" />}
            {activeSub === 'ditolak' && <AkunListPage kategori="ditolak" />}
          </>
        )
      case 'paket':
        return <KelolaPaketContent />
      case 'pembayaran':
        return (
          <>
            <HubTabs tabs={SECTIONS.pembayaran.subs!} param="sub" />
            {activeSub === 'verifikasi' && <VerifikasiPembayaranContent />}
            {activeSub === 'pengaturan' && <PengaturanPembayaranContent />}
          </>
        )
      case 'transaksi':
        return <RiwayatTransaksiContent />
      case 'laporan':
        return (
          <>
            <HubTabs tabs={SECTIONS.laporan.subs!} param="sub" />
            {activeSub === 'bulanan' && <LaporanBulananContent />}
            {activeSub === 'penjualan' && <RiwayatPenjualanContent />}
            {activeSub === 'audit' && <LaporanAuditContent />}
          </>
        )
      case 'sistem':
        return (
          <>
            <HubTabs tabs={SECTIONS.sistem.subs!} param="sub" />
            {activeSub === 'pengguna' && <PenggunaContent />}
            {activeSub === 'hak-akses' && <HakAksesContent />}
            {activeSub === 'akun' && <PengaturanAkunContent />}
          </>
        )
    }
  }

  return (
    <>
      <AdminSidebar
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        active={tab}
        onNavigate={(t) => {
          setDrawerOpen(false)
          navigate(t)
        }}
      />

      {/* Kolom konten */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Bar atas MOBILE — hamburger drawer (desktop: cukup sidebar) */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-white px-3 shadow-sm dark:bg-slate-950 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDrawerOpen(true)}
            aria-label="Buka menu panel admin"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-bold">{SECTIONS[tab].title}</div>
            <div className="truncate text-[10px] text-muted-foreground">Panel Admin Langganan</div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl space-y-5 pb-8">
            {renderContent()}
          </div>
        </main>

        {/* Footer (menempel di bawah kolom konten) */}
        <footer className="mt-auto border-t bg-white py-4 dark:bg-slate-950">
          <div className="px-4 text-center text-[11px] text-muted-foreground">
            Panel Admin Langganan Darrellsoft — pembayaran diverifikasi manual; langganan hanya aktif setelah
            persetujuan admin.
          </div>
        </footer>
      </div>
    </>
  )
}

export function AdminPanel() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      }
    >
      <AdminPanelInner />
    </Suspense>
  )
}
