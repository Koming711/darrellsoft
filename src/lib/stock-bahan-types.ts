/**
 * Tipe & konstanta bersama untuk modul Stock Bahan.
 * Dipakai oleh API routes (server) dan komponen UI (client) agar kontrak konsisten.
 */

// ===== Master Bahan =====
export interface BahanItem {
  id: string
  kode: string
  nama: string
  kategori: string
  satuan: string
  stok: number
  stokMin: number
  hargaSatuan: number
  suplierId: string | null
  suplierNama: string
  lokasi: string
  aktif: boolean
  keterangan: string
  createdAt: string
  updatedAt: string
}

// ===== Supplier =====
export interface SuplierItem {
  id: string
  nama: string
  kontak: string
  whatsapp: string
  alamat: string
  catatan: string
  aktif: boolean
  createdAt: string
}

// ===== Stok Masuk =====
export interface MasukItem {
  id: string
  nomor: string
  tanggal: string
  bahanId: string
  bahanNama: string
  satuan: string
  qty: number
  hargaBeli: number
  total: number
  suplierId: string | null
  suplierNama: string
  nomorNota: string
  catatan: string
  poNomor: string
  createdAt: string
}

// ===== Stok Keluar =====
export interface KeluarItem {
  id: string
  nomor: string
  tanggal: string
  bahanId: string
  bahanNama: string
  satuan: string
  qty: number
  tujuan: string
  catatan: string
  createdAt: string
}

// ===== Penyesuaian Stok =====
export interface PenyesuaianItem {
  id: string
  nomor: string
  tanggal: string
  bahanId: string
  bahanNama: string
  satuan: string
  stokSistem: number
  stokFisik: number
  selisih: number
  alasan: string
  catatan: string
  createdAt: string
}

// ===== Riwayat Stok (ledger gabungan) =====
export type JenisMutasi = 'masuk' | 'keluar' | 'penyesuaian'

export interface RiwayatItem {
  id: string
  tanggal: string
  nomor: string
  bahanId: string
  kode: string
  bahanNama: string
  satuan: string
  jenis: JenisMutasi
  masuk: number
  keluar: number
  saldo: number
  keterangan: string
}

// ===== Laporan Stok =====
export interface LaporanItem {
  bahanId: string
  kode: string
  nama: string
  kategori: string
  satuan: string
  suplierNama: string
  aktif: boolean
  stokAwal: number
  masuk: number
  keluar: number
  penyesuaian: number
  stokAkhir: number
  hargaSatuan: number
  nilai: number
  status: StockStatus
}

export interface LaporanResponse {
  periode: { dari: string; sampai: string }
  items: LaporanItem[]
  ringkasan: {
    totalBahan: number
    totalNilai: number
    totalMasuk: number
    totalKeluar: number
    menipis: number
    habis: number
  }
}

// ===== Status stok =====
export type StockStatus = 'aman' | 'menipis' | 'habis'

/** Hitung status stok: habis (≤0), menipis (≤ stokMin, stokMin > 0), sisanya aman. */
export function statusStok(stok: number, stokMin: number): StockStatus {
  if (stok <= 0) return 'habis'
  if (stokMin > 0 && stok <= stokMin) return 'menipis'
  return 'aman'
}

// ===== Konstanta pilihan form =====
export const KATEGORI_BAHAN = [
  'Kertas',
  'PE Coating',
  'Tinta',
  'Lem',
  'Kardus',
  'Plastik',
  'Packaging',
  'Lainnya',
] as const

export const TUJUAN_KELUAR = [
  'Produksi',
  'Sampel',
  'Rusak',
  'Pemakaian Internal',
  'Lainnya',
] as const

export const SATUAN_BAHAN = [
  'pcs',
  'rim',
  'lembar',
  'kg',
  'roll',
  'box',
  'pack',
  'liter',
  'tube',
] as const

// ===== Pengaturan =====
export interface StockPengaturan {
  allowNegativeStock: boolean
}
