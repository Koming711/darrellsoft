'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Calculator, Save, Eye, RotateCcw, Printer, FileImage, Loader2, ArrowRight, Share2, History, RefreshCw, Trash2, Plus, FileText } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useLanguage } from '@/contexts/language-context'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import type { Customer, Paper, CuttingResult } from '@/lib/cutting-engine'
import dynamic from 'next/dynamic'
import { getAuthUser } from '@/lib/auth'
import { getAuthHeaders } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'
import { fetcher } from '@/lib/fetcher'
import { notifyDataChange } from '@/lib/data-sync'
import { openWhatsApp } from '@/lib/whatsapp-business'
import { useDataChange } from '@/hooks/use-data-change'

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
const STORAGE_VERSION = 'v7'

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
  nomorPotongKertas: string
}

function getInitialFormState(): FormData {
  if (typeof window === 'undefined') {
    return {
      paperWidth: '', paperHeight: '', cutWidth: '', cutHeight: '',
      selectedCustomerId: '', selectedPaperId: '', grammage: '', pricePerSheet: '',
      quantity: '', jumlahPesanan: '', berapaMata: '', setelanKertas: '', printName: '', isCustomPaper: false, optimizationMode: 'maximal',
      nomorPotongKertas: '',
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
    nomorPotongKertas: '',
  }
}

// Compact styles (mobile larger, desktop compact)
const inp = "w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-1.5 focus:ring-blue-500 focus:border-transparent bg-white"
const inpDisabled = "w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm text-slate-500 bg-slate-100 cursor-not-allowed"
const lbl = "text-xs font-medium text-slate-600 mb-0.5 block"

// Draggable Preview Dialog Component
function DraggablePreviewDialog({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  // Center on mount (mobile: bottom of screen, desktop: center)
  useEffect(() => {
    if (dialogRef.current) {
      const w = dialogRef.current.offsetWidth
      const h = dialogRef.current.offsetHeight
      const isMobile = window.innerWidth < 640
      if (isMobile) {
        setPos({
          x: Math.max(0, (window.innerWidth - w) / 2),
          y: Math.max(0, window.innerHeight - h),
        })
      } else {
        setPos({
          x: Math.max(0, (window.innerWidth - w) / 2),
          y: Math.max(20, (window.innerHeight - h) / 2),
        })
      }
    }
  }, [])

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return
    setDragging(true)
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
  }

  useEffect(() => {
    if (!dragging) return
    const handleMove = (e: MouseEvent) => {
      setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y })
    }
    const handleUp = () => setDragging(false)
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    return () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
  }, [dragging])

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />
      {/* Dialog - on mobile: full screen bottom sheet style, on desktop: centered draggable */}
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className="absolute bg-white rounded-xl border border-slate-200 shadow-2xl max-w-lg w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] max-h-[95vh] sm:max-h-[92vh] flex flex-col sm:rounded-xl rounded-t-xl"
        style={{ left: pos.x, top: pos.y, cursor: dragging ? 'grabbing' : 'default' }}
      >
        {/* Draggable Header */}
        <div
          onMouseDown={handleMouseDown}
          className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-200 bg-slate-50 rounded-t-xl cursor-grab active:cursor-grabbing select-none"
        >
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400" onClick={onClose} />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
            </div>
            <span className="text-xs sm:text-sm font-semibold text-slate-700 ml-2">{title}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1">
          {children}
        </div>
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

  // Extra costs state
  const [extraCosts, setExtraCosts] = useState<{ id: string; name: string; amount: number }[]>([])
  const extraCostsIdRef = useRef(0)
  const waWindowRef = useRef<Window | null>(null)

  // Flag to skip selectedPaper useEffect during restore
  const isRestoringRef = useRef(false)

  // Nomor Potong Kertas (auto-generated)
  const [nomorPotongKertas, setNomorPotongKertas] = useState(initialForm.current.nomorPotongKertas || '')

  // Riwayat states
  const [savingRiwayat, setSavingRiwayat] = useState(false)
  const [restoredRiwayatId, setRestoredRiwayatId] = useState<string | null>(null)
  const [needsRecalc, setNeedsRecalc] = useState(false)
  const justCalculatedRef = useRef(false)
  const [riwayatList, setRiwayatList] = useState<any[]>([])

  // Auto-generate next PK number from riwayat list
  const generateNextPKNumber = useCallback(() => {
    const now = new Date()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const y = String(now.getFullYear()).slice(-2)
    const prefix = `PK/${m}/${y}/`
    // Find the highest number with this prefix
    let maxNum = 0
    for (const r of riwayatList) {
      const nomor = r.nomorPotongKertas || ''
      if (nomor.startsWith(prefix)) {
        const numPart = parseInt(nomor.slice(prefix.length), 10)
        if (numPart > maxNum) maxNum = numPart
      }
    }
    const nextNum = String(maxNum + 1).padStart(4, '0')
    return `${prefix}${nextNum}`
  }, [riwayatList])

  // Generate number on first load or when list loads
  const numberGeneratedRef = useRef(false)
  useEffect(() => {
    if (!numberGeneratedRef.current) {
      setNomorPotongKertas(generateNextPKNumber())
      numberGeneratedRef.current = true
    }
  }, [riwayatList, generateNextPKNumber])

  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewRiwayatData, setPreviewRiwayatData] = useState<CuttingResult | null>(null)
  const [previewRiwayatInfo, setPreviewRiwayatInfo] = useState<{ customer: string; paper: string; jumlahPesanan: string; berapaMata: string; setelanKertas: string }>({ customer: '-', paper: '-', jumlahPesanan: '', berapaMata: '', setelanKertas: '' })
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  // Auto-persist form data to localStorage
  const formData: FormData = {
    paperWidth, paperHeight, cutWidth, cutHeight,
    selectedCustomerId, selectedPaperId, grammage, pricePerSheet,
    quantity, jumlahPesanan, berapaMata, setelanKertas, printName, isCustomPaper, optimizationMode,
    nomorPotongKertas,
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

  useEffect(() => {
    fetchCustomersData()
    fetchPapersData()
    fetchRiwayat()
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

  const handleCalculateCuts = async () => {
    setNeedsRecalc(false)
    justCalculatedRef.current = true
    setIsCalculating(true)
    await new Promise(resolve => setTimeout(resolve, 50))

    const pw = parseFloat(paperWidth)
    const ph = parseFloat(paperHeight)
    const cw = parseFloat(cutWidth)
    const ch = parseFloat(cutHeight)
    const qty = parseInt(computedQuantity || quantity) || 0
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
    setNomorPotongKertas(generateNextPKNumber())
    localStorage.removeItem(STORAGE_KEY())
    localStorage.removeItem(STORAGE_RESULTS_KEY())
    toast.success('Data berhasil direset')
  }

  // === Riwayat functions ===
  const fetchRiwayat = async () => {
    try {
      const res = await fetcher('/api/riwayat-potong-kertas', { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setRiwayatList(Array.isArray(data) ? data : [])
      }
    } catch {}
  }

  const buildPayload = () => ({
    nomorPotongKertas,
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
  })

  const resetFormForRiwayat = () => {
    setRestoredRiwayatId(null)
    setNeedsRecalc(false)
    restoreDoneRef.current = false
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
    setExtraCosts([])
    setNomorPotongKertas(generateNextPKNumber())
    localStorage.removeItem(STORAGE_KEY())
    localStorage.removeItem(STORAGE_RESULTS_KEY())
  }

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
        toast.success('Riwayat berhasil disimpan!')
        notifyDataChange('riwayat-potong-kertas')
        fetchRiwayat()
        resetFormForRiwayat()
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
      toast('Data sudah ada di riwayat, langsung ke Purchase Order.', { description: 'Data yang sama tidak disimpan ulang.' })
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
        router.push(`/purchase-order?riwayatId=${existing.id}`)
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
        toast.success('Riwayat berhasil diupdate!')
        notifyDataChange('riwayat-potong-kertas')
        fetchRiwayat()
        resetFormForRiwayat()
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
        resultData = JSON.parse(r.resultData)
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

  const handleRestore = async (r: any) => {
    // Set flag to prevent selectedPaper useEffect from overriding restored values
    isRestoringRef.current = true
    setRestoredRiwayatId(r.id)
    setNomorPotongKertas(r.nomorPotongKertas || '')
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

    toast.success('Data berhasil di-restore dari riwayat!')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDeleteRiwayat = async (id: string) => {
    if (!confirm('Beneran mau dihapus nih?')) return
    try {
      const res = await fetcher(`/api/riwayat-potong-kertas/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })
      if (res.ok) {
        toast.success('Riwayat berhasil dihapus')
        notifyDataChange('riwayat-potong-kertas')
        if (restoredRiwayatId === id) setRestoredRiwayatId(null)
        fetchRiwayat()
      } else {
        toast.error('Gagal menghapus riwayat')
      }
    } catch {
      toast.error('Gagal menghapus riwayat')
    }
  }

  // Build SVG diagram HTML for print/PDF/WhatsApp
  const buildDiagramHtml = useCallback(() => {
    if (!results) return ''
    const r = results
    const scale = 5.94
    const pw = r.paperWidth
    const ph = r.paperHeight
    const svgW = pw * scale
    const svgH = ph * scale

    const gradients = [
      { id: 'pg1', c1: '#dbeafe', c2: '#bfdbfe' },
      { id: 'pg2', c1: '#d1fae5', c2: '#a7f3d0' },
      { id: 'pg3', c1: '#fef3c7', c2: '#fde68a' },
      { id: 'pg4', c1: '#fecaca', c2: '#fca5a5' },
      { id: 'pg5', c1: '#e9d5ff', c2: '#d8b4fe' },
    ]
    const strokeColors = ['#93c5fd', '#6ee7b7', '#fcd34d', '#fca5a5', '#c4b5fd']

    let defsInner = gradients.map(g =>
      `<linearGradient id="${g.id}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${g.c1}"/><stop offset="100%" stop-color="${g.c2}"/></linearGradient>`
    ).join('')

    let wasteRects = ''
    r.blocks.forEach((block: any, bi: number) => {
      if (block.wasteWidth > 0.01) {
        wasteRects += `<rect x="${(block.x + block.usedWidth) * scale}" y="${block.y * scale}" width="${block.wasteWidth * scale}" height="${block.usedHeight * scale}" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3,2" opacity="0.5" rx="1"/>`
        if (block.wasteHeight > 0.01) {
          wasteRects += `<rect x="${(block.x + block.usedWidth) * scale}" y="${(block.y + block.usedHeight) * scale}" width="${block.wasteWidth * scale}" height="${block.wasteHeight * scale}" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3,2" opacity="0.5" rx="1"/>`
        }
      }
      if (block.wasteHeight > 0.01) {
        wasteRects += `<rect x="${block.x * scale}" y="${(block.y + block.usedHeight) * scale}" width="${block.usedWidth * scale}" height="${block.wasteHeight * scale}" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3,2" opacity="0.5" rx="1"/>`
      }
    })

    let cutLines = ''
    if (r.blocks.length > 1 && r.cutPosition !== undefined) {
      cutLines += `<line x1="${r.cutPosition * scale}" y1="0" x2="${r.cutPosition * scale}" y2="${svgH}" stroke="#f87171" stroke-width="2.5" stroke-dasharray="8,4" opacity="0.8"/>`
    }
    if (r.blocks.length > 1 && r.cutPositionY !== undefined) {
      cutLines += `<line x1="0" y1="${r.cutPositionY * scale}" x2="${svgW}" y2="${r.cutPositionY * scale}" stroke="#f87171" stroke-width="2.5" stroke-dasharray="8,4" opacity="0.8"/>`
    }

    let pieceGroups = ''
    r.blocks.forEach((block: any, bi: number) => {
      const bx = block.x * scale
      const by = block.y * scale
      const pieceW = block.pieceWidth * scale
      const pieceH = block.pieceHeight * scale
      const gId = gradients[bi % gradients.length].id
      const sCol = strokeColors[bi % strokeColors.length]
      let num = 1
      for (let i = 0; i < block.horizontal; i++) {
        for (let j = 0; j < block.vertical; j++) {
          const cx = bx + i * pieceW + pieceW / 2
          const cy = by + j * pieceH + pieceH / 2
          const cr = Math.max(4, Math.min(pieceW, pieceH) / 4)
          pieceGroups += `<g><rect x="${bx + i * pieceW + 1}" y="${by + j * pieceH + 1}" width="${pieceW - 3}" height="${pieceH - 3}" fill="url(#${gId})" stroke="${sCol}" stroke-width="1.5"/><circle cx="${cx}" cy="${cy}" r="${cr}" fill="white" opacity="0.9"/><text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="14" font-weight="500" fill="#64748b">${num++}</text></g>`
        }
      }
    })

    return `<svg viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="xMidYMid meet" style="display:block;max-width:100%;max-height:130mm;border:1px solid #cbd5e1;border-radius:2px;background:linear-gradient(to bottom right,#fff,#f8fafc);"><defs>${defsInner}</defs><rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#f1f5f9" opacity="0.3"/><rect x="0" y="0" width="${svgW}" height="${svgH}" fill="none" stroke="#94a3b8" stroke-width="4" rx="2"/>${cutLines}${wasteRects}${pieceGroups}</svg>`
  }, [results])

  // Build the full print/PDF body HTML
  const buildFullPrintHtml = useCallback(() => {
    if (!results) return ''
    const r = results
    const svgDiagram = buildDiagramHtml()

    const stepsHtml = r.steps.map((step: string, idx: number) =>
      `<div style="display:flex;align-items:flex-start;gap:5px;padding:3px 0;">
        <div style="flex-shrink:0;width:17px;height:17px;background:#2563eb;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;">${idx + 1}</div>
        <span style="font-size:10px;color:#475569;padding-top:1px;line-height:1.4;">${step}</span>
      </div>`
    ).join('')

    const blockColors = [
      { bg: '#eff6ff', border: '#bfdbfe', badgeBg: '#dbeafe', badgeText: '#1d4ed8', name: '#1e40af', detail: '#2563eb' },
      { bg: '#ecfdf5', border: '#a7f3d0', badgeBg: '#d1fae5', badgeText: '#047857', name: '#065f46', detail: '#059669' },
      { bg: '#fffbeb', border: '#fde68a', badgeBg: '#fef3c7', badgeText: '#b45309', name: '#92400e', detail: '#d97706' },
      { bg: '#fff1f2', border: '#fca5a5', badgeBg: '#fecaca', badgeText: '#b91c1c', name: '#991b1b', detail: '#dc2626' },
      { bg: '#faf5ff', border: '#d8b4fe', badgeBg: '#e9d5ff', badgeText: '#7e22ce', name: '#6b21a8', detail: '#9333ea' },
    ]

    const blocksHtml = r.blocks.map((block: any, idx: number) => {
      const c = blockColors[idx % 5]
      return `<div style="border:1px solid ${c.border};background:${c.bg};border-radius:5px;padding:4px 6px;margin-bottom:3px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1px;">
          <span style="font-size:10px;font-weight:700;color:${c.name};">${block.name}</span>
          <span style="padding:1px 6px;background:${c.badgeBg};color:${c.badgeText};border-radius:10px;font-size:8px;font-weight:600;">${block.pieces} pcs</span>
        </div>
        <div style="display:flex;gap:10px;font-size:9px;color:${c.detail};">
          <span>Ukuran: <b>${block.width.toFixed(1)}×${block.height.toFixed(1)}</b></span>
          <span>Layout: <b>${block.horizontal}×${block.vertical}${block.rotated ? ' (90°)' : ''}</b></span>
        </div>
      </div>`
    }).join('')

    const infoDate = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    const customerLabel = selectedCustomer?.name || printName || '-'
    const paperLabel = selectedPaper?.name || restoredPaperName || 'Custom'

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Potong Kertas</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  @page{size:A4;margin:5mm;}
  body{font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#1e293b;width:210mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .page{width:100%;padding:2mm 3mm;}
  @media print{body{width:210mm;}.page{padding:0;}}
</style>
</head><body>
<div class="page">

  <!-- HEADER -->
  <div style="text-align:center;margin-bottom:4mm;padding-bottom:3mm;border-bottom:2px solid #e2e8f0;">
    <div style="font-size:14pt;font-weight:700;color:#0f172a;">Potong Kertas</div>
    <div style="font-size:9pt;color:#64748b;margin-top:1mm;">${customerLabel} · ${paperLabel} · ${infoDate}</div>
  </div>

  <!-- INFO GRID -->
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:2mm;margin-bottom:3mm;">
    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:4px;padding:2.5mm 3mm;">
      <div style="font-size:7.5pt;color:#0284c7;font-weight:500;">Jumlah Pesanan</div>
      <div style="font-size:13pt;font-weight:700;color:#0369a1;">${jumlahPesanan || '-'}</div>
    </div>
    <div style="background:#f5f3ff;border:1px solid #c4b5fd;border-radius:4px;padding:2.5mm 3mm;">
      <div style="font-size:7.5pt;color:#7c3aed;font-weight:500;">Cetak Berapa Mata</div>
      <div style="font-size:13pt;font-weight:700;color:#6d28d9;">${berapaMata || '-'}</div>
    </div>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:4px;padding:2.5mm 3mm;">
      <div style="font-size:7.5pt;color:#2563eb;font-weight:500;">Jumlah Cetakan</div>
      <div style="font-size:13pt;font-weight:700;color:#1d4ed8;">${r.quantity} <span style="font-size:8pt;font-weight:400;">lembar</span></div>
    </div>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:4px;padding:2.5mm 3mm;">
      <div style="font-size:7.5pt;color:#d97706;font-weight:500;">Insit Kertas</div>
      <div style="font-size:13pt;font-weight:700;color:#b45309;">${setelanKertas || '0'}</div>
    </div>
    <div style="background:#faf5ff;border:1px solid #d8b4fe;border-radius:4px;padding:2.5mm 3mm;">
      <div style="font-size:7.5pt;color:#7e22ce;font-weight:500;">Potongan / Lembar</div>
      <div style="font-size:13pt;font-weight:700;color:#6d28d9;">${r.totalPieces} <span style="font-size:8pt;font-weight:400;">lembar</span></div>
    </div>
    <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:4px;padding:2.5mm 3mm;">
      <div style="font-size:7.5pt;color:#059669;font-weight:500;">Lembar Kertas</div>
      <div style="font-size:13pt;font-weight:700;color:#047857;">${r.sheetsNeeded} <span style="font-size:8pt;font-weight:400;">lembar</span></div>
    </div>
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:4px;padding:2.5mm 3mm;">
      <div style="font-size:7.5pt;color:#ea580c;font-weight:500;">Total Harga Kertas</div>
      <div style="font-size:12pt;font-weight:700;color:#c2410c;">Rp ${Math.round(r.totalPrice).toLocaleString('id-ID')}</div>
    </div>
    <div style="background:#fff1f2;border:1px solid #fca5a5;border-radius:4px;padding:2.5mm 3mm;">
      <div style="font-size:7.5pt;color:#e11d48;font-weight:500;">Harga / Lembar</div>
      <div style="font-size:13pt;font-weight:700;color:#be123c;">Rp ${Math.round(r.pricePerSheet || 0).toLocaleString('id-ID')}</div>
    </div>
    <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:4px;padding:2.5mm 3mm;">
      <div style="font-size:7.5pt;color:#0d9488;font-weight:500;">Efisiensi Bahan</div>
      <div style="font-size:13pt;font-weight:700;color:#0f766e;">${Math.round(r.efficiency * 10) / 10}%</div>
    </div>
  </div>

  <!-- STRATEGY -->
  <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:4px;padding:2mm 3mm;margin-bottom:3mm;text-align:center;">
    <span style="font-size:7.5pt;font-weight:700;color:#3730a3;">Strategi Optimasi: </span>
    <span style="font-size:10pt;font-weight:700;color:#4338ca;">${r.strategy}</span>
  </div>

  <!-- DIAGRAM -->
  <div style="text-align:center;margin-bottom:3mm;">
    ${svgDiagram}
  </div>

  <!-- STEPS + BLOCKS side by side -->
  <div style="display:flex;gap:4mm;align-items:flex-start;">
    <div style="flex:1;min-width:0;">
      <div style="font-size:9pt;font-weight:700;color:#334155;margin-bottom:1.5mm;">Cara Potong:</div>
      ${stepsHtml}
    </div>
    <div style="flex:1;min-width:0;">
      <div style="font-size:9pt;font-weight:700;color:#334155;margin-bottom:1.5mm;">Detail per Blok:</div>
      ${blocksHtml}
    </div>
  </div>

</div>
</body></html>`
  }, [results, selectedCustomer, selectedPaper, restoredPaperName, printName, jumlahPesanan, berapaMata, setelanKertas, buildDiagramHtml])

  const handlePrint = () => {
    if (!results) return
    const html = buildFullPrintHtml()
    if (!html) return
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      toast.error('Popup diblokir. Izinkan popup untuk mencetak.')
      return
    }
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.onload = () => {
      printWindow.print()
    }
  }

  const handlePdf = async () => {
    if (!results) return

    setIsGeneratingPdf(true)
    try {
      const html = buildFullPrintHtml()
      if (!html) { toast.error('Tidak ada data'); return }

      const printWindow = window.open('', '_blank')
      if (!printWindow) {
        toast.error('Popup diblokir. Izinkan popup untuk membuat PDF.')
        return
      }

      // Inject auto-PDF script into the HTML
      const pdfHtml = html.replace('</body>', `
  <script>
    window.onload = function() {
      // Small delay for SVG rendering
      setTimeout(function() {
        window.print();
      }, 500);
    }
  </script>
</body>`)

      printWindow.document.write(pdfHtml)
      printWindow.document.close()
      toast.success('PDF dibuka! Pilih "Save as PDF" di dialog print.')
    } catch (err) {
      console.error('PDF generation error:', err)
      toast.error('Gagal menghasilkan PDF')
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  const handleShareWhatsApp = () => {
    if (!results) return

    const r = results
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

  // Riwayat table component
  const RiwayatTable = ({ items }: { items: any[] }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-[14px] min-w-[600px] table-fixed">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80">
            <th className="text-left py-1 px-1 text-slate-500 font-semibold whitespace-nowrap w-7">#</th>
            <th className="text-left py-1 px-1 text-slate-500 font-semibold whitespace-nowrap w-[14%]">Nomor</th>
            <th className="text-left py-1 px-1 text-slate-500 font-semibold whitespace-nowrap w-[10%]">Tgl</th>
            <th className="text-left py-1 px-1 text-slate-500 font-semibold whitespace-nowrap hidden md:table-cell w-[14%]">Customer</th>
            <th className="text-left py-1 px-1 text-slate-500 font-semibold whitespace-nowrap hidden md:table-cell w-[14%]">Nama Barang</th>
            <th className="text-left py-1 px-1 text-slate-500 font-semibold whitespace-nowrap hidden lg:table-cell w-[8%]">Kertas</th>
            <th className="text-left py-1 px-1 text-slate-500 font-semibold whitespace-nowrap hidden lg:table-cell w-[8%]">Uk. Kertas</th>
            <th className="text-right py-1 px-2 text-slate-500 font-semibold whitespace-nowrap w-14">Jml</th>
            <th className="text-right py-1 px-3 text-slate-500 font-semibold whitespace-nowrap w-[16%]">Total</th>
            <th className="text-center py-1 px-3 text-slate-500 font-semibold whitespace-nowrap w-[14%]">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r, idx) => {
            return (
              <tr key={r.id} className={`border-b border-slate-50 hover:bg-amber-50/40 transition-colors ${restoredRiwayatId === r.id ? 'bg-emerald-50/60' : idx % 2 === 1 ? 'bg-slate-100' : ''}`}>
                <td className="py-1 px-1 text-slate-400">{idx + 1}</td>
                <td className="py-1 px-1 text-blue-700 font-semibold whitespace-nowrap text-[13px]">
                  {r.nomorPotongKertas || '-'}
                </td>
                <td className="py-1 px-1 text-slate-500 whitespace-nowrap">{r.createdAt ? new Date(r.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '-'}</td>
                <td className="py-1 px-1 text-slate-700 font-medium truncate hidden md:table-cell">
                  {r.namaCustomer && r.namaCustomer !== '-' ? r.namaCustomer : '-'}
                </td>
                <td className="py-1 px-1 text-slate-600 truncate hidden md:table-cell">
                  {r.namaCetakan || '-'}
                </td>
                <td className="py-1 px-1 text-slate-600 truncate hidden lg:table-cell">
                  {r.paperName || '-'}
                </td>
                <td className="py-1 px-1 text-slate-500 whitespace-nowrap hidden lg:table-cell">
                  {r.paperWidth && r.paperWidth !== '0' ? `${r.paperWidth}×${r.paperHeight}` : '-'}
                </td>
                <td className="py-1 px-2 text-slate-600 text-right whitespace-nowrap">
                  {parseInt(r.jumlahPesanan || 0).toLocaleString('id-ID')}
                </td>
                <td className="py-1 pl-3 pr-1 text-rose-700 font-bold text-right whitespace-nowrap text-[14px]">
                  Rp {Math.round(r.totalPrice || 0).toLocaleString('id-ID')}
                </td>
                <td className="py-1 px-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => handlePreviewRiwayat(r)}
                      className="inline-flex items-center justify-center w-7 h-7 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md border border-blue-200 transition-colors"
                      title="Preview"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleRestore(r)}
                      className="inline-flex items-center justify-center w-7 h-7 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md border border-emerald-200 transition-colors"
                      title="Restore"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteRiwayat(r.id)}
                      className="inline-flex items-center justify-center w-7 h-7 bg-red-50 hover:bg-red-100 text-red-600 rounded-md border border-red-200 transition-colors"
                      title="Hapus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <DashboardLayout
      title={t('potong_kertas')}
      subtitle={t('subtitle_potong_kertas')}
    >
      {/* === SINGLE PAGE LAYOUT: Form left, Results right === */}
      <div className="flex flex-col lg:flex-row lg:min-h-[calc(100vh-8rem)] gap-3 lg:min-h-0 lg:-mt-5">

        {/* ===== LEFT: FORM ===== */}
        <div className="lg:w-[386px] xl:w-[416px] flex-shrink-0 flex flex-col gap-1.5">
          {/* Info Cetak */}
          <div className="bg-white rounded-xl border border-slate-200 p-2.5">
            <div className="space-y-1.5">
              <div className="space-y-1.5">
                <div>
                  <label className={lbl}>No. Potong Kertas</label>
                  <input type="text" value={nomorPotongKertas} readOnly className={inpDisabled} />
                </div>
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
                      <div ref={customerDropdownRef} className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
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
          <div className="bg-white rounded-xl border border-slate-200 p-2.5">
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

          {/* Action Buttons */}
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-2">
              <button onClick={handleCalculateCuts} disabled={isCalculating || !(parseFloat(paperWidth) > 0) || !(parseFloat(paperHeight) > 0) || !(parseFloat(cutWidth) > 0) || !(parseFloat(cutHeight) > 0) || !(parseInt(computedQuantity || quantity) > 0)}
                className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold py-2.5 rounded-lg transition-colors">
                {isCalculating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {t('hitung_potongan')}
              </button>
              <button onClick={restoredRiwayatId ? handleUpdateRiwayat : handleSaveRiwayat} disabled={!results || savingRiwayat || needsRecalc}
                className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold py-2.5 rounded-lg transition-colors" title={restoredRiwayatId ? 'Update Riwayat' : 'Simpan Riwayat'}>
                {restoredRiwayatId && <RefreshCw className={`w-3 h-3 ${savingRiwayat ? 'animate-spin' : ''}`} />}
                {restoredRiwayatId ? (savingRiwayat ? 'Updating...' : 'Update Riwayat') : (savingRiwayat ? 'Menyimpan...' : 'Simpan Riwayat')}
              </button>
              <button onClick={handlePO} disabled={!results || savingRiwayat || needsRecalc}
                className="flex items-center justify-center gap-1.5 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold py-2.5 rounded-lg transition-colors" title="Purchase Order">
                <FileText className="w-3.5 h-3.5" />
                PO
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <button onClick={() => { if (!results) { toast.error('Hitung potongan terlebih dahulu!'); return; } setPreviewOpen(true) }} disabled={!results || needsRecalc}
                className="flex items-center justify-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold py-2.5 rounded-lg transition-colors" title={t('preview')}>
                {t('preview')}
              </button>
              <button onClick={handlePrint} disabled={!results || needsRecalc}
                className="flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold py-2.5 rounded-lg transition-colors" title={t('cetak')}>
                <Printer className="w-3.5 h-3.5" />
                {t('cetak')}
              </button>
              <button onClick={handleShareWhatsApp} disabled={!results || needsRecalc}
                className="flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold py-2.5 rounded-lg transition-colors" title="WhatsApp">
                <Share2 className="w-3.5 h-3.5" />
                <span className="lg:hidden xl:inline">WhatsApp</span>
                <span className="hidden lg:inline xl:hidden">WA</span>
              </button>
              <button onClick={handleReset} disabled={!paperWidth && !paperHeight && !cutWidth && !cutHeight && !computedQuantity && !quantity && !grammage && !pricePerSheet && !printName && !jumlahPesanan && !berapaMata && !customerInput}
                className="flex items-center justify-center gap-1.5 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 disabled:text-slate-300 text-slate-700 text-xs font-semibold py-2.5 rounded-lg transition-colors" title={t('reset')}>
                <RotateCcw className="w-3 h-3" />
                <span className="hidden xl:inline">{t('reset')}</span>
              </button>
            </div>
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
              background: (results && !needsRecalc) ? 'linear-gradient(135deg, #f59e0b, #fbbf24, #f59e0b)' : undefined,
            }}
            className="flex items-center justify-center gap-1.5 text-white disabled:bg-slate-200 disabled:text-slate-400 disabled:border-slate-200 text-sm font-semibold py-3 rounded-lg border border-amber-400 cursor-pointer transition-colors">
            <Calculator className="w-3.5 h-3.5" />
            Hitung Cetakan Lengkap
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {/* ===== RIGHT: RESULTS ===== */}
        <div className="flex-1 bg-white rounded-xl border border-slate-200 p-4 flex flex-col lg:min-h-0 lg:min-h-[calc(100vh-8rem+2cm)]">
          {results ? (
            <div className="flex-1 flex flex-col gap-1.5 lg:min-h-0 lg:overflow-hidden">
              {/* Stats Grid - mobile 2col, desktop 3col/5col */}
              <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2 flex-shrink-0">
                <div className="bg-blue-50 rounded-lg p-1.5 lg:p-1.5 text-center">
                  <p className="text-[10px] text-blue-600 font-medium leading-tight">Diperlukan</p>
                  <p className="text-lg lg:text-lg font-bold text-blue-700 leading-tight">{computedQuantity || quantity || '0'}</p>
                  <p className="text-[10px] text-blue-500">lembar</p>
                </div>
                <div className="bg-sky-50 rounded-lg p-1.5 lg:p-1.5 text-center">
                  <p className="text-[10px] text-sky-600 font-medium leading-tight">Insit Kertas</p>
                  <p className="text-lg lg:text-lg font-bold text-sky-700 leading-tight">{setelanKertas || '0'}</p>
                  <p className="text-[10px] text-sky-500">lembar</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-1.5 lg:p-1.5 text-center">
                  <p className="text-[10px] text-purple-600 font-medium leading-tight">Potongan/Lembar</p>
                  <p className="text-lg lg:text-lg font-bold text-purple-700 leading-tight">{results.totalPieces}</p>
                  <p className="text-[10px] text-purple-500">lembar</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-1.5 lg:p-1.5 text-center">
                  <p className="text-[10px] text-emerald-600 font-medium leading-tight">Kertas Yg Dibeli</p>
                  <p className="text-lg lg:text-lg font-bold text-emerald-700 leading-tight">{results.sheetsNeeded}</p>
                  <p className="text-[10px] text-emerald-500">lembar</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-1.5 lg:p-1.5 text-center">
                  <p className="text-[10px] text-amber-600 font-medium leading-tight">Harga / Lembar</p>
                  <p className="text-sm lg:text-sm font-bold text-amber-700 leading-tight">Rp {Math.round(parseFloat(pricePerSheet) || 0).toLocaleString('id-ID')}</p>
                </div>
                <div className="bg-rose-50 rounded-lg p-1.5 lg:p-1.5 text-center">
                  <p className="text-[10px] text-rose-600 font-medium leading-tight">Harga/Lembar Setelah Dipotong</p>
                  <p className="text-sm lg:text-sm font-bold text-rose-700 leading-tight">Rp {results.totalPieces > 0 ? Math.round((parseFloat(pricePerSheet) || 0) / results.totalPieces).toLocaleString('id-ID') : '0'}</p>
                </div>
                <div className="bg-cyan-50 rounded-lg p-1.5 lg:p-1.5 text-center">
                  <p className="text-[10px] text-cyan-600 font-medium leading-tight">Berat Kertas</p>
                  <p className="text-sm lg:text-sm font-bold text-cyan-700 leading-tight">{(() => {
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
                <div className="bg-orange-50 rounded-lg p-1.5 lg:p-1.5 text-center col-span-2 xl:col-span-7">
                  <p className="text-[10px] text-orange-600 font-medium leading-tight">Total Harga</p>
                  <p className="text-xl lg:text-xl font-bold text-orange-700 leading-tight">Rp {Math.round(results.totalPrice).toLocaleString('id-ID')}</p>
                </div>
              </div>

              {/* Strategy */}
              <div className="bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5 flex-shrink-0" style={{ transform: 'scale(1.05)', transformOrigin: 'left center' }}>
                <span className="text-[10px] font-bold text-indigo-800">Strategi: </span>
                <span className="text-[10px] text-indigo-700 font-medium">{results.strategy}</span>
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
                        const bgColors = ['bg-blue-50', 'bg-emerald-50', 'bg-amber-50', 'bg-red-50', 'bg-violet-50']
                        const borderColors = ['border-blue-200', 'border-emerald-200', 'border-amber-200', 'border-red-200', 'border-violet-200']
                        const badgeBg = ['bg-blue-100', 'bg-emerald-100', 'bg-amber-100', 'bg-red-100', 'bg-violet-100']
                        const badgeText = ['text-blue-700', 'text-emerald-700', 'text-amber-700', 'text-red-700', 'text-violet-700']
                        const nameColors = ['text-blue-800', 'text-emerald-800', 'text-amber-800', 'text-red-800', 'text-violet-800']
                        const detailColors = ['text-blue-600', 'text-emerald-600', 'text-amber-600', 'text-red-600', 'text-violet-600']
                        const ci = idx % 5
                        return (
                          <div key={idx} className={`border ${borderColors[ci]} ${bgColors[ci]} rounded-md p-1.5`}>
                            <div className="flex items-center justify-between mb-0">
                              <span className={`text-[10px] font-bold ${nameColors[ci]}`}>{block.name}</span>
                              <span className={`px-1 py-0 ${badgeBg[ci]} ${badgeText[ci]} rounded-full text-[8px] font-semibold`}>{block.pieces} pcs</span>
                            </div>
                            <div className={`grid grid-cols-2 gap-x-1 gap-y-0 text-[9px] ${detailColors[ci]}`}>
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

      {/* Riwayat Table Section - Full Width */}
      <div className="mt-6">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
            <div className="w-6 h-6 rounded-md bg-amber-100 flex items-center justify-center">
              <History className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Riwayat Potong Kertas</h2>
            <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">{riwayatList.length}</span>
          </div>
          {riwayatList.length > 0 ? (
            <RiwayatTable items={riwayatList} />
          ) : (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-slate-400">Belum ada riwayat potong kertas</p>
            </div>
          )}
        </div>
      </div>

      {/* ===== PREVIEW DIALOG (Draggable) ===== */}
      {previewOpen && (
        <DraggablePreviewDialog
          onClose={() => { setPreviewOpen(false); setPreviewRiwayatData(null); setPreviewRiwayatInfo({ customer: '-', paper: '-', jumlahPesanan: '', berapaMata: '', setelanKertas: '' }) }}
          title="Preview Potong Kertas"
        >
          {/* Preview Content (rendered for print & PDF capture) */}
          <div ref={previewRef} className="p-2 sm:p-4 bg-white">
            {/* Header */}
            <div className="text-center mb-3 pb-2 border-b-2 border-slate-200">
              <h1 className="text-base sm:text-lg font-bold text-slate-900">Preview Potong Kertas</h1>
              <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5">
                {(previewRiwayatData ? previewRiwayatInfo.customer : (selectedCustomer?.name || '-'))} · {previewRiwayatData ? previewRiwayatInfo.paper : (selectedPaper?.name || restoredPaperName || 'Custom')} · {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2 mb-3">
              <div className="bg-sky-50 border border-sky-100 rounded-lg p-2 sm:p-3">
                <p className="text-[9px] sm:text-[10px] text-sky-600 font-medium">Jumlah Pesanan</p>
                <p className="text-base sm:text-xl font-bold text-sky-700">{(previewRiwayatData ? previewRiwayatInfo.jumlahPesanan : jumlahPesanan) || '-'}</p>
              </div>
              <div className="bg-violet-50 border border-violet-100 rounded-lg p-2 sm:p-3">
                <p className="text-[9px] sm:text-[10px] text-violet-600 font-medium"><span className="sm:hidden">Cetak Brp Mata</span><span className="hidden sm:inline">Cetak Berapa Mata</span></p>
                <p className="text-base sm:text-xl font-bold text-violet-700">{(previewRiwayatData ? previewRiwayatInfo.berapaMata : berapaMata) || '-'}</p>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 sm:p-3">
                <p className="text-[9px] sm:text-[10px] text-blue-600 font-medium">Jumlah Cetakan</p>
                <p className="text-base sm:text-xl font-bold text-blue-700">{previewRiwayatData?.quantity || results?.quantity || 0} <span className="text-[9px] sm:text-xs font-normal">lembar</span></p>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-2 sm:p-3">
                <p className="text-[9px] sm:text-[10px] text-amber-600 font-medium">Insit Kertas</p>
                <p className="text-base sm:text-xl font-bold text-amber-700">{(previewRiwayatData ? previewRiwayatInfo.setelanKertas : setelanKertas) || '0'}</p>
              </div>
              <div className="bg-purple-50 border border-purple-100 rounded-lg p-2 sm:p-3">
                <p className="text-[9px] sm:text-[10px] text-purple-600 font-medium">Potongan / Lembar</p>
                <p className="text-base sm:text-xl font-bold text-purple-700">{previewRiwayatData?.totalPieces || results?.totalPieces || 0} <span className="text-[9px] sm:text-xs font-normal">lembar</span></p>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2 sm:p-3">
                <p className="text-[9px] sm:text-[10px] text-emerald-600 font-medium">Lembar Kertas</p>
                <p className="text-base sm:text-xl font-bold text-emerald-700">{previewRiwayatData?.sheetsNeeded || results?.sheetsNeeded || 0} <span className="text-[9px] sm:text-xs font-normal">lembar</span></p>
              </div>
              <div className="bg-orange-50 border border-orange-100 rounded-lg p-2 sm:p-3">
                <p className="text-[9px] sm:text-[10px] text-orange-600 font-medium">Total Harga Kertas</p>
                <p className="text-lg sm:text-[24px] font-bold text-orange-700">Rp {Math.round(previewRiwayatData?.totalPrice || results?.totalPrice || 0).toLocaleString('id-ID')}</p>
              </div>
              <div className="bg-rose-50 border border-rose-100 rounded-lg p-2 sm:p-3">
                <p className="text-[9px] sm:text-[10px] text-rose-600 font-medium">Harga / Lembar</p>
                <p className="text-base sm:text-xl font-bold text-rose-700">Rp {Math.round(parseFloat(pricePerSheet) || 0).toLocaleString('id-ID')}</p>
              </div>
              <div className="bg-teal-50 border border-teal-100 rounded-lg p-2 sm:p-3">
                <p className="text-[9px] sm:text-[10px] text-teal-600 font-medium">Harga/Lembar Setelah Dipotong</p>
                <p className="text-base sm:text-xl font-bold text-teal-700">Rp {(previewRiwayatData || results)?.totalPieces > 0 ? Math.round((parseFloat(pricePerSheet) || 0) / ((previewRiwayatData || results)?.totalPieces || 1)).toLocaleString('id-ID') : '0'}</p>
              </div>
            </div>

            {/* Strategy */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-2 mb-3">
              <p className="text-[8px] sm:text-[10px] text-indigo-600 font-medium text-center">Strategi Optimasi</p>
              <p className="text-[11px] sm:text-sm font-bold text-indigo-700 text-center">{previewRiwayatData?.strategy || results?.strategy}</p>
            </div>

            {/* Diagram */}
            {(previewRiwayatData || results) && (
              <div className="mb-3 w-full">
                <div className="w-full mx-auto" style={{ maxWidth: '100%' }}>
                  <CuttingDiagram results={previewRiwayatData || results!} maxHeight="50vh" />
                </div>
              </div>
            )}

            {/* Steps */}
            {(previewRiwayatData || results) && (
              <div className="mb-3">
                <h3 className="text-[11px] sm:text-xs font-bold text-slate-700 mb-1.5">Cara Potong:</h3>
                <div className="space-y-1 sm:space-y-1.5">
                  {(previewRiwayatData || results)!.steps.map((step, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 sm:gap-2">
                      <div className="flex-shrink-0 w-4 h-4 sm:w-5 sm:h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-[8px] sm:text-[9px] font-bold">{idx + 1}</div>
                      <p className="text-[10px] sm:text-[11px] text-slate-600 pt-0.5">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Block Details */}
            {(previewRiwayatData || results) && (
              <div className="mb-2">
                <h3 className="text-[11px] sm:text-xs font-bold text-slate-700 mb-1.5">Detail per Blok:</h3>
                <div className="space-y-1.5 sm:space-y-2">
                  {(previewRiwayatData || results)!.blocks.map((block: any, idx: number) => (
                    <div key={idx} className="border border-slate-200 rounded-lg p-2 sm:p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] sm:text-xs font-bold text-slate-800">{block.name}</span>
                        <span className="px-1.5 sm:px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[9px] sm:text-[10px] font-semibold">{block.pieces} lembar</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px] sm:text-[10px]">
                        <div><span className="text-slate-500">Ukuran:</span> <span className="font-medium">{block.width.toFixed(1)} × {block.height.toFixed(1)} cm</span></div>
                        <div><span className="text-slate-500">Layout:</span> <span className="font-medium">{block.horizontal} × {block.vertical}{block.rotated ? ' (90°)' : ''}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action buttons at bottom of dialog */}
          <div className="sticky bottom-0 bg-white border-t border-slate-200 p-2 sm:p-4 flex flex-wrap gap-1.5 sm:gap-2">
            <button onClick={handlePrint}
              className="flex-1 min-w-[calc(50%-0.375rem)] flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 sm:py-3 rounded-xl transition-colors text-xs sm:text-sm">
              <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> {t('cetak')}
            </button>
            <button onClick={handlePdf} disabled={isGeneratingPdf}
              className="flex-1 min-w-[calc(50%-0.375rem)] flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-400 text-white font-semibold py-2.5 sm:py-3 rounded-xl transition-colors text-xs sm:text-sm">
              {isGeneratingPdf ? <><Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />PDF...</> : <><FileImage className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> PDF</>}
            </button>
            <button onClick={handleShareWhatsApp}
              className="flex-1 min-w-[calc(50%-0.375rem)] flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl transition-colors text-xs sm:text-sm">
              <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> WhatsApp
            </button>
          </div>
        </DraggablePreviewDialog>
      )}
    </DashboardLayout>
  )
}

export default function Home() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<{ username: string; name?: string; role?: string } | null>(null)

  useEffect(() => {
    const authUser = getAuthUser()
    if (!authUser) {
      router.push('/login')
    } else {
      setUser(authUser)
    }
    setReady(true)
  }, [router])

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) return null

  return <CalculatorPage />
}
