'use client'

/**
 * Shared types, konstanta & komponen kecil untuk modul Stock Bahan.
 * Spesifikasi: bahan baku cetak — kertas kraft, PE coating, tinta, lem, kardus, plastik, dll.
 */

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface Bahan {
  id: string
  kode: string
  nama: string
  kategori: string
  satuan: string
  stok: number
  stokMin: number
  hargaSatuan: number
  pemasok: string
  lokasi: string
  referensiPo: string
  aktif: boolean
  keterangan: string
  createdAt: string
  updatedAt: string
}

export interface BahanMutasi {
  id: string
  bahanId: string
  jenis: 'masuk' | 'keluar' | 'penyesuaian'
  nomor: string
  tanggal: string
  qty: number
  stokSetelah: number
  hargaBeli: number
  totalHarga: number
  nomorNota: string
  pemasok: string
  tujuan: string
  alasan: string
  namaBahan: string
  satuanBahan: string
  keterangan: string
  createdAt: string
  updatedAt?: string
  bahan?: { kode: string; nama: string; satuan: string; kategori: string }
}

export interface PemasokRingkas {
  id: string
  namaToko: string
}

export const SATUAN_OPTIONS = [
  'pcs', 'lembar', 'rim', 'box', 'pack', 'roll', 'kg', 'gram', 'liter', 'ml', 'tube', 'kaleng', 'meter',
]

export const KATEGORI_OPTIONS = [
  'Kertas', 'PE Coating', 'Tinta', 'Kimia', 'Lem', 'Kardus', 'Plastik', 'Packaging', 'Sparepart', 'Lainnya',
]

export const TUJUAN_OPSI = ['Produksi', 'Sampel', 'Rusak', 'Pemakaian internal', 'Lainnya']

export const ALASAN_OPSI = [
  'Stok opname', 'Stok rusak', 'Stok hilang', 'Salah hitung', 'Koreksi data', 'Lainnya',
]

export function todayInput(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatTanggalID(tgl?: string): string {
  if (!tgl) return '-'
  const d = new Date(`${tgl}T00:00:00`)
  if (Number.isNaN(d.getTime())) return tgl
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' })
}

export function formatAngka(n: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n)
}

/** Status stok: Habis (≤0), Menipis (≤ min), Aman. */
export function statusStok(b: Pick<Bahan, 'stok' | 'stokMin'>): 'aman' | 'menipis' | 'habis' {
  if (b.stok <= 0) return 'habis'
  if (b.stokMin > 0 && b.stok <= b.stokMin) return 'menipis'
  return 'aman'
}

export function StatusStokBadge({ b, className }: { b: Pick<Bahan, 'stok' | 'stokMin'>; className?: string }) {
  const s = statusStok(b)
  return (
    <Badge
      className={cn(
        'text-xs font-semibold',
        s === 'aman' && 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
        s === 'menipis' && 'bg-amber-100 text-amber-800 hover:bg-amber-100',
        s === 'habis' && 'bg-red-100 text-red-800 hover:bg-red-100',
        className,
      )}
    >
      {s === 'aman' ? 'Aman' : s === 'menipis' ? 'Menipis' : 'Habis'}
    </Badge>
  )
}

export function JenisBadge({ jenis }: { jenis: string }) {
  return (
    <Badge
      className={cn(
        'text-xs font-semibold',
        jenis === 'masuk' && 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
        jenis === 'keluar' && 'bg-orange-100 text-orange-800 hover:bg-orange-100',
        jenis === 'penyesuaian' && 'bg-stone-200 text-stone-800 hover:bg-stone-200',
      )}
    >
      {jenis === 'masuk' ? 'Masuk' : jenis === 'keluar' ? 'Keluar' : 'Penyesuaian'}
    </Badge>
  )
}

export function AktifBadge({ aktif }: { aktif: boolean }) {
  return (
    <Badge
      className={cn(
        'text-xs font-semibold',
        aktif ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100' : 'bg-stone-200 text-stone-600 hover:bg-stone-200',
      )}
    >
      {aktif ? 'Aktif' : 'Nonaktif'}
    </Badge>
  )
}

/** Tanggal efektif mutasi (tanggal transaksi; fallback tanggal createdAt) — YYYY-MM-DD. */
export function effTgl(m: Pick<BahanMutasi, 'tanggal' | 'createdAt'>): string {
  if (m.tanggal) return m.tanggal
  return (m.createdAt || '').slice(0, 10)
}

/** Arah mutasi → kolom Masuk / Keluar pada ledger. */
export function masukKeluar(m: BahanMutasi): { masuk: number; keluar: number } {
  if (m.jenis === 'masuk') return { masuk: m.qty, keluar: 0 }
  if (m.jenis === 'keluar') return { masuk: 0, keluar: m.qty }
  // penyesuaian: qty negatif = keluar
  return m.qty < 0 ? { masuk: 0, keluar: Math.abs(m.qty) } : { masuk: m.qty, keluar: 0 }
}

export function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'Terjadi kesalahan'
}
