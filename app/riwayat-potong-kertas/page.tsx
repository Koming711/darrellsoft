'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { RiwayatContent } from '@/components/riwayat-content'
import { useLanguage } from '@/contexts/language-context'

export default function RiwayatPotongKertasPage() {
  const { t } = useLanguage()

  return (
    <DashboardLayout title={t('riwayat_potong_kertas')} subtitle={t('subtitle_riwayat_potong_kertas')}>
      <RiwayatContent
        title={t('riwayat_potong_kertas')}
        subtitle={t('subtitle_riwayat_potong_kertas')}
        defaultFilterType="Potong Kertas"
      />
    </DashboardLayout>
  )
}
