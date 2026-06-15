'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Search, Eye, Loader2, Receipt, FileText, Package, RotateCcw, Trash2 } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useLanguage } from '@/contexts/language-context'
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { getAuthHeaders } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'
import { fetcher } from '@/lib/fetcher'
import { cn } from '@/lib/utils'
import { InvoicePreview } from '@/components/dokupro/invoice-preview'
import type { InvoiceData, CompanyInfo } from '@/lib/types'
import { DEFAULT_COMPANY } from '@/lib/types'
import { generateInvoicePdf, sharePdfViaWhatsApp } from '@/lib/generate-pdf'
import { useDokuproStore } from '@/lib/store'
import { useRouter } from 'next/navigation'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface HistoryEntry {
  id: string
  docType: string
  nomor: string
  tanggal: string
  pihakKedua: string
  total: string
  dataJson: string
  createdAt: string
}

interface ParsedInfo {
  namaBarang: string
  hargaSatuan: number
  totalQty: number
  totalHarga: number
  referensi: string
  items: { deskripsi: string; qty: number; satuan: string; harga: number }[]
  ppn: number
  catatan: string
  client: { nama: string; kontak: string; alamat: string }
  tanggalJatuhTempo: string
  caraPembayaran: string
  tanggalGiro: string
  uangCapek: number
}

function parseDocInfo(entry: HistoryEntry): ParsedInfo {
  try {
    const parsed = JSON.parse(entry.dataJson)
    const items = parsed.items || []
    const firstItem = items[0]
    const namaBarang = firstItem?.deskripsi || ''
    const hargaSatuan = firstItem?.harga || 0
    const totalQty = items.reduce((sum: number, it: { qty: number }) => sum + (it.qty || 0), 0)
    const subtotal = items.reduce((sum: number, it: { qty: number; harga: number }) => sum + it.qty * it.harga, 0)
    const ppn = parsed.ppn || 0
    const totalHarga = subtotal + (subtotal * ppn / 100)
    const referensi = parsed.referensi || ''
    const client = parsed.client || parsed.penerima || parsed.pemasok || {}
    return {
      namaBarang, hargaSatuan, totalQty, totalHarga, referensi, items,
      ppn,
      catatan: parsed.catatan || '',
      client: { nama: client.nama || '', kontak: client.kontak || '', alamat: client.alamat || '' },
      tanggalJatuhTempo: parsed.tanggalJatuhTempo || '',
      caraPembayaran: parsed.caraPembayaran || '',
      tanggalGiro: parsed.tanggalGiro || '',
      uangCapek: parsed.uangCapek || 0,
    }
  } catch {
    return { namaBarang: '', hargaSatuan: 0, totalQty: 0, totalHarga: 0, referensi: '', items: [], ppn: 0, catatan: '', client: { nama: '', kontak: '', alamat: '' }, tanggalJatuhTempo: '', caraPembayaran: '', tanggalGiro: '', uangCapek: 0 }
  }
}

function parseInvoiceData(entry: HistoryEntry): InvoiceData {
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
    const client = parsed.client || { nama: '', kontak: '', alamat: '' }
    const items = (parsed.items || []).map((it: { id?: string; deskripsi?: string; qty?: number; satuan?: string; harga?: number }, i: number) => ({
      id: it.id || `item-${i}`,
      deskripsi: it.deskripsi || '',
      qty: it.qty || 0,
      satuan: it.satuan || '',
      harga: it.harga || 0,
    }))
    return {
      type: 'invoice',
      company,
      nomor: parsed.nomor || entry.nomor || '',
      tanggal: parsed.tanggal || entry.tanggal || '',
      referensi: parsed.referensi || '',
      client,
      items,
      ppn: parsed.ppn ?? 11,
      dp: parsed.dp ?? 0,
      catatan: parsed.catatan || '',
      tanggalJatuhTempo: parsed.tanggalJatuhTempo || '',
      caraPembayaran: parsed.caraPembayaran || '',
      tanggalGiro: parsed.tanggalGiro || '',
      uangCapek: parsed.uangCapek || 0,
    }
  } catch {
    return {
      type: 'invoice',
      company: { ...DEFAULT_COMPANY },
      nomor: entry.nomor || '',
      tanggal: entry.tanggal || '',
      referensi: '',
      client: { nama: '', kontak: '', alamat: '' },
      items: [],
      ppn: 11,
      dp: 0,
      catatan: '',
      tanggalJatuhTempo: '',
      caraPembayaran: '',
      tanggalGiro: '',
      uangCapek: 0,
    }
  }
}

