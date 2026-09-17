'use client'

/**
 * Badge & chip ringkas untuk modul Invoice.
 * Diport dari dashboard-view InvoiceKu agar tidak menarik seluruh dashboard.
 */
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { STATUS_LABEL, TYPE_LABEL, type InvoiceStatus, type InvoiceType } from '@/lib/invoice-types'

/** Badge status: Belum Bayar = amber, Lunas = emerald, Batal = stone */
export function StatusBadge({ status }: { status: InvoiceStatus }) {
  const map = {
    BELUM_BAYAR: 'bg-amber-50 text-amber-700 border-amber-200',
    LUNAS: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    BATAL: 'bg-stone-100 text-stone-500 border-stone-200',
  } as const
  return <Badge variant="outline" className={`${map[status]} text-[11px] shrink-0`}>{STATUS_LABEL[status]}</Badge>
}

/** Badge tipe invoice: Reguler = stone, DP = amber, Pelunasan = emerald */
export function TypeBadge({ type }: { type: InvoiceType }) {
  const map = {
    REGULER: 'bg-stone-50 text-stone-600 border-stone-300',
    DP: 'bg-amber-50 text-amber-700 border-amber-200',
    PELUNASAN: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  } as const
  return <Badge variant="outline" className={`${map[type]} text-[11px] shrink-0`}>{TYPE_LABEL[type]}</Badge>
}

/** Chip ringkasan kecil (DP dibayar / sudah dipelunasi / sisa tagihan) */
export function SummaryChip({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn('text-sm font-semibold mt-0.5 whitespace-nowrap', valueClass)}>{value}</p>
    </div>
  )
}
