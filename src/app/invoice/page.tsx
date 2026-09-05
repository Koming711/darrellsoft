'use client'

import { Suspense, useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
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
  Banknote,
  Combine,
  Plus,
  ArrowLeft,
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
import { captureElementAsJpg } from '@/lib/capture-jpg'
import { shareJpgToWhatsApp } from '@/lib/share-jpg'
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
    const itemCount = items.length
    const firstItem = items[0]
    const namaBarang = firstItem?.deskripsi || ''
    const hargaSatuan = firstItem?.harga || 0
    const totalQty = items.reduce((sum: number, it: { qty: number }) => sum + (it.qty || 0), 0)
    const subtotal = items.reduce((sum: number, it: { qty: number; harga: number }) => sum + it.qty * it.harga, 0)
    const ppn = parsed.ppn || 0
    const dpPercent = parsed.dp || 0
    const totalHarga = subtotal + (subtotal * ppn / 100)
    // Always derive dpAmount from originalTotal
    const originalTotal = parsed.originalTotal !== undefined ? parsed.originalTotal : totalHarga
    const dpAmount = originalTotal * (dpPercent / 100)
    const sisa = totalHarga - dpAmount
    const lunas = parsed.lunas === true
    const tanggalJatuhTempo = parsed.tanggalJatuhTempo || ''
    const tanggalPelunasan = parsed.tanggalPelunasan || ''
    const referensi = parsed.referensi || ''
    const referensiInvoiceNomor = parsed.referensiInvoiceNomor || ''
    const isPelunasan = entry.docType === 'invoice-pelunasan'
    const uangCapek = parsed.uangCapek || 0
    return { namaBarang, hargaSatuan, totalQty, totalHarga, dpPercent, dp: dpAmount, sisa, lunas, tanggalJatuhTempo, tanggalPelunasan, referensi, referensiInvoiceNomor, isPelunasan, originalTotal, uangCapek, itemCount }
  } catch {
    return { namaBarang: '', hargaSatuan: 0, totalQty: 0, totalHarga: 0, dpPercent: 0, dp: 0, sisa: 0, lunas: false, tanggalJatuhTempo: '', tanggalPelunasan: '', referensi: '', referensiInvoiceNomor: '', isPelunasan: false, originalTotal: 0, uangCapek: 0, itemCount: 0 }
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
    const docType = (entry.docType === 'invoice-pelunasan' ? 'invoice-pelunasan' : 'invoice') as 'invoice' | 'invoice-pelunasan'
    return {
      type: docType,
      company,
      nomor: parsed.nomor || entry.nomor || '',
      tanggal: parsed.tanggal || entry.tanggal || '',
      referensi: parsed.referensi || '',
      client,
      items,
      ppn: parsed.ppn ?? 11,
      dp: parsed.dp || 0,
      dpAmount: parsed.dpAmount,
      catatan: parsed.catatan || '',
      tanggalJatuhTempo: parsed.tanggalJatuhTempo || '',
      caraPembayaran: parsed.caraPembayaran || '',
      tanggalGiro: parsed.tanggalGiro || '',
      lunas: parsed.lunas === true,
      tanggalPelunasan: parsed.tanggalPelunasan || '',
      referensiInvoiceId: parsed.referensiInvoiceId || '',
      referensiInvoiceNomor: parsed.referensiInvoiceNomor || '',
      originalTotal: parsed.originalTotal,
      uangCapek: parsed.uangCapek || 0,
    }
  } catch {
    const docType = (entry.docType === 'invoice-pelunasan' ? 'invoice-pelunasan' : 'invoice') as 'invoice' | 'invoice-pelunasan'
    return {
      type: docType,
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
      referensiInvoiceId: '',
      referensiInvoiceNomor: '',
      uangCapek: 0,
    }
  }
}

