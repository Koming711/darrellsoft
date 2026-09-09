'use client'

import { Suspense, useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { SuratJalanEditor } from '@/components/dokupro/surat-jalan-editor'
import {
  RiwayatEmptyState,
  RiwayatPeriodFilter,
  RiwayatFilterCard,
  RiwayatSummaryCard,
  riwayatDateRange,
  riwayatPeriodText,
  type RiwayatPeriod,
} from '@/components/dokupro/riwayat-period-filter'
import { getAuthHeaders } from '@/lib/auth'
import { formatTanggalFull } from '@/lib/format'
import { notifyDataChange } from '@/lib/data-sync'
import { authFetch } from '@/lib/auth-fetch'
import {
  History,
  Loader2,
  Search,
  X,
  Eye,
  DatabaseBackup,
  Upload,
  Plus,
  ArrowLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { toast } from 'sonner'
import { SuratJalanPreview } from '@/components/dokupro/surat-jalan-preview'
import { captureElementAsJpg } from '@/lib/capture-jpg'
import { shareJpgToWhatsApp } from '@/lib/share-jpg'
import type { SuratJalanData, CompanyInfo } from '@/lib/types'
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
    const itemsCount = items.length
    const totalQty = items.reduce((sum: number, it: { qty?: number }) => sum + (Number(it.qty) || 0), 0)
    const referensi = parsed.referensi || ''
    const noKendaraan = parsed.noKendaraan || ''
    const pengemudi = parsed.pengemudi || ''
    return { namaBarang, totalQty, itemsCount, referensi, noKendaraan, pengemudi }
  } catch {
    return { namaBarang: '', totalQty: 0, itemsCount: 0, referensi: '', noKendaraan: '', pengemudi: '' }
  }
}

// --- Parse dataJson for SuratJalanData ---
function parseSuratJalanData(entry: HistoryEntry): SuratJalanData {
  try {
    const parsed = JSON.parse(entry.dataJson)
    const company: CompanyInfo = {
      nama: parsed.company?.nama || DEFAULT_COMPANY.nama,
      telepon: parsed.company?.telepon || DEFAULT_COMPANY.telepon,
      alamat: parsed.company?.alamat || DEFAULT_COMPANY.alamat,
      email: parsed.company?.email || DEFAULT_COMPANY.email,
      npwp: parsed.company?.npwp || '',
      website: parsed.company?.website || '',
      ppn: parsed.company?.ppn ?? 0,
      logo: parsed.company?.logo || '',
      bankName: parsed.company?.bankName || '',
      bankAccount: parsed.company?.bankAccount || '',
      bankHolder: parsed.company?.bankHolder || '',
      bankName2: parsed.company?.bankName2 || '',
      bankAccount2: parsed.company?.bankAccount2 || '',
      bankHolder2: parsed.company?.bankHolder2 || '',
    }
    const penerima = parsed.penerima || { nama: '', kontak: '', alamat: '' }
    const items = (parsed.items || []).map((it: { id?: string; deskripsi?: string; qty?: number; satuan?: string; harga?: number }, i: number) => ({
      id: it.id || `item-${i}`,
      deskripsi: it.deskripsi || '',
      qty: it.qty || 0,
      satuan: it.satuan || '',
      harga: it.harga || 0,
    }))
    return {
      type: 'surat-jalan',
      company,
      nomor: parsed.nomor || entry.nomor || '',
      tanggal: parsed.tanggal || entry.tanggal || '',
      referensi: parsed.referensi || '',
      penerima,
      items,
      noKendaraan: parsed.noKendaraan || '',
      pengemudi: parsed.pengemudi || '',
      catatan: parsed.catatan || '',
    }
  } catch {
    return {
      type: 'surat-jalan',
      company: { ...DEFAULT_COMPANY },
      nomor: entry.nomor || '',
      tanggal: entry.tanggal || '',
      referensi: '',
      penerima: { nama: '', kontak: '', alamat: '' },
      items: [],
      noKendaraan: '',
      pengemudi: '',
      catatan: '',
    }
  }
}

