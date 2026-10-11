'use client'

// Hub LAPORAN — laporan bulanan, riwayat penjualan, dan laporan/audit
// dalam satu halaman bertab. Sebelumnya 3 menu terpisah.

import { Suspense } from 'react'
import { BarChart3, Receipt, ScrollText } from 'lucide-react'
import { HubTabs, useHubTab } from '../hub-tabs'
import { LaporanBulananContent } from '../laporan-bulanan/content'
import { RiwayatPenjualanContent } from '../riwayat-penjualan/content'
import { LaporanAuditContent } from '../laporan-audit/content'

const TABS = [
  { key: 'bulanan', label: 'Bulanan', icon: BarChart3 },
  { key: 'penjualan', label: 'Penjualan', icon: Receipt },
  { key: 'audit', label: 'Audit', icon: ScrollText },
]

function LaporanHubInner() {
  const tab = useHubTab(TABS)
  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-8">
      <HubTabs tabs={TABS} />
      {tab === 'bulanan' && <LaporanBulananContent />}
      {tab === 'penjualan' && <RiwayatPenjualanContent />}
      {tab === 'audit' && <LaporanAuditContent />}
    </div>
  )
}

export default function LaporanHubPage() {
  return (
    <Suspense fallback={null}>
      <LaporanHubInner />
    </Suspense>
  )
}
