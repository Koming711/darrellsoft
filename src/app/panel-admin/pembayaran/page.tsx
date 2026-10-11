'use client'

// Hub PEMBAYARAN — verifikasi pembayaran manual (QRIS/transfer) + pengaturan
// metode pembayaran dalam satu halaman bertab. Sebelumnya 2 menu terpisah.

import { Suspense } from 'react'
import { ShieldCheck, Wallet } from 'lucide-react'
import { HubTabs, useHubTab } from '../hub-tabs'
import { VerifikasiPembayaranContent } from '../verifikasi-pembayaran/content'
import { PengaturanPembayaranContent } from '../pengaturan-pembayaran/content'

const TABS = [
  { key: 'verifikasi', label: 'Verifikasi', icon: ShieldCheck },
  { key: 'pengaturan', label: 'Pengaturan', icon: Wallet },
]

function PembayaranHubInner() {
  const tab = useHubTab(TABS)
  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-8">
      <HubTabs tabs={TABS} />
      {tab === 'verifikasi' && <VerifikasiPembayaranContent />}
      {tab === 'pengaturan' && <PengaturanPembayaranContent />}
    </div>
  )
}

export default function PembayaranHubPage() {
  return (
    <Suspense fallback={null}>
      <PembayaranHubInner />
    </Suspense>
  )
}
