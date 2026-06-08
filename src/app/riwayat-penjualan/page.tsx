'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { useLanguage } from '@/contexts/language-context'
import { authFetch } from '@/lib/auth-fetch'
import { Button } from '@/components/ui/button'
import {
  Receipt,
  Package,
  Trash2,
  Loader2,
  Search,
  FileText,
  ImageIcon,
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
import { InvoicePreview } from '@/components/dokupro/invoice-preview'
import type { InvoiceData, CompanyInfo } from '@/lib/types'
import { DEFAULT_COMPANY } from '@/lib/types'
import { generateInvoicePdf, sharePdfViaWhatsApp, generateJpgFromElement, shareJpgViaWhatsApp } from '@/lib/generate-pdf'

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
    const client = parsed.client || {}
    const namaCustomer = client.nama || entry.pihakKedua || ''
    const ppn = parsed.ppn || 0
    const dp = parsed.dp || 0
    const tanggalJatuhTempo = parsed.tanggalJatuhTempo || ''
    const catatan = parsed.catatan || ''
    const referensi = parsed.referensi || ''
    const caraPembayaran = parsed.caraPembayaran || ''

    const firstItem = items[0]
    const namaBarang = firstItem?.deskripsi || ''

    const subtotal = items.reduce((sum: number, it: { qty: number; harga: number }) => sum + it.qty * it.harga, 0)
    const totalHarga = subtotal + (subtotal * ppn / 100)
    const sisa = totalHarga - dp

    const totalQty = items.reduce((sum: number, it: { qty: number }) => sum + (it.qty || 0), 0)

    return { namaCustomer, namaBarang, totalQty, totalHarga, ppn, dp, sisa, tanggalJatuhTempo, catatan, referensi, caraPembayaran }
  } catch {
    return { namaCustomer: '', namaBarang: '', totalQty: 0, totalHarga: 0, ppn: 0, dp: 0, sisa: 0, tanggalJatuhTempo: '', catatan: '', referensi: '', caraPembayaran: '' }
  }
}

// --- Parse dataJson for InvoiceData ---
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
      dp: parsed.dp || 0,
      catatan: parsed.catatan || '',
      tanggalJatuhTempo: parsed.tanggalJatuhTempo || '',
      caraPembayaran: parsed.caraPembayaran || '',
      tanggalGiro: parsed.tanggalGiro || '',
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
    }
  }
}

