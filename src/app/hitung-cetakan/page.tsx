'use client'

declare global {
  interface Window {
    __restorePaperName?: string
    __restoreMachineName?: string
    __restoreMachineName2?: string
    __restoreFinishingNames?: string
    __restorePricePerSheet?: string
  }
}

import { Calculator, Printer, Plus, Users, FileText, Cog, Layers, Package, Truck, Banknote, RotateCcw, Trash2, Palette, X, Percent, Eye, Loader2, FileImage, History, UserSearch, RefreshCw, MessageCircle, FileSpreadsheet, ClipboardCheck, CheckCircle2, XCircle, DatabaseBackup, Upload, Search, Save, Pencil } from 'lucide-react'
import { captureElementAsJpg, fitBlobToA5, HIRES_PIXEL_RATIO } from '@/lib/capture-jpg'
import { printBlobHiRes } from '@/lib/print-hi-res'
import { shareJpgToWhatsApp } from '@/lib/share-jpg'
import { useState, useEffect, useMemo, useCallback, Suspense, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { getAuthHeaders } from '@/lib/auth'
import { fetcher } from '@/lib/fetcher'
import { Button } from '@/components/ui/button'
import { PhotoUpload } from '@/components/photo-upload'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/language-context'
import { notifyDataChange } from '@/lib/data-sync'
import { authFetch } from '@/lib/auth-fetch'
import { openWhatsApp } from '@/lib/whatsapp-business'
import { useDataChange } from '@/hooks/use-data-change'
import { calculateCuts } from '@/lib/cutting-engine'
import { RincianCetakanPreview } from '@/components/rincian-cetakan-preview'
import { FixedDocScaler } from '@/components/fixed-doc-scaler'
import { GabunganTab } from '@/components/hitung-cetakan/gabungan-tab'
import { RiwayatPeriodFilter, RiwayatFilterCard, RiwayatCustomerFilter, RiwayatSummaryCard, RiwayatEmptyState, riwayatPeriodText, riwayatDateRange, type RiwayatPeriod } from '@/components/dokupro/riwayat-period-filter'

interface Paper {
  id: string
  name: string
  grammage: number
  width: number
  height: number
  pricePerRim: number
}

interface PrintingCost {
  id: string
  machineName: string
  grammage: number
  printAreaWidth: number
  printAreaHeight: number
  pricePerColor: number
  specialColorPrice: number
  minimumPrintQuantity: number
  priceAboveMinimumPerSheet: number
  platePricePerSheet: number
}

interface Finishing {
  id: string
  name: string
  minimumSheets: number
  minimumPrice: number
  additionalPrice: number
  pricePerCm: number
}

interface Customer {
  id: string
  name: string
}

interface PrintCalculation {
  id: string
  printName: string
  paperLength: string
  paperWidth: string
  cutWidth: string
  cutHeight: string
  quantity: string
  jumlahPesanan: string
  berapaMata: string
  setelanKertas: string
  warna: string
  warnaKhusus: string
  paperId: string
  paperName: string
  machineId: string
  machineName: string
  printingCost: number
  finishingId: string
  finishingName: string
  packingCost: string
  shippingCost: string
  pricePerSheet: string
  hargaPlat: string
  totalPrice: number
  customerName: string
  machineId2: string
  machineName2: string
  warna2: string
  warnaKhusus2: string
  hargaPlat2: string
  glueLengthCm: string
  glueCostPerCm: string
  glueBoronganPerSheet: string
  biayaLain1: string
  biayaLain2: string
  totalPaperPrice: number
  calculatedPrintingCost: number
  calculatedPrintingCost2: number
  calculatedFinishingCost: number
  calculatedGlueCost: number
  calculatedGlueBoronganSheet: number
  finishingBreakdown: { name: string; cost: number }[]
  profitPercent?: number
  biayaLain1Label?: string
  biayaLain2Label?: string
  paperGrammage?: number
  recordNumber?: string
  recordDate?: string
  photoUrl?: string
}

const inputClass = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors lg:py-1.5'
const selectClass = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors bg-card appearance-none cursor-pointer lg:py-1.5'
const labelClass = 'flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1'

// Preview Dialog Component
// Struktur: header tetap di atas, konten SELALU bisa discroll (mobile & desktop), footer tetap di bawah.
// Footer (Grand Total + tombol aksi) TIDAK ikut scroll — angka penting tidak pernah terpotong lagi.
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

export default function HitungCetakanPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div></div>}>
      <HitungCetakanPage />
    </Suspense>
  )
}

// Form storage keys (per-user scoped)
function userKey(base: string): string {
  try {
    const a = JSON.parse(localStorage.getItem('auth') || '{}')
    if (a.id) return `${base}_${a.id}`
  } catch {}
  return base
}
const FORM_STORAGE_KEY = () => userKey('hitung-cetakan-form-data')
const FORM_STORAGE_VERSION_KEY = () => userKey('hitung-cetakan-form-data-version')
const FORM_STORAGE_VERSION = 'v5'
const SIM_ROWS_STORAGE_KEY = () => userKey('hitung-cetakan-simulasi-rows')

// Baris Tabel Simulasi Cepat (CRUD): jumlah & profit disimpan; nilai (modal, jual, dll)
// dihitung ulang live dari parameter form. snap = nilai saat baris disimpan,
// dipakai fallback bila form belum bisa menghitung (mis. setelah reload dgn form kosong).
interface SimRowSnap { sheets: number; modal: number; modalPcs: number; jual: number; jualPcs: number }
interface SimRow { id: number; jumlah: number; profit: number; snap: SimRowSnap }

function HitungCetakanPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [papers, setPapers] = useState<Paper[]>([])
  const [printingCosts, setPrintingCosts] = useState<PrintingCost[]>([])
  const [finishings, setFinishings] = useState<Finishing[]>([])
  const [hydrated, setHydrated] = useState(false)

  const [selectedFinishings, setSelectedFinishings] = useState<string[]>([])

  const [formData, setFormData] = useState({
    customerName: '',
    printName: '',
    paperLength: '',
    paperWidth: '',
    cutWidth: '',
    cutHeight: '',
    quantity: '',
    jumlahPesanan: '',
    berapaMata: '',
    setelanKertas: '',
    warna: '',
    warnaKhusus: '',
    hargaPlat: '',
    paperId: '',
    machineId: '',
    packingCost: '',
    shippingCost: '',
    pricePerSheet: '',
    glueLengthCm: '',
    glueCostPerCm: '',
    glueBoronganPerSheet: '',
    biayaLain1: '',
    biayaLain2: '',
    machineId2: '',
    warna2: '',
    warnaKhusus2: '',
    hargaPlat2: ''
  })

  const [totalPaperPrice, setTotalPaperPrice] = useState<number>(0)
  // Derived paper price computed via the SAME cutting engine used by potong-kertas,
  // so the total harga kertas matches exactly between the two pages.
  // Logic: totalQty = quantity + setelanKertas; sheetsNeeded = ceil(totalQty / totalPieces);
  // paperPriceValue = sheetsNeeded × pricePerSheet.
  // Falls back to pricePerSheet × quantity when paper/cut dimensions are missing
  // (so the grand total still becomes > 0 and all action buttons activate).
  const computedPaper = useMemo(() => {
    const pw = parseFloat(formData.paperLength) || 0
    const ph = parseFloat(formData.paperWidth) || 0
    const cw = parseFloat(formData.cutWidth) || 0
    const ch = parseFloat(formData.cutHeight) || 0
    const qty = parseInt(formData.quantity) || 0
    const setelan = parseInt(formData.setelanKertas) || 0
    const price = parseFloat(formData.pricePerSheet) || 0
    const totalQty = qty + setelan
    if (pw > 0 && ph > 0 && cw > 0 && ch > 0 && totalQty > 0 && price > 0) {
      try {
        const result = calculateCuts({
          paperWidth: pw, paperHeight: ph, cutWidth: cw, cutHeight: ch,
          quantity: totalQty, pricePerSheet: price, optimizationMode: 'maximal',
          customerName: '', paperMaterial: '', grammage: 0,
        })
        return { sheetsNeeded: result.sheetsNeeded, totalPrice: result.totalPrice }
      } catch { /* fall through to simple calc */ }
    }
    // Fallback: simple price × quantity (keeps buttons active even without dims)
    return { sheetsNeeded: 0, totalPrice: price * qty }
  }, [formData.paperLength, formData.paperWidth, formData.cutWidth, formData.cutHeight, formData.quantity, formData.setelanKertas, formData.pricePerSheet])
  const paperPriceValue = computedPaper.totalPrice
  const [calculatedPrintingCost, setCalculatedPrintingCost] = useState<number>(0)
  const [calculatedPrintingCost2, setCalculatedPrintingCost2] = useState<number>(0)
  const [calculatedCost, setCalculatedCost] = useState<number>(0)
  const [isFinishingMin, setIsFinishingMin] = useState<boolean>(false)
  const [calculatedFinishingCost, setCalculatedFinishingCost] = useState<number>(0)
  const [calculatedPaperCost, setCalculatedPaperCost] = useState<number>(0)
  const [calculatedGlueCost, setCalculatedGlueCost] = useState<number>(0)
  const [calculatedGlueBoronganSheet, setCalculatedGlueBoronganSheet] = useState<number>(0)
  const [prefilled, setPrefilled] = useState(false)
  const [profitPercent, setProfitPercent] = useState<number>(0)
  const [profitInput, setProfitInput] = useState<string>('')

  // ===== Simulasi Cepat: ketik jumlah pesanan baru (+ profit) — harga langsung muncul tanpa isi ulang form =====
  const [simJumlahInput, setSimJumlahInput] = useState('')
  const [simProfitInput, setSimProfitInput] = useState('')
  // Tabel Simulasi (CRUD): baris tersimpan di perangkat (localStorage), nilai dihitung ulang dari form
  const [simRows, setSimRows] = useState<SimRow[]>([])
  const [simRowsLoaded, setSimRowsLoaded] = useState(false)
  const [simEditingId, setSimEditingId] = useState<number | null>(null)
  const [simEditJumlah, setSimEditJumlah] = useState('')
  const [simEditProfit, setSimEditProfit] = useState('')
  const [simConfirmClear, setSimConfirmClear] = useState(false)
  const simJumlahRef = useRef<HTMLInputElement>(null)

  // Muat baris simulasi tersimpan (per perangkat) sekali saat mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIM_ROWS_STORAGE_KEY())
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          setSimRows(parsed.filter((r: unknown): r is SimRow => {
            const row = r as SimRow
            return !!row && typeof row.id === 'number' && typeof row.jumlah === 'number' && row.jumlah > 0 && typeof row.profit === 'number' && !!row.snap && typeof row.snap.modal === 'number'
          }).slice(0, 50))
        }
      }
    } catch {}
    setSimRowsLoaded(true)
  }, [])

  // Simpan baris simulasi ke perangkat setiap berubah (setelah load awal)
  useEffect(() => {
    if (!simRowsLoaded) return
    try { localStorage.setItem(SIM_ROWS_STORAGE_KEY(), JSON.stringify(simRows)) } catch {}
  }, [simRows, simRowsLoaded])
  const [biayaLain1Label, setBiayaLain1Label] = useState('Biaya Bikin Piso')
  const [biayaLain2Label, setBiayaLain2Label] = useState('Biaya')



  // Riwayat hitung cetakan (full list)
  const [savingRiwayat, setSavingRiwayat] = useState(false)
  const [savingItem, setSavingItem] = useState(false)
  // Snapshot payload terakhir yang BERHASIL disimpan ke Master Barang — tombol terkunci sampai ada perubahan data
  const [savedItemSnapshot, setSavedItemSnapshot] = useState<string | null>(null)
  // Foto lampiran perhitungan (data URL JPEG ≤300KB; ikut tersimpan di riwayat)
  const [photoUrl, setPhotoUrl] = useState('')
  const [restoredRiwayatId, setRestoredRiwayatId] = useState<string | null>(null)
  const [riwayatCetakanList, setRiwayatCetakanList] = useState<any[]>([])
  const [riwayatLoading, setRiwayatLoading] = useState(true)
  const [backupLoading, setBackupLoading] = useState<string | null>(null)
  const [nextHitungCetakanNumber, setNextHitungCetakanNumber] = useState('')
  const [activeTab, setActiveTab] = useState<'editor' | 'riwayat' | 'gabung'>('editor')
  const [searchQuery, setSearchQuery] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [period, setPeriod] = useState<RiwayatPeriod>('today')
  const [month, setMonth] = useState<number | null>(new Date().getMonth() + 1)
  const [year, setYear] = useState<number | null>(new Date().getFullYear())
  const fetchRiwayatCetakan = async () => {
    try {
      setRiwayatLoading(true)
      const res = await fetcher('/api/riwayat-cetakan', { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setRiwayatCetakanList((Array.isArray(data) ? data : []).filter((r: any) => r.type === 'hitung_cetakan'))
      }
    } catch {} finally {
      setRiwayatLoading(false)
    }
  }

  // Daftar nama customer unik dari riwayat (isi dropdown filter pelanggan)
  const riwayatCustomerOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of riwayatCetakanList) {
      const name = String(r?.customerName || '').trim()
      if (name && name !== '-') set.add(name)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'))
  }, [riwayatCetakanList])

  // Filter riwayat: periode + pelanggan + pencarian (gaya Laporan Penjualan)
  const periodLabel = riwayatPeriodText(period, dateFrom, dateTo, month, year)
  const eff = riwayatDateRange(period, dateFrom, dateTo, month, year)
  const filteredRiwayatList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return riwayatCetakanList.filter((r) => {
      const t = String(r?.createdAt || '').slice(0, 10)
      if (eff.dateFrom && t && t < eff.dateFrom) return false
      if (eff.dateTo && t && t > eff.dateTo) return false
      if (customerFilter && String(r?.customerName || '').trim() !== customerFilter) return false
      if (q) {
        const hay = `${r?.nomorUrut || ''} ${r?.customerName || ''} ${r?.printName || ''} ${r?.finishingNames || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [riwayatCetakanList, searchQuery, customerFilter, eff])
  const riwayatFiltersActive = period !== 'all' || !!dateFrom || !!dateTo || !!searchQuery.trim() || !!customerFilter

  // Ringkasan riwayat: total & profit (profitAmount > 0 saja) dari list terfilter
  const riwayatSummary = useMemo(() => {
    let total = 0
    let profit = 0
    for (const r of filteredRiwayatList) {
      total += Number(r?.grandTotal) || 0
      if (r?.profitAmount && r.profitAmount > 0) profit += Number(r.profitAmount)
    }
    return { total, profit }
  }, [filteredRiwayatList])

  const fetchNextNumber = () => {
    fetcher('/api/riwayat-cetakan?preview=next-number', { headers: getAuthHeaders() })
      .then(res => { if (!res.ok) return null; return res.json() })
      .then(data => { if (data?.nextNumber) setNextHitungCetakanNumber(data.nextNumber) })
      .catch(() => {})
  }

  const handleBackup = async () => {
    setBackupLoading('backup')
    try {
      const res = await authFetch(`/api/database/backup-master?table=riwayat_cetakan`)
      if (!res.ok) {
        let errMsg = 'Gagal backup data riwayat hitung cetakan'
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
      a.download = match ? match[1] : `backup-riwayat-cetakan-${Date.now()}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Backup berhasil diunduh')
    } catch (e) { console.error('Backup error:', e); toast.error('Gagal backup data riwayat hitung cetakan') }
    setBackupLoading(null)
  }

  const handleRestore = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xlsx'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      if (!confirm('Data riwayat hitung cetakan yang ada akan diganti dengan data dari file backup. Lanjutkan?')) return
      setBackupLoading('restore')
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('table', 'riwayat_cetakan')
        const res = await authFetch('/api/database/restore-master', {
          method: 'POST',
          body: fd,
        })
        const data = await res.json()
        if (res.ok && data.success) {
          toast.success(`Restore berhasil (${data.count} data)`)
          fetchRiwayatCetakan()
          notifyDataChange('riwayat-cetakan')
        } else {
          toast.error(data.error || 'Gagal restore data riwayat hitung cetakan')
        }
      } catch { toast.error('File backup tidak valid') }
      setBackupLoading(null)
    }
    input.click()
  }

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewCalc, setPreviewCalc] = useState<PrintCalculation | null>(null)
  // Record riwayat asli di balik preview — null = preview dari editor (tanpa tombol Restore/Hapus)
  const [previewRiwayatRecord, setPreviewRiwayatRecord] = useState<any>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const waWindowRef = useRef<Window | null>(null)
  const [isGeneratingJpg, setIsGeneratingJpg] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  // ===== Mode Ubah (CRUD Update) untuk detail rincian dari riwayat =====

  // === localStorage persistence ===
  const loadFromStorage = () => {
    if (typeof window === 'undefined') return null
    try {
      const savedVersion = localStorage.getItem(FORM_STORAGE_VERSION_KEY())
      if (savedVersion && savedVersion !== FORM_STORAGE_VERSION) {
        localStorage.removeItem(FORM_STORAGE_KEY())
        localStorage.setItem(FORM_STORAGE_VERSION_KEY(), FORM_STORAGE_VERSION)
      }
      const raw = localStorage.getItem(FORM_STORAGE_KEY())
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }

  const saveToStorage = (data: { formData: typeof formData; selectedFinishings: string[]; totalPaperPrice: number }) => {
    if (typeof window === 'undefined') return
    try { localStorage.setItem(FORM_STORAGE_KEY(), JSON.stringify(data)) } catch {}
  }

  const clearStorage = () => {
    if (typeof window === 'undefined') return
    try { localStorage.removeItem(FORM_STORAGE_KEY()) } catch {}
  }

  // Load saved form data on mount
  useEffect(() => {
    // If navigating with reset flag (from Potong Kertas), skip localStorage restore
    const params = new URLSearchParams(window.location.search)
    const shouldReset = params.get('reset') === '1' || params.get('fromPotongKertas') === '1'
    if (!shouldReset) {
      const saved = loadFromStorage()
      if (saved) {
        if (saved.formData) setFormData(saved.formData)
        if (saved.selectedFinishings) setSelectedFinishings(saved.selectedFinishings)
        if (saved.totalPaperPrice) setTotalPaperPrice(saved.totalPaperPrice)
      }
    } else {
      clearStorage()
    }
    setHydrated(true)
  }, [])

  // Save to localStorage on every change (after hydration)
  useEffect(() => {
    if (!hydrated) return
    saveToStorage({ formData, selectedFinishings, totalPaperPrice })
  }, [formData, selectedFinishings, totalPaperPrice, hydrated])

  const handleAddFinishing = (finishingId: string) => {
    if (finishingId && !selectedFinishings.includes(finishingId)) {
      setSelectedFinishings([...selectedFinishings, finishingId])
      toast.success('Finishing berhasil ditambahkan')
    } else if (selectedFinishings.includes(finishingId)) {
      toast.error('Finishing ini sudah ditambahkan')
    }
  }

  const handleRemoveFinishing = (finishingId: string) => {
    setSelectedFinishings(selectedFinishings.filter(id => id !== finishingId))
    toast.success('Finishing berhasil dihapus')
  }

  const getFinishingCost = (finishing: Finishing, qtyOverride?: number): { cost: number; isMin: boolean; breakdown: string } => {
    const qty = qtyOverride !== undefined ? qtyOverride : (parseInt(formData.quantity) || 0)
    const cw = parseFloat(formData.cutWidth) || 0
    const ch = parseFloat(formData.cutHeight) || 0

    const minSheets = finishing.minimumSheets
    const minPrice = finishing.minimumPrice
    const hargaLebih = finishing.additionalPrice
    const hargaPerCm = finishing.pricePerCm
    const isPond = finishing.name.toLowerCase().includes('pond')

    if (qty <= 0) {
      return { cost: minPrice, isMin: true, breakdown: `Harga minimum: Rp ${Math.round(minPrice).toLocaleString('id-ID')}` }
    }

    if (isPond) {
      if (qty <= minSheets) {
        return {
          cost: minPrice,
          isMin: true,
          breakdown: `Qty ${qty} ≤ minim ${minSheets} → Harga minimum: Rp ${Math.round(minPrice).toLocaleString('id-ID')}`
        }
      }
      const selisih = qty - minSheets
      const tambahan = selisih * hargaLebih
      const total = minPrice + tambahan
      return {
        cost: total,
        isMin: false,
        breakdown: `Harga minimum Rp ${Math.round(minPrice).toLocaleString('id-ID')} + ((${qty} - ${minSheets}) × Rp ${Math.round(hargaLebih).toLocaleString('id-ID')}) = Rp ${Math.round(total).toLocaleString('id-ID')}`
      }
    }

    let part1 = 0
    let part1Text = ''
    if (qty > minSheets && hargaLebih > 0) {
      const selisih = qty - minSheets
      part1 = selisih * hargaLebih
      part1Text = `(${qty} - ${minSheets}) × Rp ${Math.round(hargaLebih).toLocaleString('id-ID')} = Rp ${Math.round(part1).toLocaleString('id-ID')}`
    }

    let part2 = 0
    let part2Text = ''
    if (cw > 0 && ch > 0 && hargaPerCm > 0) {
      const areaCost = cw * ch * hargaPerCm
      part2 = areaCost * qty
      part2Text = `(${cw} × ${ch}) × Rp ${Math.round(hargaPerCm).toLocaleString('id-ID')} × ${qty} = Rp ${Math.round(part2).toLocaleString('id-ID')}`
    }

    const total = part1 + part2

    if (total <= minPrice) {
      const parts = [part1Text, part2Text].filter(Boolean)
      const calcText = parts.length > 0 ? `${parts.join(' + ')} = Rp ${Math.round(total).toLocaleString('id-ID')} ≤ Rp ${Math.round(minPrice).toLocaleString('id-ID')}` : ''
      return {
        cost: minPrice,
        isMin: true,
        breakdown: calcText ? `${calcText} → Harga minimum: Rp ${Math.round(minPrice).toLocaleString('id-ID')}` : `Harga minimum: Rp ${Math.round(minPrice).toLocaleString('id-ID')}`
      }
    }

    const parts = [part1Text, part2Text].filter(Boolean)
    const breakdown = parts.join(' + ') + ` = Rp ${Math.round(total).toLocaleString('id-ID')}`

    return { cost: total, isMin: false, breakdown }
  }

  // Flag untuk restore dari riwayat atau potong kertas
  const [isRestoring, setIsRestoring] = useState(false)

  // Restore dari URL params (riwayat / potong kertas)
  useEffect(() => {
    const restored = searchParams.get('restoredFromRiwayat')
    const fromPotong = searchParams.get('fromPotongKertas')
    if (!restored && !fromPotong) return
    setIsRestoring(true)

    // Clear localStorage agar data lama tidak override
    clearStorage()

    const printName = searchParams.get('printName')
    const customerNameParam = searchParams.get('customerName')
    const paperNameParam = searchParams.get('paperName')
    const paperIdParam = searchParams.get('paperId')
    const grammageParam = searchParams.get('grammage')
    const paperLength = searchParams.get('paperLength')
    const paperWidthParam = searchParams.get('paperWidth')
    const cutWidthParam = searchParams.get('cutWidth')
    const cutHeightParam = searchParams.get('cutHeight')
    const quantityParam = searchParams.get('quantity')
    const setelanKertasParam = searchParams.get('setelanKertas')
    const pricePerSheetParam = searchParams.get('pricePerSheet')
    const totalPaperPriceParam = searchParams.get('totalPaperPrice')
    const warnaParam = searchParams.get('warna')
    const warnaKhususParam = searchParams.get('warnaKhusus')
    const hargaPlatParam = searchParams.get('hargaPlat')
    const machineNameParam = searchParams.get('machineName')
    const machineName2Param = searchParams.get('machineName2')
    const finishingNamesParam = searchParams.get('finishingNames')
    const packingCostParam = searchParams.get('packingCost')
    const shippingCostParam = searchParams.get('shippingCost')
    const glueCostParam = searchParams.get('glueCost')
    const glueBoronganParam = searchParams.get('glueBorongan')
    const otherCostParam = searchParams.get('otherCost')
    const profitPercentParam = searchParams.get('profitPercent')

    if (totalPaperPriceParam) setTotalPaperPrice(parseFloat(totalPaperPriceParam) || 0)
    if (profitPercentParam) { const pp = parseFloat(profitPercentParam) || 0; setProfitPercent(pp); setProfitInput(pp === 0 ? '' : pp.toString()) }

    setFormData(prev => ({
      ...prev,
      customerName: customerNameParam || '',
      printName: printName || '',
      paperLength: paperLength || '',
      paperWidth: paperWidthParam || '',
      cutWidth: cutWidthParam || '',
      cutHeight: cutHeightParam || '',
      quantity: quantityParam || '',
      jumlahPesanan: searchParams.get('jumlahPesanan') || '',
      berapaMata: searchParams.get('berapaMata') || '',
      setelanKertas: setelanKertasParam || '',
      warna: warnaParam || '',
      warnaKhusus: warnaKhususParam || '',
      hargaPlat: hargaPlatParam || '',
      paperId: paperIdParam || '',
      pricePerSheet: pricePerSheetParam || '',
      packingCost: packingCostParam || '',
      shippingCost: shippingCostParam || '',
      biayaLain1: otherCostParam ? (parseFloat(otherCostParam) > 0 ? otherCostParam : '') : '',
      biayaLain2: '',
      glueLengthCm: glueCostParam ? '1' : '',
      glueCostPerCm: glueCostParam ? glueCostParam : '',
      glueBoronganPerSheet: glueBoronganParam || '',
    }))

    // Simpan nama untuk matching setelah data fetch selesai
    if (paperNameParam) window.__restorePaperName = paperNameParam
    if (machineNameParam) window.__restoreMachineName = machineNameParam
    if (machineName2Param) window.__restoreMachineName2 = machineName2Param
    if (finishingNamesParam && finishingNamesParam !== '-') window.__restoreFinishingNames = finishingNamesParam
    if (pricePerSheetParam) window.__restorePricePerSheet = pricePerSheetParam

    // Foto lampiran dari editor Potong Kertas (dikirim via sessionStorage
    // saat tombol "Hitung Cetakan Lengkap" diklik)
    if (fromPotong === '1') {
      const pkPhoto = sessionStorage.getItem('pk-to-hc-photoUrl')
      if (pkPhoto) {
        setPhotoUrl(pkPhoto)
        sessionStorage.removeItem('pk-to-hc-photoUrl')
      }
    }

    setPrefilled(true)
    // Bersihkan URL params setelah dibaca
    window.history.replaceState({}, '', '/hitung-cetakan')
    toast.success('Data berhasil di-restore dari riwayat!')
  }, [searchParams])

  const fetchCustomers = async () => {
    try {
      const response = await fetcher('/api/customers', { headers: getAuthHeaders() })
      const data = await response.json()
      if (Array.isArray(data)) setCustomers(data)
    } catch (error) {
      console.error('Error fetching customers:', error)
    }
  }

  const fetchPapers = async () => {
    try {
      const response = await fetcher('/api/papers', { headers: getAuthHeaders() })
      const data = await response.json()
      if (Array.isArray(data)) setPapers(data)
    } catch (error) {
      console.error('Error fetching papers:', error)
    }
  }

  const fetchPrintingCosts = async () => {
    try {
      const response = await fetcher('/api/printing-costs', { headers: getAuthHeaders() })
      const data = await response.json()
      if (Array.isArray(data)) setPrintingCosts(data)
    } catch (error) {
      console.error('Error fetching printing costs:', error)
    }
  }

  const fetchFinishings = async () => {
    try {
      const response = await fetcher('/api/finishings', { headers: getAuthHeaders() })
      const data = await response.json()
      if (Array.isArray(data)) setFinishings(data)
    } catch (error) {
      console.error('Error fetching finishings:', error)
    }
  }

  // Matching restore data setelah fetch selesai
  useEffect(() => {
    if (!isRestoring) return
    if (papers.length === 0 && printingCosts.length === 0 && finishings.length === 0) return

    if (window.__restorePaperName && papers.length > 0) {
      const paper = papers.find(p => p.name === window.__restorePaperName)
      if (paper) {
        // Jika pricePerSheet dari riwayat ada, gunakan itu (bukan hitung ulang dari harga kertas saat ini)
        const restoredPPS = window.__restorePricePerSheet
        setFormData(prev => ({
          ...prev,
          paperId: paper.id,
          pricePerSheet: restoredPPS || prev.pricePerSheet || Math.round(paper.pricePerRim / 500).toString()
        }))
      }
    }
    if (window.__restoreMachineName && printingCosts.length > 0) {
      const machine = printingCosts.find(m => m.machineName === window.__restoreMachineName)
      if (machine) {
        setFormData(prev => ({ ...prev, machineId: machine.id }))
      }
    }
    if (window.__restoreMachineName2 && printingCosts.length > 0) {
      const machine2 = printingCosts.find(m => m.machineName === window.__restoreMachineName2)
      if (machine2) {
        setFormData(prev => ({ ...prev, machineId2: machine2.id }))
      }
    }
    if (window.__restoreFinishingNames && finishings.length > 0) {
      const names = window.__restoreFinishingNames.split(',').map(n => n.trim()).filter(Boolean)
      // Deduplicate: hanya ambil 1 finishing per nama (hindari duplikat di DB)
      const matchedIds: string[] = []
      const seenNames = new Set<string>()
      for (const name of names) {
        if (seenNames.has(name)) continue
        seenNames.add(name)
        const found = finishings.find(f => f.name === name)
        if (found) matchedIds.push(found.id)
      }
      if (matchedIds.length > 0) setSelectedFinishings(matchedIds)
    }

    // Bersihkan
    delete window.__restorePaperName
    delete window.__restoreMachineName
    delete window.__restoreMachineName2
    delete window.__restoreFinishingNames
    delete window.__restorePricePerSheet
    setIsRestoring(false)
  }, [isRestoring, papers, printingCosts, finishings])

  const fetchProfitSetting = () => {
    fetcher('/api/settings?key=profit', { headers: getAuthHeaders() })
      .then(res => res.json())
      .then(data => {
        if (data.value !== null && data.value !== undefined && !searchParams.get('restoredFromRiwayat')) {
          const parsed = parseFloat(data.value)
          const val = isNaN(parsed) ? 0 : parsed
          setProfitPercent(val)
          setProfitInput(val === 0 ? '' : val.toString())
        }
      })
      .catch(() => {})
  }

  // Save profit percent to backend so Settings page stays in sync
  const handleProfitChange = (newVal: number) => {
    setProfitPercent(newVal)
    setProfitInput(newVal === 0 ? '' : newVal.toString())
    // Debounced save to backend
    if (newVal >= 0) {
      fetcher('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ key: 'profit', value: newVal.toString() }),
      }).then(() => {
        notifyDataChange('settings')
      }).catch(() => {})
    }
  }

  useEffect(() => {
    fetchCustomers()
    fetchPapers()
    fetchPrintingCosts()
    fetchFinishings()
    fetchRiwayatCetakan()
    fetchNextNumber()
    // Jangan override profitPercent saat restore
    fetchProfitSetting()
  }, [])

  useDataChange(['papers', 'printing-costs', 'finishings', 'customers', 'settings'], (entity) => {
    if (entity === 'papers') fetchPapers()
    if (entity === 'printing-costs') fetchPrintingCosts()
    if (entity === 'finishings') fetchFinishings()
    if (entity === 'customers') fetchCustomers()
    if (entity === 'settings') fetchProfitSetting()
  })

  const selectedPaper = papers.find(p => p.id === formData.paperId)
  const selectedMachine = printingCosts.find(m => m.id === formData.machineId)
  const selectedMachine2 = printingCosts.find(m => m.id === formData.machineId2)
  const selectedFinishingItems = selectedFinishings.map(id => finishings.find(f => f.id === id)).filter(Boolean) as Finishing[]

  useEffect(() => {
    if (selectedMachine && !formData.hargaPlat) {
      setFormData(prev => ({ ...prev, hargaPlat: selectedMachine.platePricePerSheet?.toString() || '' }))
    }
  }, [selectedMachine])

  useEffect(() => {
    if (selectedMachine2 && !formData.hargaPlat2) {
      setFormData(prev => ({ ...prev, hargaPlat2: selectedMachine2.platePricePerSheet?.toString() || '' }))
    }
  }, [selectedMachine2])

  useEffect(() => {
    if (selectedPaper && !formData.pricePerSheet) {
      setFormData(prev => ({ ...prev, pricePerSheet: Math.round(selectedPaper.pricePerRim / 500).toString() }))
    }
  }, [selectedPaper])

  useEffect(() => {
    const qty = parseInt(formData.quantity) || 0
    const warna = parseInt(formData.warna) || 0
    const warnaKhusus = parseInt(formData.warnaKhusus) || 0
    const hargaPlat = parseFloat(formData.hargaPlat) || 0

    if (selectedMachine && qty > 0 && warna > 0) {
      const minimum = selectedMachine.minimumPrintQuantity
      let ongkos = 0
      ongkos += (selectedMachine.pricePerColor * warna) + (selectedMachine.specialColorPrice * warnaKhusus)
      if (qty > minimum) {
        ongkos += (qty - minimum) * selectedMachine.priceAboveMinimumPerSheet
      }
      ongkos += hargaPlat * (warna + warnaKhusus)
      setCalculatedPrintingCost(ongkos)
    } else {
      setCalculatedPrintingCost(0)
    }

    if (selectedFinishingItems.length > 0) {
      let totalFinCost = 0
      let anyMin = false
      selectedFinishingItems.forEach(fin => {
        const result = getFinishingCost(fin)
        totalFinCost += result.cost
        if (result.isMin) anyMin = true
      })
      setCalculatedFinishingCost(totalFinCost)
      setIsFinishingMin(anyMin)
    } else {
      setCalculatedFinishingCost(0)
      setIsFinishingMin(false)
    }

    // Ongkos Cetak 2
    const warna2 = parseInt(formData.warna2) || 0
    const warnaKhusus2 = parseInt(formData.warnaKhusus2) || 0
    const hargaPlat2 = parseFloat(formData.hargaPlat2) || 0

    if (selectedMachine2 && qty > 0 && warna2 > 0) {
      const minimum2 = selectedMachine2.minimumPrintQuantity
      let ongkos2 = 0
      ongkos2 += (selectedMachine2.pricePerColor * warna2) + (selectedMachine2.specialColorPrice * warnaKhusus2)
      if (qty > minimum2) {
        ongkos2 += (qty - minimum2) * selectedMachine2.priceAboveMinimumPerSheet
      }
      ongkos2 += hargaPlat2 * (warna2 + warnaKhusus2)
      setCalculatedPrintingCost2(ongkos2)
    } else {
      setCalculatedPrintingCost2(0)
    }

    // Ongkos Lem: (cm × harga/cm) × jumlahPesanan
    const cmLem = parseFloat(formData.glueLengthCm) || 0
    const hargaPerCmLem = parseFloat(formData.glueCostPerCm) || 0
    const jumlahPesananLem = parseInt(formData.jumlahPesanan) || 0
    if (cmLem > 0 && hargaPerCmLem > 0 && jumlahPesananLem > 0) {
      setCalculatedGlueCost(cmLem * hargaPerCmLem * jumlahPesananLem)
    } else {
      setCalculatedGlueCost(0)
    }

    const boronganPerSheet = parseFloat(formData.glueBoronganPerSheet) || 0
    const jumlahPesanan = parseInt(formData.jumlahPesanan) || 0
    if (boronganPerSheet > 0 && jumlahPesanan > 0) {
      setCalculatedGlueBoronganSheet(boronganPerSheet * jumlahPesanan)
    } else {
      setCalculatedGlueBoronganSheet(0)
    }

    setCalculatedCost(calculatedPrintingCost + calculatedPrintingCost2 + calculatedFinishingCost)
  }, [selectedMachine, selectedMachine2, selectedFinishingItems, formData.quantity, formData.jumlahPesanan, formData.warna, formData.warnaKhusus, formData.hargaPlat, formData.warna2, formData.warnaKhusus2, formData.hargaPlat2, formData.cutWidth, formData.cutHeight, formData.glueLengthCm, formData.glueCostPerCm, formData.glueBoronganPerSheet, calculatedPrintingCost, calculatedPrintingCost2, calculatedFinishingCost])

  // Cetak: hasil cetak = sama persis dengan isi dialog Detail Rincian Cetakan, di-fit ke halaman A5 portrait (148 × 210 mm)
  const handlePrint = async () => {
    const el = previewRef.current
    if (!el || !previewCalc) { toast.error('Preview tidak tersedia'); return }
    setIsPrinting(true)
    try {
      // Cetak hi-res 300 DPI: capture preview apa adanya (fixedWidth 720px agar
      // hasil identik mobile & desktop) → gambar dicetak via popup/iframe.
      const blob = await captureElementAsJpg(el, { pixelRatio: HIRES_PIXEL_RATIO, fixedWidth: 720 })
      const custLabel = (previewCalc.customerName || previewCalc.printName || 'rincian-cetakan')
      const ok = await printBlobHiRes(blob, { title: `Rincian Harga Cetakan ${custLabel}`, page: 'A5 portrait', margin: '5mm' })
      if (!ok) { toast.error('Popup diblokir. Izinkan popup untuk mencetak.'); return }
    } catch (e) {
      console.error('Print error:', e)
      toast.error('Gagal menyiapkan cetakan')
    } finally { setIsPrinting(false) }
  }

  const handleJpg = async () => {
    const el = previewRef.current
    if (!el || !previewCalc) return
    setIsGeneratingJpg(true)
    try {
      // Gambar hi-res 300 DPI + fixedWidth 720px (identik mobile & desktop),
      // dikomposisi ke kanvas A5 portrait fit (148 × 210 mm @300 DPI = 1748×2480 px)
      const rawBlob = await captureElementAsJpg(el, { pixelRatio: HIRES_PIXEL_RATIO, fixedWidth: 720 })
      const blob = await fitBlobToA5(rawBlob, { orientation: 'portrait', marginPct: 3 })
      const custLabel = (previewCalc.customerName || previewCalc.printName || 'preview')
      const fileName = `rincian-cetakan-${custLabel.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.jpg`
      const result = await shareJpgToWhatsApp({ blob, fileName, documentLabel: 'Rincian Harga Cetakan' })
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
    }
    finally { setIsGeneratingJpg(false) }
  }

  const handlePreview = () => {
    // Tidak ada guard Nama Barang: preview boleh dibuka selama total sudah terhitung
    // (tombol sudah disabled={!hasGrandTotal}) — field kosong tampil sebagai "-".
    const packing = parseFloat(formData.packingCost) || 0
    const shipping = parseFloat(formData.shippingCost) || 0
    const priceSheet = parseFloat(formData.pricePerSheet) || 0
    const qty = parseInt(formData.quantity) || 0
    const biayaLain1Val = parseFloat(formData.biayaLain1) || 0
    const biayaLain2Val = parseFloat(formData.biayaLain2) || 0
    const totalCost = calculatedCost + packing + shipping + calculatedGlueCost + calculatedGlueBoronganSheet + biayaLain1Val + biayaLain2Val + paperPriceValue
    const previewData: PrintCalculation = {
      id: 'preview',
      printName: formData.printName, paperLength: formData.paperLength, paperWidth: formData.paperWidth,
      cutWidth: formData.cutWidth, cutHeight: formData.cutHeight,
      quantity: formData.quantity, jumlahPesanan: formData.jumlahPesanan, berapaMata: formData.berapaMata, warna: formData.warna, warnaKhusus: formData.warnaKhusus,
      hargaPlat: formData.hargaPlat, paperId: formData.paperId, paperName: selectedPaper?.name || 'Custom', paperGrammage: selectedPaper?.grammage || 0,
      recordNumber: '', recordDate: new Date().toISOString(),
      machineId: formData.machineId, machineName: selectedMachine?.machineName || '-',
      printingCost: calculatedCost, finishingId: selectedFinishings.join(','),
      finishingName: selectedFinishingItems.map(f => f.name).join(', '),
      packingCost: formData.packingCost, shippingCost: formData.shippingCost,
      pricePerSheet: formData.pricePerSheet, totalPrice: totalCost,
      customerName: formData.customerName,
      machineId2: formData.machineId2, machineName2: selectedMachine2?.machineName || '',
      warna2: formData.warna2, warnaKhusus2: formData.warnaKhusus2, hargaPlat2: formData.hargaPlat2,
      glueLengthCm: formData.glueLengthCm, glueCostPerCm: formData.glueCostPerCm, glueBoronganPerSheet: formData.glueBoronganPerSheet,
      biayaLain1: formData.biayaLain1, biayaLain2: formData.biayaLain2,
      totalPaperPrice: paperPriceValue, calculatedPrintingCost, calculatedPrintingCost2, calculatedFinishingCost,
      calculatedGlueCost, calculatedGlueBoronganSheet,
      finishingBreakdown: selectedFinishingItems.map(fin => { const { cost } = getFinishingCost(fin); return { name: fin.name, cost } }),
      profitPercent, biayaLain1Label, biayaLain2Label,
      photoUrl: photoUrl || ''
    }
    setPreviewCalc(previewData)
    setPreviewOpen(true)
  }

  const handleWhatsApp = () => {
    // Sama seperti Preview: tanpa guard Nama Barang — field kosong tampil sebagai "-".
    const rp = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`
    const qty = parseInt(formData.quantity) || 0

    let msg = `*Rincian Harga Cetakan - www.darrellsoft.com*\n\n`
    msg += `Nama Customer: ${formData.customerName || '-'}\n`
    msg += `Nama Barang: ${formData.printName || '-'}\n`
    msg += `Jumlah Pesanan: ${summaryJumlahPesanan.toLocaleString('id-ID')} lbr\n`
    msg += `Kertas: ${selectedPaper?.name || '-'} ${selectedPaper?.grammage ? `(${selectedPaper.grammage} gsm)` : ''}\n`
    if (selectedFinishingItems.length > 0) {
      msg += `Finishing:\n`
      selectedFinishingItems.forEach(fin => {
        const { cost } = getFinishingCost(fin)
        if (cost > 0) msg += `${fin.name}\n`
      })
    }
    msg += `\n*Grand Total: ${rp(summaryGrandTotal)}*\n`
    if (summaryJumlahPesanan > 0) msg += `Harga Jual/Pcs: ${rp(summaryGrandTotal / summaryJumlahPesanan)}\n`
    msg += `\nTerima kasih`

    const encoded = encodeURIComponent(msg)

    openWhatsApp(encoded, { waWindowRef })
    toast.success('Membuka WhatsApp...')
  }

  const resetForm = () => {
    clearStorage()
    setFormData({ customerName: '', printName: '', paperLength: '', paperWidth: '', cutWidth: '', cutHeight: '', quantity: '', jumlahPesanan: '', berapaMata: '', setelanKertas: '', warna: '', warnaKhusus: '', hargaPlat: '', paperId: '', machineId: '', packingCost: '', shippingCost: '', pricePerSheet: '', glueLengthCm: '', glueCostPerCm: '', glueBoronganPerSheet: '', biayaLain1: '', biayaLain2: '', machineId2: '', warna2: '', warnaKhusus2: '', hargaPlat2: '' })
    setSelectedFinishings([])
    setCalculatedCost(0)
    setCalculatedGlueCost(0)
    setCalculatedGlueBoronganSheet(0)
    setCalculatedPrintingCost2(0)
    setTotalPaperPrice(0)
    toast.success('Form berhasil direset')
  }

  const buildRiwayatPayload = () => {
    const packing = parseFloat(formData.packingCost) || 0
    const shipping = parseFloat(formData.shippingCost) || 0
    const biayaLain1Val = parseFloat(formData.biayaLain1) || 0
    const biayaLain2Val = parseFloat(formData.biayaLain2) || 0
    const glueTotal = calculatedGlueCost + calculatedGlueBoronganSheet
    const subTotal = paperPriceValue + calculatedPrintingCost + calculatedPrintingCost2 + calculatedFinishingCost + packing + shipping + biayaLain1Val + biayaLain2Val + glueTotal
    const profitAmount = subTotal * (profitPercent / 100)
    const grandTotal = subTotal + profitAmount
    return {
      type: 'hitung_cetakan',
      printName: formData.printName, customerName: formData.customerName, paperName: selectedPaper?.name || '',
      paperGrammage: selectedPaper?.grammage?.toString() || '0',
      paperLength: formData.paperLength, paperWidth: formData.paperWidth,
      cutWidth: formData.cutWidth, cutHeight: formData.cutHeight,
      quantity: formData.quantity, jumlahPesanan: formData.jumlahPesanan, berapaMata: formData.berapaMata, setelanKertas: formData.setelanKertas, warna: formData.warna, warnaKhusus: formData.warnaKhusus,
      machineName: selectedMachine?.machineName || '',
      hargaPlat: parseFloat(formData.hargaPlat) || 0,
      ongkosCetak: calculatedPrintingCost,
      ongkosCetakDetail: selectedMachine ? `(Rp ${Math.round(selectedMachine.pricePerColor).toLocaleString('id-ID')} × ${formData.warna || 0} warna)${parseInt(formData.warnaKhusus || '0') > 0 ? ` + (Rp ${Math.round(selectedMachine.specialColorPrice).toLocaleString('id-ID')} × ${formData.warnaKhusus} khusus)` : ''}${parseInt(formData.quantity) > selectedMachine.minimumPrintQuantity ? ` + (${formData.quantity} - ${selectedMachine.minimumPrintQuantity}) × Rp ${Math.round(selectedMachine.priceAboveMinimumPerSheet).toLocaleString('id-ID')}` : ''} + Rp ${Math.round(selectedMachine.platePricePerSheet).toLocaleString('id-ID')} × ${parseInt(formData.warna || '0') + parseInt(formData.warnaKhusus || '0')} plat` : '',
      machineName2: selectedMachine2?.machineName || '',
      warna2: formData.warna2,
      warnaKhusus2: formData.warnaKhusus2,
      hargaPlat2: parseFloat(formData.hargaPlat2) || 0,
      ongkosCetak2: calculatedPrintingCost2,
      ongkosCetak2Detail: selectedMachine2 ? `(Rp ${Math.round(selectedMachine2.pricePerColor).toLocaleString('id-ID')} × ${formData.warna2 || 0} warna)${parseInt(formData.warnaKhusus2 || '0') > 0 ? ` + (Rp ${Math.round(selectedMachine2.specialColorPrice).toLocaleString('id-ID')} × ${formData.warnaKhusus2} khusus)` : ''}${parseInt(formData.quantity) > selectedMachine2.minimumPrintQuantity ? ` + (${formData.quantity} - ${formData.minimumPrintQuantity2 || selectedMachine2.minimumPrintQuantity}) × Rp ${Math.round(selectedMachine2.priceAboveMinimumPerSheet).toLocaleString('id-ID')}` : ''} + Rp ${Math.round(selectedMachine2.platePricePerSheet).toLocaleString('id-ID')} × ${parseInt(formData.warna2 || '0') + parseInt(formData.warnaKhusus2 || '0')} plat` : '',
      totalPaperPrice: paperPriceValue,
      pricePerSheet: parseFloat(formData.pricePerSheet) || 0,
      finishingNames: selectedFinishingItems.map(f => f.name).join(', '),
      finishingBreakdown: selectedFinishingItems.map(f => { const r = getFinishingCost(f); return `${f.name}: ${r.breakdown} = Rp ${Math.round(r.cost).toLocaleString('id-ID')}` }).join(' | '),
      finishingCost: calculatedFinishingCost, packingCost: packing, shippingCost: shipping,
      otherCost: biayaLain1Val, otherCost2: biayaLain2Val,
      otherCostLabel: biayaLain1Label, otherCostLabel2: biayaLain2Label,
      glueCost: calculatedGlueCost, glueBorongan: calculatedGlueBoronganSheet,
      glueLengthCm: formData.glueLengthCm, glueCostPerCm: formData.glueCostPerCm,
      subTotal, profitPercent, profitAmount, grandTotal, photoUrl
    }
  }

  const resetFormForRiwayat = () => {
    setRestoredRiwayatId(null)
    setPhotoUrl('')
    clearStorage()
    setFormData({ customerName: '', printName: '', paperLength: '', paperWidth: '', cutWidth: '', cutHeight: '', quantity: '', jumlahPesanan: '', berapaMata: '', setelanKertas: '', warna: '', warnaKhusus: '', hargaPlat: '', paperId: '', machineId: '', packingCost: '', shippingCost: '', pricePerSheet: '', glueLengthCm: '', glueCostPerCm: '', glueBoronganPerSheet: '', biayaLain1: '', biayaLain2: '', machineId2: '', warna2: '', warnaKhusus2: '', hargaPlat2: '' })
    setSelectedFinishings([])
    setCalculatedCost(0)
    setCalculatedGlueCost(0)
    setCalculatedGlueBoronganSheet(0)
    setCalculatedPrintingCost2(0)
    setTotalPaperPrice(0)
  }

  const isDataSameAsAnyRiwayat = () => {
    if (riwayatCetakanList.length === 0) return false
    const payload = buildRiwayatPayload()
    return riwayatCetakanList.some(r =>
      (r.printName || '') === (payload.printName || '') &&
      (r.customerName || '') === (payload.customerName || '') &&
      (r.paperName || '') === (payload.paperName || '') &&
      (r.paperLength || '') === (payload.paperLength || '') &&
      (r.paperWidth || '') === (payload.paperWidth || '') &&
      (r.cutWidth || '') === (payload.cutWidth || '') &&
      (r.cutHeight || '') === (payload.cutHeight || '') &&
      (r.quantity || '') === (payload.quantity || '') &&
      (r.jumlahPesanan || '') === (payload.jumlahPesanan || '') &&
      (r.berapaMata || '') === (payload.berapaMata || '') &&
      (r.machineName || '') === (payload.machineName || '') &&
      (r.warna || '') === (payload.warna || '') &&
      r.grandTotal === payload.grandTotal
    )
  }

  const handleSaveRiwayat = async () => {
    if (isDataSameAsAnyRiwayat()) {
      toast('Data tidak berubah, riwayat tidak duplikat.', { description: 'Ubah minimal 1 data untuk menyimpan riwayat baru.' })
      return
    }
    setSavingRiwayat(true)
    try {
      const res = await fetcher('/api/riwayat-cetakan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(buildRiwayatPayload())
      })
      if (res.ok) {
        toast.success('Riwayat hitung cetakan berhasil disimpan!', { description: 'Data form tetap — cukup ketik jumlah pesanan & profit baru untuk hitungan berikutnya.' })
        notifyDataChange('riwayat-cetakan')
        fetchRiwayatCetakan()
        fetchNextNumber()
        // Form TIDAK direset: parameter lama tetap terpakai (cukup ubah jumlah pesanan & profit).
        setRestoredRiwayatId(null)
      } else { toast.error('Gagal menyimpan riwayat') }
    } catch { toast.error('Gagal menyimpan riwayat') }
    setSavingRiwayat(false)
  }

  // Simpan perhitungan aktif sebagai barang baru di Master Barang
  // (nama cetakan → nama barang, harga jual/pcs → jual, modal/pcs → modal, jumlah pesanan → qty, foto lampiran → foto barang)
  const handleSaveToMaster = async () => {
    const name = formData.printName.trim()
    if (!name) {
      toast.error('Isi Nama Cetakan dulu sebelum menyimpan ke Master Barang')
      return
    }
    if (summaryHargaPerlembar <= 0) {
      toast.error('Total masih 0 — lengkapi perhitungan (qty & biaya) dulu')
      return
    }
    setSavingItem(true)
    try {
      const custMatch = customers.find((c) => c.name.toLowerCase() === formData.customerName.trim().toLowerCase())
      const body: Record<string, unknown> = {
        name,
        unit: 'pcs',
        standardPrice: Math.round(summaryHargaPerlembar),
        hpp: Math.round(summaryHargaModal),
        qty: summaryJumlahPesanan,
        keterangan: `Dari Hitung Cetakan · Total: Rp ${Math.round(summaryGrandTotal).toLocaleString('id-ID')} · Modal/pcs: Rp ${Math.round(summaryHargaModal).toLocaleString('id-ID')}`,
      }
      if (custMatch) body.customerId = custMatch.id
      if (photoUrl) body.photoUrl = photoUrl
      const res = await fetcher('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const data = await res.json().catch(() => null)
        const code = data?.item?.code ? ` (${data.item.code})` : ''
        toast.success(`Barang "${name}"${code} tersimpan ke Master Barang`, {
          description: `Jual Rp ${Math.round(summaryHargaPerlembar).toLocaleString('id-ID')}/pcs · Modal Rp ${Math.round(summaryHargaModal).toLocaleString('id-ID')}/pcs${custMatch ? ` · Pelanggan: ${custMatch.name}` : ''}`,
        })
        setSavedItemSnapshot(itemSavePayload)
        notifyDataChange('items')
      } else {
        const err = await res.json().catch(() => null)
        toast.error(err?.error || 'Gagal menyimpan ke Master Barang')
      }
    } catch {
      toast.error('Gagal menyimpan ke Master Barang')
    }
    setSavingItem(false)
  }

  const handleInvoice = async () => {
    if (!hasGrandTotal) {
      toast.error('Hitung terlebih dahulu sampai total muncul!')
      return
    }
    // Check if data already exists in riwayat
    if (isDataSameAsAnyRiwayat()) {
      const payload = buildRiwayatPayload()
      const existing = riwayatCetakanList.find(r =>
        (r.printName || '') === (payload.printName || '') &&
        (r.customerName || '') === (payload.customerName || '') &&
        (r.paperName || '') === (payload.paperName || '') &&
        (r.paperLength || '') === (payload.paperLength || '') &&
        (r.paperWidth || '') === (payload.paperWidth || '') &&
        (r.cutWidth || '') === (payload.cutWidth || '') &&
        (r.cutHeight || '') === (payload.cutHeight || '') &&
        (r.quantity || '') === (payload.quantity || '') &&
        (r.jumlahPesanan || '') === (payload.jumlahPesanan || '') &&
        (r.berapaMata || '') === (payload.berapaMata || '') &&
        (r.machineName || '') === (payload.machineName || '') &&
        (r.warna || '') === (payload.warna || '') &&
        r.grandTotal === payload.grandTotal
      )
      if (existing) {
        toast('Data sudah ada di riwayat, langsung ke Invoice.', { description: 'Data yang sama tidak disimpan ulang.' })
        resetFormForRiwayat()
        router.push(`/invoice?riwayatId=${existing.id}`)
      }
      return
    }
    setSavingRiwayat(true)
    try {
      // Simpan ke riwayat cetakan dulu
      const res = await fetcher('/api/riwayat-cetakan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(buildRiwayatPayload())
      })
      if (res.ok) {
        const saved = await res.json()
        notifyDataChange('riwayat-cetakan')
        fetchRiwayatCetakan()
        toast.success('Data tersimpan di riwayat!')
        resetFormForRiwayat()
        // Navigasi ke halaman invoice dengan riwayatId
        router.push(`/invoice?riwayatId=${saved.id}`)
      } else {
        toast.error('Gagal menyimpan data riwayat')
      }
    } catch {
      toast.error('Gagal menyimpan data riwayat')
    }
    setSavingRiwayat(false)
  }

  const handleUpdateRiwayat = async () => {
    if (!restoredRiwayatId) { toast.error('Tidak ada data yang di-restore'); return }
    setSavingRiwayat(true)
    try {
      const res = await fetcher(`/api/riwayat-cetakan/${restoredRiwayatId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(buildRiwayatPayload())
      })
      if (res.ok) {
        toast.success('Riwayat berhasil diupdate!', { description: 'Data form tetap — cukup ketik jumlah pesanan & profit baru untuk hitungan berikutnya.' })
        notifyDataChange('riwayat-cetakan')
        fetchRiwayatCetakan()
        // Form TIDAK direset: parameter lama tetap terpakai (cukup ubah jumlah pesanan & profit).
        setRestoredRiwayatId(null)
      } else { toast.error('Gagal mengupdate riwayat') }
    } catch { toast.error('Gagal mengupdate riwayat') }
    setSavingRiwayat(false)
  }

  const handleRestoreRiwayat = (r: any) => {
    setRestoredRiwayatId(r.id)
    setPhotoUrl(r.photoUrl || '')
    setActiveTab('editor')
    const rQty = parseInt(r.quantity) || 0
    // Restore ongkos lem input asli dari DB jika ada, jika tidak fallback dari total
    const rJumlahPesanan = parseInt(r.jumlahPesanan) || rQty
    const restoredGlueLengthCm = r.glueLengthCm || (r.glueCost ? '1' : '')
    const restoredGlueCostPerCm = r.glueCostPerCm || (r.glueCost && rJumlahPesanan > 0 ? (r.glueCost / rJumlahPesanan).toString() : '')
    // glueBorongan di DB menyimpan total (harga/lembar × jumlahPesanan), jadi bagi kembali untuk dapat harga/lembar asli
    const restoredBoronganPerSheet = r.glueBorongan && rJumlahPesanan > 0 ? Math.round(r.glueBorongan / rJumlahPesanan).toString() : ''
    const restoredForm = {
      customerName: r.customerName || '',
      printName: r.printName || '',
      paperLength: r.paperLength || '',
      paperWidth: r.paperWidth || '',
      cutWidth: r.cutWidth || '',
      cutHeight: r.cutHeight || '',
      quantity: r.quantity || '',
      jumlahPesanan: r.jumlahPesanan || '',
      berapaMata: r.berapaMata || '',
      setelanKertas: r.setelanKertas || '',
      warna: r.warna || '',
      warnaKhusus: r.warnaKhusus || '',
      hargaPlat: r.hargaPlat?.toString() || '',
      paperId: '',
      machineId: '',
      packingCost: r.packingCost?.toString() || '',
      shippingCost: r.shippingCost?.toString() || '',
      pricePerSheet: r.pricePerSheet?.toString() || '',
      glueLengthCm: restoredGlueLengthCm,
      glueCostPerCm: restoredGlueCostPerCm,
      glueBoronganPerSheet: restoredBoronganPerSheet,
      biayaLain1: r.otherCost?.toString() || '',
      biayaLain2: r.otherCost2?.toString() || '',
      machineId2: '',
      warna2: r.warna2 || '',
      warnaKhusus2: r.warnaKhusus2 || '',
      hargaPlat2: r.hargaPlat2?.toString() || ''
    }
    setFormData(restoredForm)
    if (r.totalPaperPrice) setTotalPaperPrice(r.totalPaperPrice)
    if (r.profitPercent) { setProfitPercent(r.profitPercent); setProfitInput(r.profitPercent === 0 ? '' : r.profitPercent.toString()) }
    if (r.otherCostLabel) setBiayaLain1Label(r.otherCostLabel)
    if (r.otherCostLabel2) setBiayaLain2Label(r.otherCostLabel2)
    // Restore calculated glue values
    if (r.glueCost) setCalculatedGlueCost(r.glueCost)
    if (r.glueBorongan) setCalculatedGlueBoronganSheet(r.glueBorongan)
    // Restore calculated printing/finishing costs
    if (r.ongkosCetak) setCalculatedPrintingCost(r.ongkosCetak)
    if (r.ongkosCetak2) setCalculatedPrintingCost2(r.ongkosCetak2)
    if (r.finishingCost) setCalculatedFinishingCost(r.finishingCost)
    saveToStorage({ formData: restoredForm, selectedFinishings: [], totalPaperPrice: r.totalPaperPrice || 0 })

    // Match paper, machine, finishing after data loaded
    setIsRestoring(true)
    if (r.paperName) window.__restorePaperName = r.paperName
    if (r.pricePerSheet) window.__restorePricePerSheet = r.pricePerSheet?.toString()
    if (r.machineName) window.__restoreMachineName = r.machineName
    if (r.machineName2) window.__restoreMachineName2 = r.machineName2
    if (r.finishingNames && r.finishingNames !== '-') window.__restoreFinishingNames = r.finishingNames

    toast.success('Data berhasil di-restore dari riwayat!')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDeleteRiwayat = async (id: string): Promise<boolean> => {
    if (!confirm('Beneran mau dihapus nih?')) return false
    try {
      // Retry sekali pada 500 (transien pooler/serverless) — aman karena
      // retry yang menghasilkan 404 akan di-self-heal di bawah.
      const doDelete = () => fetcher(`/api/riwayat-cetakan/${id}`, { method: 'DELETE', headers: getAuthHeaders() })
      let res = await doDelete()
      if (!res.ok && res.status === 500) {
        await new Promise((r) => setTimeout(r, 600))
        res = await doDelete()
      }
      if (res.ok) {
        toast.success('Riwayat berhasil dihapus')
        notifyDataChange('riwayat-cetakan')
        if (restoredRiwayatId === id) setRestoredRiwayatId(null)
        fetchRiwayatCetakan()
        return true
      }
      // 404 = data sudah tidak ada di server (daftar di layar kadaluarsa) —
      // bersihkan baris dari daftar agar tidak menggantung.
      if (res.status === 404) {
        setRiwayatCetakanList(prev => prev.filter(r => r.id !== id))
        toast.info('Data sudah tidak ada di server — daftar diperbarui')
        return true
      }
      let srv = ''
      try { srv = (await res.json())?.error || '' } catch {}
      toast.error(`Gagal menghapus riwayat (${res.status}${srv ? `: ${srv}` : ''})`)
      return false
    } catch { toast.error('Gagal menghapus riwayat (jaringan terputus)'); return false }
  }

  const handlePreviewRiwayat = (r: any) => {
    const qty = parseInt(r.quantity) || 0
    const hargaPerLembar = (parseInt(r.jumlahPesanan) || qty) > 0 ? (r.grandTotal || 0) / (parseInt(r.jumlahPesanan) || qty) : 0
    const previewData: PrintCalculation = {
      id: 'riwayat-preview',
      printName: r.printName || '-',
      paperLength: r.paperLength || '',
      paperWidth: r.paperWidth || '',
      cutWidth: r.cutWidth || '',
      cutHeight: r.cutHeight || '',
      quantity: r.quantity || '',
      warna: r.warna || '',
      warnaKhusus: r.warnaKhusus || '',
      paperId: '',
      paperName: r.paperName || '-',
      machineId: '',
      machineName: r.machineName || '-',
      printingCost: r.ongkosCetak || 0,
      finishingId: '',
      finishingName: r.finishingNames || '',
      packingCost: r.packingCost?.toString() || '0',
      shippingCost: r.shippingCost?.toString() || '0',
      pricePerSheet: r.pricePerSheet?.toString() || '0',
      hargaPlat: r.hargaPlat?.toString() || '0',
      totalPrice: r.grandTotal || 0,
      customerName: r.customerName || '',
      machineId2: '',
      machineName2: r.machineName2 || '',
      warna2: r.warna2 || '',
      warnaKhusus2: r.warnaKhusus2 || '',
      hargaPlat2: r.hargaPlat2?.toString() || '0',
      glueLengthCm: '',
      glueCostPerCm: '',
      glueBoronganPerSheet: r.glueBorongan && (parseInt(r.jumlahPesanan) || qty) > 0 ? Math.round(r.glueBorongan / (parseInt(r.jumlahPesanan) || qty)).toString() : '0',
      biayaLain1: r.otherCost?.toString() || '0',
      biayaLain2: r.otherCost2?.toString() || '0',
      totalPaperPrice: r.totalPaperPrice || 0,
      calculatedPrintingCost: r.ongkosCetak || 0,
      calculatedPrintingCost2: r.ongkosCetak2 || 0,
      calculatedFinishingCost: r.finishingCost || 0,
      calculatedGlueCost: r.glueCost || 0,
      calculatedGlueBoronganSheet: r.glueBorongan || 0,
      finishingBreakdown: r.finishingBreakdown ? r.finishingBreakdown.split(' | ').map(s => {
        const firstColonIdx = s.indexOf(': ')
        const name = firstColonIdx > -1 ? s.substring(0, firstColonIdx) : s
        const lastEqRp = s.lastIndexOf('= Rp ')
        const costStr = lastEqRp > -1 ? s.substring(lastEqRp + 5) : '0'
        const cost = parseFloat(costStr.replace(/[^\d-]/g, '')) || 0
        return { name, cost }
      }) : [],
      jumlahPesanan: r.jumlahPesanan?.toString() || '',
      berapaMata: r.berapaMata?.toString() || '',
      setelanKertas: r.setelanKertas?.toString() || '',
      glueLengthCm: r.glueLengthCm?.toString() || '',
      glueCostPerCm: r.glueCostPerCm?.toString() || '',
      paperGrammage: parseInt(r.paperGrammage) || 0,
      recordNumber: r.nomorUrut || '',
      recordDate: r.createdAt || '',
      profitPercent: r.profitPercent || 0,
      biayaLain1Label: r.otherCostLabel || 'Biaya Bikin Piso',
      biayaLain2Label: r.otherCostLabel2 || 'Biaya',
      photoUrl: r.photoUrl || ''
    }
    setPreviewCalc(previewData)
    setPreviewRiwayatRecord(r)
    setPreviewOpen(true)
  }


  // Summary values
  const summaryPacking = parseFloat(formData.packingCost) || 0
  const summaryShipping = parseFloat(formData.shippingCost) || 0
  const summaryBiayaLain1 = parseFloat(formData.biayaLain1) || 0
  const summaryBiayaLain2 = parseFloat(formData.biayaLain2) || 0
  const summaryGlueTotal = calculatedGlueCost + calculatedGlueBoronganSheet
  const summarySubTotal = paperPriceValue + calculatedPrintingCost + calculatedPrintingCost2 + calculatedFinishingCost + summaryPacking + summaryShipping + summaryBiayaLain1 + summaryBiayaLain2 + summaryGlueTotal
  const summaryProfitAmount = summarySubTotal * (profitPercent / 100)
  const summaryGrandTotal = summarySubTotal + summaryProfitAmount
  const summaryQuantity = parseInt(formData.quantity) || 0
  const summaryJumlahPesanan = parseInt(formData.jumlahPesanan) || 0
  const summaryHargaPerlembar = summaryJumlahPesanan > 0 ? summaryGrandTotal / summaryJumlahPesanan : 0
  const summaryHargaModal = summaryJumlahPesanan > 0 ? summarySubTotal / summaryJumlahPesanan : 0

  // ===== Simulasi Cepat — pakai semua parameter form saat ini, hanya jumlah pesanan & profit yang diganti =====
  const simJumlah = parseInt(simJumlahInput) || 0
  const simProfitVal = simProfitInput.trim() === '' ? profitPercent : (parseFloat(simProfitInput) || 0)

  // Hitung hasil simulasi utk kombinasi jumlah & profit tertentu (null = form belum bisa menghitung).
  // Dipakai hasil live sambil mengetik DAN setiap baris Tabel Simulasi.
  const computeSimulasi = useCallback((jumlah: number, profit: number) => {
    if (jumlah <= 0) return null
    const bm = parseInt(formData.berapaMata) || 0
    const qty = bm > 0 ? Math.ceil(jumlah / bm) : jumlah
    if (qty <= 0) return null
    // Kertas: hitung ulang dengan cutting engine (jumlah cetakan simulasi + insit)
    const pw = parseFloat(formData.paperLength) || 0
    const ph = parseFloat(formData.paperWidth) || 0
    const cw = parseFloat(formData.cutWidth) || 0
    const ch = parseFloat(formData.cutHeight) || 0
    const price = parseFloat(formData.pricePerSheet) || 0
    const totalQty = qty + (parseInt(formData.setelanKertas) || 0)
    let kertas = 0
    let sheetsNeeded = 0
    if (pw > 0 && ph > 0 && cw > 0 && ch > 0 && totalQty > 0 && price > 0) {
      try {
        const r = calculateCuts({ paperWidth: pw, paperHeight: ph, cutWidth: cw, cutHeight: ch, quantity: totalQty, pricePerSheet: price, optimizationMode: 'maximal', customerName: '', paperMaterial: '', grammage: 0 })
        kertas = r.totalPrice
        sheetsNeeded = r.sheetsNeeded
      } catch { kertas = price * qty }
    } else {
      kertas = price * qty
    }
    // Ongkos Cetak 1 (pakai minimum quantity mesin, sama seperti perhitungan utama)
    let ongkos1 = 0
    if (selectedMachine && qty > 0) {
      const warna = parseInt(formData.warna) || 0
      const wk = parseInt(formData.warnaKhusus) || 0
      ongkos1 = (selectedMachine.pricePerColor * warna) + (selectedMachine.specialColorPrice * wk)
      if (qty > selectedMachine.minimumPrintQuantity) ongkos1 += (qty - selectedMachine.minimumPrintQuantity) * selectedMachine.priceAboveMinimumPerSheet
      ongkos1 += (parseFloat(formData.hargaPlat) || 0) * (warna + wk)
    }
    // Ongkos Cetak 2
    let ongkos2 = 0
    if (selectedMachine2 && qty > 0) {
      const warna2 = parseInt(formData.warna2) || 0
      const wk2 = parseInt(formData.warnaKhusus2) || 0
      ongkos2 = (selectedMachine2.pricePerColor * warna2) + (selectedMachine2.specialColorPrice * wk2)
      if (qty > selectedMachine2.minimumPrintQuantity) ongkos2 += (qty - selectedMachine2.minimumPrintQuantity) * selectedMachine2.priceAboveMinimumPerSheet
      ongkos2 += (parseFloat(formData.hargaPlat2) || 0) * (warna2 + wk2)
    }
    // Finishing (qty simulasi)
    let finishing = 0
    for (const fin of selectedFinishingItems) finishing += getFinishingCost(fin, qty).cost
    // Ongkos Lem (mengikuti jumlah pesanan)
    const cmLem = parseFloat(formData.glueLengthCm) || 0
    const hargaPerCmLem = parseFloat(formData.glueCostPerCm) || 0
    const lem = cmLem > 0 && hargaPerCmLem > 0 ? cmLem * hargaPerCmLem * jumlah : 0
    const boronganPerSheet = parseFloat(formData.glueBoronganPerSheet) || 0
    const borongan = boronganPerSheet > 0 ? boronganPerSheet * jumlah : 0
    // Biaya tetap (packing, kirim, biaya lain tidak berubah)
    const packing = parseFloat(formData.packingCost) || 0
    const shipping = parseFloat(formData.shippingCost) || 0
    const bl1 = parseFloat(formData.biayaLain1) || 0
    const bl2 = parseFloat(formData.biayaLain2) || 0
    const subTotal = kertas + ongkos1 + ongkos2 + finishing + lem + borongan + packing + shipping + bl1 + bl2
    if (subTotal <= 0) return null
    const profitAmount = subTotal * (profit / 100)
    const grandTotal = subTotal + profitAmount
    const hargaPcs = grandTotal / jumlah
    const modalPcs = subTotal / jumlah
    return { sheetsNeeded, kertas, ongkos1, ongkos2, finishing, lem, borongan, subTotal, profitAmount, grandTotal, hargaPcs, modalPcs }
  }, [formData.paperLength, formData.paperWidth, formData.cutWidth, formData.cutHeight, formData.berapaMata, formData.setelanKertas, formData.pricePerSheet, formData.warna, formData.warnaKhusus, formData.hargaPlat, formData.warna2, formData.warnaKhusus2, formData.hargaPlat2, formData.glueLengthCm, formData.glueCostPerCm, formData.glueBoronganPerSheet, formData.packingCost, formData.shippingCost, formData.biayaLain1, formData.biayaLain2, selectedMachine, selectedMachine2, selectedFinishingItems])

  const simulasi = useMemo(() => computeSimulasi(simJumlah, simProfitVal), [computeSimulasi, simJumlah, simProfitVal])

  // Nilai live tiap baris tabel — dihitung ulang otomatis saat parameter form berubah
  const simRowValues = useMemo(() => {
    const map = new Map<number, NonNullable<ReturnType<typeof computeSimulasi>>>()
    for (const r of simRows) {
      const v = computeSimulasi(r.jumlah, r.profit)
      if (v) map.set(r.id, v)
    }
    return map
  }, [simRows, computeSimulasi])

  // Terapkan simulasi ke form utama (jumlah pesanan + jumlah cetakan + profit)
  const applySimulasiValues = (jumlah: number, profit: number) => {
    if (jumlah <= 0) { toast.error('Ketik jumlah pesanan simulasi terlebih dahulu'); return }
    const bm = parseInt(formData.berapaMata) || 0
    const qty = bm > 0 ? Math.ceil(jumlah / bm) : jumlah
    setFormData(prev => ({ ...prev, jumlahPesanan: String(jumlah), quantity: String(qty) }))
    handleProfitChange(profit)
    toast.success(`Simulasi diterapkan: ${jumlah.toLocaleString('id-ID')} pcs · profit ${profit}%`)
  }

  // ===== CRUD Tabel Simulasi =====
  // Create: tambahkan hasil simulasi yg sedang diketik sebagai baris baru
  const addSimulasiRow = () => {
    if (!simulasi || simJumlah <= 0) { toast.error('Ketik jumlah pesanan simulasi terlebih dahulu'); return }
    if (simRows.some(r => r.jumlah === simJumlah && r.profit === simProfitVal)) { toast.error('Simulasi dengan jumlah & profit ini sudah ada di tabel'); return }
    const row: SimRow = { id: Date.now(), jumlah: simJumlah, profit: simProfitVal, snap: { sheets: simulasi.sheetsNeeded, modal: simulasi.subTotal, modalPcs: simulasi.modalPcs, jual: simulasi.grandTotal, jualPcs: simulasi.hargaPcs } }
    setSimRows(prev => [row, ...prev].slice(0, 50))
    setSimJumlahInput('')
    requestAnimationFrame(() => simJumlahRef.current?.focus())
    toast.success(`Simulasi ${simJumlah.toLocaleString('id-ID')} pcs ditambahkan ke tabel`)
  }

  // Update: ubah jumlah & profit langsung di baris tabel
  const startEditSimulasi = (row: SimRow) => {
    setSimEditingId(row.id)
    setSimEditJumlah(String(row.jumlah))
    setSimEditProfit(String(row.profit))
  }

  const cancelEditSimulasi = () => {
    setSimEditingId(null)
    setSimEditJumlah('')
    setSimEditProfit('')
  }

  const saveEditSimulasi = () => {
    if (simEditingId === null) return
    const j = parseInt(simEditJumlah) || 0
    if (j <= 0) { toast.error('Jumlah pesanan harus lebih dari 0'); return }
    const p = simEditProfit.trim() === '' ? 0 : (parseFloat(simEditProfit) || 0)
    setSimRows(prev => prev.map(r => {
      if (r.id !== simEditingId) return r
      const v = computeSimulasi(j, p)
      return { ...r, jumlah: j, profit: p, snap: v ? { sheets: v.sheetsNeeded, modal: v.subTotal, modalPcs: v.modalPcs, jual: v.grandTotal, jualPcs: v.hargaPcs } : r.snap }
    }))
    cancelEditSimulasi()
    toast.success('Simulasi diperbarui')
  }

  // Delete
  const removeSimulasiRow = (id: number) => {
    setSimRows(prev => prev.filter(r => r.id !== id))
    if (simEditingId === id) cancelEditSimulasi()
    toast.success('Baris simulasi dihapus')
  }

  const clearSimulasiRows = () => {
    setSimRows([])
    cancelEditSimulasi()
    setSimConfirmClear(false)
    toast.success('Semua baris simulasi dihapus')
  }

  // Form validation: require essential fields before buttons can be used
  const isFormValid = !!(
    formData.printName.trim() &&
    formData.paperId &&
    formData.machineId &&
    formData.quantity &&
    parseInt(formData.quantity) > 0 &&
    formData.warna &&
    parseInt(formData.warna) > 0 &&
    (formData.cutWidth || formData.paperLength) &&
    (formData.cutHeight || formData.paperWidth)
  )

  // Grand total is 0 = no calculation yet
  const hasGrandTotal = summaryGrandTotal > 0

  // Payload barang yang dikirim ke Master Barang — dipakai juga untuk mendeteksi perubahan data (kunci tombol simpan)
  const itemSavePayload = JSON.stringify({
    name: formData.printName.trim(),
    standardPrice: Math.round(summaryHargaPerlembar),
    hpp: Math.round(summaryHargaModal),
    qty: summaryJumlahPesanan,
    keterangan: `Dari Hitung Cetakan · Total: Rp ${Math.round(summaryGrandTotal).toLocaleString('id-ID')} · Modal/pcs: Rp ${Math.round(summaryHargaModal).toLocaleString('id-ID')}`,
    customerId: (customers.find((c) => c.name.toLowerCase() === formData.customerName.trim().toLowerCase()) || { id: '' }).id,
    photoUrl,
  })
  const itemSaveLocked = savedItemSnapshot !== null && savedItemSnapshot === itemSavePayload

  // Check popup state
  const [checkOpen, setCheckOpen] = useState(false)

  const checkItems = [
    { label: 'Ongkos Cetak', filled: calculatedPrintingCost > 0 },
    { label: 'Ongkos Cetak 2', filled: !!formData.machineId2 },
    { label: 'Finishing', filled: selectedFinishingItems.length > 0 },
    { label: 'Ongkos Lem', filled: calculatedGlueCost > 0 },
    { label: 'Ongkos Lem Borongan', filled: calculatedGlueBoronganSheet > 0 },
    { label: 'Biaya Tambahan', filled: !!(formData.packingCost || formData.shippingCost || formData.biayaLain1 || formData.biayaLain2) },
    { label: 'Total Harga', filled: hasGrandTotal },
  ]

  const filledCount = checkItems.filter(i => i.filled).length

  const handleCheck = () => {
    setCheckOpen(true)
  }

  // Plat total helper
  const platTotal = (() => {
    const warna = parseInt(formData.warna) || 0
    const wk = parseInt(formData.warnaKhusus) || 0
    const plat = selectedMachine?.platePricePerSheet || 0
    return plat * (warna + wk)
  })()

  // Plat total helper 2
  const platTotal2 = (() => {
    const warna2 = parseInt(formData.warna2) || 0
    const wk2 = parseInt(formData.warnaKhusus2) || 0
    const plat2 = selectedMachine2?.platePricePerSheet || 0
    return plat2 * (warna2 + wk2)
  })()

  // Section header component
  const SectionHeader = ({ icon, label, badge }: { icon: React.ReactNode; label: React.ReactNode; badge?: number }) => (
    <div className="flex items-center gap-2 px-4 py-1.5 border-b border-slate-100 bg-slate-50/60">
      <div className="w-5 h-5 rounded-md bg-emerald-100 flex items-center justify-center">{icon}</div>
      <h2 className="text-[13px] font-bold text-slate-700 uppercase tracking-wide flex-1 min-w-0">{label}</h2>
      {badge !== undefined && badge > 0 && (
        <span className="text-[11px] font-semibold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded-full">{badge}</span>
      )}
    </div>
  )

  // Display value box
  const ValueBox = ({ label, value, gradient }: { label: string; value: string; gradient: string }) => (
    <div className="w-full h-[28px] flex items-center justify-between px-2.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg">
      <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400">{label}</span>
      <span className="text-[14px] font-bold text-black dark:text-white">{value}</span>
    </div>
  )

  const fmtNum = (n: number) => Math.round(n).toLocaleString('id-ID')
  const formatRp = (n: number) => `Rp ${fmtNum(n)}`
  // Harga per pcs: tampilkan 2 desimal bila < Rp1.000 (bisa jadi senilai puluhan/ratusan rupiah, bahkan < Rp1)
  const formatHargaPcs = (n: number) => `Rp ${n.toLocaleString('id-ID', { maximumFractionDigits: n > 0 && n < 1000 ? 2 : 0 })}`

  // Nilai tampilan per baris: live bila bisa dihitung, fallback ke snapshot saat disimpan
  const simRowQtyOf = (jumlah: number) => {
    const bm = parseInt(formData.berapaMata) || 0
    return bm > 0 ? Math.ceil(jumlah / bm) : jumlah
  }
  const simRowView = (row: SimRow) => {
    const live = simRowValues.get(row.id)
    return {
      qty: simRowQtyOf(row.jumlah),
      sheets: live ? live.sheetsNeeded : row.snap.sheets,
      modal: live ? live.subTotal : row.snap.modal,
      modalPcs: live ? live.modalPcs : row.snap.modalPcs,
      jual: live ? live.grandTotal : row.snap.jual,
      jualPcs: live ? live.hargaPcs : row.snap.jualPcs,
    }
  }
  const simThClass = 'h-7 px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 lg:h-8 lg:px-2.5 lg:text-[11px]'
  const simTdClass = 'px-1.5 py-1 text-[10.5px] lg:px-2.5 lg:py-1.5 lg:text-xs'
  const simEditInputClass = 'border border-blue-300 dark:border-blue-700 rounded px-1 py-0.5 text-[10.5px] lg:text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-1 focus:ring-blue-500'

  // ===== Kartu Simulasi Cepat — tabel CRUD perbandingan jumlah pesanan (dipakai di summary mobile & kolom desktop) =====
  const simulasiCard = (
    <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <SectionHeader icon={<Calculator className="w-3.5 h-3.5 text-cyan-600" />} label="Simulasi Cepat" badge={simRows.length} />
      <div className="px-2.5 py-2 space-y-1.5 lg:px-4 lg:py-3 lg:space-y-2.5">
        <p className="text-[10px] lg:text-xs leading-snug text-slate-500 dark:text-slate-400">
          Ketik jumlah pesanan (+ profit) lalu klik Tambah — bandingkan beberapa jumlah dalam tabel. Nilai mengikuti parameter form saat ini.
        </p>
        {/* Create: ketik jumlah + profit, tambahkan sebagai baris baru */}
        <div className="flex gap-1.5 items-end">
          <div className="flex-1 min-w-0">
            <label className={labelClass}>Jumlah Pesanan</label>
            <input
              ref={simJumlahRef}
              type="number"
              step="1"
              min="0"
              inputMode="numeric"
              placeholder={summaryJumlahPesanan > 0 ? summaryJumlahPesanan.toLocaleString('id-ID') : 'misal: 5000'}
              value={simJumlahInput}
              onChange={(e) => setSimJumlahInput(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="w-[76px] lg:w-32 flex-shrink-0">
            <label className={labelClass}>Profit (%)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              inputMode="decimal"
              placeholder={profitPercent > 0 ? profitPercent.toString() : '0'}
              value={simProfitInput}
              onChange={(e) => setSimProfitInput(e.target.value)}
              className={inputClass}
            />
          </div>
          <Button onClick={addSimulasiRow} disabled={!simulasi} title="Tambahkan ke tabel simulasi" className="h-[38px] lg:h-[34px] px-2.5 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-slate-300 dark:disabled:bg-zinc-700 flex-shrink-0"><Plus className="w-3.5 h-3.5 mr-0.5" /> Tambah</Button>
        </div>
        {/* Read: hasil live sambil mengetik + Terapkan langsung tanpa perlu tambah baris */}
        {simulasi ? (
          <div className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 px-2 py-1.5 flex items-center justify-between gap-2">
            <p className="text-[10px] lg:text-xs leading-snug min-w-0">
              <span className="text-slate-500 dark:text-slate-400">Modal </span>
              <span className="font-semibold text-slate-800 dark:text-slate-100">{formatRp(simulasi.subTotal)}</span>
              <span className="text-slate-400"> ({formatHargaPcs(simulasi.modalPcs)}/pcs)</span>
              {simProfitVal > 0 && <span className="font-semibold text-amber-700 dark:text-amber-400"> +{simProfitVal}%</span>}
              <span className="text-slate-500 dark:text-slate-400"> → Jual </span>
              <span className="font-bold text-emerald-700 dark:text-emerald-400">{formatRp(simulasi.grandTotal)}</span>
              <span className="text-slate-400"> ({formatHargaPcs(simulasi.hargaPcs)}/pcs)</span>
              {simulasi.sheetsNeeded > 0 && <span className="text-slate-400"> · {simulasi.sheetsNeeded.toLocaleString('id-ID')} lbr</span>}
            </p>
            <button onClick={() => applySimulasiValues(simJumlah, simProfitVal)} title="Terapkan ke form utama" className="flex-shrink-0 h-6 px-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Terapkan
            </button>
          </div>
        ) : simJumlah > 0 ? (
          <p className="text-[10px] lg:text-xs text-amber-600">Lengkapi data kertas/mesin di form agar simulasi bisa dihitung.</p>
        ) : null}
        {/* Tabel Simulasi (CRUD) */}
        {simRows.length > 0 ? (
          <div className="rounded-lg border border-slate-200 dark:border-zinc-700 overflow-hidden">
            <div className="flex items-center justify-between px-2 py-1 bg-slate-50 dark:bg-zinc-800 border-b border-slate-200 dark:border-zinc-700">
              <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Tabel Simulasi ({simRows.length})</p>
              <button onClick={() => setSimConfirmClear(true)} className="flex items-center gap-1 text-[10px] font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400"><Trash2 className="w-3 h-3" /> Hapus Semua</button>
            </div>
            <div className="max-h-64 lg:max-h-80 overflow-y-auto">
              <Table className="min-w-[560px] lg:min-w-0 text-[10.5px] lg:text-xs">
                <TableHeader className="sticky top-0 z-[1] bg-slate-50 dark:bg-zinc-800">
                  <TableRow className="hover:bg-transparent border-b border-slate-200 dark:border-zinc-700">
                    <TableHead className={`${simThClass} text-left`}>Jumlah</TableHead>
                    <TableHead className={`${simThClass} text-right`}>Profit</TableHead>
                    <TableHead className={`${simThClass} text-right`}>Cetak</TableHead>
                    <TableHead className={`${simThClass} text-right`}>Kertas</TableHead>
                    <TableHead className={`${simThClass} text-right`}>Modal</TableHead>
                    <TableHead className={`${simThClass} text-right`}>Modal/pcs</TableHead>
                    <TableHead className={`${simThClass} text-right`}>Harga Jual</TableHead>
                    <TableHead className={`${simThClass} text-right`}>Harga/pcs</TableHead>
                    <TableHead className={`${simThClass} text-center`}>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {simRows.map((row) => {
                    const isEditing = simEditingId === row.id
                    const editLive = isEditing ? computeSimulasi(parseInt(simEditJumlah) || 0, simEditProfit.trim() === '' ? 0 : (parseFloat(simEditProfit) || 0)) : null
                    const v = editLive ? { qty: simRowQtyOf(parseInt(simEditJumlah) || 0), sheets: editLive.sheetsNeeded, modal: editLive.subTotal, modalPcs: editLive.modalPcs, jual: editLive.grandTotal, jualPcs: editLive.hargaPcs } : simRowView(row)
                    return (
                      <TableRow key={row.id} className={isEditing ? 'bg-amber-50/70 dark:bg-amber-950/20 hover:bg-amber-50/70 dark:hover:bg-amber-950/20' : ''}>
                        <TableCell className={`${simTdClass} font-semibold text-slate-800 dark:text-slate-100`}>
                          {isEditing ? (
                            <input type="number" min="0" inputMode="numeric" value={simEditJumlah} onChange={(e) => setSimEditJumlah(e.target.value)} aria-label="Ubah jumlah pesanan" className={`w-16 ${simEditInputClass}`} />
                          ) : row.jumlah.toLocaleString('id-ID')}
                        </TableCell>
                        <TableCell className={`${simTdClass} text-right text-slate-600 dark:text-slate-300`}>
                          {isEditing ? (
                            <input type="number" step="0.1" min="0" max="100" inputMode="decimal" value={simEditProfit} onChange={(e) => setSimEditProfit(e.target.value)} aria-label="Ubah profit (%)" className={`w-12 ${simEditInputClass}`} />
                          ) : row.profit > 0 ? `${row.profit}%` : '–'}
                        </TableCell>
                        <TableCell className={`${simTdClass} text-right text-slate-600 dark:text-slate-300`}>{v.qty > 0 ? v.qty.toLocaleString('id-ID') : '–'}</TableCell>
                        <TableCell className={`${simTdClass} text-right text-slate-600 dark:text-slate-300`}>{v.sheets > 0 ? `${v.sheets.toLocaleString('id-ID')} lbr` : '–'}</TableCell>
                        <TableCell className={`${simTdClass} text-right text-slate-800 dark:text-slate-100`}>{v.modal > 0 ? formatRp(v.modal) : '–'}</TableCell>
                        <TableCell className={`${simTdClass} text-right text-slate-600 dark:text-slate-300`}>{v.modalPcs > 0 ? formatHargaPcs(v.modalPcs) : '–'}</TableCell>
                        <TableCell className={`${simTdClass} text-right font-bold text-emerald-700 dark:text-emerald-400`}>{v.jual > 0 ? formatRp(v.jual) : '–'}</TableCell>
                        <TableCell className={`${simTdClass} text-right text-emerald-700 dark:text-emerald-400`}>{v.jualPcs > 0 ? formatHargaPcs(v.jualPcs) : '–'}</TableCell>
                        <TableCell className={simTdClass}>
                          <div className="flex items-center justify-center gap-0.5">
                            {isEditing ? (
                              <>
                                <button onClick={saveEditSimulasi} title="Simpan perubahan" aria-label="Simpan perubahan" className="p-1 text-emerald-600 hover:text-emerald-800 dark:text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /></button>
                                <button onClick={cancelEditSimulasi} title="Batal" aria-label="Batal ubah" className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"><X className="w-3.5 h-3.5" /></button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => applySimulasiValues(row.jumlah, row.profit)} title="Terapkan ke form utama" aria-label="Terapkan ke form" className="p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400"><CheckCircle2 className="w-3.5 h-3.5" /></button>
                                <button onClick={() => startEditSimulasi(row)} title="Ubah jumlah/profit" aria-label="Ubah simulasi" className="p-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"><Pencil className="w-3 h-3" /></button>
                                <button onClick={() => removeSimulasiRow(row.id)} title="Hapus baris" aria-label="Hapus simulasi" className="p-1 text-slate-400 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <p className="px-2 py-1 text-[9px] text-slate-400 dark:text-slate-500 bg-slate-50/60 dark:bg-zinc-800/50 border-t border-slate-200 dark:border-zinc-700">Nilai dihitung ulang otomatis mengikuti parameter form · daftar tersimpan di perangkat ini.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 dark:border-zinc-700 px-3 py-2.5 text-center">
            <p className="text-[10px] leading-snug text-slate-400 dark:text-slate-500">Belum ada baris. Tambahkan beberapa jumlah pesanan (mis. 3.000 · 5.000 · 8.000) untuk membandingkan harga sekaligus.</p>
          </div>
        )}
      </div>
    </div>
  )

  // Dialog konfirmasi hapus semua baris simulasi (dirender sekali di root halaman)
  const simClearDialog = (
    <AlertDialog open={simConfirmClear} onOpenChange={setSimConfirmClear}>
      <AlertDialogContent className="max-w-xs rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">Hapus semua simulasi?</AlertDialogTitle>
          <AlertDialogDescription className="text-xs">{simRows.length} baris simulasi akan dihapus dari tabel. Tindakan ini tidak bisa dibatalkan.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-8 text-xs">Batal</AlertDialogCancel>
          <AlertDialogAction onClick={clearSimulasiRows} className="h-8 text-xs bg-rose-600 hover:bg-rose-700 text-white">Hapus Semua</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return (
    <DashboardLayout title={t('hitung_cetakan')} subtitle={t('subtitle_potong_kertas')}>
      {/* Tab Navigation */}
      <div className="sticky top-0 z-20 -mx-4 px-4 bg-card flex items-center gap-2 mb-3">
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
          {riwayatCetakanList.length > 0 && (
            <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === 'riwayat' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{riwayatCetakanList.length}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('gabung')}
          className={`px-4 py-1.5 text-sm font-semibold rounded-lg border transition-colors ${
            activeTab === 'gabung'
              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
              : 'bg-card text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
          }`}
        >
          Gabung
        </button>
      </div>

      {/* Editor Tab Content */}
      {activeTab === 'editor' && (
      <div>
        <div className="lg:grid lg:grid-cols-4 lg:gap-3">

          {/* ========== COLUMN 1: INFO & HARGA ========== */}
          <div className="flex-1 min-w-0">
            {/* No. Hitung Cetakan */}
            {nextHitungCetakanNumber && (
              <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl px-4 py-2.5 mb-3">
                <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">No. Hitung Cetakan</p>
                <p className="text-sm font-bold text-blue-700 dark:text-blue-300">{nextHitungCetakanNumber}</p>
              </div>
            )}
            <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

              {/* Section 1: Informasi Cetakan */}
              <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 bg-slate-50/60">
                <div className="w-6 h-6 rounded-md bg-blue-100 flex items-center justify-center"><Users className="w-3.5 h-3.5 text-blue-600" /></div>
                <h2 className="text-[13px] font-bold text-slate-700 uppercase tracking-wide">Informasi Cetakan</h2>
              </div>
              <div className="px-4 py-3">
                <div className="space-y-2">
                  <div>
                    <label className={labelClass}>{t('nama_customer')} <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <UserSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        list="customer-list"
                        placeholder={t('pilih_customer') + ' / ketik manual'}
                        value={formData.customerName}
                        onChange={(e) => {
                          const val = e.target.value
                          setFormData({ ...formData, customerName: val })
                          const match = customers.find((c) => c.name.toLowerCase() === val.toLowerCase())
                          if (match) {
                            setFormData(prev => ({ ...prev, customerName: match.name }))
                          }
                        }}
                        className={`${inputClass} pl-9`}
                      />
                      <datalist id="customer-list">
                        {customers.map((c) => (
                          <option key={c.id} value={c.name} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>{t('nama_cetakan')} <span className="text-red-500">*</span></label>
                    <input type="text" placeholder="Nama barang" value={formData.printName} onChange={(e) => setFormData({ ...formData, printName: e.target.value })} className={inputClass} />
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <div>
                      <label className={labelClass}>Jumlah Pesanan</label>
                      <input type="number" step="1" min="0" placeholder="0" value={formData.jumlahPesanan} onChange={(e) => {
                        const val = e.target.value
                        const bm = parseInt(formData.berapaMata) || 0
                        const jp = parseInt(val) || 0
                        setFormData(prev => ({
                          ...prev,
                          jumlahPesanan: val,
                          quantity: (jp > 0 && bm > 0) ? Math.ceil(jp / bm).toString() : prev.quantity
                        }))
                      }} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}><span className="md:hidden">Cetak Brp Mata</span><span className="hidden md:inline">Cetak Berapa Mata</span></label>
                      <input type="number" step="1" min="0" placeholder="0" value={formData.berapaMata} onChange={(e) => {
                        const val = e.target.value
                        const jp = parseInt(formData.jumlahPesanan) || 0
                        const bm = parseInt(val) || 0
                        setFormData(prev => ({
                          ...prev,
                          berapaMata: val,
                          quantity: (jp > 0 && bm > 0) ? Math.ceil(jp / bm).toString() : prev.quantity
                        }))
                      }} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Jumlah Cetakan <span className="text-red-500">*</span></label>
                      <input type="number" placeholder="Auto" value={formData.quantity} className={`${inputClass} bg-slate-100 cursor-not-allowed`} readOnly />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Harga Bahan */}
              <SectionHeader icon={<FileText className="w-3.5 h-3.5 text-teal-600" />} label={t('harga_bahan')} />
              <div className="px-3 py-2 lg:px-3 lg:py-2">
                <div className="space-y-1.5">
                  <div>
                    <label className={labelClass}>Nama Bahan <span className="text-red-500">*</span></label>
                    <select value={formData.paperId} onChange={(e) => setFormData({ ...formData, paperId: e.target.value })} className={selectClass}>
                      <option value="">Pilih bahan kertas</option>
                      {papers.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.grammage} gsm)</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Uk. Bahan (P×L cm)</label>
                    <div className="flex gap-1.5 items-center">
                      <input type="number" step="0.1" placeholder="P" value={formData.paperLength} onChange={(e) => setFormData({ ...formData, paperLength: e.target.value })} className={inputClass} />
                      <span className="text-slate-400 text-xs">×</span>
                      <input type="number" step="0.1" placeholder="L" value={formData.paperWidth} onChange={(e) => setFormData({ ...formData, paperWidth: e.target.value })} className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Uk. Potong (P×L cm)</label>
                    <div className="flex gap-1.5 items-center">
                      <input type="number" step="0.1" placeholder="P" value={formData.cutWidth} onChange={(e) => setFormData({ ...formData, cutWidth: e.target.value })} className={inputClass} />
                      <span className="text-slate-400 text-xs">×</span>
                      <input type="number" step="0.1" placeholder="L" value={formData.cutHeight} onChange={(e) => setFormData({ ...formData, cutHeight: e.target.value })} className={inputClass} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label className={labelClass}>Insit Kertas</label>
                      <input type="number" step="1" min="0" placeholder="0" value={formData.setelanKertas} onChange={(e) => setFormData({ ...formData, setelanKertas: e.target.value })} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Harga/Lembar</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                        <input type="number" step="0.01" min="0" placeholder="0" value={formData.pricePerSheet} onChange={(e) => setFormData({ ...formData, pricePerSheet: e.target.value })} className={`${inputClass} pl-9`} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Total Harga Kertas</label>
                    <ValueBox label={t('kertas')} value={paperPriceValue > 0 ? `Rp ${Math.round(paperPriceValue).toLocaleString('id-ID')}` : 'Rp 0'} gradient="bg-gradient-to-r from-teal-50 to-emerald-50 border-teal-200" />
                  </div>
                </div>
              </div>

              {/* Mobile-only: Foto Lampiran — di atas kotak Ongkos Cetak */}
              <div className="px-3 pb-2 lg:hidden">
                <PhotoUpload value={photoUrl} onChange={setPhotoUrl} label="Foto Lampiran" />
              </div>

              {/* Mobile-only: Ongkos Cetak + Ongkos Cetak 2 (desktop has its own column) */}
              <div className="lg:hidden">
              {/* Section 3: Ongkos Cetak */}
              <SectionHeader icon={<Calculator className="w-3.5 h-3.5 text-purple-600" />} label={t('ongkos_cetak_label')} />
              <div className="px-3 py-3 lg:p-4">
                <div className="grid grid-cols-2 gap-2.5 lg:gap-3">
                  <div>
                    <label className={labelClass}>{t('nama_mesin')} <span className="text-red-500">*</span></label>
                    <select value={formData.machineId} onChange={(e) => setFormData({ ...formData, machineId: e.target.value })} className={selectClass}>
                      <option value="">Pilih mesin</option>
                      {printingCosts.map((m) => <option key={m.id} value={m.id}>{m.machineName}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Warna <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <Palette className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input type="number" min="1" placeholder="4" value={formData.warna} onChange={(e) => setFormData({ ...formData, warna: e.target.value })} className={`${inputClass} pl-9`} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Warna Khusus</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-500">★</span>
                      <input type="number" min="0" placeholder="0" value={formData.warnaKhusus} onChange={(e) => setFormData({ ...formData, warnaKhusus: e.target.value })} className={`${inputClass} pl-9`} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>{t('harga_plat')}</label>
                    <ValueBox label="Plat" value={platTotal > 0 ? `Rp ${Math.round(platTotal).toLocaleString('id-ID')}` : 'Rp 0'} gradient="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200" />
                  </div>
                  <div className="col-span-2">
                    <label className={labelClass}>Total Ongkos</label>
                    <ValueBox label={t('ongkos_cetak_label')} value={calculatedPrintingCost > 0 ? `Rp ${Math.round(calculatedPrintingCost).toLocaleString('id-ID')}` : 'Rp 0'} gradient="bg-gradient-to-r from-purple-50 to-violet-50 border-purple-200" />
                  </div>
              </div>
              </div>

              {/* Section 4: Ongkos Cetak 2 */}
              <SectionHeader icon={<Calculator className="w-3.5 h-3.5 text-fuchsia-600" />} label="Ongkos Cetak 2" />
              <div className="px-3 py-3 lg:p-4">
                <div className="grid grid-cols-2 gap-2.5 lg:gap-3">
                  <div>
                    <label className={labelClass}>{t('nama_mesin')}</label>
                    <select value={formData.machineId2} onChange={(e) => setFormData({ ...formData, machineId2: e.target.value })} className={selectClass}>
                      <option value="">Pilih mesin</option>
                      {printingCosts.map((m) => <option key={m.id} value={m.id}>{m.machineName}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Warna</label>
                    <div className="relative">
                      <Palette className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input type="number" min="1" placeholder="4" value={formData.warna2} onChange={(e) => setFormData({ ...formData, warna2: e.target.value })} className={`${inputClass} pl-9`} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Warna Khusus</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-500">★</span>
                      <input type="number" min="0" placeholder="0" value={formData.warnaKhusus2} onChange={(e) => setFormData({ ...formData, warnaKhusus2: e.target.value })} className={`${inputClass} pl-9`} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>{t('harga_plat')}</label>
                    <ValueBox label="Plat 2" value={platTotal2 > 0 ? `Rp ${Math.round(platTotal2).toLocaleString('id-ID')}` : 'Rp 0'} gradient="bg-gradient-to-r from-fuchsia-50 to-pink-50 border-fuchsia-200" />
                  </div>
                  <div className="col-span-2">
                    <label className={labelClass}>Total Ongkos 2</label>
                    <ValueBox label="Ongkos Cetak 2" value={calculatedPrintingCost2 > 0 ? `Rp ${Math.round(calculatedPrintingCost2).toLocaleString('id-ID')}` : 'Rp 0'} gradient="bg-gradient-to-r from-fuchsia-50 to-violet-50 border-fuchsia-200" />
                  </div>
              </div>
              </div>
              </div>{/* end mobile-only ongkos cetak */}

              {/* Mobile-only: Finishing, Ongkos Lem, Ongkos Lem Borongan, Biaya Tambahan, Summary, Buttons */}
              <div className="lg:hidden">
              {/* Mobile Finishing */}
              <div>
                <SectionHeader icon={<Layers className="w-3.5 h-3.5 text-rose-600" />} label={t('finishing_label')} badge={selectedFinishingItems.length} />
                <div className="px-3 py-3">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <select id="finishing-select" className={selectClass} defaultValue="">
                        <option value="">-- Pilih finishing --</option>
                        {finishings.filter(f => !selectedFinishings.includes(f.id)).map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </div>
                    <Button onClick={() => {
                      const s = document.getElementById('finishing-select') as HTMLSelectElement
                      if (s && s.value) { handleAddFinishing(s.value); s.value = '' }
                      else toast.error('Pilih finishing terlebih dahulu')
                    }} className="h-[34px] px-3 bg-rose-600 hover:bg-rose-700 text-white text-xs" size="sm">
                      <Plus className="w-3.5 h-3.5 mr-1" /> Tambah
                    </Button>
                  </div>
                  {selectedFinishingItems.length > 0 && (
                    <div className="mt-3 space-y-2.5">
                      {selectedFinishingItems.map((fin) => {
                        const finCost = getFinishingCost(fin)
                        return (
                          <div key={fin.id} className="flex items-center gap-3 p-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg">
                            <div className="w-8 h-8 rounded bg-slate-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0"><Layers className="w-4 h-4 text-slate-600 dark:text-slate-400" /></div>
                            <div className="flex-1 min-w-0">
                              <p className="text-base font-bold text-black dark:text-white">{fin.name}</p>
                              {finCost.cost > 0 && <p className="text-sm text-black dark:text-white font-bold">Rp {Math.round(finCost.cost).toLocaleString('id-ID')}</p>}
                            </div>
                            <button onClick={() => handleRemoveFinishing(fin.id)} className="w-7 h-7 rounded bg-white border border-rose-200 hover:bg-rose-100 flex items-center justify-center flex-shrink-0"><X className="w-4 h-4 text-rose-500" /></button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <div className="mt-3">
                    <ValueBox label={`Total Finishing (${selectedFinishingItems.length} item)`} value={calculatedFinishingCost > 0 ? `Rp ${Math.round(calculatedFinishingCost).toLocaleString('id-ID')}` : 'Rp 0'} gradient="bg-gradient-to-r from-rose-50 to-pink-50 border-rose-200" />
                  </div>
                </div>
              </div>


              {/* Ongkos Lem */}
              <SectionHeader icon={<Package className="w-3.5 h-3.5 text-cyan-600" />} label="Ongkos Lem" />
              <div className="px-3 py-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Berapa Cm</label>
                    <div className="relative">
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">cm</span>
                      <input type="number" step="0.1" placeholder="0" value={formData.glueLengthCm} onChange={(e) => setFormData({ ...formData, glueLengthCm: e.target.value })} className={`${inputClass} pr-9`} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Harga Lem per cm</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                      <input type="number" step="0.01" placeholder="0" value={formData.glueCostPerCm} onChange={(e) => setFormData({ ...formData, glueCostPerCm: e.target.value })} className={`${inputClass} pl-9`} />
                    </div>
                  </div>
                </div>
                <div className="mt-2">
                  <label className={labelClass}>Total Lem</label>
                  <ValueBox label="Ongkos Lem" value={calculatedGlueCost > 0 ? `Rp ${Math.round(calculatedGlueCost).toLocaleString('id-ID')}` : 'Rp 0'} gradient="bg-gradient-to-r from-cyan-50 to-teal-50 border-cyan-200" />
                </div>
              </div>

              {/* Ongkos Lem Borongan moved to right column (desktop) */}
              {/* Mobile-only Ongkos Lem Borongan */}
              <div className="lg:hidden">
                <SectionHeader icon={<Package className="w-3.5 h-3.5 text-indigo-600" />} label="Ongkos Lem Borongan" />
                <div className="px-3 py-3">
                  <div>
                    <label className={labelClass}>Harga Lem per Lembar</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                      <input type="number" step="0.01" placeholder="0" value={formData.glueBoronganPerSheet} onChange={(e) => setFormData({ ...formData, glueBoronganPerSheet: e.target.value })} className={`${inputClass} pl-9`} />
                    </div>
                  </div>
                  <div className="mt-2">
                    <label className={labelClass}>Total Borongan</label>
                    <ValueBox label="Lem Borongan" value={calculatedGlueBoronganSheet > 0 ? `Rp ${Math.round(calculatedGlueBoronganSheet).toLocaleString('id-ID')}` : 'Rp 0'} gradient="bg-gradient-to-r from-indigo-50 to-violet-50 border-indigo-200" />
                  </div>
                </div>
              </div>

              {/* Biaya Tambahan moved to right column (desktop) */}
              {/* Mobile-only Biaya Tambahan */}
              <div className="lg:hidden">
                <SectionHeader icon={<Banknote className="w-3.5 h-3.5 text-amber-600" />} label="Biaya Tambahan" />
                <div className="px-2 py-1">
                  <div className="grid grid-cols-2 gap-1">
                    <div>
                      <label className={labelClass}>{t('ongkos_packing')}</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                        <input type="number" placeholder="0" value={formData.packingCost} onChange={(e) => setFormData({ ...formData, packingCost: e.target.value })} className={`${inputClass} pl-9`} />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>{t('ongkos_kirim')}</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                        <input type="number" placeholder="0" value={formData.shippingCost} onChange={(e) => setFormData({ ...formData, shippingCost: e.target.value })} className={`${inputClass} pl-9`} />
                      </div>
                    </div>
                    <div>
                      <input type="text" value={biayaLain1Label} onChange={(e) => setBiayaLain1Label(e.target.value)} className="w-full border border-slate-200 rounded-md px-2 py-0.5 text-[10px] text-slate-600 mb-1 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                        <input type="number" placeholder="0" value={formData.biayaLain1} onChange={(e) => setFormData({ ...formData, biayaLain1: e.target.value })} className={`${inputClass} pl-9`} />
                      </div>
                    </div>
                    <div>
                      <input type="text" value={biayaLain2Label} onChange={(e) => setBiayaLain2Label(e.target.value)} className="w-full border border-slate-200 rounded-md px-2 py-0.5 text-[10px] text-slate-600 mb-1 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                        <input type="number" placeholder="0" value={formData.biayaLain2} onChange={(e) => setFormData({ ...formData, biayaLain2: e.target.value })} className={`${inputClass} pl-9`} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mobile-only: Summary + Buttons */}
              <div className="lg:hidden mx-3 mb-3 space-y-2">
                <div className="p-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Sub Total</span>
                    <span className="text-base font-bold text-black dark:text-white">Rp {Math.round(summarySubTotal).toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between items-center mt-1 pt-1 border-t border-slate-200 dark:border-zinc-700">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Harga Modal</span>
                    <span className="text-sm font-semibold text-black dark:text-white">Rp {Math.round(summaryHargaModal).toLocaleString('id-ID')}</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5"><Percent className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" /><span className="text-xs font-medium text-black dark:text-white">Profit</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      placeholder="0"
                      value={profitInput}
                      onChange={(e) => {
                        const raw = e.target.value
                        if (raw === '' || raw === '-') {
                          setProfitPercent(0)
                          setProfitInput('')
                          return
                        }
                        const val = parseFloat(raw)
                        if (!isNaN(val) && val >= 0 && val <= 100) {
                          setProfitPercent(val)
                          setProfitInput(raw)
                        }
                      }}
                      onBlur={() => {
                        const finalVal = profitPercent
                        setProfitInput(finalVal === 0 ? '' : finalVal.toString())
                        handleProfitChange(finalVal)
                      }}
                      className={`w-14 text-xs font-bold text-center border rounded px-1 py-0.5 ${summaryProfitAmount > 0 ? 'bg-amber-100 border-amber-300 text-amber-800 focus:ring-1 focus:ring-amber-400' : 'bg-white border-slate-300 text-slate-700 focus:ring-1 focus:ring-slate-400'} focus:outline-none`}
                    />
                    <span className={`text-xs font-medium ${summaryProfitAmount > 0 ? 'text-amber-800' : 'text-slate-700'}`}>%</span>
                    </div>
                    <span className={`text-xs font-bold ${summaryProfitAmount > 0 ? 'text-amber-700' : 'text-slate-700'}`}>Rp {Math.round(summaryProfitAmount).toLocaleString('id-ID')}</span>
                  </div>
                </div>
                <div className={`p-3 rounded-xl ${hasGrandTotal ? 'bg-gradient-to-r from-emerald-600 to-teal-600' : 'bg-slate-300'}`}>
                  <div className="flex justify-between items-center">
                    <span className={`text-xs font-semibold ${hasGrandTotal ? 'text-white' : 'text-slate-500'}`}>Total Hitung Cetakan</span>
                    <span className={`text-[26px] font-semibold ${hasGrandTotal ? 'text-white' : 'text-slate-500'}`}>Rp {Math.round(summaryGrandTotal).toLocaleString('id-ID')}</span>
                  </div>
                  <div className={`flex justify-between items-center mt-1.5 pt-1.5 border-t ${hasGrandTotal ? 'border-white/30' : 'border-slate-400/50'}`}>
                    <span className={`text-xs font-medium ${hasGrandTotal ? 'text-emerald-100' : 'text-slate-600'}`}>Harga Jual per Pcs</span>
                    <span className={`text-[23px] font-semibold ${hasGrandTotal ? 'text-white' : 'text-slate-600'}`}>Rp {summaryHargaPerlembar.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
                {/* Perincian Harga Total - Terpisah */}
                <div className="px-1 pt-1 space-y-0.5">
                  <div className="flex justify-between text-xs"><span className="text-slate-800">Kertas</span><span className="text-slate-800 font-medium">{paperPriceValue > 0 ? formatRp(paperPriceValue) : '-'}</span></div>
                  {calculatedPrintingCost > 0 && <div className="flex justify-between text-xs"><span className="text-slate-800">Ongkos Cetak</span><span className="text-slate-800 font-medium">{formatRp(calculatedPrintingCost)}</span></div>}
                  {calculatedPrintingCost2 > 0 && <div className="flex justify-between text-xs"><span className="text-slate-800">Ongkos Cetak 2</span><span className="text-slate-800 font-medium">{formatRp(calculatedPrintingCost2)}</span></div>}
                  {selectedFinishingItems.map((fin) => { const { cost } = getFinishingCost(fin); return cost > 0 ? <div key={fin.id} className="flex justify-between text-xs"><span className="text-slate-800">{fin.name}</span><span className="text-slate-800 font-medium">{formatRp(cost)}</span></div> : null })}
                  {summaryPacking > 0 && <div className="flex justify-between text-xs"><span className="text-slate-800">Packing</span><span className="text-slate-800 font-medium">{formatRp(summaryPacking)}</span></div>}
                  {summaryShipping > 0 && <div className="flex justify-between text-xs"><span className="text-slate-800">Kirim</span><span className="text-slate-800 font-medium">{formatRp(summaryShipping)}</span></div>}
                  {calculatedGlueCost > 0 && <div className="flex justify-between text-xs"><span className="text-slate-800">Ongkos Lem</span><span className="text-slate-800 font-medium">{formatRp(calculatedGlueCost)}</span></div>}
                  {calculatedGlueBoronganSheet > 0 && <div className="flex justify-between text-xs"><span className="text-slate-800">Lem Borongan</span><span className="text-slate-800 font-medium">{formatRp(calculatedGlueBoronganSheet)}</span></div>}
                  {summaryBiayaLain1 > 0 && <div className="flex justify-between text-xs"><span className="text-slate-800">{biayaLain1Label}</span><span className="text-slate-800 font-medium">{formatRp(summaryBiayaLain1)}</span></div>}
                  {summaryBiayaLain2 > 0 && <div className="flex justify-between text-xs"><span className="text-slate-800">{biayaLain2Label}</span><span className="text-slate-800 font-medium">{formatRp(summaryBiayaLain2)}</span></div>}
                </div>
              </div>
              <div className="lg:hidden px-3 pb-3 flex flex-col sm:flex-row gap-2">
                <Button onClick={handleCheck} className="flex-1 h-10 text-sm bg-cyan-600 hover:bg-cyan-700 text-white"><ClipboardCheck className="w-4 h-4 mr-1.5" /> Cek</Button>
                <Button onClick={restoredRiwayatId ? handleUpdateRiwayat : handleSaveRiwayat} disabled={!hasGrandTotal || savingRiwayat} className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-sm">{restoredRiwayatId ? <><RefreshCw className={`w-4 h-4 mr-1.5 ${savingRiwayat ? 'animate-spin' : ''}`} /> {savingRiwayat ? 'Updating...' : 'Update Riwayat'}</> : savingRiwayat ? 'Menyimpan...' : 'Simpan Riwayat'}</Button>
                <Button onClick={handleInvoice} disabled={!hasGrandTotal || savingRiwayat} className="flex-1 h-10 text-sm bg-orange-600 hover:bg-orange-700 text-white disabled:bg-slate-400"><FileSpreadsheet className="w-4 h-4 mr-1.5" /> Invoice</Button>
                <Button onClick={handlePreview} disabled={!hasGrandTotal} className="flex-1 h-10 text-sm bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-400"><Eye className="w-4 h-4 mr-1.5" /> Preview</Button>
                <Button onClick={handleWhatsApp} disabled={!hasGrandTotal} className="flex-1 h-10 text-sm bg-green-600 hover:bg-green-700 text-white disabled:bg-slate-400"><MessageCircle className="w-4 h-4 mr-1.5" /> WhatsApp</Button>
                <Button onClick={resetForm} variant="outline" className="flex-1 h-10 text-sm"><RotateCcw className="w-4 h-4 mr-1.5" /> Reset</Button>
              </div>
              <div className="lg:hidden px-3 pb-3">
                <Button onClick={handleSaveToMaster} disabled={!hasGrandTotal || savingItem || itemSaveLocked} title={itemSaveLocked ? 'Sudah tersimpan — ubah data untuk bisa menyimpan lagi' : undefined} className="w-full h-10 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white disabled:bg-slate-400"><Package className="w-4 h-4 mr-1.5" /> {itemSaveLocked ? 'Sudah Tersimpan di Master' : savingItem ? 'Menyimpan...' : 'Simpan ke Master Barang'}</Button>
              </div>
              {/* Simulasi Cepat (mobile): dipindah ke bawah tombol Simpan ke Master Barang */}
              {simulasiCard}
              </div>{/* end mobile-only wrapper */}
            </div>{/* end column 1 card */}
          </div>{/* end COLUMN 1 */}

          {/* ========== COLUMN 2: ONGKOS CETAK (Desktop Only) ========== */}
          <div className="hidden lg:flex flex-col flex-1 flex-shrink-0 gap-3">
            {/* Foto Lampiran — di atas kotak Ongkos Cetak */}
            <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-2.5 py-2.5">
                <PhotoUpload value={photoUrl} onChange={setPhotoUrl} label="Foto Lampiran" />
              </div>
            </div>
            <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              {/* Ongkos Cetak */}
              <SectionHeader icon={<Calculator className="w-3.5 h-3.5 text-purple-600" />} label={t('ongkos_cetak_label')} />
              <div className="px-2.5 py-2">
                <div className="grid grid-cols-1 gap-1">
                  <div>
                    <label className={labelClass}>{t('nama_mesin')} <span className="text-red-500">*</span></label>
                    <select value={formData.machineId} onChange={(e) => setFormData({ ...formData, machineId: e.target.value })} className={selectClass}>
                      <option value="">Pilih mesin</option>
                      {printingCosts.map((m) => <option key={m.id} value={m.id}>{m.machineName}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <div>
                      <label className={labelClass}>Warna <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <Palette className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input type="number" min="1" placeholder="4" value={formData.warna} onChange={(e) => setFormData({ ...formData, warna: e.target.value })} className={`${inputClass} pl-9`} />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Warna Khusus</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-500">★</span>
                        <input type="number" min="0" placeholder="0" value={formData.warnaKhusus} onChange={(e) => setFormData({ ...formData, warnaKhusus: e.target.value })} className={`${inputClass} pl-9`} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>{t('harga_plat')}</label>
                    <ValueBox label="Plat" value={platTotal > 0 ? `Rp ${Math.round(platTotal).toLocaleString('id-ID')}` : 'Rp 0'} gradient="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200" />
                  </div>
                  <div>
                    <label className={labelClass}>Total Ongkos</label>
                    <ValueBox label={t('ongkos_cetak_label')} value={calculatedPrintingCost > 0 ? `Rp ${Math.round(calculatedPrintingCost).toLocaleString('id-ID')}` : 'Rp 0'} gradient="bg-gradient-to-r from-purple-50 to-violet-50 border-purple-200" />
                  </div>
                </div>
              </div>

              {/* Ongkos Cetak 2 */}
              <SectionHeader icon={<Calculator className="w-3.5 h-3.5 text-fuchsia-600" />} label="Ongkos Cetak 2" />
              <div className="px-2.5 py-2">
                <div className="grid grid-cols-1 gap-1">
                  <div>
                    <label className={labelClass}>{t('nama_mesin')}</label>
                    <select value={formData.machineId2} onChange={(e) => setFormData({ ...formData, machineId2: e.target.value })} className={selectClass}>
                      <option value="">Pilih mesin</option>
                      {printingCosts.map((m) => <option key={m.id} value={m.id}>{m.machineName}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <div>
                      <label className={labelClass}>Warna</label>
                      <div className="relative">
                        <Palette className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input type="number" min="1" placeholder="4" value={formData.warna2} onChange={(e) => setFormData({ ...formData, warna2: e.target.value })} className={`${inputClass} pl-9`} />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Warna Khusus</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-500">★</span>
                        <input type="number" min="0" placeholder="0" value={formData.warnaKhusus2} onChange={(e) => setFormData({ ...formData, warnaKhusus2: e.target.value })} className={`${inputClass} pl-9`} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>{t('harga_plat')}</label>
                    <ValueBox label="Plat 2" value={platTotal2 > 0 ? `Rp ${Math.round(platTotal2).toLocaleString('id-ID')}` : 'Rp 0'} gradient="bg-gradient-to-r from-fuchsia-50 to-pink-50 border-fuchsia-200" />
                  </div>
                  <div>
                    <label className={labelClass}>Total Ongkos 2</label>
                    <ValueBox label="Ongkos Cetak 2" value={calculatedPrintingCost2 > 0 ? `Rp ${Math.round(calculatedPrintingCost2).toLocaleString('id-ID')}` : 'Rp 0'} gradient="bg-gradient-to-r from-fuchsia-50 to-violet-50 border-fuchsia-200" />
                  </div>
                </div>
              </div>
            </div>
          </div>{/* end COLUMN 2 */}

          {/* ========== COLUMN 3: FINISHING & ONGKOS LEM (Desktop Only) ========== */}
          <div className="hidden lg:flex flex-col flex-1 flex-shrink-0 gap-3">
            <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              {/* Desktop Finishing */}
              <SectionHeader icon={<Layers className="w-3.5 h-3.5 text-rose-600" />} label={t('finishing_label')} badge={selectedFinishingItems.length} />
              <div className="px-2.5 py-2 space-y-2">
                <div className="flex gap-1.5">
                  <select id="finishing-select-desktop" className={selectClass} defaultValue="">
                    <option value="">-- Pilih finishing --</option>
                    {finishings.filter(f => !selectedFinishings.includes(f.id)).map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                  <Button onClick={() => {
                    const s = document.getElementById('finishing-select-desktop') as HTMLSelectElement
                    if (s && s.value) { handleAddFinishing(s.value); s.value = '' }
                    else toast.error('Pilih finishing terlebih dahulu')
                  }} className="h-[30px] px-2.5 bg-rose-600 hover:bg-rose-700 text-white text-[11px]" size="sm">
                    <Plus className="w-3 h-3 mr-0.5" /> Tambah
                  </Button>
                </div>
                {selectedFinishingItems.length > 0 && (
                  <div className="space-y-1.5">
                    {selectedFinishingItems.map((fin) => {
                      const finCost = getFinishingCost(fin)
                      return (
                        <div key={fin.id} className="flex items-center gap-2 p-2 bg-rose-50/80 border border-rose-200 rounded-lg">
                          <div className="w-6 h-6 rounded bg-rose-100 flex items-center justify-center flex-shrink-0"><Layers className="w-3 h-3 text-rose-600" /></div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800">{fin.name}</p>
                            {finCost.cost > 0 && <p className="text-xs text-rose-600 font-bold">Rp {Math.round(finCost.cost).toLocaleString('id-ID')}</p>}
                          </div>
                          <button onClick={() => handleRemoveFinishing(fin.id)} className="w-6 h-6 rounded bg-white border border-rose-200 hover:bg-rose-100 flex items-center justify-center flex-shrink-0"><X className="w-3.5 h-3.5 text-rose-500" /></button>
                        </div>
                      )
                    })}
                  </div>
                )}
                <ValueBox label={`Total Finishing (${selectedFinishingItems.length} item)`} value={calculatedFinishingCost > 0 ? `Rp ${Math.round(calculatedFinishingCost).toLocaleString('id-ID')}` : 'Rp 0'} gradient="bg-gradient-to-r from-rose-50 to-pink-50 border-rose-200" />
              </div>


              {/* Ongkos Lem */}
              <SectionHeader icon={<Package className="w-3.5 h-3.5 text-cyan-600" />} label="Ongkos Lem" />
              <div className="px-2.5 py-2">
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className={labelClass}>Berapa Cm</label>
                    <div className="relative">
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">cm</span>
                      <input type="number" step="0.1" placeholder="0" value={formData.glueLengthCm} onChange={(e) => setFormData({ ...formData, glueLengthCm: e.target.value })} className={`${inputClass} pr-9`} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Harga/cm</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                      <input type="number" step="0.01" placeholder="0" value={formData.glueCostPerCm} onChange={(e) => setFormData({ ...formData, glueCostPerCm: e.target.value })} className={`${inputClass} pl-9`} />
                    </div>
                  </div>
                </div>
                <div className="mt-1.5">
                  <ValueBox label="Ongkos Lem" value={calculatedGlueCost > 0 ? `Rp ${Math.round(calculatedGlueCost).toLocaleString('id-ID')}` : 'Rp 0'} gradient="bg-gradient-to-r from-cyan-50 to-teal-50 border-cyan-200" />
                </div>
              </div>

              {/* Ongkos Lem Borongan */}
              <SectionHeader icon={<Package className="w-3.5 h-3.5 text-indigo-600" />} label="Ongkos Lem Borongan" />
              <div className="px-2.5 py-2">
                <div>
                  <label className={labelClass}>Harga/Lembar</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                    <input type="number" step="0.01" placeholder="0" value={formData.glueBoronganPerSheet} onChange={(e) => setFormData({ ...formData, glueBoronganPerSheet: e.target.value })} className={`${inputClass} pl-9`} />
                  </div>
                </div>
                <div className="mt-1.5">
                  <ValueBox label="Lem Borongan" value={calculatedGlueBoronganSheet > 0 ? `Rp ${Math.round(calculatedGlueBoronganSheet).toLocaleString('id-ID')}` : 'Rp 0'} gradient="bg-gradient-to-r from-indigo-50 to-violet-50 border-indigo-200" />
                </div>
              </div>

            </div>
          </div>{/* end COLUMN 3 */}

          {/* ========== COLUMN 4: BIAYA TAMBAHAN, SUMMARY & DAFTAR (Desktop Only) ========== */}
          <div className="hidden lg:flex flex-col flex-1 flex-shrink-0 gap-1">
            {/* Biaya Tambahan Card */}
            <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <SectionHeader icon={<Banknote className="w-3.5 h-3.5 text-amber-600" />} label="Biaya Tambahan" />
              <div className="px-2.5 py-2">
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className={labelClass}>{t('ongkos_packing')}</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                      <input type="number" placeholder="0" value={formData.packingCost} onChange={(e) => setFormData({ ...formData, packingCost: e.target.value })} className={`${inputClass} pl-9`} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>{t('ongkos_kirim')}</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                      <input type="number" placeholder="0" value={formData.shippingCost} onChange={(e) => setFormData({ ...formData, shippingCost: e.target.value })} className={`${inputClass} pl-9`} />
                    </div>
                  </div>
                  <div>
                    <input type="text" value={biayaLain1Label} onChange={(e) => setBiayaLain1Label(e.target.value)} className="w-full border border-slate-200 rounded-md px-2 py-0.5 text-[10px] text-slate-600 mb-1 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                      <input type="number" placeholder="0" value={formData.biayaLain1} onChange={(e) => setFormData({ ...formData, biayaLain1: e.target.value })} className={`${inputClass} pl-9`} />
                    </div>
                  </div>
                  <div>
                    <input type="text" value={biayaLain2Label} onChange={(e) => setBiayaLain2Label(e.target.value)} className="w-full border border-slate-200 rounded-md px-2 py-0.5 text-[10px] text-slate-600 mb-1 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                      <input type="number" placeholder="0" value={formData.biayaLain2} onChange={(e) => setFormData({ ...formData, biayaLain2: e.target.value })} className={`${inputClass} pl-9`} />
                    </div>
                  </div>

                </div>
              </div>
            </div>

            {/* Summary Card */}
            <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col">
              <div className="px-2.5 py-2 space-y-1.5">
                <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-[12px] font-medium text-slate-600">Sub Total</span>
                    <span className="text-sm font-bold text-slate-700">Rp {Math.round(summarySubTotal).toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between items-center mt-0.5 pt-0.5 border-t border-slate-200">
                    <span className="text-[11px] font-medium text-slate-600">Harga Modal</span>
                    <span className="text-[12px] font-semibold text-slate-700">Rp {Math.round(summaryHargaModal).toLocaleString('id-ID')}</span>
                  </div>
                </div>
                <div className={`p-1.5 rounded-lg ${summaryProfitAmount > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-slate-100 border border-slate-200'}`}>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1"><Percent className={`w-3 h-3 ${summaryProfitAmount > 0 ? 'text-amber-600' : 'text-slate-400'}`} /><span className={`text-[10px] font-medium ${summaryProfitAmount > 0 ? 'text-amber-800' : 'text-slate-400'}`}>Profit</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      placeholder="0"
                      value={profitInput}
                      onChange={(e) => {
                        const raw = e.target.value
                        if (raw === '' || raw === '-') {
                          setProfitPercent(0)
                          setProfitInput('')
                          return
                        }
                        const val = parseFloat(raw)
                        if (!isNaN(val) && val >= 0 && val <= 100) {
                          setProfitPercent(val)
                          setProfitInput(raw)
                        }
                      }}
                      onBlur={() => {
                        const finalVal = profitPercent
                        setProfitInput(finalVal === 0 ? '' : finalVal.toString())
                        handleProfitChange(finalVal)
                      }}
                      className={`w-12 text-[10px] font-bold text-center border rounded px-0.5 py-0 ${summaryProfitAmount > 0 ? 'bg-amber-100 border-amber-300 text-amber-800 focus:ring-1 focus:ring-amber-400' : 'bg-slate-50 border-slate-300 text-slate-500 focus:ring-1 focus:ring-slate-400'} focus:outline-none`}
                    />
                    <span className={`text-[10px] font-medium ${summaryProfitAmount > 0 ? 'text-amber-800' : 'text-slate-400'}`}>%</span>
                    </div>
                    <span className={`text-[11px] font-bold ${summaryProfitAmount > 0 ? 'text-amber-700' : 'text-slate-400'}`}>Rp {Math.round(summaryProfitAmount).toLocaleString('id-ID')}</span>
                  </div>
                </div>
                <div className={`p-2 rounded-lg ${hasGrandTotal ? 'bg-gradient-to-r from-emerald-600 to-teal-600' : 'bg-slate-300'}`}>
                  <div className="flex justify-between items-center">
                    <span className={`text-[10px] font-semibold ${hasGrandTotal ? 'text-emerald-100' : 'text-slate-500'}`}>Total</span>
                    <span className={`text-[20px] font-semibold ${hasGrandTotal ? 'text-white' : 'text-slate-500'}`}>Rp {Math.round(summaryGrandTotal).toLocaleString('id-ID')}</span>
                  </div>
                  <div className={`flex justify-between items-center mt-0.5 pt-0.5 border-t ${hasGrandTotal ? 'border-white/30' : 'border-slate-400/50'}`}>
                    <span className={`text-[11px] font-medium ${hasGrandTotal ? 'text-emerald-100' : 'text-slate-600'}`}>Harga Jual per Pcs</span>
                    <span className={`text-[17px] font-semibold ${hasGrandTotal ? 'text-white' : 'text-slate-600'}`}>Rp {summaryHargaPerlembar.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
                {/* Perincian Harga Total - Terpisah */}
                <div className="px-1 pt-0.5 space-y-0.5">
                  <div className="flex justify-between text-[11px]"><span className="text-slate-800">Kertas</span><span className="text-slate-800 font-medium">{paperPriceValue > 0 ? formatRp(paperPriceValue) : '-'}</span></div>
                  {calculatedPrintingCost > 0 && <div className="flex justify-between text-[11px]"><span className="text-slate-800">Ongkos Cetak</span><span className="text-slate-800 font-medium">{formatRp(calculatedPrintingCost)}</span></div>}
                  {calculatedPrintingCost2 > 0 && <div className="flex justify-between text-[11px]"><span className="text-slate-800">Ongkos Cetak 2</span><span className="text-slate-800 font-medium">{formatRp(calculatedPrintingCost2)}</span></div>}
                  {selectedFinishingItems.map((fin) => { const { cost } = getFinishingCost(fin); return cost > 0 ? <div key={fin.id} className="flex justify-between text-[11px]"><span className="text-slate-800">{fin.name}</span><span className="text-slate-800 font-medium">{formatRp(cost)}</span></div> : null })}
                  {summaryPacking > 0 && <div className="flex justify-between text-[11px]"><span className="text-slate-800">Packing</span><span className="text-slate-800 font-medium">{formatRp(summaryPacking)}</span></div>}
                  {summaryShipping > 0 && <div className="flex justify-between text-[11px]"><span className="text-slate-800">Kirim</span><span className="text-slate-800 font-medium">{formatRp(summaryShipping)}</span></div>}
                  {calculatedGlueCost > 0 && <div className="flex justify-between text-[11px]"><span className="text-slate-800">Ongkos Lem</span><span className="text-slate-800 font-medium">{formatRp(calculatedGlueCost)}</span></div>}
                  {calculatedGlueBoronganSheet > 0 && <div className="flex justify-between text-[11px]"><span className="text-slate-800">Lem Borongan</span><span className="text-slate-800 font-medium">{formatRp(calculatedGlueBoronganSheet)}</span></div>}
                  {summaryBiayaLain1 > 0 && <div className="flex justify-between text-[11px]"><span className="text-slate-800">{biayaLain1Label}</span><span className="text-slate-800 font-medium">{formatRp(summaryBiayaLain1)}</span></div>}
                  {summaryBiayaLain2 > 0 && <div className="flex justify-between text-[11px]"><span className="text-slate-800">{biayaLain2Label}</span><span className="text-slate-800 font-medium">{formatRp(summaryBiayaLain2)}</span></div>}
                </div>
              </div>
              <div className="px-2.5 pb-2 flex flex-col gap-1.5">
                <Button onClick={handleCheck} className="w-full h-8 text-[11px] font-semibold bg-cyan-600 hover:bg-cyan-700 text-white"><ClipboardCheck className="w-3.5 h-3.5 mr-1" /> Cek Kelengkapan</Button>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button onClick={restoredRiwayatId ? handleUpdateRiwayat : handleSaveRiwayat} disabled={!hasGrandTotal || savingRiwayat} className="h-8 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-[11px] font-semibold">{restoredRiwayatId ? <><RefreshCw className={`w-3.5 h-3.5 mr-1 ${savingRiwayat ? 'animate-spin' : ''}`} /> {savingRiwayat ? 'Updating...' : 'Update'}</> : savingRiwayat ? 'Menyimpan...' : 'Simpan'}</Button>
                  <Button onClick={handleInvoice} disabled={!hasGrandTotal || savingRiwayat} className="h-8 text-[11px] font-semibold bg-orange-600 hover:bg-orange-700 text-white disabled:bg-slate-400"><FileSpreadsheet className="w-3.5 h-3.5 mr-1" /> Invoice</Button>
                  <Button onClick={handlePreview} disabled={!hasGrandTotal} className="h-8 text-[11px] font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-400"><Eye className="w-3.5 h-3.5 mr-1" /> Preview</Button>
                  <Button onClick={handleWhatsApp} disabled={!hasGrandTotal} className="h-8 text-[11px] font-semibold bg-green-600 hover:bg-green-700 text-white disabled:bg-slate-400"><MessageCircle className="w-3.5 h-3.5 mr-1" /> WhatsApp</Button>
                </div>
                <Button onClick={handleSaveToMaster} disabled={!hasGrandTotal || savingItem || itemSaveLocked} title={itemSaveLocked ? 'Sudah tersimpan — ubah data untuk bisa menyimpan lagi' : undefined} className="w-full h-8 text-[11px] font-semibold bg-teal-600 hover:bg-teal-700 text-white disabled:bg-slate-400"><Package className="w-3.5 h-3.5 mr-1" /> {itemSaveLocked ? 'Sudah Tersimpan di Master' : savingItem ? 'Menyimpan...' : 'Simpan ke Master Barang'}</Button>
                <Button onClick={resetForm} variant="outline" className="w-full h-8 text-[11px] font-semibold"><RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset Form</Button>
              </div>
            </div>
          </div>

        </div>

        {/* Simulasi Cepat (desktop): kotak lebar penuh memenuhi lebar layar */}
        <div className="hidden lg:block mt-3">
          {simulasiCard}
        </div>
      </div>
      )}

      {/* Riwayat Tab Content — gaya Riwayat Invoice */}
      {activeTab === 'riwayat' && (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">Riwayat Hitung Cetakan</h1>
            <p className="text-sm text-muted-foreground mt-1">Periode: {periodLabel}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex gap-2">
              <Button
                onClick={handleBackup}
                variant="outline"
                disabled={backupLoading === 'backup'}
                title="Backup riwayat hitung cetakan"
                className="min-h-[44px] flex-1 sm:flex-none"
              >
                {backupLoading === 'backup' ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />} Backup
              </Button>
              <Button
                onClick={handleRestore}
                variant="outline"
                disabled={backupLoading === 'restore'}
                title="Restore riwayat hitung cetakan"
                className="min-h-[44px] flex-1 sm:flex-none"
              >
                {backupLoading === 'restore' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Restore
              </Button>
            </div>
          </div>
        </div>

        {/* Filter: pelanggan + periode + pencarian — SELALU TAMPIL (mobile & desktop) */}
        <RiwayatFilterCard activeCount={(period !== 'all' ? 1 : 0) + (searchQuery.trim() !== '' ? 1 : 0) + (customerFilter ? 1 : 0)}>
            <RiwayatPeriodFilter
              idPrefix="riwayat-hc"
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
                  id="riwayat-hc-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari no. HC / customer / barang…"
                  aria-label="Cari riwayat hitung cetakan"
                  className="pl-9 min-h-[44px] bg-white w-full"
                />
              </div>
              <div className="flex items-center gap-2">
                <RiwayatCustomerFilter
                  idPrefix="riwayat-hc"
                  options={riwayatCustomerOptions}
                  value={customerFilter}
                  onChange={setCustomerFilter}
                  ariaLabel="Filter nama pelanggan hitung cetakan"
                  fullWidth
                />
                {riwayatFiltersActive && (
                  <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={() => { setPeriod('today'); setDateFrom(''); setDateTo(''); setSearchQuery(''); setCustomerFilter('') }} aria-label="Reset filter" title="Reset Filter">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
        </RiwayatFilterCard>

        {/* Ringkasan */}
        {riwayatLoading ? (
          <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
            <RiwayatSummaryCard label="Jumlah Hitung Cetakan" value={filteredRiwayatList.length} note="Data pada periode terpilih" />
            <RiwayatSummaryCard label="Total" value={`Rp ${Math.round(riwayatSummary.total).toLocaleString('id-ID')}`} valueClass="text-emerald-700" />
            <RiwayatSummaryCard label="Profit" value={`Rp ${Math.round(riwayatSummary.profit).toLocaleString('id-ID')}`} valueClass="text-violet-700" />
          </div>
        )}

        {riwayatLoading ? (
          <Skeleton className="h-72 w-full rounded-xl" />
        ) : filteredRiwayatList.length === 0 ? (
          <RiwayatEmptyState
            icon={<History />}
            title={riwayatFiltersActive ? 'Tidak ditemukan' : 'Belum ada riwayat hitung cetakan'}
            desc={riwayatFiltersActive ? 'Coba ubah periode, pelanggan, atau kata kunci pencarian.' : 'Hasil hitung yang disimpan akan tampil di sini'}
          />
        ) : (
          <>
            {/* Desktop table — klik baris → Preview */}
            <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
              <div className="max-h-96 overflow-y-auto scrollbar-thin">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-stone-50">
                    <TableRow className="bg-stone-50 hover:bg-stone-50">
                      <TableHead className="w-10">No.</TableHead>
                      <TableHead className="w-0 min-w-0">No. HC</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Nama Barang</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                      <TableHead className="hidden xl:table-cell">Finishing</TableHead>
                      <TableHead className="text-right">Jml</TableHead>
                      <TableHead className="text-right">Harga Jual/Pcs</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-center">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRiwayatList.slice(0, 100).map((r, i) => {
                      const jml = parseInt(r.jumlahPesanan) || parseInt(r.quantity) || 0
                      return (
                        <TableRow
                          key={r.id}
                          className={`cursor-pointer hover:bg-stone-50 ${restoredRiwayatId === r.id ? 'bg-emerald-50/60' : ''}`}
                          onClick={() => handlePreviewRiwayat(r)}
                        >
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="whitespace-nowrap w-px"><span className="font-mono text-xs">{r.nomorUrut || '-'}</span></TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap">{r.createdAt ? new Date(r.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</TableCell>
                          <TableCell className="max-w-40 truncate">{r.customerName && r.customerName !== '' ? r.customerName : '-'}</TableCell>
                          <TableCell className="max-w-44 text-muted-foreground" title={r.printName || '-'}>
                            <span className="truncate block">{r.printName || '-'}</span>
                          </TableCell>
                          <TableCell className={`text-right tabular-nums font-semibold ${r.profitAmount && r.profitAmount > 0 ? 'text-violet-700' : 'text-muted-foreground'}`}>
                            {r.profitAmount && r.profitAmount > 0 ? `Rp ${Math.round(r.profitAmount).toLocaleString('id-ID')}` : '-'}
                          </TableCell>
                          <TableCell className="hidden xl:table-cell max-w-36 text-muted-foreground" title={r.finishingNames || '-'}>
                            <span className="truncate block">{r.finishingNames && r.finishingNames !== '' ? r.finishingNames : '-'}</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{jml.toLocaleString('id-ID')}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground whitespace-nowrap">Rp {jml > 0 ? Math.round((r.grandTotal || 0) / jml).toLocaleString('id-ID') : '0'}</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold text-emerald-700 whitespace-nowrap">Rp {Math.round(r.grandTotal || 0).toLocaleString('id-ID')}</TableCell>
                          <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Hapus" aria-label="Hapus" onClick={() => handleDeleteRiwayat(r.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Mobile cards — klik kartu → Preview */}
            <div className="md:hidden space-y-3">
              {filteredRiwayatList.slice(0, 100).map((r) => (
                <Card
                  key={r.id}
                  className={`p-0 gap-0 cursor-pointer hover:bg-stone-50 transition-colors ${restoredRiwayatId === r.id ? 'bg-emerald-50/60' : ''}`}
                  onClick={() => handlePreviewRiwayat(r)}
                >
                  <CardContent className="p-4 space-y-2">
                    <p className="font-mono text-xs font-semibold break-all">{r.nomorUrut || '-'}</p>
                    <p className="text-sm">
                      <span className="text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'} · </span>
                      <span className="font-medium">{r.customerName || '-'}</span>
                    </p>
                    <div className="text-sm text-muted-foreground space-y-1">
                      {r.printName && <p className="truncate">{r.printName}</p>}
                      {r.finishingNames && r.finishingNames !== '' && <p className="text-xs line-clamp-1">Fin: {r.finishingNames}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm border-t border-stone-100 pt-2">
                      <p className="text-muted-foreground">Total: <span className="font-medium text-stone-700">Rp {Math.round(r.grandTotal || 0).toLocaleString('id-ID')}</span></p>
                      <p className="text-muted-foreground">
                        Profit:{' '}
                        {r.profitAmount && r.profitAmount > 0
                          ? <span className="text-violet-700">Rp {Math.round(r.profitAmount).toLocaleString('id-ID')}</span>
                          : '—'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-2.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 min-h-[36px] h-8 px-2 gap-1 text-xs text-destructive hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); handleDeleteRiwayat(r.id) }}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Hapus
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
      )}

      {/* Gabung Tab Content — gabungkan beberapa hitungan jadi 1 harga */}
      {activeTab === 'gabung' && (
        <GabunganTab rows={riwayatCetakanList} />
      )}

      {/* ===== PREVIEW DIALOG ===== */}
      {previewOpen && previewCalc && (
        <PreviewDialog
          onClose={() => { setPreviewOpen(false); setPreviewCalc(null); setPreviewRiwayatRecord(null) }}
          title="Detail Rincian Cetakan"
        >
          {/* Dokumen layout tetap 720px (identik mobile & desktop saat capture),
              tampilan di-skala agar muat di layar kecil */}
          <FixedDocScaler fixedWidth={720} innerRef={previewRef} innerClassName="p-4 bg-white">
            <RincianCetakanPreview data={previewCalc} />
          </FixedDocScaler>
              {/* Action Buttons — kecil 1 baris: Cetak · JPG · Edit (Edit hanya saat preview dari riwayat) */}
              <div className="sticky bottom-0 bg-card border-t border-slate-200 p-3 flex gap-2">
                <button onClick={handlePrint} disabled={isPrinting} title="Cetak rincian (fit A5 portrait, sama persis dengan preview)"
                  className="flex-1 flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-semibold py-1.5 sm:py-2 rounded-md sm:rounded-lg text-[11px] sm:text-xs whitespace-nowrap transition-colors">
                  {isPrinting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />} Cetak
                </button>
                <button onClick={handleJpg} disabled={isGeneratingJpg} title="Kirim gambar JPG A5 portrait (WhatsApp / unduh)"
                  className="flex-1 flex items-center justify-center gap-1 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-400 text-white font-semibold py-1.5 sm:py-2 rounded-md sm:rounded-lg text-[11px] sm:text-xs whitespace-nowrap transition-colors">
                  {isGeneratingJpg ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />JPG...</> : <><FileImage className="w-3.5 h-3.5" /> JPG</>}
                </button>
                {previewRiwayatRecord && (
                  <button onClick={() => { handleRestoreRiwayat(previewRiwayatRecord); setPreviewOpen(false); setPreviewCalc(null); setPreviewRiwayatRecord(null) }} title="Edit perhitungan di kalkulator"
                    className="flex-1 flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-1.5 sm:py-2 rounded-md sm:rounded-lg text-[11px] sm:text-xs whitespace-nowrap transition-colors">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                )}
              </div>
        </PreviewDialog>
      )}

      {/* Check Kelengkapan Dialog */}
      <Dialog open={checkOpen} onOpenChange={setCheckOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-cyan-600" />
              Cek Kelengkapan Data
              <span className={`ml-auto text-sm font-bold ${filledCount === checkItems.length ? 'text-emerald-600' : 'text-amber-600'}`}>
                {filledCount}/{checkItems.length}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto py-2">
            {checkItems.map((item, idx) => (
              <div key={idx} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm ${item.filled ? 'bg-emerald-50' : 'bg-red-50'}`}>
                {item.filled
                  ? <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 flex-shrink-0" />
                  : <XCircle className="w-4.5 h-4.5 text-red-400 flex-shrink-0" />
                }
                <span className={item.filled ? 'text-emerald-800 font-medium' : 'text-red-700 font-medium'}>
                  {item.label}
                </span>
                <span className={`ml-auto text-xs ${item.filled ? 'text-emerald-500' : 'text-red-400'}`}>
                  {item.filled ? 'Sudah' : 'Belum'}
                </span>
              </div>
            ))}
          </div>
          <div className={`mt-3 p-3 rounded-lg text-center ${filledCount === checkItems.length ? 'bg-emerald-100' : 'bg-amber-100'}`}>
            {filledCount === checkItems.length
              ? <p className="text-emerald-700 font-bold text-sm">✅ Semua data sudah lengkap!</p>
              : <p className="text-amber-700 font-bold text-sm">⚠️ {checkItems.length - filledCount} item belum diisi</p>
            }
          </div>
        </DialogContent>
      </Dialog>
      {simClearDialog}
    </DashboardLayout>
  )
}
