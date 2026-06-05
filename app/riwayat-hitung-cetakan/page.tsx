'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { RiwayatContent } from '@/components/riwayat-content'
import { useLanguage } from '@/contexts/language-context'

export default function RiwayatHitungCetakanPage() {
  const { t } = useLanguage()

  return (
    <DashboardLayout title={t('riwayat_hitung_cetakan')} subtitle={t('subtitle_riwayat_hitung_cetakan')}>
      <RiwayatContent
        title={t('riwayat_hitung_cetakan')}
        subtitle={t('subtitle_riwayat_hitung_cetakan')}
        defaultFilterType="Hitung Cetakan"
      />
    </DashboardLayout>
  )
}
