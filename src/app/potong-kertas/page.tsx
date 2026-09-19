'use client'

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Calculator, Save, RotateCcw, Printer, FileImage, Loader2, ArrowRight, Share2, History, RefreshCw, Trash2, Plus, FileText, DatabaseBackup, Upload, Pencil, Search, X, CheckCircle2, Image as ImageIcon } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useLanguage } from '@/contexts/language-context'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { calculateCuts, type Customer, type Paper, type CuttingResult } from '@/lib/cutting-engine'
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
import { RiwayatPeriodFilter, RiwayatFilterCard, RiwayatSummaryCard, RiwayatEmptyState, riwayatPeriodText, riwayatDateRange, type RiwayatPeriod } from '@/components/dokupro/riwayat-period-filter'

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
const SIM_ROWS_STORAGE_KEY = () => userKey('potong-kertas-simulasi-rows')

// Baris Tabel Simulasi Cepat (CRUD): jumlah & profit disimpan; nilai (kertas, jual, dll)
// dihitung ulang live dari parameter form. snap = nilai saat baris disimpan,
// dipakai fallback bila form belum bisa menghitung (mis. setelah reload dgn form kosong).
interface SimRowSnap { sheets: number; modal: number; modalPcs: number; jual: number; jualPcs: number }
interface SimRow { id: number; jumlah: number; profit: number; snap: SimRowSnap }

