'use client'

import { useEffect, useState } from 'react'
import type { SessionUser } from '@/lib/types'
import { cn } from '@/lib/utils'
import InvoiceList from '@/components/views/invoice-list'
import InvoiceCreate from '@/components/views/invoice-create'
import InvoiceDetail from '@/components/views/invoice-detail'
import PaymentHistory from '@/components/views/payment-history'

type Mode = 'list' | 'create' | 'detail'
type Section = 'list' | 'payments'

export default function InvoicesView({ user }: { user: SessionUser }) {
  const [mode, setMode] = useState<Mode>('list')
  const [section, setSection] = useState<Section>('list')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const toList = () => {
    setMode('list')
    setDetailId(null)
    setRefreshKey((k) => k + 1)
  }

  const openDetail = (id: string) => {
    setDetailId(id)
    setMode('detail')
  }

  if (mode === 'create') {
    return (
      <InvoiceCreate
        user={user}
        onBack={toList}
        onCreated={(invoice) => {
          setRefreshKey((k) => k + 1)
          setDetailId(invoice.id)
          setMode('detail')
        }}
      />
    )
  }

  if (mode === 'detail' && detailId) {
    return (
      <InvoiceDetail
        user={user}
        invoiceId={detailId}
        onBack={toList}
        onChanged={() => setRefreshKey((k) => k + 1)}
        onDeleted={toList}
        onOpenInvoice={(id) => setDetailId(id)}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Pemilih bagian — hanya tampil di mode daftar */}
      <div
        role="tablist"
        aria-label="Bagian invoice"
        className="inline-flex w-full sm:w-auto max-w-md sm:max-w-none rounded-xl border border-stone-200 bg-white p-1.5 gap-1.5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={section === 'list'}
          onClick={() => setSection('list')}
          className={cn(
            'flex-1 sm:flex-none min-h-[44px] px-4 rounded-lg text-sm font-medium transition-colors',
            section === 'list'
              ? 'bg-emerald-600 text-white'
              : 'text-stone-600 hover:bg-stone-100'
          )}
        >
          Daftar Invoice
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'payments'}
          onClick={() => setSection('payments')}
          className={cn(
            'flex-1 sm:flex-none min-h-[44px] px-4 rounded-lg text-sm font-medium transition-colors',
            section === 'payments'
              ? 'bg-emerald-600 text-white'
              : 'text-stone-600 hover:bg-stone-100'
          )}
        >
          Riwayat Pembayaran
        </button>
      </div>

      {section === 'list' ? (
        <InvoiceList
          user={user}
          refreshKey={refreshKey}
          onOpenDetail={openDetail}
          onCreate={() => setMode('create')}
        />
      ) : (
        <PaymentHistory refreshKey={refreshKey} onOpenDetail={openDetail} />
      )}
    </div>
  )
}
