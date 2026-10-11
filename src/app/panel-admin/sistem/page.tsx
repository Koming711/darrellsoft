'use client'

// Hub SISTEM — pengguna, hak akses, dan pengaturan akun dalam satu
// halaman bertab. Sebelumnya 3 menu terpisah.

import { Suspense } from 'react'
import { Users2, KeyRound, Settings } from 'lucide-react'
import { HubTabs, useHubTab } from '../hub-tabs'
import { PenggunaContent } from '@/app/administrasi/pengguna/page'
import { HakAksesContent } from '@/app/administrasi/hak-akses/page'
import { PengaturanAkunContent } from '../pengaturan/content'

const TABS = [
  { key: 'pengguna', label: 'Pengguna', icon: Users2 },
  { key: 'hak-akses', label: 'Hak Akses', icon: KeyRound },
  { key: 'akun', label: 'Pengaturan Akun', icon: Settings },
]

function SistemHubInner() {
  const tab = useHubTab(TABS)
  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-8">
      <HubTabs tabs={TABS} />
      {tab === 'pengguna' && <PenggunaContent />}
      {tab === 'hak-akses' && <HakAksesContent />}
      {tab === 'akun' && <PengaturanAkunContent />}
    </div>
  )
}

export default function SistemHubPage() {
  return (
    <Suspense fallback={null}>
      <SistemHubInner />
    </Suspense>
  )
}
