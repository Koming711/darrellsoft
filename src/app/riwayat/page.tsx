'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { RiwayatContent } from '@/components/riwayat-content'
import { useLanguage } from '@/contexts/language-context'

export default function RiwayatPage() {
  const { t } = useLanguage()

  return (
    <DashboardLayout title={t('riwayat')} subtitle={t('subtitle_riwayat')}>
      <RiwayatContent
        title={t('riwayat')}
        subtitle={t('subtitle_riwayat')}
        defaultFilterType="all"
      />
    </DashboardLayout>
  )
}
