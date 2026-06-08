'use client'

import { Suspense, useState, useEffect, useCallback, useMemo } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { InvoiceEditor } from '@/components/dokupro/invoice-editor'
import { InvoicePelunasanEditor } from '@/components/dokupro/invoice-pelunasan-editor'
import { useLanguage } from '@/contexts/language-context'
import { useAuth } from '@/contexts/auth-context'
import { authFetch } from '@/lib/auth-fetch'
import { getAuthHeaders } from '@/lib/auth'
import { fetcher } from '@/lib/fetcher'
import { formatRupiah, formatTanggal } from '@/lib/format'
import { notifyDataChange } from '@/lib/data-sync'
import { cn } from '@/lib/utils'
import {
  History,
  Eye,
  RotateCcw,
  Trash2,
  FileText,
  Loader2,
  Search,
  X,
  DatabaseBackup,
  Upload,
  CheckCircle2,
  CircleDot,
  Wallet,
  AlertTriangle,
  CalendarClock,
  Banknote,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { InvoicePreview } from '@/components/dokupro/invoice-preview'
import { generateJpgFromElement, shareJpgViaWhatsApp } from '@/lib/generate-pdf'
import { useDokuproStore } from '@/lib/store'
import type { InvoiceData, CompanyInfo } from '@/lib/types'
import { DEFAULT_COMPANY } from '@/lib/types'

// --- Types ---
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

// --- Helper ---
function getTodayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatRupiahShort(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
}

// --- Parse dataJson for document info ---
function parseDocInfo(entry: HistoryEntry) {
  try {
    const parsed = JSON.parse(entry.dataJson)
    const items = parsed.items || []
    const firstItem = items[0]
    const namaBarang = firstItem?.deskripsi || ''
    const hargaSatuan = firstItem?.harga || 0
    const totalQty = items.reduce((sum: number, it: { qty: number }) => sum + (it.qty || 0), 0)
    const subtotal = items.reduce((sum: number, it: { qty: number; harga: number }) => sum + it.qty * it.harga, 0)
    const ppn = parsed.ppn || 0
    const dpPercent = parsed.dp || 0
    const totalHarga = subtotal + (subtotal * ppn / 100)
    const dpAmount = totalHarga * (dpPercent / 100)
    const sisa = totalHarga - dpAmount
    const lunas = parsed.lunas === true
    const tanggalJatuhTempo = parsed.tanggalJatuhTempo || ''
    const tanggalPelunasan = parsed.tanggalPelunasan || ''
    const referensi = parsed.referensi || ''
    return { namaBarang, hargaSatuan, totalQty, totalHarga, dpPercent, dp: dpAmount, sisa, lunas, tanggalJatuhTempo, tanggalPelunasan, referensi }
  } catch {
    return { namaBarang: '', hargaSatuan: 0, totalQty: 0, totalHarga: 0, dpPercent: 0, dp: 0, sisa: 0, lunas: false, tanggalJatuhTempo: '', tanggalPelunasan: '', referensi: '' }
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
      lunas: parsed.lunas === true,
      tanggalPelunasan: parsed.tanggalPelunasan || '',
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
      lunas: false,
      tanggalPelunasan: '',
    }
  }
}

