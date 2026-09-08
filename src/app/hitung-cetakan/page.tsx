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

import { Calculator, Printer, Plus, Users, FileText, Ruler, Cog, Layers, Package, Truck, Banknote, RotateCcw, Trash2, Palette, X, Percent, Eye, Loader2, FileImage, History, UserSearch, RefreshCw, MessageCircle, FileSpreadsheet, ClipboardCheck, CheckCircle2, XCircle, DatabaseBackup, Upload, Search } from 'lucide-react'
import { useState, useEffect, useMemo, Suspense, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { getAuthHeaders } from '@/lib/auth'
import { fetcher } from '@/lib/fetcher'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
}

const inputClass = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors lg:py-1.5'
const selectClass = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors bg-card appearance-none cursor-pointer lg:py-1.5'
const labelClass = 'flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1'

// Preview Dialog Component (centered, scrollable)
function PreviewDialog({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div onClick={(e) => e.stopPropagation()}
        className="relative bg-card rounded-xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-200 bg-slate-50 rounded-t-xl select-none flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400 cursor-pointer" onClick={onClose} />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
            </div>
            <span className="text-xs sm:text-sm font-semibold text-slate-700 ml-2">{title}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 overscroll-contain -webkit-overflow-scrolling-touch">
          {children}
        </div>
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
  const [biayaLain1Label, setBiayaLain1Label] = useState('Biaya Bikin Piso')
  const [biayaLain2Label, setBiayaLain2Label] = useState('Biaya')



  // Riwayat hitung cetakan (full list)
  const [savingRiwayat, setSavingRiwayat] = useState(false)
  const [restoredRiwayatId, setRestoredRiwayatId] = useState<string | null>(null)
  const [riwayatCetakanList, setRiwayatCetakanList] = useState<any[]>([])
  const [riwayatLoading, setRiwayatLoading] = useState(true)
  const [backupLoading, setBackupLoading] = useState<string | null>(null)
  const [nextHitungCetakanNumber, setNextHitungCetakanNumber] = useState('')
  const [activeTab, setActiveTab] = useState<'editor' | 'riwayat'>('editor')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
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

  // Filter riwayat: pencarian + rentang tanggal (gaya Riwayat Invoice)
  const filteredRiwayatList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return riwayatCetakanList.filter((r) => {
      const created = String(r?.createdAt || '').slice(0, 10)
      if (dateFrom && created && created < dateFrom) return false
      if (dateTo && created && created > dateTo) return false
      if (q) {
        const hay = `${r?.nomorUrut || ''} ${r?.customerName || ''} ${r?.printName || ''} ${r?.finishingNames || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [riwayatCetakanList, searchQuery, dateFrom, dateTo])
  const riwayatFiltersActive = !!searchQuery.trim() || !!dateFrom || !!dateTo

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
  const previewRef = useRef<HTMLDivElement>(null)
  const waWindowRef = useRef<Window | null>(null)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)

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

  const getFinishingCost = (finishing: Finishing): { cost: number; isMin: boolean; breakdown: string } => {
    const qty = parseInt(formData.quantity) || 0
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

  const buildPrintHtml = (calc: PrintCalculation) => {
    const rp = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`
    const fmtQ = (s: string) => parseInt(s || '0').toLocaleString('id-ID')
    const now = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

    const paperPrice = calc.totalPaperPrice || ((parseFloat(calc.pricePerSheet) || 0) * (parseInt(calc.quantity) || 0))
    const biayaLain1 = parseFloat(calc.biayaLain1) || 0
    const biayaLain2 = parseFloat(calc.biayaLain2) || 0
    const packing = parseFloat(calc.packingCost) || 0
    const shipping = parseFloat(calc.shippingCost) || 0
    const glueCost = calc.calculatedGlueCost || 0
    const glueBorongan = calc.calculatedGlueBoronganSheet || 0
    const subTotal = paperPrice + (calc.calculatedPrintingCost || 0) + (calc.calculatedPrintingCost2 || 0) + (calc.calculatedFinishingCost || 0) + packing + shipping + biayaLain1 + biayaLain2 + glueCost + glueBorongan
    const profitAmt = subTotal * (profitPercent / 100)
    const grandTotal = subTotal + profitAmt

    let sections = ''

    // === INFORMASI CETAKAN ===
    const warnaText = `${calc.warna || 0} warna${calc.warnaKhusus && parseInt(calc.warnaKhusus) > 0 ? ` + ${calc.warnaKhusus} khusus` : ''}`
    const ukuranText = calc.cutWidth && calc.cutHeight ? `${calc.cutWidth} × ${calc.cutHeight} cm` : (calc.paperLength && calc.paperWidth ? `${calc.paperLength} × ${calc.paperWidth} cm` : '-')

    sections += `
    <div class="section">
      <div class="section-header">
        <div class="section-icon blue">ℹ</div>
        <span>Informasi Cetakan</span>
      </div>
      <div class="info-grid">
        <div class="info-card blue">
          <div class="info-label">Nama Customer</div>
          <div class="info-value">${calc.customerName || '-'}</div>
        </div>
        <div class="info-card indigo">
          <div class="info-label">Nama Barang</div>
          <div class="info-value">${calc.printName || '-'}</div>
        </div>
        <div class="info-card purple">
          <div class="info-label">Jumlah Cetakan</div>
          <div class="info-value">${fmtQ(calc.quantity)} <small>lembar</small></div>
        </div>
        <div class="info-card slate">
          <div class="info-label">Ukuran Potongan</div>
          <div class="info-value">${ukuranText}</div>
        </div>
        <div class="info-card slate">
          <div class="info-label">Warna Cetak</div>
          <div class="info-value">${warnaText}</div>
        </div>
        <div class="info-card slate">
          <div class="info-label">Mesin</div>
          <div class="info-value">${calc.machineName || '-'}</div>
        </div>
      </div>
    </div>`

    // === HARGA BAHAN KERTAS ===
    if (paperPrice > 0) {
      sections += `
    <div class="section">
      <div class="section-header">
        <div class="section-icon teal">📄</div>
        <span>Harga Bahan Kertas</span>
      </div>
      <div class="cost-card teal">
        <span class="cost-label">${calc.paperName || '-'}</span>
        <span class="cost-value teal">${rp(paperPrice)}</span>
      </div>
    </div>`
    }

    // === ONGKOS CETAK ===
    if (calc.calculatedPrintingCost > 0) {
      sections += `
    <div class="section">
      <div class="section-header">
        <div class="section-icon blue">🔢</div>
        <span>Ongkos Cetak</span>
      </div>
      <div class="cost-card blue">
        <span class="cost-label">Total Ongkos Cetak</span>
        <span class="cost-value blue">${rp(calc.calculatedPrintingCost)}</span>
      </div>
    </div>`
    }

    // === ONGKOS CETAK 2 ===
    if (calc.calculatedPrintingCost2 > 0) {
      sections += `
    <div class="section">
      <div class="section-header">
        <div class="section-icon fuchsia">🔢</div>
        <span>Ongkos Cetak 2</span>
      </div>
      <div class="cost-card fuchsia">
        <span class="cost-label">Total Ongkos Cetak 2</span>
        <span class="cost-value fuchsia">${rp(calc.calculatedPrintingCost2)}</span>
      </div>
    </div>`
    }

    // === FINISHING ===
    if (calc.finishingBreakdown && calc.finishingBreakdown.length > 0) {
      const finRows = calc.finishingBreakdown.map(fb =>
        `<div class="fin-row"><span>${fb.name}</span><span class="fin-price">${rp(fb.cost)}</span></div>`
      ).join('')
      sections += `
    <div class="section">
      <div class="section-header">
        <div class="section-icon rose">✂</div>
        <span>Finishing</span>
      </div>
      <div class="fin-card">
        ${finRows}
        <div class="fin-total">
          <span>Total Finishing</span>
          <span class="fin-total-price">${rp(calc.calculatedFinishingCost)}</span>
        </div>
      </div>
    </div>`
    } else if (calc.finishingName && calc.calculatedFinishingCost > 0) {
      sections += `
    <div class="section">
      <div class="section-header">
        <div class="section-icon rose">✂</div>
        <span>Finishing</span>
      </div>
      <div class="cost-card rose">
        <span class="cost-label">${calc.finishingName}</span>
        <span class="cost-value rose">${rp(calc.calculatedFinishingCost)}</span>
      </div>
    </div>`
    }

    // === BIAYA TAMBAHAN ===
    const extras = [
      { name: 'Ongkos Packing', val: packing },
      { name: 'Ongkos Kirim', val: shipping },
      { name: 'Ongkos Lem', val: glueCost },
      { name: 'Lem Borongan', val: glueBorongan },
    ]
    if (biayaLain1 > 0) extras.push({ name: calc.biayaLain1Label || 'Biaya Bikin Piso', val: biayaLain1 })
    if (biayaLain2 > 0) extras.push({ name: calc.biayaLain2Label || 'Biaya', val: biayaLain2 })
    const filteredExtras = extras.filter(e => e.val > 0)
    if (filteredExtras.length > 0) {
      const extraRows = filteredExtras.map(e =>
        `<div class="extra-item"><div class="extra-icon">💰</div><div class="extra-text"><div class="extra-label">${e.name}</div><div class="extra-price">${rp(e.val)}</div></div></div>`
      ).join('')
      sections += `
    <div class="section">
      <div class="section-header">
        <div class="section-icon amber">💰</div>
        <span>Biaya Tambahan</span>
      </div>
      <div class="extra-grid">${extraRows}</div>
    </div>`
    }

    // === PROFIT ===
    if (profitPercent > 0 && profitAmt > 0) {
      sections += `
    <div class="section">
      <div class="section-header">
        <div class="section-icon orange">%</div>
        <span>Profit</span>
      </div>
      <div class="cost-card orange">
        <span class="cost-label">Profit (${profitPercent}%)</span>
        <span class="cost-value orange">${rp(Math.round(profitAmt))}</span>
      </div>
    </div>`
    }

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${calc.printName}</title>
      <style>
        @page { size: A4 portrait; margin: 12mm 15mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', -apple-system, Arial, sans-serif;
          color: #1e293b;
          font-size: 11px;
          line-height: 1.4;
          width: 210mm;
          min-height: 297mm;
        }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .page { page-break-after: avoid; }
        }
        .page {
          padding: 0;
        }
        .header {
          text-align: center;
          padding-bottom: 10px;
          border-bottom: 2px solid #e2e8f0;
          margin-bottom: 10px;
        }
        .header h1 {
          font-size: 18px;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.3px;
        }
        .header p {
          font-size: 10px;
          color: #64748b;
          margin-top: 3px;
        }
        .section {
          margin-bottom: 8px;
        }
        .section-header {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 5px;
        }
        .section-header span {
          font-size: 11px;
          font-weight: 700;
          color: #334155;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .section-icon {
          width: 20px;
          height: 20px;
          border-radius: 5px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 700;
        }
        .section-icon.blue { background: #dbeafe; color: #2563eb; }
        .section-icon.teal { background: #ccfbf1; color: #0d9488; }
        .section-icon.fuchsia { background: #fae8ff; color: #c026d3; }
        .section-icon.rose { background: #ffe4e6; color: #e11d48; }
        .section-icon.amber { background: #fef3c7; color: #d97706; }
        .section-icon.orange { background: #ffedd5; color: #ea580c; }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 4px;
        }
        .info-card {
          border-radius: 6px;
          padding: 6px 8px;
        }
        .info-card.blue { background: #eff6ff; border: 1px solid #bfdbfe; }
        .info-card.indigo { background: #eef2ff; border: 1px solid #c7d2fe; }
        .info-card.purple { background: #faf5ff; border: 1px solid #e9d5ff; }
        .info-card.slate { background: #f8fafc; border: 1px solid #e2e8f0; }
        .info-label {
          font-size: 8px;
          font-weight: 500;
          color: #64748b;
          margin-bottom: 1px;
        }
        .info-card.blue .info-label { color: #3b82f6; }
        .info-card.indigo .info-label { color: #6366f1; }
        .info-card.purple .info-label { color: #a855f7; }
        .info-value {
          font-size: 12px;
          font-weight: 700;
          color: #334155;
        }
        .info-card.blue .info-value { color: #1e40af; }
        .info-card.indigo .info-value { color: #3730a3; }
        .info-card.purple .info-value { color: #7e22ce; }
        .info-value small {
          font-size: 9px;
          font-weight: 400;
          color: #a855f7;
        }
        .cost-card {
          border-radius: 6px;
          padding: 8px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .cost-card.teal { background: #f0fdfa; border: 1px solid #99f6e4; }
        .cost-card.blue { background: #eff6ff; border: 1px solid #bfdbfe; }
        .cost-card.fuchsia { background: #fdf4ff; border: 1px solid #f0abfc; }
        .cost-card.rose { background: #fff1f2; border: 1px solid #fecdd3; }
        .cost-card.orange { background: #fff7ed; border: 1px solid #fed7aa; }
        .cost-label {
          font-size: 12px;
          font-weight: 700;
          color: #334155;
        }
        .cost-card.teal .cost-label { color: #115e59; }
        .cost-card.blue .cost-label { color: #1e40af; }
        .cost-card.fuchsia .cost-label { color: #a21caf; }
        .cost-card.rose .cost-label { color: #9f1239; }
        .cost-card.orange .cost-label { color: #ea580c; }
        .cost-value {
          font-size: 15px;
          font-weight: 800;
        }
        .cost-value.teal { color: #0f766e; }
        .cost-value.blue { color: #1d4ed8; }
        .cost-value.fuchsia { color: #c026d3; }
        .cost-value.rose { color: #be123c; }
        .cost-value.orange { color: #c2410c; }
        .fin-card {
          background: #fff1f2;
          border: 1px solid #fecdd3;
          border-radius: 6px;
          padding: 8px 10px;
        }
        .fin-row {
          display: flex;
          justify-content: space-between;
          padding: 2px 0;
          font-size: 11px;
          color: #9f1239;
        }
        .fin-price {
          font-weight: 700;
          color: #be123c;
        }
        .fin-total {
          border-top: 1px solid #fecdd3;
          margin-top: 4px;
          padding-top: 5px;
          display: flex;
          justify-content: space-between;
        }
        .fin-total span:first-child {
          font-size: 10px;
          font-weight: 700;
          color: #e11d48;
          text-transform: uppercase;
        }
        .fin-total-price {
          font-size: 13px;
          font-weight: 800;
          color: #be123c;
        }
        .extra-grid {
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 6px;
          padding: 8px 10px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }
        .extra-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .extra-icon {
          font-size: 14px;
        }
        .extra-label {
          font-size: 9px;
          color: #b45309;
        }
        .extra-price {
          font-size: 12px;
          font-weight: 700;
          color: #92400e;
        }
        .grand-total {
          background: #0f172a;
          color: white;
          border-radius: 10px;
          padding: 14px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 6px;
        }
        .grand-total-label {
          font-size: 11px;
          color: #94a3b8;
        }
        .grand-total-value {
          font-size: 24px;
          font-weight: 800;
          color: #34d399;
        }
        .grand-total-detail {
          text-align: right;
          font-size: 9px;
          color: #94a3b8;
          line-height: 1.7;
        }
      </style>
    </head><body>
      <div class="page">
        <div class="header">
          <h1>Rincian Harga Cetakan</h1>
          <p>${calc.printName} · ${now}</p>
        </div>
        ${sections}
        <div class="grand-total">
          <div>
            <div class="grand-total-label">Grand Total</div>
            <div class="grand-total-value">${rp(Math.round(grandTotal))}</div>
          </div>
          <div class="grand-total-detail">
            <div>Sub Total: ${rp(Math.round(subTotal))}</div>
            ${profitAmt > 0 ? `<div>Profit: ${rp(Math.round(profitAmt))}</div>` : ''}
          </div>
        </div>
      </div>
    </body></html>`
  }

  const handlePrint = () => {
    if (!previewCalc) { toast.error('Preview tidak tersedia'); return }
    const pw = window.open('', '_blank')
    if (!pw) { toast.error('Popup diblokir'); return }
    pw.document.write(buildPrintHtml(previewCalc))
    pw.document.close()
    pw.onload = () => setTimeout(() => pw.print(), 200)
  }

  const handlePdf = async () => {
    if (!previewCalc) return
    setIsGeneratingPdf(true)
    try {
      const { jsPDF } = await import('jspdf')
      // A4 portrait: 210mm x 297mm
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfW = pdf.internal.pageSize.getWidth() // 210
      const pdfH = pdf.internal.pageSize.getHeight() // 297
      const margin = 8
      const contentW = pdfW - margin * 2
      const contentH = pdfH - margin * 2

      // Render HTML to canvas via hidden iframe at A4 pixel dimensions
      const a4PxW = 794 // ~210mm at 96dpi
      const a4PxH = 1123 // ~297mm at 96dpi
      const iframe = document.createElement('iframe')
      iframe.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${a4PxW}px;height:${a4PxH}px;border:none;`
      document.body.appendChild(iframe)
      const iframeDoc = iframe.contentDocument!
      iframeDoc.open()
      iframeDoc.write(buildPrintHtml(previewCalc))
      iframeDoc.close()

      await new Promise(resolve => setTimeout(resolve, 600))

      const { toCanvas } = await import('html-to-image')
      const canvas = await toCanvas(iframeDoc.body, {
        backgroundColor: '#ffffff',
        pixelRatio: 3,
        width: a4PxW,
        height: iframeDoc.body.scrollHeight,
        canvasWidth: a4PxW * 3,
        canvasHeight: iframeDoc.body.scrollHeight * 3,
      })

      document.body.removeChild(iframe)

      const imgData = canvas.toDataURL('image/jpeg', 0.95)
      const imgW = contentW
      const imgH = (canvas.height * imgW) / canvas.width

      // Scale to fit A4 portrait in 1 page
      if (imgH <= contentH) {
        const offsetX = margin + (contentW - imgW) / 2
        pdf.addImage(imgData, 'JPEG', margin, margin, imgW, imgH)
      } else {
        const scaledW = (contentH * imgW) / imgH
        const offsetX = margin + (contentW - scaledW) / 2
        pdf.addImage(imgData, 'JPEG', offsetX, margin, scaledW, contentH)
      }

      pdf.save(`rincian-${previewCalc.printName}-${Date.now()}.pdf`)
      toast.success('PDF berhasil diunduh!')
    } catch (e) {
      console.error('PDF error:', e)
      toast.error('Gagal menghasilkan PDF')
    }
    finally { setIsGeneratingPdf(false) }
  }

  const handlePreview = () => {
    if (!formData.printName || !formData.quantity) {
      toast.error('Lengkapi Nama Barang dan Jumlah terlebih dahulu')
      return
    }
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
      hargaPlat: formData.hargaPlat, paperId: formData.paperId, paperName: selectedPaper?.name || 'Custom',
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
      profitPercent, biayaLain1Label, biayaLain2Label
    }
    setPreviewCalc(previewData)
    setPreviewOpen(true)
  }

  const handleWhatsApp = () => {
    if (!formData.printName || !formData.quantity) {
      toast.error('Lengkapi Nama Barang dan Jumlah terlebih dahulu')
      return
    }
    const rp = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`
    const qty = parseInt(formData.quantity) || 0

    let msg = `*Rincian Harga Cetakan - www.darrellsoft.com*\n\n`
    msg += `Nama Customer: ${formData.customerName || '-'}\n`
    msg += `Nama Barang: ${formData.printName}\n`
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
    if (summaryJumlahPesanan > 0) msg += `Harga/Pcs: ${rp(summaryGrandTotal / summaryJumlahPesanan)}\n`
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
      subTotal, profitPercent, profitAmount, grandTotal
    }
  }

  const resetFormForRiwayat = () => {
    setRestoredRiwayatId(null)
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
        toast.success('Riwayat hitung cetakan berhasil disimpan!')
        notifyDataChange('riwayat-cetakan')
        fetchRiwayatCetakan()
        fetchNextNumber()
        resetFormForRiwayat()
      } else { toast.error('Gagal menyimpan riwayat') }
    } catch { toast.error('Gagal menyimpan riwayat') }
    setSavingRiwayat(false)
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
        toast.success('Riwayat berhasil diupdate!')
        notifyDataChange('riwayat-cetakan')
        fetchRiwayatCetakan()
        resetFormForRiwayat()
      } else { toast.error('Gagal mengupdate riwayat') }
    } catch { toast.error('Gagal mengupdate riwayat') }
    setSavingRiwayat(false)
  }

  const handleRestoreRiwayat = (r: any) => {
    setRestoredRiwayatId(r.id)
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

  const handleDeleteRiwayat = async (id: string) => {
    if (!confirm('Beneran mau dihapus nih?')) return
    try {
      const res = await fetcher(`/api/riwayat-cetakan/${id}`, { method: 'DELETE', headers: getAuthHeaders() })
      if (res.ok) {
        toast.success('Riwayat berhasil dihapus')
        notifyDataChange('riwayat-cetakan')
        if (restoredRiwayatId === id) setRestoredRiwayatId(null)
        fetchRiwayatCetakan()
      } else { toast.error('Gagal menghapus riwayat') }
    } catch { toast.error('Gagal menghapus riwayat') }
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
      profitPercent: r.profitPercent || 0,
      biayaLain1Label: r.otherCostLabel || 'Biaya Bikin Piso',
      biayaLain2Label: r.otherCostLabel2 || 'Biaya'
    }
    setPreviewCalc(previewData)
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

  // Preview summary values - derived from previewCalc for consistent display
  const pvCalc = previewCalc
  const pvCustomerName = pvCalc?.customerName || formData.customerName || '-'
  const pvPrintName = pvCalc?.printName || '-'
  const pvCutWidth = pvCalc?.cutWidth || ''
  const pvCutHeight = pvCalc?.cutHeight || ''
  const pvQuantity = parseInt(pvCalc?.quantity || '0') || 0
  const pvPaperPrice = pvCalc?.totalPaperPrice || ((parseFloat(pvCalc?.pricePerSheet || '0') || 0) * pvQuantity)
  const pvPrintingCost = pvCalc?.calculatedPrintingCost ?? calculatedPrintingCost
  const pvPrintingCost2 = pvCalc?.calculatedPrintingCost2 ?? calculatedPrintingCost2
  const pvFinishingCost = pvCalc?.calculatedFinishingCost ?? calculatedFinishingCost
  const pvGlueCost = pvCalc?.calculatedGlueCost ?? calculatedGlueCost
  const pvGlueBorongan = pvCalc?.calculatedGlueBoronganSheet ?? calculatedGlueBoronganSheet
  const pvPacking = parseFloat(pvCalc?.packingCost || '0') || 0
  const pvShipping = parseFloat(pvCalc?.shippingCost || '0') || 0
  const pvBiayaLain1 = parseFloat(pvCalc?.biayaLain1 || '0') || 0
  const pvBiayaLain2 = parseFloat(pvCalc?.biayaLain2 || '0') || 0
  const pvBiayaLain1Label = pvCalc?.biayaLain1Label || biayaLain1Label
  const pvBiayaLain2Label = pvCalc?.biayaLain2Label || biayaLain2Label
  const pvProfitPercent = pvCalc?.profitPercent ?? profitPercent
  const pvGlueTotal = pvGlueCost + pvGlueBorongan
  const pvSubTotal = pvPaperPrice + pvPrintingCost + pvPrintingCost2 + pvFinishingCost + pvPacking + pvShipping + pvBiayaLain1 + pvBiayaLain2 + pvGlueTotal
  const pvProfitAmount = pvSubTotal * (pvProfitPercent / 100)
  const pvGrandTotal = pvSubTotal + pvProfitAmount

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
                  {summaryQuantity > 0 && hasGrandTotal && (
                    <div className="flex justify-between items-center mt-1.5 pt-1.5 border-t border-white/30">
                      <span className="text-xs font-medium text-emerald-100">Harga Per Pcs</span>
                      <span className="text-[23px] font-semibold text-white">Rp {summaryHargaPerlembar.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
                    </div>
                  )}
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
              </div>{/* end mobile-only wrapper */}
            </div>{/* end column 1 card */}
          </div>{/* end COLUMN 1 */}

          {/* ========== COLUMN 2: ONGKOS CETAK (Desktop Only) ========== */}
          <div className="hidden lg:flex flex-col flex-1 flex-shrink-0 gap-3">
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
                  {summaryQuantity > 0 && hasGrandTotal && (
                    <div className="flex justify-between items-center mt-0.5 pt-0.5 border-t border-white/30">
                      <span className="text-[11px] font-medium text-emerald-100">Harga Per Pcs</span>
                      <span className="text-[17px] font-semibold text-white">Rp {summaryHargaPerlembar.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
                    </div>
                  )}
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
                <Button onClick={resetForm} variant="outline" className="w-full h-8 text-[11px] font-semibold"><RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset Form</Button>
              </div>
            </div>

          </div>

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
            <p className="text-sm text-muted-foreground mt-1">{riwayatLoading ? 'Memuat data…' : `${filteredRiwayatList.length} data`}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari no. HC / customer / barang…"
                aria-label="Cari riwayat hitung cetakan"
                className="pl-9 min-h-[44px]"
              />
            </div>
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

        {/* Filter: rentang tanggal */}
        <div className="rounded-xl border border-stone-200 bg-white p-3 md:px-4 md:py-3">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-4">
            <div className="lg:w-40">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Dari Tanggal</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1 min-h-[40px] bg-white" aria-label="Dari tanggal" />
            </div>
            <div className="lg:w-40">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Sampai Tanggal</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1 min-h-[40px] bg-white" aria-label="Sampai tanggal" />
            </div>
            {riwayatFiltersActive && (
              <Button variant="ghost" size="sm" className="lg:ml-auto mt-1 lg:mt-4 text-xs text-muted-foreground" onClick={() => { setDateFrom(''); setDateTo(''); setSearchQuery('') }}>
                <X className="h-3.5 w-3.5" /> Reset Filter
              </Button>
            )}
          </div>
        </div>

        {riwayatLoading ? (
          <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : filteredRiwayatList.length === 0 ? (
          <div className="text-center py-12 px-4 rounded-xl border border-stone-200 bg-white">
            <History className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium">{riwayatFiltersActive ? 'Tidak ditemukan' : 'Belum ada riwayat hitung cetakan'}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {riwayatFiltersActive ? 'Coba kata kunci atau rentang tanggal lain.' : 'Hasil hitung yang disimpan akan tampil di sini'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table — klik baris → Preview */}
            <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
              <div className="max-h-96 overflow-y-auto scrollbar-thin">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-stone-50">
                    <TableRow className="bg-stone-50 hover:bg-stone-50">
                      <TableHead className="w-0 min-w-0">No. HC</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Nama Barang</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                      <TableHead className="hidden xl:table-cell">Finishing</TableHead>
                      <TableHead className="text-right">Jml</TableHead>
                      <TableHead className="text-right">Harga/Pcs</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-center">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRiwayatList.slice(0, 100).map((r) => {
                      const jml = parseInt(r.jumlahPesanan) || parseInt(r.quantity) || 0
                      return (
                        <TableRow
                          key={r.id}
                          className={`cursor-pointer hover:bg-stone-50 ${restoredRiwayatId === r.id ? 'bg-emerald-50/60' : ''}`}
                          onClick={() => handlePreviewRiwayat(r)}
                        >
                          <TableCell className="font-medium whitespace-nowrap w-px">{r.nomorUrut || '-'}</TableCell>
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
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-blue-600" title="Preview" aria-label="Preview" onClick={() => handlePreviewRiwayat(r)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-emerald-600" title="Restore" aria-label="Restore" onClick={() => handleRestoreRiwayat(r)}>
                                <RotateCcw className="h-4 w-4" />
                              </Button>
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
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium truncate">{r.nomorUrut || '-'}</p>
                      <p className="text-xs text-muted-foreground whitespace-nowrap">{r.createdAt ? new Date(r.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</p>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p className="truncate">{r.customerName && r.customerName !== '' ? r.customerName : '-'}</p>
                      {r.printName && <p className="text-xs line-clamp-1">{r.printName}</p>}
                      {r.finishingNames && r.finishingNames !== '' && <p className="text-xs line-clamp-1">Fin: {r.finishingNames}</p>}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      {r.profitAmount && r.profitAmount > 0
                        ? <span className="text-xs text-violet-700">Profit Rp {Math.round(r.profitAmount).toLocaleString('id-ID')}</span>
                        : <span />}
                      <p className="text-sm font-bold text-emerald-700 whitespace-nowrap">Rp {Math.round(r.grandTotal || 0).toLocaleString('id-ID')}</p>
                    </div>
                    <div className="border-t pt-2 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 min-h-[36px] text-xs"
                        onClick={(e) => { e.stopPropagation(); handleRestoreRiwayat(r) }}
                      >
                        Muat
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 min-h-[36px] text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                        onClick={(e) => { e.stopPropagation(); handleDeleteRiwayat(r.id) }}
                      >
                        Hapus
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

      {/* ===== PREVIEW DIALOG ===== */}
      {previewOpen && previewCalc && (
        <PreviewDialog
          onClose={() => { setPreviewOpen(false); setPreviewCalc(null) }}
          title="Detail Rincian Cetakan"
        >
          <div ref={previewRef} className="p-4 bg-white space-y-3">
            {/* Header */}
            <div className="text-center pb-3 border-b-2 border-slate-200">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Calculator className="w-5 h-5 text-blue-600" />
                    <h1 className="text-lg font-bold text-slate-900">Rincian Harga Cetakan</h1>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {pvPrintName} · {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>

                {/* === INFORMASI CETAKAN === */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center">
                      <FileText className="w-3 h-3 text-blue-600" />
                    </div>
                    <p className="text-[13px] font-bold text-slate-700 uppercase tracking-wide">Informasi Cetakan</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5">
                      <p className="text-[10px] text-blue-500 font-medium">Nama Customer</p>
                      <p className="text-sm font-bold text-blue-800">{pvCustomerName}</p>
                    </div>
                    <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-2.5">
                      <p className="text-[10px] text-indigo-500 font-medium">Nama Barang</p>
                      <p className="text-sm font-bold text-indigo-800">{pvPrintName}</p>
                    </div>
                    <div className="bg-purple-50 border border-purple-100 rounded-lg p-2.5">
                      <p className="text-[10px] text-purple-500 font-medium">Jumlah Cetakan</p>
                      <p className="text-sm font-bold text-purple-800">{pvQuantity.toLocaleString('id-ID')} <span className="text-xs font-normal text-purple-500">lembar</span></p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                      <p className="text-[10px] text-slate-500 font-medium">Ukuran Potongan</p>
                      <p className="text-sm font-bold text-slate-700">{pvCutWidth && pvCutHeight ? `${pvCutWidth} × ${pvCutHeight} cm` : '-'}</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                      <p className="text-[10px] text-slate-500 font-medium">Warna Cetak</p>
                      <p className="text-sm font-bold text-slate-700">
                        {previewCalc.warna || 0} warna
                        {previewCalc.warnaKhusus && parseInt(previewCalc.warnaKhusus) > 0 ? ` + ${previewCalc.warnaKhusus} khusus` : ''}
                      </p>
                    </div>
                  </div>
                </div>

                {/* === HARGA BAHAN KERTAS === */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-5 h-5 rounded bg-teal-100 flex items-center justify-center">
                      <FileText className="w-3 h-3 text-teal-600" />
                    </div>
                    <p className="text-[13px] font-bold text-slate-700 uppercase tracking-wide">Harga Bahan Kertas</p>
                  </div>
                  <div className="bg-teal-50 border border-teal-100 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-teal-800">{previewCalc.paperName || '-'}</p>
                      <p className="text-lg font-extrabold text-teal-700">{pvPaperPrice > 0 ? formatRp(pvPaperPrice) : '-'}</p>
                    </div>
                  </div>
                </div>

                {/* === ONGKOS CETAK === */}
                {(pvPrintingCost) > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center">
                        <Calculator className="w-3 h-3 text-blue-600" />
                      </div>
                      <p className="text-[13px] font-bold text-slate-700 uppercase tracking-wide">{t('ongkos_cetak_label')}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-blue-800">Total Ongkos Cetak</p>
                        <p className="text-lg font-extrabold text-blue-700">{formatRp(pvPrintingCost)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* === ONGKOS CETAK 2 === */}
                {(pvPrintingCost2) > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-5 h-5 rounded bg-fuchsia-100 flex items-center justify-center">
                        <Calculator className="w-3 h-3 text-fuchsia-600" />
                      </div>
                      <p className="text-[13px] font-bold text-slate-700 uppercase tracking-wide">Ongkos Cetak 2</p>
                    </div>
                    <div className="bg-fuchsia-50 border border-fuchsia-100 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-fuchsia-800">Total Ongkos Cetak 2</p>
                        <p className="text-lg font-extrabold text-fuchsia-700">{formatRp(pvPrintingCost2)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* === FINISHING === */}
                {((previewCalc.finishingName && previewCalc.finishingName !== '') || (previewCalc.finishingBreakdown && previewCalc.finishingBreakdown.length > 0)) && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-5 h-5 rounded bg-rose-100 flex items-center justify-center">
                        <Layers className="w-3 h-3 text-rose-600" />
                      </div>
                      <p className="text-[13px] font-bold text-slate-700 uppercase tracking-wide">{t('finishing_label')}</p>
                    </div>
                    <div className="bg-rose-50 border border-rose-100 rounded-lg p-3">
                      {previewCalc.finishingBreakdown && previewCalc.finishingBreakdown.length > 0 ? (
                        <div className="space-y-2">
                          {previewCalc.finishingBreakdown.map((fb, i) => (
                            <div key={i} className="flex items-center justify-between">
                              <p className="text-sm text-rose-800">{fb.name}</p>
                              <p className="text-sm font-bold text-rose-700">{formatRp(fb.cost)}</p>
                            </div>
                          ))}
                          <div className="border-t border-rose-200 pt-2 flex items-center justify-between">
                            <p className="text-xs font-bold text-rose-600 uppercase">Total Finishing</p>
                            <p className="text-base font-extrabold text-rose-700">{formatRp(pvCalc?.calculatedFinishingCost ?? 0)}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold text-rose-800">{previewCalc.finishingName}</p>
                          <p className="text-lg font-extrabold text-rose-700">{formatRp(pvFinishingCost)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* === BIAYA TAMBAHAN === */}
                {(pvPacking > 0 || pvShipping > 0 || pvGlueCost > 0 || pvGlueBorongan > 0 || pvBiayaLain1 > 0 || pvBiayaLain2 > 0) && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-5 h-5 rounded bg-amber-100 flex items-center justify-center">
                        <Truck className="w-3 h-3 text-amber-600" />
                      </div>
                      <p className="text-[13px] font-bold text-slate-700 uppercase tracking-wide">Biaya Tambahan</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                      <div className="grid grid-cols-2 gap-2">
                        {pvPacking > 0 && (
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-amber-500" />
                            <div>
                              <p className="text-[9px] text-amber-500">Ongkos Packing</p>
                              <p className="text-sm font-bold text-amber-700">{formatRp(pvPacking)}</p>
                            </div>
                          </div>
                        )}
                        {pvShipping > 0 && (
                          <div className="flex items-center gap-2">
                            <Truck className="w-4 h-4 text-amber-500" />
                            <div>
                              <p className="text-[9px] text-amber-500">Ongkos Kirim</p>
                              <p className="text-sm font-bold text-amber-700">{formatRp(pvShipping)}</p>
                            </div>
                          </div>
                        )}
                        {pvGlueCost > 0 && (
                          <div className="flex items-center gap-2">
                            <Cog className="w-4 h-4 text-amber-500" />
                            <div>
                              <p className="text-[9px] text-amber-500">Ongkos Lem</p>
                              <p className="text-sm font-bold text-amber-700">{formatRp(pvGlueCost)}</p>
                            </div>
                          </div>
                        )}
                        {pvGlueBorongan > 0 && (
                          <div className="flex items-center gap-2">
                            <Cog className="w-4 h-4 text-amber-500" />
                            <div>
                              <p className="text-[9px] text-amber-500">Lem Borongan</p>
                              <p className="text-sm font-bold text-amber-700">{formatRp(pvGlueBorongan)}</p>
                            </div>
                          </div>
                        )}
                        {pvBiayaLain1 > 0 && (
                          <div className="flex items-center gap-2">
                            <Banknote className="w-4 h-4 text-amber-500" />
                            <div>
                              <p className="text-[9px] text-amber-500">{pvBiayaLain1Label}</p>
                              <p className="text-sm font-bold text-amber-700">{formatRp(pvBiayaLain1)}</p>
                            </div>
                          </div>
                        )}
                        {pvBiayaLain2 > 0 && (
                          <div className="flex items-center gap-2">
                            <Banknote className="w-4 h-4 text-amber-500" />
                            <div>
                              <p className="text-[9px] text-amber-500">{pvBiayaLain2Label}</p>
                              <p className="text-sm font-bold text-amber-700">{formatRp(pvBiayaLain2)}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* === PROFIT === */}
                {pvProfitPercent > 0 && pvProfitAmount > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-5 h-5 rounded bg-orange-100 flex items-center justify-center">
                        <Percent className="w-3 h-3 text-orange-600" />
                      </div>
                      <p className="text-[13px] font-bold text-slate-700 uppercase tracking-wide">Profit</p>
                    </div>
                    <div className="bg-orange-50 border border-orange-100 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-orange-600">Profit ({pvProfitPercent}%)</p>
                        <p className="text-lg font-bold text-orange-700">{formatRp(pvProfitAmount)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* === GRAND TOTAL === */}
                <div className="dark-surface bg-slate-900 text-white rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400">Grand Total</p>
                    <p className="text-2xl font-extrabold text-emerald-400">{formatRp(pvGrandTotal)}</p>
                  </div>
                  <div className="text-right text-[10px] text-slate-400 space-y-0.5">
                    <p>Sub Total: {formatRp(pvSubTotal)}</p>
                    {pvProfitAmount > 0 && <p>Profit: {formatRp(pvProfitAmount)}</p>}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="sticky bottom-0 bg-card border-t border-slate-200 p-4 flex gap-2">
                <button onClick={handlePrint}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors">
                  <Printer className="w-4 h-4" /> Cetak
                </button>
                <button onClick={handlePdf} disabled={isGeneratingPdf}
                  className="flex-1 flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-400 text-white font-semibold py-3 rounded-xl transition-colors">
                  {isGeneratingPdf ? <><Loader2 className="w-4 h-4 animate-spin" />PDF...</> : <><FileImage className="w-4 h-4" /> PDF</>}
                </button>
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
    </DashboardLayout>
  )
}
