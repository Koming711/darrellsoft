'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { RiwayatContent } from '@/components/riwayat-content'
import { useLanguage } from '@/contexts/language-context'

export default function RiwayatPage() {
  const { t } = useLanguage()

  return (
    <DashboardLayout title="Riwayat Penjualan" subtitle="Daftar riwayat penjualan beserta nomor invoice">
      <RiwayatContent
        title="Riwayat Penjualan"
        subtitle="Daftar riwayat penjualan beserta nomor invoice"
        defaultFilterType="all"
      />
    </DashboardLayout>
  )
}
