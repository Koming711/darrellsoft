'use client'

import { Suspense, useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { PurchaseOrderEditor } from '@/components/dokupro/purchase-order-editor'
import { getAuthHeaders } from '@/lib/auth'
import { fetcher } from '@/lib/fetcher'
import { formatRupiah, formatTanggal } from '@/lib/format'
import { notifyDataChange } from '@/lib/data-sync'
import { authFetch } from '@/lib/auth-fetch'
import {
  History,
  Eye,
  RotateCcw,
  Trash2,
  Loader2,
  Search,
  X,
  DatabaseBackup,
  Upload,
  Plus,
  ArrowLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { toast } from 'sonner'
import { PurchaseOrderPreview } from '@/components/dokupro/purchase-order-preview'
import { captureElementAsJpg } from '@/lib/capture-jpg'
import { shareJpgToWhatsApp } from '@/lib/share-jpg'
import { useDokuproStore } from '@/lib/store'
import type { PurchaseOrderData, CompanyInfo } from '@/lib/types'
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
    const totalHarga = subtotal + (subtotal * ppn / 100)
    const referensi = parsed.referensi || ''
    const tanggalJatuhTempo = parsed.tanggalJatuhTempo || ''
    return { namaBarang, hargaSatuan, totalQty, totalHarga, referensi, tanggalJatuhTempo }
  } catch {
    return { namaBarang: '', hargaSatuan: 0, totalQty: 0, totalHarga: 0, referensi: '', tanggalJatuhTempo: '' }
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
      ppn: parsed.company?.ppn ?? parsed.ppn ?? 0,
      logo: parsed.company?.logo || '',
      bankName: parsed.company?.bankName || '',
      bankAccount: parsed.company?.bankAccount || '',
      bankHolder: parsed.company?.bankHolder || '',
      bankName2: parsed.company?.bankName2 || '',
      bankAccount2: parsed.company?.bankAccount2 || '',
      bankHolder2: parsed.company?.bankHolder2 || '',
    }
    const pemasok = parsed.pemasok || { nama: '', jenisBarang: '', kontak: '', alamat: '' }
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
      ppn: parsed.ppn ?? 0,
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
      ppn: 0,
      catatan: '',
      tanggalJatuhTempo: '',
    }
  }
}

// Auto-open editor when the page receives a deep-link param
// (dipakai link dari Hitung Cetakan → ?riwayatId=...)
function AutoOpenEditor({ param, onOpen }: { param: string; onOpen: () => void }) {
  const searchParams = useSearchParams()
  const doneRef = useRef(false)
  useEffect(() => {
    if (doneRef.current) return
    if (searchParams.get(param)) {
      doneRef.current = true
      onOpen()
    }
  }, [searchParams, param, onOpen])
  return null
}

