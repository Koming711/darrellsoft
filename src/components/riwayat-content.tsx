'use client'

// ============================================================
// RiwayatContent — halaman riwayat (Potong Kertas / Hitung Cetakan)
// Gaya CRUD + UX mobile-first (permintaan owner):
//   • Tab periode (Hari ini | Minggu ini | Bulan ini | Tahun ini |
//     Custom | Semua) LANGSUNG TAMPIL tanpa perlu klik dropdown.
//     Default saat halaman dibuka = "Hari ini".
//   • Tombol dropdown filter berisi NAMA PELANGGAN yang ada di data
//     riwayat (bukan tipe dokumen).
//   • Kartu mobile gaya CRUD: badge jenis + nomor, nama pelanggan,
//     ringkasan angka, dan baris aksi (Detail · Edit · Hapus).
//   • Hapus pakai dialog konfirmasi (AlertDialog), bukan confirm()
//     browser, dengan pesan error yang jelas.
// Sumber data per halaman:
//   • source="potong-kertas"  → /api/riwayat-potong-kertas (tabel RiwayatPotongKertas,
//     tabel yang benar-benar diisi kalkulator Potong Kertas)
//   • source="hitung-cetakan" → /api/riwayat-cetakan (tipe hitung_cetakan)
// ============================================================

import { useState, useEffect, useMemo, useRef } from 'react'
import { History, Search, X, Eye, Trash2, Printer, FileImage, Loader2, FileText, Calculator, Scissors, Pencil, CalendarDays, User } from 'lucide-react'
import { captureElementAsJpg, fitBlobToA5, HIRES_PIXEL_RATIO } from '@/lib/capture-jpg'
import { printBlobHiRes } from '@/lib/print-hi-res'
import { RincianCetakanPreview, mapRiwayatToRincianData } from '@/components/rincian-cetakan-preview'
import { FixedDocScaler } from '@/components/fixed-doc-scaler'
import { shareJpgToWhatsApp } from '@/lib/share-jpg'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/contexts/language-context'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { getAuthHeaders } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'
import { notifyDataChange } from '@/lib/data-sync'
import { useDataChange } from '@/hooks/use-data-change'
import { cn } from '@/lib/utils'
import {
  RiwayatPeriodFilter, RiwayatCustomerFilter, RiwayatFilterCard,
  RiwayatSummaryCard, RiwayatEmptyState,
  riwayatDateRange, riwayatToInputDate,
} from '@/components/dokupro/riwayat-period-filter'
import type { RiwayatPeriod } from '@/components/dokupro/riwayat-period-filter'

/** Baris mentah tabel RiwayatCetakan (sumber halaman riwayat hitung cetakan). */
interface RiwayatCetakanRow {
  id: string
  nomorUrut: string
  type: string
  printName: string
  customerName: string
  paperName: string
  paperGrammage: string
  paperLength: string
  paperWidth: string
  cutWidth: string
  cutHeight: string
  quantity: string
  jumlahPesanan: string
  berapaMata: string
  warna: string
  warnaKhusus: string
  machineName: string
  hargaPlat: number
  ongkosCetak: number
  ongkosCetakDetail: string
  machineName2: string
  ongkosCetak2: number
  ongkosCetak2Detail: string
  totalPaperPrice: number
  pricePerSheet: number
  finishingNames: string
  finishingBreakdown: string
  finishingCost: number
  packingCost: number
  shippingCost: number
  glueCost: number
  glueBorongan: number
  otherCost: number
  otherCost2: number
  otherCostLabel: string
  otherCostLabel2: string
  setelanKertas: string
  warna2: string
  warnaKhusus2: string
  hargaPlat2: number
  glueLengthCm: string
  glueCostPerCm: string
  photoUrl?: string | null
  subTotal: number
  profitPercent: number
  profitAmount: number
  grandTotal: number
  createdAt: string
  updatedAt: string
}

/** Baris mentah tabel RiwayatPotongKertas (sumber halaman riwayat potong kertas). */
interface RiwayatPotongKertasRow {
  id: string
  nomorUrut: string
  namaCustomer: string
  namaCetakan: string
  paperName: string
  paperId: string
  grammage: string
  paperWidth: string
  paperHeight: string
  cutWidth: string
  cutHeight: string
  quantity: string
  setelanKertas: string
  sheetsNeeded: string
  totalPrice: number
  pricePerSheet: number
  efficiency: number
  strategy: string
  jumlahPesanan: string
  berapaMata: string
  resultData: string
  photoUrl?: string | null
  createdAt: string
  updatedAt: string
}

/** Model tampilan terpadu agar filter/kartu/tabel tidak peduli sumber tabel. */
interface UnifiedRiwayat {
  id: string
  nomorUrut: string
  customerName: string
  printName: string
  paperName: string
  grammage: string
  paperSizeLabel: string
  cutSizeLabel: string
  quantity: number
  sheetsNeeded: number | null
  jumlahPesanan: string
  berapaMata: string
  grandTotal: number
  pricePerSheet: number
  /** Hitung Cetakan: jumlah pesanan dalam pcs (parsed dari jumlahPesanan). */
  jumlahPcs: number
  /** Hitung Cetakan: harga modal per pcs = subTotal / jumlah pesanan. */
  modalPerPcs: number
  /** Hitung Cetakan: harga jual per pcs = grandTotal / jumlah pesanan. */
  jualPerPcs: number
  /** Potong Kertas: potongan per lembar (totalPieces dari resultData / berapaMata). */
  potonganPerLembar: number | null
  createdAt: string
  raw: RiwayatCetakanRow | RiwayatPotongKertasRow
}