// ============================================================
// InvoiceRiwayatTab — all invoice history
// ============================================================
function InvoiceRiwayatTab({ onRestore }: { onRestore: () => void }) {
  const { user } = useAuth()
  const setInvoice = useDokuproStore((s) => s.setInvoice)
  const [invoiceHistory, setInvoiceHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [previewItem, setPreviewItem] = useState<HistoryEntry | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewScale, setPreviewScale] = useState(1)
  const [sendingPdf, setSendingPdf] = useState(false)
  const [backupLoading, setBackupLoading] = useState<string | null>(null)

  // Pelunasan dialog state
  const [pelunasanDialogOpen, setPelunasanDialogOpen] = useState(false)
  const [pelunasanDialogItem, setPelunasanDialogItem] = useState<HistoryEntry | null>(null)
  const [pelunasanUpdating, setPelunasanUpdating] = useState(false)
  const [pelunasanToggle, setPelunasanToggle] = useState(false)
  const [pelunasanDate, setPelunasanDate] = useState('')
  const [jatuhTempoDate, setJatuhTempoDate] = useState('')

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true)
      const headers = getAuthHeaders()
      const res = await fetch('/api/history?docType=invoice', { headers })
      if (res.ok) {
        const json = await res.json()
        setInvoiceHistory(json.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch invoice history:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  useEffect(() => {
    const handler = () => fetchHistory()
    window.addEventListener('dokupro:history-updated', handler)
    return () => window.removeEventListener('dokupro:history-updated', handler)
  }, [fetchHistory])

  useEffect(() => {
    if (!previewOpen) return
    const DESIGN_W = 576
    const DESIGN_H = DESIGN_W * (210 / 148)
    const updateScale = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const pad = 16
      const btnH = 56
      const availW = vw - pad * 2
      const availH = vh - pad * 2 - btnH
      const baseScale = Math.min(availW / DESIGN_W, availH / DESIGN_H)
      setPreviewScale(baseScale * 1.3)
    }
    const t = setTimeout(updateScale, 50)
    window.addEventListener('resize', updateScale)
    return () => { clearTimeout(t); window.removeEventListener('resize', updateScale) }
  }, [previewOpen])

  const invData = useMemo(() => {
    if (!previewItem) return null
    return parseInvoiceData(previewItem)
  }, [previewItem])

  const handleDelete = async (id: string) => {
    try {
      const res = await fetcher(`/api/history/${id}`, { method: 'DELETE', headers: getAuthHeaders() })
      if (res.ok) {
        toast.success('Invoice berhasil dihapus')
        notifyDataChange('invoice')
        fetchHistory()
      } else {
        toast.error('Gagal menghapus invoice')
      }
    } catch {
      toast.error('Gagal menghapus invoice')
    }
    setDeleteConfirmId(null)
  }

  const handleStatusChange = async (updates: { tanggalJatuhTempo?: string; lunas?: boolean; tanggalPelunasan?: string }) => {
    if (!pelunasanDialogItem) return
    setPelunasanUpdating(true)
    try {
      const parsed = JSON.parse(pelunasanDialogItem.dataJson)
      if (updates.tanggalJatuhTempo !== undefined) parsed.tanggalJatuhTempo = updates.tanggalJatuhTempo
      if (updates.lunas !== undefined) parsed.lunas = updates.lunas
      if (updates.tanggalPelunasan !== undefined) parsed.tanggalPelunasan = updates.tanggalPelunasan
      delete parsed.statusPembayaran
      const newDataJson = JSON.stringify(parsed)

      const res = await fetcher(`/api/history/${pelunasanDialogItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ dataJson: newDataJson }),
      })
      if (res.ok) {
        toast.success(updates.lunas ? 'Pelunasan berhasil dicatat' : 'Berhasil diperbarui')
        setPelunasanDialogOpen(false)
        fetchHistory()
        notifyDataChange('invoice')
      } else {
        toast.error('Gagal menyimpan perubahan')
      }
    } catch {
      toast.error('Gagal menyimpan perubahan')
    } finally {
      setPelunasanUpdating(false)
    }
  }

  const openPelunasanDialog = (item: HistoryEntry, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const info = parseDocInfo(item)
    setPelunasanToggle(info.lunas)
    setPelunasanDate(info.tanggalPelunasan || getTodayStr())
    setJatuhTempoDate(info.tanggalJatuhTempo || '')
    setPelunasanDialogItem(item)
    setPelunasanDialogOpen(true)
  }

  const handleSendJpg = useCallback(async () => {
    if (!invData) return
    setSendingPdf(true)
    try {
      const previewEl = document.querySelector('[data-document-preview]') as HTMLElement
      if (previewEl) {
        const scaleWrapper = previewEl.closest('[style*="transform"]') as HTMLElement
        previewEl.classList.add('print-mode')
        const origTransform = previewEl.style.transform
        const origTransformOrigin = previewEl.style.transformOrigin
        previewEl.style.transform = 'none'
        previewEl.style.transformOrigin = 'top left'
        let scaleWrapperOrigTransform = ''
        if (scaleWrapper) {
          scaleWrapperOrigTransform = scaleWrapper.style.transform
          scaleWrapper.style.transform = 'none'
        }
        try {
          const jpgBlob = await generateJpgFromElement(previewEl)
          const fileName = `Invoice_${invData.nomor || 'draft'}.jpg`
          await shareJpgViaWhatsApp(jpgBlob, fileName, `Invoice ${invData.nomor}`)
          toast.success('Gambar dikirim ke WhatsApp')
        } finally {
          previewEl.classList.remove('print-mode')
          previewEl.style.transform = origTransform
          previewEl.style.transformOrigin = origTransformOrigin
          if (scaleWrapper) scaleWrapper.style.transform = scaleWrapperOrigTransform
        }
      } else {
        toast.error('Preview tidak ditemukan')
      }
    } catch (err) {
      console.error(err)
      toast.error('Gagal mengirim gambar')
    } finally {
      setSendingPdf(false)
    }
  }, [invData])

  const handleBackup = async () => {
    setBackupLoading('backup')
    try {
      const res = await authFetch(`/api/database/backup-master?table=invoice_history`)
      if (!res.ok) {
        let errMsg = 'Gagal backup data riwayat invoice'
        try { const errData = await res.json(); errMsg = errData?.error || errMsg } catch {}
        toast.error(errMsg)
        return
      }
      const blob = await res.blob()
      if (blob.size === 0) { toast.error('Backup kosong'); return }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = res.headers.get('Content-Disposition')
      const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
      a.download = match ? match[1] : `backup-invoice-history-${Date.now()}.xlsx`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Backup berhasil diunduh')
    } catch (e) { console.error('Backup error:', e); toast.error('Gagal backup data') }
    setBackupLoading(null)
  }

  const handleRestore = async () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.xlsx'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      if (!confirm('Data riwayat invoice yang ada akan diganti. Lanjutkan?')) return
      setBackupLoading('restore')
      try {
        const fd = new FormData(); fd.append('file', file); fd.append('table', 'invoice_history')
        const res = await authFetch('/api/database/restore-master', { method: 'POST', body: fd })
        const data = await res.json()
        if (res.ok && data.success) {
          toast.success(`Restore berhasil (${data.count} data)`); fetchHistory(); notifyDataChange('invoice')
        } else { toast.error(data.error || 'Gagal restore') }
      } catch { toast.error('File backup tidak valid') }
      setBackupLoading(null)
    }
    input.click()
  }

  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return invoiceHistory
    const q = searchQuery.toLowerCase().trim()
    return invoiceHistory.filter(entry => {
      const info = parseDocInfo(entry)
      return entry.nomor?.toLowerCase().includes(q) || entry.pihakKedua?.toLowerCase().includes(q) || info.namaBarang?.toLowerCase().includes(q) || entry.tanggal?.toLowerCase().includes(q)
    })
  }, [invoiceHistory, searchQuery])

  return (
    <>
      <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50/60">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-violet-600" />
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Riwayat Invoice</h2>
            <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{invoiceHistory.length} data</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button onClick={handleBackup} variant="outline" size="sm" disabled={backupLoading === 'backup'} className="h-7 gap-1.5 text-xs">
              {backupLoading === 'backup' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DatabaseBackup className="w-3.5 h-3.5" />} Backup
            </Button>
            <Button onClick={handleRestore} variant="outline" size="sm" disabled={backupLoading === 'restore'} className="h-7 gap-1.5 text-xs">
              {backupLoading === 'restore' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Restore
            </Button>
          </div>
        </div>

        {/* Search */}
        {invoiceHistory.length > 0 && (
          <div className="px-4 py-2 border-b border-slate-100 bg-white/50">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Cari no. invoice, customer, barang..." className="w-full h-8 pl-8 pr-8 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 placeholder:text-slate-400" />
              {searchQuery && (<button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" /></button>)}
            </div>
          </div>
        )}

        {/* Table / Cards */}
        {loading ? (
          <div className="px-4 py-6 text-center"><Loader2 className="w-6 h-6 mx-auto text-blue-500 animate-spin" /><p className="text-xs text-slate-400 mt-2">Memuat riwayat...</p></div>
        ) : filteredHistory.length > 0 ? (
          <>
            {/* Mobile */}
            <div className="sm:hidden divide-y divide-slate-100">
              {filteredHistory.slice(0, 100).map((entry) => {
                const info = parseDocInfo(entry)
                const isLunas = info.lunas || info.sisa <= 0
                return (
                  <div key={entry.id} className="px-4 py-3 hover:bg-violet-50/30 active:bg-violet-100/40 transition-colors cursor-pointer" onClick={() => { setPreviewItem(entry); setPreviewOpen(true) }}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0 flex items-center gap-2">
                        <p className="text-violet-700 font-semibold text-[13px] truncate">{entry.nomor || '-'}</p>
                        <button onClick={(e) => openPelunasanDialog(entry, e)} className={cn('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold shrink-0 transition-all hover:shadow-sm cursor-pointer', isLunas ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200')}>
                          {isLunas ? <><CheckCircle2 className="w-2.5 h-2.5" /> Lunas</> : <><CircleDot className="w-2.5 h-2.5" /> Belum</>}
                        </button>
                      </div>
                      <p className="text-emerald-700 font-bold text-sm whitespace-nowrap">{info.totalHarga > 0 ? formatRupiah(info.totalHarga) : '-'}</p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-slate-500 text-xs">{entry.tanggal ? formatTanggal(entry.tanggal) : '-'}</p>
                        <p className="text-slate-700 font-medium text-xs truncate">{entry.pihakKedua || '-'}</p>
                        {info.namaBarang && <p className="text-slate-400 text-[11px] truncate">{info.namaBarang.split('\n')[0]}</p>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {!isLunas && info.dpPercent > 0 && (<button onClick={(e) => openPelunasanDialog(entry, e)} className="inline-flex items-center justify-center w-7 h-7 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-md border border-amber-200 transition-colors" title="Pelunasan"><Wallet className="w-3.5 h-3.5" /></button>)}
                        <button onClick={() => { const parsed = parseInvoiceData(entry); setInvoice(parsed); onRestore(); toast.success('Invoice berhasil dimuat ke editor') }} className="inline-flex items-center justify-center w-7 h-7 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md border border-emerald-200 transition-colors" title="Restore"><RotateCcw className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setDeleteConfirmId(entry.id)} className="inline-flex items-center justify-center w-7 h-7 bg-red-50 hover:bg-red-100 text-red-600 rounded-md border border-red-200 transition-colors" title="Hapus"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Desktop */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-[13px] min-w-[800px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80">
                    <th className="text-left py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">No. Invoice</th>
                    <th className="text-left py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">Tgl</th>
                    <th className="text-left py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">Customer</th>
                    <th className="text-left py-3 px-3 text-slate-500 font-semibold whitespace-nowrap" style={{minWidth: '160px'}}>Nama Barang</th>
                    <th className="text-right py-3 px-3 text-slate-500 font-semibold whitespace-nowrap hidden md:table-cell">Qty</th>
                    <th className="text-right py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">Total</th>
                    <th className="text-center py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">Status</th>
                    <th className="text-center py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.slice(0, 100).map((entry, idx) => {
                    const info = parseDocInfo(entry)
                    const isLunas = info.lunas || info.sisa <= 0
                    return (
                      <tr key={entry.id} className={`border-b border-slate-50 hover:bg-violet-50/30 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
                        <td className="py-3 px-3 text-violet-700 font-semibold whitespace-nowrap">{entry.nomor || '-'}</td>
                        <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{entry.tanggal ? formatTanggal(entry.tanggal) : '-'}</td>
                        <td className="py-3 px-3 text-slate-700 font-medium max-w-[120px] truncate">{entry.pihakKedua || '-'}</td>
                        <td className="py-3 px-3 text-slate-600 max-w-[180px] truncate" title={info.namaBarang}>{info.namaBarang ? info.namaBarang.split('\n')[0] : '-'}</td>
                        <td className="py-3 px-3 text-slate-600 text-right whitespace-nowrap hidden md:table-cell">{info.totalQty > 0 ? info.totalQty.toLocaleString('id-ID') : '-'}</td>
                        <td className="py-3 px-3 text-emerald-700 font-bold text-right whitespace-nowrap">{info.totalHarga > 0 ? formatRupiah(info.totalHarga) : '-'}</td>
                        <td className="py-3 px-3 text-center">
                          <button onClick={(e) => openPelunasanDialog(entry, e)} className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all hover:shadow-sm cursor-pointer', isLunas ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200')}>
                            {isLunas ? <><CheckCircle2 className="w-3 h-3" /> Lunas</> : <><CircleDot className="w-3 h-3" /> Belum</>}
                          </button>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => { setPreviewItem(entry); setPreviewOpen(true) }} className="inline-flex items-center justify-center w-7 h-7 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md border border-blue-200 transition-colors" title="Preview"><Eye className="w-3.5 h-3.5" /></button>
                            {!isLunas && info.dpPercent > 0 && (<button onClick={(e) => openPelunasanDialog(entry, e)} className="inline-flex items-center justify-center w-7 h-7 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-md border border-amber-200 transition-colors" title="Pelunasan"><Wallet className="w-3.5 h-3.5" /></button>)}
                            <button onClick={() => { const parsed = parseInvoiceData(entry); setInvoice(parsed); onRestore(); toast.success('Invoice berhasil dimuat ke editor') }} className="inline-flex items-center justify-center w-7 h-7 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md border border-emerald-200 transition-colors" title="Restore"><RotateCcw className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setDeleteConfirmId(entry.id)} className="inline-flex items-center justify-center w-7 h-7 bg-red-50 hover:bg-red-100 text-red-600 rounded-md border border-red-200 transition-colors" title="Hapus"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="px-4 py-6 text-center"><History className="w-8 h-8 mx-auto text-slate-300 mb-2" /><p className="text-xs text-slate-400">Belum ada riwayat invoice</p></div>
        )}
      </div>

      {/* Delete Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Hapus Invoice?</DialogTitle><DialogDescription>Data invoice yang dihapus tidak dapat dikembalikan.</DialogDescription></DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)}>Batal</Button>
            <Button variant="destructive" size="sm" onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}>Hapus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pelunasan Dialog */}
      <Dialog open={pelunasanDialogOpen} onOpenChange={setPelunasanDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wallet className="w-5 h-5 text-amber-600" /> Form Pelunasan</DialogTitle>
            <DialogDescription>Kelola tanggal jatuh tempo dan pelunasan invoice</DialogDescription>
          </DialogHeader>
          {pelunasanDialogItem && (() => {
            const info = parseDocInfo(pelunasanDialogItem)
            const hasDP = info.dpPercent > 0
            const isLunas = info.lunas || info.sisa <= 0
            return (
              <div className="space-y-5 pt-1">
                <div className="rounded-xl bg-slate-50 p-4 space-y-2">
                  <div className="flex justify-between text-xs"><span className="text-slate-500">No. Invoice</span><span className="font-semibold text-slate-800">{pelunasanDialogItem.nomor}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-slate-500">Customer</span><span className="font-medium text-slate-700">{pelunasanDialogItem.pihakKedua || '-'}</span></div>
                  <div className="border-t border-slate-200 pt-2 mt-1">
                    <div className="flex justify-between text-xs"><span className="text-slate-500">Total</span><span className="font-bold text-emerald-700">{formatRupiahShort(info.totalHarga)}</span></div>
                    {hasDP && (<>
                      <div className="flex justify-between text-xs mt-1"><span className="text-slate-500">DP ({info.dpPercent}%)</span><span className="font-medium text-violet-700">- {formatRupiahShort(info.dp)}</span></div>
                      <div className="flex justify-between text-sm mt-1.5 pt-1.5 border-t border-dashed border-slate-200"><span className="font-semibold text-slate-700">Sisa Pembayaran</span><span className={cn('font-bold', info.lunas ? 'text-green-600' : 'text-red-600')}>{formatRupiahShort(info.sisa)}</span></div>
                    </>)}
                  </div>
                  {isLunas && info.tanggalPelunasan && (
                    <div className="rounded-lg bg-green-50 p-2.5 flex items-center gap-2 mt-1"><CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" /><div><p className="text-xs font-semibold text-green-800">Sudah Lunas</p><p className="text-[10px] text-green-600">Dibayar pada {new Date(info.tanggalPelunasan).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</p></div></div>
                  )}
                </div>
                <div><Label className="text-sm font-medium text-slate-700">Tanggal Jatuh Tempo</Label><Input type="date" value={jatuhTempoDate} onChange={(e) => setJatuhTempoDate(e.target.value)} className="mt-1.5" /></div>
                {hasDP && (
                  <div className="rounded-xl border border-slate-200 p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {pelunasanToggle ? (<div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-green-600" /></div>) : (<div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center"><Wallet className="w-5 h-5 text-slate-400" /></div>)}
                        <div><Label className="text-sm font-semibold text-slate-800">Pelunasan</Label><p className="text-xs text-slate-500">{pelunasanToggle ? `Sisa ${formatRupiahShort(info.sisa)} sudah dibayar` : `Sisa ${formatRupiahShort(info.sisa)} belum dibayar`}</p></div>
                      </div>
                      <Switch checked={pelunasanToggle} onCheckedChange={(checked) => { setPelunasanToggle(checked); if (checked && !pelunasanDate) setPelunasanDate(getTodayStr()) }} />
                    </div>
                    {pelunasanToggle && (<>
                      <div><Label className="text-xs font-medium text-slate-600">Tanggal Pelunasan</Label><Input type="date" value={pelunasanDate} onChange={(e) => setPelunasanDate(e.target.value)} className="mt-1" /></div>
                      <div className="rounded-lg bg-green-50 p-3 flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" /><div><p className="text-sm font-semibold text-green-800">Sudah Lunas</p><p className="text-xs text-green-600">Sisa {formatRupiahShort(info.sisa)} telah dibayar{pelunasanDate ? ` pada ${new Date(pelunasanDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}` : ''}</p></div></div>
                    </>)}
                  </div>
                )}
                {!hasDP && (<div className="rounded-lg bg-blue-50 p-3 flex items-center gap-2"><FileText className="w-4 h-4 text-blue-600 flex-shrink-0" /><div><p className="text-xs font-semibold text-blue-800">Invoice Tanpa DP</p><p className="text-[10px] text-blue-600">Invoice ini tidak memiliki down payment. Atur tanggal jatuh tempo jika diperlukan.</p></div></div>)}
              </div>
            )
          })()}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setPelunasanDialogOpen(false)} disabled={pelunasanUpdating}>Batal</Button>
            <Button size="sm" onClick={() => { handleStatusChange({ tanggalJatuhTempo: jatuhTempoDate, lunas: pelunasanToggle, tanggalPelunasan: pelunasanToggle ? pelunasanDate : '' }) }} disabled={pelunasanUpdating}>{pelunasanUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Simpan'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Popup */}
      {previewOpen && invData && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col overflow-auto">
          <button onClick={() => setPreviewOpen(false)} className="sticky top-3 self-end z-10 mr-3 mt-3 w-8 h-8 flex items-center justify-center rounded-full bg-white/90 shadow-md hover:bg-white transition-colors"><X className="w-4 h-4 text-slate-700" /></button>
          <div className="flex-1 flex items-center justify-center p-4 pb-20">
            <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'center center' }}><div data-invoice-preview><InvoicePreview data={invData} /></div></div>
          </div>
          <div className="fixed bottom-0 left-0 right-0 flex justify-center gap-2 p-4 pb-6 sm:pb-4 bg-black/60 backdrop-blur-sm">
            <Button onClick={handleSendJpg} disabled={sendingPdf} size="sm" className="bg-green-600 hover:bg-green-700 text-white">{sendingPdf ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Mengirim...</> : 'Kirim WhatsApp'}</Button>
          </div>
        </div>
      )}
    </>
  )
}

