'use client'

import { Suspense } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { PurchaseOrderEditor } from '@/components/dokupro/purchase-order-editor'

export default function PurchaseOrderPage() {
  return (
    <DashboardLayout title="Purchase Order" subtitle="Buat purchase order dengan pratinjau langsung dan cetak A5">
      <Suspense>
        <PurchaseOrderEditor />
      </Suspense>
    </DashboardLayout>
  )
}