function formatRp(n: number) {
  return `Rp ${n.toLocaleString('id-ID')}`
}

function formatRupiahShort(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

// --- Date filter ---
type FilterType = 'today' | 'week' | 'month' | 'custom'

function getFilterDates(filter: FilterType, customStart?: Date, customEnd?: Date): { startDate: string; endDate: string } {
  const today = new Date()
  const fmt = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  switch (filter) {
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

export default function RiwayatPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const setInvoice = useDokuproStore((s) => s.setInvoice)
  const [searchTerm, setSearchTerm] = useState('')
  const [histories, setHistories] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewItem, setPreviewItem] = useState<HistoryEntry | null>(null)
  const [previewScale, setPreviewScale] = useState(1)
  const [sendingPdf, setSendingPdf] = useState(false)

  // Date filter
  const [filterType, setFilterType] = useState<FilterType>('month')
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined)
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined)

  // Custom date dialog
  const [showCustomDialog, setShowCustomDialog] = useState(false)
  const [customStartStr, setCustomStartStr] = useState('')
  const [customEndStr, setCustomEndStr] = useState('')

  // Jatuh tempo dialog
  const [statusDialogOpen, setStatusDialogOpen] = useState(false)
  const [statusDialogItem, setStatusDialogItem] = useState<HistoryEntry | null>(null)
  const [statusUpdating, setStatusUpdating] = useState(false)

  // Uang capek: read from stored invoice data, fallback to cetakan matching
  const [cetakanList, setCetakanList] = useState<{ nomorUrut: string; printName: string; profitAmount: number }[]>([])

  const invoiceUangCapek = useMemo(() => {
    const result = new Map<string, number>()
    // Build fallback map from riwayat cetakan for old invoices without stored uangCapek
    const cetakanByRef = new Map<string, number>()
    for (const c of cetakanList) {
      if (c.nomorUrut) cetakanByRef.set(c.nomorUrut, (cetakanByRef.get(c.nomorUrut) || 0) + c.profitAmount)
      if (c.printName && !cetakanByRef.has(c.printName)) cetakanByRef.set(c.printName, (cetakanByRef.get(c.printName) || 0) + c.profitAmount)
    }
    for (const inv of histories) {
      const info = parseDocInfo(inv)
      // Priority: use stored uangCapek from invoice data, fallback to cetakan matching
      const uc = info.uangCapek > 0 ? info.uangCapek : (info.referensi ? (cetakanByRef.get(info.referensi) || 0) : 0)
      result.set(inv.id, uc)
    }
    return result
  }, [histories, cetakanList])

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      const { startDate, endDate } = getFilterDates(filterType, customStartDate, customEndDate)
      const headers = getAuthHeaders()
      const res = await authFetch(`/api/history?docType=invoice&startDate=${startDate}&endDate=${endDate}`, { headers })
      if (res.ok) {
        const json = await res.json()
        setHistories(json.data || [])
      }
      // Fetch riwayat cetakan for uang capek calculation
      try {
        const cetRes = await fetch('/api/riwayat-cetakan', { headers })
        if (cetRes.ok) {
          const cetData = await cetRes.json()
          const mapped = (Array.isArray(cetData) ? cetData : []).map((r: { nomorUrut?: string; printName?: string; profitAmount?: number }) => ({
            nomorUrut: r.nomorUrut || '',
            printName: r.printName || '',
            profitAmount: r.profitAmount || 0,
          }))
          setCetakanList(mapped)
        }
      } catch {}
    } catch {
      toast.error('Gagal memuat riwayat invoice')
    } finally {
      setLoading(false)
    }
  }, [filterType, customStartDate, customEndDate])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  // Listen for save events
  useEffect(() => {
    const handler = () => fetchHistory()
    window.addEventListener('dokupro:history-updated', handler)
    return () => window.removeEventListener('dokupro:history-updated', handler)
  }, [fetchHistory])

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
      const newDataJson = JSON.stringify(parsed)

      const res = await fetcher(`/api/history/${statusDialogItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ dataJson: newDataJson }),
      })
      if (res.ok) {
        toast.success('Tanggal jatuh tempo berhasil diubah')
        setStatusDialogOpen(false)
        fetchHistory()
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

  const handleRestore = (item: HistoryEntry, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const parsed = parseInvoiceData(item)
    setInvoice(parsed)
    toast.success('Invoice dimuat ke editor')
    router.push('/invoice')
  }

  const handleDeleteHistory = async (id: string) => {
    try {
      const res = await fetch(`/api/history/${id}`, { method: 'DELETE', headers: getAuthHeaders() })
      if (res.ok) {
        toast.success('Riwayat berhasil dihapus')
        fetchHistory()
      } else {
        toast.error('Gagal menghapus')
      }
    } catch {
      toast.error('Gagal menghapus')
    }
  }

  const invoiceData = useMemo(() => {
    if (!previewItem) return null
    return parseInvoiceData(previewItem)
  }, [previewItem])

  const handleSendPdf = useCallback(async () => {
    if (!invoiceData) return
    setSendingPdf(true)
    try {
      const blob = await generateInvoicePdf(invoiceData)
      const fileName = `Invoice_${invoiceData.nomor || 'draft'}.pdf`
      await sharePdfViaWhatsApp(blob, fileName, `Invoice ${invoiceData.nomor}`)
      toast.success('PDF dikirim ke WhatsApp')
    } catch (err) {
      console.error(err)
      toast.error('Gagal mengirim PDF')
    } finally {
      setSendingPdf(false)
    }
  }, [invoiceData])

  // Scale A5 preview to fit inside a popup on both mobile & desktop
  useEffect(() => {
    const DESIGN_W = 576
    const DESIGN_H = DESIGN_W * (210 / 148)
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
  const totalPenjualan = histories.reduce((sum, h) => {
    const info = parseDocInfo(h)
    return sum + (info.totalHarga || 0)
  }, 0)

  // Total uang capek
  const totalUangCapek = useMemo(() => {
    let sum = 0
    for (const h of histories) {
      sum += invoiceUangCapek.get(h.id) ?? 0
    }
    return sum
  }, [histories, invoiceUangCapek])

  // Jatuh tempo count
  const jatuhTempoCount = useMemo(() => {
    let count = 0
    for (const h of histories) {
      const info = parseDocInfo(h)
      if (info.tanggalJatuhTempo) count++
    }
    return count
  }, [histories])

  // Search filter
  const filteredHistories = histories.filter(h => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    const info = parseDocInfo(h)
    return (
      (h.nomor || '').toLowerCase().includes(term) ||
      (h.pihakKedua || '').toLowerCase().includes(term) ||
      (info.namaBarang || '').toLowerCase().includes(term) ||
      (info.client.nama || '').toLowerCase().includes(term)
    )
  })

  const filterButtons: { type: FilterType; label: string }[] = [
    { type: 'today', label: 'Hari Ini' },
    { type: 'week', label: 'Minggu Ini' },
    { type: 'month', label: 'Bulan Ini' },
    { type: 'custom', label: 'Custom' },
  ]

  const getCaraBayarLabel = (cara: string) => {
    if (cara === 'cash') return 'Cash'
    if (cara === 'transfer') return 'Transfer'
    if (cara === 'giro') return 'Giro'
    return '-'
  }

  return (
    <DashboardLayout title="Riwayat Penjualan" subtitle="Daftar riwayat invoice penjualan">
      <div className="space-y-4 sm:space-y-6 pb-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 sm:p-4">
            <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center mb-2">
              <Receipt className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-500 mb-0.5">Total Penjualan</p>
            <p className="text-base sm:text-lg font-bold text-violet-700 leading-tight">{histories.length}</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 sm:p-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2">
              <Package className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-500 mb-0.5">Nilai Penjualan</p>
            <p className="text-base sm:text-lg font-bold text-emerald-700 leading-tight">{formatRupiahShort(totalPenjualan)}</p>
          </div>
          <div className="bg-fuchsia-50 border border-fuchsia-200 rounded-xl p-3 sm:p-4">
            <div className="w-8 h-8 rounded-lg bg-fuchsia-100 text-fuchsia-600 flex items-center justify-center mb-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <p className="text-xs text-slate-500 mb-0.5">Total Uang Capek</p>
            <p className="text-base sm:text-lg font-bold text-fuchsia-700 leading-tight">{formatRupiahShort(totalUangCapek)}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 sm:p-4">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center mb-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <p className="text-xs text-slate-500 mb-0.5">Jatuh Tempo</p>
            <p className="text-base sm:text-lg font-bold text-amber-700 leading-tight">{jatuhTempoCount}</p>
          </div>
        </div>

        {/* Search + Filter */}
        <div className="bg-card rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" placeholder="Cari invoice..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {filterButtons.map(btn => (
                <Button
                  key={btn.type}
                  variant="outline"
                  size="sm"
                  onClick={() => handleFilterChange(btn.type)}
                  className={cn(
                    'h-8 px-3 text-xs font-medium rounded-lg transition-all',
                    filterType === btn.type
                      ? 'bg-violet-600 text-white border-violet-600 hover:bg-violet-700 hover:text-white shadow-sm'
                      : 'bg-white dark:bg-[#1a1a1a] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-[#222] hover:text-slate-800 dark:hover:text-slate-200'
                  )}
                >
                  {btn.label}
                </Button>
              ))}
            </div>
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
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-12 text-center">
            <Receipt className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-3 text-sm text-slate-400 font-medium">Belum ada data penjualan</p>
            <p className="text-xs text-slate-300 mt-1">Data invoice akan muncul di sini</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden sm:block bg-card rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80">
                    <th className="text-left py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">No. Invoice</th>
                    <th className="text-left py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Tanggal</th>
                    <th className="text-left py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Customer</th>
                    <th className="text-left py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Nama Barang</th>
                    <th className="text-center py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Jatuh Tempo</th>
                    <th className="text-center py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Cara Bayar</th>
                    <th className="text-right py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Qty</th>
                    <th className="text-right py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Uang Capek</th>
                    <th className="text-right py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Total</th>
                    <th className="text-center py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistories.map((h, idx) => {
                    const info = parseDocInfo(h)
                    return (
                      <tr key={h.id} className={`border-b border-slate-100 hover:bg-violet-50/40 transition-colors cursor-pointer ${idx % 2 === 1 ? 'bg-slate-50/50' : ''}`}
                        onClick={() => handlePreview(h)}>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Receipt className="w-4 h-4 text-violet-600 flex-shrink-0" />
                            <span className="font-semibold text-slate-800">{h.nomor}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{h.tanggal ? formatDateShort(h.tanggal) : '-'}</td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium max-w-[180px] truncate">{h.pihakKedua || '-'}</td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-[200px] truncate">{info.namaBarang ? info.namaBarang.split('\n')[0] : '-'}</td>
                        <td className="py-2.5 px-3 text-center">
                          {info.tanggalJatuhTempo ? (
                            <button
                              onClick={(e) => openStatusDialog(h, e)}
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
                        <td className="py-2.5 px-3 text-center">
                          {info.caraPembayaran ? (
                            <span className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold',
                              info.caraPembayaran === 'cash' ? 'bg-emerald-100 text-emerald-700' :
                              info.caraPembayaran === 'transfer' ? 'bg-blue-100 text-blue-700' :
                              'bg-orange-100 text-orange-700'
                            )}>
                              {getCaraBayarLabel(info.caraPembayaran)}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 text-right whitespace-nowrap">{info.totalQty > 0 ? info.totalQty.toLocaleString('id-ID') : '-'}</td>
                        <td className={`py-2.5 px-3 text-right whitespace-nowrap font-semibold ${invoiceUangCapek.get(h.id) ?? 0 > 0 ? 'text-violet-700' : 'text-slate-400'}`}>{(invoiceUangCapek.get(h.id) ?? 0) > 0 ? formatRupiahShort(invoiceUangCapek.get(h.id) ?? 0) : '-'}</td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <span className="font-bold text-emerald-700">{info.totalHarga > 0 ? formatRupiahShort(info.totalHarga) : h.total}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={(e) => handleRestore(h, e)}
                              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                              title="Restore ke editor"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button
                                  className="inline-flex items-center justify-center h-7 w-7 rounded-md text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                  title="Hapus"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Hapus Riwayat?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Invoice <strong>{h.nomor}</strong> akan dihapus dari riwayat. Tindakan ini tidak dapat dibatalkan.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Batal</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteHistory(h.id)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Hapus
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="sm:hidden space-y-2">
              {filteredHistories.map(h => {
                const info = parseDocInfo(h)
                return (
                  <div key={h.id} className="bg-card border border-slate-200 rounded-lg p-3 cursor-pointer" onClick={() => handlePreview(h)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Receipt className="w-4 h-4 text-violet-600 flex-shrink-0" />
                          <span className="font-semibold text-sm text-slate-800">{h.nomor}</span>
                          <button
                            onClick={(e) => openStatusDialog(h, e)}
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
                            <span className="text-xs font-medium text-slate-700">{h.tanggal ? formatDateShort(h.tanggal) : '-'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Customer</span>
                            <span className="text-xs font-medium text-slate-700 truncate max-w-[160px]">{h.pihakKedua || '-'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Nama Barang</span>
                            <span className="text-xs font-medium text-slate-700 truncate max-w-[160px]">{info.namaBarang ? info.namaBarang.split('\n')[0] : '-'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Cara Bayar</span>
                            {info.caraPembayaran ? (
                              <span className={cn(
                                'inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold',
                                info.caraPembayaran === 'cash' ? 'bg-emerald-100 text-emerald-700' :
                                info.caraPembayaran === 'transfer' ? 'bg-blue-100 text-blue-700' :
                                'bg-orange-100 text-orange-700'
                              )}>
                                {getCaraBayarLabel(info.caraPembayaran)}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Qty</span>
                            <span className="text-xs font-medium text-slate-700">{info.totalQty > 0 ? info.totalQty.toLocaleString('id-ID') : '-'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Uang Capek</span>
                            <span className={`text-xs font-semibold ${(invoiceUangCapek.get(h.id) ?? 0) > 0 ? 'text-violet-700' : 'text-slate-400'}`}>{(invoiceUangCapek.get(h.id) ?? 0) > 0 ? formatRupiahShort(invoiceUangCapek.get(h.id) ?? 0) : '-'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Total</span>
                            <span className="text-xs font-bold text-emerald-700">{info.totalHarga > 0 ? formatRupiahShort(info.totalHarga) : h.total}</span>
                          </div>
                        </div>
                        {/* Action buttons */}
                        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => handleRestore(h, e)}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 h-7 rounded-md text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Restore
                          </button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                className="flex-1 inline-flex items-center justify-center gap-1.5 h-7 rounded-md text-xs font-medium text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Hapus
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Hapus Riwayat?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Invoice <strong>{h.nomor}</strong> akan dihapus dari riwayat. Tindakan ini tidak dapat dibatalkan.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Batal</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteHistory(h.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Hapus
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* ===== PREVIEW DIALOG — Invoice A5 popup ===== */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          className="max-w-none w-auto overflow-hidden p-2 pt-10 gap-0 [&_button]:cursor-default"
          style={{
            width: `${576 * previewScale + 16}px`,
            maxHeight: `calc(100dvh - 32px)`,
          }}
          aria-label="Pratinjau Invoice"
        >
          {/* sr-only title for accessibility */}
          <DialogHeader className="sr-only">
            <DialogTitle>Pratinjau Invoice</DialogTitle>
            <DialogDescription>Preview detail invoice dalam format A5</DialogDescription>
          </DialogHeader>

          {invoiceData && (
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
                      <InvoicePreview data={invoiceData} />
                    </div>
                  </div>
                </div>
              </div>

              {/* PDF to WhatsApp button */}
              <button
                onClick={handleSendPdf}
                disabled={sendingPdf}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 cursor-default text-white text-sm font-medium transition-colors flex-shrink-0"
              >
                {sendingPdf ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                {sendingPdf ? 'Mengirim PDF...' : 'Kirim PDF ke WhatsApp'}
              </button>
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
              Pilih rentang tanggal penjualan yang ingin dilihat
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Dari Tanggal</label>
              <input
                type="date"
                value={customStartStr}
                onChange={e => setCustomStartStr(e.target.value)}
                className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Sampai Tanggal</label>
              <input
                type="date"
                value={customEndStr}
                onChange={e => setCustomEndStr(e.target.value)}
                className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
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
              className="text-xs bg-violet-600 hover:bg-violet-700 text-white"
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
              {statusDialogItem ? `Invoice: ${statusDialogItem.nomor}` : ''}
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
                    className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
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
    </DashboardLayout>
  )
}