// Rupiah bulat (tabel simulasi)
const fmtRp = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`

// Format tanggal riwayat potong kertas (gaya Riwayat Invoice: 05 Jun 2025)
function formatTanggalRiwayat(value?: string | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
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
  quantity: string
  jumlahPesanan: string
  berapaMata: string
  setelanKertas: string
  printName: string
  isCustomPaper: boolean
  optimizationMode: string
}

function getInitialFormState(): FormData {
  if (typeof window === 'undefined') {
    return {
      paperWidth: '', paperHeight: '', cutWidth: '', cutHeight: '',
      selectedCustomerId: '', selectedPaperId: '', grammage: '', pricePerSheet: '',
      quantity: '', jumlahPesanan: '', berapaMata: '', setelanKertas: '', printName: '', isCustomPaper: false, optimizationMode: 'maximal',
    }
  }
  try {
    const savedVersion = localStorage.getItem(STORAGE_VERSION_KEY())
    if (savedVersion && savedVersion !== STORAGE_VERSION) {
      localStorage.removeItem(STORAGE_KEY())
      localStorage.removeItem(STORAGE_RESULTS_KEY())
      localStorage.setItem(STORAGE_VERSION_KEY(), STORAGE_VERSION)
    }
    const saved = localStorage.getItem(STORAGE_KEY())
    if (saved) return JSON.parse(saved)
  } catch {}
  return {
    paperWidth: '', paperHeight: '', cutWidth: '', cutHeight: '',
    selectedCustomerId: '', selectedPaperId: '', grammage: '', pricePerSheet: '',
    quantity: '', jumlahPesanan: '', berapaMata: '', setelanKertas: '', printName: '', isCustomPaper: false, optimizationMode: 'maximal',
  }
}

// Compact styles (mobile larger, desktop compact)
const inp = "w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-1.5 focus:ring-blue-500 focus:border-transparent bg-card"
const inpDisabled = "w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm text-slate-500 bg-slate-100 cursor-not-allowed"
const lbl = "text-xs font-medium text-slate-600 mb-0.5 block"
// Harga per pcs: tampilkan 2 desimal bila < Rp1.000 (kertas murah bisa < Rp1/pcs)
const fmtHargaPcs = (n: number) => `Rp ${n.toLocaleString('id-ID', { maximumFractionDigits: n > 0 && n < 1000 ? 2 : 0 })}`

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

  // ===== Simulasi Cepat: ketik jumlah pesanan baru (+ profit) — harga langsung muncul tanpa hitung ulang =====
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

  const waWindowRef = useRef<Window | null>(null)

  // Flag to skip selectedPaper useEffect during restore
  const isRestoringRef = useRef(false)

  // Riwayat states
  const [savingRiwayat, setSavingRiwayat] = useState(false)
  // Foto lampiran perhitungan (data URL JPEG ≤300KB; ikut tersimpan di riwayat)
  const [photoUrl, setPhotoUrl] = useState('')
  const [restoredRiwayatId, setRestoredRiwayatId] = useState<string | null>(null)
  const [needsRecalc, setNeedsRecalc] = useState(false)
  const justCalculatedRef = useRef(false)
  const [riwayatList, setRiwayatList] = useState<any[]>([])
  const [backupLoading, setBackupLoading] = useState<string | null>(null)
  const [nextPotongKertasNumber, setNextPotongKertasNumber] = useState('')
  const [activeTab, setActiveTab] = useState<'editor' | 'riwayat'>('editor')

  // Riwayat tab UI states (periode + pencarian, gaya halaman Laporan Penjualan)
  const [loadingRiwayat, setLoadingRiwayat] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [period, setPeriod] = useState<RiwayatPeriod>('today')
  const [month, setMonth] = useState<number | null>(new Date().getMonth() + 1)
  const [year, setYear] = useState<number | null>(new Date().getFullYear())

  // Label & rentang tanggal efektif sesuai mode periode terpilih
  const periodLabel = riwayatPeriodText(period, dateFrom, dateTo, month, year)
  const eff = riwayatDateRange(period, dateFrom, dateTo, month, year)

  // Filter riwayat: periode (rentang efektif) + pencarian (No. PK / customer / barang / kertas)
  const filteredRiwayatList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q && !eff.dateFrom && !eff.dateTo) return riwayatList
    return riwayatList.filter((r: any) => {
      const t = (r.createdAt || '').slice(0, 10)
      if (eff.dateFrom && t && t < eff.dateFrom) return false
      if (eff.dateTo && t && t > eff.dateTo) return false
      if (q) {
        const hay = `${r?.nomorUrut || ''} ${r?.namaCustomer || ''} ${r?.namaCetakan || ''} ${r?.paperName || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [riwayatList, searchQuery, eff.dateFrom, eff.dateTo])

  // Total harga seluruh riwayat pada periode terpilih
  const totalRiwayat = useMemo(
    () => filteredRiwayatList.reduce((sum: number, r: any) => sum + (Number(r?.totalPrice) || 0), 0),
    [filteredRiwayatList]
  )

  const filtersActive = period !== 'all' || !!dateFrom || !!dateTo || !!searchQuery.trim()

  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewRiwayatData, setPreviewRiwayatData] = useState<CuttingResult | null>(null)
  const [previewRiwayatInfo, setPreviewRiwayatInfo] = useState<{ customer: string; paper: string; jumlahPesanan: string; berapaMata: string; setelanKertas: string }>({ customer: '-', paper: '-', jumlahPesanan: '', berapaMata: '', setelanKertas: '' })
  const [previewRiwayatRow, setPreviewRiwayatRow] = useState<any>(null)
  const [pkPhotoZoom, setPkPhotoZoom] = useState(false)
  // Foto lampiran aktif untuk popup preview: mode riwayat pakai photoUrl baris riwayat, mode editor pakai foto di form
  const previewPhotoUrl = previewRiwayatData ? ((previewRiwayatRow?.photoUrl as string) || '') : photoUrl
  const [isGeneratingJpg, setIsGeneratingJpg] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  // Auto-persist form data to localStorage
  const formData: FormData = {
    paperWidth, paperHeight, cutWidth, cutHeight,
    selectedCustomerId, selectedPaperId, grammage, pricePerSheet,
    quantity, jumlahPesanan, berapaMata, setelanKertas, printName, isCustomPaper, optimizationMode,
  }

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY(), JSON.stringify(formData))
  }, [formData])

  // Mark needsRecalc when any form field changes
  // (defined as ref+state pair; the useEffect is placed after customerInput declaration)
  const restoreDoneRef = useRef(false)

  const fetchPapersData = () => {
    authFetch('/api/papers')
      .then(res => { if (!res.ok) return []; return res.json() })
      .then(data => { if (Array.isArray(data)) setPapers(data); else setPapers([]) })
      .catch(() => setPapers([]))
  }

  const fetchCustomersData = () => {
    authFetch('/api/customers')
      .then(res => { if (!res.ok) return []; return res.json() })
      .then(data => { if (Array.isArray(data)) setCustomers(data); else setCustomers([]) })
      .catch(() => setCustomers([]))
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

  // Customer combobox state
  const [customerInput, setCustomerInput] = useState(() => {
    if (typeof window === 'undefined') return ''
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY()) || '{}')
      const cid = saved.selectedCustomerId
      if (cid) {
        const c = customers.find(p => p.id === cid)
        return c?.name || ''
      }
    } catch {}
    return ''
  })
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false)
  const [customerTyping, setCustomerTyping] = useState(false)
  const customerInputRef = useRef<HTMLInputElement>(null)
  const customerDropdownRef = useRef<HTMLDivElement>(null)
  const customerWrapperRef = useRef<HTMLDivElement>(null)
  const [isSavingCustomer, setIsSavingCustomer] = useState(false)

  // Mark needsRecalc when any form field changes (after initial calculation or restore)
  useEffect(() => {
    if (justCalculatedRef.current) {
      justCalculatedRef.current = false
      return
    }
    if (results) {
      setNeedsRecalc(true)
    }
  }, [paperWidth, paperHeight, cutWidth, cutHeight, grammage, pricePerSheet, quantity, jumlahPesanan, berapaMata, setelanKertas, printName, optimizationMode, selectedCustomerId, selectedPaperId, customerInput])

  const filteredCustomersList = customerTyping
    ? customers.filter(c => c.name.toLowerCase().includes(customerInput.toLowerCase()))
    : customers

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (customerWrapperRef.current && !customerWrapperRef.current.contains(e.target as Node)) {
        setCustomerDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Sync customerInput when customers load or restore
  useEffect(() => {
    if (selectedCustomerId) {
      const c = customers.find(cu => cu.id === selectedCustomerId)
      if (c) setCustomerInput(c.name)
    }
  }, [customers])

  const handleCustomerSelect = (customer: any) => {
    setSelectedCustomerId(customer.id)
    setCustomerInput(customer.name)
    setCustomerTyping(false)
    setCustomerDropdownOpen(false)
  }

  const handleCustomerInputChange = (value: string) => {
    setCustomerInput(value)
    setCustomerTyping(true)
    // If user clears input, deselect
    if (!value.trim()) {
      setSelectedCustomerId('')
    } else {
      // If matches an existing customer exactly, select it
      const exactMatch = customers.find(c => c.name.toLowerCase() === value.trim().toLowerCase())
      if (exactMatch) {
        setSelectedCustomerId(exactMatch.id)
      } else {
        setSelectedCustomerId('')
      }
    }
    setCustomerDropdownOpen(true)
  }

  const handleCustomerInputFocus = () => {
    setCustomerTyping(false)
    setCustomerDropdownOpen(true)
  }

  const handleCustomerInputBlur = () => {
    setTimeout(() => {
      setCustomerDropdownOpen(false)
      // Auto-save new customer if not empty and not matching existing
      const trimmed = customerInput.trim()
      if (!trimmed) return
      const match = customers.find(c => c.name.toLowerCase() === trimmed.toLowerCase())
      if (match) {
        setSelectedCustomerId(match.id)
        setCustomerInput(match.name)
        return
      }
      // No match - save new customer
      if (isSavingCustomer) return
      saveNewCustomer(trimmed)
    }, 200)
  }

  const saveNewCustomer = async (name: string) => {
    setIsSavingCustomer(true)
    try {
      const res = await fetcher('/api/customers', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), companyName: '', address: '', phone: '', email: '' })
      })
      if (res.ok) {
        const newCustomer = await res.json()
        setCustomers(prev => [newCustomer, ...prev])
        setSelectedCustomerId(newCustomer.id)
        setCustomerInput(newCustomer.name)
        toast.success(`Customer "${name}" berhasil ditambahkan!`)
        notifyDataChange('customers')
      } else {
        const errData = await res.json().catch(() => null)
        console.error('Save customer error:', res.status, errData)
        toast.error(errData?.error || `Gagal menambahkan customer baru (${res.status})`)
      }
    } catch (err) {
      console.error('Save customer exception:', err)
      toast.error('Gagal menambahkan customer baru')
    }
    setIsSavingCustomer(false)
  }

  const handleAddNewCustomerClick = (e: React.MouseEvent) => {
    e.preventDefault()
    const trimmed = customerInput.trim()
    if (!trimmed) return
    const match = customers.find(c => c.name.toLowerCase() === trimmed.toLowerCase())
    if (match) {
      setSelectedCustomerId(match.id)
      setCustomerInput(match.name)
      setCustomerDropdownOpen(false)
      return
    }
    setCustomerDropdownOpen(false)
    saveNewCustomer(trimmed)
  }

  useEffect(() => {
    if (selectedPaper && !isRestoringRef.current) {
      requestAnimationFrame(() => {
        setGrammage(selectedPaper.grammage.toString())
        setPricePerSheet(Math.round(selectedPaper.pricePerRim / 500).toString())
        setPaperWidth(selectedPaper.width.toString())
        setPaperHeight(selectedPaper.height.toString())
        setIsCustomPaper(false)
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
    } else {
      setSelectedPaperId(value)
      setIsCustomPaper(false)
    }
  }

  // Inti perhitungan potongan — bisa dipanggil dari tombol Hitung maupun Simulasi Cepat
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

  // ===== Simulasi Cepat — hitung harga untuk jumlah pesanan lain tanpa mengubah form utama =====
  const simJumlah = parseInt(simJumlahInput) || 0
  const simProfitVal = simProfitInput.trim() === '' ? 0 : (parseFloat(simProfitInput) || 0)

  // Hitung hasil simulasi utk kombinasi jumlah & profit tertentu (null = form belum bisa menghitung).
  // Dipakai hasil live sambil mengetik DAN setiap baris Tabel Simulasi.
  const computeSimulasi = useCallback((jumlah: number, profit: number) => {
    if (jumlah <= 0) return null
    const bm = parseInt(berapaMata) || 0
    const qty = bm > 0 ? Math.ceil(jumlah / bm) : jumlah
    if (qty <= 0) return null
    const pw = parseFloat(paperWidth) || 0
    const ph = parseFloat(paperHeight) || 0
    const cw = parseFloat(cutWidth) || 0
    const ch = parseFloat(cutHeight) || 0
    const price = parseFloat(pricePerSheet) || 0
    const totalQty = qty + (parseInt(setelanKertas) || 0)
    if (pw <= 0 || ph <= 0 || cw <= 0 || ch <= 0 || cw > pw || ch > ph || totalQty <= 0 || price <= 0) return null
    try {
      const r = calculateCuts({ paperWidth: pw, paperHeight: ph, cutWidth: cw, cutHeight: ch, quantity: totalQty, pricePerSheet: price, optimizationMode, customerName: '', paperMaterial: '', grammage: 0 })
      const profitAmount = r.totalPrice * (profit / 100)
      const hargaJual = r.totalPrice + profitAmount
      return { sheetsNeeded: r.sheetsNeeded, hargaKertas: r.totalPrice, profit: profitAmount, hargaJual, hargaPerPcs: hargaJual / jumlah, modalPerPcs: r.totalPrice / jumlah }
    } catch { return null }
  }, [berapaMata, paperWidth, paperHeight, cutWidth, cutHeight, pricePerSheet, setelanKertas, optimizationMode])

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

  // Terapkan jumlah pesanan simulasi ke form utama + hitung potongan langsung
  const applySimulasiPotongValues = async (jumlah: number) => {
    if (jumlah <= 0) { toast.error('Ketik jumlah pesanan simulasi terlebih dahulu'); return }
    const bm = parseInt(berapaMata) || 0
    const qty = bm > 0 ? Math.ceil(jumlah / bm) : jumlah
    setJumlahPesanan(String(jumlah))
    setQuantity(String(qty))
    await runCuttingCalc(qty)
    toast.success(`Simulasi diterapkan: ${jumlah.toLocaleString('id-ID')} pcs`)
  }

  // ===== CRUD Tabel Simulasi =====
  // Create: tambahkan hasil simulasi yg sedang diketik sebagai baris baru
  const addSimulasiRow = () => {
    if (!simulasi || simJumlah <= 0) { toast.error('Ketik jumlah pesanan simulasi terlebih dahulu'); return }
    if (simRows.some(r => r.jumlah === simJumlah && r.profit === simProfitVal)) { toast.error('Simulasi dengan jumlah & profit ini sudah ada di tabel'); return }
    const row: SimRow = { id: Date.now(), jumlah: simJumlah, profit: simProfitVal, snap: { sheets: simulasi.sheetsNeeded, modal: simulasi.hargaKertas, modalPcs: simulasi.modalPerPcs, jual: simulasi.hargaJual, jualPcs: simulasi.hargaPerPcs } }
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
      return { ...r, jumlah: j, profit: p, snap: v ? { sheets: v.sheetsNeeded, modal: v.hargaKertas, modalPcs: v.modalPerPcs, jual: v.hargaJual, jualPcs: v.hargaPerPcs } : r.snap }
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

  const handleReset = () => {
    if (!confirm('Reset semua data yang sudah diisi?')) return
    setPaperWidth('')
    setPaperHeight('')
    setCutWidth('')
    setCutHeight('')
    setSelectedCustomerId('')
    setSelectedPaperId('')
    setGrammage('')
    setPricePerSheet('')
    setQuantity('')
    setJumlahPesanan('')
    setBerapaMata('')
    setSetelanKertas('')
    setPrintName('')
    setIsCustomPaper(false)
    setRestoredPaperName(null)
    setResults(null)
    setOptimizationMode('maximal')
    setCustomerInput('')
    setRestoredRiwayatId(null)
    setNeedsRecalc(false)
    restoreDoneRef.current = false
    localStorage.removeItem(STORAGE_KEY())
    localStorage.removeItem(STORAGE_RESULTS_KEY())
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

  const buildPayload = () => ({
    namaCustomer: selectedCustomer?.name || '-',
    resultData: results ? JSON.stringify(results) : '',
    namaCetakan: printName || '-',
    paperName: selectedPaper?.name || restoredPaperName || 'Custom',
    paperId: selectedPaper?.id || '',
    grammage: grammage || '0',
    paperWidth: paperWidth || '0',
    paperHeight: paperHeight || '0',
    cutWidth: cutWidth || '0',
    cutHeight: cutHeight || '0',
    quantity: quantity || '0',
    setelanKertas: setelanKertas || '0',
    sheetsNeeded: results?.sheetsNeeded?.toString() || '0',
    totalPrice: results?.totalPrice || 0,
    pricePerSheet: parseFloat(pricePerSheet) || 0,
    efficiency: results?.efficiency || 0,
    strategy: results?.strategy || '',
    jumlahPesanan: jumlahPesanan || '',
    berapaMata: berapaMata || '',
    photoUrl,
  })

  const isDataSameAsAnyRiwayat = () => {
    if (riwayatList.length === 0) return false
    return riwayatList.some(r =>
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
        toast.success('Riwayat berhasil disimpan!', { description: 'Data form tetap — cukup ketik jumlah pesanan baru untuk hitungan berikutnya.' })
        notifyDataChange('riwayat-potong-kertas')
        fetchRiwayat()
        fetchNextNumber()
        // Form TIDAK direset: parameter lama tetap terpakai (cukup ubah jumlah pesanan / profit di Simulasi Cepat).
        setRestoredRiwayatId(null)
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
      const existing = riwayatList.find(r =>
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
        toast.success('Riwayat berhasil diupdate!', { description: 'Data form tetap — cukup ketik jumlah pesanan baru untuk hitungan berikutnya.' })
        notifyDataChange('riwayat-potong-kertas')
        fetchRiwayat()
        // Form TIDAK direset: parameter lama tetap terpakai (cukup ubah jumlah pesanan / profit di Simulasi Cepat).
        setRestoredRiwayatId(null)
      } else {
        toast.error('Gagal mengupdate riwayat')
      }
    } catch {
      toast.error('Gagal mengupdate riwayat')
    }
    setSavingRiwayat(false)
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
    setJumlahPesanan(r.jumlahPesanan || '')
    setBerapaMata(r.berapaMata || '')
    // Foto lampiran ikut di-restore ke editor
    setPhotoUrl(r.photoUrl || '')

    // Set paper selection
    let restoredPaper = null
    if (r.paperId && papers.find(p => p.id === r.paperId)) {
      setSelectedPaperId(r.paperId)
      setIsCustomPaper(false)
      restoredPaper = papers.find(p => p.id === r.paperId)
      setRestoredPaperName(null)
    } else {
      setSelectedPaperId('custom')
      setIsCustomPaper(true)
      setRestoredPaperName(r.paperName || null)
    }

    // Match customer by name
    let restoredCustomer = null
    if (r.namaCustomer && r.namaCustomer !== '-') {
      const match = customers.find(c => c.name === r.namaCustomer)
      if (match) {
        setSelectedCustomerId(match.id)
        setCustomerInput(match.name)
        restoredCustomer = match
      } else {
        setSelectedCustomerId('')
        setCustomerInput(r.namaCustomer)
      }
    } else {
      setSelectedCustomerId('')
      setCustomerInput('')
    }

    // Auto-calculate cuts with restored values
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

  // Nilai tampilan per baris: live bila bisa dihitung, fallback ke snapshot saat disimpan
  const simRowQtyOf = (jumlah: number) => {
    const bm = parseInt(berapaMata) || 0
    return bm > 0 ? Math.ceil(jumlah / bm) : jumlah
  }
  const simRowView = (row: SimRow) => {
    const live = simRowValues.get(row.id)
    return {
      qty: simRowQtyOf(row.jumlah),
      sheets: live ? live.sheetsNeeded : row.snap.sheets,
      modal: live ? live.hargaKertas : row.snap.modal,
      modalPcs: live ? live.modalPerPcs : row.snap.modalPcs,
      jual: live ? live.hargaJual : row.snap.jual,
      jualPcs: live ? live.hargaPerPcs : row.snap.jualPcs,
    }
  }
  const simThClass = 'h-7 px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 lg:h-8 lg:px-2.5 lg:text-[11px]'
  const simTdClass = 'px-1.5 py-1 text-[10.5px] lg:px-2.5 lg:py-1.5 lg:text-xs'
  const simEditInputClass = 'border border-blue-300 dark:border-blue-700 rounded px-1 py-0.5 text-[10.5px] lg:text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-1 focus:ring-blue-500'

  // ===== Kartu Simulasi Cepat — tabel CRUD perbandingan jumlah pesanan =====
  const simulasiCard = (
    <div className="bg-card rounded-xl border border-slate-200 p-2.5 space-y-1.5 lg:p-4 lg:space-y-2.5">
      <div className="flex items-center gap-1.5">
        <Calculator className="w-3.5 h-3.5 text-blue-600" />
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Simulasi Cepat</p>
        {simRows.length > 0 && (
          <span className="text-[9px] font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded-full">{simRows.length} baris</span>
        )}
        <span className="text-[9px] font-medium text-slate-400 ml-auto">Tanpa hitung ulang</span>
      </div>
      <p className="text-[10px] lg:text-xs leading-snug text-slate-500 dark:text-slate-400">Ketik jumlah pesanan (+ profit) lalu klik Tambah — bandingkan beberapa jumlah dalam tabel. Nilai mengikuti parameter form saat ini.</p>
      {/* Create: ketik jumlah + profit, tambahkan sebagai baris baru */}
      <div className="flex gap-1.5 items-end">
        <div className="flex-1 min-w-0">
          <label className={lbl}>Jumlah Pesanan</label>
          <input ref={simJumlahRef} type="number" step="1" min="0" inputMode="numeric" placeholder="misal: 5000" value={simJumlahInput} onChange={(e) => setSimJumlahInput(e.target.value)} className={inp} />
        </div>
        <div className="w-[76px] lg:w-32 flex-shrink-0">
          <label className={lbl}>Profit (%)</label>
          <input type="number" step="0.1" min="0" max="100" inputMode="decimal" placeholder="0" value={simProfitInput} onChange={(e) => setSimProfitInput(e.target.value)} className={inp} />
        </div>
        <button onClick={addSimulasiRow} disabled={!simulasi} title="Tambahkan ke tabel simulasi" className="flex-shrink-0 h-[34px] px-3 flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-500 text-white text-xs font-semibold rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" />
          Tambah
        </button>
      </div>
      {/* Read: hasil live sambil mengetik + Terapkan langsung tanpa perlu tambah baris */}
      {simulasi ? (
        <div className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 px-2 py-1.5 flex items-center justify-between gap-2">
          <p className="text-[10px] lg:text-xs leading-snug min-w-0">
            <span className="text-slate-500 dark:text-slate-400">Modal </span>
            <span className="font-semibold text-slate-800 dark:text-slate-100">{fmtRp(simulasi.hargaKertas)}</span>
            <span className="text-slate-400"> ({fmtHargaPcs(simulasi.modalPerPcs)}/pcs)</span>
            {simProfitVal > 0 && <span className="font-semibold text-amber-700 dark:text-amber-400"> +{simProfitVal}%</span>}
            <span className="text-slate-500 dark:text-slate-400"> → Jual </span>
            <span className="font-bold text-emerald-700 dark:text-emerald-400">{fmtRp(simulasi.hargaJual)}</span>
            <span className="text-slate-400"> ({fmtHargaPcs(simulasi.hargaPerPcs)}/pcs)</span>
            {simulasi.sheetsNeeded > 0 && <span className="text-slate-400"> · {simulasi.sheetsNeeded.toLocaleString('id-ID')} lbr</span>}
          </p>
          <button onClick={() => applySimulasiPotongValues(simJumlah)} disabled={isCalculating} title="Terapkan ke form utama" className="flex-shrink-0 h-6 px-2 rounded-md bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-[10px] font-semibold flex items-center gap-1">
            {isCalculating ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
            Terapkan
          </button>
        </div>
      ) : simJumlah > 0 ? (
        <p className="text-[10px] lg:text-xs text-amber-600">Lengkapi ukuran kertas, potongan &amp; harga per lembar di form agar simulasi bisa dihitung.</p>
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
                  const v = editLive ? { qty: simRowQtyOf(parseInt(simEditJumlah) || 0), sheets: editLive.sheetsNeeded, modal: editLive.hargaKertas, modalPcs: editLive.modalPerPcs, jual: editLive.hargaJual, jualPcs: editLive.hargaPerPcs } : simRowView(row)
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
                      <TableCell className={`${simTdClass} text-right text-slate-800 dark:text-slate-100`}>{v.modal > 0 ? fmtRp(v.modal) : '–'}</TableCell>
                      <TableCell className={`${simTdClass} text-right text-slate-600 dark:text-slate-300`}>{v.modalPcs > 0 ? fmtHargaPcs(v.modalPcs) : '–'}</TableCell>
                      <TableCell className={`${simTdClass} text-right font-bold text-emerald-700 dark:text-emerald-400`}>{v.jual > 0 ? fmtRp(v.jual) : '–'}</TableCell>
                      <TableCell className={`${simTdClass} text-right text-emerald-700 dark:text-emerald-400`}>{v.jualPcs > 0 ? fmtHargaPcs(v.jualPcs) : '–'}</TableCell>
                      <TableCell className={simTdClass}>
                        <div className="flex items-center justify-center gap-0.5">
                          {isEditing ? (
                            <>
                              <button onClick={saveEditSimulasi} title="Simpan perubahan" aria-label="Simpan perubahan" className="p-1 text-emerald-600 hover:text-emerald-800 dark:text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /></button>
                              <button onClick={cancelEditSimulasi} title="Batal" aria-label="Batal ubah" className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"><X className="w-3.5 h-3.5" /></button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => applySimulasiPotongValues(row.jumlah)} disabled={isCalculating} title="Terapkan ke form utama" aria-label="Terapkan ke form" className="p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 disabled:opacity-40"><CheckCircle2 className="w-3.5 h-3.5" /></button>
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
    <DashboardLayout
      title={t('potong_kertas')}
      subtitle={t('subtitle_potong_kertas')}
    >
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
          {/* No Potong Kertas */}
          {nextPotongKertasNumber && (
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider whitespace-nowrap">No. Potong Kertas :</span>
              <span className="text-sm font-bold text-black dark:text-white">{nextPotongKertasNumber}</span>
            </div>
          )}
          {/* Info Cetak */}
          <div className="bg-card rounded-xl border border-slate-200 p-2.5">
            <div className="space-y-1.5">
              <div className="space-y-1.5">
                <div className="relative">
                  <label className={lbl}>{t('nama_customer')}</label>
                  <div ref={customerWrapperRef} className="relative">
                    <input
                      ref={customerInputRef}
                      type="text"
                      placeholder={t('pilih_customer') + ' / ketik nama baru...'}
                      value={customerInput}
                      onChange={(e) => handleCustomerInputChange(e.target.value)}
                      onFocus={handleCustomerInputFocus}
                      onBlur={handleCustomerInputBlur}
                      className={inp + ' pr-9' + (isSavingCustomer ? ' opacity-60' : '')}
                    />
                    {/* Dropdown chevron icon - clickable */}
                    {!isSavingCustomer && (
                      <button
                        type="button"
                        tabIndex={-1}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        onMouseDown={(e) => { e.preventDefault(); setCustomerTyping(false); setCustomerDropdownOpen(!customerDropdownOpen); }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                    )}
                    {isSavingCustomer && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      </div>
                    )}
                    {/* Dropdown list */}
                    {customerDropdownOpen && (
                      <div ref={customerDropdownRef} className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {/* Existing customers */}
                        {filteredCustomersList.length > 0 && (
                          <div>
                            <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase bg-slate-50 border-b border-slate-100">Master Customer</div>
                            {filteredCustomersList.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onMouseDown={(e) => { e.preventDefault(); handleCustomerSelect(c) }}
                                className={`w-full text-left px-3 py-2 text-sm transition-colors truncate ${selectedCustomerId === c.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'}`}
                              >
                                {c.name}
                              </button>
                            ))}
                          </div>
                        )}
                        {/* Add new customer option */}
                        {customerInput.trim() && !customers.find(c => c.name.toLowerCase() === customerInput.trim().toLowerCase()) && (
                          <button
                            type="button"
                            onMouseDown={handleAddNewCustomerClick}
                            className="w-full text-left px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 transition-colors border-t border-slate-100 flex items-center gap-2"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            Tambah "<span className="truncate max-w-[140px]">{customerInput.trim()}</span>" sebagai customer baru
                          </button>
                        )}
                        {/* No results */}
                        {filteredCustomersList.length === 0 && !customerInput.trim() && (
                          <div className="px-3 py-3 text-sm text-slate-400 text-center">Tidak ada customer</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className={lbl}>{t('nama_cetakan')}</label>
                  <input type="text" placeholder="Nama cetakan" value={printName} onChange={(e) => setPrintName(e.target.value)} className={inp} />
                </div>
              </div>
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
                    {papers.map((p) => (<SelectItem key={p.id} value={p.id}><span className="text-[14px]">{p.name} ({p.width}×{p.height}, {p.grammage}gsm)</span></SelectItem>))}
                  </SelectContent>
                </Select>
                {isCustomPaper && restoredPaperName && (
                  <p className="text-[11px] text-amber-600 mt-0.5 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Bahan tidak ditemukan di master data
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={lbl}>{t('gramatur')}</label>
                  <input type="number" step="1" min="0" placeholder="150" value={grammage} onChange={(e) => setGrammage(e.target.value)} className={inp} />
                </div>
                <div>
                  <label className={lbl}>{t('harga_per_lembar')}</label>
                  <input type="number" step="0.01" min="0" placeholder="0" value={pricePerSheet} onChange={(e) => setPricePerSheet(e.target.value)} className={inp} />
                </div>
              </div>
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

          {/* Ukuran */}
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

          {/* Foto Lampiran */}
          <div className="bg-card rounded-xl border border-slate-200 p-2.5">
            <PhotoUpload value={photoUrl} onChange={setPhotoUrl} label="Foto Lampiran" />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-2">
              <button onClick={handleCalculateCuts} disabled={isCalculating || !(parseFloat(paperWidth) > 0) || !(parseFloat(paperHeight) > 0) || !(parseFloat(cutWidth) > 0) || !(parseFloat(cutHeight) > 0) || !(parseInt(computedQuantity || quantity) > 0)}
                className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
                {isCalculating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {t('hitung_potongan')}
              </button>
              <button onClick={restoredRiwayatId ? handleUpdateRiwayat : handleSaveRiwayat} disabled={!results || savingRiwayat || needsRecalc}
                className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors" title={restoredRiwayatId ? 'Update Riwayat' : 'Simpan Riwayat'}>
                {restoredRiwayatId && <RefreshCw className={`w-3 h-3 ${savingRiwayat ? 'animate-spin' : ''}`} />}
                {restoredRiwayatId ? (savingRiwayat ? 'Updating...' : 'Update Riwayat') : (savingRiwayat ? 'Menyimpan...' : 'Simpan Riwayat')}
              </button>
              <button onClick={handlePO} disabled={!results || savingRiwayat || needsRecalc}
                className="flex items-center justify-center gap-1.5 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors" title="Purchase Order">
                <FileText className="w-3.5 h-3.5" />
                PO
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <button onClick={() => { if (!results) { toast.error('Hitung potongan terlebih dahulu!'); return; } setPreviewOpen(true) }} disabled={!results || needsRecalc}
                className="flex items-center justify-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors" title={t('preview')}>
                {t('preview')}
              </button>
              <button onClick={handlePrint} disabled={isPrinting || !results || needsRecalc}
                className="flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors" title={t('cetak')}>
                {isPrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                {t('cetak')}
              </button>
              <button onClick={handleShareWhatsApp} disabled={!results || needsRecalc}
                className="flex items-center justify-center gap-1 min-w-0 bg-green-600 hover:bg-green-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors" title="WhatsApp">
                <Share2 className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden xl:inline">WhatsApp</span>
                <span className="xl:hidden">WA</span>
              </button>
              <button onClick={handleReset} disabled={!paperWidth && !paperHeight && !cutWidth && !cutHeight && !computedQuantity && !quantity && !grammage && !pricePerSheet && !printName && !jumlahPesanan && !berapaMata && !customerInput}
                className="flex items-center justify-center gap-1.5 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 disabled:text-slate-300 text-slate-700 text-sm font-semibold py-2.5 rounded-lg transition-colors" title={t('reset')}>
                <RotateCcw className="w-3 h-3" />
                <span className="hidden xl:inline">{t('reset')}</span>
              </button>
            </div>
          </div>

          {/* Simulasi Cepat (mobile): mengikuti alur form di kolom kiri */}
          <div className="lg:hidden">
            {simulasiCard}
          </div>

          {/* Link to Hitung Cetakan */}
          <button
            onClick={() => {
              if (!results) {
                toast.error('Hitung potongan terlebih dahulu!')
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
              if (selectedPaperId && selectedPaperId !== 'custom') params.set('paperId', selectedPaperId)
              if (selectedPaper?.name) params.set('paperName', selectedPaper.name)
              if (grammage) params.set('grammage', grammage)
              if (pricePerSheet) params.set('pricePerSheet', pricePerSheet)
              if (cutWidth) params.set('cutWidth', cutWidth)
              if (cutHeight) params.set('cutHeight', cutHeight)
              if (results?.totalPrice) params.set('totalPaperPrice', results.totalPrice.toString())
              if (results?.sheetsNeeded) params.set('sheetsNeeded', results.sheetsNeeded.toString())
              if (results?.totalPieces) params.set('totalPieces', results.totalPieces.toString())
              if (results?.efficiency) params.set('efficiency', results.efficiency.toString())
              params.set('fromPotongKertas', '1')
              params.set('reset', '1')
              // Foto lampiran ikut dibawa ke editor Hitung Cetakan.
              // Data URL (≤300KB) terlalu besar untuk query string → kirim via sessionStorage.
              if (photoUrl) sessionStorage.setItem('pk-to-hc-photoUrl', photoUrl)
              else sessionStorage.removeItem('pk-to-hc-photoUrl')
              router.push(`/hitung-cetakan?${params.toString()}`)
              // Simpan riwayat di background (non-blocking)
              if (results && !isDataSameAsAnyRiwayat()) {
                fetcher('/api/riwayat-potong-kertas', {
                  method: 'POST',
                  headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                  body: JSON.stringify(buildPayload())
                }).then(res => { if (res.ok) fetchRiwayat() }).catch(() => {})
              }
            }}
            disabled={!results || needsRecalc}
            style={{
              background: (results && !needsRecalc) ? 'linear-gradient(135deg, #2563eb, #3b82f6, #2563eb)' : undefined,
            }}
            className="flex items-center justify-center gap-1.5 text-white disabled:bg-slate-200 disabled:text-slate-400 disabled:border-slate-200 text-sm font-semibold py-3 rounded-lg border border-blue-500 cursor-pointer transition-colors">
            <Calculator className="w-3.5 h-3.5" />
            Hitung Cetakan Lengkap
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {/* ===== RIGHT: RESULTS ===== */}
        <div className="flex-1 bg-card rounded-xl border border-slate-200 p-4 flex flex-col lg:min-h-0 lg:min-h-[calc(100vh-8rem+2cm)]">
          {results ? (
            <div className="flex-1 flex flex-col gap-1.5 lg:min-h-0 lg:overflow-hidden">
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
                  <CuttingDiagram results={results} />
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

      {/* Simulasi Cepat (desktop): kotak lebar penuh memenuhi lebar layar */}
      <div className="hidden lg:block mt-3">
        {simulasiCard}
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

          {/* Filter: periode + pencarian SATU BARIS — mobile collapsible */}
          <RiwayatFilterCard activeCount={(period !== 'all' ? 1 : 0) + (searchQuery.trim() !== '' ? 1 : 0)}>
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
                rightSlot={
                  <div className="flex items-center gap-1.5">
                    <div className="relative w-52 sm:w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" aria-hidden="true" />
                      <Input
                        id="riwayat-pk-search"
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Cari no. PK / customer / barang…"
                        aria-label="Cari riwayat potong kertas"
                        className="pl-9 min-h-[44px] bg-white"
                      />
                    </div>
                    {filtersActive && (
                      <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={() => { setPeriod('today'); setDateFrom(''); setDateTo(''); setSearchQuery('') }} aria-label="Reset filter" title="Reset Filter">
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                }
              />
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
              desc={filtersActive ? 'Coba ubah filter periode atau kata kunci pencarian.' : 'Hasil hitung yang disimpan akan tampil di sini'}
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
                        <TableHead className="w-0 min-w-0">No. PK</TableHead>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Nama Barang</TableHead>
                        <TableHead className="hidden lg:table-cell">Kertas</TableHead>
                        <TableHead className="hidden xl:table-cell">Gramatur</TableHead>
                        <TableHead className="hidden xl:table-cell">Uk. Potong</TableHead>
                        <TableHead className="text-right">Jml</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-center">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRiwayatList.slice(0, 100).map((r, i) => (
                        <TableRow
                          key={r.id}
                          className={`cursor-pointer hover:bg-stone-50 ${restoredRiwayatId === r.id ? 'bg-emerald-50/60' : ''}`}
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
                          <TableCell className="hidden xl:table-cell text-muted-foreground whitespace-nowrap">{r.grammage && r.grammage !== '0' ? `${r.grammage} gsm` : '-'}</TableCell>
                          <TableCell className="hidden xl:table-cell text-muted-foreground whitespace-nowrap">{r.cutWidth && r.cutWidth !== '0' ? `${r.cutWidth}×${r.cutHeight}` : '-'}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{parseInt(r.jumlahPesanan || 0).toLocaleString('id-ID')}</TableCell>
                          <TableCell className="text-right tabular-nums font-bold text-emerald-700 whitespace-nowrap">Rp {Math.round(r.totalPrice || 0).toLocaleString('id-ID')}</TableCell>
                          <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
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
                        <p className="font-mono text-xs font-semibold break-all">{r.nomorUrut || '-'}</p>
                        <p className="text-xs text-muted-foreground whitespace-nowrap">{formatTanggalRiwayat(r.createdAt)}</p>
                      </div>
                      <p className="text-sm"><span className="font-medium">{r.namaCustomer && r.namaCustomer !== '-' ? r.namaCustomer : '-'}</span></p>
                      {r.namaCetakan && <p className="text-sm text-muted-foreground truncate">{r.namaCetakan}</p>}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm border-t border-stone-100 pt-2">
                        <p className="text-muted-foreground truncate">Kertas: <span className="font-medium text-stone-700">{r.paperName || '-'}</span></p>
                        <p className="text-muted-foreground text-right sm:text-left">Jml: <span className="font-medium text-stone-700">{parseInt(r.jumlahPesanan || 0).toLocaleString('id-ID')}</span></p>
                        <p className="text-muted-foreground col-span-2">Total: <span className="font-bold text-stone-700">Rp {Math.round(r.totalPrice || 0).toLocaleString('id-ID')}</span></p>
                      </div>
                      <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-2.5">
                        <Button
                          variant="outline"
                          className="flex-1 min-h-[36px] h-8 px-2 gap-1 text-xs text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); handleDeleteRiwayat(r.id) }}
                          title="Hapus"
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

      {/* ===== PREVIEW DIALOG ===== */}
      {previewOpen && (
        <>
        <PreviewDialog
          onClose={() => { setPreviewOpen(false); setPreviewRiwayatData(null); setPreviewRiwayatRow(null); setPreviewRiwayatInfo({ customer: '-', paper: '-', jumlahPesanan: '', berapaMata: '', setelanKertas: '' }) }}
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
                <p className="text-base font-bold text-black">Rp {Math.round(parseFloat(pricePerSheet) || 0).toLocaleString('id-ID')}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-600 font-medium">Harga/Lembar Setelah Dipotong</p>
                <p className="text-base font-bold text-black">Rp {(previewRiwayatData || results)?.totalPieces > 0 ? Math.round((parseFloat(pricePerSheet) || 0) / ((previewRiwayatData || results)?.totalPieces || 1)).toLocaleString('id-ID') : '0'}</p>
              </div>
            </div>

            {/* Strategy */}
            <div data-pk="strategy" className="bg-white border border-slate-200 rounded-lg p-2 mb-3">
              <p className="text-[10px] text-slate-600 font-medium text-center">Strategi Optimasi</p>
              <p className="text-sm font-bold text-black text-center">{previewRiwayatData?.strategy || results?.strategy}</p>
            </div>

            {/* Diagram full-width, di bawahnya Cara Potong + Detail per Blok berdampingan (mengikuti layout cetak A4) */}
            {(previewRiwayatData || results) && (
              <>
                {/* Diagram */}
                <div data-pk="diagram" className="mb-3 w-full">
                  <div className="w-full mx-auto" style={{ maxWidth: '100%' }}>
                    <CuttingDiagram results={previewRiwayatData || results!} maxHeight="320px" />
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
      {simClearDialog}
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
