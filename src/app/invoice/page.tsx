'use client'

import { Suspense } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { InvoiceEditor } from '@/components/dokupro/invoice-editor'

export default function InvoicePage() {
  return (
    <DashboardLayout title="Invoice" subtitle="Buat invoice dengan pratinjau langsung dan cetak A5">
      <Suspense fallback={null}>
        <InvoiceEditor />
      </Suspense>
    </DashboardLayout>
  )
}