// ============================================================
// PurchaseOrderRiwayatView — daftar purchase order langsung
// tampil (tanpa tab). UI mengikuti gaya halaman Invoice / Master Customer.
// ============================================================
function PurchaseOrderRiwayatView({ onCreate }: { onCreate: () => void }) {
  const setPurchaseOrder = useDokuproStore((s) => s.setPurchaseOrder)
  const [poHistory, setPoHistory] = useState<HistoryEntry[]>([])
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

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true)
      const headers = getAuthHeaders()
      const res = await fetch('/api/history?docType=purchase-order', { headers, cache: 'no-store' })
      if (res.ok) {
        const json = await res.json()
        setPoHistory(json.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch purchase order history:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  // Listen for save events
  useEffect(() => {
    const handler = () => fetchHistory()
    window.addEventListener('dokupro:history-updated', handler)
    return () => window.removeEventListener('dokupro:history-updated', handler)
  }, [fetchHistory])

  const poData = useMemo(() => {
    if (!previewItem) return null
    return parsePurchaseOrderData(previewItem)
  }, [previewItem])

  // Measure actual rendered element and fit it to the available viewport space.
  useLayoutEffect(() => {
    if (!previewOpen) {
      setPreviewDims(null)
      setPreviewScale(1)
      return
    }
    const measureAndScale = () => {
      const el = previewWrapperRef.current
      if (!el) return
      const naturalW = el.offsetWidth
      const naturalH = el.offsetHeight
      if (naturalW === 0 || naturalH === 0) {
        requestAnimationFrame(measureAndScale)
        return
      }
      const vw = window.innerWidth
      const vh = window.innerHeight
      const reservedH = 56 + 88 + 32
      const reservedW = 32
      const availW = Math.max(120, vw - reservedW)
      const availH = Math.max(120, vh - reservedH)
      const scale = Math.min(availW / naturalW, availH / naturalH, 1.4)
      setPreviewScale(scale)
      setPreviewDims({ w: naturalW * scale, h: naturalH * scale })
    }
    const t = setTimeout(measureAndScale, 50)
    window.addEventListener('resize', measureAndScale)
    return () => { clearTimeout(t); window.removeEventListener('resize', measureAndScale) }
  }, [previewOpen, poData])

  const restoreToEditor = (entry: HistoryEntry) => {
    const parsed = parsePurchaseOrderData(entry)
    setPurchaseOrder(parsed)
    onCreate()
    toast.success('Purchase Order berhasil dimuat ke editor')
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetcher(`/api/history/${id}`, { method: 'DELETE', headers: getAuthHeaders() })
      if (res.ok) {
        toast.success('Purchase Order berhasil dihapus')
        notifyDataChange('purchase-order')
        fetchHistory()
      } else {
        toast.error('Gagal menghapus purchase order')
      }
    } catch {
      toast.error('Gagal menghapus purchase order')
    }
    setDeleteConfirmId(null)
  }

  const handleSendJpg = useCallback(async () => {
    if (!poData) return
    setSendingPdf(true)
    try {
      const previewEl = document.querySelector('[data-document-preview]') as HTMLElement
      if (previewEl) {
        const blob = await captureElementAsJpg(previewEl)
        const fileName = `${(poData.nomor || 'draft').replace(/\//g, '-')}.jpg`
        const phone = poData.pemasok?.kontak || ''

        const result = await shareJpgToWhatsApp({
          blob,
          fileName,
          documentLabel: `Purchase Order ${poData.nomor}`,
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
  }, [poData])

  const handleBackup = async () => {
    setBackupLoading('backup')
    try {
      const res = await authFetch(`/api/database/backup-master?table=purchase_order_history`)
      if (!res.ok) {
        let errMsg = 'Gagal backup data riwayat purchase order'
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
      a.download = match ? match[1] : `backup-purchase-order-history-${Date.now()}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Backup berhasil diunduh')
    } catch (e) { console.error('Backup error:', e); toast.error('Gagal backup data riwayat purchase order') }
    setBackupLoading(null)
  }

  const handleRestore = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xlsx'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      if (!confirm('Data riwayat purchase order yang ada akan diganti dengan data dari file backup. Lanjutkan?')) return
      setBackupLoading('restore')
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('table', 'purchase_order_history')
        const res = await authFetch('/api/database/restore-master', {
          method: 'POST',
          body: fd,
        })
        const data = await res.json()
        if (res.ok && data.success) {
          toast.success(`Restore berhasil (${data.count} data)`)
          fetchHistory()
          notifyDataChange('purchase-order')
        } else {
          toast.error(data.error || 'Gagal restore data riwayat purchase order')
        }
      } catch { toast.error('File backup tidak valid') }
      setBackupLoading(null)
    }
    input.click()
  }

  // Filter by search
  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return poHistory
    const q = searchQuery.toLowerCase().trim()
    return poHistory.filter(entry => {
      const info = parseDocInfo(entry)
      return (
        entry.nomor?.toLowerCase().includes(q) ||
        entry.pihakKedua?.toLowerCase().includes(q) ||
        info.namaBarang?.toLowerCase().includes(q) ||
        entry.tanggal?.toLowerCase().includes(q)
      )
    })
  }, [poHistory, searchQuery])

  const countLabel = loading ? 'Memuat data…' : `${poHistory.length} purchase order`

  return (
    <>
      <div className="space-y-5">
        {/* Header — gaya Master Customer */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">Riwayat Purchase Order</h1>
            <p className="text-sm text-muted-foreground mt-1">{countLabel}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari no. PO / suplier / barang…"
                aria-label="Cari purchase order"
                className="pl-9 min-h-[44px]"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={onCreate}
                title="Buat purchase order baru"
                className="bg-violet-600 hover:bg-violet-700 min-h-[44px] flex-1 sm:flex-none"
              >
                <Plus className="h-4 w-4" /> Buat PO
              </Button>
              <Button onClick={handleBackup} variant="outline" disabled={backupLoading === 'backup'} title="Backup riwayat purchase order" className="min-h-[44px] flex-1 sm:flex-none">
                {backupLoading === 'backup' ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />} Backup
              </Button>
              <Button onClick={handleRestore} variant="outline" disabled={backupLoading === 'restore'} title="Restore riwayat purchase order" className="min-h-[44px] flex-1 sm:flex-none">
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
        ) : filteredHistory.length === 0 ? (
          <div className="text-center py-16">
            <History className="h-10 w-10 mx-auto text-stone-300 mb-3" />
            <p className="text-sm font-medium text-stone-600">{searchQuery.trim() ? 'Tidak ditemukan' : 'Belum ada purchase order'}</p>
            <p className="text-xs text-muted-foreground mt-1">{searchQuery.trim() ? 'Coba kata kunci lain' : 'Klik "Buat PO" untuk membuat baru'}</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
              <div className="max-h-96 overflow-y-auto scrollbar-thin">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-stone-50">
                    <TableRow className="bg-stone-50 hover:bg-stone-50">
                      <TableHead>No. PO</TableHead>
                      <TableHead>Tgl</TableHead>
                      <TableHead>Suplier</TableHead>
                      <TableHead>Nama Barang</TableHead>
                      <TableHead className="text-right hidden lg:table-cell">Qty</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-center">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistory.slice(0, 100).map((entry) => {
                      const info = parseDocInfo(entry)
                      return (
                        <TableRow key={entry.id}>
                          <TableCell className="font-medium whitespace-nowrap text-violet-700">{entry.nomor || '-'}</TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap">{entry.tanggal ? formatTanggal(entry.tanggal) : '-'}</TableCell>
                          <TableCell className="max-w-32 truncate">{entry.pihakKedua || '-'}</TableCell>
                          <TableCell className="max-w-44 text-muted-foreground" title={info.namaBarang}>
                            <span className="truncate block">{info.namaBarang ? info.namaBarang.split('\n')[0] : '-'}</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground hidden lg:table-cell">{info.totalQty > 0 ? info.totalQty.toLocaleString('id-ID') : '-'}</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold text-emerald-700">{info.totalHarga > 0 ? formatRupiah(info.totalHarga) : '-'}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex justify-center gap-1">
                              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => { setPreviewItem(entry); setPreviewOpen(true) }} aria-label={`Lihat ${entry.nomor}`} title="Lihat"><Eye className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => restoreToEditor(entry)} aria-label={`Muat ${entry.nomor}`} title="Muat ke editor"><RotateCcw className="h-4 w-4" /></Button>
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
              {filteredHistory.slice(0, 100).map((entry) => {
                const info = parseDocInfo(entry)
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
                        {info.namaBarang && <p className="text-xs line-clamp-1">{info.namaBarang.split('\n')[0]}</p>}
                        {info.totalQty > 0 && <p className="text-xs">Qty: {info.totalQty.toLocaleString('id-ID')}</p>}
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button variant="outline" size="sm" className="flex-1 min-h-[44px]" onClick={() => { setPreviewItem(entry); setPreviewOpen(true) }}>
                          <Eye className="h-4 w-4" /> Lihat
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1 min-h-[44px]" onClick={() => restoreToEditor(entry)}>
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
          </>
        )}
      </div>

      {/* AlertDialog hapus */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(o) => { if (!o) setDeleteConfirmId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus purchase order?</AlertDialogTitle>
            <AlertDialogDescription>Data purchase order yang dihapus tidak dapat dikembalikan.</AlertDialogDescription>
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

      {/* Preview Popup */}
      {previewOpen && poData && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col">
          {/* Close button */}
          <div className="flex justify-end p-3 shrink-0">
            <button
              onClick={() => setPreviewOpen(false)}
              aria-label="Tutup pratinjau"
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/90 shadow-md hover:bg-white transition-colors"
            >
              <X className="w-4 h-4 text-slate-700" />
            </button>
          </div>
          {/* Preview */}
          <div className="flex-1 flex items-start justify-center overflow-auto p-4 pb-28 min-h-0">
            <div
              style={{ width: previewDims?.w, height: previewDims?.h }}
              className="flex-shrink-0"
            >
              <div
                ref={previewWrapperRef}
                data-document-preview
                style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left' }}
              >
                <PurchaseOrderPreview data={poData} />
              </div>
            </div>
          </div>
          {/* Action buttons - fixed at bottom */}
          <div className="fixed bottom-0 left-0 right-0 flex justify-center gap-2 p-4 pb-6 sm:pb-4 bg-black/60 backdrop-blur-sm">
            <Button
              onClick={handleSendJpg}
              disabled={sendingPdf}
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {sendingPdf ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Mengirim...</> : 'Kirim WhatsApp'}
            </Button>
          </div>
        </div>
      )}

    </>
  )
}

// ============================================================
// PurchaseOrderPage — daftar purchase order langsung tampil
// (tanpa tab) + layar "Buat Purchase Order Baru" dari tombol Buat PO.
// UI daftar & editor mengikuti gaya halaman Invoice.
// ============================================================
export default function PurchaseOrderPage() {
  const [showCreate, setShowCreate] = useState(false)

  return (
    <DashboardLayout title="Purchase Order" subtitle="Buat purchase order dengan pratinjau popup dan cetak A5">
      <Suspense fallback={null}>
        <AutoOpenEditor param="riwayatId" onOpen={() => setShowCreate(true)} />
      </Suspense>
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
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground truncate">Buat Purchase Order Baru</h2>
          </div>
          <Suspense fallback={null}>
            <PurchaseOrderEditor />
          </Suspense>
        </div>
      ) : (
        <div className="print:hidden">
          <PurchaseOrderRiwayatView onCreate={() => setShowCreate(true)} />
        </div>
      )}
    </DashboardLayout>
  )
}
