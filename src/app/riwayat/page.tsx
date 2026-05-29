'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Eye, Loader2, FileText, Receipt } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { MobileTable } from '@/components/mobile-table'
import { useLanguage } from '@/contexts/language-context'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { getAuthHeaders } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'

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

      {/* ===== PREVIEW DIALOG ===== */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-violet-600" />
              Detail Invoice
            </DialogTitle>
          </DialogHeader>

          {previewItem && (() => {
            const info = parseDocInfo(previewItem)
            return (
              <div className="p-4 bg-white space-y-3">
                {/* Header */}
                <div className="text-center pb-3 border-b-2 border-slate-200">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Receipt className="w-5 h-5 text-violet-600" />
                    <h1 className="text-lg font-bold text-slate-900">Invoice</h1>
                  </div>
                  <p className="text-sm font-semibold text-violet-700">{previewItem.nomor}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {previewItem.tanggal ? formatDate(previewItem.tanggal) : formatDate(previewItem.createdAt)}
                  </p>
                </div>

                {/* Client Info */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-[10px] text-slate-500 font-medium mb-1">Customer</p>
                  <p className="text-sm font-bold text-slate-800">{previewItem.pihakKedua || info.client.nama || '-'}</p>
                  {info.client.alamat && <p className="text-xs text-slate-500">{info.client.alamat}</p>}
                  {info.client.kontak && <p className="text-xs text-slate-500">{info.client.kontak}</p>}
                </div>

                {/* Items Table */}
                {info.items.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Item</p>
                    <div className="rounded-lg border border-slate-200 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left py-2 px-2 font-semibold text-slate-600">Deskripsi</th>
                            <th className="text-right py-2 px-2 font-semibold text-slate-600 w-12">Qty</th>
                            <th className="text-right py-2 px-2 font-semibold text-slate-600 w-24">Harga</th>
                            <th className="text-right py-2 px-2 font-semibold text-slate-600 w-28">Jumlah</th>
                          </tr>
                        </thead>
                        <tbody>
                          {info.items.map((it, i) => (
                            <tr key={i} className="border-b border-slate-100">
                              <td className="py-2 px-2 text-slate-700">{it.deskripsi || '-'}</td>
                              <td className="py-2 px-2 text-slate-600 text-right">{it.qty} {it.satuan || ''}</td>
                              <td className="py-2 px-2 text-slate-600 text-right">{formatRp(it.harga)}</td>
                              <td className="py-2 px-2 text-slate-700 text-right font-medium">{formatRp(it.qty * it.harga)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Totals */}
                <div className="bg-slate-900 text-white rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-slate-400">Total Harga</p>
                    {info.ppn > 0 && <p className="text-[9px] text-slate-500">termasuk PPN {info.ppn}%</p>}
                  </div>
                  <p className="text-xl font-extrabold text-emerald-400">{formatRp(info.totalHarga)}</p>
                </div>

                {/* Catatan */}
                {info.catatan && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-[10px] text-amber-600 font-medium mb-0.5">Catatan</p>
                    <p className="text-xs text-amber-800">{info.catatan}</p>
                  </div>
                )}
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
