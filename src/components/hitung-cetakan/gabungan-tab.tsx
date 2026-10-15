'use client'

/**
 * TAB "GABUNG" — Hitung Cetakan — GABUNGAN 2 RIWAYAT (CRUD + PREVIEW 3 BAGIAN)
 *
 * Alur: pilih TEPAT 2 riwayat Hitung Cetakan yang sudah tersimpan → bandingkan
 * detail keduanya berdampingan → atur (nama proyek, JP gabungan, profit) →
 * Preview 3 bagian (Riwayat 1 / Riwayat 2 / Hasil Gabungan + Tampilan Semua) →
 * Simpan ke DATABASE (dokumen GB, model GabunganHitungCetakan) → buka kembali,
 * edit, duplikat, cetak, unduh JPG, hapus — tanpa mengubah riwayat sumber.
 *
 * Validasi pemilihan:
 *   - 0 dipilih  : panduan memilih
 *   - 1 dipilih  : pesan "pilih 1 riwayat lagi"
 *   - 2 dipilih  : siap digabung
 *   - ke-3       : DITOLAK + pesan "maksimal dua riwayat digunakan"
 *
 * Perhitungan (src/lib/gabungan-calc.ts — satu sumber kebenaran, dipakai
 * server & klien): Total Biaya = subTotal R1 + subTotal R2 (TANPA profit),
 * Profit = masing-masing / seragam %, Grand = Total + Profit,
 * Modal/pcs & Jual/pcs = ÷ JP gabungan (tak sah bila JP 0).
 *
 * JPG/Cetak: dokumen dirender di instance offscreen berukuran tetap
 * (captureRef) yang SELALU tersedia saat 2 riwayat terpilih — tombol
 * Cetak/JPG berfungsi tanpa perlu membuka preview dulu. Preview Riwayat
 * 1 & 2 memakai komponen ASLI RincianCetakanPreview (dokumen rincian yang
 * sama persis dengan preview satu riwayat).
 *
 * Fitur lama yang dipertahankan: pencarian langsung, filter periode +
 * pelanggan, profit seragam, JP gabungan manual, cetak hi-res, JPG/WhatsApp,
 * kartu mobile, Kosongkan dengan dialog konfirmasi.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Layers, Search, Eye, Printer, FileImage, Loader2, X, Square, CheckSquare, Percent, Calculator, Boxes, Trash2, FileText, Repeat, Save, FileStack, ListPlus, AlertTriangle } from 'lucide-react'
import { captureElementAsJpg, fitBlobToA5, HIRES_PIXEL_RATIO } from '@/lib/capture-jpg'
import { printBlobHiRes } from '@/lib/print-hi-res'
import { shareJpgToWhatsApp } from '@/lib/share-jpg'
import { FixedDocScaler } from '@/components/fixed-doc-scaler'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { RiwayatPeriodFilter, RiwayatCustomerFilter, riwayatDateRange, type RiwayatPeriod } from '@/components/dokupro/riwayat-period-filter'
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { fmtRp, fmtHargaPcs, parseJp } from '@/components/hitung-cetakan/gabungan-format'
import { hitungGabungan, parseSnapshot, type GabunganHasil, type GabunganMetodeProfit } from '@/lib/gabungan-calc'
import { GabunganCompareGrid, type CompareRow } from '@/components/hitung-cetakan/gabungan-compare'
import { GabunganDokumen, GabunganPreviewContent, GABUNGAN_PREVIEW_TABS, DokumenRiwayatSumber, type GabunganPreviewTab } from '@/components/hitung-cetakan/gabungan-dokumen'
import { GabunganRiwayatList, type GabunganDoc } from '@/components/hitung-cetakan/gabungan-riwayat-list'
import type { RiwayatCetakanRow } from '@/components/rincian-cetakan-preview'

// ===== Helpers =====

function userKey(base: string): string {
  try {
    const a = JSON.parse(localStorage.getItem('auth') || '{}')
    if (a.id) return `${base}_${a.id}`
  } catch {}
  return base
}

/** Label kertas: nama · gsm (tanpa jumlah warna). */
const labelKertas = (r: { paperName?: string | null; paperGrammage?: string | number | null }) =>
  [r.paperName || '', r.paperGrammage ? `${r.paperGrammage} gsm` : ''].filter(Boolean).join(' · ')

const tglId = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'

// ===== Tipe =====

/** Field riwayat yang dipakai gabungan (baris dari /api/riwayat-cetakan). */
interface GabungBaris extends CompareRow {
  /** Baris riwayat selalu punya id (dari DB). */
  id: string
  warna2?: string | null
  warnaKhusus2?: string | null
}

/** Konteks preview dialog — builder (kalkulasi live) atau dokumen tersimpan (snapshot). */
interface PreviewCtx {
  kind: 'builder' | 'doc'
  nomorDokumen: string
  tanggal: string | Date
  customerName: string
  namaProyek: string
  nomorSumber1: string
  nomorSumber2: string
  r1: RiwayatCetakanRow | null
  r2: RiwayatCetakanRow | null
  hasil: GabunganHasil
  catatan: string
}

const PAGE_SIZE = 20

