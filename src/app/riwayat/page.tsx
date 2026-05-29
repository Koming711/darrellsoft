'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Search, Eye, Loader2, Receipt } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { MobileTable } from '@/components/mobile-table'
import { useLanguage } from '@/contexts/language-context'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { getAuthHeaders } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'
import { InvoicePreview } from '@/components/dokupro/invoice-preview'
import type { InvoiceData, CompanyInfo } from '@/lib/types'
import { DEFAULT_COMPANY } from '@/lib/types'

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
    }
  } catch {
    return { namaBarang: '', hargaSatuan: 0, totalQty: 0, totalHarga: 0, referensi: '', items: [], ppn: 0, catatan: '', client: { nama: '', kontak: '', alamat: '' } }
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
      catatan: parsed.catatan || '',
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
      catatan: '',
    }
  }
}

function formatRp(n: number) {
  return `Rp ${n.toLocaleString('id-ID')}`
}

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return d }
}

export default function RiwayatPage() {
  const { t } = useLanguage()
  const [searchTerm, setSearchTerm] = useState('')
  const [histories, setHistories] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewItem, setPreviewItem] = useState<HistoryEntry | null>(null)
  const previewWrapperRef = useRef<HTMLDivElement>(null)
  const [previewScale, setPreviewScale] = useState(1)

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/history?docType=invoice', { headers: getAuthHeaders() })
      if (res.ok) {
        const json = await res.json()
        setHistories(json.data || [])
      }
    } catch {
      toast.error('Gagal memuat riwayat invoice')
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

  const handlePreview = (item: HistoryEntry) => {
    setPreviewItem(item)
    setPreviewOpen(true)
  }

  const invoiceData = useMemo(() => {
    if (!previewItem) return null
    return parseInvoiceData(previewItem)
  }, [previewItem])

  // Scale preview to fit container — consider both width AND height
  useEffect(() => {
    const updateScale = () => {
      if (!previewWrapperRef.current) return
      const style = getComputedStyle(previewWrapperRef.current)
      const paddingLeft = parseFloat(style.paddingLeft) || 0
      const paddingRight = parseFloat(style.paddingRight) || 0
      const paddingBottom = parseFloat(style.paddingBottom) || 0
      const availableWidth = previewWrapperRef.current.clientWidth - paddingLeft - paddingRight
      // Use wrapper's actual available height when possible, fallback to viewport
      const wrapperHeight = previewWrapperRef.current.clientHeight - paddingBottom
      const viewportHeight = window.innerHeight
      // On mobile: dialog chrome (close btn, border, margin) takes ~160px
      // Use the smaller of wrapper height or viewport minus chrome
      const isMobile = viewportHeight < 768
      const chromeBuffer = isMobile ? 160 : 120
      const availableHeight = Math.min(wrapperHeight || 9999, viewportHeight - chromeBuffer)
      const designWidth = 576
      const designHeight = designWidth * (210 / 148) // A5 ratio ≈ 817px
      const scaleByWidth = availableWidth / designWidth
      const scaleByHeight = availableHeight / designHeight
      // Use the smaller scale so the preview fits BOTH width and height
      const scale = Math.min(scaleByWidth, scaleByHeight, 1)
      setPreviewScale(scale)
    }
    if (previewOpen) {
      const timer = setTimeout(updateScale, 100)
      window.addEventListener('resize', updateScale)
      return () => {
        clearTimeout(timer)
        window.removeEventListener('resize', updateScale)
      }
    }
  }, [previewOpen])

  const filteredHistories = histories.filter(h => {
    const term = searchTerm.toLowerCase()
    const info = parseDocInfo(h)
    return (
      (h.nomor || '').toLowerCase().includes(term) ||
      (h.pihakKedua || '').toLowerCase().includes(term) ||
      (info.namaBarang || '').toLowerCase().includes(term) ||
      (info.client.nama || '').toLowerCase().includes(term)
    )
  })

  const columns = [
    {
      key: 'nomor',
      title: 'No. Invoice',
      render: (h: HistoryEntry) => (
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-violet-600 flex-shrink-0" />
          <span className="font-semibold text-slate-800 whitespace-nowrap">{h.nomor}</span>
        </div>
      )
    },
    {
      key: 'tanggal',
      title: 'Tanggal',
      render: (h: HistoryEntry) => (
        <span className="text-slate-500 whitespace-nowrap">{h.tanggal ? formatDate(h.tanggal) : formatDate(h.createdAt)}</span>
      )
    },
    {
      key: 'pihakKedua',
      title: 'Customer',
      render: (h: HistoryEntry) => (
        <span className="text-slate-700 truncate max-w-[150px] block">{h.pihakKedua || '-'}</span>
      )
    },
    {
      key: 'namaBarang',
      title: 'Nama Barang',
      render: (h: HistoryEntry) => {
        const info = parseDocInfo(h)
        return <span className="text-slate-600 truncate max-w-[180px] block">{info.namaBarang || '-'}</span>
      }
    },
    {
      key: 'totalQty',
      title: 'Qty',
      render: (h: HistoryEntry) => {
        const info = parseDocInfo(h)
        return <span className="text-slate-700 text-right">{info.totalQty > 0 ? info.totalQty.toLocaleString('id-ID') : '-'}</span>
      }
    },
    {
      key: 'hargaSatuan',
      title: 'Harga Satuan',
      render: (h: HistoryEntry) => {
        const info = parseDocInfo(h)
        return <span className="text-slate-700 text-right">{info.hargaSatuan > 0 ? formatRp(info.hargaSatuan) : '-'}</span>
      }
    },
    {
      key: 'totalHarga',
      title: 'Total Harga',
      render: (h: HistoryEntry) => {
        const info = parseDocInfo(h)
        return <span className="font-bold text-emerald-700 text-right whitespace-nowrap">{info.totalHarga > 0 ? formatRp(info.totalHarga) : '-'}</span>
      }
    },
  ]

  return (
    <DashboardLayout title="Riwayat Penjualan" subtitle="Daftar riwayat invoice penjualan">
      <div className="space-y-4 lg:space-y-6">
        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 lg:p-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            <div className="flex flex-col lg:flex-row gap-4 w-full lg:flex-1">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" placeholder="Cari invoice..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
            </div>
            <div className="text-xs text-slate-400">{filteredHistories.length} invoice</div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 lg:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-violet-600 mr-2" />
              <span className="text-sm text-slate-500">Memuat riwayat invoice...</span>
            </div>
          ) : (
            <MobileTable
              data={filteredHistories}
              columns={columns}
              keyField="id"
              showAsButtons={true}
              emptyMessage="Belum ada riwayat invoice"
              emptyIcon={<Receipt className="w-12 h-12 mx-auto text-slate-400" />}
              extraActions={(item: HistoryEntry) => (
                <button onClick={() => handlePreview(item)} title="Preview"
                  className="p-1.5 rounded-lg bg-violet-100 hover:bg-violet-200 text-violet-700 transition-colors">
                  <Eye className="w-3.5 h-3.5" />
                </button>
              )}
              mobileCardActions={(item: HistoryEntry) => (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                  <button onClick={() => handlePreview(item)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium transition-colors">
                    <Eye className="w-3.5 h-3.5" /> Preview
                  </button>
                </div>
              )}
            />
          )}
        </div>
      </div>

      {/* ===== PREVIEW DIALOG — Invoice Pratinjau ===== */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          className="sm:max-w-[620px] lg:max-w-[640px] w-[calc(100%-0.5rem)] sm:w-full max-h-[90vh] sm:max-h-[96vh] overflow-hidden sm:overflow-y-auto p-0 gap-0"
          aria-label="Pratinjau Invoice"
        >
          {/* sr-only title for accessibility, no visible header */}
          <DialogTitle className="sr-only">Pratinjau Invoice</DialogTitle>

          {invoiceData && (
            <div className="px-1 pb-1 sm:px-3 lg:px-4" ref={previewWrapperRef} id="document-preview">
              {/* Outer container: matches the scaled dimensions so no layout overflow */}
              <div style={{
                width: previewScale < 1 ? `${576 * previewScale}px` : 576,
                height: previewScale < 1 ? `${576 * (210 / 148) * previewScale}px` : undefined,
                overflow: 'hidden',
                margin: '0 auto',
              }}>
                {/* Inner container: renders at full 576px design width, then scaled down */}
                <div style={{
                  width: 576,
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'top left',
                }}>
                  <div className="a5-preview-container bg-white" style={{ aspectRatio: '148 / 210', maxWidth: 576 }}>
                    <div className="a5-preview-scaler">
                      <InvoicePreview data={invoiceData} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
