'use client'

import { Suspense, useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { InvoiceEditor } from '@/components/dokupro/invoice-editor'
import { InvoicePelunasanEditor } from '@/components/dokupro/invoice-pelunasan-editor'
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
  DatabaseBackup,
  Upload,
  CheckCircle2,
  Wallet,
  Banknote,
  Combine,
  Plus,
  ArrowLeft,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

// --- Badge status pelunasan (gaya ActiveBadge Master Customer) ---
function StatusBadge({ lunas }: { lunas: boolean }) {
  return lunas
    ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px] shrink-0">Lunas</Badge>
    : <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[11px] shrink-0">Belum Lunas</Badge>
}

// --- Empty state (gaya Master Customer) ---
function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="text-center py-12 px-4 rounded-xl border border-stone-200 bg-white">
      <History className="h-10 w-10 text-stone-300 mx-auto mb-2" />
      <p className="text-sm font-medium">{filtered ? 'Tidak ditemukan' : 'Belum ada invoice'}</p>
      <p className="text-xs text-muted-foreground mt-1">
        {filtered ? 'Coba kata kunci lain.' : 'Buat invoice pertama Anda dengan tombol "+ Buat Invoice".'}
      </p>
    </div>
  )
}

// ============================================================
// InvoiceRiwayatView — daftar invoice (UI seperti Master Customer)
// ============================================================
function InvoiceRiwayatView({ onRestore, onCreate }: { onRestore: (dpPercent?: number) => void; onCreate: () => void }) {
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

  // Muat invoice ke editor (Restore)
  const restoreToEditor = (entry: HistoryEntry, isPelunasan: boolean) => {
    const parsed = parseInvoiceData(entry)
    setInvoice(parsed)
    setInvoiceEditingId(entry.id)
    onRestore(parsed.dp || 0)
    toast.success(isPelunasan ? 'Invoice pelunasan berhasil dimuat ke editor' : 'Invoice berhasil dimuat ke editor')
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

  const hasResults = filteredHistory.length > 0
  const countLabel = loading ? 'Memuat data…' : `${allHistory.length} invoice`

  return (
    <>
      <div className="space-y-5">
        {/* Header — gaya Master Customer */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">Riwayat Invoice</h1>
            <p className="text-sm text-muted-foreground mt-1">{countLabel}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari no. invoice / customer / barang…"
                aria-label="Cari invoice"
                className="pl-9 min-h-[44px]"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={onCreate}
                title="Buat invoice baru"
                className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px] flex-1 sm:flex-none"
              >
                <Plus className="h-4 w-4" /> Buat Invoice
              </Button>
              <Button onClick={handleBackup} variant="outline" disabled={backupLoading === 'backup'} title="Backup riwayat invoice" className="min-h-[44px] flex-1 sm:flex-none">
                {backupLoading === 'backup' ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />} Backup
              </Button>
              <Button onClick={handleRestore} variant="outline" disabled={backupLoading === 'restore'} title="Restore riwayat invoice" className="min-h-[44px] flex-1 sm:flex-none">
                {backupLoading === 'restore' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Restore
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <>
            <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden p-4 space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
            <div className="md:hidden space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
            </div>
          </>
        ) : !hasResults ? (
          <EmptyState filtered={searchQuery.trim() !== ''} />
        ) : (
          <>
            {/* === SECTION: INVOICE DP === */}
            {dpInvoices.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-violet-600 shrink-0" />
                  <h2 className="text-sm font-semibold tracking-tight">Invoice DP</h2>
                  <Badge variant="outline" className="text-[11px] text-muted-foreground border-stone-200">{dpInvoices.length}</Badge>
                </div>

                {/* Desktop table */}
                <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
                  <div className="max-h-96 overflow-y-auto scrollbar-thin">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-stone-50">
                        <TableRow className="bg-stone-50 hover:bg-stone-50">
                          <TableHead>No. Invoice</TableHead>
                          <TableHead>Tgl</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Nama Barang</TableHead>
                          <TableHead className="text-right hidden lg:table-cell">Qty</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">DP</TableHead>
                          <TableHead className="text-right">Total DP</TableHead>
                          <TableHead className="text-right">Profit</TableHead>
                          <TableHead className="text-center">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dpInvoices.slice(0, 100).map((entry) => {
                          const info = parseDocInfo(entry)
                          const uc = invoiceUangCapek.get(entry.id) ?? 0
                          return (
                            <TableRow key={entry.id}>
                              <TableCell className="font-medium whitespace-nowrap">{entry.nomor || '-'}</TableCell>
                              <TableCell className="text-muted-foreground whitespace-nowrap">{entry.tanggal ? formatTanggal(entry.tanggal) : '-'}</TableCell>
                              <TableCell className="max-w-32 truncate">{entry.pihakKedua || '-'}</TableCell>
                              <TableCell className="max-w-44 text-muted-foreground" title={info.namaBarang}>
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate">{info.namaBarang ? info.namaBarang.split('\n')[0] : '-'}</span>
                                  {info.itemCount > 1 && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-violet-200 text-violet-700 bg-violet-50">
                                      <Combine className="w-2.5 h-2.5" />{info.itemCount} item
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground hidden lg:table-cell">{info.totalQty > 0 ? `${info.totalQty.toLocaleString('id-ID')}${info.itemCount > 1 ? ` (${info.itemCount} item)` : ''}` : '-'}</TableCell>
                              <TableCell className="text-right tabular-nums font-semibold text-emerald-700">{info.totalHarga > 0 ? formatRupiah(info.totalHarga) : '-'}</TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">{info.dpPercent > 0 ? `${info.dpPercent}%` : '-'}</TableCell>
                              <TableCell className="text-right tabular-nums text-violet-700">{info.dp > 0 ? formatRupiah(info.dp) : '-'}</TableCell>
                              <TableCell className={cn('text-right tabular-nums', uc > 0 ? 'text-amber-700 font-medium' : 'text-muted-foreground')}>{uc > 0 ? formatRupiah(uc) : '-'}</TableCell>
                              <TableCell className="text-center">
                                <div className="flex justify-center gap-1">
                                  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => { setPreviewItem(entry); setPreviewOpen(true) }} aria-label={`Lihat ${entry.nomor}`} title="Lihat"><Eye className="h-4 w-4" /></Button>
                                  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => restoreToEditor(entry, false)} aria-label={`Muat ${entry.nomor}`} title="Muat ke editor"><RotateCcw className="h-4 w-4" /></Button>
                                  <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => setDeleteConfirmId(entry.id)} aria-label={`Hapus ${entry.nomor}`} title="Hapus"><Trash2 className="h-4 w-4" /></Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden space-y-3">
                  {dpInvoices.slice(0, 100).map((entry) => {
                    const info = parseDocInfo(entry)
                    const uc = invoiceUangCapek.get(entry.id) ?? 0
                    return (
                      <Card key={entry.id} className="p-0 gap-0">
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium truncate">{entry.nomor || '-'}</p>
                              <p className="text-xs text-muted-foreground">{entry.tanggal ? formatTanggal(entry.tanggal) : '-'}</p>
                            </div>
                            <p className="text-sm font-bold text-emerald-700 whitespace-nowrap">{info.totalHarga > 0 ? formatRupiah(info.totalHarga) : '-'}</p>
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <p className="truncate">{entry.pihakKedua || '-'}</p>
                            {info.namaBarang && <p className="text-xs line-clamp-1">{info.namaBarang.split('\n')[0]}{info.itemCount > 1 ? ` +${info.itemCount - 1} item lainnya` : ''}</p>}
                            {info.itemCount > 1 && <p className="text-xs text-violet-600 flex items-center gap-1"><Combine className="h-3 w-3" />{info.itemCount} item (gabungan)</p>}
                            {info.dp > 0 && <p className="text-xs text-violet-700">DP ({info.dpPercent}%): {formatRupiah(info.dp)}</p>}
                            {uc > 0 && <p className="text-xs text-amber-700">Profit: {formatRupiah(uc)}</p>}
                          </div>
                          <div className="flex gap-2 pt-1">
                            <Button variant="outline" size="sm" className="flex-1 min-h-[44px]" onClick={() => { setPreviewItem(entry); setPreviewOpen(true) }}>
                              <Eye className="h-4 w-4" /> Lihat
                            </Button>
                            <Button variant="outline" size="sm" className="flex-1 min-h-[44px]" onClick={() => restoreToEditor(entry, false)}>
                              <RotateCcw className="h-4 w-4" /> Muat
                            </Button>
                            <Button variant="outline" size="sm" className="flex-1 min-h-[44px] text-destructive border-stone-200 hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteConfirmId(entry.id)}>
                              <Trash2 className="h-4 w-4" /> Hapus
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </section>
            )}

            {/* === SECTION: INVOICE PELUNASAN === */}
            {pelunasanInvoices.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-amber-600 shrink-0" />
                  <h2 className="text-sm font-semibold tracking-tight">Invoice Pelunasan</h2>
                  <Badge variant="outline" className="text-[11px] text-muted-foreground border-stone-200">{pelunasanInvoices.length}</Badge>
                </div>

                {/* Desktop table */}
                <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
                  <div className="max-h-96 overflow-y-auto scrollbar-thin">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-stone-50">
                        <TableRow className="bg-stone-50 hover:bg-stone-50">
                          <TableHead>No. Invoice</TableHead>
                          <TableHead>Ref. Invoice DP</TableHead>
                          <TableHead>Tgl</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead className="text-right">Grand Total</TableHead>
                          <TableHead className="text-right">Sisa Pembayaran</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                          <TableHead className="text-center">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pelunasanInvoices.slice(0, 100).map((entry) => {
                          const info = parseDocInfo(entry)
                          const isLunas = info.lunas
                          return (
                            <TableRow key={entry.id}>
                              <TableCell className="font-medium whitespace-nowrap">{entry.nomor || '-'}</TableCell>
                              <TableCell className="text-violet-700 whitespace-nowrap">{info.referensiInvoiceNomor || '-'}</TableCell>
                              <TableCell className="text-muted-foreground whitespace-nowrap">{entry.tanggal ? formatTanggal(entry.tanggal) : '-'}</TableCell>
                              <TableCell className="max-w-32 truncate">{entry.pihakKedua || '-'}</TableCell>
                              <TableCell className="text-right tabular-nums font-semibold text-emerald-700">{formatRupiah(info.totalHarga)}</TableCell>
                              <TableCell className="text-right tabular-nums font-bold text-red-600">{formatRupiah(info.sisa)}</TableCell>
                              <TableCell className="text-center">
                                <button onClick={(e) => openPelunasanDialog(entry, e)} className="cursor-pointer" title="Atur pelunasan" aria-label={`Atur pelunasan ${entry.nomor}`}>
                                  <StatusBadge lunas={isLunas} />
                                </button>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex justify-center gap-1">
                                  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => { setPreviewItem(entry); setPreviewOpen(true) }} aria-label={`Lihat ${entry.nomor}`} title="Lihat"><Eye className="h-4 w-4" /></Button>
                                  {!isLunas && (
                                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={(e) => openPelunasanDialog(entry, e)} aria-label={`Pelunasan ${entry.nomor}`} title="Pelunasan"><Wallet className="h-4 w-4" /></Button>
                                  )}
                                  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => restoreToEditor(entry, true)} aria-label={`Muat ${entry.nomor}`} title="Muat ke editor"><RotateCcw className="h-4 w-4" /></Button>
                                  <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => setDeleteConfirmId(entry.id)} aria-label={`Hapus ${entry.nomor}`} title="Hapus"><Trash2 className="h-4 w-4" /></Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden space-y-3">
                  {pelunasanInvoices.slice(0, 100).map((entry) => {
                    const info = parseDocInfo(entry)
                    const isLunas = info.lunas
                    return (
                      <Card key={entry.id} className="p-0 gap-0">
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium truncate">{entry.nomor || '-'}</p>
                              <p className="text-xs text-muted-foreground">{entry.tanggal ? formatTanggal(entry.tanggal) : '-'}</p>
                            </div>
                            <button onClick={(e) => openPelunasanDialog(entry, e)} className="cursor-pointer shrink-0" title="Atur pelunasan" aria-label={`Atur pelunasan ${entry.nomor}`}>
                              <StatusBadge lunas={isLunas} />
                            </button>
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <p className="truncate">{entry.pihakKedua || '-'}</p>
                            {info.referensiInvoiceNomor && <p className="text-xs">Ref: <span className="text-violet-700">{info.referensiInvoiceNomor}</span></p>}
                          </div>
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-muted-foreground">Sisa Pembayaran</span>
                            <span className="font-bold text-red-600">{formatRupiah(info.sisa)}</span>
                          </div>
                          <div className="flex gap-2 pt-1">
                            <Button variant="outline" size="sm" className="flex-1 min-h-[44px]" onClick={() => { setPreviewItem(entry); setPreviewOpen(true) }}>
                              <Eye className="h-4 w-4" /> Lihat
                            </Button>
                            <Button variant="outline" size="sm" className="flex-1 min-h-[44px]" onClick={() => restoreToEditor(entry, true)}>
                              <RotateCcw className="h-4 w-4" /> Muat
                            </Button>
                            <Button variant="outline" size="sm" className="flex-1 min-h-[44px] text-destructive border-stone-200 hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteConfirmId(entry.id)}>
                              <Trash2 className="h-4 w-4" /> Hapus
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* AlertDialog hapus (gaya Master Customer) */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(o) => { if (!o) setDeleteConfirmId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus invoice?</AlertDialogTitle>
            <AlertDialogDescription>Data invoice yang dihapus tidak dapat dikembalikan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); if (deleteConfirmId) void handleDelete(deleteConfirmId) }}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                <div className="rounded-xl bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 p-4 space-y-2">
                  <div className="flex justify-between text-xs"><span className="text-slate-500">No. Invoice</span><span className="font-semibold text-amber-800">{pelunasanDialogItem.nomor}</span></div>
                  {info.referensiInvoiceNomor && <div className="flex justify-between text-xs"><span className="text-slate-500">Ref. Invoice DP</span><span className="font-medium text-violet-600">{info.referensiInvoiceNomor}</span></div>}
                  <div className="flex justify-between text-xs"><span className="text-slate-500">Customer</span><span className="font-medium text-slate-700">{pelunasanDialogItem.pihakKedua || '-'}</span></div>
                  <div className="border-t border-stone-200 pt-2 mt-1">
                    <div className="flex justify-between text-xs"><span className="text-slate-500">Total</span><span className="font-bold text-emerald-700">{formatRupiahShort(info.totalHarga)}</span></div>
                    {hasDP && (<>
                      <div className="flex justify-between text-xs mt-1"><span className="text-slate-500">DP ({info.dpPercent}%)</span><span className="font-medium text-violet-700">- {formatRupiahShort(info.dp)}</span></div>
                      <div className="flex justify-between text-sm mt-1.5 pt-1.5 border-t border-dashed border-stone-200"><span className="font-semibold text-slate-700">Sisa Pembayaran</span><span className={cn('font-bold', info.lunas ? 'text-green-600' : 'text-red-600')}>{formatRupiahShort(info.sisa)}</span></div>
                    </>)}
                  </div>
                  {isLunas && info.tanggalPelunasan && (
                    <div className="rounded-lg bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 p-2.5 flex items-center gap-2 mt-1"><CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" /><div><p className="text-xs font-semibold text-green-800">Sudah Lunas</p><p className="text-[10px] text-green-600">Dibayar pada {new Date(info.tanggalPelunasan).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</p></div></div>
                  )}
                </div>
                <div><Label className="text-sm font-medium text-slate-700">Tanggal Jatuh Tempo</Label><Input type="date" value={jatuhTempoDate} onChange={(e) => setJatuhTempoDate(e.target.value)} className="mt-1.5" /></div>
                {hasDP && (
                  <div className="rounded-xl border border-stone-200 p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {pelunasanToggle ? (<div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-green-600" /></div>) : (<div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center"><Wallet className="w-5 h-5 text-slate-400" /></div>)}
                        <div><Label className="text-sm font-semibold text-slate-800">Pelunasan</Label><p className="text-xs text-slate-500">{pelunasanToggle ? `Sisa ${formatRupiahShort(info.sisa)} sudah dibayar` : `Sisa ${formatRupiahShort(info.sisa)} belum dibayar`}</p></div>
                      </div>
                      <Switch checked={pelunasanToggle} onCheckedChange={(checked) => { setPelunasanToggle(checked); if (checked && !pelunasanDate) setPelunasanDate(getTodayStr()) }} />
                    </div>
                    {pelunasanToggle && (<>
                      <div><Label className="text-xs font-medium text-slate-600">Tanggal Pelunasan</Label><Input type="date" value={pelunasanDate} onChange={(e) => setPelunasanDate(e.target.value)} className="mt-1" /></div>
                      <div className="rounded-lg bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 p-3 flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" /><div><p className="text-sm font-semibold text-green-800">Sudah Lunas</p><p className="text-xs text-green-600">Sisa {formatRupiahShort(info.sisa)} telah dibayar{pelunasanDate ? ` pada ${new Date(pelunasanDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}` : ''}</p></div></div>
                    </>)}
                  </div>
                )}
                {!hasDP && (<div className="rounded-lg bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 p-3 flex items-center gap-2"><FileText className="w-4 h-4 text-blue-600 flex-shrink-0" /><div><p className="text-xs font-semibold text-blue-800">Invoice Tanpa DP</p><p className="text-[10px] text-blue-600">Invoice ini tidak memiliki down payment. Atur tanggal jatuh tempo jika diperlukan.</p></div></div>)}
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
// InvoicePage — daftar invoice langsung tampil (tanpa tab Riwayat)
// + layar "Buat Invoice Baru" dari tombol Buat Invoice.
// UI daftar mengikuti gaya halaman Master Customer.
// ============================================================
export default function InvoicePage() {
  const [showCreate, setShowCreate] = useState(false)
  const [createMode, setCreateMode] = useState<'regular' | 'dp' | 'pelunasan'>('regular')

  return (
    <DashboardLayout title="Invoice" subtitle="Buat invoice dengan pratinjau langsung dan cetak A5">
      {showCreate ? (
        <div className="print:hidden">
          {/* Header: kembali + judul halaman */}
          <div className="flex items-center gap-2 mb-3">
            <Button
              onClick={() => setShowCreate(false)}
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Kembali
            </Button>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground truncate">Buat Invoice Baru</h2>
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
      ) : (
        <div className="print:hidden">
          <InvoiceRiwayatView
            onRestore={(dpPercent) => { setCreateMode(dpPercent && dpPercent > 0 ? 'dp' : 'regular'); setShowCreate(true) }}
            onCreate={() => setShowCreate(true)}
          />
        </div>
      )}
    </DashboardLayout>
  )
}