// ============================================================
// InvoiceRiwayatTab — all invoice history
// ============================================================
function InvoiceRiwayatTab({ onRestore, onCreate }: { onRestore: (dpPercent?: number) => void; onCreate: () => void }) {
  const { user } = useAuth()
  const setInvoice = useDokuproStore((s) => s.setInvoice)
  const setInvoiceEditingId = useDokuproStore((s) => s.setInvoiceEditingId)
  const [invoiceHistory, setInvoiceHistory] = useState<HistoryEntry[]>([])
  const [cetakanList, setCetakanList] = useState<{ nomorUrut: string; printName: string; profitAmount: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [previewItem, setPreviewItem] = useState<HistoryEntry | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewScale, setPreviewScale] = useState(1)
  const [previewDims, setPreviewDims] = useState<{ w: number; h: number } | null>(null)
  const previewWrapperRef = useRef<HTMLDivElement>(null)
  const [sendingPdf, setSendingPdf] = useState(false)
  const [backupLoading, setBackupLoading] = useState<string | null>(null)

  // Pelunasan dialog state
  const [pelunasanDialogOpen, setPelunasanDialogOpen] = useState(false)
  const [pelunasanDialogItem, setPelunasanDialogItem] = useState<HistoryEntry | null>(null)
  const [pelunasanUpdating, setPelunasanUpdating] = useState(false)
  const [pelunasanToggle, setPelunasanToggle] = useState(false)
  const [pelunasanDate, setPelunasanDate] = useState('')
  const [jatuhTempoDate, setJatuhTempoDate] = useState('')
  const [pelunasanHistory, setPelunasanHistory] = useState<HistoryEntry[]>([])

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true)
      const headers = getAuthHeaders()
      // Fetch both invoice and invoice-pelunasan.
      // cache: 'no-store' is MANDATORY here — without it the browser may serve
      // a stale cached GET response right after a PUT (e.g. status pelunasan),
      // so the list would look outdated until a manual page refresh.
      const [invRes, pelRes] = await Promise.all([
        fetch('/api/history?docType=invoice', { headers, cache: 'no-store' }),
        fetch('/api/history?docType=invoice-pelunasan', { headers, cache: 'no-store' }),
      ])
      const invData = invRes.ok ? (await invRes.json()).data || [] : []
      const pelData = pelRes.ok ? (await pelRes.json()).data || [] : []
      setInvoiceHistory(invData)
      setPelunasanHistory(pelData)
    } catch (err) {
      console.error('Failed to fetch invoice history:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch riwayat cetakan for profit calculation
  const fetchCetakan = useCallback(async () => {
    try {
      const res = await fetch('/api/riwayat-cetakan', { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        const mapped = (Array.isArray(data) ? data : []).map((r: { nomorUrut: string; printName: string; profitAmount: number }) => ({
          nomorUrut: r.nomorUrut || '',
          printName: r.printName || '',
          profitAmount: r.profitAmount || 0,
        }))
        setCetakanList(mapped)
      }
    } catch {
      // ignore
    }
  }, [])

  // Combined history for search/filter
  const allHistory = useMemo(() => [...invoiceHistory, ...pelunasanHistory], [invoiceHistory, pelunasanHistory])

  useEffect(() => {
    fetchHistory()
    fetchCetakan()
  }, [fetchHistory, fetchCetakan])

  useEffect(() => {
    const handler = () => { fetchHistory(); fetchCetakan(); }
    window.addEventListener('dokupro:history-updated', handler)
    return () => window.removeEventListener('dokupro:history-updated', handler)
  }, [fetchHistory, fetchCetakan])

  const invData = useMemo(() => {
    if (!previewItem) return null
    return parseInvoiceData(previewItem)
  }, [previewItem])

  useLayoutEffect(() => {
    if (!previewOpen) {
      setPreviewDims(null)
      setPreviewScale(1)
      return
    }
    const measureAndScale = () => {
      const el = previewWrapperRef.current
      if (!el) return
      // offsetWidth/offsetHeight are NOT affected by CSS transform,
      // so they give us the natural (unscaled) layout size.
      const naturalW = el.offsetWidth
      const naturalH = el.offsetHeight
      if (naturalW === 0 || naturalH === 0) {
        // Element not laid out yet — retry on next frame
        requestAnimationFrame(measureAndScale)
        return
      }
      const vw = window.innerWidth
      const vh = window.innerHeight
      // Reserved space: top close-button row (~56px) + bottom action bar (~88px) + padding (32px)
      const reservedH = 56 + 88 + 32
      const reservedW = 32
      const availW = Math.max(120, vw - reservedW)
      const availH = Math.max(120, vh - reservedH)
      // Fit entirely within available space; cap at 1.4x for very large screens
      const scale = Math.min(availW / naturalW, availH / naturalH, 1.4)
      setPreviewScale(scale)
      setPreviewDims({ w: naturalW * scale, h: naturalH * scale })
    }
    const t = setTimeout(measureAndScale, 50)
    window.addEventListener('resize', measureAndScale)
    return () => { clearTimeout(t); window.removeEventListener('resize', measureAndScale) }
  }, [previewOpen, invData])

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
      // Always derive dpAmount from originalTotal
      if (parsed.dp > 0) {
        const originalTotal = parsed.originalTotal !== undefined ? parsed.originalTotal : (() => {
          const sub = (parsed.items || []).reduce((s: number, it: { qty: number; harga: number }) => s + it.qty * it.harga, 0)
          return sub + (sub * (parsed.ppn || 0) / 100)
        })()
        parsed.dpAmount = originalTotal * (parsed.dp / 100)
        parsed.originalTotal = originalTotal
      }
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
        const blob = await captureElementAsJpg(previewEl)
        const fileName = `${(invData.nomor || 'draft').replace(/\//g, '-')}.jpg`
        const phone = invData.client?.kontak || ''

        // No-API sharing: Web Share API first (auto-attaches file),
        // then fallback to download + WhatsApp Web.
        const result = await shareJpgToWhatsApp({
          blob,
          fileName,
          documentLabel: `Invoice ${invData.nomor}`,
          phone,
        })

        if (result.status === 'shared') {
          toast.success('Gambar dibagikan ke WhatsApp')
        } else if (result.status === 'cancelled') {
          // silent
        } else if (result.status === 'downloaded') {
          toast.success(`${fileName} tersimpan ke perangkat`, {
            description: 'File JPG telah diunduh ke folder Downloads.',
          })
        } else {
          toast.error(result.error || 'Gagal memproses JPG')
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
    if (!searchQuery.trim()) return allHistory
    const q = searchQuery.toLowerCase().trim()
    return allHistory.filter(entry => {
      const info = parseDocInfo(entry)
      return entry.nomor?.toLowerCase().includes(q) || entry.pihakKedua?.toLowerCase().includes(q) || info.namaBarang?.toLowerCase().includes(q) || entry.tanggal?.toLowerCase().includes(q)
    })
  }, [allHistory, searchQuery])

  // Separate into DP invoices and Pelunasan invoices
  const dpInvoices = useMemo(() => filteredHistory.filter(e => e.docType === 'invoice'), [filteredHistory])
  const pelunasanInvoices = useMemo(() => filteredHistory.filter(e => e.docType === 'invoice-pelunasan'), [filteredHistory])

  // Calculate profit per invoice — use saved value from dataJson, fallback to cetakan lookup
  const invoiceUangCapek = useMemo(() => {
    const result = new Map<string, number>()
    // Build cetakan lookup by both nomorUrut and printName (fallback for older data)
    const cetakanByRef = new Map<string, number>()
    for (const c of cetakanList) {
      if (c.nomorUrut) {
        cetakanByRef.set(c.nomorUrut, (cetakanByRef.get(c.nomorUrut) || 0) + c.profitAmount)
      }
      if (c.printName && !cetakanByRef.has(c.printName)) {
        cetakanByRef.set(c.printName, (cetakanByRef.get(c.printName) || 0) + c.profitAmount)
      }
    }
    for (const inv of dpInvoices) {
      const info = parseDocInfo(inv)
      // Prefer saved uangCapek from dataJson, fallback to cetakan lookup
      const uangCapek = info.uangCapek > 0 ? info.uangCapek : (info.referensi ? (cetakanByRef.get(info.referensi) || 0) : 0)
      result.set(inv.id, uangCapek)
    }
    return result
  }, [dpInvoices, cetakanList])

  return (
    <>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-slate-200 dark:border-zinc-700 overflow-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <div className="flex items-center gap-2 min-w-0">
            <History className="w-4 h-4 text-violet-600 shrink-0" />
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide truncate">Riwayat Invoice</h2>
            <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">{allHistory.length} data</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              onClick={onCreate}
              size="sm"
              className="h-7 gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white"
              title="Buat invoice baru"
            >
              <Plus className="w-3.5 h-3.5" /> Buat Invoice
            </Button>
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
          <div className="px-4 py-2 border-b border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
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
            {/* === INVOICE DP Section === */}
            {dpInvoices.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-700">
                  <p className="text-xs font-bold text-violet-700 uppercase tracking-wide flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    Invoice DP <span className="text-[10px] font-medium text-violet-500 bg-violet-100 px-1.5 py-0.5 rounded-full">{dpInvoices.length}</span>
                  </p>
                </div>
                {/* Mobile */}
                <div className="sm:hidden divide-y divide-slate-100">
                  {dpInvoices.slice(0, 100).map((entry) => {
                    const info = parseDocInfo(entry)
                    const uc = invoiceUangCapek.get(entry.id) ?? 0
                    return (
                      <div key={entry.id} className="px-4 py-3 transition-colors cursor-pointer hover:bg-violet-50/30 active:bg-violet-100/40" onClick={() => { setPreviewItem(entry); setPreviewOpen(true) }}>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="min-w-0 flex items-center gap-2">
                            <p className="text-violet-700 font-semibold text-[13px] truncate">{entry.nomor || '-'}</p>
                          </div>
                          <p className="text-emerald-700 font-bold text-sm whitespace-nowrap">{info.totalHarga > 0 ? formatRupiah(info.totalHarga) : '-'}</p>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-slate-500 text-xs">{entry.tanggal ? formatTanggal(entry.tanggal) : '-'}</p>
                            <p className="text-slate-700 font-medium text-xs truncate">{entry.pihakKedua || '-'}</p>
                            {info.namaBarang && <p className="text-slate-400 text-[11px] truncate">{info.namaBarang.split('\n')[0]}{info.itemCount > 1 && <span className="text-violet-600"> +{info.itemCount - 1} item lainnya</span>}</p>}
                            {info.itemCount > 1 && <p className="text-violet-500 font-medium text-[11px] flex items-center gap-1"><Combine className="w-3 h-3" />{info.itemCount} item (gabungan)</p>}
                            {info.dp > 0 && <p className="text-violet-600 font-medium text-[11px]">DP ({info.dpPercent}%): {formatRupiah(info.dp)}</p>}
                            {uc > 0 && <p className="text-amber-700 font-medium text-[11px]">Profit: {formatRupiah(uc)}</p>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => { const parsed = parseInvoiceData(entry); setInvoice(parsed); setInvoiceEditingId(entry.id); onRestore(parsed.dp || 0); toast.success('Invoice berhasil dimuat ke editor') }} className="inline-flex items-center justify-center w-7 h-7 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md border border-emerald-200 transition-colors" title="Restore"><RotateCcw className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setDeleteConfirmId(entry.id)} className="inline-flex items-center justify-center w-7 h-7 bg-red-50 hover:bg-red-100 text-red-600 rounded-md border border-red-200 transition-colors" title="Hapus"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* Desktop */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-[13px] min-w-[1000px]">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                        <th className="text-left py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">No. Invoice</th>
                        <th className="text-left py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">Tgl</th>
                        <th className="text-left py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">Customer</th>
                        <th className="text-left py-3 px-3 text-slate-500 font-semibold whitespace-nowrap" style={{minWidth: '160px'}}>Nama Barang</th>
                        <th className="text-right py-3 px-3 text-slate-500 font-semibold whitespace-nowrap hidden md:table-cell">Qty</th>
                        <th className="text-right py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">Total</th>
                        <th className="text-right py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">DP</th>
                        <th className="text-right py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">Total DP</th>
                        <th className="text-right py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">Profit</th>
                        <th className="text-center py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dpInvoices.slice(0, 100).map((entry, idx) => {
                        const info = parseDocInfo(entry)
                        const uc = invoiceUangCapek.get(entry.id) ?? 0
                        return (
                          <tr key={entry.id} className={`border-b border-slate-50 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/50' : ''} hover:bg-violet-50/30`}>
                            <td className="py-3 px-3 text-violet-700 font-semibold whitespace-nowrap">{entry.nomor || '-'}</td>
                            <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{entry.tanggal ? formatTanggal(entry.tanggal) : '-'}</td>
                            <td className="py-3 px-3 text-slate-700 font-medium max-w-[120px] truncate">{entry.pihakKedua || '-'}</td>
                            <td className="py-3 px-3 text-slate-600 max-w-[180px] truncate" title={info.namaBarang}>
                              <div className="flex items-center gap-1.5">
                                <span className="truncate">{info.namaBarang ? info.namaBarang.split('\n')[0] : '-'}</span>
                                {info.itemCount > 1 && <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-violet-700 bg-violet-100 dark:bg-violet-900/40 dark:text-violet-300 px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0"><Combine className="w-2.5 h-2.5" />{info.itemCount} item</span>}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-slate-600 text-right whitespace-nowrap hidden md:table-cell">{info.totalQty > 0 ? `${info.totalQty.toLocaleString('id-ID')}${info.itemCount > 1 ? ` (${info.itemCount} item)` : ''}` : '-'}</td>
                            <td className="py-3 px-3 text-emerald-700 font-bold text-right whitespace-nowrap">{info.totalHarga > 0 ? formatRupiah(info.totalHarga) : '-'}</td>
                            <td className="py-3 px-3 text-violet-600 font-medium text-right whitespace-nowrap">{info.dpPercent > 0 ? `${info.dpPercent}%` : '-'}</td>
                            <td className="py-3 px-3 text-violet-700 font-semibold text-right whitespace-nowrap">{info.dp > 0 ? formatRupiah(info.dp) : '-'}</td>
                            <td className={`py-3 px-3 text-right font-semibold whitespace-nowrap ${uc > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{uc > 0 ? formatRupiah(uc) : '-'}</td>
                            <td className="py-3 px-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => { setPreviewItem(entry); setPreviewOpen(true) }} className="inline-flex items-center justify-center w-7 h-7 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md border border-blue-200 transition-colors" title="Preview"><Eye className="w-3.5 h-3.5" /></button>
                                <button onClick={() => { const parsed = parseInvoiceData(entry); setInvoice(parsed); setInvoiceEditingId(entry.id); onRestore(parsed.dp || 0); toast.success('Invoice berhasil dimuat ke editor') }} className="inline-flex items-center justify-center w-7 h-7 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md border border-emerald-200 transition-colors" title="Restore"><RotateCcw className="w-3.5 h-3.5" /></button>
                                <button onClick={() => setDeleteConfirmId(entry.id)} className="inline-flex items-center justify-center w-7 h-7 bg-red-50 hover:bg-red-100 text-red-600 rounded-md border border-red-200 transition-colors" title="Hapus"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* === INVOICE PELUNASAN Section === */}
            {pelunasanInvoices.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-700 border-t border-t-slate-200 dark:border-t-zinc-700">
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-wide flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5" />
                    Invoice Pelunasan <span className="text-[10px] font-medium text-amber-500 bg-amber-100 px-1.5 py-0.5 rounded-full">{pelunasanInvoices.length}</span>
                  </p>
                </div>
                {/* Mobile */}
                <div className="sm:hidden divide-y divide-slate-100">
                  {pelunasanInvoices.slice(0, 100).map((entry) => {
                    const info = parseDocInfo(entry)
                    const isLunas = info.lunas
                    return (
                      <div key={entry.id} className="px-4 py-3 hover:bg-amber-50/30 active:bg-amber-100/40 transition-colors cursor-pointer" onClick={() => { setPreviewItem(entry); setPreviewOpen(true) }}>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="min-w-0 flex items-center gap-2">
                            <p className="text-amber-700 font-semibold text-[13px] truncate">{entry.nomor || '-'}</p>
                            <button onClick={(e) => openPelunasanDialog(entry, e)} className={cn('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold shrink-0 transition-all hover:shadow-sm cursor-pointer', isLunas ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200')}>
                              {isLunas ? <><CheckCircle2 className="w-2.5 h-2.5" /> Lunas</> : <><CircleDot className="w-2.5 h-2.5" /> Belum</>}
                            </button>
                          </div>
                          <div className="text-right">
                            <p className="text-emerald-700 font-semibold text-xs whitespace-nowrap">{formatRupiah(info.totalHarga)}</p>
                            <p className="text-red-600 font-bold text-sm whitespace-nowrap">{formatRupiah(info.sisa)}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-slate-500 text-xs">{entry.tanggal ? formatTanggal(entry.tanggal) : '-'}</p>
                            <p className="text-slate-700 font-medium text-xs truncate">{entry.pihakKedua || '-'}</p>
                            {info.referensiInvoiceNomor && <p className="text-slate-400 text-[11px]">Ref: {info.referensiInvoiceNomor}</p>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            {!isLunas && (<button onClick={(e) => openPelunasanDialog(entry, e)} className="inline-flex items-center justify-center w-7 h-7 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-md border border-amber-200 transition-colors" title="Pelunasan"><Wallet className="w-3.5 h-3.5" /></button>)}
                            <button onClick={() => { const parsed = parseInvoiceData(entry); setInvoice(parsed); setInvoiceEditingId(entry.id); onRestore(parsed.dp || 0); toast.success('Invoice pelunasan berhasil dimuat ke editor') }} className="inline-flex items-center justify-center w-7 h-7 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md border border-emerald-200 transition-colors" title="Restore"><RotateCcw className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setDeleteConfirmId(entry.id)} className="inline-flex items-center justify-center w-7 h-7 bg-red-50 hover:bg-red-100 text-red-600 rounded-md border border-red-200 transition-colors" title="Hapus"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* Desktop */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-[13px] min-w-[900px]">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                        <th className="text-left py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">No. Invoice</th>
                        <th className="text-left py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">Ref. Invoice DP</th>
                        <th className="text-left py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">Tgl</th>
                        <th className="text-left py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">Customer</th>
                        <th className="text-right py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">Grand Total</th>
                        <th className="text-right py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">Sisa Pembayaran</th>
                        <th className="text-center py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">Status</th>
                        <th className="text-center py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pelunasanInvoices.slice(0, 100).map((entry, idx) => {
                        const info = parseDocInfo(entry)
                        const isLunas = info.lunas
                        return (
                          <tr key={entry.id} className={`border-b border-slate-50 hover:bg-amber-50/30 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
                            <td className="py-3 px-3 text-amber-700 font-semibold whitespace-nowrap">{entry.nomor || '-'}</td>
                            <td className="py-3 px-3 text-violet-600 font-medium whitespace-nowrap">{info.referensiInvoiceNomor || '-'}</td>
                            <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{entry.tanggal ? formatTanggal(entry.tanggal) : '-'}</td>
                            <td className="py-3 px-3 text-slate-700 font-medium max-w-[120px] truncate">{entry.pihakKedua || '-'}</td>
                            <td className="py-3 px-3 text-emerald-700 font-semibold text-right whitespace-nowrap">{formatRupiah(info.totalHarga)}</td>
                            <td className="py-3 px-3 text-red-600 font-bold text-right whitespace-nowrap">{formatRupiah(info.sisa)}</td>
                            <td className="py-3 px-3 text-center">
                              <button onClick={(e) => openPelunasanDialog(entry, e)} className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all hover:shadow-sm cursor-pointer', isLunas ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200')}>
                                {isLunas ? <><CheckCircle2 className="w-3 h-3" /> Lunas</> : <><CircleDot className="w-3 h-3" /> Belum</>}
                              </button>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => { setPreviewItem(entry); setPreviewOpen(true) }} className="inline-flex items-center justify-center w-7 h-7 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md border border-blue-200 transition-colors" title="Preview"><Eye className="w-3.5 h-3.5" /></button>
                                {!isLunas && (<button onClick={(e) => openPelunasanDialog(entry, e)} className="inline-flex items-center justify-center w-7 h-7 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-md border border-amber-200 transition-colors" title="Pelunasan"><Wallet className="w-3.5 h-3.5" /></button>)}
                                <button onClick={() => { const parsed = parseInvoiceData(entry); setInvoice(parsed); setInvoiceEditingId(entry.id); onRestore(parsed.dp || 0); toast.success('Invoice pelunasan berhasil dimuat ke editor') }} className="inline-flex items-center justify-center w-7 h-7 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md border border-emerald-200 transition-colors" title="Restore"><RotateCcw className="w-3.5 h-3.5" /></button>
                                <button onClick={() => setDeleteConfirmId(entry.id)} className="inline-flex items-center justify-center w-7 h-7 bg-red-50 hover:bg-red-100 text-red-600 rounded-md border border-red-200 transition-colors" title="Hapus"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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
            const hasDP = info.dpPercent > 0 || info.dp > 0
            const isLunas = info.isPelunasan ? info.lunas : (hasDP ? info.lunas : (info.lunas || info.sisa <= 0))
            return (
              <div className="space-y-5 pt-1">
                <div className="rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 p-4 space-y-2">
                  <div className="flex justify-between text-xs"><span className="text-slate-500">No. Invoice</span><span className="font-semibold text-amber-800">{pelunasanDialogItem.nomor}</span></div>
                  {info.referensiInvoiceNomor && <div className="flex justify-between text-xs"><span className="text-slate-500">Ref. Invoice DP</span><span className="font-medium text-violet-600">{info.referensiInvoiceNomor}</span></div>}
                  <div className="flex justify-between text-xs"><span className="text-slate-500">Customer</span><span className="font-medium text-slate-700">{pelunasanDialogItem.pihakKedua || '-'}</span></div>
                  <div className="border-t border-slate-200 pt-2 mt-1">
                    <div className="flex justify-between text-xs"><span className="text-slate-500">Total</span><span className="font-bold text-emerald-700">{formatRupiahShort(info.totalHarga)}</span></div>
                    {hasDP && (<>
                      <div className="flex justify-between text-xs mt-1"><span className="text-slate-500">DP ({info.dpPercent}%)</span><span className="font-medium text-violet-700">- {formatRupiahShort(info.dp)}</span></div>
                      <div className="flex justify-between text-sm mt-1.5 pt-1.5 border-t border-dashed border-slate-200"><span className="font-semibold text-slate-700">Sisa Pembayaran</span><span className={cn('font-bold', info.lunas ? 'text-green-600' : 'text-red-600')}>{formatRupiahShort(info.sisa)}</span></div>
                    </>)}
                  </div>
                  {isLunas && info.tanggalPelunasan && (
                    <div className="rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 p-2.5 flex items-center gap-2 mt-1"><CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" /><div><p className="text-xs font-semibold text-green-800">Sudah Lunas</p><p className="text-[10px] text-green-600">Dibayar pada {new Date(info.tanggalPelunasan).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</p></div></div>
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
                      <div className="rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 p-3 flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" /><div><p className="text-sm font-semibold text-green-800">Sudah Lunas</p><p className="text-xs text-green-600">Sisa {formatRupiahShort(info.sisa)} telah dibayar{pelunasanDate ? ` pada ${new Date(pelunasanDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}` : ''}</p></div></div>
                    </>)}
                  </div>
                )}
                {!hasDP && (<div className="rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 p-3 flex items-center gap-2"><FileText className="w-4 h-4 text-blue-600 flex-shrink-0" /><div><p className="text-xs font-semibold text-blue-800">Invoice Tanpa DP</p><p className="text-[10px] text-blue-600">Invoice ini tidak memiliki down payment. Atur tanggal jatuh tempo jika diperlukan.</p></div></div>)}
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
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col">
          <div className="flex justify-end p-3 shrink-0">
            <button onClick={() => setPreviewOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/90 shadow-md hover:bg-white transition-colors"><X className="w-4 h-4 text-slate-700" /></button>
          </div>
          <div className="flex-1 flex items-start justify-center overflow-auto p-4 pb-28 min-h-0">
            {/* Wrapper with the SCALED dimensions so flex layout reserves the
                correct visual space and content stays reachable when scrolling. */}
            <div
              style={{ width: previewDims?.w, height: previewDims?.h }}
              className="flex-shrink-0"
            >
              <div
                ref={previewWrapperRef}
                style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left' }}
              >
                <div data-invoice-preview>
                  <InvoicePreview data={invData} showPelunasanLabel={invData.type === 'invoice-pelunasan'} />
                </div>
              </div>
            </div>
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
// InvoicePage — daftar Riwayat + layar Buat Baru.
// Tab "Pelunasan", "Editor Pelunasan" dan fitur "Gabungkan" dihapus.
// ============================================================
export default function InvoicePage() {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState<'buat-baru' | 'riwayat'>('riwayat')
  const [createMode, setCreateMode] = useState<'regular' | 'dp' | 'pelunasan'>('regular')
  const [invoiceCount, setInvoiceCount] = useState(0)

  // Fetch counts for badges
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const headers = getAuthHeaders()
        const [invRes, pelRes] = await Promise.all([
          fetch('/api/history?docType=invoice', { headers }),
          fetch('/api/history?docType=invoice-pelunasan', { headers }),
        ])
        const invData: HistoryEntry[] = invRes.ok ? (await invRes.json()).data || [] : []
        const pelData: HistoryEntry[] = pelRes.ok ? (await pelRes.json()).data || [] : []
        setInvoiceCount(invData.length + pelData.length)
      } catch {}
    }
    fetchCounts()

    const handler = () => fetchCounts()
    window.addEventListener('dokupro:history-updated', handler)
    return () => window.removeEventListener('dokupro:history-updated', handler)
  }, [])

  const tabs: { key: 'riwayat'; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'riwayat', label: 'Riwayat', icon: <History className="w-3.5 h-3.5" />, badge: invoiceCount || undefined },
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
              <span className={cn('ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full', activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500')}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Buat Invoice Baru — halaman buat invoice (dari tombol "Buat Invoice" di tab Riwayat) */}
      {activeTab === 'buat-baru' && (
        <div className="print:hidden">
          {/* Header: kembali + judul halaman */}
          <div className="flex items-center gap-2 mb-3">
            <Button
              onClick={() => setActiveTab('riwayat')}
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Kembali
            </Button>
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide truncate">Buat Invoice Baru</h2>
          </div>
          {/* Sub-tab jenis invoice: Regular / DP / Pelunasan */}
          <div className="flex items-center gap-2 mb-3 print:hidden overflow-x-auto">
            {([
              { key: 'regular' as const, label: 'Regular', icon: <FileText className="w-3.5 h-3.5" /> },
              { key: 'dp' as const, label: 'DP', icon: <Banknote className="w-3.5 h-3.5" /> },
              { key: 'pelunasan' as const, label: 'Pelunasan', icon: <Wallet className="w-3.5 h-3.5" /> },
            ]).map(m => (
              <button
                key={m.key}
                onClick={() => setCreateMode(m.key)}
                className={cn(
                  'px-4 py-1.5 text-sm font-semibold rounded-lg border transition-colors whitespace-nowrap flex-shrink-0',
                  createMode === m.key
                    ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                    : 'bg-card text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                )}
              >
                <span className="inline-flex items-center gap-1.5">{m.icon}{m.label}</span>
              </button>
            ))}
          </div>
          <Suspense fallback={null}>
            {createMode === 'pelunasan' ? (
              <InvoicePelunasanEditor />
            ) : (
              <InvoiceEditor dpDisabled={createMode === 'regular'} />
            )}
          </Suspense>
        </div>
      )}

      {/* Riwayat Tab */}
      {activeTab === 'riwayat' && (
        <div className="print:hidden">
          <InvoiceRiwayatTab
            onRestore={(dpPercent) => { setCreateMode(dpPercent && dpPercent > 0 ? 'dp' : 'regular'); setActiveTab('buat-baru') }}
            onCreate={() => setActiveTab('buat-baru')}
          />
        </div>
      )}

    </DashboardLayout>
  )
}
