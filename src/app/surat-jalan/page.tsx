'use client'

import { Suspense, useState, useEffect, useCallback, useMemo } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { SuratJalanEditor } from '@/components/dokupro/surat-jalan-editor'
import { useLanguage } from '@/contexts/language-context'
import { getAuthHeaders } from '@/lib/auth'
import { fetcher } from '@/lib/fetcher'
import { formatRupiah, formatTanggal } from '@/lib/format'
import { notifyDataChange } from '@/lib/data-sync'
import { authFetch } from '@/lib/auth-fetch'
import {
  History,
  Eye,
  Trash2,
  FileText,
  Loader2,
  Search,
  X,
  DatabaseBackup,
  Upload,
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
import { toast } from 'sonner'
import { SuratJalanPreview } from '@/components/dokupro/surat-jalan-preview'
import { generateSuratJalanPdf, sharePdfViaWhatsApp } from '@/lib/generate-pdf'
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
    const totalQty = items.reduce((sum: number, it: { qty: number }) => sum + (it.qty || 0), 0)
    const referensi = parsed.referensi || ''
    const noKendaraan = parsed.noKendaraan || ''
    const pengemudi = parsed.pengemudi || ''
    return { namaBarang, totalQty, referensi, noKendaraan, pengemudi }
  } catch {
    return { namaBarang: '', totalQty: 0, referensi: '', noKendaraan: '', pengemudi: '' }
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

function SuratJalanRiwayatTab() {
  const [sjHistory, setSjHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [previewItem, setPreviewItem] = useState<HistoryEntry | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewScale, setPreviewScale] = useState(1)
  const [sendingPdf, setSendingPdf] = useState(false)
  const [backupLoading, setBackupLoading] = useState<string | null>(null)

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true)
      const headers = getAuthHeaders()
      const res = await fetch('/api/history?docType=surat-jalan', { headers })
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

  // Scale preview
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

  const sjData = useMemo(() => {
    if (!previewItem) return null
    return parseSuratJalanData(previewItem)
  }, [previewItem])

  const handleDelete = async (id: string) => {
    try {
      const res = await fetcher(`/api/history/${id}`, { method: 'DELETE', headers: getAuthHeaders() })
      if (res.ok) {
        toast.success('Surat Jalan berhasil dihapus')
        notifyDataChange('surat-jalan')
        fetchHistory()
      } else {
        toast.error('Gagal menghapus surat jalan')
      }
    } catch {
      toast.error('Gagal menghapus surat jalan')
    }
    setDeleteConfirmId(null)
  }

  const handleSendPdf = useCallback(async () => {
    if (!sjData) return
    setSendingPdf(true)
    try {
      const blob = await generateSuratJalanPdf(sjData)
      const fileName = `SuratJalan_${sjData.nomor || 'draft'}.pdf`
      await sharePdfViaWhatsApp(blob, fileName, `Surat Jalan ${sjData.nomor}`)
      toast.success('PDF dikirim ke WhatsApp')
    } catch (err) {
      console.error(err)
      toast.error('Gagal mengirim PDF')
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

  // Filter by search
  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return sjHistory
    const q = searchQuery.toLowerCase().trim()
    return sjHistory.filter(entry => {
      const info = parseDocInfo(entry)
      return (
        entry.nomor?.toLowerCase().includes(q) ||
        entry.pihakKedua?.toLowerCase().includes(q) ||
        info.namaBarang?.toLowerCase().includes(q) ||
        entry.tanggal?.toLowerCase().includes(q)
      )
    })
  }, [sjHistory, searchQuery])

  return (
    <>
      <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50/60">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Riwayat Surat Jalan</h2>
            <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{sjHistory.length} data</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              onClick={handleBackup}
              variant="outline"
              size="sm"
              disabled={backupLoading === 'backup'}
              className="h-7 gap-1.5 text-xs"
            >
              {backupLoading === 'backup' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DatabaseBackup className="w-3.5 h-3.5" />}
              Backup
            </Button>
            <Button
              onClick={handleRestore}
              variant="outline"
              size="sm"
              disabled={backupLoading === 'restore'}
              className="h-7 gap-1.5 text-xs"
            >
              {backupLoading === 'restore' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Restore
            </Button>
          </div>
        </div>

        {/* Search */}
        {sjHistory.length > 0 && (
          <div className="px-4 py-2 border-b border-slate-100 bg-white/50">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari no. SJ, customer, barang..."
                className="w-full h-8 pl-8 pr-8 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400 placeholder:text-slate-400"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="px-4 py-6 text-center">
            <Loader2 className="w-6 h-6 mx-auto text-amber-500 animate-spin" />
            <p className="text-xs text-slate-400 mt-2">Memuat riwayat...</p>
          </div>
        ) : filteredHistory.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[600px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="text-left py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">No. SJ</th>
                  <th className="text-left py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">Tgl</th>
                  <th className="text-left py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">Penerima</th>
                  <th className="text-left py-3 px-3 text-slate-500 font-semibold whitespace-nowrap hidden sm:table-cell">Nama Barang</th>
                  <th className="text-right py-3 px-3 text-slate-500 font-semibold whitespace-nowrap hidden md:table-cell">Qty</th>
                  <th className="text-center py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.slice(0, 100).map((entry, idx) => {
                  const info = parseDocInfo(entry)
                  return (
                    <tr key={entry.id} className={`border-b border-slate-50 hover:bg-amber-50/30 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
                      <td className="py-3 px-3 text-amber-700 font-semibold whitespace-nowrap">{entry.nomor || '-'}</td>
                      <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{entry.tanggal ? formatTanggal(entry.tanggal) : entry.createdAt ? new Date(entry.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '-'}</td>
                      <td className="py-3 px-3 text-slate-700 font-medium max-w-[120px] truncate">{entry.pihakKedua || '-'}</td>
                      <td className="py-3 px-3 text-slate-600 hidden sm:table-cell max-w-[180px] truncate" title={info.namaBarang}>{info.namaBarang ? info.namaBarang.split('\n')[0] : '-'}</td>
                      <td className="py-3 px-3 text-slate-600 text-right whitespace-nowrap hidden md:table-cell">{info.totalQty > 0 ? info.totalQty.toLocaleString('id-ID') : '-'}</td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => { setPreviewItem(entry); setPreviewOpen(true) }}
                            className="inline-flex items-center justify-center w-7 h-7 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md border border-blue-200 transition-colors"
                            title="Preview"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(entry.id)}
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
        ) : (
          <div className="px-4 py-6 text-center">
            <History className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="text-xs text-slate-400">Belum ada riwayat surat jalan</p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus Surat Jalan?</DialogTitle>
            <DialogDescription>Data surat jalan yang dihapus tidak dapat dikembalikan.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)}>Batal</Button>
            <Button variant="destructive" size="sm" onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}>Hapus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Preview Surat Jalan</DialogTitle>
            <DialogDescription>Detail surat jalan</DialogDescription>
          </DialogHeader>
          {sjData && (
            <div className="flex flex-col items-center overflow-auto p-4" style={{ maxHeight: 'calc(90vh - 80px)' }}>
              <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top center' }}>
                <SuratJalanPreview data={sjData} />
              </div>
              <div className="flex gap-2 mt-4 print:hidden">
                <Button
                  onClick={handleSendPdf}
                  disabled={sendingPdf}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {sendingPdf ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Mengirim...</> : 'Kirim WhatsApp'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPreviewOpen(false)}>Tutup</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function SuratJalanPage() {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState<'editor' | 'riwayat'>('editor')
  const [sjCount, setSjCount] = useState(0)

  // Fetch surat jalan count for the badge
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const headers = getAuthHeaders()
        const res = await fetch('/api/history?docType=surat-jalan', { headers })
        if (res.ok) {
          const json = await res.json()
          setSjCount((json.data || []).length)
        }
      } catch {}
    }
    fetchCount()

    const handler = () => fetchCount()
    window.addEventListener('dokupro:history-updated', handler)
    return () => window.removeEventListener('dokupro:history-updated', handler)
  }, [])

  return (
    <DashboardLayout title="Surat Jalan" subtitle="Buat surat jalan dengan pratinjau langsung dan cetak A5">
      {/* Tab Navigation */}
      <div className="sticky top-0 z-20 -mx-4 px-4 bg-card flex items-center gap-2 mb-3">
        <button
          onClick={() => setActiveTab('editor')}
          className={`px-4 py-1.5 text-sm font-semibold rounded-lg border transition-colors ${
            activeTab === 'editor'
              ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
              : 'bg-card text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Editor
          </span>
        </button>
        <button
          onClick={() => setActiveTab('riwayat')}
          className={`px-4 py-1.5 text-sm font-semibold rounded-lg border transition-colors ${
            activeTab === 'riwayat'
              ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
              : 'bg-card text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" />
            Riwayat
          </span>
          {sjCount > 0 && (
            <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === 'riwayat' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{sjCount}</span>
          )}
        </button>
      </div>

      {/* Editor Tab Content */}
      {activeTab === 'editor' && (
        <Suspense fallback={null}>
          <SuratJalanEditor />
        </Suspense>
      )}

      {/* Riwayat Tab Content */}
      {activeTab === 'riwayat' && (
        <SuratJalanRiwayatTab />
      )}
    </DashboardLayout>
  )
}
