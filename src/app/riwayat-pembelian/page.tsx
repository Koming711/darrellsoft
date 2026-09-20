'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { useLanguage } from '@/contexts/language-context'
import { authFetch } from '@/lib/auth-fetch'
import { Button } from '@/components/ui/button'
import {
  ShoppingBag,
  Package,
  Trash2,
  Loader2,
  Search,
  FileText,
  Scissors,
  ImageIcon,
  X,
} from 'lucide-react'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { formatRupiah } from '@/lib/format'
import { toast } from 'sonner'
import { fetcher } from '@/lib/fetcher'
import { getAuthHeaders } from '@/lib/auth'
import { notifyDataChange } from '@/lib/data-sync'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { PurchaseOrderPreview } from '@/components/dokupro/purchase-order-preview'
import { RiwayatCustomerFilter } from '@/components/dokupro/riwayat-period-filter'
import type { PurchaseOrderData, CompanyInfo } from '@/lib/types'
import { DEFAULT_COMPANY } from '@/lib/types'
import { generatePurchaseOrderPdf, sharePdfViaWhatsApp, shareJpgViaWhatsApp } from '@/lib/generate-pdf'
import { captureDocumentPaperJpg, resolveDocumentPreviewEl } from '@/lib/capture-jpg'
import dynamic from 'next/dynamic'
import type { CuttingResult } from '@/lib/cutting-engine'

const CuttingDiagram = dynamic(
  () => import('@/components/cutting-results').then(m => ({ default: m.CuttingDiagram })),
  { ssr: false, loading: () => <div className="h-full flex items-center justify-center text-xs text-slate-400">Memuat diagram...</div> }
)

// --- Types ---
interface HistoryEntry {
  id: string;
  docType: string;
  nomor: string;
  tanggal: string;
  pihakKedua: string;
  total: string;
  dataJson: string;
  createdAt: string;
}

interface PotongKertasRecord {
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
  resultData: string | null
  userId: string | null
  createdAt: string
  updatedAt: string
}

// --- Date filter ---
type FilterType = 'all' | 'today' | 'week' | 'month' | 'custom'

function getFilterDates(filter: FilterType, customStart?: Date, customEnd?: Date): { startDate: string; endDate: string } {
  const today = new Date()
  const fmt = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  switch (filter) {
    case 'all': {
      // Wide range so the API returns all records
      return { startDate: '2000-01-01', endDate: '2099-12-31' }
    }
    case 'today': return { startDate: fmt(today), endDate: fmt(today) }
    case 'week': {
      const s = new Date(today)
      const day = s.getDay()
      s.setDate(s.getDate() + (day === 0 ? -6 : 1 - day))
      return { startDate: fmt(s), endDate: fmt(today) }
    }
    case 'month': {
      const s = new Date(today.getFullYear(), today.getMonth(), 1)
      return { startDate: fmt(s), endDate: fmt(today) }
    }
    case 'custom': {
      return {
        startDate: customStart ? fmt(customStart) : fmt(today),
        endDate: customEnd ? fmt(customEnd) : fmt(today),
      }
    }
  }
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatRupiahShort(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
}

function parseDocInfo(entry: HistoryEntry) {
  try {
    const parsed = JSON.parse(entry.dataJson)
    const items = parsed.items || []
    const pemasok = parsed.pemasok || {}
    const namaToko = pemasok.nama || entry.pihakKedua || ''
    const ppn = parsed.ppn || 0
    const tanggalJatuhTempo = parsed.tanggalJatuhTempo || ''
    const catatan = parsed.catatan || ''
    const referensi = parsed.referensi || ''
    const riwayatPotongKertasId = parsed.riwayatPotongKertasId || ''

    const firstItem = items[0]
    const namaBarang = firstItem?.deskripsi || ''

    const subtotal = items.reduce((sum: number, it: { qty: number; harga: number }) => sum + it.qty * it.harga, 0)
    const totalHarga = subtotal + (subtotal * ppn / 100)

    const totalQty = items.reduce((sum: number, it: { qty: number }) => sum + (it.qty || 0), 0)

    return { namaToko, namaBarang, totalQty, totalHarga, ppn, tanggalJatuhTempo, catatan, referensi, riwayatPotongKertasId }
  } catch {
    return { namaToko: '', namaBarang: '', totalQty: 0, totalHarga: 0, ppn: 0, tanggalJatuhTempo: '', catatan: '', referensi: '', riwayatPotongKertasId: '' }
  }
}

// --- Parse cutting info from item deskripsi (e.g. "brosur\nart karton 260g 79x109\nUk. potong 21 x 29\nPotongan/lembar dapat 13") ---
function parseCuttingInfoFromDeskripsi(entry: HistoryEntry): { namaKertas: string; ukuranKertas: string; ukuranPotong: string; potonganPerLembar: string; riwayatPotongKertasId: string } {
  const defaults = { namaKertas: '-', ukuranKertas: '-', ukuranPotong: '-', potonganPerLembar: '-', riwayatPotongKertasId: '' }
  try {
    const parsed = JSON.parse(entry.dataJson)
    const items = parsed.items || []
    const firstItem = items[0]
    if (!firstItem?.deskripsi) return defaults

    const riwayatPotongKertasId = parsed.riwayatPotongKertasId || ''
    const desc = firstItem.deskripsi as string
    const lines = desc.split('\n')

    let namaKertas = '-'
    let ukuranKertas = '-'
    let ukuranPotong = '-'
    let potonganPerLembar = '-'

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // Skip lines that start with "Uk." or "Potongan/" — they are handled below
      if (trimmed.toLowerCase().startsWith('uk.') || trimmed.toLowerCase().startsWith('potongan/')) continue

      // Match paper line with dimensions: "art karton 260g 79x109" or "Art Karton 79x109" or "art karton 260g 79 x 109"
      // Try pattern with grammage first: <name> <grammage>g <W>x<H>
      const kertasWithGrammage = trimmed.match(/^(.+?)\s+(\d+)g\s+(\d+)\s*x\s*(\d+)$/i)
      if (kertasWithGrammage) {
        namaKertas = kertasWithGrammage[1].trim()
        ukuranKertas = `${kertasWithGrammage[3]}×${kertasWithGrammage[4]}`
        continue
      }

      // Try pattern without grammage: <name> <W>x<H>
      const kertasNoGrammage = trimmed.match(/^(.+?)\s+(\d+)\s*x\s*(\d+)$/i)
      if (kertasNoGrammage && !trimmed.toLowerCase().startsWith('uk.')) {
        namaKertas = kertasNoGrammage[1].trim()
        ukuranKertas = `${kertasNoGrammage[2]}×${kertasNoGrammage[3]}`
        continue
      }
    }

    // Second pass: look for ukuran potong and potongan per lembar
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // Match ukuran potong: "Uk. potong 21 x 29" or "Uk.potong 21x29"
      const potongMatch = trimmed.match(/^uk\.?\s*potong\s+(\d+)\s*x\s*(\d+)/i)
      if (potongMatch) {
        ukuranPotong = `${potongMatch[1]}×${potongMatch[2]}`
        continue
      }

      // Match potongan per lembar: "Potongan/lembar dapat 13" or "Potongan/lembar dapat 13 lembar"
      const potonganMatch = trimmed.match(/^potongan\/lembar\s+dapat\s+(\d+)/i)
      if (potonganMatch) {
        potonganPerLembar = `${potonganMatch[1]} pcs`
        continue
      }
    }

    return { namaKertas, ukuranKertas, ukuranPotong, potonganPerLembar, riwayatPotongKertasId }
  } catch {
    return defaults
  }
}

