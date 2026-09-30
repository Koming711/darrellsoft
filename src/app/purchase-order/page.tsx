'use client'

import { Suspense, useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { PurchaseOrderEditor } from '@/components/dokupro/purchase-order-editor'
import { getAuthHeaders } from '@/lib/auth'
import { fetcher } from '@/lib/fetcher'
import { formatRupiah, formatTanggal, formatTanggalShort } from '@/lib/format'
import { notifyDataChange } from '@/lib/data-sync'
import { authFetch } from '@/lib/auth-fetch'
import {
  History,
  Pencil,
  RotateCcw,
  Trash2,
  Loader2,
  Search,
  X,
  DatabaseBackup,
  Upload,
  Plus,
  ArrowLeft,
  Printer,
  Image as ImageIcon,
  Maximize2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  RiwayatPeriodFilter,
  RiwayatFilterCard,
  RiwayatCustomerFilter,
  RiwayatSummaryCard,
  RiwayatEmptyState,
  riwayatPeriodText,
  riwayatDateRange,
  type RiwayatPeriod,
} from '@/components/dokupro/riwayat-period-filter'
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
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { PurchaseOrderPreview } from '@/components/dokupro/purchase-order-preview'
import { captureDocumentPaperJpg, resolveDocumentPreviewEl } from '@/lib/capture-jpg'
import { printBlobHiRes } from '@/lib/print-hi-res'
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
// tampil (tanpa tab). UI mengikuti gaya halaman Laporan Penjualan
// (filter periode, kartu ringkasan, tabel & kartu riwayat).
// ============================================================
function PurchaseOrderRiwayatView({ onCreate, onOpenDetail }: { onCreate: () => void; onOpenDetail: (id: string) => void }) {
  const setPurchaseOrder = useDokuproStore((s) => s.setPurchaseOrder)
  const [poHistory, setPoHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  // Filter nama suplier (dropdown) — gaya filter pelanggan riwayat lainnya
  const [partyFilter, setPartyFilter] = useState('')
  const [period, setPeriod] = useState<RiwayatPeriod>('all')
  const [month, setMonth] = useState<number | null>(new Date().getMonth() + 1)
  const [year, setYear] = useState<number | null>(new Date().getFullYear())
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
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

  // Periode efektif & label — dari helper bersama riwayat-period-filter
  const periodLabel = riwayatPeriodText(period, dateFrom, dateTo, month, year)
  const eff = riwayatDateRange(period, dateFrom, dateTo, month, year)
  const filtersActive = period !== 'all' || !!dateFrom || !!dateTo || !!searchQuery.trim() || !!partyFilter

  // Daftar nama suplier unik dari riwayat PO (isi dropdown filter)
  const partyOptions = useMemo(() => {
    const set = new Set<string>()
    for (const entry of poHistory) {
      const name = String(entry?.pihakKedua || '').trim()
      if (name && name !== '-') set.add(name)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'))
  }, [poHistory])

  // Filter by search + suplier + rentang tanggal periode
  const filteredHistory = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return poHistory.filter(entry => {
      if (eff.dateFrom && entry.tanggal && entry.tanggal < eff.dateFrom) return false
      if (eff.dateTo && entry.tanggal && entry.tanggal > eff.dateTo) return false
      if (partyFilter && String(entry?.pihakKedua || '').trim() !== partyFilter) return false
      if (!q) return true
      const info = parseDocInfo(entry)
      return (
        entry.nomor?.toLowerCase().includes(q) ||
        entry.pihakKedua?.toLowerCase().includes(q) ||
        info.namaBarang?.toLowerCase().includes(q) ||
        entry.tanggal?.toLowerCase().includes(q)
      )
    })
  }, [poHistory, searchQuery, partyFilter, eff.dateFrom, eff.dateTo])

  // Total nilai PO pada periode terpilih
  const summaryTotal = useMemo(() => {
    let total = 0
    for (const entry of filteredHistory) total += parseDocInfo(entry).totalHarga
    return total
  }, [filteredHistory])

  return (
    <>
      <div className="space-y-5">
        {/* Header — gaya Laporan Penjualan */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">Riwayat Purchase Order</h1>
            <p className="text-sm text-muted-foreground mt-1">Periode: {periodLabel}</p>
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

        {/* Filter: suplier + periode + pencarian SATU BARIS — SELALU TAMPIL (mobile & desktop) */}
        <RiwayatFilterCard activeCount={(period !== 'all' ? 1 : 0) + (searchQuery.trim() !== '' ? 1 : 0) + (partyFilter ? 1 : 0)}>
            <RiwayatPeriodFilter
              idPrefix="riwayat-po"
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
                  <RiwayatCustomerFilter
                    idPrefix="riwayat-po"
                    options={partyOptions}
                    value={partyFilter}
                    onChange={setPartyFilter}
                    placeholder="Semua Suplier"
                    ariaLabel="Filter nama suplier purchase order"
                  />
                  <div className="relative w-52 sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" aria-hidden="true" />
                    <Input
                      id="riwayat-po-search"
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari no. PO / suplier / barang…"
                      aria-label="Cari purchase order"
                      className="pl-9 min-h-[44px] bg-white"
                    />
                  </div>
                  {filtersActive && (
                    <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={() => { setPeriod('all'); setDateFrom(''); setDateTo(''); setSearchQuery(''); setPartyFilter('') }} aria-label="Reset filter" title="Reset Filter">
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              }
            />
        </RiwayatFilterCard>

        {/* Ringkasan — gaya Laporan Penjualan */}
        {loading ? (
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <RiwayatSummaryCard
              label="Jumlah Purchase Order"
              value={filteredHistory.length}
              note="PO pada periode terpilih"
            />
            <RiwayatSummaryCard
              label="Total Nilai PO"
              value={formatRupiah(summaryTotal)}
              note="Akumulasi nilai purchase order"
            />
          </div>
        )}

        {/* Content */}
        {loading ? (
          <Skeleton className="h-72 w-full rounded-xl" />
        ) : filteredHistory.length === 0 ? (
          <RiwayatEmptyState
            icon={<History />}
            title={filtersActive ? 'Tidak ditemukan' : 'Belum ada purchase order'}
            desc={filtersActive ? 'Coba ubah filter periode atau kata kunci pencarian.' : 'Klik "Buat PO" untuk membuat baru'}
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
              <div className="max-h-96 overflow-y-auto scrollbar-thin">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-stone-50">
                    <TableRow className="bg-stone-50 hover:bg-stone-50">
                      <TableHead className="w-10">No.</TableHead>
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
                    {filteredHistory.slice(0, 100).map((entry, i) => {
                      const info = parseDocInfo(entry)
                      return (
                        <TableRow
                          key={entry.id}
                          onClick={() => onOpenDetail(entry.id)}
                          className="cursor-pointer"
                        >
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="whitespace-nowrap"><span className="font-mono text-xs">{entry.nomor || '-'}</span></TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap">{entry.tanggal ? formatTanggal(entry.tanggal) : '-'}</TableCell>
                          <TableCell className="max-w-32 truncate">{entry.pihakKedua || '-'}</TableCell>
                          <TableCell className="max-w-44 text-muted-foreground" title={info.namaBarang}>
                            <span className="truncate block">{info.namaBarang ? info.namaBarang.split('\n')[0] : '-'}</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground hidden lg:table-cell">{info.totalQty > 0 ? info.totalQty.toLocaleString('id-ID') : '-'}</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold text-emerald-700">{info.totalHarga > 0 ? formatRupiah(info.totalHarga) : '-'}</TableCell>
                          <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-center gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => restoreToEditor(entry)} aria-label={`Muat ${entry.nomor}`} title="Muat ke editor"><RotateCcw className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteConfirmId(entry.id)} aria-label={`Hapus ${entry.nomor}`} title="Hapus"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Mobile cards — klik kartu → Detail PO (gaya baris riwayat invoice);
                aksi Muat/Hapus tetap via tombol dgn stopPropagation */}
            <div className="md:hidden space-y-3">
              {filteredHistory.slice(0, 100).map((entry) => {
                const info = parseDocInfo(entry)
                return (
                  <Card
                    key={entry.id}
                    className="p-0 gap-0 cursor-pointer hover:bg-stone-50 transition-colors"
                    onClick={() => onOpenDetail(entry.id)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Buka detail ${entry.nomor || 'purchase order'}`}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDetail(entry.id) } }}
                  >
                    <CardContent className="p-4 space-y-2">
                      <p className="font-mono text-xs font-semibold break-all">{entry.nomor || '-'}</p>
                      <p className="text-sm">
                        <span className="text-muted-foreground">{formatTanggal(entry.tanggal)} · </span>
                        <span className="font-medium">{entry.pihakKedua || '-'}</span>
                      </p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm border-t border-stone-100 pt-2">
                        <p className="text-muted-foreground">Total: <span className="font-medium text-stone-700">{info.totalHarga > 0 ? formatRupiah(info.totalHarga) : '—'}</span></p>
                        <p className="text-muted-foreground">Qty: <span className="font-medium text-stone-700">{info.totalQty > 0 ? info.totalQty.toLocaleString('id-ID') : '—'}</span></p>
                      </div>
                      <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-2.5" onClick={(e) => e.stopPropagation()}>
                        <Button variant="outline" className="flex-1 min-h-[36px] h-8 px-2 gap-1 text-xs" onClick={() => restoreToEditor(entry)}>
                          <RotateCcw className="h-3.5 w-3.5" /> Muat
                        </Button>
                        <Button variant="outline" className="flex-1 min-h-[36px] h-8 px-2 gap-1 text-xs text-destructive hover:text-destructive" onClick={() => setDeleteConfirmId(entry.id)}>
                          <Trash2 className="h-3.5 w-3.5" /> Hapus
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

    </>
  )
}

// ============================================================
// DetailPurchaseOrderView — halaman detail purchase order
// (pratinjau A5), dibuka setelah Simpan di "Buat Purchase Order
// Baru", saat baris riwayat diklik, & deep-link /purchase-order?detail=<id>.
// Gaya mengikuti Detail Invoice: info ringkas + tombol aksi DI ATAS
// pratinjau + lightbox zoom.
// ============================================================
function DetailPurchaseOrderView({ id, onBack, onEdit }: { id: string; onBack: () => void; onEdit?: (id: string) => void }) {
  const resetDocument = useDokuproStore((s) => s.resetDocument)
  const setPurchaseOrder = useDokuproStore((s) => s.setPurchaseOrder)
  const [entry, setEntry] = useState<HistoryEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [jpgGenerating, setJpgGenerating] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [hapusOpen, setHapusOpen] = useState(false)
  // Lightbox pratinjau — klik/ketuk gambar preview → tampil besar fit layar
  const [zoomOpen, setZoomOpen] = useState(false)

  // Pratinjau scaler
  const scalerRef = useRef<HTMLDivElement>(null)
  const zoomStageRef = useRef<HTMLDivElement>(null)
  const zoomScalerRef = useRef<HTMLDivElement>(null)

  const loadEntry = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetcher(`/api/history/${id}`, { headers: getAuthHeaders() })
      if (res.ok) {
        const json = await res.json()
        setEntry(json.data || null)
      } else {
        setError('Purchase order tidak ditemukan')
      }
    } catch {
      setError('Gagal memuat purchase order')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadEntry() }, [loadEntry])

  const data = useMemo(() => (entry ? parsePurchaseOrderData(entry) : null), [entry])
  const info = useMemo(() => (entry ? parseDocInfo(entry) : null), [entry])

  // Scale pratinjau A5 agar pas dengan container (desktop ~+20% dari ukuran
  // asli 148mm, mobile full-width). offsetWidth/Height tidak terpengaruh transform.
  useLayoutEffect(() => {
    if (!data) return
    const fit = () => {
      const wrapper = scalerRef.current
      if (!wrapper) return
      const a5 = wrapper.querySelector('.a5-page') as HTMLElement | null
      if (!a5) return
      const naturalW = a5.offsetWidth
      const naturalH = a5.offsetHeight
      if (naturalW === 0 || naturalH === 0) {
        requestAnimationFrame(fit)
        return
      }
      const availW = wrapper.parentElement?.clientWidth || wrapper.clientWidth
      if (availW === 0) {
        requestAnimationFrame(fit)
        return
      }
      const scale = availW / naturalW
      a5.style.transform = `scale(${scale})`
      a5.style.transformOrigin = 'top left'
      wrapper.style.width = `${naturalW * scale}px`
      wrapper.style.height = `${naturalH * scale}px`
    }
    fit()
    const raf = requestAnimationFrame(fit)
    const timer = setTimeout(fit, 250)
    window.addEventListener('resize', fit)
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); window.removeEventListener('resize', fit) }
  }, [data])

  // Lightbox pratinjau: skala terbesar yang membuat SELURUH halaman A5 muat
  // di viewport (fit lebar & tinggi) — di HP umumnya memenuhi lebar layar.
  useLayoutEffect(() => {
    if (!zoomOpen || !data) return
    const fit = () => {
      const stage = zoomStageRef.current
      const wrap = zoomScalerRef.current
      if (!stage || !wrap) return
      const a5 = wrap.querySelector('.a5-page') as HTMLElement | null
      if (!a5) return
      const naturalW = a5.offsetWidth
      const naturalH = a5.offsetHeight
      if (naturalW === 0 || naturalH === 0) {
        requestAnimationFrame(fit)
        return
      }
      const availW = stage.clientWidth
      const availH = stage.clientHeight
      if (availW === 0 || availH === 0) {
        requestAnimationFrame(fit)
        return
      }
      const scale = Math.min(availW / naturalW, availH / naturalH)
      a5.style.transform = `scale(${scale})`
      a5.style.transformOrigin = 'top left'
      wrap.style.width = `${naturalW * scale}px`
      wrap.style.height = `${naturalH * scale}px`
    }
    fit()
    const raf = requestAnimationFrame(fit)
    const timer = setTimeout(fit, 250)
    window.addEventListener('resize', fit)
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); window.removeEventListener('resize', fit) }
  }, [zoomOpen, data])

  const handleJpg = async () => {
    if (!data) return
    setJpgGenerating(true)
    try {
      // Hi-res 300 DPI dari elemen .a5-page (layout tetap 148mm di SEMUA
      // perangkat), dikomposisi ke kanvas A5 portrait 300 DPI (1748×2480 px).
      // marginPct: 0 — capture .a5-page SUDAH mengandung margin pratinjau 10mm.
      const previewEl = resolveDocumentPreviewEl()
      if (!previewEl) { toast.error('Pratinjau tidak ditemukan'); return }
      const blob = await captureDocumentPaperJpg({ el: previewEl, paper: 'A5', orientation: 'portrait', marginPct: 0 })
      const fileName = `${(data.nomor || 'draft').replace(/\//g, '-')}.jpg`
      const phone = data.pemasok?.kontak || ''
      const result = await shareJpgToWhatsApp({
        blob,
        fileName,
        documentLabel: `Purchase Order ${data.nomor}`,
        phone,
      })
      if (result.status === 'shared') toast.success('Gambar dibagikan ke WhatsApp')
      else if (result.status === 'cancelled') { /* silent */ }
      else if (result.status === 'downloaded') toast.success(`${fileName} tersimpan ke perangkat`, { description: 'File JPG telah diunduh ke folder Downloads.' })
      else toast.error(result.error || 'Gagal memproses JPG')
    } catch (err) {
      console.error(err)
      toast.error('Gagal membuat JPG')
    } finally {
      setJpgGenerating(false)
    }
  }

  // Cetak: hasil cetak = gambar JPG hi-res 300 DPI yang sama dengan hasil JPG
  // (identik mobile & desktop) — bukan jalur @media print.
  const handlePrint = async () => {
    if (!data) return
    setIsPrinting(true)
    try {
      const previewEl = resolveDocumentPreviewEl()
      if (!previewEl) { toast.error('Pratinjau tidak ditemukan'); return }
      const blob = await captureDocumentPaperJpg({ el: previewEl, paper: 'A5', orientation: 'portrait', marginPct: 0 })
      const label = (data.nomor || 'purchase-order').replace(/\//g, '-')
      // @page margin: 0 — gambar (yang sudah mengandung margin pratinjau 10mm)
      // memenuhi halaman A5 penuh → margin hasil cetak = margin pratinjau PERSIS.
      const ok = await printBlobHiRes(blob, { title: `Purchase Order ${label}`, page: '148mm 210mm', margin: '0' })
      if (!ok) toast.error('Popup diblokir. Izinkan popup untuk mencetak.')
    } catch (e) {
      console.error('Print error:', e)
      toast.error('Gagal menyiapkan cetakan')
    } finally { setIsPrinting(false) }
  }

  // Hapus — soft delete → masuk Sampah (bisa dipulihkan), sama dgn riwayat PO
  const handleHapus = async () => {
    if (!entry) return
    setUpdating(true)
    try {
      const res = await fetcher(`/api/history/${entry.id}`, { method: 'DELETE', headers: getAuthHeaders() })
      if (res.ok) {
        toast.success('Purchase Order dipindahkan ke Sampah')
        setHapusOpen(false)
        window.dispatchEvent(new CustomEvent('dokupro:history-updated'))
        notifyDataChange('purchase-order')
        resetDocument('purchase-order')
        onBack()
      } else {
        toast.error('Gagal menghapus purchase order')
      }
    } catch {
      toast.error('Gagal menghapus purchase order')
    } finally {
      setUpdating(false)
    }
  }

  const actionButtons = (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button size="sm" onClick={handlePrint} disabled={isPrinting} className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 min-h-[36px]">
        {isPrinting ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Cetak...</> : <><Printer className="mr-1.5 h-3.5 w-3.5" /> Cetak</>}
      </Button>
      <Button size="sm" onClick={handleJpg} disabled={jpgGenerating} className="bg-green-600 hover:bg-green-700 min-h-[36px]">
        {jpgGenerating ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> JPG...</> : <><ImageIcon className="mr-1.5 h-3.5 w-3.5" /> JPG</>}
      </Button>
      {onEdit && (
        <Button size="sm" variant="outline" onClick={() => { if (data) setPurchaseOrder(data); onEdit(id) }} className="min-h-[36px]">
          <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={() => setHapusOpen(true)} className="border-red-200 text-destructive hover:bg-red-50 hover:text-destructive min-h-[36px]">
        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Hapus
      </Button>
    </div>
  )

  return (
    <div>
      {/* Header — Kembali + judul "Detail Purchase Order" */}
      <div className="flex items-center gap-2 mb-3 print:hidden flex-wrap">
        <Button onClick={onBack} variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
          <ArrowLeft className="w-3.5 h-3.5" /> Kembali
        </Button>
        <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground truncate">Detail Purchase Order</h2>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-[480px] w-full max-w-[670px] mx-auto rounded-xl" />
        </div>
      ) : error || !entry || !data || !info ? (
        <RiwayatEmptyState icon={<History />} title={error || 'Purchase order tidak ditemukan'} desc="Kembali ke riwayat dan pilih purchase order lain." />
      ) : (
        <>
          {/* Info ringkas */}
          <div className="rounded-xl border border-stone-200 bg-white p-4 mb-4 print:hidden">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">No. PO</p>
                <p className="font-semibold truncate">{entry.nomor || '-'}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Tanggal</p>
                <p className="font-medium">{entry.tanggal ? formatTanggalShort(entry.tanggal) : '-'}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Suplier</p>
                <p className="font-medium truncate">{entry.pihakKedua || '-'}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</p>
                <p className="font-bold text-emerald-700">{info.totalHarga > 0 ? formatRupiah(info.totalHarga) : '-'}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Jumlah item: <span className="font-semibold text-stone-700">{data.items.length}</span>
              {info.totalQty > 0 ? <> · Total Qty: <span className="font-semibold text-stone-700">{info.totalQty.toLocaleString('id-ID')}</span></> : null}
              {info.referensi ? <> · Ref.: <span className="font-medium">{info.referensi}</span></> : null}
              {info.tanggalJatuhTempo ? <> · Jatuh Tempo: <span className="font-medium">{formatTanggalShort(info.tanggalJatuhTempo)}</span></> : null}
            </p>
          </div>

          {/* Tombol aksi — DI ATAS pratinjau */}
          <div className="mb-4">{actionButtons}</div>

          {/* Pratinjau A5 — outline, fit container. Klik/ketuk → lightbox. */}
          <div className="flex justify-center print:hidden" id="document-preview">
            <div className="w-full" style={{ maxWidth: '670px' }}>
              <div
                ref={scalerRef}
                data-preview-scaler
                data-document-preview
                role="button"
                tabIndex={0}
                aria-label="Perbesar pratinjau purchase order"
                title="Klik / ketuk untuk memperbesar"
                onClick={() => setZoomOpen(true)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setZoomOpen(true) } }}
                className="a5-preview-container relative bg-white overflow-hidden cursor-zoom-in transition-shadow hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
                style={{ border: '2px solid #cbd5e1', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.07)' }}
              >
                <PurchaseOrderPreview data={data} />
                {/* Indikator tap-to-zoom (di luar .a5-page — tidak ikut ter-capture JPG) */}
                <span className="pointer-events-none absolute bottom-2 right-2 z-10 inline-flex items-center gap-1 rounded-full bg-stone-900/60 px-2 py-1 text-[10px] font-medium text-white shadow-md">
                  <Maximize2 className="h-3 w-3" /> Perbesar
                </span>
              </div>
            </div>
          </div>

          {/* Lightbox pratinjau — gambar preview langsung besar, fit layar.
              Tutup: ✕ / klik luar. Portal → capture JPG/Cetak tetap target
              #document-preview. */}
          <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
            <DialogContent
              showCloseButton={false}
              aria-label="Pratinjau purchase order diperbesar"
              aria-describedby={undefined}
              className="h-screen max-h-none w-full max-w-none sm:max-w-none rounded-none border-0 bg-stone-950/95 p-0 overflow-hidden gap-0"
              style={{ height: '100dvh' }}
            >
              <button
                type="button"
                onClick={() => setZoomOpen(false)}
                aria-label="Tutup pratinjau"
                className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/60 text-white transition-colors hover:bg-black/80"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="absolute inset-0 p-3 sm:p-6">
                <div ref={zoomStageRef} className="flex h-full w-full items-center justify-center">
                  <div
                    ref={zoomScalerRef}
                    className="overflow-hidden rounded-lg bg-white shadow-2xl"
                    style={{ border: '1px solid #e7e5e4' }}
                  >
                    <PurchaseOrderPreview data={data} />
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Konfirmasi Hapus */}
          <AlertDialog open={hapusOpen} onOpenChange={setHapusOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Hapus purchase order?</AlertDialogTitle>
                <AlertDialogDescription>
                  Purchase order {entry.nomor} akan dipindahkan ke Sampah dan masih dapat dipulihkan dari sana.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={updating}>Batal</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={(e) => { e.preventDefault(); void handleHapus() }}>
                  {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ya, Hapus'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  )
}

// ============================================================
// PurchaseOrderPage — daftar purchase order langsung tampil
// (tanpa tab) + layar "Buat Purchase Order Baru" dari tombol Buat PO
// + layar Detail Purchase Order (setelah Simpan / baris riwayat /
// deep-link ?detail=). UI daftar & editor mengikuti gaya halaman Invoice.
// ============================================================
export default function PurchaseOrderPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  // id dokumen yang sedang diedit di layar editor (null = buat baru).
  const [editingId, setEditingId] = useState<string | null>(null)
  const resetDocument = useDokuproStore((s) => s.resetDocument)

  // Deep-link: /purchase-order?detail=<id> → langsung buka Detail PO.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const d = params.get('detail')
      if (d) setDetailId(d)
    } catch {
      // abaikan — query tidak valid
    }
  }, [])

  // Tutup detail + bersihkan query param agar refresh tidak membuka detail lagi.
  const closeDetail = () => {
    setDetailId(null)
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState(null, '', '/purchase-order')
    }
  }

  // Tutup layar Buat/Edit + bersihkan query param deep-link editor (?riwayatId=).
  const closeCreate = () => {
    setShowCreate(false)
    // Keluar dari mode edit tanpa menyimpan → pulihkan editor ke default
    // (data dokumen yang diedit jangan terbawa ke "Buat PO" berikutnya).
    if (editingId) {
      setEditingId(null)
      resetDocument('purchase-order')
    }
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState(null, '', '/purchase-order')
    }
  }

  return (
    <DashboardLayout title="Purchase Order" subtitle="Buat purchase order dengan pratinjau langsung dan cetak A5">
      <Suspense fallback={null}>
        <AutoOpenEditor param="riwayatId" onOpen={() => setShowCreate(true)} />
      </Suspense>
      {detailId ? (
        <DetailPurchaseOrderView
          id={detailId}
          onBack={closeDetail}
          onEdit={(eid) => { setDetailId(null); setEditingId(eid); setShowCreate(true) }}
        />
      ) : showCreate ? (
        <div className="print:hidden">
          {/* Header: kembali + judul halaman */}
          <div className="flex items-center gap-2 mb-3">
            <Button
              onClick={closeCreate}
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Kembali
            </Button>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground truncate">
              {editingId ? 'Edit Purchase Order' : 'Buat Purchase Order Baru'}
            </h2>
          </div>
          <Suspense fallback={null}>
            {/* Simpan/Update → menuju Detail Purchase Order (seperti alur Buat Invoice) */}
            <PurchaseOrderEditor
              editingId={editingId}
              onSaved={(id) => {
                setShowCreate(false)
                if (editingId) {
                  setEditingId(null)
                  resetDocument('purchase-order')
                }
                setDetailId(id)
              }}
            />
          </Suspense>
        </div>
      ) : (
        <div className="print:hidden">
          <PurchaseOrderRiwayatView
            onCreate={() => setShowCreate(true)}
            onOpenDetail={(id) => setDetailId(id)}
          />
        </div>
      )}
    </DashboardLayout>
  )
}
