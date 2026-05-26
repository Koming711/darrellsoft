'use client'

import { Suspense } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { SuratJalanEditor } from '@/components/dokupro/surat-jalan-editor'

export default function SuratJalanPage() {
  return (
    <DashboardLayout title="Surat Jalan" subtitle="Buat surat jalan dengan pratinjau langsung dan cetak A5">
      <Suspense>
        <SuratJalanEditor />
      </Suspense>
    </DashboardLayout>
  )
}