// --- Parse dataJson for PurchaseOrderData ---
function parsePurchaseOrderData(entry: HistoryEntry): PurchaseOrderData {
  try {
    const parsed = JSON.parse(entry.dataJson)
    const company: CompanyInfo = {
      nama: parsed.company?.nama || DEFAULT_COMPANY.nama,
      telepon: parsed.company?.telepon || DEFAULT_COMPANY.telepon,
      alamat: parsed.company?.alamat || DEFAULT_COMPANY.alamat,
      email: parsed.company?.email || DEFAULT_COMPANY.email,
      npwp: parsed.company?.npwp || '',
      website: parsed.company?.website || '',
      ppn: parsed.company?.ppn ?? parsed.ppn ?? 11,
      logo: parsed.company?.logo || '',
      bankName: parsed.company?.bankName || '',
      bankAccount: parsed.company?.bankAccount || '',
      bankHolder: parsed.company?.bankHolder || '',
      bankName2: parsed.company?.bankName2 || '',
      bankAccount2: parsed.company?.bankAccount2 || '',
      bankHolder2: parsed.company?.bankHolder2 || '',
    }
    const pemasok = parsed.pemasok || parsed.client || { nama: '', jenisBarang: '', kontak: '', alamat: '' }
    const items = (parsed.items || []).map((it: { id?: string; deskripsi?: string; qty?: number; satuan?: string; harga?: number }, i: number) => ({
      id: it.id || `item-${i}`,
      deskripsi: it.deskripsi || '',
      qty: it.qty || 0,
      satuan: it.satuan || '',
      harga: it.harga || 0,
    }))
    return {
      type: 'purchase-order',
      company,
      nomor: parsed.nomor || entry.nomor || '',
      tanggal: parsed.tanggal || entry.tanggal || '',
      referensi: parsed.referensi || '',
      pemasok,
      items,
      ppn: parsed.ppn ?? 11,
      catatan: parsed.catatan || '',
      tanggalJatuhTempo: parsed.tanggalJatuhTempo || '',
      riwayatPotongKertasId: parsed.riwayatPotongKertasId || '',
    }
  } catch {
    return {
      type: 'purchase-order',
      company: { ...DEFAULT_COMPANY },
      nomor: entry.nomor || '',
      tanggal: entry.tanggal || '',
      referensi: '',
      pemasok: { nama: '', jenisBarang: '', kontak: '', alamat: '' },
      items: [],
      ppn: 11,
      catatan: '',
      tanggalJatuhTempo: '',
      riwayatPotongKertasId: '',
    }
  }
}