export type RiwayatSource = 'potong-kertas' | 'hitung-cetakan'

interface RiwayatContentProps {
  title: string
  subtitle: string
  source: RiwayatSource
}

function normalizeCetakan(r: RiwayatCetakanRow): UnifiedRiwayat {
  const qty = parseInt(r.quantity || '0') || 0
  const pcs = parseInt(r.jumlahPesanan || '0') || 0
  // Harga per-pcs: pakai jumlahPesanan (pcs pesanan); fallback ke quantity utk data lama
  const perPcsBase = pcs > 0 ? pcs : qty
  const modalPerPcs = perPcsBase > 0 ? Math.round((r.subTotal || 0) / perPcsBase) : 0
  const jualPerPcs = perPcsBase > 0 ? Math.round((r.grandTotal || 0) / perPcsBase) : 0
  return {
    id: r.id,
    nomorUrut: r.nomorUrut || '',
    customerName: r.customerName || '',
    printName: r.printName || '',
    paperName: r.paperName || '',
    grammage: r.paperGrammage || '',
    paperSizeLabel: r.paperLength && r.paperWidth ? `${r.paperLength} × ${r.paperWidth} cm` : '',
    cutSizeLabel: r.cutWidth && r.cutHeight ? `${r.cutWidth} × ${r.cutHeight} cm` : '',
    quantity: qty,
    sheetsNeeded: null,
    jumlahPesanan: r.jumlahPesanan || '',
    berapaMata: r.berapaMata || '',
    grandTotal: r.grandTotal || 0,
    pricePerSheet: qty > 0 ? Math.round((r.grandTotal || 0) / qty) : 0,
    jumlahPcs: pcs,
    modalPerPcs,
    jualPerPcs,
    potonganPerLembar: null,
    createdAt: r.createdAt,
    raw: r,
  }
}

function normalizePotong(r: RiwayatPotongKertasRow): UnifiedRiwayat {
  // Potongan/lembar = totalPieces dari hasil cutting engine (resultData);
  // fallback ke input berapaMata utk data lama.
  let potonganPerLembar: number | null = null
  try {
    const rd = r.resultData ? JSON.parse(r.resultData) : null
    if (rd && typeof rd.totalPieces === 'number' && rd.totalPieces > 0) potonganPerLembar = rd.totalPieces
  } catch { /* resultData bukan JSON valid — abaikan */ }
  if (!potonganPerLembar) {
    const bm = parseInt(r.berapaMata || '0') || 0
    if (bm > 0) potonganPerLembar = bm
  }
  return {
    id: r.id,
    nomorUrut: r.nomorUrut || '',
    customerName: r.namaCustomer || '',
    printName: r.namaCetakan || '',
    paperName: r.paperName || '',
    grammage: r.grammage || '',
    paperSizeLabel: r.paperWidth && r.paperHeight && r.paperWidth !== '0' ? `${r.paperWidth} × ${r.paperHeight} cm` : '',
    cutSizeLabel: r.cutWidth && r.cutHeight && r.cutWidth !== '0' ? `${r.cutWidth} × ${r.cutHeight} cm` : '',
    quantity: parseInt(r.quantity || '0') || 0,
    sheetsNeeded: parseInt(r.sheetsNeeded || '0') || 0,
    jumlahPesanan: r.jumlahPesanan || '',
    berapaMata: r.berapaMata || '',
    grandTotal: r.totalPrice || 0,
    pricePerSheet: Math.round(r.pricePerSheet || 0),
    jumlahPcs: parseInt(r.jumlahPesanan || '0') || 0,
    modalPerPcs: 0,
    jualPerPcs: 0,
    potonganPerLembar,
    createdAt: r.createdAt,
    raw: r,
  }
}

const PERIOD_DEFAULT: RiwayatPeriod = 'today'