export default function RiwayatPenjualanPage() {
  const { t } = useLanguage()
  const [invHistory, setInvHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewItem, setPreviewItem] = useState<HistoryEntry | null>(null)
  const [previewScale, setPreviewScale] = useState(1)
  const [sendingPdf, setSendingPdf] = useState(false)
  const [sendingJpg, setSendingJpg] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  // Date filter
  const [filterType, setFilterType] = useState<FilterType>('month')
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

  const fetchInvHistory = useCallback(async () => {
    setLoading(true)
    try {
      const { startDate, endDate } = getFilterDates(filterType, customStartDate, customEndDate)
      const res = await authFetch(`/api/history?docType=invoice&startDate=${startDate}&endDate=${endDate}`)
      if (res.ok) {
        const json = await res.json()
        setInvHistory(json.data || [])
      }
    } catch (err) {
      console.error('[RiwayatPenjualan] fetchInvHistory error:', err)
    } finally {
      setLoading(false)
    }
  }, [filterType, customStartDate, customEndDate])

  useEffect(() => {
    fetchInvHistory()
  }, [fetchInvHistory])

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
        toast.success('Penjualan berhasil dihapus')
        notifyDataChange('invoice')
        fetchInvHistory()
      } else {
        toast.error('Gagal menghapus penjualan')
      }
    } catch {
      toast.error('Gagal menghapus penjualan')
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
        fetchInvHistory()
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

  const invData = useMemo(() => {
    if (!previewItem) return null
    return parseInvoiceData(previewItem)
  }, [previewItem])

  const handleSendPdf = useCallback(async () => {
    if (!invData) return
    setSendingPdf(true)
    try {
      const blob = await generateInvoicePdf(invData)
      const fileName = `INV_${invData.nomor || 'draft'}.pdf`
      await sharePdfViaWhatsApp(blob, fileName, `Invoice ${invData.nomor}`)
      toast.success('PDF dikirim ke WhatsApp')
    } catch (err) {
      console.error(err)
      toast.error('Gagal mengirim PDF')
    } finally {
      setSendingPdf(false)
    }
  }, [invData])

  const handleSendJpg = useCallback(async () => {
    if (!invData) return
    setSendingJpg(true)
    try {
      const previewEl = document.querySelector('[data-document-preview]') as HTMLElement
      if (previewEl) {
        const jpgBlob = await generateJpgFromElement(previewEl)
        const fileName = `INV_${invData.nomor || 'draft'}.jpg`
        await shareJpgViaWhatsApp(jpgBlob, fileName, `Invoice ${invData.nomor}`)
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
  }, [invData])

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
  const totalPenjualan = invHistory.reduce((sum, inv) => {
    const info = parseDocInfo(inv)
    return sum + (info.totalHarga || 0)
  }, 0)

  const totalDP = invHistory.reduce((sum, inv) => {
    const info = parseDocInfo(inv)
    return sum + (info.dp || 0)
  }, 0)

  const totalSisa = invHistory.reduce((sum, inv) => {
    const info = parseDocInfo(inv)
    return sum + (info.sisa || 0)
  }, 0)

  // Jatuh tempo count
  const jatuhTempoCount = useMemo(() => {
    let count = 0
    for (const inv of invHistory) {
      const info = parseDocInfo(inv)
      if (info.tanggalJatuhTempo) count++
    }
    return count
  }, [invHistory])

  // Search filter
  const filteredHistories = invHistory.filter(inv => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    const info = parseDocInfo(inv)
    return (
      (inv.nomor || '').toLowerCase().includes(term) ||
      (inv.pihakKedua || '').toLowerCase().includes(term) ||
      (info.namaCustomer || '').toLowerCase().includes(term) ||
      (info.namaBarang || '').toLowerCase().includes(term) ||
      (info.referensi || '').toLowerCase().includes(term)
    )
  })

  const filterButtons: { type: FilterType; label: string }[] = [
    { type: 'today', label: 'Hari Ini' },
    { type: 'week', label: 'Minggu Ini' },
    { type: 'month', label: 'Bulan Ini' },
    { type: 'custom', label: 'Custom' },
  ]

  return (
    <DashboardLayout title={t('riwayat_penjualan')} subtitle={t('subtitle_riwayat_penjualan')}>
      <div className="space-y-4 sm:space-y-6 pb-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 sm:p-4">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mb-2">
              <Receipt className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-500 mb-0.5">Total Penjualan</p>
            <p className="text-base sm:text-lg font-bold text-blue-700 leading-tight">{invHistory.length}</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 sm:p-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2">
              <Package className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-500 mb-0.5">Nilai Penjualan</p>
            <p className="text-base sm:text-lg font-bold text-emerald-700 leading-tight">{formatRupiahShort(totalPenjualan)}</p>
          </div>
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 sm:p-4">
            <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center mb-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            </div>
            <p className="text-xs text-slate-500 mb-0.5">Total DP</p>
            <p className="text-base sm:text-lg font-bold text-violet-700 leading-tight">{formatRupiahShort(totalDP)}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 sm:p-4 col-span-2 sm:col-span-1">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center mb-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <p className="text-xs text-slate-500 mb-0.5">Sisa Pembayaran</p>
            <p className="text-base sm:text-lg font-bold text-amber-700 leading-tight">{formatRupiahShort(totalSisa)}</p>
          </div>
        </div>

        {/* Search + Filter */}
        <div className="bg-card rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" placeholder="Cari penjualan..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
                      ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 hover:text-white shadow-sm'
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
                    <th className="text-right py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">DP</th>
                    <th className="text-right py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Total</th>
                    <th className="text-right py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Sisa</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistories.map((inv, idx) => {
                    const info = parseDocInfo(inv)
                    return (
                      <tr key={inv.id} className={`border-b border-slate-100 hover:bg-blue-50/40 transition-colors cursor-pointer ${idx % 2 === 1 ? 'bg-slate-50/50' : ''}`}
                        onClick={() => handlePreview(inv)}>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Receipt className="w-4 h-4 text-blue-600 flex-shrink-0" />
                            <span className="font-semibold text-slate-800">{inv.nomor}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{inv.tanggal ? formatDateShort(inv.tanggal) : '-'}</td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium max-w-[180px] truncate">{info.namaCustomer || inv.pihakKedua || '-'}</td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-[200px] truncate">{info.namaBarang ? info.namaBarang.split('\n')[0] : '-'}</td>
                        <td className="py-2.5 px-3 text-center">
                          {info.tanggalJatuhTempo ? (
                            <button
                              onClick={(e) => openStatusDialog(inv, e)}
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
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <span className="text-violet-700 font-medium">{info.dp > 0 ? formatRupiahShort(info.dp) : '-'}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <span className="font-bold text-emerald-700">{info.totalHarga > 0 ? formatRupiahShort(info.totalHarga) : inv.total}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <span className={cn('font-semibold', info.sisa > 0 ? 'text-red-600' : 'text-emerald-600')}>{info.sisa > 0 ? formatRupiahShort(info.sisa) : 'Lunas'}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="sm:hidden space-y-2">
              {filteredHistories.map(inv => {
                const info = parseDocInfo(inv)
                return (
                  <div key={inv.id} className="bg-card border border-slate-200 rounded-lg p-3 cursor-pointer" onClick={() => handlePreview(inv)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Receipt className="w-4 h-4 text-blue-600 flex-shrink-0" />
                          <span className="font-semibold text-sm text-slate-800">{inv.nomor}</span>
                          <button
                            onClick={(e) => openStatusDialog(inv, e)}
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
                            <span className="text-xs font-medium text-slate-700">{inv.tanggal ? formatDateShort(inv.tanggal) : '-'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Customer</span>
                            <span className="text-xs font-medium text-slate-700 truncate max-w-[160px]">{info.namaCustomer || inv.pihakKedua || '-'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Nama Barang</span>
                            <span className="text-xs font-medium text-slate-700 truncate max-w-[160px]">{info.namaBarang ? info.namaBarang.split('\n')[0] : '-'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">DP</span>
                            <span className="text-xs font-medium text-violet-700">{info.dp > 0 ? formatRupiahShort(info.dp) : '-'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Total</span>
                            <span className="text-xs font-bold text-emerald-700">{info.totalHarga > 0 ? formatRupiahShort(info.totalHarga) : inv.total}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Sisa</span>
                            <span className={cn('text-xs font-semibold', info.sisa > 0 ? 'text-red-600' : 'text-emerald-600')}>{info.sisa > 0 ? formatRupiahShort(info.sisa) : 'Lunas'}</span>
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

            {invData && (
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
                        <InvoicePreview data={invData} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="w-full space-y-2">
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
                  {/* Delete button */}
                  {previewItem && (
                    <button
                      onClick={() => setDeleteConfirmId(previewItem.id)}
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Hapus
                    </button>
                  )}
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
                Pilih rentang tanggal penjualan yang ingin dilihat
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 pt-1">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Dari Tanggal</label>
                <input
                  type="date"
                  value={customStartStr}
                  onChange={(e) => setCustomStartStr(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Sampai Tanggal</label>
                <input
                  type="date"
                  value={customEndStr}
                  onChange={(e) => setCustomEndStr(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setShowCustomDialog(false)}>Batal</Button>
              <Button size="sm" onClick={applyCustomFilter}>Terapkan</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Hapus Penjualan</DialogTitle>
              <DialogDescription>Apakah Anda yakin ingin menghapus data penjualan ini?</DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)}>Batal</Button>
              <Button variant="destructive" size="sm" onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}>Hapus</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Status Pembayaran Dialog */}
        <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Tanggal Jatuh Tempo</DialogTitle>
              <DialogDescription>Ubah tanggal jatuh tempo pembayaran</DialogDescription>
            </DialogHeader>
            {statusDialogItem && (() => {
              const info = parseDocInfo(statusDialogItem)
              return (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="text-xs font-medium text-slate-600 mb-1 block">Tanggal Jatuh Tempo</label>
                    <input
                      type="date"
                      defaultValue={info.tanggalJatuhTempo || ''}
                      onChange={(e) => {
                        // Store the new value to be used when saving
                        ;(e.target as HTMLInputElement & { _newDate?: string })._newDate = e.target.value
                      }}
                      id="status-jatuh-tempo-input"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )
            })()}
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setStatusDialogOpen(false)} disabled={statusUpdating}>Batal</Button>
              <Button size="sm" onClick={() => {
                const input = document.getElementById('status-jatuh-tempo-input') as HTMLInputElement & { _newDate?: string }
                handleStatusChange({ tanggalJatuhTempo: input?._newDate ?? input?.value ?? '' })
              }} disabled={statusUpdating}>
                {statusUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Simpan'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}
