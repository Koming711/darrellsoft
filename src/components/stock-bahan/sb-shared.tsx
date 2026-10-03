'use client'

/**
 * Komponen & helper bersama modul Stock Bahan.
 * Dipakai semua tab (dashboard, data bahan, transaksi, riwayat, laporan, supplier)
 * agar tampilan konsisten: badge status, badge jenis, format angka/tanggal.
 */

import { PackagePlus, PackageMinus, Scale, CircleCheck, AlertTriangle, CircleX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTanggalFull } from '@/lib/format'
import type { StockStatus, JenisMutasi } from '@/lib/stock-bahan-types'

export const STATUS_LABEL: Record<StockStatus, string> = {
  aman: 'Aman',
  menipis: 'Menipis',
  habis: 'Habis',
}

export const STATUS_STYLE: Record<StockStatus, string> = {
  aman: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  menipis: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  habis: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
}

export function SbStatusBadge({ status, className }: { status: StockStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        STATUS_STYLE[status],
        className
      )}
    >
      {status === 'aman' && <CircleCheck className="w-3 h-3" />}
      {status === 'menipis' && <AlertTriangle className="w-3 h-3" />}
      {status === 'habis' && <CircleX className="w-3 h-3" />}
      {STATUS_LABEL[status]}
    </span>
  )
}

export const JENIS_LABEL: Record<JenisMutasi, string> = {
  masuk: 'Stok Masuk',
  keluar: 'Stok Keluar',
  penyesuaian: 'Penyesuaian',
}

export const JENIS_STYLE: Record<JenisMutasi, string> = {
  masuk: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  keluar: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
  penyesuaian: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
}

export function SbJenisBadge({ jenis, className }: { jenis: JenisMutasi; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        JENIS_STYLE[jenis],
        className
      )}
    >
      {jenis === 'masuk' && <PackagePlus className="w-3 h-3" />}
      {jenis === 'keluar' && <PackageMinus className="w-3 h-3" />}
      {jenis === 'penyesuaian' && <Scale className="w-3 h-3" />}
      {JENIS_LABEL[jenis]}
    </span>
  )
}

/** Format angka gaya Indonesia (maks 2 desimal). */
export function fmtQty(n: number | null | undefined): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(Number(n ?? 0))
}

/** Format tanggal YYYY-MM-DD → d/m/yyyy. */
export function fmtTgl(d: string | null | undefined): string {
  if (!d) return '-'
  return formatTanggalFull(d)
}

/** Angka container berbasis teks — anti overflow di tabel & kartu. */
export function SbNum({ value, className }: { value: number; className?: string }) {
  return <span className={cn('tabular-nums whitespace-nowrap', className)}>{fmtQty(value)}</span>
}
