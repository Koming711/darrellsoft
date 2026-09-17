'use client'

import { Badge } from '@/components/ui/badge'
import { STATUS_LABEL, TYPE_LABEL, type InvoiceStatus, type InvoiceType } from '@/lib/types'

function startOfToday(): number {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()
}

/**
 * Badge status invoice. Warna (spesifikasi user):
 * Lunas → hijau, Belum Lunas → oranye, Jatuh Tempo → merah, Batal → abu.
 * `dueDate` opsional: BELUM_BAYAR + jatuh tempo terlewat → tampil "Jatuh Tempo" (merah).
 */
export function StatusBadge({ status, dueDate }: { status: InvoiceStatus; dueDate?: string | null }) {
  if (status === 'BELUM_BAYAR' && dueDate && new Date(dueDate).getTime() < startOfToday()) {
    return (
      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[11px] shrink-0">
        Jatuh Tempo
      </Badge>
    )
  }
  const map = {
    BELUM_BAYAR: 'bg-amber-50 text-amber-700 border-amber-200',
    LUNAS: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    BATAL: 'bg-stone-100 text-stone-500 border-stone-200',
  } as const
  return <Badge variant="outline" className={`${map[status]} text-[11px] shrink-0`}>{STATUS_LABEL[status]}</Badge>
}

/** Badge tipe invoice: Reguler = stone, DP = biru, Pelunasan = emerald (spesifikasi warna user) */
export function TypeBadge({ type }: { type: InvoiceType }) {
  const map = {
    REGULER: 'bg-stone-50 text-stone-600 border-stone-300',
    DP: 'bg-sky-50 text-sky-700 border-sky-200',
    PELUNASAN: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  } as const
  return <Badge variant="outline" className={`${map[type]} text-[11px] shrink-0`}>{TYPE_LABEL[type]}</Badge>
}