// ============================================================
// PelunasanTab — dedicated tab for settlement payments with inline form
// ============================================================
function PelunasanTab() {
  const [invoiceHistory, setInvoiceHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  // Selected invoice for pelunasan form
  const [selectedItem, setSelectedItem] = useState<HistoryEntry | null>(null)
  const [pelunasanUpdating, setPelunasanUpdating] = useState(false)
  const [pelunasanToggle, setPelunasanToggle] = useState(false)
  const [pelunasanDate, setPelunasanDate] = useState('')
  const [jatuhTempoDate, setJatuhTempoDate] = useState('')
  const [caraPembayaran, setCaraPembayaran] = useState('')

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true)
      const headers = getAuthHeaders()
      const res = await fetch('/api/history?docType=invoice', { headers })
      if (res.ok) {
        const json = await res.json()
        setInvoiceHistory(json.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch invoice history:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  useEffect(() => {
    const handler = () => fetchHistory()
    window.addEventListener('dokupro:history-updated', handler)
    return () => window.removeEventListener('dokupro:history-updated', handler)
  }, [fetchHistory])

  // Filter: only invoices with DP and not yet lunas
  const pendingInvoices = useMemo(() => {
    return invoiceHistory.filter(entry => {
      const info = parseDocInfo(entry)
      return info.dpPercent > 0 && !info.lunas && info.sisa > 0
    })
  }, [invoiceHistory])

  // Filter: invoices that are already lunas (with DP)
  const lunasInvoices = useMemo(() => {
    return invoiceHistory.filter(entry => {
      const info = parseDocInfo(entry)
      return info.dpPercent > 0 && (info.lunas || info.sisa <= 0)
    })
  }, [invoiceHistory])

  // Stats
  const totalSisa = pendingInvoices.reduce((sum, entry) => sum + parseDocInfo(entry).sisa, 0)
  const totalDP = pendingInvoices.reduce((sum, entry) => sum + parseDocInfo(entry).dp, 0)
  const overdueCount = pendingInvoices.filter(entry => {
    const info = parseDocInfo(entry)
    return info.tanggalJatuhTempo && new Date(info.tanggalJatuhTempo) < new Date(getTodayStr())
  }).length

  // Select invoice for form
  const selectInvoice = (item: HistoryEntry, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const info = parseDocInfo(item)
    setPelunasanToggle(false)
    setPelunasanDate(getTodayStr())
    setJatuhTempoDate(info.tanggalJatuhTempo || '')
    setCaraPembayaran('')
    setSelectedItem(item)
  }

  // Clear selection
  const clearSelection = () => {
    setSelectedItem(null)
    setPelunasanToggle(false)
    setPelunasanDate('')
    setJatuhTempoDate('')
    setCaraPembayaran('')
  }

  // Selected invoice info
  const selectedInfo = selectedItem ? parseDocInfo(selectedItem) : null

  // Pelunasan handler
  const handleSimpanPelunasan = async () => {
    if (!selectedItem) return
    setPelunasanUpdating(true)
    try {
      const parsed = JSON.parse(selectedItem.dataJson)
      if (jatuhTempoDate) parsed.tanggalJatuhTempo = jatuhTempoDate
      if (pelunasanToggle) {
        parsed.lunas = true
        parsed.tanggalPelunasan = pelunasanDate || getTodayStr()
        if (caraPembayaran) parsed.caraPembayaran = caraPembayaran
      } else {
        parsed.tanggalJatuhTempo = jatuhTempoDate
      }
      delete parsed.statusPembayaran
      const newDataJson = JSON.stringify(parsed)

      const res = await fetcher(`/api/history/${selectedItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ dataJson: newDataJson }),
      })
      if (res.ok) {
        toast.success(pelunasanToggle ? 'Pelunasan berhasil dicatat!' : 'Jatuh tempo berhasil diperbarui')
        clearSelection()
        fetchHistory()
        notifyDataChange('invoice')
      } else {
        toast.error('Gagal menyimpan perubahan')
      }
    } catch {
      toast.error('Gagal menyimpan perubahan')
    } finally {
      setPelunasanUpdating(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 sm:p-4">
          <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center mb-2"><Wallet className="w-5 h-5" /></div>
          <p className="text-xs text-slate-500 mb-0.5">Belum Lunas</p>
          <p className="text-lg sm:text-xl font-bold text-amber-700 leading-tight">{pendingInvoices.length}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 sm:p-4">
          <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center mb-2"><Banknote className="w-5 h-5" /></div>
          <p className="text-xs text-slate-500 mb-0.5">Total Sisa</p>
          <p className="text-lg sm:text-xl font-bold text-red-700 leading-tight">{formatRupiahShort(totalSisa)}</p>
        </div>
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 sm:p-4">
          <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center mb-2"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg></div>
          <p className="text-xs text-slate-500 mb-0.5">Total DP Diterima</p>
          <p className="text-lg sm:text-xl font-bold text-violet-700 leading-tight">{formatRupiahShort(totalDP)}</p>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 sm:p-4">
          <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center mb-2"><AlertTriangle className="w-5 h-5" /></div>
          <p className="text-xs text-slate-500 mb-0.5">Jatuh Tempo</p>
          <p className="text-lg sm:text-xl font-bold text-rose-700 leading-tight">{overdueCount}</p>
        </div>
      </div>

      {/* Main Content: List + Form */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left: Pending Invoice List */}
        <div className="lg:col-span-3 bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50/60">
            <CircleDot className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Menunggu Pelunasan</h2>
            <span className="text-[10px] font-medium text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">{pendingInvoices.length}</span>
          </div>

          {loading ? (
            <div className="px-4 py-6 text-center"><Loader2 className="w-6 h-6 mx-auto text-blue-500 animate-spin" /><p className="text-xs text-slate-400 mt-2">Memuat data...</p></div>
          ) : pendingInvoices.length > 0 ? (
            <>
              {/* Mobile Cards */}
              <div className="sm:hidden divide-y divide-slate-100 max-h-[50vh] overflow-y-auto">
                {pendingInvoices.map((entry) => {
                  const info = parseDocInfo(entry)
                  const isOverdue = info.tanggalJatuhTempo && new Date(info.tanggalJatuhTempo) < new Date(getTodayStr())
                  const isSelected = selectedItem?.id === entry.id
                  return (
                    <div key={entry.id} onClick={(e) => selectInvoice(entry, e)} className={cn('px-4 py-3 transition-colors cursor-pointer', isSelected ? 'bg-amber-50 border-l-4 border-l-amber-500' : 'hover:bg-amber-50/30')}>
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-violet-700 font-semibold text-[13px]">{entry.nomor || '-'}</p>
                            {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />}
                          </div>
                          <p className="text-slate-700 font-medium text-xs truncate">{entry.pihakKedua || '-'}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-red-600 font-bold text-sm">{formatRupiahShort(info.sisa)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isOverdue && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700"><AlertTriangle className="w-2.5 h-2.5" /> Lewat</span>}
                        {info.tanggalJatuhTempo && <span className={cn('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold', isOverdue ? 'text-red-600' : 'text-amber-600')}><CalendarClock className="w-2.5 h-2.5" /> {new Date(info.tanggalJatuhTempo).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</span>}
                        <span className="text-[9px] text-violet-500 font-medium">DP {info.dpPercent}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* Desktop Table */}
              <div className="hidden sm:block overflow-y-auto max-h-[60vh]">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-slate-200 bg-slate-50/80">
                      <th className="text-left py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">No. Invoice</th>
                      <th className="text-left py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Customer</th>
                      <th className="text-right py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">DP</th>
                      <th className="text-center py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Jatuh Tempo</th>
                      <th className="text-right py-2.5 px-3 text-slate-500 font-semibold whitespace-nowrap">Sisa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingInvoices.map((entry) => {
                      const info = parseDocInfo(entry)
                      const isOverdue = info.tanggalJatuhTempo && new Date(info.tanggalJatuhTempo) < new Date(getTodayStr())
                      const isSelected = selectedItem?.id === entry.id
                      return (
                        <tr key={entry.id} onClick={() => selectInvoice(entry)} className={cn('border-b border-slate-50 cursor-pointer transition-colors', isSelected ? 'bg-amber-50' : isOverdue ? 'bg-red-50/20 hover:bg-amber-50/30' : 'hover:bg-amber-50/30')}>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />}
                              <span className="text-violet-700 font-semibold">{entry.nomor || '-'}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 font-medium max-w-[120px] truncate">{entry.pihakKedua || '-'}</td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <span className="text-violet-600 font-medium">{info.dpPercent}%</span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {info.tanggalJatuhTempo ? (
                              <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold', isOverdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
                                {isOverdue && <AlertTriangle className="w-3 h-3" />}
                                {new Date(info.tanggalJatuhTempo).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                              </span>
                            ) : <span className="text-slate-400 text-[10px]">-</span>}
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap font-bold text-red-600">{formatRupiahShort(info.sisa)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="px-4 py-8 text-center">
              <CheckCircle2 className="w-10 h-10 mx-auto text-green-300 mb-3" />
              <p className="text-sm font-medium text-slate-500">Semua Invoice Sudah Lunas</p>
              <p className="text-xs text-slate-400 mt-1">Tidak ada invoice yang menunggu pelunasan</p>
            </div>
          )}
        </div>

        {/* Right: Form Pelunasan */}
        <div className="lg:col-span-2">
          {selectedItem && selectedInfo ? (
            <div className="bg-card rounded-2xl shadow-sm border-2 border-amber-200 overflow-hidden">
              {/* Form Header */}
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-amber-200 bg-amber-50/60">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-amber-600" />
                  <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Form Pelunasan</h2>
                </div>
                <button onClick={clearSelection} className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                  <X className="w-3.5 h-3.5 text-slate-500" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                {/* Invoice Info */}
                <div className="rounded-xl bg-slate-50 p-3 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">No. Invoice</span>
                    <span className="font-semibold text-slate-800">{selectedItem.nomor}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Customer</span>
                    <span className="font-medium text-slate-700">{selectedItem.pihakKedua || '-'}</span>
                  </div>
                  {selectedInfo.namaBarang && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Barang</span>
                      <span className="font-medium text-slate-700 truncate max-w-[150px]">{selectedInfo.namaBarang.split('\n')[0]}</span>
                    </div>
                  )}
                  <div className="border-t border-slate-200 pt-1.5 mt-1 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Total</span>
                      <span className="font-bold text-emerald-700">{formatRupiahShort(selectedInfo.totalHarga)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">DP ({selectedInfo.dpPercent}%)</span>
                      <span className="font-medium text-violet-700">- {formatRupiahShort(selectedInfo.dp)}</span>
                    </div>
                    <div className="flex justify-between text-sm pt-1 border-t border-dashed border-slate-200">
                      <span className="font-semibold text-slate-700">Sisa Pembayaran</span>
                      <span className="font-bold text-red-600">{formatRupiahShort(selectedInfo.sisa)}</span>
                    </div>
                  </div>
                </div>

                {/* Tanggal Jatuh Tempo */}
                <div>
                  <Label className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                    <CalendarClock className="w-3.5 h-3.5" /> Tanggal Jatuh Tempo
                  </Label>
                  <Input type="date" value={jatuhTempoDate} onChange={(e) => setJatuhTempoDate(e.target.value)} className="mt-1.5 text-sm" />
                </div>

                {/* Pelunasan Toggle */}
                <div className="rounded-xl border-2 border-amber-200 bg-amber-50/40 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      {pelunasanToggle ? (
                        <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-green-600" /></div>
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center"><Wallet className="w-4 h-4 text-amber-600" /></div>
                      )}
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Tandai Lunas</p>
                        <p className="text-[11px] text-slate-500">
                          {pelunasanToggle ? 'Sisa sudah dibayar' : 'Sisa belum dibayar'}
                        </p>
                      </div>
                    </div>
                    <Switch checked={pelunasanToggle} onCheckedChange={(checked) => { setPelunasanToggle(checked); if (checked && !pelunasanDate) setPelunasanDate(getTodayStr()) }} />
                  </div>

                  {pelunasanToggle && (
                    <div className="space-y-3 pt-1">
                      <div>
                        <Label className="text-xs font-medium text-slate-600">Tanggal Pelunasan</Label>
                        <Input type="date" value={pelunasanDate} onChange={(e) => setPelunasanDate(e.target.value)} className="mt-1 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs font-medium text-slate-600">Cara Pembayaran</Label>
                        <Input type="text" value={caraPembayaran} onChange={(e) => setCaraPembayaran(e.target.value)} placeholder="Transfer, Tunai, Giro..." className="mt-1 text-sm" />
                      </div>
                      <div className="rounded-lg bg-green-50 p-2.5 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-green-800">Sudah Lunas</p>
                          <p className="text-[10px] text-green-600">
                            Sisa {formatRupiahShort(selectedInfo.sisa)} telah dibayar{pelunasanDate ? ` pada ${new Date(pelunasanDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}` : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={clearSelection} disabled={pelunasanUpdating} className="flex-1">Batal</Button>
                  <Button size="sm" onClick={handleSimpanPelunasan} disabled={pelunasanUpdating} className="flex-1 bg-amber-600 hover:bg-amber-700 text-white gap-1.5">
                    {pelunasanUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Simpan Pelunasan
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-2xl shadow-sm border border-dashed border-slate-300 p-8 text-center">
              <Wallet className="w-12 h-12 mx-auto text-slate-200 mb-3" />
              <p className="text-sm font-medium text-slate-400">Pilih Invoice</p>
              <p className="text-xs text-slate-300 mt-1">Klik invoice di daftar untuk mengisi form pelunasan</p>
            </div>
          )}
        </div>
      </div>

      {/* Lunas History — collapsed by default */}
      {lunasInvoices.length > 0 && (
        <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <details>
            <summary className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-green-50/60 cursor-pointer hover:bg-green-50 transition-colors">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Sudah Lunas</h2>
              <span className="text-[10px] font-medium text-green-600 bg-green-100 px-2 py-0.5 rounded-full">{lunasInvoices.length} invoice</span>
            </summary>
            <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {lunasInvoices.map((entry) => {
                const info = parseDocInfo(entry)
                return (
                  <div key={entry.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-violet-700 font-semibold text-xs">{entry.nomor || '-'}</p>
                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                      </div>
                      <p className="text-slate-500 text-[11px]">{entry.pihakKedua || '-'} · {info.namaBarang ? info.namaBarang.split('\n')[0] : '-'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-green-600 font-semibold text-xs">{formatRupiahShort(info.sisa > 0 ? info.sisa : 0)}</p>
                      {info.tanggalPelunasan && <p className="text-[10px] text-slate-400">{new Date(info.tanggalPelunasan).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

// ============================================================
// InvoicePage — main page with 4 tabs
// ============================================================
export default function InvoicePage() {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState<'editor' | 'riwayat' | 'pelunasan' | 'editor-pelunasan'>('editor')
  const [invoiceCount, setInvoiceCount] = useState(0)
  const [pelunasanCount, setPelunasanCount] = useState(0)

  // Fetch counts for badges
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const headers = getAuthHeaders()
        const res = await fetch('/api/history?docType=invoice', { headers })
        if (res.ok) {
          const json = await res.json()
          const data: HistoryEntry[] = json.data || []
          setInvoiceCount(data.length)
          // Count invoices with DP that are not yet lunas
          const pending = data.filter(entry => {
            const info = parseDocInfo(entry)
            return info.dpPercent > 0 && !info.lunas && info.sisa > 0
          })
          setPelunasanCount(pending.length)
        }
      } catch {}
    }
    fetchCounts()

    const handler = () => fetchCounts()
    window.addEventListener('dokupro:history-updated', handler)
    return () => window.removeEventListener('dokupro:history-updated', handler)
  }, [])

  const tabs: { key: 'editor' | 'riwayat' | 'pelunasan' | 'editor-pelunasan'; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'editor', label: 'Editor', icon: <FileText className="w-3.5 h-3.5" /> },
    { key: 'riwayat', label: 'Riwayat', icon: <History className="w-3.5 h-3.5" />, badge: invoiceCount || undefined },
    { key: 'pelunasan', label: 'Pelunasan', icon: <Wallet className="w-3.5 h-3.5" />, badge: pelunasanCount || undefined },
    { key: 'editor-pelunasan', label: 'Editor Pelunasan', icon: <><FileText className="w-3.5 h-3.5" /><Wallet className="w-3 h-3" /></> },
  ]

  return (
    <DashboardLayout title="Invoice" subtitle="Buat invoice dengan pratinjau langsung dan cetak A5">
      {/* Tab Navigation */}
      <div className="sticky top-0 z-20 -mx-4 px-4 bg-card flex items-center gap-2 mb-3 print:hidden overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-1.5 text-sm font-semibold rounded-lg border transition-colors whitespace-nowrap flex-shrink-0',
              activeTab === tab.key
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-card text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              {tab.icon}
              {tab.label}
            </span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className={cn('ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full', activeTab === tab.key ? 'bg-white/20 text-white' : tab.key === 'pelunasan' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500')}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Editor Tab */}
      {activeTab === 'editor' && (
        <Suspense fallback={null}>
          <InvoiceEditor />
        </Suspense>
      )}

      {/* Riwayat Tab */}
      {activeTab === 'riwayat' && (
        <div className="print:hidden">
          <InvoiceRiwayatTab onRestore={() => setActiveTab('editor')} />
        </div>
      )}

      {/* Pelunasan Tab */}
      {activeTab === 'pelunasan' && (
        <div className="print:hidden">
          <PelunasanTab />
        </div>
      )}

      {/* Editor Pelunasan Tab */}
      {activeTab === 'editor-pelunasan' && (
        <Suspense fallback={null}>
          <InvoicePelunasanEditor />
        </Suspense>
      )}
    </DashboardLayout>
  )
}
