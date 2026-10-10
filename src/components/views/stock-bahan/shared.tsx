'use client'

/**
 * Shared types, konstanta, dan komponen kecil untuk modul Stock Bahan.
 */

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ==================== TYPES ====================

export interface Material {
  id: string
  kode: string
  nama: string
  kategori: string
  satuan: string
  stok: number
  stokMin: number
  hargaModal: number
  lokasi: string
  aktif: boolean
  catatan: string
  status: 'aman' | 'menipis' | 'habis'
  punyaTransaksi: boolean
}

export interface Supplier {
  id: string
  nama: string
  kontak: string
  whatsapp: string
  alamat: string
  catatan: string
  aktif: boolean
  punyaTransaksi: boolean
}

export interface StockInTx {
  id: string
  nomor: string
  tanggal: string
  materialId: string
  supplierId: string | null
  jumlah: number
  hargaBeli: number
  totalHarga: number
  nomorNota: string
  catatan: string
  material?: { kode: string; nama: string; satuan: string }
  supplier?: { nama: string } | null
  stokSekarang?: number | null
}

export interface StockOutTx {
  id: string
  nomor: string
  tanggal: string
  materialId: string
  jumlah: number
  tujuan: string
  catatan: string
  material?: { kode: string; nama: string; satuan: string }
  stokSekarang?: number | null
}

export interface AdjustmentTx {
  id: string
  nomor: string
  tanggal: string
  materialId: string
  stokSistem: number
  stokFisik: number
  selisih: number
  alasan: string
  catatan: string
  material?: { kode: string; nama: string; satuan: string }
  stokSekarang?: number | null
}

export interface Movement {
  id: string
  tanggal: string
  materialId: string
  jenis: 'masuk' | 'keluar' | 'penyesuaian'
  masuk: number
  keluar: number
  saldo: number
  refNomor: string
  keterangan: string
  material?: { kode: string; nama: string; satuan: string }
}

export interface DashboardData {
  totalJenis: number
  totalStok: number
  stokMenipis: number
  stokHabis: number
  nilaiPersediaan: number
  perluBeli: {
    id: string
    kode: string
    nama: string
    stok: number
    stokMin: number
    satuan: string
    hargaModal: number
    status: 'habis' | 'menipis'
  }[]
}

export interface LaporanRow {
  id: string
  kode: string
  nama: string
  kategori: string
  satuan: string
  stokMin: number
  hargaModal: number
  nilaiPersediaan: number
  stokAwal: number
  masuk: number
  keluar: number
  penyesuaian: number
  stokAkhir: number
  status: 'aman' | 'menipis' | 'habis'
}

export interface LaporanData {
  rows: LaporanRow[]
  totalNilai: number
}

// ==================== KONSTANTA ====================

export const KATEGORI_OPTIONS = ['Kertas', 'Tinta', 'Kimia', 'Packaging', 'Lainnya']
export const SATUAN_OPTIONS = [
  'pcs', 'lembar', 'rim', 'kg', 'gram', 'liter', 'ml', 'roll', 'box', 'pack', 'tube', 'kaleng',
]
export const TUJUAN_OPTIONS = ['Produksi', 'Sampel', 'Rusak', 'Pemakaian internal', 'Lain-lain']

export const STATUS_LABEL: Record<string, string> = {
  aman: 'Aman',
  menipis: 'Menipis',
  habis: 'Habis',
}

// ==================== HELPERS ====================

export function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'Terjadi kesalahan'
}

export function fmtTanggal(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtWaktu(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function toInputDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function fmtNum(n: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n || 0)
}

// ==================== UI ATOMS ====================

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[11px] font-semibold px-2 py-0.5',
        status === 'aman' && 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
        status === 'menipis' && 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
        status === 'habis' && 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800',
        className
      )}
    >
      {STATUS_LABEL[status] || status}
    </Badge>
  )
}

export function JenisBadge({ jenis }: { jenis: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[11px] font-semibold px-2 py-0.5',
        jenis === 'masuk' && 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
        jenis === 'keluar' && 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800',
        jenis === 'penyesuaian' && 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800'
      )}
    >
      {jenis === 'masuk' ? 'Stok Masuk' : jenis === 'keluar' ? 'Stok Keluar' : 'Penyesuaian'}
    </Badge>
  )
}

/** CSS cetak #print-area — sematkan sekali per halaman/tab yang punya cetakan. */
export const PRINT_AREA_CSS = `
@media print {
  body > * {
    height: 0 !important;
    min-height: 0 !important;
    overflow: hidden !important;
    margin: 0 !important;
  }
  body *:not(#print-area):not(#print-area *) {
    visibility: hidden !important;
  }
  #print-area,
  #print-area * {
    visibility: visible !important;
  }
  #print-area {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 24px !important;
    box-shadow: none !important;
    border: none !important;
  }
  @page {
    size: auto;
    margin: 12mm;
  }
}
`