// Auto-open editor when the page receives a deep-link param
// (dipakai tombol "Surat Jalan" di halaman Invoice → ?invoiceId=...)
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
// SuratJalanRiwayatView — daftar surat jalan langsung tampil
// (tanpa tab). UI mengikuti gaya halaman Invoice / Master Customer.
// ============================================================
function SuratJalanRiwayatView({ onCreate }: { onCreate: () => void }) {
  const [sjHistory, setSjHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [previewItem, setPreviewItem] = useState<HistoryEntry | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewScale, setPreviewScale] = useState(1)
  const [previewDims, setPreviewDims] = useState<{ w: number; h: number } | null>(null)
  const previewWrapperRef = useRef<HTMLDivElement>(null)
  const [sendingPdf, setSendingPdf] = useState(false)
  const [backupLoading, setBackupLoading] = useState<string | null>(null)

  // Filter periode (gaya Laporan Penjualan) — default: Semua Periode
  const [period, setPeriod] = useState<RiwayatPeriod>('all')
  const [month, setMonth] = useState<number | null>(new Date().getMonth() + 1)
  const [year, setYear] = useState<number | null>(new Date().getFullYear())
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const periodLabel = riwayatPeriodText(period, dateFrom, dateTo, month, year)
  const eff = useMemo(
    () => riwayatDateRange(period, dateFrom, dateTo, month, year),
    [period, dateFrom, dateTo, month, year]
  )

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true)
      const headers = getAuthHeaders()
      const res = await fetch('/api/history?docType=surat-jalan', { headers, cache: 'no-store' })
      if (res.ok) {
        const json = await res.json()
        setSjHistory(json.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch surat jalan history:', err)
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

  const sjData = useMemo(() => {
    if (!previewItem) return null
    return parseSuratJalanData(previewItem)
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
  }, [previewOpen, sjData])

  const handleSendJpg = useCallback(async () => {
    if (!sjData) return
    setSendingPdf(true)
    try {
      const previewEl = document.querySelector('[data-document-preview]') as HTMLElement
      if (previewEl) {
        const blob = await captureElementAsJpg(previewEl)
        const fileName = `${(sjData.nomor || 'draft').replace(/\//g, '-')}.jpg`
        const phone = sjData.penerima?.kontak || ''

        const result = await shareJpgToWhatsApp({
          blob,
          fileName,
          documentLabel: `Surat Jalan ${sjData.nomor}`,
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
  }, [sjData])

  const handleBackup = async () => {
    setBackupLoading('backup')
    try {
      const res = await authFetch(`/api/database/backup-master?table=surat_jalan_history`)
      if (!res.ok) {
        let errMsg = 'Gagal backup data riwayat surat jalan'
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
      a.download = match ? match[1] : `backup-surat-jalan-history-${Date.now()}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Backup berhasil diunduh')
    } catch (e) { console.error('Backup error:', e); toast.error('Gagal backup data riwayat surat jalan') }
    setBackupLoading(null)
  }

  const handleRestore = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xlsx'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      if (!confirm('Data riwayat surat jalan yang ada akan diganti dengan data dari file backup. Lanjutkan?')) return
      setBackupLoading('restore')
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('table', 'surat_jalan_history')
        const res = await authFetch('/api/database/restore-master', {
          method: 'POST',
          body: fd,
        })
        const data = await res.json()
        if (res.ok && data.success) {
          toast.success(`Restore berhasil (${data.count} data)`)
          fetchHistory()
          notifyDataChange('surat-jalan')
        } else {
          toast.error(data.error || 'Gagal restore data riwayat surat jalan')
        }
      } catch { toast.error('File backup tidak valid') }
      setBackupLoading(null)
    }
    input.click()
  }

  // Filter by periode + search
  const filteredHistory = useMemo(() => {
    return sjHistory.filter(entry => {
      if (eff.dateFrom && entry.tanggal && entry.tanggal < eff.dateFrom) return false
      if (eff.dateTo && entry.tanggal && entry.tanggal > eff.dateTo) return false
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase().trim()
      const info = parseDocInfo(entry)
      return (
        entry.nomor?.toLowerCase().includes(q) ||
        entry.pihakKedua?.toLowerCase().includes(q) ||
        info.namaBarang?.toLowerCase().includes(q) ||
        entry.tanggal?.toLowerCase().includes(q)
      )
    })
  }, [sjHistory, searchQuery, eff])

  // Ringkasan dari hasil filter (gaya Laporan Penjualan)
  const summary = useMemo(() => {
    let totalItems = 0
    let totalQty = 0
    for (const entry of filteredHistory) {
      const info = parseDocInfo(entry)
      totalItems += info.itemsCount
      totalQty += info.totalQty
    }
    return { count: filteredHistory.length, totalItems, totalQty }
  }, [filteredHistory])

  const filtersActive = period !== 'all' || !!dateFrom || !!dateTo || !!searchQuery.trim()

  const resetFilters = () => {
    setPeriod('all')
    setDateFrom('')
    setDateTo('')
    setSearchQuery('')
  }

  return (
    <>
      <div className="space-y-5">
        {/* Header — gaya Laporan Penjualan */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">Riwayat Surat Jalan</h1>
            <p className="text-sm text-muted-foreground mt-1">Periode: {periodLabel}</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={onCreate}
              title="Buat surat jalan baru"
              className="bg-amber-600 hover:bg-amber-700 min-h-[44px] flex-1 sm:flex-none"
            >
              <Plus className="h-4 w-4" /> Buat Surat Jalan
            </Button>
            <Button onClick={handleBackup} variant="outline" disabled={backupLoading === 'backup'} title="Backup riwayat surat jalan" className="min-h-[44px] flex-1 sm:flex-none">
              {backupLoading === 'backup' ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />} Backup
            </Button>
            <Button onClick={handleRestore} variant="outline" disabled={backupLoading === 'restore'} title="Restore riwayat surat jalan" className="min-h-[44px] flex-1 sm:flex-none">
              {backupLoading === 'restore' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Restore
            </Button>
          </div>
        </div>

        {/* Filter — mobile collapsible */}
        <RiwayatFilterCard activeCount={(period !== 'all' ? 1 : 0) + (searchQuery.trim() !== '' ? 1 : 0)}>
            <RiwayatPeriodFilter
              idPrefix="riwayat-sj"
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
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="riwayat-sj-search">Cari</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" aria-hidden="true" />
                  <Input
                    id="riwayat-sj-search"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari no. SJ / penerima / barang…"
                    aria-label="Cari"
                    className="pl-9 min-h-[44px]"
                  />
                </div>
              </div>
              {filtersActive && (
                <div className="flex items-end">
                  <Button variant="ghost" className="text-xs text-muted-foreground h-10" onClick={resetFilters}>
                    <X className="h-3.5 w-3.5" /> Reset Filter
                  </Button>
                </div>
              )}
            </div>
        </RiwayatFilterCard>

        {/* Ringkasan */}
        {loading ? (
          <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
            <RiwayatSummaryCard label="Jumlah Surat Jalan" value={summary.count} />
            <RiwayatSummaryCard label="Jumlah Barang" value={summary.totalItems} />
            <RiwayatSummaryCard label="Total Qty" value={summary.totalQty.toLocaleString('id-ID')} />
          </div>
        )}

        {/* Content */}
        {loading ? (
          <Skeleton className="h-72 w-full rounded-xl" />
        ) : filteredHistory.length === 0 ? (
          <RiwayatEmptyState
            icon={<History />}
            title={filtersActive ? 'Tidak ditemukan' : 'Belum ada surat jalan'}
            desc={filtersActive ? 'Coba ubah filter periode atau kata kunci pencarian.' : 'Klik "Buat Surat Jalan" untuk membuat baru'}
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
                      <TableHead>No. SJ</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Penerima</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead>Ref. Invoice</TableHead>
                      <TableHead className="text-right">Jumlah Barang</TableHead>
                      <TableHead className="text-right">Total Qty</TableHead>
                      <TableHead className="text-center">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistory.slice(0, 100).map((entry, i) => {
                      const info = parseDocInfo(entry)
                      return (
                        <TableRow
                          key={entry.id}
                          onClick={() => { setPreviewItem(entry); setPreviewOpen(true) }}
                          className="cursor-pointer"
                        >
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            <span className="font-mono text-xs">{entry.nomor || '-'}</span>
                          </TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap">{entry.tanggal ? formatTanggalFull(entry.tanggal) : '-'}</TableCell>
                          <TableCell className="max-w-32 truncate">{entry.pihakKedua || '-'}</TableCell>
                          <TableCell className="max-w-24 truncate text-muted-foreground">{info.pengemudi || '-'}</TableCell>
                          <TableCell className="max-w-28 truncate text-xs text-muted-foreground" title={info.referensi}>{info.referensi || '-'}</TableCell>
                          <TableCell className="text-right tabular-nums">{info.itemsCount}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{info.totalQty.toLocaleString('id-ID')}</TableCell>
                          <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Lihat"
                              aria-label={`Lihat ${entry.nomor || 'surat jalan'}`}
                              onClick={() => { setPreviewItem(entry); setPreviewOpen(true) }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
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
                  <div
                    key={entry.id}
                    onClick={() => { setPreviewItem(entry); setPreviewOpen(true) }}
                    className="cursor-pointer"
                  >
                    <Card className="p-0 gap-0 hover:bg-stone-50">
                      <CardContent className="p-4 space-y-2">
                        <p className="font-mono text-xs font-semibold break-all">{entry.nomor || '-'}</p>
                        <p className="text-sm">
                          <span className="text-muted-foreground">{formatTanggalFull(entry.tanggal)} · </span>
                          <span className="font-medium">{entry.pihakKedua || '-'}</span>
                        </p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm border-t border-stone-100 pt-2">
                          <p className="text-muted-foreground">Barang: <span className="font-medium text-stone-700">{info.itemsCount}</span></p>
                          <p className="text-muted-foreground">Total Qty: <span className="font-medium text-stone-700">{info.totalQty.toLocaleString('id-ID')}</span></p>
                        </div>
                        <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-2.5">
                          <Button
                            variant="outline"
                            className="flex-1 min-h-[36px] h-8 px-2 gap-1 text-xs"
                            onClick={(e) => { e.stopPropagation(); setPreviewItem(entry); setPreviewOpen(true) }}
                          >
                            <Eye className="h-3.5 w-3.5" /> Lihat
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Preview Popup */}
      {previewOpen && sjData && (
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
                <SuratJalanPreview data={sjData} />
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
// SuratJalanPage — daftar surat jalan langsung tampil (tanpa tab)
// + layar "Buat Surat Jalan Baru" dari tombol Buat Surat Jalan.
// UI daftar & editor mengikuti gaya halaman Invoice.
// ============================================================
export default function SuratJalanPage() {
  const [showCreate, setShowCreate] = useState(false)

  return (
    <DashboardLayout title="Surat Jalan" subtitle="Buat surat jalan dengan pratinjau popup dan cetak A5">
      <Suspense fallback={null}>
        <AutoOpenEditor param="invoiceId" onOpen={() => setShowCreate(true)} />
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
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground truncate">Buat Surat Jalan Baru</h2>
          </div>
          <Suspense fallback={null}>
            <SuratJalanEditor />
          </Suspense>
        </div>
      ) : (
        <div className="print:hidden">
          <SuratJalanRiwayatView onCreate={() => setShowCreate(true)} />
        </div>
      )}
    </DashboardLayout>
  )
}
