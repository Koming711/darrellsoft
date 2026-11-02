'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { InvoiceStatus, PriceSource } from '@/lib/types'

/** Badge sumber harga pada baris invoice / daftar harga. */
export function PriceSourceBadge({ source, className }: { source: PriceSource; className?: string }) {
  if (source === 'CUSTOMER_PRICE') {
    return (
      <Badge className={cn('bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-100', className)}>
        Harga Customer
      </Badge>
    )
  }
  if (source === 'MANUAL') {
    return (
      <Badge className={cn('bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-100', className)}>
        Manual
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className={className}>
      Harga Standar
    </Badge>
  )
}

/** Badge status pembayaran invoice. */
export function InvoiceStatusBadge({ status, className }: { status: InvoiceStatus; className?: string }) {
  if (status === 'PAID') {
    return (
      <Badge className={cn('bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-100', className)}>
        Lunas
      </Badge>
    )
  }
  if (status === 'PARTIAL') {
    return (
      <Badge className={cn('bg-teal-100 text-teal-800 border border-teal-200 hover:bg-teal-100', className)}>
        Dibayar Sebagian
      </Badge>
    )
  }
  return (
    <Badge className={cn('bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-100', className)}>
      Belum Dibayar
    </Badge>
  )
}

/** Badge status periode harga customer. */
export function PricePeriodBadge({
  isActive,
  validUntil,
  todayISO,
  className,
}: {
  isActive: boolean
  validUntil: string | null
  todayISO: string
  className?: string
}) {
  if (!isActive) {
    return (
      <Badge variant="outline" className={cn('text-muted-foreground', className)}>
        Nonaktif
      </Badge>
    )
  }
  if (validUntil && validUntil.slice(0, 10) < todayISO) {
    return (
      <Badge variant="outline" className={cn('text-zinc-500 border-zinc-300', className)}>
        Berakhir
      </Badge>
    )
  }
  return (
    <Badge className={cn('bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-100', className)}>
      Aktif
    </Badge>
  )
}