export function RiwayatContent({ title, subtitle, source }: RiwayatContentProps) {
  const { t } = useLanguage()
  const router = useRouter()
  const isPotong = source === 'potong-kertas'

  const [rows, setRows] = useState<(RiwayatCetakanRow | RiwayatPotongKertasRow)[]>([])
  const [loading, setLoading] = useState(true)

  // ===== Filter: periode (default Hari ini — langsung terlihat, bukan dropdown) =====
  const [period, setPeriod] = useState<RiwayatPeriod>(PERIOD_DEFAULT)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [month, setMonth] = useState<number | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  // Dropdown filter = NAMA PELANGGAN dari data riwayat (permintaan owner)
  const [customerFilter, setCustomerFilter] = useState('')

  // ===== Preview dialog =====
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewItem, setPreviewItem] = useState<UnifiedRiwayat | null>(null)
  const [isGeneratingJpg, setIsGeneratingJpg] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const previewRincian = useMemo(() => {
    if (isPotong || !previewItem) return null
    const raw = previewItem.raw as RiwayatCetakanRow
    return raw.type === 'hitung_cetakan' ? mapRiwayatToRincianData(raw) : null
  }, [previewItem, isPotong])

  // ===== Delete (AlertDialog) =====
  const [deleteTarget, setDeleteTarget] = useState<UnifiedRiwayat | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    fetchRiwayat()
  }, [])

  useDataChange(['riwayat-cetakan', 'riwayat-potong-kertas'], () => {
    fetchRiwayat()
  })

  const fetchRiwayat = async () => {
    setLoading(true)
    try {
      const url = isPotong ? '/api/riwayat-potong-kertas' : '/api/riwayat-cetakan'
      const res = await authFetch(url, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setRows(Array.isArray(data) ? data : [])
      }
    } catch {
      toast.error('Gagal memuat riwayat')
    } finally {
      setLoading(false)
    }
  }

  // ===== Edit / restore ke kalkulator =====
  const handleRestoreCetakan = (item: UnifiedRiwayat) => {
    const r = item.raw as RiwayatCetakanRow
    const params = new URLSearchParams()
    if (r.printName) params.set('printName', r.printName)
    if (r.customerName) params.set('customerName', r.customerName)
    if (r.paperName) params.set('paperName', r.paperName)
    if (r.paperLength) params.set('paperLength', r.paperLength)
    if (r.paperWidth) params.set('paperWidth', r.paperWidth)
    if (r.cutWidth) params.set('cutWidth', r.cutWidth)
    if (r.cutHeight) params.set('cutHeight', r.cutHeight)
    if (r.quantity) params.set('quantity', r.quantity)
    if (r.jumlahPesanan) params.set('jumlahPesanan', r.jumlahPesanan)
    if (r.berapaMata) params.set('berapaMata', r.berapaMata)
    if (r.totalPaperPrice) params.set('totalPaperPrice', r.totalPaperPrice.toString())
    if (r.profitPercent) params.set('profitPercent', r.profitPercent.toString())
    params.set('restoredFromRiwayat', '1')
    if (r.paperGrammage && r.paperGrammage !== '0') params.set('paperGrammage', r.paperGrammage)
    if (r.pricePerSheet) params.set('pricePerSheet', r.pricePerSheet.toString())
    if (r.warna && r.warna !== '-') params.set('warna', r.warna)
    if (r.warnaKhusus && r.warnaKhusus !== '-' && parseInt(r.warnaKhusus) > 0) params.set('warnaKhusus', r.warnaKhusus)
    if (r.hargaPlat) params.set('hargaPlat', r.hargaPlat.toString())
    if (r.machineName && r.machineName !== '-') params.set('machineName', r.machineName)
    if (r.machineName2 && r.machineName2 !== '-') params.set('machineName2', r.machineName2)
    if (r.finishingNames && r.finishingNames !== '-') params.set('finishingNames', r.finishingNames)
    if (r.packingCost) params.set('packingCost', r.packingCost.toString())
    if (r.shippingCost) params.set('shippingCost', r.shippingCost.toString())
    if (r.glueCost) params.set('glueCost', r.glueCost.toString())
    if (r.glueBorongan) params.set('glueBorongan', r.glueBorongan.toString())
    if (r.otherCost) params.set('otherCost', r.otherCost.toString())
    window.location.href = `/hitung-cetakan?${params.toString()}`
  }

  const handleEdit = (item: UnifiedRiwayat) => {
    if (isPotong) {
      // Kalkulator Potong Kertas mendukung deep-link restore via ?restore=<id>
      router.push(`/potong-kertas?restore=${item.id}`)
    } else {
      handleRestoreCetakan(item)
    }
  }

  // ===== Hapus: endpoint sesuai sumber data =====
  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return
    const item = deleteTarget
    setIsDeleting(true)
    try {
      const base = isPotong ? '/api/riwayat-potong-kertas' : '/api/riwayat-cetakan'
      // Retry sekali pada 500 (transien pooler/serverless).
      const doDelete = () => authFetch(`${base}/${item.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      })
      let res = await doDelete()
      if (!res.ok && res.status === 500) {
        await new Promise((r) => setTimeout(r, 600))
        res = await doDelete()
      }
      if (res.ok) {
        toast.success('Riwayat berhasil dihapus')
        setRows(prev => prev.filter(h => h.id !== item.id))
        notifyDataChange(isPotong ? 'riwayat-potong-kertas' : 'riwayat-cetakan')
        setDeleteTarget(null)
        return
      }
      if (res.status === 404) {
        // Data sudah tidak ada di server (daftar di layar kadaluarsa) — bersihkan baris.
        setRows(prev => prev.filter(h => h.id !== item.id))
        toast.info('Data sudah tidak ada di server — daftar diperbarui')
        setDeleteTarget(null)
        return
      }
      let srv = ''
      try { srv = (await res.json())?.error || '' } catch {}
      if (res.status === 403) {
        toast.error('Tidak bisa menghapus: riwayat ini milik akun lain (403)')
      } else {
        toast.error(`Gagal menghapus riwayat (${res.status}${srv ? `: ${srv}` : ''})`)
      }
    } catch {
      toast.error('Gagal menghapus riwayat (jaringan terputus)')
    } finally {
      setIsDeleting(false)
    }
  }

  // ===== Preview: cetak & JPG hi-res (hasil sama dengan preview) =====
  const handlePrint = async () => {
    const el = previewRef.current
    if (!el || !previewItem) return
    setIsPrinting(true)
    try {
      const blob = await captureElementAsJpg(el, { pixelRatio: HIRES_PIXEL_RATIO, fixedWidth: 720 })
      const custLabel = (previewItem.customerName || previewItem.printName || 'rincian').replace(/\s+/g, '-').toLowerCase()
      if (isPotong) {
        const ok = await printBlobHiRes(blob, { title: `Rincian Potong Kertas ${custLabel}`, page: 'A5 portrait', margin: '5mm' })
        if (!ok) { toast.error('Popup diblokir. Izinkan popup untuk mencetak.'); return }
      } else {
        const ok = await printBlobHiRes(blob, { title: `Rincian Harga Cetakan ${custLabel}`, page: 'A5 portrait', margin: '5mm' })
        if (!ok) { toast.error('Popup diblokir. Izinkan popup untuk mencetak.'); return }
      }
    } catch {
      toast.error('Gagal menyiapkan cetakan')
    } finally {
      setIsPrinting(false)
    }
  }

  const handleJpg = async () => {
    const el = previewRef.current
    if (!el || !previewItem) return
    setIsGeneratingJpg(true)
    try {
      const rawBlob = await captureElementAsJpg(el, { pixelRatio: HIRES_PIXEL_RATIO, fixedWidth: 720 })
      const blob = await fitBlobToA5(rawBlob, { orientation: 'portrait', marginPct: 3 })
      const custLabel = (previewItem.customerName || previewItem.printName || 'preview').replace(/\s+/g, '-').toLowerCase()
      const fileName = `${isPotong ? 'rincian-potong-kertas' : 'rincian-cetakan'}-${custLabel}-${Date.now()}.jpg`
      const result = await shareJpgToWhatsApp({
        blob, fileName,
        documentLabel: isPotong ? 'Rincian Potong Kertas' : 'Rincian Harga Cetakan',
      })
      if (result.status === 'shared') {
        toast.success('Gambar JPG dikirim ke WhatsApp')
      } else if (result.status === 'downloaded') {
        toast.success('JPG diunduh ke perangkat', { description: 'File JPG telah disimpan ke folder Downloads.' })
      } else if (result.status === 'error') {
        toast.error(result.error || 'Gagal memproses JPG')
      }
    } catch (err) {
      console.error('JPG generation error:', err)
      toast.error('Gagal menghasilkan gambar JPG')
    } finally {
      setIsGeneratingJpg(false)
    }
  }

  // ===== Derivasi data =====
  const items = useMemo<UnifiedRiwayat[]>(() => {
    const mapped = rows.map((r) => 'namaCetakan' in r
      ? normalizePotong(r as RiwayatPotongKertasRow)
      : normalizeCetakan(r as RiwayatCetakanRow)
    )
    if (isPotong) return mapped
    // Halaman riwayat hitung cetakan hanya menampilkan tipe hitung_cetakan
    return mapped.filter(m => (m.raw as RiwayatCetakanRow).type === 'hitung_cetakan')
  }, [rows, isPotong])

  // Rentang tanggal efektif sesuai tab periode
  const range = useMemo(
    () => riwayatDateRange(period, fromDate, toDate, month, year),
    [period, fromDate, toDate, month, year]
  )

  // 1) Filter periode (tanggal lokal yyyy-mm-dd, inklusif)
  const periodItems = useMemo(() => {
    if (!range.dateFrom && !range.dateTo) return items
    return items.filter((h) => {
      const d = riwayatToInputDate(h.createdAt)
      if (!d) return false
      if (range.dateFrom && d < range.dateFrom) return false
      if (range.dateTo && d > range.dateTo) return false
      return true
    })
  }, [items, range])

  // 2) Opsi dropdown pelanggan = nama pelanggan dalam data riwayat (periode aktif)
  const customerOptions = useMemo(() => {
    const set = new Set<string>()
    for (const h of periodItems) {
      const n = (h.customerName || '').trim()
      if (n) set.add(n)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'))
  }, [periodItems])

  // 3) Filter pencarian + pelanggan
  const filteredItems = useMemo(() => periodItems.filter((h) => {
    const term = searchTerm.toLowerCase().trim()
    const matchesSearch = !term
      || h.printName?.toLowerCase().includes(term)
      || h.customerName?.toLowerCase().includes(term)
      || h.paperName?.toLowerCase().includes(term)
    const matchesCustomer = !customerFilter || h.customerName === customerFilter
    return matchesSearch && matchesCustomer
  }), [periodItems, searchTerm, customerFilter])

  const totalNilai = useMemo(
    () => filteredItems.reduce((s, h) => s + (h.grandTotal || 0), 0),
    [filteredItems]
  )

  const filtersActive = period !== PERIOD_DEFAULT || !!searchTerm || !!customerFilter
  const resetFilters = () => {
    setPeriod(PERIOD_DEFAULT)
    setSearchTerm('')
    setCustomerFilter('')
  }

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch { return d }
  }
  const formatRp = (n: number) => `Rp ${(n || 0).toLocaleString('id-ID')}`
  // Versi ringkas utk kartu mobile (hemat ruang): ≥1 jt → "4,7 jt"
  const formatRpCompact = (n: number) => {
    const v = Math.round(n || 0)
    if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`
    if (v > 0) return `Rp ${v.toLocaleString('id-ID')}`
    return '-'
  }
  // Tanggal pendek utk kartu mobile: "10 Feb, 14.30"
  const formatDateShort = (d: string) => {
    try {
      const dt = new Date(d)
      return `${dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}, ${dt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
    } catch { return d }
  }

  const jenisLabel = isPotong ? 'Potong Kertas' : 'Hitung Cetakan'

  // ===== Aksi baris (dipakai kartu mobile & tabel desktop) =====
  const openPreview = (item: UnifiedRiwayat) => {
    setPreviewItem(item)
    setPreviewOpen(true)
  }

  const deleteButton = (item: UnifiedRiwayat, size: 'icon' | 'full' = 'icon') => (
    <button
      onClick={(e) => { e.stopPropagation(); setDeleteTarget(item) }}
      title="Hapus riwayat"
      aria-label={`Hapus riwayat ${item.printName || item.customerName || ''}`}
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 active:bg-red-200 transition-colors',
        size === 'icon' ? 'p-1.5' : 'px-3 min-h-[40px] text-xs font-semibold'
      )}
    >
      <Trash2 className="w-3.5 h-3.5" />
      {size === 'full' && 'Hapus'}
    </button>
  )

  const detailButton = (item: UnifiedRiwayat) => (
    <button
      onClick={(e) => { e.stopPropagation(); openPreview(item) }}
      title={t('preview')}
      className="flex-1 min-w-0 flex items-center justify-center gap-1 min-h-[32px] px-2 rounded-lg bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 active:bg-violet-200 text-[12px] font-semibold transition-colors"
    >
      <Eye className="w-3.5 h-3.5" /> Detail
    </button>
  )

  const editButton = (item: UnifiedRiwayat) => (
    <button
      onClick={(e) => { e.stopPropagation(); handleEdit(item) }}
      title="Edit perhitungan di kalkulator"
      className="flex-1 min-w-0 flex items-center justify-center gap-1 min-h-[32px] px-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 active:bg-emerald-200 text-[12px] font-semibold transition-colors"
    >
      <Pencil className="w-3.5 h-3.5" /> Edit
    </button>
  )

  return (
    <div className="space-y-4">
      {/* ===== KARTU FILTER — isi selalu terlihat (bukan dropdown) ===== */}
      <RiwayatFilterCard>
        <RiwayatPeriodFilter
          idPrefix={isPotong ? 'riwayat-pk' : 'riwayat-hc'}
          period={period}
          onChangePeriod={setPeriod}
          from={fromDate}
          to={toDate}
          onFromChange={setFromDate}
          onToChange={setToDate}
          month={month}
          onMonthChange={setMonth}
          year={year}
          onYearChange={setYear}
        />

        {/* Filter pelanggan + kotak pencarian — DIPINDAH ke BAWAH baris tab
            periode (Hari ini … Semua) sesuai permintaan owner.
            Mobile: dropdown "Semua Pelanggan" 1 baris penuh (beserta tombol
            reset), lalu kotak pencarian 1 baris penuh di bawahnya.
            Desktop (sm+): tetap rapi dalam 1 baris. */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Cari cetakan, pelanggan, kertas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Cari riwayat"
              className="w-full min-h-[44px] pl-9 pr-4 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <RiwayatCustomerFilter
              idPrefix={isPotong ? 'riwayat-pk' : 'riwayat-hc'}
              options={customerOptions}
              value={customerFilter}
              onChange={setCustomerFilter}
              ariaLabel={isPotong ? 'Filter nama pelanggan potong kertas' : 'Filter nama pelanggan hitung cetakan'}
              fullWidth
            />
            {filtersActive && (
              <button
                onClick={resetFilters}
                aria-label="Reset filter"
                title="Reset Filter"
                className="shrink-0 h-11 w-11 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </RiwayatFilterCard>

      {/* ===== RINGKASAN ===== */}
      <div className="grid grid-cols-2 gap-3">
        <RiwayatSummaryCard
          label="Jumlah Data"
          value={filteredItems.length}
          note={period === 'all' ? 'Semua periode' : undefined}
        />
        <RiwayatSummaryCard
          label="Total Nilai"
          value={formatRp(totalNilai)}
          valueClass="text-emerald-700"
        />
      </div>

      {/* ===== DAFTAR RIWAYAT ===== */}
      {loading ? (
        <div className="space-y-3" role="status" aria-label="Memuat riwayat">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 animate-pulse">
              <div className="h-4 w-24 bg-slate-100 rounded mb-2" />
              <div className="h-5 w-2/3 bg-slate-100 rounded mb-1.5" />
              <div className="h-3 w-1/2 bg-slate-100 rounded mb-3" />
              <div className="h-10 w-full bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <RiwayatEmptyState
          icon={<History />}
          title={items.length === 0 ? 'Belum ada riwayat' : 'Tidak ada riwayat di periode ini'}
          desc={items.length === 0
            ? `Riwayat ${jenisLabel.toLowerCase()} yang tersimpan akan muncul di sini.`
            : 'Coba pilih periode lain atau tampilkan semua riwayat.'}
        />
      ) : (
        <>
          {/* ==== Mobile: kartu CRUD (kompak — diperkecil sesuai permintaan owner) ==== */}
          <div className="sm:hidden space-y-2" role="list" aria-label={`Daftar riwayat ${jenisLabel}`}>
            {filteredItems.map((item) => (
              <div
                key={item.id}
                role="listitem"
                onClick={() => openPreview(item)}
                className="bg-white border border-slate-200 rounded-lg p-2.5 cursor-pointer hover:border-slate-300 active:bg-slate-50 transition-colors"
              >
                {/* Baris 1: badge jenis + nomor + tanggal (digabung — hemat tinggi) */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={cn(
                      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-bold',
                      isPotong ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'
                    )}>
                      {isPotong ? <Scissors className="w-2.5 h-2.5" /> : <Calculator className="w-2.5 h-2.5" />}
                      {jenisLabel}
                    </span>
                    {item.nomorUrut && (
                      <span className={cn('text-[11px] font-mono font-semibold tracking-wide', isPotong ? 'text-teal-700' : 'text-blue-700')}>
                        {item.nomorUrut}
                      </span>
                    )}
                  </div>
                  <span className="flex items-center gap-1 text-[11px] text-slate-400 shrink-0">
                    <CalendarDays className="w-3 h-3" />
                    {formatDateShort(item.createdAt)}
                  </span>
                </div>

                {/* Baris 2: pelanggan + cetakan */}
                <div className="flex items-start gap-1.5 min-w-0">
                  <User className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-[18px] text-slate-900 truncate leading-tight">
                      {item.customerName || '-'}
                    </p>
                    <p className="text-[13.5px] text-slate-500 truncate leading-tight">
                      {item.printName || '-'}
                    </p>
                  </div>
                </div>

                {/* Baris 3: bahan kertas + gramatur (+ ukuran potong utk potong kertas) */}
                <div className="flex items-center gap-1.5 mt-1.5 min-w-0 text-[13px] text-slate-600">
                  <FileText className="w-3 h-3 shrink-0 text-slate-400" />
                  <span className="truncate">
                    <span className="font-medium">{item.paperName || '-'}</span>
                    {item.grammage && item.grammage !== '0' ? ` · ${item.grammage} gsm` : ''}
                    {isPotong && item.cutSizeLabel ? ` · Potong: ${item.cutSizeLabel}` : ''}
                  </span>
                </div>

                {/* Baris 4: ringkasan angka — potong: 3 kolom (Total pindah ke bawah sejajar Hapus, angka penuh); cetakan: 3 kolom (Total juga pindah ke bawah) */}
                {isPotong ? (
                  <div className="grid grid-cols-2 gap-1 mt-2 bg-slate-50 rounded-lg px-1.5 py-1.5 text-center">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-slate-800 leading-tight truncate">
                        {item.potonganPerLembar != null && item.potonganPerLembar > 0 ? item.potonganPerLembar.toLocaleString('id-ID') : '-'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">Potongan/Lbr</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[14px] font-extrabold text-slate-800 leading-tight truncate">
                        {item.pricePerSheet > 0 ? formatRp(item.pricePerSheet) : '-'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">Harga/Lbr</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-slate-800 leading-tight truncate">{item.quantity.toLocaleString('id-ID')} lbr</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">Jumlah</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-teal-700 leading-tight truncate">
                        {item.sheetsNeeded != null && item.sheetsNeeded > 0 ? `${item.sheetsNeeded.toLocaleString('id-ID')} lbr` : '-'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">Lembar Kertas</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1 mt-2 bg-slate-50 rounded-lg px-1.5 py-1.5 text-center">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800 leading-tight truncate">{item.quantity.toLocaleString('id-ID')} lbr</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">Jumlah</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-extrabold text-slate-800 leading-tight truncate">
                        {item.modalPerPcs > 0 ? formatRpCompact(item.modalPerPcs) : '-'}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">Modal/pcs</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800 leading-tight truncate">
                        {item.jualPerPcs > 0 ? formatRpCompact(item.jualPerPcs) : '-'}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">Jual/pcs</p>
                    </div>
                  </div>
                )}

                {/* Baris 5: Total (PENUH, 16px extrabold) di kiri sejajar aksi CRUD/Hapus di kanan — utk kedua sumber */}
                <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100">
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-400 leading-tight">Total</p>
                    <p className="text-[16px] font-extrabold text-emerald-700 leading-tight truncate">
                      {item.grandTotal > 0 ? formatRp(item.grandTotal) : '-'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {detailButton(item)}
                    {editButton(item)}
                    {deleteButton(item)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ==== Desktop: tabel — tanpa kotak/bingkai (permintaan owner) ==== */}
          <div className="hidden sm:block">
            <div className="overflow-x-auto">
              <table className={cn('w-full', isPotong ? 'min-w-[1240px]' : 'min-w-[960px]')}>
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {([
                      'Nomor', 'Nama Pelanggan', 'Nama Cetakan', 'Kertas / Bahan',
                      ...(isPotong ? ['Ukuran Potong', 'Potongan/Lbr', 'Lembar Kertas'] : []),
                      'Jumlah',
                      ...(isPotong ? ['Harga/Lembar'] : ['Modal/pcs', 'Jual/pcs']),
                      'Total Harga', 'Tanggal', 'Aksi',
                    ] as string[]).map((h, i, arr) => (
                      <th key={h} className={cn(
                        'px-4 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap',
                        i === arr.length - 1 && 'text-center'
                      )}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => openPreview(item)}
                    >
                      <td className="px-4 py-2.5">
                        {item.nomorUrut
                          ? <span className={cn('font-semibold text-xs font-mono', isPotong ? 'text-teal-700' : 'text-blue-700')}>{item.nomorUrut}</span>
                          : <span className="text-slate-400">-</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-slate-800">{item.customerName || '-'}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {isPotong
                            ? <Scissors className="w-4 h-4 text-teal-600 shrink-0" />
                            : <Calculator className="w-4 h-4 text-blue-600 shrink-0" />}
                          <span className="text-slate-700 truncate max-w-[180px]">{item.printName || '-'}</span>
                        </div>
                      </td>
                      {/* Kertas / Bahan + gramatur */}
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="text-xs font-medium text-slate-700">{item.paperName || '-'}</span>
                        {item.grammage && item.grammage !== '0' && (
                          <span className="text-[11px] text-slate-400"> · {item.grammage} gsm</span>
                        )}
                      </td>
                      {isPotong && (
                        <td className="px-4 py-2.5 text-xs text-slate-700 whitespace-nowrap">{item.cutSizeLabel || '-'}</td>
                      )}
                      {isPotong && (
                        <td className="px-4 py-2.5 text-sm text-slate-700 whitespace-nowrap">
                          {item.potonganPerLembar != null && item.potonganPerLembar > 0
                            ? item.potonganPerLembar.toLocaleString('id-ID')
                            : '-'}
                        </td>
                      )}
                      {isPotong && (
                        <td className="px-4 py-2.5 text-sm text-slate-700 whitespace-nowrap">
                          {item.sheetsNeeded != null && item.sheetsNeeded > 0
                            ? `${item.sheetsNeeded.toLocaleString('id-ID')} lbr`
                            : '-'}
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-sm text-slate-700 whitespace-nowrap">
                        {item.quantity.toLocaleString('id-ID')} lbr
                      </td>
                      {isPotong ? (
                        <td className="px-4 py-2.5 text-sm text-slate-700 whitespace-nowrap">
                          {item.pricePerSheet > 0 ? formatRp(item.pricePerSheet) : '-'}
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-2.5 text-sm text-slate-700 whitespace-nowrap">
                            {item.modalPerPcs > 0 ? formatRp(item.modalPerPcs) : '-'}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-slate-700 whitespace-nowrap">
                            {item.jualPerPcs > 0 ? formatRp(item.jualPerPcs) : '-'}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-2.5">
                        <span className="font-bold text-emerald-700 whitespace-nowrap">{formatRp(item.grandTotal)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{formatDate(item.createdAt)}</td>
                      <td className="px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => openPreview(item)}
                            title={t('preview')}
                            className="p-2 rounded-lg bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleEdit(item)}
                            title="Edit perhitungan di kalkulator"
                            className="p-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {deleteButton(item)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ===== DIALOG KONFIRMASI HAPUS ===== */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o && !isDeleting) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus riwayat ini?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  Riwayat <strong>{deleteTarget.printName || '-'}</strong>
                  {deleteTarget.customerName ? <> untuk <strong>{deleteTarget.customerName}</strong></> : null}
                  {' '}akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={(e) => { e.preventDefault(); handleDeleteConfirmed() }}
              className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-600"
            >
              {isDeleting ? <><Loader2 className="w-4 h-4 animate-spin" /> Menghapus...</> : 'Ya, Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== DIALOG PREVIEW ===== */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto p-0">
          <DialogHeader className="px-4 sm:px-5 pt-4 pb-3 border-b border-slate-200">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-violet-600" />
              {isPotong ? 'Detail Riwayat Potong Kertas' : 'Detail Rincian Cetakan'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Rincian perhitungan beserta tombol aksi
            </DialogDescription>
          </DialogHeader>

          {previewItem && (
            <>
              {isPotong ? (
                /* ---------- PREVIEW POTONG KERTAS ---------- */
                <FixedDocScaler fixedWidth={720} innerRef={previewRef} innerClassName="p-5 bg-white space-y-4">
                  {/* Header */}
                  <div className="text-center pb-3 border-b-2 border-slate-200">
                    <div className="inline-flex items-center justify-center gap-1.5 mb-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200">
                      <Scissors className="w-3.5 h-3.5 text-teal-600" />
                      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Potong Kertas</span>
                    </div>
                    <h1 className="text-lg font-bold text-slate-900">Rincian Potong Kertas</h1>
                    <p className="text-xs text-slate-500 mt-1">
                      {previewItem.printName || '-'} · {formatDate(previewItem.createdAt)}
                    </p>
                    {previewItem.nomorUrut && (
                      <p className="text-[10px] text-slate-400 mt-0.5 font-mono tracking-wide">No. {previewItem.nomorUrut}</p>
                    )}
                  </div>

                  {/* Informasi cetakan */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center">
                        <FileText className="w-3 h-3 text-blue-600" />
                      </div>
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Informasi Cetakan</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-500 font-medium">Nama Customer</p>
                        <p className="text-sm font-bold text-slate-800 break-words">{previewItem.customerName || '-'}</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-500 font-medium">Nama Cetakan</p>
                        <p className="text-sm font-bold text-slate-800 break-words">{previewItem.printName || '-'}</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-500 font-medium">Ukuran Potongan</p>
                        <p className="text-sm font-bold text-slate-800">{previewItem.cutSizeLabel || '-'}</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-500 font-medium">Setelan Kertas</p>
                        <p className="text-sm font-bold text-slate-800">{(previewItem.raw as RiwayatPotongKertasRow).setelanKertas || '0'}</p>
                      </div>
                      {previewItem.jumlahPesanan && parseInt(previewItem.jumlahPesanan) > 0 && (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                          <p className="text-[10px] text-slate-500 font-medium">Jumlah Pesanan</p>
                          <p className="text-sm font-bold text-slate-800">{parseInt(previewItem.jumlahPesanan).toLocaleString('id-ID')} <span className="text-xs font-normal text-slate-400">pcs</span></p>
                        </div>
                      )}
                      {previewItem.berapaMata && parseInt(previewItem.berapaMata) > 0 && (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                          <p className="text-[10px] text-slate-500 font-medium">Berapa Mata</p>
                          <p className="text-sm font-bold text-slate-800">{previewItem.berapaMata} <span className="text-xs font-normal text-slate-400">mata</span></p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bahan kertas */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-5 h-5 rounded bg-teal-100 flex items-center justify-center">
                        <FileText className="w-3 h-3 text-teal-600" />
                      </div>
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Bahan Kertas</p>
                    </div>
                    <div className="bg-teal-50 border border-teal-100 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div>
                          <p className="text-sm font-bold text-teal-800">{previewItem.paperName || '-'}</p>
                          <p className="text-[10px] text-teal-500">
                            {previewItem.grammage && previewItem.grammage !== '0' ? `${previewItem.grammage} gsm · ` : ''}
                            Ukuran Bahan: {previewItem.paperSizeLabel || '-'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-extrabold text-teal-700">{formatRp(previewItem.grandTotal)}</p>
                          <p className="text-[9px] text-teal-500">Total harga</p>
                        </div>
                      </div>
                      {previewItem.pricePerSheet > 0 && (
                        <div className="mt-1.5 pt-1.5 border-t border-teal-200 text-[10px] text-teal-600">
                          Harga per lembar: <strong>{formatRp(previewItem.pricePerSheet)}</strong>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Hasil potongan */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-5 h-5 rounded bg-violet-100 flex items-center justify-center">
                        <Scissors className="w-3 h-3 text-violet-600" />
                      </div>
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Hasil Potongan</p>
                    </div>
                    <div className="bg-violet-50 border border-violet-100 rounded-lg p-3 grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] text-violet-500 font-medium">Lembar Hasil</p>
                        <p className="text-sm font-bold text-violet-800">{previewItem.quantity.toLocaleString('id-ID')} <span className="text-xs font-normal">lembar</span></p>
                      </div>
                      <div>
                        <p className="text-[10px] text-violet-500 font-medium">Lembar Dibutuhkan</p>
                        <p className="text-sm font-bold text-violet-800">
                          {previewItem.sheetsNeeded != null ? previewItem.sheetsNeeded.toLocaleString('id-ID') : '-'} <span className="text-xs font-normal">lembar</span>
                        </p>
                      </div>
                      {(previewItem.raw as RiwayatPotongKertasRow).strategy && (
                        <div className="col-span-2">
                          <p className="text-[10px] text-violet-500 font-medium">Strategi Potong</p>
                          <p className="text-xs font-semibold text-violet-800">{(previewItem.raw as RiwayatPotongKertasRow).strategy}</p>
                        </div>
                      )}
                      {(previewItem.raw as RiwayatPotongKertasRow).efficiency > 0 && (
                        <div className="col-span-2">
                          <p className="text-[10px] text-violet-500 font-medium">Efisiensi Kertas</p>
                          <p className="text-xs font-semibold text-violet-800">{(previewItem.raw as RiwayatPotongKertasRow).efficiency.toFixed(1)}%</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Grand total */}
                  <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl p-4 flex items-center justify-between shadow-lg shadow-orange-500/25">
                    <div>
                      <p className="text-xs text-orange-100">Grand Total</p>
                      <p className="text-2xl font-extrabold text-white">{formatRp(previewItem.grandTotal)}</p>
                      {previewItem.jumlahPesanan && parseInt(previewItem.jumlahPesanan) > 0 && previewItem.grandTotal > 0 && (
                        <p className="text-[11px] text-orange-100 font-semibold mt-0.5">
                          ≈ {formatRp(Math.round(previewItem.grandTotal / parseInt(previewItem.jumlahPesanan)))} /pcs
                        </p>
                      )}
                    </div>
                    <div className="text-right text-[10px] text-orange-100/90 space-y-0.5">
                      <p>{previewItem.quantity.toLocaleString('id-ID')} lembar</p>
                      {previewItem.pricePerSheet > 0 && <p>{formatRp(previewItem.pricePerSheet)}/lbr</p>}
                    </div>
                  </div>
                </FixedDocScaler>
              ) : (
                /* ---------- PREVIEW HITUNG CETAKAN (RincianCetakanPreview) ---------- */
                <FixedDocScaler fixedWidth={720} innerRef={previewRef} innerClassName="p-4 bg-white">
                  <RincianCetakanPreview data={previewRincian} />
                </FixedDocScaler>
              )}

              {/* Tombol aksi: Cetak · JPG · Edit */}
              <div className="sticky bottom-0 bg-white border-t border-slate-200 px-4 py-3 sm:px-5">
                <div className="flex gap-2">
                  <button onClick={handlePrint} disabled={isPrinting}
                    title="Cetak rincian (fit A5 portrait, sama persis dengan preview)"
                    className="flex-1 min-w-0 flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-semibold py-2 rounded-lg text-xs whitespace-nowrap transition-colors">
                    {isPrinting ? <><Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />Cetak...</> : <><Printer className="w-3.5 h-3.5 shrink-0" /> Cetak</>}
                  </button>
                  <button onClick={handleJpg} disabled={isGeneratingJpg}
                    title="Kirim gambar JPG A5 portrait (WhatsApp / unduh)"
                    className="flex-1 min-w-0 flex items-center justify-center gap-1 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-400 text-white font-semibold py-2 rounded-lg text-xs whitespace-nowrap transition-colors">
                    {isGeneratingJpg ? <><Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />JPG...</> : <><FileImage className="w-3.5 h-3.5 shrink-0" /> JPG</>}
                  </button>
                  <button onClick={() => handleEdit(previewItem)} title="Edit perhitungan di kalkulator"
                    className="flex-1 min-w-0 flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 rounded-lg text-xs whitespace-nowrap transition-colors">
                    <Pencil className="w-3.5 h-3.5 shrink-0" /> Edit
                  </button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
