'use client'

// Hub PELANGGAN — menggabungkan 5 halaman lama menjadi satu halaman bertab:
// Langganan (kelola langganan) · Baru · Aktif · Expired · Ditolak (daftar akun).
// Tab tersimpan di ?tab= agar deep-link tetap berfungsi.

import { Suspense } from 'react'
import { UserPlus, UserCheck, Clock, UserX, CreditCard } from 'lucide-react'
import { HubTabs, useHubTab } from '../hub-tabs'
import { KelolaPelangganContent } from '../kelola-pelanggan/content'
import { AkunListPage } from '../akun-list'

const TABS = [
  { key: 'langganan', label: 'Langganan', icon: CreditCard },
  { key: 'baru', label: 'Baru', icon: UserPlus },
  { key: 'aktif', label: 'Aktif', icon: UserCheck },
  { key: 'expired', label: 'Expired', icon: Clock },
  { key: 'ditolak', label: 'Ditolak', icon: UserX },
]

function PelangganHubInner() {
  const tab = useHubTab(TABS)
  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-8">
      <HubTabs tabs={TABS} />
      {tab === 'langganan' && <KelolaPelangganContent />}
      {tab === 'baru' && <AkunListPage kategori="baru" />}
      {tab === 'aktif' && <AkunListPage kategori="aktif" />}
      {tab === 'expired' && <AkunListPage kategori="expired" />}
      {tab === 'ditolak' && <AkunListPage kategori="ditolak" />}
    </div>
  )
}

export default function PelangganHubPage() {
  return (
    <Suspense fallback={null}>
      <PelangganHubInner />
    </Suspense>
  )
}