export function GabunganTab({ rows }: { rows: GabungBaris[] }) {
  // ===== View: buat gabungan / riwayat gabungan =====
  const [view, setView] = useState<'buat' | 'riwayat'>('buat')

  // ===== Pilihan komponen (MAKS 2, persist di localStorage) =====
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selLoaded, setSelLoaded] = useState(false)
  const [search, setSearch] = useState('')
  // ===== Filter periode + pelanggan (gaya tab Riwayat) =====
  const [period, setPeriod] = useState<RiwayatPeriod>('all')
  const [fDateFrom, setFDateFrom] = useState('')
  const [fDateTo, setFDateTo] = useState('')
  const [fMonth, setFMonth] = useState<number | null>(new Date().getMonth() + 1)
  const [fYear, setFYear] = useState<number | null>(new Date().getFullYear())
  const [customerFilter, setCustomerFilter] = useState('')
  const [page, setPage] = useState(1)
  // ===== Dialog =====
  const [clearOpen, setClearOpen] = useState(false)
  const [detailRow, setDetailRow] = useState<GabungBaris | null>(null)
  const [previewOneRow, setPreviewOneRow] = useState<GabungBaris | null>(null)
  const [gantiSlot, setGantiSlot] = useState<1 | 2 | null>(null)
  const [gantiSearch, setGantiSearch] = useState('')
  // ===== Pengaturan gabungan =====
  const [namaProyek, setNamaProyek] = useState('')
  const [jumlahGabungan, setJumlahGabungan] = useState('')
  const [profitMode, setProfitMode] = useState<GabunganMetodeProfit>('masing_masing')
  const [profitSeragam, setProfitSeragam] = useState('')
  const [catatan, setCatatan] = useState('')
  // ===== Simpan =====
  const [isSaving, setIsSaving] = useState(false)
  const [nextNumber, setNextNumber] = useState('')
  // ===== Riwayat gabungan (dokumen tersimpan) =====
  const [docs, setDocs] = useState<GabunganDoc[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [docsLoadedOnce, setDocsLoadedOnce] = useState(false)
  // ===== Preview 3 bagian =====
  const [previewCtx, setPreviewCtx] = useState<PreviewCtx | null>(null)
  const [previewTab, setPreviewTab] = useState<GabunganPreviewTab>('gabungan')
  // ===== Cetak / JPG =====
  const [isPrinting, setIsPrinting] = useState(false)
  const [isGeneratingJpg, setIsGeneratingJpg] = useState(false)
  // Instance dokumen offscreen — sumber capture JPG/Cetak (selalu mounted
  // saat 2 riwayat terpilih / saat preview dokumen dibuka).
  const capGabRef = useRef<HTMLDivElement>(null)
  const capR1Ref = useRef<HTMLDivElement>(null)
  const capR2Ref = useRef<HTMLDivElement>(null)
  const compareRef = useRef<HTMLDivElement>(null)

  // Muat pilihan tersimpan sekali saat mount (cap 2)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(userKey('hitung-cetakan-gabungan-ids'))
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) setSelectedIds(arr.filter((x: unknown) => typeof x === 'string').slice(0, 2))
      }
    } catch {}
    setSelLoaded(true)
  }, [])

  // Simpan pilihan tiap berubah (setelah load awal)
  useEffect(() => {
    if (selLoaded) {
      try { localStorage.setItem(userKey('hitung-cetakan-gabungan-ids'), JSON.stringify(selectedIds)) } catch {}
    }
  }, [selectedIds, selLoaded])

  // ===== Muat dokumen gabungan =====
  const fetchDocs = useCallback(async () => {
    setDocsLoading(true)
    try {
      const res = await fetch('/api/gabungan-cetakan')
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(json?.error || 'Gagal memuat dokumen gabungan')
        return
      }
      setDocs(Array.isArray(json) ? (json as GabunganDoc[]) : [])
      setDocsLoadedOnce(true)
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setDocsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (view === 'riwayat' && !docsLoadedOnce && !docsLoading) fetchDocs()
  }, [view, docsLoadedOnce, docsLoading, fetchDocs])

  // ===== Nomor dokumen berikutnya (saat 2 terpilih) =====
  useEffect(() => {
    if (selectedIds.length !== 2) { setNextNumber(''); return }
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/gabungan-cetakan?preview=next-number')
        const json = await res.json().catch(() => null)
        if (alive && res.ok && json?.nextNumber) setNextNumber(json.nextNumber)
      } catch {}
    })()
    return () => { alive = false }
  }, [selectedIds.length])

  // ===== Toggle pilih (MAKS 2 + pesan validasi) =====
  const toggle = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 2) {
        toast.warning('Maksimal 2 riwayat', {
          description: 'Maksimal dua riwayat digunakan dalam satu gabungan. Keluarkan salah satu pilihan terlebih dahulu.',
        })
        return prev
      }
      const next = [...prev, id]
      if (next.length === 1) {
        toast.info('Pilih 1 riwayat lagi', {
          description: 'Satu riwayat dipilih — pilih satu riwayat lagi untuk menggabungkan.',
        })
      } else if (next.length === 2) {
        toast.success('2 riwayat siap digabung', {
          description: 'Periksa perbandingan di bawah, lalu buka Preview Gabungan.',
        })
      }
      return next
    })
  }

  /** Pilih otomatis 2 teratas dari hasil filter (pengganti "Pilih Semua" saat maks 2). */
  const pilihDuaTeratas = () => {
    const sisa = filtered.filter(r => r.id && !selectedIds.includes(r.id)).slice(0, 2 - selectedIds.length)
    if (sisa.length === 0) { toast.info('Semua pilihan sudah terisi'); return }
    const next = [...selectedIds, ...sisa.map(r => r.id as string)]
    setSelectedIds(next.slice(0, 2))
    if (next.length > 2) toast.info('Maksimal 2 riwayat — 2 teratas dipilih')
  }

  // Rentang tanggal efektif utk filter periode
  const eff = useMemo(
    () => riwayatDateRange(period, fDateFrom, fDateTo, fMonth, fYear),
    [period, fDateFrom, fDateTo, fMonth, fYear]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      const t = String(r?.createdAt || '').slice(0, 10)
      if (eff.dateFrom && t && t < eff.dateFrom) return false
      if (eff.dateTo && t && t > eff.dateTo) return false
      if (customerFilter && String(r?.customerName || '').trim() !== customerFilter) return false
      if (q && !`${r.printName || ''} ${r.customerName || ''} ${r.nomorUrut || ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, search, customerFilter, eff])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paged = useMemo(() => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [filtered, safePage])
  useEffect(() => { setPage(1) }, [search, customerFilter, period, fDateFrom, fDateTo])

  const filtersActive = period !== 'all' || !!fDateFrom || !!fDateTo || !!customerFilter || !!search.trim()
  const resetFilters = () => {
    setPeriod('all')
    setFDateFrom('')
    setFDateTo('')
    setCustomerFilter('')
    setSearch('')
  }

  // Opsi dropdown pelanggan: nama unik dari SEMUA riwayat (terurut)
  const customerOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) {
      const name = String(r?.customerName || '').trim()
      if (name && name !== '-') set.add(name)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'))
  }, [rows])

  const selected = useMemo(() => rows.filter(r => selectedIds.includes(r.id)), [rows, selectedIds])
  const r1 = (selected[0] ?? null) as GabungBaris | null
  const r2 = (selected[1] ?? null) as GabungBaris | null

  // ===== Perhitungan gabungan (live — rumus sama dgn server) =====
  const hasil = useMemo(
    () =>
      hitungGabungan({
        src1: r1,
        src2: r2,
        jumlahPesananGabungan: parseJp(jumlahGabungan),
        metodeProfit: profitMode,
        profitPercent: profitSeragam,
      }),
    [r1, r2, jumlahGabungan, profitMode, profitSeragam]
  )

  const gabungCustomer = useMemo(() => {
    const withCust = selected.find(r => (r.customerName || '').trim() !== '')
    return withCust ? (withCust.customerName || '').trim() : ''
  }, [selected])

  // ===== Cetak & JPG hi-res 300 DPI (capture dari instance offscreen — tidak perlu preview terbuka) =====
  const handleCapture = useCallback(
    async (mode: 'print' | 'jpg', docKey: 'gab' | 'r1' | 'r2' = 'gab') => {
      const el = docKey === 'r1' ? capR1Ref.current : docKey === 'r2' ? capR2Ref.current : capGabRef.current
      if (!el) {
        toast.error('Pilih 2 riwayat terlebih dahulu')
        return
      }
      const width = docKey === 'gab' ? 768 : 720
      const judulSumber =
        docKey === 'r1' ? (r1?.printName || 'Riwayat 1') : docKey === 'r2' ? (r2?.printName || 'Riwayat 2') : (namaProyek || gabungCustomer || 'gabungan')
      if (mode === 'print') {
        setIsPrinting(true)
        try {
          const blob = await captureElementAsJpg(el, { pixelRatio: HIRES_PIXEL_RATIO, fixedWidth: width })
          const title =
            docKey === 'gab'
              ? `Rincian Gabungan Hitung Cetakan ${judulSumber}`
              : `Rincian Cetakan ${judulSumber}`
          const ok = await printBlobHiRes(blob, { title, page: 'A5 portrait', margin: '5mm' })
          if (!ok) { toast.error('Popup diblokir. Izinkan popup untuk mencetak.'); return }
        } catch (e) {
          console.error('Print error:', e)
          toast.error('Gagal menyiapkan cetakan')
        } finally { setIsPrinting(false) }
      } else {
        setIsGeneratingJpg(true)
        try {
          const rawBlob = await captureElementAsJpg(el, { pixelRatio: HIRES_PIXEL_RATIO, fixedWidth: width })
          const blob = await fitBlobToA5(rawBlob, { orientation: 'portrait', marginPct: 3 })
          const custLabel = judulSumber.replace(/\s+/g, '-').toLowerCase()
          const fileName = docKey === 'gab'
            ? `rincian-gabungan-${custLabel}-${Date.now()}.jpg`
            : `rincian-${custLabel}-${Date.now()}.jpg`
          const result = await shareJpgToWhatsApp({
            blob,
            fileName,
            documentLabel: docKey === 'gab' ? 'Rincian Gabungan Hitung Cetakan' : 'Rincian Cetakan',
          })
          if (result.status === 'shared') {
            toast.success('Gambar JPG dikirim ke WhatsApp')
          } else if (result.status === 'downloaded') {
            toast.success('JPG diunduh ke perangkat', { description: 'File JPG telah disimpan ke folder Downloads.' })
          } else if (result.status === 'error') {
            toast.error(result.error || 'Gagal memproses JPG')
          }
        } catch (e) {
          console.error('JPG generation error:', e)
          toast.error('Gagal menghasilkan gambar JPG')
        } finally { setIsGeneratingJpg(false) }
      }
    },
    [r1, r2, namaProyek, gabungCustomer]
  )

  // ===== Simpan dokumen gabungan (CREATE) =====
  const handleSave = async () => {
    if (!r1 || !r2) {
      toast.error('Pilih 2 riwayat terlebih dahulu', { description: selectedIds.length === 1 ? 'Pilih 1 riwayat lagi untuk menggabungkan.' : 'Pilih dua riwayat dari daftar.' })
      return
    }
    if (hasil.jumlahPesananGabungan <= 0) {
      toast.error('Jumlah Pesanan Gabungan belum valid', { description: hasil.peringatan[0] || 'Tentukan jumlah pesanan gabungan terlebih dahulu.' })
      return
    }
    setIsSaving(true)
    try {
      const res = await fetch('/api/gabungan-cetakan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          riwayatCetakanId1: r1.id,
          riwayatCetakanId2: r2.id,
          namaProyek: namaProyek.trim(),
          jumlahPesananGabungan: hasil.jumlahPesananGabungan,
          metodeProfit: hasil.metodeProfit,
          profitPercent: hasil.profitPercent,
          catatan: catatan.trim(),
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(json?.error || 'Gagal menyimpan dokumen gabungan', { description: Array.isArray(json?.peringatan) ? json.peringatan[0] : undefined })
        return
      }
      toast.success(`Dokumen gabungan tersimpan — ${json?.nomorUrut || ''}`, { description: `Grand Total ${fmtRp(json?.grandTotal ?? hasil.grandTotal)}` })
      setDocsLoadedOnce(false)
      if (view === 'riwayat') fetchDocs()
      const numRes = await fetch('/api/gabungan-cetakan?preview=next-number').catch(() => null)
      if (numRes?.ok) {
        const numJson = await numRes.json().catch(() => null)
        if (numJson?.nextNumber) setNextNumber(numJson.nextNumber)
      }
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setIsSaving(false)
    }
  }

  // ===== Duplikat dokumen (dari Riwayat Gabungan) =====
  const handleDuplicate = useCallback(
    async (doc: GabunganDoc) => {
      try {
        const res = await fetch('/api/gabungan-cetakan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            riwayatCetakanId1: doc.riwayatCetakanId1,
            riwayatCetakanId2: doc.riwayatCetakanId2,
            namaProyek: doc.namaProyek ? `${doc.namaProyek} (Salinan)` : 'Salinan gabungan',
            jumlahPesananGabungan: doc.jumlahPesananGabungan,
            metodeProfit: doc.metodeProfit,
            profitPercent: doc.profitPercent,
            catatan: doc.catatan,
          }),
        })
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          toast.error(json?.error || 'Gagal menduplikat dokumen gabungan')
          return
        }
        toast.success(`Duplikat tersimpan — ${json?.nomorUrut || ''}`)
        fetchDocs()
      } catch {
        toast.error('Gagal terhubung ke server')
      }
    },
    [fetchDocs]
  )

  // ===== Preview =====
  const hasilDariDoc = (doc: GabunganDoc): GabunganHasil => {
    const snap = parseSnapshot(doc.snapshotData)
    const jp1 = parseJp((snap?.r1 as Record<string, unknown>)?.jumlahPesanan)
    const jp2 = parseJp((snap?.r2 as Record<string, unknown>)?.jumlahPesanan)
    return {
      subTotal1: Number((snap?.r1 as Record<string, unknown>)?.subTotal) || 0,
      subTotal2: Number((snap?.r2 as Record<string, unknown>)?.subTotal) || 0,
      profit1: Number((snap?.r1 as Record<string, unknown>)?.profitAmount) || 0,
      profit2: Number((snap?.r2 as Record<string, unknown>)?.profitAmount) || 0,
      profitPercent1: Math.round(Number((snap?.r1 as Record<string, unknown>)?.profitPercent) || 0),
      profitPercent2: Math.round(Number((snap?.r2 as Record<string, unknown>)?.profitPercent) || 0),
      grandTotal1: Number((snap?.r1 as Record<string, unknown>)?.grandTotal) || 0,
      grandTotal2: Number((snap?.r2 as Record<string, unknown>)?.grandTotal) || 0,
      jp1, jp2,
      jpBeda: jp1 > 0 && jp2 > 0 && jp1 !== jp2,
      jpSama: jp1 > 0 && jp1 === jp2,
      jpAuto: jp1 > 0 && jp1 === jp2 ? jp1 : 0,
      jumlahPesananGabungan: doc.jumlahPesananGabungan,
      metodeProfit: doc.metodeProfit === 'seragam' ? 'seragam' : 'masing_masing',
      profitPercent: doc.profitPercent || 0,
      totalBiayaDasar: doc.totalBiayaDasar || 0,
      totalProfit: doc.totalProfit || 0,
      grandTotal: doc.grandTotal || 0,
      modalPerPcs: doc.modalPerPcs || 0,
      hargaJualPerPcs: doc.hargaJualPerPcs || 0,
      peringatan: [],
    }
  }

  const openPreviewBuilder = () => {
    if (!r1 || !r2) {
      toast.error('Pilih 2 riwayat terlebih dahulu', { description: selectedIds.length === 1 ? 'Pilih 1 riwayat lagi untuk menggabungkan.' : '' })
      return
    }
    setPreviewTab('gabungan')
    setPreviewCtx({
      kind: 'builder',
      nomorDokumen: nextNumber,
      tanggal: new Date(),
      customerName: gabungCustomer,
      namaProyek: namaProyek.trim(),
      nomorSumber1: r1.nomorUrut || '',
      nomorSumber2: r2.nomorUrut || '',
      r1: r1 as unknown as RiwayatCetakanRow,
      r2: r2 as unknown as RiwayatCetakanRow,
      hasil,
      catatan: catatan.trim(),
    })
  }

  const openPreviewDoc = useCallback((doc: GabunganDoc) => {
    const snap = parseSnapshot(doc.snapshotData)
    if (!snap || !snap.r1 || !Object.keys(snap.r1).length) {
      toast.error('Gagal memuat preview', { description: 'Snapshot dokumen tidak dapat dibaca.' })
      return
    }
    setPreviewTab('gabungan')
    setPreviewCtx({
      kind: 'doc',
      nomorDokumen: doc.nomorUrut,
      tanggal: doc.createdAt,
      customerName: doc.customerName,
      namaProyek: doc.namaProyek,
      nomorSumber1: doc.nomorSumber1,
      nomorSumber2: doc.nomorSumber2,
      r1: snap.r1 as RiwayatCetakanRow,
      r2: snap.r2 as RiwayatCetakanRow,
      hasil: hasilDariDoc(doc),
      catatan: doc.catatan,
    })
  }, [])

  const onEditedDoc = useCallback(
    (doc: GabunganDoc) => {
      // Setelah edit/ganti sumber — perbarui & buka preview hasil terbaru
      openPreviewDoc(doc)
    },
    [openPreviewDoc]
  )

  // ===== Ganti riwayat (pertahankan pasangannya) =====
  const kandidatGanti = useMemo(() => {
    if (!gantiSlot) return []
    const otherId = gantiSlot === 1 ? r2?.id : r1?.id
    const q = gantiSearch.trim().toLowerCase()
    return rows
      .filter(r => r.id !== otherId)
      .filter(r => !q || `${r.printName || ''} ${r.customerName || ''} ${r.nomorUrut || ''}`.toLowerCase().includes(q))
      .slice(0, 30)
  }, [gantiSlot, rows, r1, r2, gantiSearch])

  const pickGanti = (r: GabungBaris) => {
    if (!gantiSlot) return
    setSelectedIds(prev => {
      const base = prev.filter(x => x !== (gantiSlot === 1 ? r1?.id : r2?.id))
      const other = gantiSlot === 1 ? r2?.id : r1?.id
      const next = gantiSlot === 1 ? [r.id, other] : [other, r.id]
      return next.filter((x): x is string => !!x).slice(0, 2).length === 2 ? (next.filter((x): x is string => !!x).slice(0, 2)) : base
    })
    setGantiSlot(null)
    toast.success(`Riwayat ${gantiSlot} diganti`, { description: `Sumber ${gantiSlot === 1 ? '2' : '1'} tetap dipertahankan.` })
  }

  // ===== Kelas tabel =====
  const thCls = 'sticky top-0 z-10 h-10 px-2 bg-slate-100 dark:bg-zinc-800 text-[11px] lg:text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300 whitespace-nowrap'
  const tdCls = 'px-2 py-2.5 text-sm text-slate-700 dark:text-slate-200 align-middle'

  // Data preview dialog aktif
  const pvR1 = previewCtx?.kind === 'builder' ? (r1 as unknown as RiwayatCetakanRow | null) : previewCtx?.r1 ?? null
  const pvR2 = previewCtx?.kind === 'builder' ? (r2 as unknown as RiwayatCetakanRow | null) : previewCtx?.r2 ?? null
  const gabunganDocProps = previewCtx
    ? {
        nomorDokumen: previewCtx.nomorDokumen,
        tanggal: previewCtx.tanggal,
        customerName: previewCtx.customerName,
        namaProyek: previewCtx.namaProyek,
        nomorSumber1: previewCtx.nomorSumber1,
        nomorSumber2: previewCtx.nomorSumber2,
        r1: pvR1,
        r2: pvR2,
        hasil: previewCtx.hasil,
      }
    : null

  // Capture target sesuai tab preview aktif
  const captureKey: 'gab' | 'r1' | 'r2' =
    previewTab === 'r1' ? 'r1' : previewTab === 'r2' ? 'r2' : 'gab'

  // Tutup preview dgn tombol Escape (dialog custom tanpa bawaan Radix)
  useEffect(() => {
    if (!previewCtx) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewCtx(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewCtx])

  return (
    <div className="space-y-4">
      {/* ===== SUB-NAV: Buat Gabungan | Riwayat Gabungan ===== */}
      <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-zinc-800 rounded-xl p-1 w-full sm:w-fit" role="tablist" aria-label="Menu gabungan hitung cetakan">
        {([
          { key: 'buat', label: 'Buat Gabungan', icon: Layers },
          { key: 'riwayat', label: 'Riwayat Gabungan', icon: FileStack, count: docs.length },
        ] as { key: 'buat' | 'riwayat'; label: string; icon: typeof Layers; count?: number }[]).map(t => (
          <button
            key={t.key}
            role="tab"
            aria-selected={view === t.key}
            onClick={() => { setView(t.key); if (t.key === 'riwayat') fetchDocs() }}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-bold transition-colors min-h-[40px] ${view === t.key
              ? 'bg-white dark:bg-zinc-900 text-blue-700 dark:text-blue-400 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            {typeof t.count === 'number' && t.count > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${view === t.key ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'bg-slate-200 dark:bg-zinc-700 text-slate-500'}`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {view === 'buat' ? (
        <>
          {/* ===== TABEL 1: DAFTAR RIWAYAT (pilih 2) ===== */}
          <div className="bg-card rounded-xl border border-slate-200 dark:border-zinc-700 p-3 sm:p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
                  <Layers className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-base font-bold text-slate-800 dark:text-slate-100">
                    Daftar Riwayat
                    <span className="ml-2 text-xs font-semibold text-slate-400">
                      {filtered.length === rows.length
                        ? `${rows.length} hitungan`
                        : `${filtered.length} dari ${rows.length} hitungan`}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
                    Pilih <b>2 riwayat</b> untuk digabung (mis. cetakan tutup atas + tutup bawah kotak kue) — lalu bandingkan & preview gabungan di bawah.
                  </p>
                </div>
              </div>
              {rows.length > 0 && selectedIds.length < 2 && (
                <button
                  onClick={pilihDuaTeratas}
                  className="flex-shrink-0 text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 px-2.5 py-1.5 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors whitespace-nowrap"
                >
                  Pilih 2 Teratas
                </button>
              )}
            </div>

            {/* Indikator pilihan: "x dari 2" + Batal Pilihan + Bandingkan */}
            <div
              className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 border ${selectedIds.length === 2
                ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20'
                : selectedIds.length === 1
                  ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20'
                  : 'border-slate-200 bg-slate-50 dark:border-zinc-700 dark:bg-zinc-800/60'}`}
              role="status"
              aria-live="polite"
            >
              <span className={`text-sm font-bold ${selectedIds.length === 2 ? 'text-emerald-700 dark:text-emerald-300' : selectedIds.length === 1 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}>
                {selectedIds.length === 0 && 'Belum ada riwayat dipilih (0 dari 2)'}
                {selectedIds.length === 1 && '1 dari 2 — pilih 1 riwayat lagi'}
                {selectedIds.length === 2 && '2 dari 2 — siap digabung ✓'}
              </span>
              {selectedIds.length === 2 && (
                <>
                  <button
                    onClick={() => compareRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="ml-auto text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 px-2.5 py-1.5 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                  >
                    Bandingkan 2 Riwayat
                  </button>
                  <button
                    onClick={() => setClearOpen(true)}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 px-2.5 py-1.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors whitespace-nowrap"
                  >
                    Batal Pilihan
                  </button>
                </>
              )}
              {selectedIds.length < 2 && selectedIds.length > 0 && (
                <button
                  onClick={() => setClearOpen(true)}
                  className="ml-auto text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 px-2.5 py-1.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors whitespace-nowrap"
                >
                  Batal Pilihan
                </button>
              )}
            </div>

            {rows.length === 0 ? (
              <div className="border border-dashed border-slate-300 dark:border-zinc-600 rounded-lg py-10 text-center">
                <Boxes className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-zinc-600" />
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Belum ada hitungan tersimpan</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Hitung tiap komponen di tab Editor lalu simpan ke riwayat — setelah itu pilih 2 di sini untuk digabung.</p>
              </div>
            ) : (
              <>
                {/* Filter periode + pelanggan + pencarian */}
                <RiwayatPeriodFilter
                  period={period}
                  onChangePeriod={setPeriod}
                  from={fDateFrom}
                  to={fDateTo}
                  onFromChange={setFDateFrom}
                  onToChange={setFDateTo}
                  month={fMonth}
                  onMonthChange={setFMonth}
                  year={fYear}
                  onYearChange={setFYear}
                  idPrefix="gabung-hc"
                />
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                  <div className="relative flex-1 min-w-0">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <Input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Cari nomor / nama barang / customer..."
                      aria-label="Cari riwayat untuk gabungan"
                      className="pl-9 min-h-[44px] text-sm bg-white"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <RiwayatCustomerFilter
                      idPrefix="gabung-hc"
                      options={customerOptions}
                      value={customerFilter}
                      onChange={setCustomerFilter}
                      ariaLabel="Filter nama pelanggan gabungan"
                      fullWidth
                    />
                    {filtersActive && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 shrink-0"
                        onClick={resetFilters}
                        aria-label="Reset filter"
                        title="Reset Filter"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Mobile: kartu pilih */}
                <div className="lg:hidden space-y-2">
                  {paged.length === 0 && (
                    <div className="border border-dashed border-slate-300 dark:border-zinc-600 rounded-lg py-6 text-center text-sm text-slate-400">
                      Tidak ada riwayat yang cocok dengan filter periode / pelanggan / pencarian.
                    </div>
                  )}
                  {paged.map(r => {
                    const isSel = selectedIds.includes(r.id)
                    const jp = parseJp(r.jumlahPesanan) || parseJp(r.quantity)
                    const pAmt = Number(r.profitAmount) || 0
                    const sub = Number(r.subTotal) || 0
                    const grand = Number(r.grandTotal) || 0
                    const slot = isSel ? (selectedIds.indexOf(r.id) + 1) : 0
                    return (
                      <div
                        key={r.id}
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSel}
                        aria-label={`${isSel ? 'Keluarkan' : 'Pilih'} ${r.printName || 'hitungan'} ${isSel ? 'dari' : 'untuk'} gabungan`}
                        onClick={() => toggle(r.id)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(r.id) } }}
                        className={`rounded-xl border p-3 text-left cursor-pointer transition-colors ${isSel
                          ? slot === 1
                            ? 'border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
                            : 'border-cyan-400 bg-cyan-50 dark:border-cyan-700 dark:bg-cyan-900/20'
                          : 'border-slate-200 bg-card dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600'}`}
                      >
                        <div className="flex items-start gap-2.5">
                          {isSel
                            ? <CheckSquare className={`w-5 h-5 flex-shrink-0 mt-0.5 ${slot === 1 ? 'text-blue-600 dark:text-blue-400' : 'text-cyan-600 dark:text-cyan-400'}`} />
                            : <Square className="w-5 h-5 text-slate-300 dark:text-zinc-600 flex-shrink-0 mt-0.5" />}
                          <div className="min-w-0 flex-1">
                            <p className={`font-bold text-[15px] truncate ${isSel ? 'text-slate-900 dark:text-slate-100' : 'text-slate-800 dark:text-slate-100'}`}>{r.printName || '-'}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{r.customerName || '—'} · {tglId(r.createdAt)}{labelKertas(r) ? ` · ${labelKertas(r)}` : ''}</p>
                          </div>
                          <span className="text-[10px] font-mono font-semibold text-slate-400 flex-shrink-0 mt-1">{r.nomorUrut || '—'}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2.5 bg-slate-50 dark:bg-zinc-800/60 rounded-lg p-2.5 text-center">
                          <div>
                            <p className="text-[12px] font-bold text-slate-800 dark:text-slate-100 leading-tight">{jp > 0 ? jp.toLocaleString('id-ID') : '—'}</p>
                            <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">JP (lbr)</p>
                          </div>
                          <div className="border-x border-slate-200 dark:border-zinc-700">
                            <p className="text-[12px] font-bold text-slate-800 dark:text-slate-100 leading-tight">{fmtRp(sub)}</p>
                            <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">Sub Total</p>
                          </div>
                          <div>
                            <p className="text-[12px] font-extrabold text-slate-800 dark:text-slate-100 leading-tight">{fmtRp(grand)}</p>
                            <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">Grand Total</p>
                          </div>
                        </div>
                        <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                          <span>Modal/pcs {jp > 0 ? fmtHargaPcs(sub / jp) : '—'}</span>
                          <span>{pAmt > 0 ? <>Profit <span className="font-semibold text-violet-600 dark:text-violet-400">{Math.round(Number(r.profitPercent) || 0)}%</span> ({fmtRp(pAmt)})</> : 'Tanpa profit'}</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">Jual/pcs {jp > 0 ? fmtHargaPcs(grand / jp) : '—'}</span>
                        </div>
                        {isSel && (
                          <p className={`mt-2 text-[10px] font-bold ${slot === 1 ? 'text-blue-600 dark:text-blue-400' : 'text-cyan-600 dark:text-cyan-400'}`}>
                            Slot {slot} — Riwayat {slot}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Desktop: tabel */}
                <div className="hidden lg:block max-h-[30rem] overflow-y-auto scrollbar-thin rounded-lg border border-slate-200 dark:border-zinc-700 overflow-x-auto">
                  <Table className="min-w-[1240px]">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className={`${thCls} w-7 text-center`}>✓</TableHead>
                        <TableHead className={thCls}>Nomor</TableHead>
                        <TableHead className={thCls}>Tanggal</TableHead>
                        <TableHead className={thCls}>Pelanggan</TableHead>
                        <TableHead className={thCls}>Nama Cetakan</TableHead>
                        <TableHead className={thCls}>Bahan/Kertas</TableHead>
                        <TableHead className={thCls}>Uk. Kertas</TableHead>
                        <TableHead className={thCls}>Uk. Potongan</TableHead>
                        <TableHead className={`${thCls} text-right`}>JP</TableHead>
                        <TableHead className={`${thCls} text-right`}>Total (Modal)</TableHead>
                        <TableHead className={`${thCls} text-right`}>Profit</TableHead>
                        <TableHead className={`${thCls} text-right`}>Grand Total</TableHead>
                        <TableHead className={`${thCls} text-right`}>Jual/pcs</TableHead>
                        <TableHead className={`${thCls} text-center`}>Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paged.length === 0 && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={14} className="text-center py-8 text-sm text-slate-400">
                            Tidak ada riwayat yang cocok dengan filter periode / pelanggan / pencarian.
                          </TableCell>
                        </TableRow>
                      )}
                      {paged.map(r => {
                        const isSel = selectedIds.includes(r.id)
                        const slot = isSel ? (selectedIds.indexOf(r.id) + 1) : 0
                        const jp = parseJp(r.jumlahPesanan) || parseJp(r.quantity)
                        const pAmt = Number(r.profitAmount) || 0
                        const sub = Number(r.subTotal) || 0
                        const grand = Number(r.grandTotal) || 0
                        const ukKertas = r.paperLength && r.paperWidth ? `${r.paperLength}×${r.paperWidth}` : ''
                        const ukPotong = r.cutWidth && r.cutHeight ? `${r.cutWidth}×${r.cutHeight}` : ''
                        return (
                          <TableRow
                            key={r.id}
                            onClick={() => toggle(r.id)}
                            aria-pressed={isSel}
                            className={`cursor-pointer transition-colors ${slot === 1
                              ? 'bg-blue-50 hover:bg-blue-100/70 dark:bg-blue-900/20 dark:hover:bg-blue-900/30'
                              : slot === 2
                                ? 'bg-cyan-50 hover:bg-cyan-100/70 dark:bg-cyan-900/20 dark:hover:bg-cyan-900/30'
                                : 'hover:bg-slate-50 dark:hover:bg-zinc-800/60'}`}
                          >
                            <TableCell className={`${tdCls} text-center`}>
                              {isSel
                                ? <CheckSquare className={`w-5 h-5 mx-auto ${slot === 1 ? 'text-blue-600 dark:text-blue-400' : 'text-cyan-600 dark:text-cyan-400'}`} />
                                : <Square className="w-5 h-5 text-slate-300 dark:text-zinc-600 mx-auto" />}
                            </TableCell>
                            <TableCell className={`${tdCls} text-[11px] font-semibold tabular-nums ${isSel ? (slot === 1 ? 'text-blue-700 dark:text-blue-300' : 'text-cyan-700 dark:text-cyan-300') : 'text-slate-400'}`}>
                              {r.nomorUrut || '—'}
                              {isSel && <span className="block text-[9px] font-bold uppercase">Slot {slot}</span>}
                            </TableCell>
                            <TableCell className={`${tdCls} text-muted-foreground whitespace-nowrap text-xs`}>{tglId(r.createdAt)}</TableCell>
                            <TableCell className={`${tdCls} max-w-[90px]`}>
                              <p className="truncate text-slate-600 dark:text-slate-300" title={r.customerName || ''}>{r.customerName || '—'}</p>
                            </TableCell>
                            <TableCell className={`${tdCls} max-w-[135px]`}>
                              <p className={`font-bold truncate ${isSel ? 'text-slate-900 dark:text-slate-100' : 'text-slate-800 dark:text-slate-100'}`} title={r.printName || '-'}>{r.printName || '-'}</p>
                            </TableCell>
                            <TableCell className={`${tdCls} max-w-[100px]`}>
                              <p className="truncate text-xs text-slate-500 dark:text-slate-400" title={labelKertas(r)}>{labelKertas(r) || '—'}</p>
                            </TableCell>
                            <TableCell className={`${tdCls} text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap`}>{ukKertas || '—'}</TableCell>
                            <TableCell className={`${tdCls} text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap`}>{ukPotong || '—'}</TableCell>
                            <TableCell className={`${tdCls} text-right tabular-nums`}>{jp > 0 ? jp.toLocaleString('id-ID') : '—'}</TableCell>
                            <TableCell className={`${tdCls} text-right font-semibold tabular-nums`}>{fmtRp(sub)}</TableCell>
                            <TableCell className={`${tdCls} text-right tabular-nums`}>
                              {pAmt > 0 ? (
                                <>
                                  <p className="font-semibold text-violet-600 dark:text-violet-400">{Math.round(Number(r.profitPercent) || 0)}%</p>
                                  <p className="text-xs text-slate-400 tabular-nums">{fmtRp(pAmt)}</p>
                                </>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </TableCell>
                            <TableCell className={`${tdCls} text-right font-extrabold text-slate-800 dark:text-slate-100 tabular-nums`}>{fmtRp(grand)}</TableCell>
                            <TableCell className={`${tdCls} text-right font-bold text-emerald-600 dark:text-emerald-400 tabular-nums`}>{jp > 0 ? fmtHargaPcs(grand / jp) : '—'}</TableCell>
                            <TableCell className={`${tdCls} text-center`} onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-0.5">
                                <button onClick={() => setDetailRow(r)} title="Detail" aria-label={`Detail ${r.printName || 'riwayat'}`} className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"><Eye className="w-4 h-4" /></button>
                                <button onClick={() => setPreviewOneRow(r)} title="Preview" aria-label={`Preview ${r.printName || 'riwayat'}`} className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"><FileText className="w-4 h-4" /></button>
                                <button
                                  onClick={() => toggle(r.id)}
                                  title={isSel ? 'Keluarkan dari pilihan' : 'Pilih untuk gabungan'}
                                  aria-label={`${isSel ? 'Keluarkan' : 'Pilih'} ${r.printName || 'riwayat'}`}
                                  className={`p-1.5 rounded-md transition-colors ${isSel ? 'text-emerald-600 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'}`}
                                >
                                  {isSel ? <CheckSquare className="w-4 h-4" /> : <ListPlus className="w-4 h-4" />}
                                </button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {filtered.length > PAGE_SIZE && (
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <p className="text-xs text-slate-400">
                      Halaman {safePage} dari {totalPages} · {filtered.length} riwayat
                    </p>
                    <div className="flex gap-1.5">
                      <Button variant="outline" size="sm" className="h-8" disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← Sebelumnya</Button>
                      <Button variant="outline" size="sm" className="h-8" disabled={safePage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Berikutnya →</Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ===== STATUS 1 DIPILIH ===== */}
          {rows.length > 0 && selectedIds.length === 1 && (
            <div className="border border-dashed border-amber-300 dark:border-amber-700 rounded-xl py-6 text-center bg-amber-50/60 dark:bg-amber-900/10">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-400 dark:text-amber-600" />
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">1 dari 2 riwayat dipilih — pilih 1 riwayat lagi</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Centang satu riwayat lagi di tabel &quot;Daftar Riwayat&quot; di atas untuk menggabungkan.</p>
            </div>
          )}

          {/* ===== EMPTY STATE: belum ada yang dipilih ===== */}
          {rows.length > 0 && selectedIds.length === 0 && (
            <div className="border border-dashed border-emerald-300 dark:border-emerald-700 rounded-xl py-6 text-center bg-emerald-50/40 dark:bg-emerald-900/10">
              <Layers className="w-8 h-8 mx-auto mb-2 text-emerald-300 dark:text-emerald-700" />
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Belum ada riwayat dipilih</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Centang <b>2 riwayat</b> di tabel &quot;Daftar Riwayat&quot; di atas — maksimal dua riwayat digunakan dalam satu gabungan.</p>
            </div>
          )}

          {/* ===== PERBANDINGAN + PENGATURAN (saat 2 dipilih) ===== */}
          {r1 && r2 && (
            <div ref={compareRef} className="space-y-4 scroll-mt-16">
              {/* Panel perbandingan A & B */}
              <GabunganCompareGrid
                r1={r1}
                r2={r2}
                onDetail={r => setDetailRow(r as GabungBaris)}
                onPreview={r => setPreviewOneRow(r as GabungBaris)}
                onGanti={slot => { setGantiSearch(''); setGantiSlot(slot) }}
                onKeluarkan={slot => {
                  const target = slot === 1 ? r1 : r2
                  if (target?.id) toggle(target.id)
                }}
              />

              {/* Pengaturan gabungan + hasil */}
              <div className="bg-card rounded-xl border-2 border-blue-300 dark:border-blue-700 p-3 sm:p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                      <Calculator className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-base font-bold text-slate-800 dark:text-slate-100">Pengaturan Gabungan</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {gabungCustomer || '—'}{nextNumber ? ` · No. ${nextNumber}` : ''}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Peringatan JP beda */}
                {hasil.peringatan.length > 0 && (
                  <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 flex items-start gap-2" role="alert">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-800 dark:text-amber-300 space-y-0.5">
                      {hasil.peringatan.map((p, i) => <p key={i} className="font-semibold">{p}</p>)}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                      Nama Proyek Gabungan <span className="text-slate-400 font-normal">(opsional)</span>
                    </label>
                    <Input
                      value={namaProyek}
                      onChange={e => setNamaProyek(e.target.value)}
                      placeholder="mis. Kotak Kue Lebaran — Atas + Bawah"
                      className="h-10 text-sm"
                      maxLength={200}
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                      Jumlah Pesanan Gabungan {hasil.jpSama && <span className="text-emerald-600 dark:text-emerald-400 font-normal">(otomatis — JP sama)</span>}
                    </label>
                    <Input
                      value={jumlahGabungan}
                      onChange={e => setJumlahGabungan(e.target.value.replace(/[^\d]/g, ''))}
                      inputMode="numeric"
                      placeholder={hasil.jpAuto > 0 ? hasil.jpAuto.toLocaleString('id-ID') : hasil.jpBeda ? 'wajib diisi — JP berbeda' : '0'}
                      className={`h-10 text-sm ${hasil.jpBeda && parseJp(jumlahGabungan) <= 0 ? 'border-amber-400 focus:ring-amber-400' : ''}`}
                    />
                  </div>
                </div>

                {/* Metode profit */}
                <div>
                  <label className="flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                    <Percent className="w-3.5 h-3.5" /> Metode Profit Gabungan
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Metode profit gabungan">
                    <label className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${profitMode === 'masing_masing' ? 'border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20' : 'border-slate-200 dark:border-zinc-700 hover:border-slate-300'}`}>
                      <input type="radio" name="profitMode" checked={profitMode === 'masing_masing'} onChange={() => setProfitMode('masing_masing')} className="mt-0.5 accent-blue-600" />
                      <span className="text-xs">
                        <span className="block font-bold text-slate-700 dark:text-slate-200">Ikut masing-masing riwayat</span>
                        <span className="text-slate-400">Profit R1 ({hasil.profitPercent1}%) + Profit R2 ({hasil.profitPercent2}%)</span>
                      </span>
                    </label>
                    <label className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${profitMode === 'seragam' ? 'border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20' : 'border-slate-200 dark:border-zinc-700 hover:border-slate-300'}`}>
                      <input type="radio" name="profitMode" checked={profitMode === 'seragam'} onChange={() => setProfitMode('seragam')} className="mt-0.5 accent-blue-600" />
                      <span className="text-xs min-w-0 flex-1">
                        <span className="block font-bold text-slate-700 dark:text-slate-200">Profit seragam (%)</span>
                        <input
                          value={profitSeragam}
                          onChange={e => setProfitSeragam(e.target.value.replace(/[^\d.,]/g, ''))}
                          inputMode="decimal"
                          placeholder="mis. 15"
                          disabled={profitMode !== 'seragam'}
                          onClick={e => { if (profitMode !== 'seragam') { e.preventDefault(); setProfitMode('seragam') } }}
                          className="mt-1 w-full h-8 rounded-md border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 text-xs disabled:opacity-50"
                          aria-label="Persen profit seragam"
                        />
                      </span>
                    </label>
                  </div>
                </div>

                {/* Catatan */}
                <div>
                  <label className="flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                    Catatan <span className="text-slate-400 font-normal">(tampil di dokumen gabungan)</span>
                  </label>
                  <textarea
                    value={catatan}
                    onChange={e => setCatatan(e.target.value)}
                    rows={2}
                    maxLength={2000}
                    placeholder="Catatan produksi, catatan harga, dsb. (opsional)"
                    className="w-full text-sm rounded-md border border-slate-300 dark:border-zinc-700 bg-card px-3 py-2 min-h-[44px] resize-y"
                  />
                </div>

                {/* Ringkasan hasil */}
                <div className="rounded-xl border border-slate-200 dark:border-zinc-700 overflow-hidden">
                  <div className="flex justify-between items-center px-4 py-2 bg-white dark:bg-zinc-900">
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Biaya Gabungan (R1 + R2)</span>
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200 tabular-nums">{fmtRp(hasil.totalBiayaDasar)}</span>
                  </div>
                  <div className="flex justify-between items-center px-4 py-2 bg-white dark:bg-zinc-900 border-t border-slate-100 dark:border-zinc-800">
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                      {hasil.metodeProfit === 'seragam' ? `Profit Seragam ${hasil.profitPercent.toLocaleString('id-ID')}%` : 'Profit Gabungan (masing-masing)'}
                    </span>
                    <span className="text-sm font-bold text-violet-600 dark:text-violet-400 tabular-nums">{fmtRp(hasil.totalProfit)}</span>
                  </div>
                  <div className="flex justify-between items-center px-4 py-3 bg-gradient-to-r from-blue-600 to-cyan-600">
                    <span className="text-sm font-bold text-blue-100 uppercase tracking-wide">Grand Total Gabungan</span>
                    <span className="text-2xl font-extrabold text-white tabular-nums">{fmtRp(hasil.grandTotal)}</span>
                  </div>
                  {hasil.jumlahPesananGabungan > 0 ? (
                    <div className="grid grid-cols-2 divide-x divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                      <div className="flex justify-between items-center px-4 py-2.5">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Modal/Pcs</span>
                        <span className="text-sm font-extrabold text-slate-600 dark:text-slate-300 tabular-nums">{fmtHargaPcs(hasil.modalPerPcs)}</span>
                      </div>
                      <div className="flex justify-between items-center px-4 py-2.5">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          Jual/Pcs <span className="text-slate-400">({hasil.jumlahPesananGabungan.toLocaleString('id-ID')} pcs)</span>
                        </span>
                        <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">{fmtHargaPcs(hasil.hargaJualPerPcs)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 py-2.5 bg-white dark:bg-zinc-900 border-t border-slate-100 dark:border-zinc-800">
                      <p className="text-xs text-slate-400 text-center">Harga per pcs belum sah — jumlah pesanan gabungan belum diisi (JP = 0 tidak dibagi).</p>
                    </div>
                  )}
                </div>

                {/* Aksi utama */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <button
                    onClick={openPreviewBuilder}
                    className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors min-h-[44px]"
                  >
                    <Eye className="w-4.5 h-4.5" /> Preview Gabungan
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    title="Simpan dokumen gabungan ke database"
                    className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors min-h-[44px]"
                  >
                    {isSaving ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Save className="w-4.5 h-4.5" />} Simpan Gabungan
                  </button>
                  <button
                    onClick={() => handleCapture('jpg', 'gab')}
                    disabled={isGeneratingJpg}
                    title="Kirim gambar JPG gabungan (WhatsApp / unduh)"
                    className="flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-400 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors min-h-[44px]"
                  >
                    {isGeneratingJpg ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <FileImage className="w-4.5 h-4.5" />} JPG
                  </button>
                  <button
                    onClick={() => handleCapture('print', 'gab')}
                    disabled={isPrinting}
                    title="Cetak rincian gabungan (fit A5 portrait)"
                    className="flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors min-h-[44px]"
                  >
                    {isPrinting ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Printer className="w-4.5 h-4.5" />} Cetak
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Instance dokumen offscreen — sumber capture JPG/Cetak (selalu mounted
              saat 2 riwayat terpilih agar tombol JPG/Cetak berfungsi langsung) */}
          {r1 && r2 && (
            <>
              <div ref={capGabRef} aria-hidden="true" className="fixed top-0 bg-white" style={{ left: '-10000px', width: '768px', zIndex: -1, pointerEvents: 'none' }}>
                <GabunganDokumen
                  nomorDokumen={nextNumber}
                  tanggal={new Date()}
                  customerName={gabungCustomer}
                  namaProyek={namaProyek.trim()}
                  nomorSumber1={r1.nomorUrut || ''}
                  nomorSumber2={r2.nomorUrut || ''}
                  r1={r1 as unknown as RiwayatCetakanRow}
                  r2={r2 as unknown as RiwayatCetakanRow}
                  hasil={hasil}
                  catatan={catatan.trim()}
                />
              </div>
              <div ref={capR1Ref} aria-hidden="true" className="fixed top-0 bg-white" style={{ left: '-10000px', width: '720px', zIndex: -1, pointerEvents: 'none' }}>
                <div className="p-4 bg-white"><DokumenRiwayatSumber r={r1 as unknown as RiwayatCetakanRow} /></div>
              </div>
              <div ref={capR2Ref} aria-hidden="true" className="fixed top-0 bg-white" style={{ left: '-10000px', width: '720px', zIndex: -1, pointerEvents: 'none' }}>
                <div className="p-4 bg-white"><DokumenRiwayatSumber r={r2 as unknown as RiwayatCetakanRow} /></div>
              </div>
            </>
          )}
        </>
      ) : (
        /* ===== VIEW: RIWAYAT GABUNGAN (dokumen tersimpan) ===== */
        <GabunganRiwayatList
          docs={docs}
          rows={Object.fromEntries(rows.map(r => [r.id as string, r as unknown as Record<string, unknown>])) as Record<string, { updatedAt?: string | null } & Record<string, unknown>>}
          loading={docsLoading}
          onRefresh={fetchDocs}
          onPreviewDoc={openPreviewDoc}
          onEdited={onEditedDoc}
          onDuplicate={handleDuplicate}
        />
      )}

      {/* ===== DIALOG DETAIL RIWAYAT ===== */}
      <Dialog open={!!detailRow} onOpenChange={o => !o && setDetailRow(null)}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          {detailRow && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Eye className="w-4.5 h-4.5 text-blue-600" /> Detail Riwayat {detailRow.nomorUrut || ''}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {detailRow.customerName || '—'} · {tglId(detailRow.createdAt)}
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border border-slate-200 dark:border-zinc-700 divide-y divide-slate-100 dark:divide-zinc-800 px-3 text-sm">
                {([
                  ['Nama Cetakan', detailRow.printName || '-'],
                  ['Bahan/Kertas', labelKertas(detailRow) || '-'],
                  ['Ukuran Kertas', detailRow.paperLength && detailRow.paperWidth ? `${detailRow.paperLength} × ${detailRow.paperWidth} cm` : '-'],
                  ['Ukuran Potongan', detailRow.cutWidth && detailRow.cutHeight ? `${detailRow.cutWidth} × ${detailRow.cutHeight} cm` : '-'],
                  ['Jumlah Pesanan', (parseJp(detailRow.jumlahPesanan) || parseJp(detailRow.quantity)) > 0 ? `${(parseJp(detailRow.jumlahPesanan) || parseJp(detailRow.quantity)).toLocaleString('id-ID')} lbr` : '-'],
                  ['Jumlah Mata', detailRow.berapaMata || '-'],
                  ['Setelan Kertas', detailRow.setelanKertas || '-'],
                  ['Warna', [detailRow.warna || '', detailRow.warnaKhusus && detailRow.warnaKhusus !== '0' ? `khusus ${detailRow.warnaKhusus}` : ''].filter(Boolean).join(' + ') || '-'],
                  ['Mesin', [detailRow.machineName || '', detailRow.machineName2 || ''].filter(Boolean).join(' + ') || '-'],
                  ['Harga Plat', fmtRp((Number(detailRow.hargaPlat) || 0) + (Number(detailRow.hargaPlat2) || 0))],
                  ['Ongkos Cetak', fmtRp((Number(detailRow.ongkosCetak) || 0) + (Number(detailRow.ongkosCetak2) || 0))],
                  ['Finishing', detailRow.finishingNames || '-'],
                  ['Sub Total', fmtRp(Number(detailRow.subTotal) || 0)],
                  ['Profit', Number(detailRow.profitAmount) > 0 ? `${Math.round(Number(detailRow.profitPercent) || 0)}% · ${fmtRp(Number(detailRow.profitAmount))}` : '-'],
                  ['Grand Total', fmtRp(Number(detailRow.grandTotal) || 0)],
                ] as const).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 py-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{k}</span>
                    <span className="text-sm font-bold text-right text-slate-700 dark:text-slate-200 break-words">{v}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== PREVIEW SATU RIWAYAT (dari tabel/panel) ===== */}
      <Dialog open={!!previewOneRow} onOpenChange={o => !o && setPreviewOneRow(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
          {previewOneRow && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">Preview Riwayat {previewOneRow.nomorUrut || ''}</DialogTitle>
                <DialogDescription className="text-xs">
                  Dokumen rincian asli riwayat — {previewOneRow.customerName || '—'} · {previewOneRow.printName || '-'}
                </DialogDescription>
              </DialogHeader>
              <FixedDocScaler fixedWidth={720} innerClassName="p-4 bg-white">
                <DokumenRiwayatSumber r={previewOneRow as unknown as RiwayatCetakanRow} />
              </FixedDocScaler>
              <div className="flex gap-2">
                <button
                  onClick={() => { const r = previewOneRow; setPreviewOneRow(null); setSelectedIds(prev => { if (prev.includes(r.id)) return prev; if (prev.length >= 2) { toast.warning('Maksimal 2 riwayat', { description: 'Maksimal dua riwayat digunakan dalam satu gabungan.' }); return prev }; return [...prev, r.id] }) }}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors min-h-[44px]"
                >
                  <ListPlus className="w-4 h-4" /> Pilih untuk Gabungan
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== PICKER GANTI RIWAYAT (pertahankan pasangan) ===== */}
      <Dialog open={gantiSlot !== null} onOpenChange={o => !o && setGantiSlot(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Ganti Riwayat {gantiSlot === 1 ? '1' : '2'}</DialogTitle>
            <DialogDescription className="text-xs">
              Pilih riwayat pengganti — riwayat sumber {gantiSlot === 1 ? '2' : '1'} tetap dipertahankan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input value={gantiSearch} onChange={e => setGantiSearch(e.target.value)} placeholder="Cari nomor / barang / pelanggan…" className="h-10 text-sm" aria-label="Cari riwayat pengganti" />
            <div className="max-h-72 overflow-y-auto scrollbar-thin rounded-lg border border-slate-200 dark:border-zinc-700 divide-y divide-slate-100 dark:divide-zinc-800">
              {kandidatGanti.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-6">Tidak ada riwayat yang cocok.</p>
              )}
              {kandidatGanti.map(r => (
                <button
                  key={r.id}
                  onClick={() => pickGanti(r)}
                  className="w-full text-left px-3 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{r.printName || '-'}</p>
                  <p className="text-[10.5px] text-slate-400 truncate">{r.customerName || '—'} · <span className="font-mono">{r.nomorUrut || '-'}</span> · {fmtRp(Number(r.grandTotal) || 0)}</p>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== PREVIEW DIALOG 3 BAGIAN ===== */}
      {previewCtx && gabunganDocProps && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 lg:p-0" onClick={() => setPreviewCtx(null)} role="dialog" aria-modal="true" aria-label="Preview gabungan hitung cetakan">
          <div className="absolute inset-0 bg-black/50" />
          <div
            onClick={e => e.stopPropagation()}
            className="relative bg-card rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden lg:max-w-none lg:max-h-none lg:h-full lg:rounded-none lg:border-0"
          >
            {/* Header + tab */}
            <div className="border-b border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 rounded-t-xl flex-shrink-0">
              <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex gap-1 flex-shrink-0">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400 cursor-pointer" onClick={() => setPreviewCtx(null)} />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                  </div>
                  <span className="text-[16px] sm:text-[22px] font-bold text-slate-700 dark:text-slate-200 ml-1 leading-tight truncate">
                    Rincian Gabungan Hitung Cetakan
                  </span>
                </div>
                <button onClick={() => setPreviewCtx(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1" aria-label="Tutup preview">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {/* Tab: Riwayat 1 / Riwayat 2 / Hasil Gabungan / Tampilan Semua */}
              <div className="flex gap-1 px-2 sm:px-4 pb-2 overflow-x-auto scrollbar-thin" role="tablist" aria-label="Bagian preview gabungan">
                {GABUNGAN_PREVIEW_TABS.map(t => (
                  <button
                    key={t.key}
                    role="tab"
                    aria-selected={previewTab === t.key}
                    onClick={() => setPreviewTab(t.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors min-h-[36px] ${previewTab === t.key
                      ? t.key === 'gabungan'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white dark:bg-zinc-800 text-slate-800 dark:text-slate-100 shadow-sm border border-slate-200 dark:border-zinc-700'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-zinc-800/60'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Konten dokumen */}
            <div className="overflow-y-auto flex-1 min-h-0 overscroll-contain bg-slate-100 dark:bg-zinc-900">
              <GabunganPreviewContent
                tab={previewTab}
                r1={pvR1}
                r2={pvR2}
                nomorSumber1={previewCtx.nomorSumber1}
                nomorSumber2={previewCtx.nomorSumber2}
                gabungan={gabunganDocProps}
                catatan={previewCtx.catatan}
              />
            </div>

            {/* Footer aksi */}
            <div className="sticky bottom-0 bg-card border-t border-slate-200 dark:border-zinc-700 p-3 flex gap-2 flex-shrink-0">
              <button
                onClick={() => handleCapture('print', captureKey)}
                disabled={isPrinting}
                title={`Cetak ${captureKey === 'gab' ? 'dokumen gabungan' : captureKey === 'r1' ? 'Riwayat 1' : 'Riwayat 2'} (fit A5 portrait)`}
                className="flex-1 flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-semibold py-2 rounded-lg text-sm whitespace-nowrap transition-colors"
              >
                {isPrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} Cetak
              </button>
              <button
                onClick={() => handleCapture('jpg', captureKey)}
                disabled={isGeneratingJpg}
                title="Kirim gambar JPG (WhatsApp / unduh)"
                className="flex-1 flex items-center justify-center gap-1 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-400 text-white font-semibold py-2 rounded-lg text-sm whitespace-nowrap transition-colors"
              >
                {isGeneratingJpg ? <><Loader2 className="w-4 h-4 animate-spin" />JPG...</> : <><FileImage className="w-4 h-4" /> JPG</>}
              </button>
              {previewCtx.kind === 'builder' && (
                <button
                  onClick={() => { setPreviewCtx(null); handleSave() }}
                  disabled={isSaving}
                  title="Simpan dokumen gabungan ke database"
                  className="flex-1 flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white font-semibold py-2 rounded-lg text-sm whitespace-nowrap transition-colors"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Simpan
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== DIALOG KONFIRMASI BATAL PILIHAN ===== */}
      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batal pilihan gabungan?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedIds.length} riwayat terpilih akan dikeluarkan dari gabungan. Riwayat hitung cetakan sumber tidak terhapus — bisa dipilih lagi kapan saja.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Kembali</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setSelectedIds([]); setJumlahGabungan(''); setClearOpen(false); toast.success('Pilihan dibatalkan') }}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              Batal Pilihan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
