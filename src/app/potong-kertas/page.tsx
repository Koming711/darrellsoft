'use client'

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Calculator, Save, Printer, FileImage, Loader2, History, RefreshCw, Trash2, DatabaseBackup, Upload, Pencil, Search, X, CheckCircle2, Image as ImageIcon, UserPlus, Wand2, AlertTriangle, Sparkles, Scissors } from 'lucide-react'
import { computeWasteAreas, type CandidateResult, type WasteArea, type CuttingResultPlus } from '@/lib/cutting-optimizer'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useLanguage } from '@/contexts/language-context'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { type Customer, type Paper, type CuttingResult } from '@/lib/cutting-engine'
import dynamic from 'next/dynamic'
import { getAuthUser } from '@/lib/auth'
import { getAuthHeaders } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'
import { fetcher } from '@/lib/fetcher'
import { notifyDataChange } from '@/lib/data-sync'
import { Button } from '@/components/ui/button'
import { PhotoUpload } from '@/components/photo-upload'
import { PhotoLightbox } from '@/components/photo-lightbox'
import { FixedDocScaler } from '@/components/fixed-doc-scaler'
import { openWhatsApp } from '@/lib/whatsapp-business'
import { captureElementAsJpg, fitBlobToA5, HIRES_PIXEL_RATIO } from '@/lib/capture-jpg'
import { printBlobHiRes } from '@/lib/print-hi-res'
import { shareJpgToWhatsApp } from '@/lib/share-jpg'
import { useDataChange } from '@/hooks/use-data-change'
import { cn } from '@/lib/utils'
import { RiwayatPeriodFilter, RiwayatFilterCard, RiwayatCustomerFilter, RiwayatSummaryCard, RiwayatEmptyState, riwayatPeriodText, riwayatDateRange, type RiwayatPeriod } from '@/components/dokupro/riwayat-period-filter'
import { CustomerFormDialog } from '@/components/views/customer-form-dialog'

const CuttingDiagram = dynamic(
  () => import('@/components/cutting-results').then(m => ({ default: m.CuttingDiagram })),
  { ssr: false, loading: () => <div className="h-full flex items-center justify-center text-xs text-slate-400">Memuat diagram...</div> }
)

// Form state keys for localStorage persistence (per-user scoped)
function userKey(base: string): string {
  try {
    const a = JSON.parse(localStorage.getItem('auth') || '{}')
    if (a.id) return `${base}_${a.id}`
  } catch {}
  return base
}
const STORAGE_KEY = () => userKey('potong-kertas-form')
const STORAGE_RESULTS_KEY = () => userKey('potong-kertas-results')
const STORAGE_VERSION_KEY = () => userKey('potong-kertas-form-version')
const STORAGE_VERSION = 'v6'

// === Nama Suplier BERSAMA antar halaman kalkulator (Potong Kertas ↔ Hitung Cetakan ↔ Hitung Harga Kertas) ===
// Permintaan user: pilihan suplier di satu halaman (mis. "Bintang Timur" di Potong Kertas)
// otomatis dipakai juga di halaman lain — satu sumber kebenaran di localStorage (per-user).
const SHARED_SUPLIER_KEY = () => userKey('hitung-nama-suplier')
function getSharedSuplierOrNull(): string | null {
  if (typeof window === 'undefined') return null
  try { return localStorage.getItem(SHARED_SUPLIER_KEY()) } catch { return null }
}
function getSharedSuplier(fallback: string): string {
  const v = getSharedSuplierOrNull()
  return v !== null ? v : fallback
}
function setSharedSuplier(v: string) {
  try { localStorage.setItem(SHARED_SUPLIER_KEY(), v) } catch {}
}