// --- Extract cutting info from deskripsi + PotongKertasRecord ---
function getCuttingInfo(entry: HistoryEntry, pkLookup: Map<string, PotongKertasRecord>): { namaKertas: string; ukuranKertas: string; ukuranPotong: string; potonganPerLembar: string; riwayatPotongKertasId: string } {
  const defaults = { namaKertas: '-', ukuranKertas: '-', ukuranPotong: '-', potonganPerLembar: '-', riwayatPotongKertasId: '' }

  // Primary: parse from item deskripsi (always available)
  const fromDesc = parseCuttingInfoFromDeskripsi(entry)

  // Secondary: lookup from riwayat potong kertas record (if linked)
  const info = parseDocInfo(entry)
  const pkRecord = info.riwayatPotongKertasId ? pkLookup.get(info.riwayatPotongKertasId) : null

  if (!pkRecord) {
    return fromDesc
  }

  // Merge: pkRecord overrides if it has better data
  const pw = pkRecord.paperWidth
  const ph = pkRecord.paperHeight
  const cw = pkRecord.cutWidth
  const ch = pkRecord.cutHeight

  const namaKertas = pkRecord.paperName && pkRecord.paperName !== '0' ? pkRecord.paperName : fromDesc.namaKertas
  const ukuranKertas = (pw && ph && pw !== '0' && ph !== '0') ? `${pw}×${ph}` : fromDesc.ukuranKertas
  const ukuranPotong = (cw && ch && cw !== '0' && ch !== '0') ? `${cw}×${ch}` : fromDesc.ukuranPotong

  let potonganPerLembar = fromDesc.potonganPerLembar
  if (pkRecord.resultData) {
    try {
      const parsed = JSON.parse(pkRecord.resultData)
      if (parsed.totalPieces > 0) {
        potonganPerLembar = `${parsed.totalPieces} pcs`
      }
    } catch {}
  }

  return { namaKertas, ukuranKertas, ukuranPotong, potonganPerLembar, riwayatPotongKertasId: info.riwayatPotongKertasId }
}