// Format tanggal riwayat potong kertas (gaya Riwayat Invoice: 05 Jun 2025)
function formatTanggalRiwayat(value?: string | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Rupiah ringkas utk kartu riwayat mobile (hemat ruang): ≥1 jt → "4,7 jt"
const fmtRpCompact = (n: number) => {
  const v = Math.round(n || 0)
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`
  if (v > 0) return `Rp ${v.toLocaleString('id-ID')}`
  return '-'
}

// Tanggal pendek utk kartu riwayat mobile: "20 Sep, 10.25"
function formatTanggalRiwayatShort(value?: string | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '-'
  return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
}

interface FormData {
  paperWidth: string
  paperHeight: string
  cutWidth: string
  cutHeight: string
  selectedCustomerId: string
  selectedPaperId: string
  grammage: string
  pricePerSheet: string
  pricePerKg: string
  quantity: string
  jumlahPesanan: string
  berapaMata: string
  setelanKertas: string
  printName: string
  isCustomPaper: boolean
  optimizationMode: string
  namaSuplier: string
  cutMode: string // 'otomatis' (pilih ukuran kertas otomatis) | 'manual'
  autoBahan: string // nama bahan mode otomatis (dari Master Kertas)
  autoGrammage: string // gramatur mode otomatis
}

function emptyFormData(): FormData {
  return {
    paperWidth: '', paperHeight: '', cutWidth: '', cutHeight: '',
    selectedCustomerId: '', selectedPaperId: '', grammage: '', pricePerSheet: '', pricePerKg: '',
    quantity: '', jumlahPesanan: '', berapaMata: '', setelanKertas: '', printName: '', isCustomPaper: false, optimizationMode: 'maximal',
    namaSuplier: '',
    cutMode: 'otomatis', autoBahan: '', autoGrammage: '',
  }
}

// === Konversi harga kertas per kg ↔ per lembar ===
// Berat 1 lembar (kg) = W(cm) × H(cm) × gramasi(gsm) / 10.000.000
// (cm²→m² = /10.000, g→kg = /1.000). Konsisten dgn rumus master harga kertas:
// harga/rim = (w×h×g×hargaKg)/20.000 → hargaKg = hargaLbr×500×20.000/(w×h×g) = hargaLbr×10⁷/(w×h×g)
function kgToSheetPrice(kg: number, w: number, h: number, g: number): number {
  return Math.round((kg * w * h * g) / 10000000)
}
function sheetToKgPrice(sheet: number, w: number | string, h: number | string, g: number | string): string {
  const W = parseFloat(String(w)) || 0
  const H = parseFloat(String(h)) || 0
  const G = parseFloat(String(g)) || 0
  if (!(sheet > 0) || !(W > 0) || !(H > 0) || !(G > 0)) return ''
  const kg = (sheet * 10000000) / (W * H * G)
  // DIBULATKAN ke rupiah penuh — konsisten dgn kolom Harga/kg di Master Harga Kertas (Math.round)
  return Math.round(kg).toString()
}
function canConvertKg(w: string | number, h: string | number, g: string | number): boolean {
  return (parseFloat(String(w)) || 0) > 0 && (parseFloat(String(h)) || 0) > 0 && (parseFloat(String(g)) || 0) > 0
}

function getInitialFormState(): FormData {
  if (typeof window === 'undefined') {
    return emptyFormData()
  }
  try {
    const savedVersion = localStorage.getItem(STORAGE_VERSION_KEY())
    if (savedVersion && savedVersion !== STORAGE_VERSION) {
      localStorage.removeItem(STORAGE_KEY())
      localStorage.removeItem(STORAGE_RESULTS_KEY())
      localStorage.setItem(STORAGE_VERSION_KEY(), STORAGE_VERSION)
    }
    const saved = localStorage.getItem(STORAGE_KEY())
    // Merge dgn default agar form tersimpan versi lama (tanpa field baru) tetap lengkap
    if (saved) return { ...emptyFormData(), ...JSON.parse(saved) }
  } catch {}
  return emptyFormData()
}

// Compact styles (mobile larger, desktop compact)
const inp = "w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-1.5 focus:ring-blue-500 focus:border-transparent bg-card"
const inpDisabled = "w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm text-slate-500 bg-slate-100 cursor-not-allowed"
const lbl = "text-xs font-medium text-slate-600 mb-0.5 block"
// Normalisasi nama suplier utk pencocokan (case-insensitive, trim)
const normSup = (s?: string | null) => (s || '').trim().toLowerCase()

/** Format ukuran "W × H cm"; '-' jika keduanya kosong. */
function fmtUkuran(w?: string | number | null, h?: string | number | null): string {
  const W = (w ?? '').toString().trim()
  const H = (h ?? '').toString().trim()
  if (!W && !H) return '-'
  return `${W || '-'} × ${H || '-'} cm`
}

// Preview Dialog Component — GAYA SAMA dengan halaman Hitung Cetakan:
// header tetap di atas, konten SELALU bisa discroll (mobile & desktop), footer tetap di bawah.
// Dokumen preview dirender fixed-width 720px (FixedDocScaler) lalu di-skala visual agar
// selalu fit di layar HP maupun desktop — hasil JPG/Cetak identik di semua perangkat.
function PreviewDialog({ children, footer, onClose, title }: { children: React.ReactNode; footer?: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 lg:p-0" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div onClick={(e) => e.stopPropagation()}
        className="relative bg-card rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden lg:max-w-none lg:max-h-none lg:h-full lg:rounded-none lg:border-0">
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-200 bg-slate-50 rounded-t-xl select-none flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400 cursor-pointer" onClick={onClose} />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
            </div>
            <span className="text-[22px] font-bold text-slate-700 ml-2 leading-tight truncate">{title}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 min-h-0 overscroll-contain -webkit-overflow-scrolling-touch">
          {children}
        </div>
        {footer && (
          <div className="flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

function CalculatorPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialForm = useRef<FormData>(getInitialFormState())
  const [paperWidth, setPaperWidth] = useState(initialForm.current.paperWidth)
  const [paperHeight, setPaperHeight] = useState(initialForm.current.paperHeight)
  const [cutWidth, setCutWidth] = useState(initialForm.current.cutWidth)
  const [cutHeight, setCutHeight] = useState(initialForm.current.cutHeight)
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialForm.current.selectedCustomerId)
  const [selectedPaperId, setSelectedPaperId] = useState(initialForm.current.selectedPaperId)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [papers, setPapers] = useState<Paper[]>([])
  const [grammage, setGrammage] = useState(initialForm.current.grammage)
  const [pricePerSheet, setPricePerSheet] = useState(initialForm.current.pricePerSheet)
  const [pricePerKg, setPricePerKg] = useState(initialForm.current.pricePerKg || '')
  const [quantity, setQuantity] = useState(initialForm.current.quantity)
  const [jumlahPesanan, setJumlahPesanan] = useState(initialForm.current.jumlahPesanan || '')
  const [berapaMata, setBerapaMata] = useState(initialForm.current.berapaMata || '')

  // Auto-calculate quantity = jumlahPesanan / berapaMata
  const computedQuantity = (() => {
    const jp = parseInt(jumlahPesanan) || 0
    const bm = parseInt(berapaMata) || 0
    if (jp > 0 && bm > 0) return Math.ceil(jp / bm).toString()
    return ''
  })()

  // Sync computedQuantity into quantity state so all existing checks work
  useEffect(() => {
    if (computedQuantity) setQuantity(computedQuantity)
  }, [computedQuantity])
  const [setelanKertas, setSetelanKertas] = useState(initialForm.current.setelanKertas)
  const [printName, setPrintName] = useState(initialForm.current.printName)
  // Nama Suplier utk harga bahan (permintaan user) — pilih dari Master Toko Pemasok
  // Suplier diambil dari nilai BERSAMA antar halaman (fallback: form tersimpan halaman ini)
  const [namaSuplier, setNamaSuplier] = useState(() => getSharedSuplier(initialForm.current.namaSuplier || ''))
  const [supliers, setSupliers] = useState<any[]>([])
  const [isCustomPaper, setIsCustomPaper] = useState(initialForm.current.isCustomPaper)
  const [restoredPaperName, setRestoredPaperName] = useState<string | null>(null)
  const [results, setResults] = useState<CuttingResult | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const savedResults = localStorage.getItem(STORAGE_RESULTS_KEY())
      if (savedResults) return JSON.parse(savedResults)
    } catch {}
    return null
  })
  const [optimizationMode, setOptimizationMode] = useState<'fast' | 'maximal'>(initialForm.current.optimizationMode as 'fast' | 'maximal')
  const [isCalculating, setIsCalculating] = useState(false)

  // ===== Mode Otomatis: pilih ukuran kertas paling efisien dari Master Kertas =====
  const [cutMode, setCutMode] = useState<'otomatis' | 'manual'>(initialForm.current.cutMode === 'manual' ? 'manual' : 'otomatis')
  const [autoBahan, setAutoBahan] = useState(initialForm.current.autoBahan || '')
  const [autoGrammage, setAutoGrammage] = useState(initialForm.current.autoGrammage || '')
  const [candidates, setCandidates] = useState<CandidateResult[]>([])
  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState(0)
  const [optimizeLoading, setOptimizeLoading] = useState(false)
  const [optimizeMessage, setOptimizeMessage] = useState('')
  const [selectedWasteId, setSelectedWasteId] = useState<string | null>(null)

  const waWindowRef = useRef<Window | null>(null)

  // Flag to skip selectedPaper useEffect during restore
  const isRestoringRef = useRef(false)

  // Riwayat states
  const [savingRiwayat, setSavingRiwayat] = useState(false)
  // Foto lampiran perhitungan (data URL JPEG ≤300KB; ikut tersimpan di riwayat)
  const [photoUrl, setPhotoUrl] = useState('')
  const [restoredRiwayatId, setRestoredRiwayatId] = useState<string | null>(null)
  // ===== SINKRONISASI PERMANEN PK ↔ HC: status relasi riwayat aktif =====
  const [pkHcLink, setPkHcLink] = useState<{ hcId: string; hcNomor: string; status: string; lastSyncedAt: string | null } | null>(null)
  // Key pemicu refetch status (dibump setelah simpan/update riwayat PK)
  const [pkLinkKey, setPkLinkKey] = useState(0)
  // Tombol "Hitung Cetakan Lengkap" sedang menyiapkan riwayat (simpan dulu utk dapatkan id)
  const [preparingHc, setPreparingHc] = useState(false)
  const [needsRecalc, setNeedsRecalc] = useState(false)
  const justCalculatedRef = useRef(false)
  const [riwayatList, setRiwayatList] = useState<any[]>([])
  const [backupLoading, setBackupLoading] = useState<string | null>(null)
  const [nextPotongKertasNumber, setNextPotongKertasNumber] = useState('')
  const [activeTab, setActiveTab] = useState<'editor' | 'riwayat'>('editor')

  // Riwayat tab UI states (periode + pencarian + pelanggan, gaya halaman Laporan Penjualan)
  const [loadingRiwayat, setLoadingRiwayat] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [period, setPeriod] = useState<RiwayatPeriod>('today')
  const [month, setMonth] = useState<number | null>(new Date().getMonth() + 1)
  const [year, setYear] = useState<number | null>(new Date().getFullYear())

  // Label & rentang tanggal efektif sesuai mode periode terpilih
  const periodLabel = riwayatPeriodText(period, dateFrom, dateTo, month, year)
  const eff = riwayatDateRange(period, dateFrom, dateTo, month, year)

  // Daftar nama customer unik dari riwayat (isi dropdown filter pelanggan)
  const riwayatCustomerOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of riwayatList) {
      const name = String(r?.namaCustomer || '').trim()
      if (name && name !== '-') set.add(name)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'))
  }, [riwayatList])

  // Filter riwayat: periode (rentang efektif) + pelanggan + pencarian (No. PK / customer / barang / kertas)
  const filteredRiwayatList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q && !customerFilter && !eff.dateFrom && !eff.dateTo) return riwayatList
    return riwayatList.filter((r: any) => {
      const t = (r.createdAt || '').slice(0, 10)
      if (eff.dateFrom && t && t < eff.dateFrom) return false
      if (eff.dateTo && t && t > eff.dateTo) return false
      if (customerFilter && String(r?.namaCustomer || '').trim() !== customerFilter) return false
      if (q) {
        const hay = `${r?.nomorUrut || ''} ${r?.namaCustomer || ''} ${r?.namaCetakan || ''} ${r?.paperName || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [riwayatList, searchQuery, customerFilter, eff.dateFrom, eff.dateTo])

  // Total harga seluruh riwayat pada periode terpilih
  const totalRiwayat = useMemo(
    () => filteredRiwayatList.reduce((sum: number, r: any) => sum + (Number(r?.totalPrice) || 0), 0),
    [filteredRiwayatList]
  )

  const filtersActive = period !== 'all' || !!dateFrom || !!dateTo || !!searchQuery.trim() || !!customerFilter

  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewRiwayatData, setPreviewRiwayatData] = useState<CuttingResult | null>(null)
  const [previewRiwayatInfo, setPreviewRiwayatInfo] = useState<{ customer: string; paper: string; jumlahPesanan: string; berapaMata: string; setelanKertas: string }>({ customer: '-', paper: '-', jumlahPesanan: '', berapaMata: '', setelanKertas: '' })
  const [previewRiwayatRow, setPreviewRiwayatRow] = useState<any>(null)
  // Perbandingan Ukuran Kertas utk preview mode RIWAYAT: kandidat dihitung ulang
  // dari Master Kertas (bahan+gramatur+ukuran potong baris) saat baris dibuka —
  // state `candidates` milik sesi editor bisa saja basi/tidak cocok dgn baris.
  const [previewRiwayatCandidates, setPreviewRiwayatCandidates] = useState<CandidateResult[] | null>(null)
  const [previewRiwayatSelectedIdx, setPreviewRiwayatSelectedIdx] = useState(0)
  const [pkPhotoZoom, setPkPhotoZoom] = useState(false)
  // Foto lampiran aktif untuk popup preview: mode riwayat pakai photoUrl baris riwayat, mode editor pakai foto di form
  const previewPhotoUrl = previewRiwayatData ? ((previewRiwayatRow?.photoUrl as string) || '') : photoUrl
  // Harga kertas /kg untuk preview: pakai input pricePerKg jika diisi manual; jika kosong,
  // konversi otomatis dari harga per lembar (mode riwayat: konversi dari data baris riwayat)
  const hargaKgPreview: string = previewRiwayatData
    ? sheetToKgPrice(
        parseFloat(previewRiwayatRow?.pricePerSheet) || 0,
        previewRiwayatRow?.paperWidth || previewRiwayatData.paperWidth,
        previewRiwayatRow?.paperHeight || previewRiwayatData.paperHeight,
        previewRiwayatRow?.grammage || 0
      )
    : ((parseFloat(pricePerKg) || 0) > 0 ? pricePerKg : sheetToKgPrice(parseFloat(pricePerSheet) || 0, paperWidth, paperHeight, grammage))
  // Harga per lembar aktif utk preview: mode riwayat pakai data baris riwayat, mode editor pakai form
  // (sebelumnya mode riwayat salah menampilkan harga form — bikin Harga/kg & Harga/Lembar Setelah Dipotong tidak konsisten)
  const hargaPerLembarPreview: number = previewRiwayatData
    ? (parseFloat(previewRiwayatRow?.pricePerSheet) || 0)
    : (parseFloat(pricePerSheet) || 0)
  // No PK utk preview: mode riwayat pakai nomorUrut baris; mode editor pakai nomorUrut
  // riwayat yang sedang diedit (restoredRiwayatId) — kosong bila perhitungan belum disimpan
  const editedNomorUrut: string = restoredRiwayatId
    ? (riwayatList.find(x => x.id === restoredRiwayatId)?.nomorUrut || '')
    : ''
  const noPkPreview: string = (previewRiwayatRow?.nomorUrut as string) || editedNomorUrut || ''
  // Kandidat Perbandingan Ukuran Kertas untuk dokumen preview (+ ikut tercetak/di-JPG):
  // - mode editor → pakai kandidat sesi (hanya mode otomatis; mode manual tidak ada perbandingan)
  // - mode riwayat → kandidat segar hasil fetch saat baris dibuka (null = sembunyikan tabel)
  const previewCandidates: CandidateResult[] = previewRiwayatData
    ? (previewRiwayatCandidates || [])
    : (cutMode === 'otomatis' ? candidates : [])
  // Baris kandidat yang sedang dipakai perhitungan (badge DIPILIH): mode editor =
  // pilihan user di panel perbandingan; mode riwayat = ukuran kertas baris yg cocok.
  const previewSelectedIdx: number = previewRiwayatData ? previewRiwayatSelectedIdx : selectedCandidateIdx
  const [isGeneratingJpg, setIsGeneratingJpg] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  // Auto-persist form data to localStorage
  const formData: FormData = {
    paperWidth, paperHeight, cutWidth, cutHeight,
    selectedCustomerId, selectedPaperId, grammage, pricePerSheet, pricePerKg,
    quantity, jumlahPesanan, berapaMata, setelanKertas, printName, isCustomPaper, optimizationMode,
    namaSuplier,
    cutMode, autoBahan, autoGrammage,
  }

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY(), JSON.stringify(formData))
  }, [formData])

  // Mark needsRecalc when any form field changes
  // (defined as ref+state pair; the useEffect is placed after customerInput declaration)
  const restoreDoneRef = useRef(false)

  const [papersFetchDone, setPapersFetchDone] = useState(false)

  const fetchPapersData = () => {
    authFetch('/api/papers')
      .then(res => { if (!res.ok) return []; return res.json() })
      .then(data => { if (Array.isArray(data)) setPapers(data); else setPapers([]) })
      .catch(() => setPapers([]))
      .finally(() => setPapersFetchDone(true))
  }

  const fetchCustomersData = () => {
    authFetch('/api/customers')
      .then(res => { if (!res.ok) return []; return res.json() })
      .then(data => { if (Array.isArray(data)) setCustomers(data); else setCustomers([]) })
      .catch(() => setCustomers([]))
  }

  const fetchSupliersData = () => {
    authFetch('/api/toko-pemasok')
      .then(res => { if (!res.ok) return []; return res.json() })
      .then(data => { if (Array.isArray(data)) setSupliers(data); else setSupliers([]) })
      .catch(() => setSupliers([]))
  }

  const fetchNextNumber = () => {
    authFetch('/api/riwayat-potong-kertas?preview=next-number')
      .then(res => { if (!res.ok) return null; return res.json() })
      .then(data => { if (data?.nextNumber) setNextPotongKertasNumber(data.nextNumber) })
      .catch(() => {})
  }

  useEffect(() => {
    fetchCustomersData()
    fetchPapersData()
    fetchRiwayat()
    fetchNextNumber()
    fetchSupliersData()
  }, [])

  useDataChange(['papers', 'customers', 'finishings', 'settings'], (entity) => {
    if (entity === 'papers') fetchPapersData()
    if (entity === 'customers') fetchCustomersData()
  })

  // Restore dari riwayat URL params
  useEffect(() => {
    const restored = searchParams.get('restoredFromRiwayat')
    if (!restored) return

    const printNameParam = searchParams.get('printName')
    const customerNameParam = searchParams.get('customerName')
    const paperNameParam = searchParams.get('paperName')
    const paperLengthParam = searchParams.get('paperLength')
    const paperWidthParam = searchParams.get('paperWidth')
    const cutWidthParam = searchParams.get('cutWidth')
    const cutHeightParam = searchParams.get('cutHeight')
    const quantityParam = searchParams.get('quantity')

    if (printNameParam) setPrintName(printNameParam)
    if (paperLengthParam) setPaperWidth(paperLengthParam)
    if (paperWidthParam) setPaperHeight(paperWidthParam)
    if (cutWidthParam) setCutWidth(cutWidthParam)
    if (cutHeightParam) setCutHeight(cutHeightParam)
    if (quantityParam) setQuantity(quantityParam)

    // Set custom paper mode since we're restoring specific dimensions
    if (paperLengthParam || paperWidthParam) {
      setSelectedPaperId('custom')
      setIsCustomPaper(true)
    }

    // Matching customer by name
    if (customerNameParam) {
      const match = customers.find(c => c.name === customerNameParam)
      if (match) setSelectedCustomerId(match.id)
    }

    toast.success('Data berhasil di-restore dari riwayat!')
    // Bersihkan URL params
    window.history.replaceState({}, '', '/potong-kertas')
  }, [searchParams, customers])

  const selectedPaper = papers.find(p => p.id === selectedPaperId)
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId)
  const selectedCustomerName = selectedCustomer?.name || ''

  // Opsi dropdown bahan kertas: bila suplier dipilih (mis. "Bintang Timur"), HANYA kertas milik
  // suplier tsb (dari Master Harga Kertas) yang tampil — permintaan user. Tanpa suplier → semua kertas.
  const paperOptions = useMemo(() => {
    if (!namaSuplier) return papers
    const ns = normSup(namaSuplier)
    return papers.filter(p => normSup(p.suplier) === ns)
  }, [papers, namaSuplier])

  // Harga mengikuti suplier (mis. "Bintang Timur"): bila suplier dipilih dan bahan terpilih
  // punya entri dgn suplier tsb di Master Harga Kertas, otomatis pakai entri tersebut sehingga
  // harga/lembar, harga/kg, gramatur & ukuran mengikuti harga suplier di master. Bila tidak ada
  // varian milik suplier tsb, pilihan bahan dikosongkan karena dropdown hanya memuat kertas
  // milik suplier tsb (kertas lama bukan miliknya).
  useEffect(() => {
    if (isRestoringRef.current) return
    if (!namaSuplier || isCustomPaper || !selectedPaper) return
    if (normSup(selectedPaper.suplier) === normSup(namaSuplier)) return // sudah harga suplier ini
    const variant = papers.find(p =>
      normSup(p.suplier) === normSup(namaSuplier) &&
      p.name.trim().toLowerCase() === selectedPaper.name.trim().toLowerCase())
    if (variant) {
      setSelectedPaperId(variant.id) // effect selectedPaper → harga/gramatur/ukuran terisi dr master
      toast.success(`Harga ${selectedPaper.name} mengikuti Master Bahan · ${variant.suplier}`)
    } else {
      setSelectedPaperId('') // kertas terpilih bukan milik suplier ini → pilih ulang dari daftar suplier
    }
  }, [namaSuplier, papers, selectedPaper, isCustomPaper])

  // ===== Mode Otomatis: opsi bahan (nama unik) & gramatur dari Master Kertas =====
  const bahanOptions = useMemo(() => {
    const set = new Set<string>()
    for (const p of paperOptions) {
      const n = String(p.name || '').trim()
      if (n) set.add(n)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'))
  }, [paperOptions])

  const gramaturOptions = useMemo(() => {
    if (!autoBahan) return []
    const target = autoBahan.trim().toLowerCase()
    const set = new Set<number>()
    for (const p of paperOptions) {
      if (String(p.name || '').trim().toLowerCase() === target && p.grammage > 0) set.add(p.grammage)
    }
    return Array.from(set).sort((a, b) => a - b)
  }, [paperOptions, autoBahan])

  // Bahan tidak lagi tersedia (mis. suplier diganti) → reset pilihan bahan/gramatur
  useEffect(() => {
    if (autoBahan && bahanOptions.length > 0 && !bahanOptions.some(n => n.toLowerCase() === autoBahan.toLowerCase())) {
      setAutoBahan('')
      setAutoGrammage('')
    }
  }, [bahanOptions, autoBahan])
  useEffect(() => {
    if (autoGrammage && gramaturOptions.length > 0 && !gramaturOptions.includes(parseInt(autoGrammage))) {
      setAutoGrammage('')
    }
  }, [gramaturOptions, autoGrammage])

  // Seed nilai suplier bersama dari form tersimpan (sekali di mount, bila belum ada pilihan bersama)
  useEffect(() => {
    try {
      const savedSup = initialForm.current.namaSuplier || ''
      if (savedSup && localStorage.getItem(SHARED_SUPLIER_KEY()) === null) {
        localStorage.setItem(SHARED_SUPLIER_KEY(), savedSup)
      }
    } catch {}
  }, [])

  // Customer DROPDOWN-ONLY (permintaan user): pilih dari Master Customer, tidak bisa diketik.
  // Popup "Tambah Cust" — dialog sama persis dengan Master Customer / Buat Invoice
  const [addCustOpen, setAddCustOpen] = useState(false)

  // Mark needsRecalc when any form field changes (after initial calculation or restore)
  useEffect(() => {
    if (justCalculatedRef.current) {
      justCalculatedRef.current = false
      return
    }
    if (results) {
      setNeedsRecalc(true)
    }
  }, [paperWidth, paperHeight, cutWidth, cutHeight, grammage, pricePerSheet, quantity, jumlahPesanan, berapaMata, setelanKertas, printName, optimizationMode, selectedCustomerId, selectedPaperId, selectedCustomerName, cutMode, autoBahan, autoGrammage])

  const handleCustomerSelect = (customer: any) => {
    setSelectedCustomerId(customer.id)
  }

  // Sukses simpan dari popup "Tambah Cust" → auto-pilih customer baru di dropdown
  const handleCustomerFormSaved = (saved: { id: string; name: string } | null) => {
    if (!saved) {
      fetchCustomersData()
      return
    }
    setSelectedCustomerId(saved.id)
    fetchCustomersData()
  }

  useEffect(() => {
    if (selectedPaper && !isRestoringRef.current) {
      requestAnimationFrame(() => {
        setGrammage(selectedPaper.grammage.toString())
        const sheet = Math.round(selectedPaper.pricePerRim / 500)
        setPricePerSheet(sheet.toString())
        setPaperWidth(selectedPaper.width.toString())
        setPaperHeight(selectedPaper.height.toString())
        setIsCustomPaper(false)
        // Harga/kg ikut terisi otomatis dari harga kertas master
        setPricePerKg(sheetToKgPrice(sheet, selectedPaper.width, selectedPaper.height, selectedPaper.grammage))
      })
    }
  }, [selectedPaper])

  const handlePaperChange = (value: string) => {
    setRestoredPaperName(null)
    if (value === 'custom') {
      setSelectedPaperId('custom')
      setIsCustomPaper(true)
      setPaperWidth('')
      setPaperHeight('')
      setGrammage('')
      setPricePerSheet('')
      setPricePerKg('')
    } else {
      setSelectedPaperId(value)
      setIsCustomPaper(false)
    }
  }

  // Inti perhitungan potongan — dipanggil dari tombol Hitung
  const runCuttingCalc = async (qty: number) => {
    setNeedsRecalc(false)
    justCalculatedRef.current = true
    setIsCalculating(true)
    await new Promise(resolve => setTimeout(resolve, 50))

    const pw = parseFloat(paperWidth)
    const ph = parseFloat(paperHeight)
    const cw = parseFloat(cutWidth)
    const ch = parseFloat(cutHeight)
    const setelan = parseInt(setelanKertas) || 0
    const price = parseFloat(pricePerSheet) || 0
    const totalQty = qty + setelan

    if (!pw || !ph || !cw || !ch) {
      toast.error('Mohon lengkapi semua ukuran!')
      setIsCalculating(false)
      return
    }
    if (cw > pw || ch > ph) {
      toast.error('Ukuran potongan lebih besar dari ukuran kertas!')
      setIsCalculating(false)
      return
    }

    const { calculateCuts } = await import('@/lib/cutting-engine')
    const result = calculateCuts({
      paperWidth: pw, paperHeight: ph, cutWidth: cw, cutHeight: ch,
      quantity: totalQty, pricePerSheet: price, optimizationMode,
      customerName: selectedCustomer?.name || '',
      paperMaterial: selectedPaper?.name || restoredPaperName || '',
      grammage: selectedPaper?.grammage || 0,
    })

    setResults(result)
    localStorage.setItem(STORAGE_RESULTS_KEY(), JSON.stringify(result))
    setIsCalculating(false)
    toast.success('Perhitungan selesai!')
  }

  const handleCalculateCuts = () => runCuttingCalc(parseInt(computedQuantity || quantity) || 0)

  // Hitung ulang potongan dari input form saat ini TANPA mengubah pilihan kertas
  // (beda dgn runAutoOptimize yang bisa memilih ukuran kertas lain). Dipakai
  // sebelum menyimpan perubahan riwayat otomatis (Buka Hitung Cetakan) agar
  // hasil yang tersimpan konsisten dgn input terbaru.
  const recalcForSave = async (): Promise<CuttingResult | null> => {
    const pw = parseFloat(paperWidth)
    const ph = parseFloat(paperHeight)
    const cw = parseFloat(cutWidth)
    const ch = parseFloat(cutHeight)
    const qty = parseInt(computedQuantity || quantity) || 0
    const setelan = parseInt(setelanKertas) || 0
    const price = parseFloat(pricePerSheet) || 0
    if (!pw || !ph || !cw || !ch) return null
    if (cw > pw || ch > ph) return null
    try {
      const { calculateCuts } = await import('@/lib/cutting-engine')
      return calculateCuts({
        paperWidth: pw, paperHeight: ph, cutWidth: cw, cutHeight: ch,
        quantity: qty + setelan, pricePerSheet: price, optimizationMode,
        customerName: selectedCustomer?.name || '',
        paperMaterial: selectedPaper?.name || restoredPaperName || '',
        grammage: selectedPaper?.grammage || parseFloat(grammage) || 0,
      })
    } catch { return null }
  }

  // ===== Mode Otomatis: terapkan kandidat ukuran kertas (best / pilihan alternatif) =====
  const applyCandidate = useCallback((c: CandidateResult, idx: number) => {
    justCalculatedRef.current = true // perubahan field dari hasil hitung — tandai agar tidak needsRecalc
    setSelectedCandidateIdx(idx)
    setResults(c.result)
    localStorage.setItem(STORAGE_RESULTS_KEY(), JSON.stringify(c.result))
    // Isi parameter kertas terpilih (readonly di mode otomatis) dari kandidat Master Kertas
    setPaperWidth(String(c.paperWidth))
    setPaperHeight(String(c.paperHeight))
    setGrammage(String(c.grammage))
    setPricePerSheet(String(c.pricePerSheet))
    setPricePerKg(sheetToKgPrice(c.pricePerSheet, c.paperWidth, c.paperHeight, c.grammage))
    setSelectedPaperId(c.paperId)
    setIsCustomPaper(false)
    setRestoredPaperName(null)
    setSelectedWasteId(null)
    setNeedsRecalc(false)
  }, [])

  // ===== Mode Otomatis: panggil API optimasi → urutkan kandidat Master Kertas =====
  const runAutoOptimize = async () => {
    const cw = parseFloat(cutWidth)
    const ch = parseFloat(cutHeight)
    const qty = parseInt(computedQuantity || quantity) || 0
    if (!autoBahan || !(parseInt(autoGrammage) > 0)) {
      toast.error('Pilih nama bahan dan gramatur terlebih dahulu')
      return
    }
    if (!(cw > 0) || !(ch > 0)) {
      toast.error('Isi lebar & tinggi potongan yang diinginkan')
      return
    }
    if (qty <= 0) {
      toast.error('Isi jumlah potongan yang dibutuhkan')
      return
    }
    setNeedsRecalc(false)
    justCalculatedRef.current = true
    setOptimizeLoading(true)
    setOptimizeMessage('')
    await new Promise(resolve => setTimeout(resolve, 30))
    try {
      const res = await fetcher('/api/potong-kertas/optimize', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bahan: autoBahan,
          grammage: parseInt(autoGrammage),
          cutWidth: cw,
          cutHeight: ch,
          quantity: qty,
          setelanKertas: parseInt(setelanKertas) || 0,
          suplier: namaSuplier || '',
          optimizationMode,
          customerName: selectedCustomer?.name || '',
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(data?.error || `Gagal menghitung optimasi (${res.status})`)
        return
      }
      if (!data?.ok || !Array.isArray(data.candidates) || data.candidates.length === 0) {
        setCandidates([])
        setResults(null)
        localStorage.removeItem(STORAGE_RESULTS_KEY())
        setOptimizeMessage(data?.message || 'Tidak ada ukuran kertas yang cocok di Master Kertas.')
        toast.error(data?.message || 'Tidak ada ukuran kertas yang cocok di Master Kertas.')
        return
      }
      const list: CandidateResult[] = data.candidates
      setCandidates(list)
      applyCandidate(list[0], 0)
      const best = list[0]
      toast.success(`Ukuran terbaik: ${best.paperWidth} × ${best.paperHeight} cm — ${best.piecesPerSheet.toLocaleString('id-ID')} potongan/lembar`, {
        description: list.length > 1 ? `${list.length} ukuran ${autoBahan} ${autoGrammage} gsm diuji dari Master Kertas · biaya termurah Rp ${Math.round(best.totalPrice).toLocaleString('id-ID')}` : undefined,
      })
    } catch {
      toast.error('Gagal menghubungi server optimasi')
    } finally {
      setOptimizeLoading(false)
    }
  }

  // ===== KLIK LANGSUNG "Hitung Cetakan Lengkap" (permintaan owner): hitung
  // potongan otomatis bila hasil belum ada / input berubah (needsRecalc) —
  // tombol tidak lagi menuntut klik "Hitung Potongan" / "Hitung & Pilih
  // Terbaik" lebih dulu. Return hasil segar (+ paperId kandidat utk mode
  // otomatis) atau null bila input belum cukup untuk menghitung.
  const autoCalcFreshResults = async (): Promise<{ res: CuttingResult; paperId: string } | null> => {
    const cw = parseFloat(cutWidth)
    const ch = parseFloat(cutHeight)
    const qty = parseInt(computedQuantity || quantity) || 0
    if (cutMode === 'otomatis') {
      if (!autoBahan || !(parseInt(autoGrammage) > 0) || !(cw > 0) || !(ch > 0) || qty <= 0) return null
      setOptimizeLoading(true)
      setOptimizeMessage('')
      try {
        const res = await fetcher('/api/potong-kertas/optimize', {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bahan: autoBahan,
            grammage: parseInt(autoGrammage),
            cutWidth: cw,
            cutHeight: ch,
            quantity: qty,
            setelanKertas: parseInt(setelanKertas) || 0,
            suplier: namaSuplier || '',
            optimizationMode,
            customerName: selectedCustomer?.name || '',
          }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok || !data?.ok || !Array.isArray(data.candidates) || data.candidates.length === 0) {
          setOptimizeMessage(data?.message || '')
          return null
        }
        const list: CandidateResult[] = data.candidates
        setCandidates(list)
        applyCandidate(list[0], 0) // isi form kertas + results + needsRecalc=false
        return { res: list[0].result, paperId: list[0].paperId }
      } catch { return null }
      finally { setOptimizeLoading(false) }
    }
    // Mode manual: hitung lokal dari input form (tanpa mengubah pilihan kertas)
    const fresh = await recalcForSave()
    if (!fresh) return null
    justCalculatedRef.current = true
    setResults(fresh)
    localStorage.setItem(STORAGE_RESULTS_KEY(), JSON.stringify(fresh))
    setNeedsRecalc(false)
    return { res: fresh, paperId: selectedPaperId && selectedPaperId !== 'custom' ? selectedPaperId : '' }
  }

  // ===== Area sisa aktif: dari hasil optimasi (wasteAreas) atau dihitung geometri dari blok =====
  const activeWasteAreas: WasteArea[] = useMemo(() => {
    if (!results) return []
    if (Array.isArray(results.wasteAreas) && results.wasteAreas.length > 0) return results.wasteAreas
    try {
      return computeWasteAreas(results.paperWidth, results.paperHeight, results.blocks || [], results.cutWidth, results.cutHeight)
    } catch { return [] }
  }, [results])

  // Area sisa utk dialog PREVIEW (mode riwayat: dari data baris; mode editor: dari form)
  const previewWasteAreas: WasteArea[] = useMemo(() => {
    const r = previewRiwayatData || results
    if (!r) return []
    if (Array.isArray(r.wasteAreas) && r.wasteAreas.length > 0) return r.wasteAreas
    try {
      return computeWasteAreas(r.paperWidth, r.paperHeight, r.blocks || [], r.cutWidth, r.cutHeight)
    } catch { return [] }
  }, [previewRiwayatData, results])

  // Reset SEMUA isian form (satu sumber untuk: tombol Reset, auto-reset setelah
  // Simpan/Update Riwayat, dan auto-reset sebelum navigasi ke Hitung Cetakan)
  const resetFormFields = () => {
    setPaperWidth('')
    setPaperHeight('')
    setCutWidth('')
    setCutHeight('')
    setSelectedCustomerId('')
    setSelectedPaperId('')
    setGrammage('')
    setPricePerSheet('')
    setPricePerKg('')
    setQuantity('')
    setJumlahPesanan('')
    setBerapaMata('')
    setSetelanKertas('')
    setPrintName('')
    setPhotoUrl('')
    setIsCustomPaper(false)
    setRestoredPaperName(null)
    setResults(null)
    setOptimizationMode('maximal')
    setNamaSuplier('')
    setRestoredRiwayatId(null)
    setNeedsRecalc(false)
    restoreDoneRef.current = false
    setCutMode('otomatis')
    setAutoBahan('')
    setAutoGrammage('')
    setCandidates([])
    setSelectedCandidateIdx(0)
    setOptimizeMessage('')
    setSelectedWasteId(null)
    localStorage.removeItem(STORAGE_KEY())
    localStorage.removeItem(STORAGE_RESULTS_KEY())
  }

  const handleReset = () => {
    if (!confirm('Reset semua data yang sudah diisi?')) return
    resetFormFields()
    toast.success('Data berhasil direset')
  }

  // === Riwayat functions ===
  const fetchRiwayat = async () => {
    try {
      setLoadingRiwayat(true)
      const res = await fetcher('/api/riwayat-potong-kertas', { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setRiwayatList(Array.isArray(data) ? data : [])
      }
    } catch {} finally {
      setLoadingRiwayat(false)
    }
  }

  const handleBackupRiwayat = async () => {
    setBackupLoading('backup')
    try {
      const res = await authFetch(`/api/database/backup-master?table=riwayat_potong_kertas`)
      if (!res.ok) {
        let errMsg = 'Gagal backup data riwayat potong kertas'
        try { const errData = await res.json(); errMsg = errData?.error || errMsg } catch {}
        toast.error(errMsg)
        return
      }
      const blob = await res.blob()
      if (blob.size === 0) {
        toast.error('Backup kosong — tidak ada data')
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = res.headers.get('Content-Disposition')
      const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
      a.download = match ? match[1] : `backup-riwayat-potong-kertas-${Date.now()}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Backup berhasil diunduh')
    } catch (e) { console.error('Backup error:', e); toast.error('Gagal backup data riwayat potong kertas') }
    setBackupLoading(null)
  }

  const handleRestoreRiwayat = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xlsx'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      if (!confirm('Data riwayat potong kertas yang ada akan diganti dengan data dari file backup. Lanjutkan?')) return
      setBackupLoading('restore')
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('table', 'riwayat_potong_kertas')
        const res = await authFetch('/api/database/restore-master', {
          method: 'POST',
          body: fd,
        })
        const data = await res.json()
        if (res.ok && data.success) {
          toast.success(`Restore berhasil (${data.count} data)`)
          fetchRiwayat()
          notifyDataChange('riwayat-potong-kertas')
        } else {
          toast.error(data.error || 'Gagal restore data riwayat potong kertas')
        }
      } catch { toast.error('File backup tidak valid') }
      setBackupLoading(null)
    }
    input.click()
  }

  const buildPayload = (resOverride?: CuttingResult | null, paperIdOverride?: string) => {
    // resOverride: hasil hitung SEGAR saat menyimpan dari alur otomatis
    // (Buka/Hitung Cetakan Lengkap dgn auto-hitung) — state `results` bisa masih
    // lama pada tick yang sama. Field kertas juga diutamakan dari hasil aktif
    // karena state pilihan kertas bisa basi saat auto-hitung baru selesai.
    const activeRes = resOverride === undefined ? results : resOverride
    return ({
      namaCustomer: selectedCustomer?.name || '-',
      resultData: activeRes ? JSON.stringify(activeRes) : '',
      namaCetakan: printName || '-',
      paperName: activeRes?.paperMaterial || selectedPaper?.name || restoredPaperName || 'Custom',
      paperId: paperIdOverride || selectedPaper?.id || '',
      grammage: (activeRes && activeRes.grammage > 0 ? String(activeRes.grammage) : grammage) || '0',
      paperWidth: (activeRes ? String(activeRes.paperWidth) : paperWidth) || '0',
      paperHeight: (activeRes ? String(activeRes.paperHeight) : paperHeight) || '0',
      cutWidth: (activeRes ? String(activeRes.cutWidth) : cutWidth) || '0',
      cutHeight: (activeRes ? String(activeRes.cutHeight) : cutHeight) || '0',
      quantity: quantity || '0',
      setelanKertas: setelanKertas || '0',
      sheetsNeeded: activeRes?.sheetsNeeded?.toString() || '0',
      totalPrice: activeRes?.totalPrice || 0,
      pricePerSheet: (activeRes && activeRes.pricePerSheet > 0 ? Math.round(activeRes.pricePerSheet) : parseFloat(pricePerSheet)) || 0,
      efficiency: activeRes?.efficiency || 0,
      strategy: activeRes?.strategy || '',
      jumlahPesanan: jumlahPesanan || '',
      berapaMata: berapaMata || '',
      namaSuplier: namaSuplier || '',
      photoUrl,
    })
  }

  // Cari riwayat potong kertas yang datanya identik dengan form saat ini
  // (dipakai isDataSameAsAnyRiwayat, handlePO, dan tombol "Hitung Cetakan Lengkap"
  // untuk mengirim pkRiwayatId tanpa membuat riwayat duplikat).
  const findSameRiwayat = () => {
    return riwayatList.find(r =>
      (r.namaCustomer || '-') === (selectedCustomer?.name || '-') &&
      (r.namaCetakan || '-') === (printName || '-') &&
      (r.paperName || '') === (selectedPaper?.name || restoredPaperName || 'Custom') &&
      r.paperWidth === (paperWidth || '0') &&
      r.paperHeight === (paperHeight || '0') &&
      r.cutWidth === (cutWidth || '0') &&
      r.cutHeight === (cutHeight || '0') &&
      r.quantity === (quantity || '0') &&
      r.totalPrice === (results?.totalPrice || 0) &&
      (r.jumlahPesanan || '') === (jumlahPesanan || '') &&
      (r.berapaMata || '') === (berapaMata || '')
    )
  }

  const isDataSameAsAnyRiwayat = () => {
    if (riwayatList.length === 0) return false
    return !!findSameRiwayat()
  }

  // Apakah data riwayat yang sedang di-restore sudah DIUBAH di editor?
  // (dipakai tombol Buka Hitung Cetakan: perubahan disimpan dulu supaya data
  //  di Hitung Cetakan yang terhubung ikut berubah — tidak dibuang diam-diam)
  const isRestoredRiwayatDirty = () => {
    if (!restoredRiwayatId) return false
    const r = riwayatList.find(x => x.id === restoredRiwayatId)
    if (!r) return false
    const same =
      (r.namaCustomer || '-') === (selectedCustomer?.name || '-') &&
      (r.namaCetakan || '-') === (printName || '-') &&
      (r.paperName || '') === (selectedPaper?.name || restoredPaperName || 'Custom') &&
      (r.grammage || '0') === (grammage || '0') &&
      (r.paperWidth || '0') === (paperWidth || '0') &&
      (r.paperHeight || '0') === (paperHeight || '0') &&
      (r.cutWidth || '0') === (cutWidth || '0') &&
      (r.cutHeight || '0') === (cutHeight || '0') &&
      (r.quantity || '0') === (quantity || '0') &&
      (r.setelanKertas || '0') === (setelanKertas || '0') &&
      (r.jumlahPesanan || '') === (jumlahPesanan || '') &&
      (r.berapaMata || '') === (berapaMata || '') &&
      (r.namaSuplier || '') === (namaSuplier || '') &&
      Number(r.pricePerSheet || 0) === (parseFloat(pricePerSheet) || 0) &&
      (r.photoUrl || '') === (photoUrl || '')
    return !same
  }

  const handleSaveRiwayat = async () => {
    if (!results) {
      toast.error('Hitung potongan terlebih dahulu!')
      return
    }
    if (isDataSameAsAnyRiwayat()) {
      toast('Data tidak berubah, riwayat tidak duplikat.', { description: 'Ubah minimal 1 data untuk menyimpan riwayat baru.' })
      return
    }
    setSavingRiwayat(true)
    try {
      const res = await fetcher('/api/riwayat-potong-kertas', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload())
      })
      if (res.ok) {
        toast.success('Riwayat berhasil disimpan!', { description: 'Form direset — siap untuk hitungan berikutnya.' })
        notifyDataChange('riwayat-potong-kertas')
        fetchRiwayat()
        fetchNextNumber()
        // Auto-reset: data sudah tersimpan, form bersih untuk hitungan baru (permintaan owner)
        resetFormFields()
        setPkLinkKey(k => k + 1) // data sumber berubah → status relasi HC ikut dicek ulang
      } else {
        const errData = await res.json().catch(() => null)
        console.error('Save riwayat error:', res.status, errData)
        toast.error(errData?.error || `Gagal menyimpan riwayat (${res.status})`)
      }
    } catch (err) {
      console.error('Save riwayat exception:', err)
      toast.error('Gagal menyimpan riwayat')
    }
    setSavingRiwayat(false)
  }

  const handlePO = async () => {
    if (!results) {
      toast.error('Hitung potongan terlebih dahulu!')
      return
    }
    if (isDataSameAsAnyRiwayat()) {
      // Cari riwayat yang sama untuk mendapatkan ID-nya
      const existing = findSameRiwayat()
      if (existing) {
        toast('Data sudah ada di riwayat, langsung ke Purchase Order.', { description: 'Data yang sama tidak disimpan ulang.' })
        router.push(`/purchase-order?riwayatId=${existing.id}`)
      } else {
        // isDataSameAsAnyRiwayat returned true but find didn't match — save a new riwayat
        setSavingRiwayat(true)
        try {
          const res = await fetcher('/api/riwayat-potong-kertas', {
            method: 'POST',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(buildPayload())
          })
          if (res.ok) {
            const saved = await res.json()
            notifyDataChange('riwayat-potong-kertas')
            fetchRiwayat()
            router.push(`/purchase-order?riwayatId=${saved.id}`)
          } else {
            toast.error('Gagal menyimpan data riwayat')
          }
        } catch {
          toast.error('Gagal menyimpan data riwayat')
        }
        setSavingRiwayat(false)
      }
      return
    }
    setSavingRiwayat(true)
    try {
      // Simpan ke riwayat potong kertas dulu
      const res = await fetcher('/api/riwayat-potong-kertas', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload())
      })
      if (res.ok) {
        const saved = await res.json()
        notifyDataChange('riwayat-potong-kertas')
        fetchRiwayat()
        // Navigasi ke halaman PO dengan riwayatId
        router.push(`/purchase-order?riwayatId=${saved.id}`)
      } else {
        toast.error('Gagal menyimpan data riwayat')
      }
    } catch {
      toast.error('Gagal menyimpan data riwayat')
    }
    setSavingRiwayat(false)
  }

  const handleUpdateRiwayat = async () => {
    if (!restoredRiwayatId) {
      toast.error('Tidak ada data yang di-restore')
      return
    }
    if (!results) {
      toast.error('Hitung potongan terlebih dahulu!')
      return
    }
    setSavingRiwayat(true)
    try {
      const res = await fetcher(`/api/riwayat-potong-kertas/${restoredRiwayatId}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload())
      })
      if (res.ok) {
        toast.success('Riwayat berhasil diupdate!', { description: 'Form direset — siap untuk hitungan berikutnya.' })
        notifyDataChange('riwayat-potong-kertas')
        fetchRiwayat()
        fetchNextNumber()
        // Auto-reset: perubahan tersimpan, form bersih untuk hitungan baru (permintaan owner)
        resetFormFields()
        setPkLinkKey(k => k + 1) // sumber berubah → HC terhubung jadi "Perlu diperbarui"
      } else {
        toast.error('Gagal mengupdate riwayat')
      }
    } catch {
      toast.error('Gagal mengupdate riwayat')
    }
    setSavingRiwayat(false)
  }

  // Simpan perubahan riwayat yang sedang diedit SEBELUM membuka Hitung Cetakan
  // (tombol Buka Hitung Cetakan). Server otomatis mensinkronkan Hitung Cetakan
  // yang terhubung — sehingga data di halaman Hitung Cetakan "turut berubah".
  // Return true bila aman lanjut (tidak ada yang perlu disimpan / simpan sukses).
  const saveRestoredBeforeHc = async (): Promise<boolean> => {
    if (!restoredRiwayatId || !isRestoredRiwayatDirty()) return true
    setPreparingHc(true)
    try {
      // Hitung ulang dulu bila ada input yang belum dihitung — hasil yang
      // tersimpan harus konsisten dgn input terbaru (jangan simpan hasil basi).
      let activeRes = results
      if (needsRecalc || !activeRes) {
        const fresh = await recalcForSave()
        if (!fresh) {
          setPreparingHc(false)
          toast.error('Gagal menghitung ulang potongan — periksa ukuran kertas & potongan lalu coba lagi.')
          return false
        }
        activeRes = fresh
        setResults(fresh)
        localStorage.setItem(STORAGE_RESULTS_KEY(), JSON.stringify(fresh))
        justCalculatedRef.current = true
        setNeedsRecalc(false)
      }
      const res = await fetcher(`/api/riwayat-potong-kertas/${restoredRiwayatId}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(activeRes))
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        toast.error(err?.error || `Gagal menyimpan perubahan (${res.status})`, {
          description: 'Perubahan di editor belum masuk riwayat — batal atau coba lagi.',
        })
        setPreparingHc(false)
        return false
      }
      const saved = await res.json().catch(() => null)
      const auto = saved?.autoSync
      if (auto && auto.total > 0) {
        if (auto.updated > 0) {
          const labels = (auto.changed || []).map((c: { label: string }) => c.label)
          toast.success('Perubahan disimpan — Hitung Cetakan terhubung ikut diperbarui.', {
            description: labels.length > 0
              ? `Berubah: ${labels.slice(0, 4).join(', ')}${labels.length > 4 ? `, +${labels.length - 4} lainnya` : ''}.`
              : 'Data sudah sesuai sumber Potong Kertas.',
          })
        } else {
          toast.warning('Perubahan riwayat disimpan, tetapi sinkronisasi ke Hitung Cetakan gagal.', {
            description: 'Buka Hitung Cetakan lalu tekan "Sinkronkan Sekarang" untuk memperbarui.',
          })
        }
      } else {
        toast.success('Perubahan riwayat disimpan.')
      }
      notifyDataChange('riwayat-potong-kertas')
      fetchRiwayat()
      setPkLinkKey(k => k + 1) // status relasi HC ikut dicek ulang
      setPreparingHc(false)
      return true
    } catch {
      toast.error('Gagal menyimpan perubahan (jaringan terputus)')
      setPreparingHc(false)
      return false
    }
  }

  const handlePreviewRiwayat = async (r: any) => {
    let resultData: CuttingResult | null = null

    // Try resultData from riwayat first
    if (r.resultData) {
      try {
        const parsed = JSON.parse(r.resultData)
        // Abaikan resultData format lama (tanpa paperWidth / koordinat blok x)
        // supaya dihitung ulang oleh cutting engine — diagram potong tidak rusak (viewBox NaN)
        if (parsed && typeof parsed.paperWidth === 'number' && parsed.paperWidth > 0
          && Array.isArray(parsed.blocks) && parsed.blocks.length > 0
          && typeof parsed.blocks[0].x === 'number') {
          resultData = parsed
        }
      } catch {}
    }

    // If no resultData, calculate from riwayat values
    if (!resultData) {
      const pw = parseFloat(r.paperWidth)
      const ph = parseFloat(r.paperHeight)
      const cw = parseFloat(r.cutWidth)
      const ch = parseFloat(r.cutHeight)
      const qty = parseInt(r.quantity) || 0
      const setelan = parseInt(r.setelanKertas) || 0
      const price = parseFloat(r.pricePerSheet) || 0

      if (pw && ph && cw && ch) {
        try {
          const { calculateCuts } = await import('@/lib/cutting-engine')
          resultData = calculateCuts({
            paperWidth: pw, paperHeight: ph, cutWidth: cw, cutHeight: ch,
            quantity: qty + setelan, pricePerSheet: price, optimizationMode,
            customerName: r.namaCustomer || '',
            paperMaterial: r.paperName || '',
            grammage: parseFloat(r.grammage) || 0,
          })
        } catch {}
      }
    }

    if (resultData) {
      // Perbandingan Ukuran Kertas utk preview riwayat: hitung ulang kandidat dari
      // Master Kertas memakai data baris (bahan + gramatur + ukuran potong + jumlah).
      // Gagal / data tidak lengkap → tabel perbandingan disembunyikan, preview tetap terbuka.
      let riwayatCandidates: CandidateResult[] | null = null
      let riwayatSelectedIdx = 0
      try {
        const cw = parseFloat(r.cutWidth)
        const ch = parseFloat(r.cutHeight)
        const g = Math.round(parseFloat(r.grammage) || 0)
        const qty = parseInt(r.quantity) || 0
        if (r.paperName && g > 0 && cw > 0 && ch > 0 && qty > 0) {
          const res = await fetcher('/api/potong-kertas/optimize', {
            method: 'POST',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bahan: r.paperName,
              grammage: g,
              cutWidth: cw,
              cutHeight: ch,
              quantity: qty,
              setelanKertas: parseInt(r.setelanKertas) || 0,
              optimizationMode,
            }),
          })
          const data = await res.json().catch(() => null)
          if (res.ok && data?.ok && Array.isArray(data.candidates) && data.candidates.length > 0) {
            riwayatCandidates = data.candidates as CandidateResult[]
            // Tandai baris kandidat yang ukuran kertasnya sama dgn baris riwayat (badge DIPILIH)
            const refW = resultData.paperWidth
            const refH = resultData.paperHeight
            const found = riwayatCandidates.findIndex(
              c => Math.abs(c.paperWidth - refW) < 0.01 && Math.abs(c.paperHeight - refH) < 0.01
            )
            riwayatSelectedIdx = found >= 0 ? found : 0
          }
        }
      } catch {}
      setPreviewRiwayatCandidates(riwayatCandidates)
      setPreviewRiwayatSelectedIdx(riwayatSelectedIdx)
      setPreviewRiwayatData(resultData)
      setPreviewRiwayatRow(r)
      setPreviewRiwayatInfo({
        customer: (r.namaCustomer && r.namaCustomer !== '-') ? r.namaCustomer : '-',
        paper: r.paperName || 'Custom',
        jumlahPesanan: r.jumlahPesanan || '',
        berapaMata: r.berapaMata || '',
        setelanKertas: r.setelanKertas || '',
      })
      setPreviewOpen(true)
    } else {
      toast.error('Data tidak cukup untuk preview')
    }
  }

  const handleEditFromPreview = () => {
    if (previewRiwayatRow) handleRestore(previewRiwayatRow)
    // Langsung pindah ke tab editor (tidak menunggu kalkulasi async selesai)
    setActiveTab('editor')
    setPreviewOpen(false)
    setPreviewRiwayatData(null)
    setPreviewRiwayatRow(null)
    setPreviewRiwayatCandidates(null)
    setPreviewRiwayatSelectedIdx(0)
    setPreviewRiwayatInfo({ customer: '-', paper: '-', jumlahPesanan: '', berapaMata: '', setelanKertas: '' })
  }

  const handleRestore = async (r: any) => {
    // Set flag to prevent selectedPaper useEffect from overriding restored values
    isRestoringRef.current = true
    setRestoredRiwayatId(r.id)
    setPrintName(r.namaCetakan || '')
    setGrammage(r.grammage || '')
    setPaperWidth(r.paperWidth || '')
    setPaperHeight(r.paperHeight || '')
    setCutWidth(r.cutWidth || '')
    setCutHeight(r.cutHeight || '')
    setQuantity(r.quantity || '')
    setSetelanKertas(r.setelanKertas || '')
    setPricePerSheet(r.pricePerSheet?.toString() || '')
    setPricePerKg(sheetToKgPrice(parseFloat(r.pricePerSheet) || 0, r.paperWidth || 0, r.paperHeight || 0, r.grammage || 0))
    setJumlahPesanan(r.jumlahPesanan || '')
    setBerapaMata(r.berapaMata || '')
    // Foto lampiran ikut di-restore ke editor
    setPhotoUrl(r.photoUrl || '')

    // Riwayat hasil OPTIMASI (format baru dgn wasteAreas): pakai pola tersimpan PERSIS
    // (layout + rincian sisa saat disimpan) — tidak dihitung ulang agar identik.
    let savedOptimized: CuttingResultPlus | null = null
    try {
      const parsed = r.resultData ? JSON.parse(r.resultData) : null
      if (parsed && typeof parsed.paperWidth === 'number' && parsed.paperWidth > 0
        && Array.isArray(parsed.blocks) && parsed.blocks.length > 0
        && typeof parsed.blocks[0].x === 'number'
        && Array.isArray(parsed.wasteAreas) && parsed.wasteAreas.length > 0) {
        savedOptimized = parsed
      }
    } catch {}

    // Set paper selection
    let restoredPaper: Paper | null = null
    if (r.paperId && papers.find(p => p.id === r.paperId)) {
      setSelectedPaperId(r.paperId)
      setIsCustomPaper(false)
      restoredPaper = papers.find(p => p.id === r.paperId) || null
      setRestoredPaperName(null)
    } else {
      setSelectedPaperId('custom')
      setIsCustomPaper(true)
      setRestoredPaperName(r.paperName || null)
    }

    // Match customer by name
    let restoredCustomer: Customer | null = null
    if (r.namaCustomer && r.namaCustomer !== '-') {
      const match = customers.find(c => c.name === r.namaCustomer)
      if (match) {
        setSelectedCustomerId(match.id)
        restoredCustomer = match
      } else {
        setSelectedCustomerId('')
      }
    } else {
      setSelectedCustomerId('')
    }
    // Suplier ikut direstore dari riwayat (field baru) + jadi pilihan bersama antar halaman
    setNamaSuplier(r.namaSuplier || '')
    setSharedSuplier(r.namaSuplier || '')

    if (savedOptimized) {
      // === Riwayat mode otomatis (optimasi) ===
      justCalculatedRef.current = true
      setResults(savedOptimized)
      localStorage.setItem(STORAGE_RESULTS_KEY(), JSON.stringify(savedOptimized))
      setCutMode('otomatis')
      setAutoBahan(savedOptimized.paperMaterial || r.paperName || '')
      const gsm = parseInt(r.grammage) || parseInt(savedOptimized.grammage as any) || 0
      setAutoGrammage(gsm > 0 ? String(gsm) : '')
      setCandidates([]) // alternatif dihitung ulang saat tombol Hitung ditekan lagi
      setSelectedCandidateIdx(0)
      setOptimizeMessage('')
      setSelectedWasteId(null)
      setNeedsRecalc(false)
    } else {
      // === Riwayat manual / lama: hitung ulang seperti sebelumnya ===
      // FIX "nama bahan & gramatur kosong saat edit riwayat": resultData format lama /
      // hasil hitung manual tidak menyimpan wasteAreas → riwayat yang dibuat lewat
      // mode Otomatis pun jatuh ke cabang ini. Cabang lama tidak mengisi
      // autoBahan/autoGrammage dan tidak mengatur cutMode, sehingga editor (default
      // mode Otomatis) menampilkan bahan & gramatur KOSONG. Sekarang mode & pilihan
      // bahan ditentukan dari identitas bahan yang tersimpan di riwayat:
      //   • ada identitas bahan master (paperId valid di master ATAU paperName +
      //     gramatur > 0) → mode Otomatis, combobox bahan & gramatur diisi dari riwayat;
      //   • tidak ada (kertas custom) → mode Manual, nama bahan custom tampil di
      //     panel manual (label amber restoredPaperName).
      const hasMasterBahan = Boolean(
        (r.paperId && r.paperId !== 'custom' && papers.some(p => p.id === r.paperId)) ||
        (r.paperName && parseFloat(r.grammage) > 0)
      )
      if (hasMasterBahan) {
        setCutMode('otomatis')
        setAutoBahan(r.paperName || '')
        const gsm = parseInt(r.grammage) || 0
        setAutoGrammage(gsm > 0 ? String(gsm) : '')
      } else {
        setCutMode('manual')
      }
      const pw = parseFloat(r.paperWidth)
      const ph = parseFloat(r.paperHeight)
      const cw = parseFloat(r.cutWidth)
      const ch = parseFloat(r.cutHeight)
      const qty = parseInt(r.quantity) || 0
      const setelan = parseInt(r.setelanKertas) || 0
      const price = parseFloat(r.pricePerSheet) || 0
      const totalQty = qty + setelan

      if (pw && ph && cw && ch && cw <= pw && ch <= ph) {
        try {
          const { calculateCuts } = await import('@/lib/cutting-engine')
          const result = calculateCuts({
            paperWidth: pw, paperHeight: ph, cutWidth: cw, cutHeight: ch,
            quantity: totalQty, pricePerSheet: price, optimizationMode,
            customerName: restoredCustomer?.name || '',
            paperMaterial: restoredPaper?.name || '',
            grammage: parseFloat(r.grammage) || 0,
          })
          setResults(result)
          localStorage.setItem(STORAGE_RESULTS_KEY(), JSON.stringify(result))
        } catch {
          setResults(null)
        }
      } else if (r.resultData) {
        // Fallback: if can't calculate, use saved resultData
        try {
          const parsedResults = JSON.parse(r.resultData)
          setResults(parsedResults)
          localStorage.setItem(STORAGE_RESULTS_KEY(), JSON.stringify(parsedResults))
        } catch {
          setResults(null)
        }
      } else {
        setResults(null)
      }
    }

    // Reset flag after a frame to allow normal useEffect behavior again
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        isRestoringRef.current = false
        restoreDoneRef.current = true
      })
    })

    setActiveTab('editor')
    toast.success('Data berhasil di-restore dari riwayat!')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ===== SINKRONISASI PERMANEN PK ↔ HC =====
  // Id riwayat PK yang "aktif" di editor: riwayat yang di-restore, ATAU riwayat
  // yang identik dgn data form (mis. baru disimpan / baru diteruskan ke HC).
  const currentPkId = useMemo<string | null>(() => {
    if (restoredRiwayatId) return restoredRiwayatId
    return findSameRiwayat()?.id || null
     
  }, [restoredRiwayatId, riwayatList, selectedCustomer, printName, selectedPaper, restoredPaperName, paperWidth, paperHeight, cutWidth, cutHeight, quantity, results, jumlahPesanan, berapaMata])

  // Muat status relasi HC utk riwayat aktif (terhubung? synced/stale? kapan?)
  useEffect(() => {
    if (!currentPkId) { setPkHcLink(null); return }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetcher(`/api/potong-cetakan-sync?pkId=${encodeURIComponent(currentPkId)}`, { headers: getAuthHeaders() })
        if (cancelled) return
        if (!res.ok) { setPkHcLink(null); return }
        const d = await res.json()
        setPkHcLink(d.linkedHc ? {
          hcId: d.linkedHc.id,
          hcNomor: d.linkedHc.nomor,
          status: d.status,
          lastSyncedAt: d.linkedHc.pkLastSyncedAt || null,
        } : null)
      } catch {
        if (!cancelled) setPkHcLink(null)
      }
    })()
    return () => { cancelled = true }
  }, [currentPkId, pkLinkKey])

  // ===== Restore via deep-link dari halaman Riwayat: /potong-kertas?restore=<id> =====
  const restoreParamAppliedRef = useRef(false)
  useEffect(() => {
    const rid = searchParams.get('restore')
    if (!rid || restoreParamAppliedRef.current) return
    // Tunggu daftar riwayat & data master kertas siap agar restore akurat
    if (!riwayatList.length || (!papers.length && !papersFetchDone)) return
    restoreParamAppliedRef.current = true
    window.history.replaceState({}, '', '/potong-kertas')
    const row = riwayatList.find(r => r.id === rid)
    if (!row) {
      toast.error('Data riwayat tidak ditemukan')
      return
    }
    handleRestore(row)
  }, [searchParams, riwayatList, papers, papersFetchDone])

  const handleDeleteRiwayat = async (id: string) => {
    if (!confirm('Beneran mau dihapus nih?')) return
    try {
      // Retry sekali pada 500 (transien pooler/serverless) — aman karena
      // retry yang menghasilkan 404 akan di-self-heal di bawah.
      const doDelete = () => fetcher(`/api/riwayat-potong-kertas/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })
      let res = await doDelete()
      if (!res.ok && res.status === 500) {
        await new Promise((r) => setTimeout(r, 600))
        res = await doDelete()
      }
      if (res.ok) {
        toast.success('Riwayat berhasil dihapus')
        notifyDataChange('riwayat-potong-kertas')
        if (restoredRiwayatId === id) setRestoredRiwayatId(null)
        fetchRiwayat()
        return
      }
      // 404 = data sudah tidak ada di server (daftar di layar kadaluarsa) —
      // bersihkan baris dari daftar agar tidak menggantung.
      if (res.status === 404) {
        setRiwayatList(prev => prev.filter(r => r.id !== id))
        toast.info('Data sudah tidak ada di server — daftar diperbarui')
        return
      }
      let srv = ''
      try { srv = (await res.json())?.error || '' } catch {}
      toast.error(`Gagal menghapus riwayat (${res.status}${srv ? `: ${srv}` : ''})`)
    } catch {
      toast.error('Gagal menghapus riwayat (jaringan terputus)')
    }
  }

  // Cetak: hasil cetak = sama persis dengan isi popup preview, di-fit ke halaman A5 portrait (148 × 210 mm)
  const handlePrint = async () => {
    const activeResults = previewRiwayatData || results
    if (!activeResults) return
    // Pastikan popup preview terbuka agar hasil cetak identik dengan yang dilihat user
    if (!previewRef.current) {
      setPreviewOpen(true)
      await new Promise((resolve) => setTimeout(resolve, 400))
      if (!previewRef.current) return
    }
    const el = previewRef.current
    setIsPrinting(true)
    try {
      // Cetak hi-res 300 DPI: capture preview apa adanya (fixedWidth 720px agar
      // hasil identik mobile & desktop) → gambar dicetak via popup/iframe —
      // bukan lagi jalur window.print + @media print yang tergantung browser.
      const blob = await captureElementAsJpg(el, { pixelRatio: HIRES_PIXEL_RATIO, fixedWidth: 720 })
      const custLabel = (previewRiwayatData ? previewRiwayatInfo.customer : (selectedCustomer?.name || printName || 'potong-kertas'))
      const ok = await printBlobHiRes(blob, { title: `Potong Kertas ${custLabel}`, page: 'A5 portrait', margin: '5mm' })
      if (!ok) {
        toast.error('Popup diblokir. Izinkan popup untuk mencetak.')
        return
      }
    } catch (err) {
      console.error('Print error:', err)
      toast.error('Gagal menyiapkan cetakan')
    } finally {
      setIsPrinting(false)
    }
  }

  // JPG: hasil gambar = sama persis dengan isi popup preview, dibingkai kanvas A5 portrait
  // (148 × 210 mm) — SAMA dengan hasil JPG halaman Hitung Cetakan
  const handleJpg = async () => {
    const el = previewRef.current
    if (!el) return
    const activeResults = previewRiwayatData || results
    if (!activeResults) return

    setIsGeneratingJpg(true)
    try {
      // Hi-res 300 DPI + fixedWidth 720px → hasil identik mobile & desktop
      const rawBlob = await captureElementAsJpg(el, { pixelRatio: HIRES_PIXEL_RATIO, fixedWidth: 720 })
      // Kanvas A5 portrait (148 × 210 mm @300 DPI = 1748×2480 px) — sama dengan halaman Hitung Cetakan
      const blob = await fitBlobToA5(rawBlob, { orientation: 'portrait', marginPct: 3 })
      const custLabel = (previewRiwayatData ? previewRiwayatInfo.customer : (selectedCustomer?.name || printName || 'preview'))
      const fileName = `potong-kertas-${(custLabel || 'preview').replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.jpg`

      const result = await shareJpgToWhatsApp({
        blob,
        fileName,
        documentLabel: 'Potong Kertas',
      })

      if (result.status === 'shared') {
        toast.success('Gambar JPG dibagikan ke WhatsApp')
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

  const handleShareWhatsApp = () => {
    const activeResults = previewRiwayatData || results
    if (!activeResults) return

    const r = activeResults
    const paperLabel = selectedPaper?.name || restoredPaperName || 'Custom'
    const gramLabel = grammage ? `${grammage} gsm` : '-'

    let msg = `*Potong Kertas - www.darrellsoft.com*\n\n`
    msg += `Nama Bahan: ${paperLabel}\n`
    msg += `Gramatur: ${gramLabel}\n`
    msg += `Ukuran Kertas: ${r.paperWidth} × ${r.paperHeight} cm\n`
    msg += `Ukuran Potong: ${r.cutWidth} × ${r.cutHeight} cm\n`
    msg += `Kertas yg dibeli: ${r.sheetsNeeded} lembar\n`
    msg += `Potongan Jadi: ${r.totalPieces}\n`
    msg += `Harga Kertas: Rp ${Math.round(r.totalPrice).toLocaleString('id-ID')}\n`
    msg += `Terima Kasih.`

    const encoded = encodeURIComponent(msg)

    openWhatsApp(encoded, { waWindowRef })
    toast.success('Membuka WhatsApp...')
  }

  return (
    <DashboardLayout
      title={t('potong_kertas')}
      subtitle={t('subtitle_potong_kertas')}
    >
      {/* Tab Navigation */}
      <div className="sticky top-0 z-20 -mx-4 px-4 lg:-mx-[3mm] lg:px-[3mm] bg-card flex items-center gap-2 mb-3">
        <button
          onClick={() => setActiveTab('editor')}
          className={`px-4 py-1.5 text-sm font-semibold rounded-lg border transition-colors ${
            activeTab === 'editor'
              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
              : 'bg-card text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
          }`}
        >
          Editor
        </button>
        <button
          onClick={() => setActiveTab('riwayat')}
          className={`px-4 py-1.5 text-sm font-semibold rounded-lg border transition-colors ${
            activeTab === 'riwayat'
              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
              : 'bg-card text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
          }`}
        >
          Riwayat
          {riwayatList.length > 0 && (
            <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === 'riwayat' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{riwayatList.length}</span>
          )}
        </button>
      </div>

      {/* Editor Tab Content */}
      {activeTab === 'editor' && (
      <>
      {/* === SINGLE PAGE LAYOUT: Form left, Results right === */}
      <div className="flex flex-col lg:flex-row lg:min-h-[calc(100vh-8rem)] gap-3 lg:min-h-0">

        {/* ===== LEFT: FORM ===== */}
        <div className="lg:w-[386px] xl:w-[416px] flex-shrink-0 flex flex-col gap-1.5">
          {/* No Potong Kertas — saat meng-edit riwayat (dari tombol Edit di preview / Muat di riwayat),
              tampilkan nomor riwayat YANG DIEDIT (sama dgn di preview) — bukan nomor berikutnya utk simpan baru */}
          {(() => {
            const nomorTampil = editedNomorUrut || nextPotongKertasNumber
            if (!nomorTampil) return null
            return (
              <div className={`rounded-xl px-3 py-2 flex items-center gap-1.5 border ${editedNomorUrut ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800' : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700'}`}>
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider whitespace-nowrap">No. Potong Kertas :</span>
                <span className="text-sm font-bold text-black dark:text-white font-mono">{nomorTampil}</span>
                {editedNomorUrut && (
                  <span className="ml-auto text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-white dark:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 rounded-full px-2 py-0.5 whitespace-nowrap">Mode Edit</span>
                )}
              </div>
            )
          })()}
          {/* Info Cetak */}
          <div className="bg-card rounded-xl border border-slate-200 p-2.5">
            <div className="space-y-1.5">
              <div className="space-y-1.5">
                <div className="relative">
                  {/* Label + tombol "Tambah Cust" (popup Master Customer) di ATAS field nama customer */}
                  <div className="flex items-center justify-between gap-2">
                    <label className={lbl}>{t('nama_customer')}</label>
                    <button
                      type="button"
                      onClick={() => setAddCustOpen(true)}
                      title="Tambah customer baru — popup lengkap (nama, telepon, alamat, dll)"
                      className="inline-flex items-center gap-1 h-6 px-2 mb-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-[11px] font-semibold transition-colors cursor-pointer shrink-0"
                    >
                      <UserPlus className="w-3 h-3" /> Tambah Cust
                    </button>
                  </div>
                  <Select value={selectedCustomerId} onValueChange={(id) => setSelectedCustomerId(id)}>
                    <SelectTrigger className="w-full h-9 text-sm">
                      <SelectValue placeholder={t('pilih_customer')}>
                        {selectedCustomer?.name || t('pilih_customer')}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {customers.length === 0 && (
                        <div className="px-3 py-2 text-sm text-slate-400 text-center">Tidak ada customer — pakai Tambah Cust</div>
                      )}
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="text-[14px]">{c.name}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className={lbl}>{t('nama_cetakan')}</label>
                  <input type="text" placeholder="Nama cetakan" value={printName} onChange={(e) => setPrintName(e.target.value)} className={inp} />
                </div>
              </div>
              {/* Nama Suplier di ATAS nama bahan kertas (permintaan user) — dropdown dari Master Toko Pemasok.
                  Suplier menentukan sumber harga: bila suplier (mis. Bintang Timur) dipilih, harga bahan
                  mengikuti entri suplier tsb di Master Harga Kertas, dan dropdown bahan HANYA memuat
                  kertas milik suplier tsb. */}
              <div>
                <label className={lbl}>Nama Suplier</label>
                <Select value={namaSuplier || 'none'} onValueChange={(v) => { const sup = v === 'none' ? '' : v; setNamaSuplier(sup); setSharedSuplier(sup) }}>
                  <SelectTrigger className="w-full h-9 text-sm">
                    <SelectValue placeholder="Pilih suplier (opsional)">
                      {namaSuplier || 'Pilih suplier (opsional)'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="none"><span className="text-[14px] text-slate-400">— Tanpa suplier —</span></SelectItem>
                    {supliers.length === 0 && (
                      <div className="px-3 py-2 text-xs text-slate-400 text-center">Belum ada suplier — isi di Master Toko Pemasok</div>
                    )}
                    {supliers.map((s) => (
                      <SelectItem key={s.id} value={s.namaToko}>
                        <span className="text-[14px]">{s.namaToko}{s.jenisBarang ? ` · ${s.jenisBarang}` : ''}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* ===== Mode pilih kertas: Otomatis (rekomendasi dari Master Kertas) / Manual ===== */}
              <div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-zinc-800 rounded-lg p-1">
                <button type="button" onClick={() => setCutMode('otomatis')}
                  className={`flex items-center justify-center gap-1 h-8 rounded-md text-xs font-semibold transition-colors ${cutMode === 'otomatis' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-zinc-700'}`}>
                  <Wand2 className="w-3.5 h-3.5" /> Otomatis (Rekomendasi)
                </button>
                <button type="button" onClick={() => setCutMode('manual')}
                  className={`flex items-center justify-center gap-1 h-8 rounded-md text-xs font-semibold transition-colors ${cutMode === 'manual' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-zinc-700'}`}>
                  Manual
                </button>
              </div>
              {cutMode === 'otomatis' ? (
                <>
                  {/* ===== PANEL OTOMATIS: bahan → gramatur → ukuran potongan → jumlah cetakan (otomatis) ===== */}
                  <div>
                    <label className={lbl}>Nama Bahan</label>
                    <Select value={autoBahan} onValueChange={(v) => { setAutoBahan(v); setAutoGrammage('') }}>
                      <SelectTrigger className="w-full h-9 text-sm">
                        <SelectValue placeholder="Pilih bahan">
                          {autoBahan || 'Pilih bahan'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {bahanOptions.length === 0 && (
                          <div className="px-3 py-2 text-xs text-slate-400 text-center">{namaSuplier ? `Tidak ada kertas milik ${namaSuplier}` : 'Belum ada bahan — isi Master Bahan'}</div>
                        )}
                        {bahanOptions.map((n) => (
                          <SelectItem key={n} value={n}><span className="text-[14px] capitalize">{n}</span></SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={lbl}>Gramatur</label>
                      <Select value={autoGrammage} onValueChange={setAutoGrammage}>
                        <SelectTrigger className="w-full h-9 text-sm">
                          <SelectValue placeholder="Pilih gramatur">
                            {autoGrammage ? `${autoGrammage} gsm` : 'Pilih gramatur'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          {gramaturOptions.length === 0 && (
                            <div className="px-3 py-2 text-xs text-slate-400 text-center">Pilih bahan terlebih dahulu</div>
                          )}
                          {gramaturOptions.map((g) => (
                            <SelectItem key={g} value={String(g)}><span className="text-[14px]">{g} gsm</span></SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className={lbl}>Harga / Lembar (otomatis)</label>
                      <div className={inpDisabled + " truncate"}>Rp {Math.round(parseFloat(pricePerSheet) || 0).toLocaleString('id-ID') || '0'}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={lbl}>Lebar Potongan (cm)</label>
                      <input type="number" step="0.1" min="0" placeholder="misal: 21,5" value={cutWidth} onChange={(e) => setCutWidth(e.target.value)} className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>Tinggi Potongan (cm)</label>
                      <input type="number" step="0.1" min="0" placeholder="misal: 28,5" value={cutHeight} onChange={(e) => setCutHeight(e.target.value)} className={inp} />
                    </div>
                  </div>
                  {/* ===== Rekomendasi otomatis (terisi dari hasil optimasi / restore) ===== */}
                  {results && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 dark:bg-emerald-950/20 dark:border-emerald-900 p-2 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Wand2 className="w-3.5 h-3.5 text-emerald-600" />
                        <p className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">Ukuran Kertas Rekomendasi</p>
                        {candidates.length > 1 && (
                          <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded-full">
                            {selectedCandidateIdx === 0 ? 'Terbaik dari ' + candidates.length + ' ukuran' : `Alternatif ${selectedCandidateIdx + 1}/${candidates.length}`}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10.5px] text-slate-700 dark:text-slate-200">
                        <div>Ukuran: <span className="font-bold">{results.paperWidth} × {results.paperHeight} cm</span></div>
                        <div>Harga/lembar: <span className="font-bold">Rp {Math.round(parseFloat(pricePerSheet) || results.pricePerSheet || 0).toLocaleString('id-ID')}</span></div>
                        <div>Potongan/lembar: <span className="font-bold">{results.totalPieces}</span></div>
                        <div>Lembar dibeli: <span className="font-bold">{results.sheetsNeeded.toLocaleString('id-ID')}</span>{(results.leftoverPieces || 0) > 0 && <span className="text-slate-400"> (+{(results.leftoverPieces || 0)} lebih)</span>}</div>
                        <div className="col-span-2">Total biaya kertas: <span className="font-bold text-emerald-700 dark:text-emerald-400">Rp {Math.round(results.totalPrice).toLocaleString('id-ID')}</span></div>
                        <div className="col-span-2 text-[9.5px] text-slate-500 dark:text-slate-400 capitalize">
                          {results.paperMaterial ? `${results.paperMaterial} ${results.grammage || grammage} gsm` : ''}{namaSuplier ? ` · ${namaSuplier}` : ''} · {results.strategy}
                        </div>
                      </div>
                    </div>
                  )}
                  {optimizeMessage && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 px-2.5 py-2 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="text-[10.5px] leading-snug text-amber-800 dark:text-amber-300">{optimizeMessage}</p>
                    </div>
                  )}
                </>
              ) : (
              <>
              <div>
                <label className={lbl}>{t('nama_bahan_kertas')}</label>
                <Select value={selectedPaperId} onValueChange={handlePaperChange}>
                  <SelectTrigger className="w-full h-9 text-sm">
                    <SelectValue placeholder={t('pilih_kertas')}>
                      {selectedPaperId === 'custom' && restoredPaperName
                        ? <span className="text-amber-700">{restoredPaperName}</span>
                        : selectedPaperId === 'custom'
                          ? t('custom_input_manual')
                          : selectedPaper?.name || t('pilih_kertas')
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">
                      <div className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        <span className="text-[14px]">{t('custom_input_manual')}</span>
                      </div>
                    </SelectItem>
                    {namaSuplier && paperOptions.length === 0 && (
                      <div className="px-3 py-2 text-xs text-slate-400 text-center">Tidak ada kertas milik {namaSuplier} — isi kolom Suplier di Master Bahan</div>
                    )}
                    {paperOptions.map((p) => (<SelectItem key={p.id} value={p.id}><span className="text-[14px]">{p.name} ({p.width}×{p.height}, {p.grammage}gsm{p.suplier ? ` · ${p.suplier}` : ''})</span></SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={lbl}>{t('gramatur')}</label>
                  <input type="number" step="1" min="0" placeholder="150" value={grammage} onChange={(e) => setGrammage(e.target.value)} className={inp} />
                </div>
                <div>
                  <label className={lbl}>{t('harga_per_lembar')}</label>
                  <input type="number" step="0.01" min="0" placeholder="0" value={pricePerSheet} onChange={(e) => {
                    const v = e.target.value
                    setPricePerSheet(v)
                    // Sinkronkan harga/kg dari harga per lembar
                    setPricePerKg(sheetToKgPrice(parseFloat(v) || 0, paperWidth, paperHeight, grammage))
                  }} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Harga Kertas /kg</label>
                  <input type="number" step="0.01" min="0" placeholder="0" value={pricePerKg} onChange={(e) => {
                    const v = e.target.value
                    setPricePerKg(v)
                    // Isi otomatis harga per lembar dari harga per kg
                    const kg = parseFloat(v) || 0
                    if (kg > 0 && canConvertKg(paperWidth, paperHeight, grammage)) {
                      setPricePerSheet(kgToSheetPrice(kg, parseFloat(paperWidth) || 0, parseFloat(paperHeight) || 0, parseFloat(grammage) || 0).toString())
                    }
                  }} className={inp} />
                </div>
              </div>
              </>
              )}
              {!canConvertKg(paperWidth, paperHeight, grammage) && cutMode === 'manual' && (
                <p className="text-[10px] text-slate-400 mt-0.5">Isi ukuran kertas & gramatur untuk konversi otomatis antara harga /kg dan harga /lembar</p>
              )}
              {cutMode === 'manual' ? (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={lbl}>Jumlah Pesanan</label>
                  <input type="number" step="1" min="0" placeholder="0" value={jumlahPesanan} onChange={(e) => setJumlahPesanan(e.target.value)} className={inp} />
                </div>
                <div>
                  <label className={lbl}><span className="md:hidden">Cetak Brp Mata</span><span className="hidden md:inline">Cetak Berapa Mata</span></label>
                  <input type="number" step="1" min="0" placeholder="0" value={berapaMata} onChange={(e) => setBerapaMata(e.target.value)} className={inp} />
                </div>
                <div>
                  <label className={lbl}>{t('jumlah_cetakan')}</label>
                  <input type="number" step="1" min="0" placeholder="Auto" value={computedQuantity || quantity} onChange={(e) => setQuantity(e.target.value)} className={computedQuantity ? inpDisabled : inp} readOnly={!!computedQuantity} />
                </div>
              </div>
              ) : (
              <div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className={lbl}>Jumlah Pesanan</label>
                    <input type="number" step="1" min="0" placeholder="0" value={jumlahPesanan} onChange={(e) => setJumlahPesanan(e.target.value)} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}><span className="md:hidden">Cetak Brp Mata</span><span className="hidden md:inline">Cetak Berapa Mata</span></label>
                    <input type="number" step="1" min="0" placeholder="0" value={berapaMata} onChange={(e) => setBerapaMata(e.target.value)} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>{t('jumlah_cetakan')}</label>
                    <input type="number" step="1" min="0" placeholder="Auto" value={computedQuantity || quantity} readOnly className={inpDisabled} />
                  </div>
                </div>
                <p className="text-[9.5px] text-slate-400 mt-0.5">Jumlah cetakan terisi otomatis (Jumlah Pesanan ÷ Cetak Berapa Mata) — tidak bisa diedit.</p>
              </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={lbl}>Insit Kertas</label>
                  <input type="number" step="1" min="0" placeholder="0" value={setelanKertas} onChange={(e) => setSetelanKertas(e.target.value)} className={inp} />
                </div>
                <div>
                  <label className={lbl}>{t('mode_optimasi')}</label>
                  <Select value={optimizationMode} onValueChange={(v: any) => setOptimizationMode(v)}>
                    <SelectTrigger className="w-full h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fast"><span className="text-[11px]">Cepat (Greedy)</span></SelectItem>
                      <SelectItem value="maximal"><span className="text-[11px]">Maksimal (Brute Force)</span></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* Ukuran — mode manual (mode otomatis: ukuran kertas & potongan ada di panel otomatis) */}
          {cutMode === 'manual' && (
          <div className="bg-card rounded-xl border border-slate-200 p-2.5">
            <p className="text-xs font-semibold text-slate-700 mb-2">Ukuran</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <div>
                <label className={lbl}>{t('lebar_kertas')}</label>
                <input type="number" step="0.1" placeholder="W" value={paperWidth} onChange={(e) => setPaperWidth(e.target.value)} disabled={!isCustomPaper}
                  className={!isCustomPaper ? inpDisabled : inp} />
              </div>
              <div>
                <label className={lbl}>{t('tinggi_kertas')}</label>
                <input type="number" step="0.1" placeholder="H" value={paperHeight} onChange={(e) => setPaperHeight(e.target.value)} disabled={!isCustomPaper}
                  className={!isCustomPaper ? inpDisabled : inp} />
              </div>
              <div>
                <label className={lbl}>{t('lebar_potongan')}</label>
                <input type="number" step="0.1" placeholder="W" value={cutWidth} onChange={(e) => setCutWidth(e.target.value)} className={inp} />
              </div>
              <div>
                <label className={lbl}>{t('tinggi_potongan')}</label>
                <input type="number" step="0.1" placeholder="H" value={cutHeight} onChange={(e) => setCutHeight(e.target.value)} className={inp} />
              </div>
            </div>

          </div>
          )}

          {/* Foto Lampiran */}
          <div className="bg-card rounded-xl border border-slate-200 p-2.5">
            <PhotoUpload value={photoUrl} onChange={setPhotoUrl} label="Foto Lampiran" />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-2">
              {cutMode === 'otomatis' ? (
              <button onClick={runAutoOptimize} disabled={optimizeLoading || isCalculating || !autoBahan || !(parseInt(autoGrammage) > 0) || !(parseFloat(cutWidth) > 0) || !(parseFloat(cutHeight) > 0) || !(parseInt(computedQuantity || quantity) > 0)}
                className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
                title="Cari ukuran kertas paling efisien dari Master Kertas">
                {optimizeLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span className="leading-tight text-center">Hitung &<br className="sm:hidden" /> Pilih Terbaik</span>
              </button>
              ) : (
              <button onClick={handleCalculateCuts} disabled={isCalculating || !(parseFloat(paperWidth) > 0) || !(parseFloat(paperHeight) > 0) || !(parseFloat(cutWidth) > 0) || !(parseFloat(cutHeight) > 0) || !(parseInt(computedQuantity || quantity) > 0)}
                className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
                {isCalculating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {t('hitung_potongan')}
              </button>
              )}
              <button onClick={restoredRiwayatId ? handleUpdateRiwayat : handleSaveRiwayat} disabled={!results || savingRiwayat || needsRecalc}
                className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors" title={restoredRiwayatId ? 'Update Riwayat' : 'Simpan Riwayat'}>
                {restoredRiwayatId && <RefreshCw className={`w-3 h-3 ${savingRiwayat ? 'animate-spin' : ''}`} />}
                {restoredRiwayatId ? (savingRiwayat ? 'Updating...' : <span className="leading-tight text-center">Update<br className="sm:hidden" /> Riwayat</span>) : (savingRiwayat ? 'Menyimpan...' : <span className="leading-tight text-center">Simpan<br className="sm:hidden" /> Riwayat</span>)}
              </button>
              <button onClick={handlePO} disabled={!results || savingRiwayat || needsRecalc}
                className="flex items-center justify-center gap-1.5 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors" title="Purchase Order">
                PO
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <button onClick={() => { if (!results) { toast.error('Hitung potongan terlebih dahulu!'); return; } setPreviewRiwayatCandidates(null); setPreviewRiwayatSelectedIdx(0); setPreviewOpen(true) }} disabled={!results || needsRecalc}
                className="flex items-center justify-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors" title={t('preview')}>
                {t('preview')}
              </button>
              <button onClick={handlePrint} disabled={isPrinting || !results || needsRecalc}
                className="flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors" title={t('cetak')}>
                {isPrinting && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('cetak')}
              </button>
              <button onClick={handleShareWhatsApp} disabled={!results || needsRecalc}
                className="flex items-center justify-center gap-1 min-w-0 bg-green-600 hover:bg-green-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors" title="WhatsApp">
                <span className="hidden xl:inline">WhatsApp</span>
                <span className="xl:hidden">WA</span>
              </button>
              <button onClick={handleReset} disabled={!paperWidth && !paperHeight && !cutWidth && !cutHeight && !computedQuantity && !quantity && !grammage && !pricePerSheet && !printName && !jumlahPesanan && !berapaMata && !selectedCustomerId}
                className="flex items-center justify-center gap-1.5 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 disabled:text-slate-300 text-slate-700 text-sm font-semibold py-2.5 rounded-lg transition-colors" title={t('reset')}>
                <span>{t('reset')}</span>
              </button>
            </div>
          </div>

          {/* ===== STATUS SINKRONISASI PERMANEN: pekerjaan terhubung ke Hitung Cetakan? ===== */}
          {pkHcLink && (
            <div className={`rounded-2xl border mb-3 overflow-hidden ${pkHcLink.status === 'stale' ? 'border-amber-300 dark:border-amber-800' : 'border-teal-200 dark:border-teal-900'}`}>
              <div className={`flex items-center gap-2 px-4 py-2 ${pkHcLink.status === 'stale' ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-teal-50/70 dark:bg-teal-950/30'}`}>
                <div className="w-6 h-6 rounded-md bg-teal-100 flex items-center justify-center shrink-0"><Scissors className="w-3.5 h-3.5 text-teal-700" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold text-teal-700 dark:text-teal-300 uppercase tracking-wider leading-tight">Terhubung: Hitung Cetakan</p>
                  <p className="text-[13px] font-bold text-slate-700 dark:text-slate-200 font-mono leading-tight">{pkHcLink.hcNomor}</p>
                  {pkHcLink.lastSyncedAt && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                      Disinkronkan: {new Date(pkHcLink.lastSyncedAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
                {pkHcLink.status === 'synced' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 shrink-0"><CheckCircle2 className="w-3 h-3" /> Tersinkronisasi</span>
                ) : pkHcLink.status === 'stale' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 shrink-0"><AlertTriangle className="w-3 h-3" /> Perlu diperbarui</span>
                ) : null}
              </div>
            </div>
          )}

          {/* Link to Hitung Cetakan */}
          <button
            onClick={async () => {
              // === PERBAIKAN (data HC turut berubah): bila editor mengubah data
              // riwayat Potong Kertas yang ter-restore, SIMPAN DULU (PUT — server
              // otomatis mensinkronkan Hitung Cetakan terhubung) sebelum membuka
              // HC. Sebelumnya perubahan di editor dibuang diam-diam & halaman
              // Hitung Cetakan masih menampilkan data lama.
              const okSave = await saveRestoredBeforeHc()
              if (!okSave) return
              // === SINKRONISASI PERMANEN: bila riwayat aktif sudah terhubung ke
              // Hitung Cetakan, BUKA data tersebut (jangan buat baru / reset).
              // fromPotongKertas=1 → HC auto-terapkan perubahan sumber bila ada.
              if (pkHcLink?.hcId) {
                // Data sudah tersimpan → auto-reset form sebelum pindah halaman (permintaan owner)
                resetFormFields()
                router.push(`/hitung-cetakan?loadRiwayat=${pkHcLink.hcId}&fromPotongKertas=1`)
                return
              }
              if (preparingHc) return
              // === KLIK LANGSUNG (permintaan owner): bila hasil potongan belum ada
              // / input berubah (needsRecalc), hitung OTOMATIS dulu di sini — tombol
              // tidak lagi menuntut klik "Hitung Potongan"/"Hitung & Pilih Terbaik"
              // terlebih dahulu. Bila input belum cukup utk menghitung, tetap
              // lanjut membawa data form yang ada (tanpa angka hasil potongan).
              const needAutoCalc = !results || needsRecalc
              let freshCalc: { res: CuttingResult; paperId: string } | null = null
              if (needAutoCalc) {
                setPreparingHc(true)
                freshCalc = await autoCalcFreshResults()
                setPreparingHc(false)
                if (freshCalc) toast.success('Potongan dihitung otomatis')
              }
              // Hasil aktif: dari auto-hitung barusan; bila hasil lama basi
              // (needsRecalc) dan hitung ulang gagal → pakai data form mentah saja,
              // jangan membawa angka basi.
              const activeRes: CuttingResult | null = freshCalc?.res ?? (needsRecalc ? null : results)
              // Form kosong total & tak ada yang bisa dihitung → jangan pindah halaman
              const hasAnyData = !!printName || !!selectedCustomerId || !!jumlahPesanan ||
                !!(parseFloat(cutWidth) > 0) || !!(parseFloat(cutHeight) > 0) ||
                !!(parseInt(computedQuantity || quantity) > 0)
              if (!activeRes && !hasAnyData) {
                toast.error('Isi data potongan terlebih dahulu!')
                return
              }
              // Navigasi langsung ke hitung cetakan
              const params = new URLSearchParams()
              if (selectedCustomer?.name) params.set('customerName', selectedCustomer.name)
              if (printName) params.set('printName', printName)
              if (selectedCustomerId) params.set('customerId', selectedCustomerId)
              if (paperWidth) params.set('paperLength', paperWidth)
              if (paperHeight) params.set('paperWidth', paperHeight)
              const effectiveQuantity = computedQuantity || quantity
              if (effectiveQuantity) params.set('quantity', effectiveQuantity)
              if (jumlahPesanan) params.set('jumlahPesanan', jumlahPesanan)
              if (berapaMata) params.set('berapaMata', berapaMata)
              if (setelanKertas) params.set('setelanKertas', setelanKertas)
              // === Ukuran kertas/potongan & angka hasil: utamakan dari hasil hitung
              // aktif (lama atau hasil auto-hitung barusan) — state form di closure
              // bisa basi saat auto-hitung mode otomatis baru selesai (ukuran kertas
              // diisi dari kandidat Master Kertas).
              if (activeRes) {
                params.set('paperLength', String(activeRes.paperWidth))
                params.set('paperWidth', String(activeRes.paperHeight))
                params.set('cutWidth', String(activeRes.cutWidth))
                params.set('cutHeight', String(activeRes.cutHeight))
                const activePaperId = freshCalc?.paperId || (selectedPaperId && selectedPaperId !== 'custom' ? selectedPaperId : '')
                if (activePaperId) params.set('paperId', activePaperId)
                const activePaperName = activeRes.paperMaterial || selectedPaper?.name || restoredPaperName || ''
                if (activePaperName) params.set('paperName', activePaperName)
                const activeGrammage = activeRes.grammage > 0 ? String(activeRes.grammage) : (grammage || '')
                if (activeGrammage) params.set('grammage', activeGrammage)
                const activePrice = activeRes.pricePerSheet > 0 ? String(Math.round(activeRes.pricePerSheet)) : (pricePerSheet || '')
                if (activePrice) params.set('pricePerSheet', activePrice)
                if (activeRes.totalPrice) params.set('totalPaperPrice', activeRes.totalPrice.toString())
                if (activeRes.sheetsNeeded) params.set('sheetsNeeded', activeRes.sheetsNeeded.toString())
                if (activeRes.totalPieces) params.set('totalPieces', activeRes.totalPieces.toString())
                if (activeRes.efficiency) params.set('efficiency', activeRes.efficiency.toString())
              } else {
                // Tidak ada hasil hitung → bawa data form mentah apa adanya
                if (paperWidth) params.set('paperLength', paperWidth)
                if (paperHeight) params.set('paperWidth', paperHeight)
                if (cutWidth) params.set('cutWidth', cutWidth)
                if (cutHeight) params.set('cutHeight', cutHeight)
                if (selectedPaperId && selectedPaperId !== 'custom') params.set('paperId', selectedPaperId)
                if (selectedPaper?.name) params.set('paperName', selectedPaper.name)
                if (grammage) params.set('grammage', grammage)
                if (pricePerSheet) params.set('pricePerSheet', pricePerSheet)
              }
              params.set('fromPotongKertas', '1')
              params.set('reset', '1')

              // === Tentukan id riwayat Potong Kertas yang terhubung, agar riwayat
              // Hitung Cetakan yang disimpan dari sini SELALU ter-link (kolom "No. PK"
              // di Riwayat Hitung Cetakan terisi nomor Potong Kertas-nya):
              // a) sedang mengedit riwayat potong kertas → pakai id-nya;
              // b) data form identik dengan riwayat yang sudah ada (mis. baru disimpan) → pakai id tsb;
              // c) data baru → simpan riwayatnya DULU (tunggu sebentar) supaya id-nya jelas;
              //    bila gagal simpan, tetap lanjut tanpa link (tidak memblokir pekerjaan).
              let pkIdToLink: string | null = restoredRiwayatId
              if (!pkIdToLink && activeRes) {
                const same = findSameRiwayat()
                if (same) pkIdToLink = same.id
              }
              // === ANTI-DUPLIKAT (§10): bila riwayat PK ini sudah punya Hitung
              // Cetakan terhubung → BUKA data itu (jangan buat pekerjaan baru).
              if (pkIdToLink) {
                try {
                  const linkRes = await fetcher(`/api/potong-cetakan-sync?pkId=${encodeURIComponent(pkIdToLink)}`, { headers: getAuthHeaders() })
                  if (linkRes.ok) {
                    const linkData = await linkRes.json()
                    if (linkData.linkedHc?.id) {
                      // Data riwayat sudah ada & terhubung → auto-reset form sebelum pindah
                      resetFormFields()
                      router.push(`/hitung-cetakan?loadRiwayat=${linkData.linkedHc.id}&fromPotongKertas=1`)
                      return
                    }
                  }
                } catch {}
              }
              // Auto-simpan riwayat hanya bila ada hasil hitung (riwayat tanpa
              // hasil = data tidak lengkap); kirim hasil segar agar payload
              // konsisten — state `results` bisa basi saat auto-hitung baru jalan.
              if (activeRes && !pkIdToLink && !isDataSameAsAnyRiwayat()) {
                setPreparingHc(true)
                try {
                  const res = await fetcher('/api/riwayat-potong-kertas', {
                    method: 'POST',
                    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify(buildPayload(activeRes, freshCalc?.paperId))
                  })
                  if (res.ok) {
                    const saved = await res.json().catch(() => null)
                    if (saved?.id) pkIdToLink = saved.id
                    notifyDataChange('riwayat-potong-kertas')
                    fetchRiwayat()
                  }
                } catch {}
                setPreparingHc(false)
              }

              // Saat mengedit / terhubung riwayat potong kertas: kirim id-nya agar
              // Hitung Cetakan melanjutkan riwayat hitung cetakan yang pernah
              // dibuat dari data ini (simpan = update / simpan baru dgn link), bukan
              // membuat riwayat yang lepas hubungan.
              if (pkIdToLink) params.set('pkRiwayatId', pkIdToLink)
              // Kirim RINCIAN POTONG (efisiensi + rincian area sisa) ke Hitung Cetakan
              // via sessionStorage — data ini berasal dari riwayat Potong Kertas yang
              // ter-link (pkRiwayatId), bukan dikarang. Data URL terlalu besar utk query.
              try {
                if (activeRes) {
                  const wasteAreas: WasteArea[] = (Array.isArray(activeRes.wasteAreas) && activeRes.wasteAreas.length > 0)
                    ? activeRes.wasteAreas
                    : (() => { try { return computeWasteAreas(activeRes.paperWidth, activeRes.paperHeight, activeRes.blocks || [], activeRes.cutWidth, activeRes.cutHeight) } catch { return [] as WasteArea[] } })()
                  sessionStorage.setItem('pk-to-hc-cutInfo', JSON.stringify({
                    nomorPotong: pkIdToLink ? (riwayatList.find(x => x.id === pkIdToLink)?.nomorUrut || nextPotongKertasNumber || '') : (nextPotongKertasNumber || ''),
                    bahan: activeRes.paperMaterial || selectedPaper?.name || restoredPaperName || 'Custom',
                    grammage: activeRes.grammage > 0 ? String(activeRes.grammage) : (grammage || '0'),
                    ukuranKertas: `${activeRes.paperWidth} × ${activeRes.paperHeight} cm`,
                    ukuranPotongan: `${activeRes.cutWidth} × ${activeRes.cutHeight} cm`,
                    potonganPerLembar: activeRes.totalPieces,
                    lembarDibutuhkan: activeRes.sheetsNeeded,
                    totalBiayaKertas: activeRes.totalPrice,
                    efisiensi: activeRes.efficiency,
                    strategy: activeRes.strategy || '',
                    sisa: wasteAreas.map(w => ({ label: w.label, ukuran: `${w.width} × ${w.height} cm`, luas: w.area, status: w.statusLabel })),
                    savedAt: new Date().toISOString(),
                  }))
                }
              } catch {}
              // Foto lampiran ikut dibawa ke editor Hitung Cetakan.
              // Data URL (≤300KB) terlalu besar untuk query string → kirim via sessionStorage.
              if (photoUrl) sessionStorage.setItem('pk-to-hc-photoUrl', photoUrl)
              else sessionStorage.removeItem('pk-to-hc-photoUrl')
              // Data sudah tersimpan di riwayat (id baru / ter-link / identik dgn yang ada)
              // → auto-reset form sebelum pindah halaman (permintaan owner).
              // Bila simpan GAGAL (pkIdToLink null), form TIDAK direset agar data tidak hilang.
              if (pkIdToLink) resetFormFields()
              router.push(`/hitung-cetakan?${params.toString()}`)
            }}
            disabled={preparingHc}
            style={{
              // Gradient AKTIF hanya saat tombol siap & TIDAK disabled — saat
              // disabled/nonaktif biarkan class abu-abu (spt tombol Preview) yg tampak,
              // jangan ditimpa inline style (inline style menang atas class CSS).
              background: (!preparingHc && ((results && !needsRecalc) || pkHcLink?.hcId)) ? 'linear-gradient(135deg, #2563eb, #3b82f6, #2563eb)' : undefined,
            }}
            className={`flex items-center justify-center gap-1.5 text-sm font-semibold py-3 rounded-lg border cursor-pointer transition-colors ${((results && !needsRecalc) || pkHcLink?.hcId) ? 'text-white border-blue-500 disabled:bg-slate-200 disabled:text-slate-400 disabled:border-slate-200' : 'bg-[var(--color-slate-200)] text-[var(--color-slate-400)] border-[var(--color-slate-200)]'}`}>
            {preparingHc && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {preparingHc ? 'Menyiapkan riwayat…' : pkHcLink?.hcId ? 'Buka Hitung Cetakan' : 'Hitung Cetakan Lengkap'}
          </button>

        </div>

        {/* ===== RIGHT: RESULTS ===== */}
        <div className="flex-1 bg-card rounded-xl border border-slate-200 p-4 flex flex-col lg:min-h-0 lg:min-h-[calc(100vh-8rem+2cm)]">
          {results ? (
            <div className="flex-1 flex flex-col gap-1.5 lg:min-h-0 lg:overflow-hidden">
              {/* ===== Perbandingan alternatif ukuran kertas (mode otomatis) ===== */}
              {cutMode === 'otomatis' && candidates.length > 0 && (
                <div className="flex-shrink-0">
                  <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    Perbandingan Ukuran Kertas ({candidates.length}) — klik baris untuk memilih
                  </p>
                  <div className="rounded-lg border border-slate-200 dark:border-zinc-700 overflow-x-auto">
                    <Table className="min-w-[560px] lg:min-w-0 text-[10.5px] lg:text-xs">
                      <TableHeader className="bg-slate-50 dark:bg-zinc-800">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="h-7 px-2 text-[9px] font-semibold uppercase tracking-wide text-slate-500">Ukuran Master Kertas</TableHead>
                          <TableHead className="h-7 px-2 text-[9px] font-semibold uppercase tracking-wide text-slate-500 text-right">Potongan/Lbr</TableHead>
                          <TableHead className="h-7 px-2 text-[9px] font-semibold uppercase tracking-wide text-slate-500 text-right">Lembar</TableHead>
                          <TableHead className="h-7 px-2 text-[9px] font-semibold uppercase tracking-wide text-slate-500 text-right">Efisiensi</TableHead>
                          <TableHead className="h-7 px-2 text-[9px] font-semibold uppercase tracking-wide text-slate-500 text-right">Total Biaya</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {candidates.map((c, idx) => (
                          <TableRow key={`${c.paperId}-${idx}`}
                            onClick={() => applyCandidate(c, idx)}
                            className={`cursor-pointer ${selectedCandidateIdx === idx ? 'bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/30' : 'hover:bg-slate-50 dark:hover:bg-zinc-800/60'}`}>
                            <TableCell className="px-2 py-1">
                              <span className="font-semibold">{c.paperWidth} × {c.paperHeight} cm</span>
                              {c.suplier && <span className="text-slate-400"> · {c.suplier}</span>}
                              {idx === 0 && <span className="ml-1.5 text-[8.5px] font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 px-1 py-0.5 rounded-full align-middle">TERBAIK</span>}
                              {selectedCandidateIdx === idx && <span className="ml-1.5 text-[8.5px] font-bold text-white bg-emerald-600 px-1 py-0.5 rounded-full align-middle">DIPILIH</span>}
                            </TableCell>
                            <TableCell className="px-2 py-1 text-right tabular-nums">{c.piecesPerSheet.toLocaleString('id-ID')}</TableCell>
                            <TableCell className="px-2 py-1 text-right tabular-nums">{c.sheetsNeeded.toLocaleString('id-ID')}</TableCell>
                            <TableCell className="px-2 py-1 text-right tabular-nums">{c.efficiency.toFixed(1)}%</TableCell>
                            <TableCell className="px-2 py-1 text-right tabular-nums font-bold text-emerald-700 dark:text-emerald-400">Rp {Math.round(c.totalPrice).toLocaleString('id-ID')}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Stats Grid - mobile 2col, desktop 3col/5col */}
              <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2 flex-shrink-0">
                <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg p-1.5 lg:p-1.5 text-center">
                  <p className="text-[10px] text-slate-600 dark:text-slate-400 font-medium leading-tight">Diperlukan</p>
                  <p className="text-lg lg:text-lg font-bold text-black dark:text-white leading-tight">{computedQuantity || quantity || '0'}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">lembar</p>
                </div>
                <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg p-1.5 lg:p-1.5 text-center">
                  <p className="text-[10px] text-slate-600 dark:text-slate-400 font-medium leading-tight">Insit Kertas</p>
                  <p className="text-lg lg:text-lg font-bold text-black dark:text-white leading-tight">{setelanKertas || '0'}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">lembar</p>
                </div>
                <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg p-1.5 lg:p-1.5 text-center">
                  <p className="text-[10px] text-slate-600 dark:text-slate-400 font-medium leading-tight">Potongan/Lembar</p>
                  <p className="text-lg lg:text-lg font-bold text-black dark:text-white leading-tight">{results.totalPieces}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">lembar</p>
                </div>
                <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg p-1.5 lg:p-1.5 text-center">
                  <p className="text-[10px] text-slate-600 dark:text-slate-400 font-medium leading-tight">Kertas Yg Dibeli</p>
                  <p className="text-lg lg:text-lg font-bold text-black dark:text-white leading-tight">{results.sheetsNeeded}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">lembar</p>
                </div>
                <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg p-1.5 lg:p-1.5 text-center">
                  <p className="text-[10px] text-slate-600 dark:text-slate-400 font-medium leading-tight">Harga / Lembar</p>
                  <p className="text-sm lg:text-sm font-bold text-black dark:text-white leading-tight">Rp {Math.round(parseFloat(pricePerSheet) || 0).toLocaleString('id-ID')}</p>
                </div>
                <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg p-1.5 lg:p-1.5 text-center">
                  <p className="text-[10px] text-slate-600 dark:text-slate-400 font-medium leading-tight">Harga/Lembar Setelah Dipotong</p>
                  <p className="text-sm lg:text-sm font-bold text-black dark:text-white leading-tight">Rp {results.totalPieces > 0 ? Math.round((parseFloat(pricePerSheet) || 0) / results.totalPieces).toLocaleString('id-ID') : '0'}</p>
                </div>
                <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg p-1.5 lg:p-1.5 text-center">
                  <p className="text-[10px] text-slate-600 dark:text-slate-400 font-medium leading-tight">Berat Kertas</p>
                  <p className="text-sm lg:text-sm font-bold text-black dark:text-white leading-tight">{(() => {
                    const g = parseFloat(grammage) || 0
                    const w = parseFloat(paperWidth) || 0
                    const h = parseFloat(paperHeight) || 0
                    const sheets = results.sheetsNeeded || 0
                    if (g > 0 && w > 0 && h > 0 && sheets > 0) {
                      const totalGrams = (w * h * g * sheets) / 10000
                      return totalGrams >= 1000 ? `${(totalGrams / 1000).toFixed(2)} kg` : `${Math.round(totalGrams)} g`
                    }
                    return '0'
                  })()}</p>
                </div>
                <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg p-1.5 lg:p-1.5 text-center col-span-2 xl:col-span-7">
                  <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium leading-tight">Total Harga</p>
                  <p className="text-xl lg:text-xl font-bold text-blue-700 dark:text-blue-300 leading-tight">Rp {Math.round(results.totalPrice).toLocaleString('id-ID')}</p>
                </div>
              </div>

              {/* Strategy */}
              <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded px-1.5 py-0.5 flex-shrink-0" style={{ transform: 'scale(1.05)', transformOrigin: 'left center' }}>
                <span className="text-[10px] font-bold text-black dark:text-white">Strategi: </span>
                <span className="text-[10px] text-slate-700 dark:text-slate-300 font-medium">{results.strategy}</span>
              </div>

              {/* Diagram + Steps side by side */}
              <div className="flex-1 flex flex-col lg:flex-row gap-3 lg:min-h-0 lg:overflow-auto">
                {/* Diagram */}
                <div className="flex-1 flex items-center justify-center min-w-0 min-h-0 p-1" style={{ transform: 'scale(0.917)', transformOrigin: 'center center' }}>
                  <CuttingDiagram results={results} selectedWasteId={selectedWasteId} onSelectWaste={setSelectedWasteId} textScale={3} />
                </div>

                {/* Steps + Block Details */}
                <div className="lg:w-[192px] xl:w-[211px] flex-shrink-0 flex flex-col gap-1 lg:min-h-0 lg:overflow-y-auto hide-scrollbar">
                  {/* Steps */}
                  <div>
                    <p className="text-[11px] font-bold text-slate-700 mb-1">Cara Potong:</p>
                    <div className="space-y-1">
                      {results.steps.map((step, idx) => (
                        <div key={idx} className="flex items-start gap-1.5">
                          <div className="flex-shrink-0 w-4 h-4 bg-blue-600 text-white rounded-full flex items-center justify-center text-[8px] font-bold mt-0.5">{idx + 1}</div>
                          <p className="text-[10px] text-slate-600 leading-snug">{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Block Details - compact */}
                  <div>
                    <p className="text-[11px] font-bold text-slate-700 mb-1">Detail Blok:</p>
                    <div className="space-y-1">
                      {results.blocks.map((block: any, idx: number) => {
                        return (
                          <div key={idx} className="border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-md p-1.5">
                            <div className="flex items-center justify-between mb-0">
                              <span className="text-[10px] font-bold text-black dark:text-white">{block.name}</span>
                              <span className="px-1 py-0 bg-slate-100 dark:bg-zinc-800 text-black dark:text-white rounded-full text-[8px] font-semibold">{block.pieces} pcs</span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-1 gap-y-0 text-[9px] text-black dark:text-white">
                              <div><span className="opacity-70">Ukuran: </span><span className="font-bold">{block.width.toFixed(1)}×{block.height.toFixed(1)}</span></div>
                              <div><span className="opacity-70">Layout: </span><span className="font-bold">{block.horizontal}×{block.vertical}{block.rotated ? ' (90°)' : ''}</span></div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>

                {/* ===== Rincian Sisa Kertas (per lembar) — terhubung dgn gambar ===== */}
                {activeWasteAreas.length > 0 && (
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">Detail Sisa Kertas ({activeWasteAreas.length} area / lembar)</p>
                      {selectedWasteId && (
                        <button onClick={() => setSelectedWasteId(null)} className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400">Bersihkan pilihan</button>
                      )}
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-zinc-700 overflow-x-auto">
                      <Table className="min-w-[440px] lg:min-w-0 text-[10.5px] lg:text-xs">
                        <TableHeader className="bg-slate-50 dark:bg-zinc-800">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="h-7 px-2 text-[9px] font-semibold uppercase tracking-wide text-slate-500">Label</TableHead>
                            <TableHead className="h-7 px-2 text-[9px] font-semibold uppercase tracking-wide text-slate-500 text-right">Lebar</TableHead>
                            <TableHead className="h-7 px-2 text-[9px] font-semibold uppercase tracking-wide text-slate-500 text-right">Tinggi</TableHead>
                            <TableHead className="h-7 px-2 text-[9px] font-semibold uppercase tracking-wide text-slate-500 text-right">Luas</TableHead>
                            <TableHead className="h-7 px-2 text-[9px] font-semibold uppercase tracking-wide text-slate-500">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activeWasteAreas.map((w) => (
                            <TableRow key={w.id}
                              onClick={() => setSelectedWasteId(selectedWasteId === w.id ? null : w.id)}
                              title={`${w.label} — ${w.width} × ${w.height} cm · ${w.statusLabel} · ${w.note}`}
                              className={`cursor-pointer ${selectedWasteId === w.id ? 'bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-50 dark:hover:bg-blue-950/30' : 'hover:bg-slate-50 dark:hover:bg-zinc-800/60'}`}>
                              <TableCell className="px-2 py-1 font-semibold">{w.label}</TableCell>
                              <TableCell className="px-2 py-1 text-right tabular-nums">{w.width} cm</TableCell>
                              <TableCell className="px-2 py-1 text-right tabular-nums">{w.height} cm</TableCell>
                              <TableCell className="px-2 py-1 text-right tabular-nums">{w.area.toLocaleString('id-ID')} cm²</TableCell>
                              <TableCell className="px-2 py-1">
                                <span className={`inline-block text-[8.5px] font-bold px-1.5 py-0.5 rounded-full ${w.status === 'reusable' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : w.status === 'small' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' : 'bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-slate-400'}`}>
                                  {w.statusLabel}
                                </span>
                                <span className="block text-[8.5px] text-slate-400 leading-tight mt-0.5">{w.note}</span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}


            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                <Calculator className="w-8 h-8 text-slate-300" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-400">Belum ada hasil</p>
                <p className="text-xs text-slate-300 mt-0.5">Masukkan ukuran dan klik &quot;Hitung&quot;</p>
              </div>
            </div>
          )}
        </div>
      </div>

      </>
      )}

      {/* Riwayat Tab Content — gaya Riwayat Invoice */}
      {activeTab === 'riwayat' && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Riwayat Potong Kertas</h1>
              <p className="text-sm text-muted-foreground mt-1">Periode: {periodLabel}</p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleBackupRiwayat}
                variant="outline"
                disabled={backupLoading === 'backup'}
                title="Backup riwayat potong kertas"
                className="min-h-[44px] flex-1 sm:flex-none"
              >
                {backupLoading === 'backup' ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />} Backup
              </Button>
              <Button
                onClick={handleRestoreRiwayat}
                variant="outline"
                disabled={backupLoading === 'restore'}
                title="Restore riwayat potong kertas"
                className="min-h-[44px] flex-1 sm:flex-none"
              >
                {backupLoading === 'restore' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Restore
              </Button>
            </div>
          </div>

          {/* Filter: pelanggan + periode + pencarian — SELALU TAMPIL (mobile & desktop) */}
          <RiwayatFilterCard activeCount={(period !== 'all' ? 1 : 0) + (searchQuery.trim() !== '' ? 1 : 0) + (customerFilter ? 1 : 0)}>
            <RiwayatPeriodFilter
                idPrefix="riwayat-pk"
                period={period}
                onChangePeriod={setPeriod}
                from={dateFrom}
                to={dateTo}
                onFromChange={setDateFrom}
                onToChange={setDateTo}
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
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" aria-hidden="true" />
                <Input
                  id="riwayat-pk-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari no. PK / customer / barang…"
                  aria-label="Cari riwayat potong kertas"
                  className="pl-9 min-h-[44px] bg-white w-full"
                />
              </div>
              <div className="flex items-center gap-2">
                <RiwayatCustomerFilter
                  idPrefix="riwayat-pk"
                  options={riwayatCustomerOptions}
                  value={customerFilter}
                  onChange={setCustomerFilter}
                  ariaLabel="Filter nama pelanggan potong kertas"
                  fullWidth
                />
                {filtersActive && (
                  <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={() => { setPeriod('today'); setDateFrom(''); setDateTo(''); setSearchQuery(''); setCustomerFilter('') }} aria-label="Reset filter" title="Reset Filter">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </RiwayatFilterCard>

          {/* Ringkasan */}
          {loadingRiwayat ? (
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <RiwayatSummaryCard label="Jumlah Potong Kertas" value={filteredRiwayatList.length} note="Data pada periode terpilih" />
              <RiwayatSummaryCard label="Total" value={`Rp ${Math.round(totalRiwayat).toLocaleString('id-ID')}`} valueClass="text-emerald-700" />
            </div>
          )}

          {loadingRiwayat ? (
            <Skeleton className="h-72 w-full rounded-xl" />
          ) : filteredRiwayatList.length === 0 ? (
            <RiwayatEmptyState
              icon={<History />}
              title={filtersActive ? 'Tidak ada data yang cocok dengan filter' : 'Belum ada riwayat potong kertas'}
              desc={filtersActive ? 'Coba ubah periode, pelanggan, atau kata kunci pencarian.' : 'Hasil hitung yang disimpan akan tampil di sini'}
            />
          ) : (
            <>
              {/* Desktop table — klik baris → Preview. TANPA kotak/bingkai & TANPA
                  scroll internal (max-h-96) — permintaan owner: scrollbar di dalam
                  kotak tabel dihilangkan, tabel memanjang alami mengikuti isi halaman. */}
              <div className="hidden md:block">
                {/* Konvensi tabel 10mm zebra: baris presisi 10mm, ganjil abu-abu, hover seragam */}
                <Table className="[&_td]:py-[2px] [&_tbody_tr:last-child]:border-b [&_tbody_tr:hover]:bg-slate-200/70 dark:[&_tbody_tr:hover]:bg-zinc-700/50">
                    <TableHeader className="bg-stone-50">
                      <TableRow className="bg-stone-50 hover:bg-stone-50">
                        <TableHead className="w-10">No.</TableHead>
                        <TableHead className="w-0 min-w-0">No. PK</TableHead>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Nama Barang</TableHead>
                        <TableHead className="hidden lg:table-cell">Kertas</TableHead>
                        <TableHead className="hidden 2xl:table-cell">Gramatur</TableHead>
                        <TableHead className="hidden 2xl:table-cell">Uk. Potong</TableHead>
                        <TableHead className="text-right">Lbr Kertas</TableHead>
                        <TableHead className="text-right">Jml</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-center">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRiwayatList.slice(0, 100).map((r, i) => (
                        <TableRow
                          key={r.id}
                          className={cn(
                            'cursor-pointer h-[10mm]',
                            i % 2 === 1 && restoredRiwayatId !== r.id && 'bg-slate-100 dark:bg-zinc-800/60',
                            restoredRiwayatId === r.id && 'bg-emerald-50/60'
                          )}
                          onClick={() => handlePreviewRiwayat(r)}
                        >
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="whitespace-nowrap w-px"><span className="font-mono text-xs">{r.nomorUrut || '-'}</span></TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap">{formatTanggalRiwayat(r.createdAt)}</TableCell>
                          <TableCell className="max-w-40 truncate">{r.namaCustomer && r.namaCustomer !== '-' ? r.namaCustomer : '-'}</TableCell>
                          <TableCell className="max-w-40 text-muted-foreground" title={r.namaCetakan}>
                            <span className="truncate block">{r.namaCetakan || '-'}</span>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell max-w-32 text-muted-foreground" title={r.paperName}>
                            <span className="truncate block">{r.paperName || '-'}</span>
                          </TableCell>
                          <TableCell className="hidden 2xl:table-cell text-muted-foreground whitespace-nowrap">{r.grammage && r.grammage !== '0' ? `${r.grammage} gsm` : '-'}</TableCell>
                          <TableCell className="hidden 2xl:table-cell text-muted-foreground whitespace-nowrap">{r.cutWidth && r.cutWidth !== '0' ? `${r.cutWidth}×${r.cutHeight}` : '-'}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground whitespace-nowrap">
                            {parseInt(r.sheetsNeeded || '0') > 0 ? `${parseInt(r.sheetsNeeded).toLocaleString('id-ID')} lbr` : '-'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{parseInt(r.jumlahPesanan || 0).toLocaleString('id-ID')}</TableCell>
                          <TableCell className="text-right tabular-nums font-bold text-emerald-700 whitespace-nowrap">Rp {Math.round(r.totalPrice || 0).toLocaleString('id-ID')}</TableCell>
                          <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteRiwayat(r.id)}
                              title="Hapus"
                              aria-label={`Hapus ${r.nomorUrut || 'riwayat'}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                </Table>
              </div>

              {/* Mobile cards — klik kartu → Preview (kompak, gaya sama dgn halaman riwayat:
                  gramatur, ukuran potong, potongan/lembar, harga/lembar) */}
              <div className="md:hidden space-y-2">
                {filteredRiwayatList.slice(0, 100).map((r) => {
                  // Potongan/lembar: dari hasil cutting engine (resultData.totalPieces), fallback berapaMata
                  let potonganLbr: number | null = null
                  try {
                    const rd = r.resultData ? JSON.parse(r.resultData) : null
                    if (rd && typeof rd.totalPieces === 'number' && rd.totalPieces > 0) potonganLbr = rd.totalPieces
                  } catch { /* resultData bukan JSON valid */ }
                  if (!potonganLbr) {
                    const bm = parseInt(r.berapaMata || '0')
                    if (bm > 0) potonganLbr = bm
                  }
                  const gsmLabel = r.grammage && r.grammage !== '0' ? ` · ${r.grammage} gsm` : ''
                  const cutLabel = r.cutWidth && r.cutWidth !== '0' && r.cutHeight ? ` · Potong: ${r.cutWidth} × ${r.cutHeight} cm` : ''
                  return (
                    <Card
                      key={r.id}
                      className={`p-0 gap-0 cursor-pointer hover:bg-stone-50 transition-colors ${restoredRiwayatId === r.id ? 'bg-emerald-50/60' : ''}`}
                      onClick={() => handlePreviewRiwayat(r)}
                    >
                      <CardContent className="p-2.5 space-y-1.5">
                        {/* Baris 1: nomor + tanggal (kompak) */}
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-mono text-[11px] font-semibold truncate">{r.nomorUrut || '-'}</p>
                          <p className="text-[11px] text-muted-foreground whitespace-nowrap">{formatTanggalRiwayatShort(r.createdAt)}</p>
                        </div>
                        {/* Baris 2: customer + cetakan */}
                        <div className="min-w-0">
                          <p className="text-[18px] font-bold leading-tight truncate">{r.namaCustomer && r.namaCustomer !== '-' ? r.namaCustomer : '-'}</p>
                          <p className="text-[13.5px] text-muted-foreground leading-tight truncate">{r.namaCetakan || '-'}</p>
                        </div>
                        {/* Baris 3: kertas + gramatur + ukuran potong (permintaan owner) */}
                        <p className="text-[13px] text-muted-foreground truncate">
                          <span className="font-medium text-stone-600">{r.paperName || '-'}</span>{gsmLabel}{cutLabel}
                        </p>
                        {/* Baris 4: statistik 2×2 — Potongan/Lbr | Harga/Lbr | Jml Pesanan | Lbr Kertas */}
                        <div className="grid grid-cols-2 gap-1 rounded-lg bg-stone-50 px-1.5 py-1.5 text-center">
                          <div className="min-w-0">
                            <p className="text-[14px] font-semibold leading-tight truncate">{potonganLbr != null ? potonganLbr.toLocaleString('id-ID') : '-'}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">Potongan/Lbr</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[14px] font-extrabold leading-tight truncate">{(r.pricePerSheet || 0) > 0 ? fmtRpCompact(r.pricePerSheet) : '-'}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">Harga/Lbr</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[14px] font-semibold leading-tight truncate">{parseInt(r.jumlahPesanan || 0) > 0 ? parseInt(r.jumlahPesanan).toLocaleString('id-ID') : '-'}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">Jml Pesanan</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[14px] font-semibold text-teal-700 leading-tight truncate">
                              {parseInt(r.sheetsNeeded || '0') > 0 ? `${parseInt(r.sheetsNeeded).toLocaleString('id-ID')} lbr` : '-'}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">Lbr Kertas</p>
                          </div>
                        </div>
                        {/* Baris 5: Total pindah ke bawah sejajar tombol Hapus — angka PENUH (tidak disingkat) */}
                        <div className="flex items-center justify-between gap-2 border-t border-stone-100 pt-2">
                          <div className="min-w-0">
                            <p className="text-[11px] text-muted-foreground leading-tight">Total</p>
                            <p className="text-[16px] font-extrabold text-emerald-700 leading-tight truncate">
                              {(r.totalPrice || 0) > 0 ? `Rp ${Math.round(r.totalPrice).toLocaleString('id-ID')}` : '-'}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 min-h-0 px-2.5 gap-1 text-[11px] text-destructive hover:text-destructive shrink-0"
                            onClick={(e) => { e.stopPropagation(); handleDeleteRiwayat(r.id) }}
                            title="Hapus"
                          >
                            <Trash2 className="h-3 w-3" /> Hapus
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ===== PREVIEW DIALOG ===== */}
      {previewOpen && (
        <>
        <PreviewDialog
          onClose={() => { setPreviewOpen(false); setPreviewRiwayatData(null); setPreviewRiwayatRow(null); setPreviewRiwayatCandidates(null); setPreviewRiwayatSelectedIdx(0); setPreviewRiwayatInfo({ customer: '-', paper: '-', jumlahPesanan: '', berapaMata: '', setelanKertas: '' }) }}
          title="Preview Potong Kertas"
          footer={
            <div className="sticky bottom-0 bg-card border-t border-slate-200 p-3 flex gap-2">
              <button onClick={handlePrint} disabled={isPrinting} title="Cetak (fit A5 portrait, sama persis dengan preview)"
                className="flex-1 flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-semibold py-1.5 sm:py-2 rounded-md sm:rounded-lg text-[11px] sm:text-xs whitespace-nowrap transition-colors">
                {isPrinting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />} {t('cetak')}
              </button>
              {previewRiwayatRow && (
                <button onClick={handleEditFromPreview} title="Edit perhitungan di kalkulator"
                  className="flex-1 flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-1.5 sm:py-2 rounded-md sm:rounded-lg text-[11px] sm:text-xs whitespace-nowrap transition-colors">
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
              )}
              <button onClick={handleJpg} disabled={isGeneratingJpg} title="Kirim gambar JPG A5 portrait (WhatsApp / unduh)"
                className="flex-1 flex items-center justify-center gap-1 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-400 text-white font-semibold py-1.5 sm:py-2 rounded-md sm:rounded-lg text-[11px] sm:text-xs whitespace-nowrap transition-colors">
                {isGeneratingJpg ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />JPG...</> : <><FileImage className="w-3.5 h-3.5" /> JPG</>}
              </button>
            </div>
          }
        >
          {/* Dokumen layout tetap 720px (identik mobile & desktop saat capture),
              tampilan di-skala visual agar fit di layar kecil — sama dengan halaman Hitung Cetakan */}
          <FixedDocScaler fixedWidth={720} innerRef={previewRef} innerClassName="p-4 bg-white">
            {/* Header */}
            <div data-pk="header" className="text-center mb-3 pb-2 border-b-2 border-slate-200">
              <h1 className="text-2xl font-bold text-slate-900">Preview Potong Kertas</h1>
            </div>

            {/* Info Grid */}
            <div data-pk="grid" className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-600 font-medium">No PK</p>
                <p className="text-base font-bold text-black truncate font-mono">{noPkPreview || '-'}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-600 font-medium">Nama Customer</p>
                <p className="text-base font-bold text-black truncate">{previewRiwayatData ? previewRiwayatInfo.customer : (selectedCustomer?.name || '-')}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-600 font-medium">Nama Bahan</p>
                <p className="text-base font-bold text-black truncate">{previewRiwayatData ? previewRiwayatInfo.paper : (selectedPaper?.name || restoredPaperName || 'Custom')}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-600 font-medium">Gramatur</p>
                <p className="text-base font-bold text-black">{previewRiwayatData ? (previewRiwayatRow?.grammage ? `${previewRiwayatRow.grammage} gsm` : '-') : (grammage ? `${grammage} gsm` : '-')}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-600 font-medium">Ukuran Kertas</p>
                <p className="text-base font-bold text-black">{previewRiwayatData
                  ? fmtUkuran(previewRiwayatRow?.paperWidth || previewRiwayatData.paperWidth, previewRiwayatRow?.paperHeight || previewRiwayatData.paperHeight)
                  : fmtUkuran(paperWidth, paperHeight)}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-600 font-medium">Ukuran Potong</p>
                <p className="text-base font-bold text-black">{previewRiwayatData
                  ? fmtUkuran(previewRiwayatRow?.cutWidth || previewRiwayatData.cutWidth, previewRiwayatRow?.cutHeight || previewRiwayatData.cutHeight)
                  : fmtUkuran(cutWidth, cutHeight)}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-600 font-medium">Jumlah Pesanan</p>
                <p className="text-base font-bold text-black">{(previewRiwayatData ? previewRiwayatInfo.jumlahPesanan : jumlahPesanan) || '-'}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-600 font-medium">Cetak Berapa Mata</p>
                <p className="text-base font-bold text-black">{(previewRiwayatData ? previewRiwayatInfo.berapaMata : berapaMata) || '-'}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-600 font-medium">Jumlah Cetakan</p>
                <p className="text-base font-bold text-black">{previewRiwayatData?.quantity || results?.quantity || 0} <span className="text-xs font-normal">lembar</span></p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-600 font-medium">Insit Kertas</p>
                <p className="text-base font-bold text-black">{(previewRiwayatData ? previewRiwayatInfo.setelanKertas : setelanKertas) || '0'}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-600 font-medium">Potongan / Lembar</p>
                <p className="text-base font-bold text-black">{previewRiwayatData?.totalPieces || results?.totalPieces || 0} <span className="text-xs font-normal">lembar</span></p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-600 font-medium">Lembar Kertas</p>
                <p className="text-base font-bold text-black">{previewRiwayatData?.sheetsNeeded || results?.sheetsNeeded || 0} <span className="text-xs font-normal">lembar</span></p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-600 font-medium">Total Harga Kertas</p>
                <p className="text-base font-bold text-black">Rp {Math.round(previewRiwayatData?.totalPrice || results?.totalPrice || 0).toLocaleString('id-ID')}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-600 font-medium">Harga / Lembar</p>
                <p className="text-base font-bold text-black">Rp {Math.round(hargaPerLembarPreview).toLocaleString('id-ID')}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-600 font-medium">Harga Kertas /kg</p>
                <p className="text-base font-bold text-black">{hargaKgPreview ? `Rp ${Number(hargaKgPreview).toLocaleString('id-ID', { maximumFractionDigits: 2 })}` : '-'}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-600 font-medium">Harga/Lembar Setelah Dipotong</p>
                <p className="text-base font-bold text-black">{(() => { const pr = previewRiwayatData || results; return (pr && pr.totalPieces > 0) ? `Rp ${Math.round(hargaPerLembarPreview / pr.totalPieces).toLocaleString('id-ID')}` : 'Rp 0' })()}</p>
              </div>
            </div>

            {/* Strategy */}
            <div data-pk="strategy" className="bg-white border border-slate-200 rounded-lg p-2 mb-3">
              <p className="text-[10px] text-slate-600 font-medium text-center">Strategi Optimasi</p>
              <p className="text-sm font-bold text-black text-center">{previewRiwayatData?.strategy || results?.strategy}</p>
            </div>

            {/* Perbandingan Ukuran Kertas — alternatif dari Master Kertas (mode otomatis / riwayat
                hasil optimasi). Bagian dokumen preview → ikut tercetak (Cetak) dan ter-JPG. */}
            {previewCandidates.length > 0 && (
              <div data-pk="candidates" className="mb-3">
                <h3 className="text-xs font-bold text-slate-700 mb-1.5">Perbandingan Ukuran Kertas ({previewCandidates.length}):</h3>
                <table className="w-full border border-slate-200 rounded-lg overflow-hidden text-[10px]">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left px-2 py-1 font-semibold border-b border-slate-200">Ukuran Kertas</th>
                      <th className="text-right px-2 py-1 font-semibold border-b border-slate-200">Potongan/Lbr</th>
                      <th className="text-right px-2 py-1 font-semibold border-b border-slate-200">Lembar</th>
                      <th className="text-right px-2 py-1 font-semibold border-b border-slate-200">Efisiensi</th>
                      <th className="text-right px-2 py-1 font-semibold border-b border-slate-200">Total Biaya</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewCandidates.map((c, idx) => (
                      <tr key={`${c.paperId}-${idx}`} className={`border-b border-slate-100 last:border-b-0 ${idx === previewSelectedIdx ? 'bg-emerald-50' : ''}`}>
                        <td className="px-2 py-1 font-semibold">
                          {c.paperWidth} × {c.paperHeight} cm
                          {c.suplier ? <span className="text-slate-400"> · {c.suplier}</span> : null}
                          {idx === 0 && <span className="ml-1.5 text-[8.5px] font-bold text-emerald-700 bg-emerald-100 px-1 py-0.5 rounded-full align-middle">TERBAIK</span>}
                          {idx === previewSelectedIdx && <span className="ml-1.5 text-[8.5px] font-bold text-white bg-emerald-600 px-1 py-0.5 rounded-full align-middle">DIPILIH</span>}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">{c.piecesPerSheet.toLocaleString('id-ID')}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{c.sheetsNeeded.toLocaleString('id-ID')}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{c.efficiency.toFixed(1)}%</td>
                        <td className="px-2 py-1 text-right tabular-nums font-bold text-emerald-700">Rp {Math.round(c.totalPrice).toLocaleString('id-ID')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Diagram full-width, di bawahnya Cara Potong + Detail per Blok berdampingan (mengikuti layout cetak A4) */}
            {(previewRiwayatData || results) && (
              <>
                {/* Diagram */}
                <div data-pk="diagram" className="mb-3 w-full">
                  <div className="w-full mx-auto" style={{ maxWidth: '100%' }}>
                    <CuttingDiagram results={previewRiwayatData || results!} maxHeight="320px" selectedWasteId={selectedWasteId} onSelectWaste={setSelectedWasteId} textScale={3} />
                  </div>
                </div>

                {/* Steps + Block Details */}
                <div className="grid grid-cols-2 gap-3 items-start">
                  <div data-pk="steps" className="mb-3">
                    <h3 className="text-xs font-bold text-slate-700 mb-1.5">Cara Potong:</h3>
                    <div className="space-y-1.5">
                      {(previewRiwayatData || results)!.steps.map((step, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <div className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-[9px] font-bold">{idx + 1}</div>
                          <p className="text-[11px] text-slate-600 pt-0.5">{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div data-pk="blocks" className="mb-2">
                    <h3 className="text-xs font-bold text-slate-700 mb-1.5">Detail per Blok:</h3>
                    <div className="space-y-2">
                      {(previewRiwayatData || results)!.blocks.map((block: any, idx: number) => (
                        <div key={idx} className="border border-slate-200 rounded-lg p-2.5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-slate-800">{block.name}</span>
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-semibold">{block.pieces} lembar</span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                            <div><span className="text-slate-500">Ukuran:</span> <span className="font-medium">{block.width.toFixed(1)} × {block.height.toFixed(1)} cm</span></div>
                            <div><span className="text-slate-500">Layout:</span> <span className="font-medium">{block.horizontal} × {block.vertical}{block.rotated ? ' (90°)' : ''}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Rincian Sisa Kertas — ikut tercetak/di-JPG (capture = isi preview) */}
                {previewWasteAreas.length > 0 && (
                  <div data-pk="waste" className="mb-3">
                    <h3 className="text-xs font-bold text-slate-700 mb-1.5">Rincian Sisa Kertas (per lembar):</h3>
                    <table className="w-full border border-slate-200 rounded-lg overflow-hidden text-[10px]">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="text-left px-2 py-1 font-semibold border-b border-slate-200">Label</th>
                          <th className="text-right px-2 py-1 font-semibold border-b border-slate-200">Lebar</th>
                          <th className="text-right px-2 py-1 font-semibold border-b border-slate-200">Tinggi</th>
                          <th className="text-right px-2 py-1 font-semibold border-b border-slate-200">Luas</th>
                          <th className="text-left px-2 py-1 font-semibold border-b border-slate-200">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewWasteAreas.map((w) => (
                          <tr key={w.id} className="border-b border-slate-100 last:border-b-0">
                            <td className="px-2 py-1 font-semibold">{w.label}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{w.width} cm</td>
                            <td className="px-2 py-1 text-right tabular-nums">{w.height} cm</td>
                            <td className="px-2 py-1 text-right tabular-nums">{w.area.toLocaleString('id-ID')} cm²</td>
                            <td className="px-2 py-1">{w.statusLabel}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                  </div>
                )}
              </>
            )}

            {/* Foto Lampiran — ikut tampil di JPG/Cetak karena capture = isi preview */}
            {previewPhotoUrl && (
              <div data-pk="photo" className="border border-slate-200 rounded-lg p-2.5 bg-white mt-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-md bg-amber-100 flex items-center justify-center">
                    <ImageIcon className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <p className="text-sm font-bold text-slate-700 uppercase tracking-wide">Foto Lampiran</p>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setPkPhotoZoom(true)}
                    aria-label="Perbesar foto lampiran"
                    title="Klik untuk perbesar foto"
                    className="inline-flex cursor-zoom-in rounded transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <img src={previewPhotoUrl} alt="Foto Lampiran" className="max-h-64 w-auto max-w-full rounded object-contain" />
                  </button>
                </div>
              </div>
            )}
          </FixedDocScaler>
        </PreviewDialog>
        {previewPhotoUrl && (
          <PhotoLightbox src={previewPhotoUrl} open={pkPhotoZoom} onOpenChange={setPkPhotoZoom} />
        )}
        </>
      )}
      {/* Popup "Tambah Cust" — sama persis dengan Master Customer (kode otomatis, nama*, telepon, email, alamat, catatan) */}
      <CustomerFormDialog
        open={addCustOpen}
        onOpenChange={setAddCustOpen}
        onSaved={handleCustomerFormSaved}
      />
    </DashboardLayout>
  )
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <CalculatorPage />
    </Suspense>
  )
}