export default function RiwayatPembelianPage() {
  const { t } = useLanguage()
  const [poHistory, setPoHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewItem, setPreviewItem] = useState<HistoryEntry | null>(null)
  const [previewScale, setPreviewScale] = useState(1)
  const [sendingPdf, setSendingPdf] = useState(false)
  const [sendingJpg, setSendingJpg] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  // Filter nama suplier/toko (dropdown) — gaya filter riwayat lainnya
  const [partyFilter, setPartyFilter] = useState('')

  // Cutting diagram dialog
  const [cuttingDiagramOpen, setCuttingDiagramOpen] = useState(false)
  const [cuttingDiagramData, setCuttingDiagramData] = useState<CuttingResult | null>(null)
  const [cuttingDiagramInfo, setCuttingDiagramInfo] = useState<{ customer: string; paper: string; cutSize: string; totalPieces: number }>({ customer: '', paper: '', cutSize: '', totalPieces: 0 })

  // Potong kertas lookup data
  const [pkLookup, setPkLookup] = useState<Map<string, PotongKertasRecord>>(new Map())

  // Date filter
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined)
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined)

  // Custom date dialog
  const [showCustomDialog, setShowCustomDialog] = useState(false)
  const [customStartStr, setCustomStartStr] = useState('')
  const [customEndStr, setCustomEndStr] = useState('')

  // Status pembayaran dialog
  const [statusDialogOpen, setStatusDialogOpen] = useState(false)
  const [statusDialogItem, setStatusDialogItem] = useState<HistoryEntry | null>(null)
  const [statusUpdating, setStatusUpdating] = useState(false)

  const fetchPOHistory = useCallback(async () => {
    setLoading(true)
    try {
      const { startDate, endDate } = getFilterDates(filterType, customStartDate, customEndDate)
      const [poRes, pkRes] = await Promise.all([
        authFetch(`/api/history?docType=purchase-order&startDate=${startDate}&endDate=${endDate}`),
        authFetch('/api/riwayat-potong-kertas'),
      ])
      if (poRes.ok) {
        const json = await poRes.json()
        setPoHistory(json.data || [])
      }
      if (pkRes.ok) {
        const pkList: PotongKertasRecord[] = await pkRes.json()
        const map = new Map<string, PotongKertasRecord>()
        for (const pk of pkList) {
          if (pk.id) map.set(pk.id, pk)
        }
        setPkLookup(map)
        console.log('[RiwayatPembelian] pkLookup loaded:', map.size, 'records')
      } else {
        console.warn('[RiwayatPembelian] Failed to load pkLookup:', pkRes.status, await pkRes.text().catch(() => ''))
      }
    } catch (err) {
      console.error('[RiwayatPembelian] fetchPOHistory error:', err)
    } finally {
      setLoading(false)
    }
  }, [filterType, customStartDate, customEndDate])

  useEffect(() => {
    fetchPOHistory()
  }, [fetchPOHistory])

  const handleFilterChange = (type: FilterType) => {
    if (type === 'custom') {
      setShowCustomDialog(true)
    } else {
      setFilterType(type)
    }
  }

  const applyCustomFilter = () => {
    if (customStartStr && customEndStr) {
      setCustomStartDate(new Date(customStartStr))
      setCustomEndDate(new Date(customEndStr))
      setFilterType('custom')
      setShowCustomDialog(false)
    } else {
      toast.error('Pilih tanggal mulai dan tanggal akhir')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetcher(`/api/history/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        toast.success('Pembelian berhasil dihapus')
        notifyDataChange('purchase-order')
        fetchPOHistory()
      } else {
        toast.error('Gagal menghapus pembelian')
      }
    } catch {
      toast.error('Gagal menghapus pembelian')
    }
    setDeleteConfirmId(null)
    setPreviewOpen(false)
  }

  const handlePreview = (item: HistoryEntry) => {
    setPreviewItem(item)
    setPreviewOpen(true)
  }

  const handleStatusChange = async (updates: { tanggalJatuhTempo?: string }) => {
    if (!statusDialogItem) return
    setStatusUpdating(true)
    try {
      const parsed = JSON.parse(statusDialogItem.dataJson)
      if (updates.tanggalJatuhTempo !== undefined) parsed.tanggalJatuhTempo = updates.tanggalJatuhTempo
      delete parsed.statusPembayaran
      delete parsed.lunas
      const newDataJson = JSON.stringify(parsed)

      const res = await fetcher(`/api/history/${statusDialogItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ dataJson: newDataJson }),
      })
      if (res.ok) {
        toast.success('Tanggal jatuh tempo berhasil diubah')
        setStatusDialogOpen(false)
        fetchPOHistory()
      } else {
        toast.error('Gagal mengubah tanggal jatuh tempo')
      }
    } catch {
      toast.error('Gagal mengubah tanggal jatuh tempo')
    } finally {
      setStatusUpdating(false)
    }
  }

  const openStatusDialog = (item: HistoryEntry, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setStatusDialogItem(item)
    setStatusDialogOpen(true)
  }

  const handleShowCuttingDiagram = (item: HistoryEntry) => {
    const info = parseDocInfo(item)
    if (!info.riwayatPotongKertasId) {
      toast.error('Tidak ada data potong kertas yang terhubung')
      return
    }
    const pkRecord = pkLookup.get(info.riwayatPotongKertasId)
    if (!pkRecord) {
      toast.error('Data potong kertas tidak ditemukan')
      return
    }

    let resultData: CuttingResult | null = null
    if (pkRecord.resultData) {
      try {
        resultData = JSON.parse(pkRecord.resultData!)
      } catch {}
    }

    // If no resultData, try to calculate from the record values
    if (!resultData) {
      const pw = parseFloat(pkRecord.paperWidth)
      const ph = parseFloat(pkRecord.paperHeight)
      const cw = parseFloat(pkRecord.cutWidth)
      const ch = parseFloat(pkRecord.cutHeight)
      const qty = parseInt(pkRecord.quantity) || 0
      const setelan = parseInt(pkRecord.setelanKertas) || 0
      const price = pkRecord.pricePerSheet || 0

      if (pw && ph && cw && ch) {
        import('@/lib/cutting-engine').then(({ calculateCuts }) => {
          resultData = calculateCuts({
            paperWidth: pw, paperHeight: ph, cutWidth: cw, cutHeight: ch,
            quantity: qty + setelan, pricePerSheet: price, optimizationMode: 'maximal',
            customerName: pkRecord.namaCustomer || '',
            paperMaterial: pkRecord.paperName || '',
            grammage: parseFloat(pkRecord.grammage) || 0,
          })
          setCuttingDiagramData(resultData)
          setCuttingDiagramInfo({
            customer: pkRecord.namaCustomer || '-',
            paper: pkRecord.paperName || 'Custom',
            cutSize: `${cw}×${ch} cm`,
            totalPieces: resultData.totalPieces,
          })
          setCuttingDiagramOpen(true)
        })
        return
      }
    }

    if (resultData) {
      setCuttingDiagramData(resultData)
      setCuttingDiagramInfo({
        customer: pkRecord.namaCustomer || '-',
        paper: pkRecord.paperName || 'Custom',
        cutSize: `${pkRecord.cutWidth}×${pkRecord.cutHeight} cm`,
        totalPieces: resultData.totalPieces,
      })
      setCuttingDiagramOpen(true)
    } else {
      toast.error('Data tidak cukup untuk menampilkan diagram potong')
    }
  }

  const poData = useMemo(() => {
    if (!previewItem) return null
    return parsePurchaseOrderData(previewItem)
  }, [previewItem])

  const handleSendPdf = useCallback(async () => {
    if (!poData) return
    setSendingPdf(true)
    try {
      const blob = await generatePurchaseOrderPdf(poData)
      const fileName = `PO_${poData.nomor || 'draft'}.pdf`
      await sharePdfViaWhatsApp(blob, fileName, `Purchase Order ${poData.nomor}`)
      toast.success('PDF dikirim ke WhatsApp')
    } catch (err) {
      console.error(err)
      toast.error('Gagal mengirim PDF')
    } finally {
      setSendingPdf(false)
    }
  }, [poData])

  const handleSendJpg = useCallback(async () => {
    if (!poData) return
    setSendingJpg(true)
    try {
      // Hi-res 300 DPI dari .a5-page (ukuran tetap 148mm) — hasil identik
      // mobile & desktop, bukan popup scaler yang skala-nya mengikuti layar
      const previewEl = resolveDocumentPreviewEl()
      if (previewEl) {
        const jpgBlob = await captureDocumentPaperJpg({ el: previewEl, paper: 'A5', orientation: 'portrait', marginPct: 0 })
        const fileName = `${(poData.nomor || 'draft').replace(/\//g, '-')}.jpg`
        await shareJpgViaWhatsApp(jpgBlob, fileName, `Purchase Order ${poData.nomor}`)
        toast.success('JPG dikirim ke WhatsApp Business')
      } else {
        toast.error('Preview tidak ditemukan')
      }
    } catch (err) {
      console.error(err)
      toast.error('Gagal mengirim JPG')
    } finally {
      setSendingJpg(false)
    }
  }, [poData])

  // Scale A5 preview to fit inside a popup on both mobile & desktop
  useEffect(() => {
    const DESIGN_W = 576
    const DESIGN_H = DESIGN_W * (210 / 148) // ≈817px A5
    const updateScale = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const marginX = 24
      const marginY = 32
      const topPad = 48
      const btnArea = 56
      const availW = vw - marginX * 2
      const availH = vh - marginY * 2 - topPad - btnArea
      setPreviewScale(Math.min(availW / DESIGN_W, availH / DESIGN_H, 1))
    }
    if (previewOpen) {
      const t = setTimeout(updateScale, 60)
      window.addEventListener('resize', updateScale)
      return () => { clearTimeout(t); window.removeEventListener('resize', updateScale) }
    }
  }, [previewOpen])

  // Calculate totals
  const totalPembelian = poHistory.reduce((sum, po) => {
    const info = parseDocInfo(po)
    return sum + (info.totalHarga || 0)
  }, 0)

  // Jatuh tempo count
  const jatuhTempoCount = useMemo(() => {
    let count = 0
    for (const po of poHistory) {
      const info = parseDocInfo(po)
      if (info.tanggalJatuhTempo) count++
    }
    return count
  }, [poHistory])

  // Daftar nama suplier unik dari riwayat pembelian (isi dropdown filter)
  const partyOptions = useMemo(() => {
    const set = new Set<string>()
    for (const po of poHistory) {
      const info = parseDocInfo(po)
      const name = (info.namaToko || po.pihakKedua || '').trim()
      if (name && name !== '-') set.add(name)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'))
  }, [poHistory])

  // Search filter
  const filteredHistories = poHistory.filter(po => {
    const info = parseDocInfo(po)
    if (partyFilter && (info.namaToko || po.pihakKedua || '').trim() !== partyFilter) return false
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      (po.nomor || '').toLowerCase().includes(term) ||
      (po.pihakKedua || '').toLowerCase().includes(term) ||
      (info.namaToko || '').toLowerCase().includes(term) ||
      (info.namaBarang || '').toLowerCase().includes(term) ||
      (info.referensi || '').toLowerCase().includes(term)
    )
  })

  const filtersActiveRb = filterType !== 'all' || !!searchTerm.trim() || !!partyFilter

  const filterButtons: { type: FilterType; label: string }[] = [
    { type: 'all', label: 'Semua' },
    { type: 'today', label: 'Hari Ini' },
    { type: 'week', label: 'Minggu Ini' },
    { type: 'month', label: 'Bulan Ini' },
    { type: 'custom', label: 'Custom' },
  ]

  return (
    <DashboardLayout title="Riwayat Pembelian" subtitle="Daftar riwayat purchase order">
      <div className="space-y-4 sm:space-y-6 pb-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-3 sm:p-4">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mb-2">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-500 mb-0.5">Total Pembelian</p>
            <p className="text-base sm:text-lg font-bold text-blue-700 leading-tight">{poHistory.length}</p>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-3 sm:p-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2">
              <Package className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-500 mb-0.5">Nilai Pembelian</p>
            <p className="text-base sm:text-lg font-bold text-emerald-700 leading-tight">{formatRupiahShort(totalPembelian)}</p>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-3 sm:p-4">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center mb-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <p className="text-xs text-slate-500 mb-0.5">Jatuh Tempo</p>
            <p className="text-base sm:text-lg font-bold text-amber-700 leading-tight">{jatuhTempoCount}</p>
          </div>
        </div>

        {/* Filter: periode + suplier + pencarian SATU BARIS — selalu tampil */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-slate-200 dark:border-zinc-700 p-3 sm:p-4">
          <div
            className="flex flex-nowrap items-center gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1 pb-1 sm:mx-0 sm:px-0 sm:pb-0"
            role="group"
            aria-label="Filter riwayat pembelian"
          >
            {filterButtons.map(btn => (
              <Button
                key={btn.type}
                variant="outline"
                size="sm"
                onClick={() => handleFilterChange(btn.type)}
                className={cn(
                  'shrink-0 min-h-[44px] px-4 text-sm font-medium rounded-lg transition-all',
                  filterType === btn.type
                    ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 hover:text-white shadow-sm'
                    : 'bg-white dark:bg-[#1a1a1a] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-[#222] hover:text-slate-800 dark:hover:text-slate-200'
                )}
              >
                {btn.label}
              </Button>
            ))}
            <RiwayatCustomerFilter
              idPrefix="riwayat-pembelian"
              options={partyOptions}
              value={partyFilter}
              onChange={setPartyFilter}
              placeholder="Semua Suplier"
              ariaLabel="Filter nama suplier pembelian"
            />
            <div className="relative w-52 sm:w-64 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Cari pembelian..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Cari riwayat pembelian"
                className="w-full min-h-[44px] pl-9 pr-4 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
            </div>
            {filtersActiveRb && (
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0"
                onClick={() => { setFilterType('all'); setSearchTerm(''); setPartyFilter(''); setCustomStartDate(undefined); setCustomEndDate(undefined) }}
                aria-label="Reset filter"
                title="Reset Filter"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Table / Cards */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredHistories.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-12 text-center">
            <Package className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-3 text-sm text-slate-400 font-medium">Belum ada data pembelian</p>
            <p className="text-xs text-slate-300 mt-1">Data purchase order akan muncul di sini</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden sm:block bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-slate-200 dark:border-zinc-700 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                    <th className="text-left py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">No. PO</th>
                    <th className="text-left py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Tanggal</th>
                    <th className="text-left py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Nama Toko</th>
                    <th className="text-left py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Nama Barang</th>
                    <th className="text-center py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Jatuh Tempo</th>
                    <th className="text-left py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Kertas</th>
                    <th className="text-left py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Uk. Kertas</th>
                    <th className="text-left py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Uk. Potong</th>
                    <th className="text-center py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Potongan/Lembar</th>
                    <th className="text-right py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Qty</th>
                    <th className="text-right py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistories.map((po, idx) => {
                    const info = parseDocInfo(po)
                    const cutting = getCuttingInfo(po, pkLookup)
                    return (
                      <tr key={po.id} className={`border-b border-slate-100 hover:bg-blue-50/40 transition-colors cursor-pointer ${idx % 2 === 1 ? 'bg-slate-50/50' : ''}`}
                        onClick={() => handlePreview(po)}>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <ShoppingBag className="w-4 h-4 text-blue-600 flex-shrink-0" />
                            <span className="font-semibold text-slate-800">{po.nomor}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{po.tanggal ? formatDateShort(po.tanggal) : '-'}</td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium max-w-[180px] truncate">{info.namaToko || po.pihakKedua || '-'}</td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-[200px] truncate">{info.namaBarang ? info.namaBarang.split('\n')[0] : '-'}</td>
                        <td className="py-2.5 px-3 text-center">
                          {info.tanggalJatuhTempo ? (
                            <button
                              onClick={(e) => openStatusDialog(po, e)}
                              className={cn(
                                'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition-all hover:shadow-sm cursor-pointer',
                                new Date(info.tanggalJatuhTempo) < new Date(new Date().toISOString().slice(0, 10))
                                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                  : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                              )}>
                              {new Date(info.tanggalJatuhTempo).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                              <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                          ) : (
                            <span className="text-slate-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-[120px] truncate">{cutting.namaKertas}</td>
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{cutting.ukuranKertas}</td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {cutting.riwayatPotongKertasId ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleShowCuttingDiagram(po) }}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-medium transition-colors"
                            >
                              <Scissors className="w-3 h-3" />
                              {cutting.ukuranPotong}
                            </button>
                          ) : (
                            <span className="text-slate-400">{cutting.ukuranPotong}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {cutting.riwayatPotongKertasId ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleShowCuttingDiagram(po) }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-medium transition-colors"
                            >
                              {cutting.potonganPerLembar}
                            </button>
                          ) : (
                            <span className="text-slate-400 font-medium">{cutting.potonganPerLembar}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 text-right whitespace-nowrap">{info.totalQty > 0 ? info.totalQty : '-'}</td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <span className="font-bold text-emerald-700">{info.totalHarga > 0 ? formatRupiahShort(info.totalHarga) : po.total}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="sm:hidden space-y-2">
              {filteredHistories.map(po => {
                const info = parseDocInfo(po)
                const cutting = getCuttingInfo(po, pkLookup)
                return (
                  <div key={po.id} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg p-3 cursor-pointer" onClick={() => handlePreview(po)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <ShoppingBag className="w-4 h-4 text-blue-600 flex-shrink-0" />
                          <span className="font-semibold text-sm text-slate-800">{po.nomor}</span>
                          <button
                            onClick={(e) => openStatusDialog(po, e)}
                            className={cn(
                              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0 transition-all hover:shadow-sm cursor-pointer',
                              info.tanggalJatuhTempo
                                ? new Date(info.tanggalJatuhTempo) < new Date(new Date().toISOString().slice(0, 10))
                                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                  : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            )}>
                            {info.tanggalJatuhTempo
                              ? `JT: ${new Date(info.tanggalJatuhTempo).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}`
                              : '-'}
                            <svg className="w-2.5 h-2.5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Tanggal</span>
                            <span className="text-xs font-medium text-slate-700">{po.tanggal ? formatDateShort(po.tanggal) : '-'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Nama Toko</span>
                            <span className="text-xs font-medium text-slate-700 truncate max-w-[160px]">{info.namaToko || po.pihakKedua || '-'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Nama Barang</span>
                            <span className="text-xs font-medium text-slate-700 truncate max-w-[160px]">{info.namaBarang ? info.namaBarang.split('\n')[0] : '-'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Kertas</span>
                            <span className="text-xs font-medium text-slate-700">{cutting.namaKertas}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Uk. Kertas</span>
                            <span className="text-xs font-medium text-slate-700">{cutting.ukuranKertas}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Uk. Potong</span>
                            {cutting.riwayatPotongKertasId ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleShowCuttingDiagram(po) }}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-medium transition-colors"
                              >
                                <Scissors className="w-3 h-3" />
                                {cutting.ukuranPotong}
                              </button>
                            ) : (
                              <span className="text-xs font-medium text-slate-700">{cutting.ukuranPotong}</span>
                            )}
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Potongan/Lembar</span>
                            {cutting.riwayatPotongKertasId ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleShowCuttingDiagram(po) }}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-medium transition-colors"
                              >
                                {cutting.potonganPerLembar}
                              </button>
                            ) : (
                              <span className="text-xs font-medium text-slate-700">{cutting.potonganPerLembar}</span>
                            )}
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Qty</span>
                            <span className="text-xs font-medium text-slate-700">{info.totalQty > 0 ? info.totalQty : '-'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Total</span>
                            <span className="text-xs font-bold text-emerald-700">{info.totalHarga > 0 ? formatRupiahShort(info.totalHarga) : po.total}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ===== PREVIEW DIALOG — Purchase Order A5 popup ===== */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent
            className="max-w-none w-auto overflow-hidden p-2 pt-10 gap-0 [&_button]:cursor-default"
            style={{
              width: `${576 * previewScale + 16}px`,
              maxHeight: `calc(100dvh - 32px)`,
            }}
            aria-label="Pratinjau Purchase Order"
          >
            {/* sr-only title for accessibility */}
            <DialogHeader className="sr-only">
              <DialogTitle>Pratinjau Purchase Order</DialogTitle>
              <DialogDescription>Preview detail purchase order dalam format A5</DialogDescription>
            </DialogHeader>

            {poData && (
              <div className="flex flex-col items-center gap-3">
                {/* Scaled A5 preview */}
                <div style={{
                  width: `${576 * previewScale}px`,
                  height: `${576 * (210 / 148) * previewScale}px`,
                  overflow: 'hidden',
                  flexShrink: 0,
                }}>
                  <div style={{
                    width: 576,
                    height: 576 * (210 / 148),
                    transform: `scale(${previewScale})`,
                    transformOrigin: 'top left',
                  }}>
                    <div className="bg-white" style={{ width: 576, height: 576 * (210 / 148) }}>
                      <div className="a5-preview-scaler">
                        <PurchaseOrderPreview data={poData} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="w-full space-y-2">
                  {/* Cutting diagram button - only show if PO has linked cutting record */}
                  {previewItem && (() => {
                    const info = parseDocInfo(previewItem)
                    return info.riwayatPotongKertasId ? (
                      <button
                        onClick={() => { if (previewItem) handleShowCuttingDiagram(previewItem) }}
                        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors"
                      >
                        <Scissors className="w-4 h-4" />
                        Lihat Diagram Potong
                      </button>
                    ) : null
                  })()}
                  {/* JPG + PDF buttons side by side */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleSendJpg}
                      disabled={sendingJpg || sendingPdf}
                      className="flex items-center justify-center gap-2 flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 cursor-default text-white text-sm font-medium transition-colors"
                    >
                      {sendingJpg ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ImageIcon className="w-4 h-4" />
                      )}
                      {sendingJpg ? 'Mengirim JPG...' : 'JPG'}
                    </button>
                    <button
                      onClick={handleSendPdf}
                      disabled={sendingPdf || sendingJpg}
                      className="flex items-center justify-center gap-2 flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 cursor-default text-white text-sm font-medium transition-colors"
                    >
                      {sendingPdf ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <FileText className="w-4 h-4" />
                      )}
                      {sendingPdf ? 'Mengirim PDF...' : 'PDF'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Custom Date Dialog */}
        <Dialog open={showCustomDialog} onOpenChange={setShowCustomDialog}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Pilih Tanggal</DialogTitle>
              <DialogDescription>
                Pilih rentang tanggal pembelian yang ingin dilihat
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 pt-1">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Dari Tanggal</label>
                <input
                  type="date"
                  value={customStartStr}
                  onChange={e => setCustomStartStr(e.target.value)}
                  className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Sampai Tanggal</label>
                <input
                  type="date"
                  value={customEndStr}
                  onChange={e => setCustomEndStr(e.target.value)}
                  className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <Button variant="outline" size="sm" onClick={() => setShowCustomDialog(false)} className="text-xs">
                Batal
              </Button>
              <Button
                size="sm"
                onClick={applyCustomFilter}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
                disabled={!customStartStr || !customEndStr}
              >
                Terapkan
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ===== JATUH TEMPO DIALOG ===== */}
        <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Ubah Tanggal Jatuh Tempo</DialogTitle>
              <DialogDescription>
                {statusDialogItem ? `PO: ${statusDialogItem.nomor}` : ''}
              </DialogDescription>
            </DialogHeader>
            {statusDialogItem && (() => {
              const info = parseDocInfo(statusDialogItem)
              return (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Tanggal Jatuh Tempo</label>
                    <input
                      type="date"
                      disabled={statusUpdating}
                      value={info.tanggalJatuhTempo || ''}
                      onChange={(e) => handleStatusChange({ tanggalJatuhTempo: e.target.value })}
                      className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {info.tanggalJatuhTempo && (
                      <div className={cn(
                        'flex items-center gap-2 p-2 rounded-lg text-xs font-medium',
                        new Date(info.tanggalJatuhTempo) < new Date(new Date().toISOString().slice(0, 10))
                          ? 'bg-red-50 text-red-700'
                          : 'bg-amber-50 text-amber-700'
                      )}>
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {new Date(info.tanggalJatuhTempo) < new Date(new Date().toISOString().slice(0, 10))
                          ? `Sudah lewat jatuh tempo: ${new Date(info.tanggalJatuhTempo).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`
                          : `Jatuh tempo: ${new Date(info.tanggalJatuhTempo).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`
                        }
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
            {statusUpdating && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                <span className="text-xs text-slate-400">Menyimpan...</span>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ===== CUTTING DIAGRAM DIALOG ===== */}
        <Dialog open={cuttingDiagramOpen} onOpenChange={setCuttingDiagramOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto p-0">
            <DialogHeader className="p-4 pb-0">
              <DialogTitle className="flex items-center gap-2">
                <Scissors className="w-5 h-5 text-violet-600" />
                Diagram Potong Kertas
              </DialogTitle>
              <DialogDescription>
                Detail hasil perhitungan potong kertas
              </DialogDescription>
            </DialogHeader>

            {cuttingDiagramData && (
              <div className="p-4 bg-white dark:bg-zinc-900 space-y-3">
                {/* Info cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg p-2.5">
                    <p className="text-[10px] text-violet-500 font-medium">Customer</p>
                    <p className="text-sm font-bold text-violet-800 truncate">{cuttingDiagramInfo.customer}</p>
                  </div>
                  <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg p-2.5">
                    <p className="text-[10px] text-teal-500 font-medium">Kertas</p>
                    <p className="text-sm font-bold text-teal-800 truncate">{cuttingDiagramInfo.paper}</p>
                  </div>
                  <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg p-2.5">
                    <p className="text-[10px] text-blue-500 font-medium">Ukuran Potong</p>
                    <p className="text-sm font-bold text-blue-800">{cuttingDiagramInfo.cutSize}</p>
                  </div>
                  <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg p-2.5">
                    <p className="text-[10px] text-emerald-500 font-medium">Potongan/Lembar</p>
                    <p className="text-sm font-bold text-emerald-800">{cuttingDiagramInfo.totalPieces} pcs</p>
                  </div>
                </div>

                {/* Cutting details */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg p-2.5">
                    <p className="text-[10px] text-slate-500 font-medium">Ukuran Bahan</p>
                    <p className="text-sm font-bold text-slate-700">{cuttingDiagramData.paperWidth} × {cuttingDiagramData.paperHeight} cm</p>
                  </div>
                  <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg p-2.5">
                    <p className="text-[10px] text-slate-500 font-medium">Lembar Dibutuhkan</p>
                    <p className="text-sm font-bold text-slate-700">{cuttingDiagramData.sheetsNeeded} lbr</p>
                  </div>
                  <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg p-2.5">
                    <p className="text-[10px] text-slate-500 font-medium">Efisiensi</p>
                    <p className="text-sm font-bold text-slate-700">{cuttingDiagramData.efficiency.toFixed(1)}%</p>
                  </div>
                </div>

                {/* Cutting Diagram */}
                <div>
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Diagram Potong</p>
                  <CuttingDiagram results={cuttingDiagramData} maxHeight="50vh" />
                </div>

                {/* Steps */}
                {cuttingDiagramData.steps.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Langkah Potong</p>
                    <div className="space-y-1.5">
                      {cuttingDiagramData.steps.map((step, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <div className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-[10px] font-bold">
                            {idx + 1}
                          </div>
                          <span className="text-xs text-slate-600 pt-0.5">{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Hapus Pembelian?</DialogTitle>
              <DialogDescription>
                Data pembelian ini akan dihapus secara permanen dan tidak dapat dikembalikan.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)} className="text-xs">
                Batal
              </Button>
              <Button
                size="sm"
                onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
                className="text-xs bg-red-500 hover:bg-red-600 text-white"
              >
                Hapus
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}
