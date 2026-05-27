'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { useLanguage } from '@/contexts/language-context'
import { authFetch } from '@/lib/auth-fetch'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  ShoppingBag,
  Package,
  Trash2,
  Loader2,
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { formatRupiah } from '@/lib/format'
import { toast } from 'sonner'
import { fetcher } from '@/lib/fetcher'
import { getAuthHeaders } from '@/lib/auth'
import { notifyDataChange } from '@/lib/data-sync'
import { cn } from '@/lib/utils'
import type { CuttingResult } from '@/lib/cutting-engine'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

const CuttingDiagram = dynamic(
  () => import('@/components/cutting-results').then(m => ({ default: m.CuttingDiagram })),
  { ssr: false, loading: () => <div className="h-40 flex items-center justify-center text-xs text-slate-400">Memuat diagram...</div> }
)

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
    const pemasok = parsed.pemasok || {}
    const namaToko = pemasok.nama || entry.pihakKedua || ''
    const ppn = parsed.ppn || 0
    const statusPembayaran = parsed.statusPembayaran || 'belum-bayar'
    const catatan = parsed.catatan || ''
    const riwayatPotongKertasId = parsed.riwayatPotongKertasId || ''
    const referensi = parsed.referensi || ''

    const subtotal = items.reduce((sum: number, it: { qty: number; harga: number }) => sum + it.qty * it.harga, 0)
    const totalHarga = subtotal + (subtotal * ppn / 100)

    const totalQty = items.reduce((sum: number, it: { qty: number }) => sum + (it.qty || 0), 0)

    return { namaToko, totalQty, totalHarga, ppn, statusPembayaran, catatan, riwayatPotongKertasId, referensi }
  } catch {
    return { namaToko: '', totalQty: 0, totalHarga: 0, ppn: 0, statusPembayaran: 'belum-bayar', catatan: '', riwayatPotongKertasId: '', referensi: '' }
  }
}

export default function PembelianPage() {
  const { t } = useLanguage()
  const [poHistory, setPoHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Potong kertas preview data
  const [cuttingResult, setCuttingResult] = useState<CuttingResult | null>(null)
  const [pkInfo, setPkInfo] = useState<{
    namaCustomer: string
    paperName: string
    jumlahPesanan: string
    berapaMata: string
    setelanKertas: string
    grammage: string
    cutWidth: string
    cutHeight: string
    paperWidth: string
    paperHeight: string
    totalPrice: number
    pricePerSheet: number
    sheetsNeeded: string
  } | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  // Date filter
  const [filterType, setFilterType] = useState<FilterType>('month')
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined)
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined)

  // Custom date dialog
  const [showCustomDialog, setShowCustomDialog] = useState(false)
  const [customStartStr, setCustomStartStr] = useState('')
  const [customEndStr, setCustomEndStr] = useState('')

  const fetchPOHistory = useCallback(async () => {
    setLoading(true)
    try {
      const { startDate, endDate } = getFilterDates(filterType, customStartDate, customEndDate)
      const res = await authFetch(`/api/history?docType=purchase-order&startDate=${startDate}&endDate=${endDate}`)
      if (res.ok) {
        const json = await res.json()
        setPoHistory(json.data || [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [filterType, customStartDate, customEndDate])

  useEffect(() => {
    fetchPOHistory()
  }, [fetchPOHistory])

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
        toast.success('Pembelian berhasil dihapus')
        notifyDataChange('purchase-order')
        fetchPOHistory()
      } else {
        toast.error('Gagal menghapus pembelian')
      }
    } catch {
      toast.error('Gagal menghapus pembelian')
    }
    setDeleteConfirmId(null)
    setPreviewId(null)
  }

  // Fetch potong kertas data when PO is clicked
  const handlePOClick = useCallback(async (poEntry: HistoryEntry) => {
    const info = parseDocInfo(poEntry)
    setPreviewId(poEntry.id)
    setCuttingResult(null)
    setPkInfo(null)
    setLoadingPreview(true)

    if (info.riwayatPotongKertasId) {
      try {
        const res = await fetcher(`/api/riwayat-potong-kertas/${info.riwayatPotongKertasId}`, {
          headers: getAuthHeaders(),
        })
        if (res.ok) {
          const riwayat = await res.json()

          // Set potong kertas info
          setPkInfo({
            namaCustomer: riwayat.namaCustomer || '',
            paperName: riwayat.paperName || '',
            jumlahPesanan: riwayat.jumlahPesanan || '',
            berapaMata: riwayat.berapaMata || '',
            setelanKertas: riwayat.setelanKertas || '',
            grammage: riwayat.grammage || '',
            cutWidth: riwayat.cutWidth || '',
            cutHeight: riwayat.cutHeight || '',
            paperWidth: riwayat.paperWidth || '',
            paperHeight: riwayat.paperHeight || '',
            totalPrice: riwayat.totalPrice || 0,
            pricePerSheet: riwayat.pricePerSheet || 0,
            sheetsNeeded: riwayat.sheetsNeeded || '',
          })

          // Parse resultData
          if (riwayat.resultData) {
            try {
              const parsed = JSON.parse(riwayat.resultData)
              setCuttingResult(parsed)
            } catch {}
          }

          // If no resultData, try to recalculate
          if (!riwayat.resultData) {
            const pw = parseFloat(riwayat.paperWidth)
            const ph = parseFloat(riwayat.paperHeight)
            const cw = parseFloat(riwayat.cutWidth)
            const ch = parseFloat(riwayat.cutHeight)
            const qty = parseInt(riwayat.quantity) || 0
            const setelan = parseInt(riwayat.setelanKertas) || 0
            const price = parseFloat(riwayat.pricePerSheet) || 0

            if (pw && ph && cw && ch) {
              try {
                const { calculateCuts } = await import('@/lib/cutting-engine')
                const result = calculateCuts({
                  paperWidth: pw, paperHeight: ph, cutWidth: cw, cutHeight: ch,
                  quantity: qty + setelan, pricePerSheet: price, optimizationMode: 'maximal',
                  customerName: riwayat.namaCustomer || '',
                  paperMaterial: riwayat.paperName || '',
                  grammage: parseFloat(riwayat.grammage) || 0,
                })
                setCuttingResult(result)
              } catch {}
            }
          }
        }
      } catch {
        // If fetch fails, just show PO info without cutting preview
      }
    }

    setLoadingPreview(false)
  }, [])

  // Calculate totals
  const totalPembelian = poHistory.reduce((sum, po) => {
    const info = parseDocInfo(po)
    return sum + (info.totalHarga || 0)
  }, 0)


  const filterButtons: { type: FilterType; label: string }[] = [
    { type: 'today', label: 'Hari Ini' },
    { type: 'week', label: 'Minggu Ini' },
    { type: 'month', label: 'Bulan Ini' },
    { type: 'custom', label: 'Custom' },
  ]

  // Find the selected PO entry for the preview popup
  const selectedPO = previewId ? poHistory.find(p => p.id === previewId) : null
  const selectedPOInfo = selectedPO ? parseDocInfo(selectedPO) : null

  return (
    <DashboardLayout title="Pembelian Barang" subtitle={t('subtitle_pembelian')}>
      <div className="space-y-4 sm:space-y-6 pb-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 sm:p-4">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mb-2">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-500 mb-0.5">Total Pembelian</p>
            <p className="text-base sm:text-lg font-bold text-blue-700 leading-tight">{poHistory.length}</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 sm:p-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2">
              <Package className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-500 mb-0.5">Nilai Pembelian</p>
            <p className="text-base sm:text-lg font-bold text-emerald-700 leading-tight">{formatRupiahShort(totalPembelian)}</p>
          </div>
        </div>

        {/* Filter */}
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
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-800'
              )}
            >
              {btn.label}
            </Button>
          ))}
        </div>

        {/* PO List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : poHistory.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-12 text-center">
            <Package className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-3 text-sm text-slate-400 font-medium">Belum ada data pembelian</p>
            <p className="text-xs text-slate-300 mt-1">Data purchase order akan muncul di sini</p>
          </div>
        ) : (
          <div className="space-y-3">
            {poHistory.map(po => {
              const info = parseDocInfo(po)
              return (
                <Card key={po.id} className="overflow-hidden border-slate-200 hover:border-slate-300 transition-colors cursor-pointer" onClick={() => handlePOClick(po)}>
                  <CardContent className="p-0">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
                        <ShoppingBag className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-800 truncate">{po.nomor}</p>
                          <span className={cn(
                            'inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0',
                            info.statusPembayaran === 'lunas'
                              ? 'bg-emerald-100 text-emerald-700'
                              : info.statusPembayaran === 'dp'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-red-100 text-red-700'
                          )}>
                            {info.statusPembayaran === 'lunas' ? 'LUNAS' : info.statusPembayaran === 'dp' ? 'DP' : 'BELUM BAYAR'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-slate-500 truncate">{po.pihakKedua}</p>
                          {po.tanggal && (
                            <>
                              <span className="text-slate-300">·</span>
                              <p className="text-[11px] text-slate-400 shrink-0">{formatDateShort(po.tanggal)}</p>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0 mr-1">
                        <p className="text-sm font-bold text-emerald-700">{info.totalHarga > 0 ? formatRupiahShort(info.totalHarga) : po.total}</p>
                        <p className="text-[10px] text-slate-400">{info.totalQty > 0 ? `${info.totalQty} item` : ''}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* Preview Popup - Potong Kertas Style */}
        <Dialog open={!!previewId} onOpenChange={() => { setPreviewId(null); setCuttingResult(null); setPkInfo(null) }}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            {selectedPO && selectedPOInfo ? (
              <>
                <DialogHeader className="pb-0">
                  <DialogTitle className="sr-only">Preview Potong Kertas</DialogTitle>
                  <DialogDescription className="sr-only">Preview hasil potong kertas dari PO</DialogDescription>
                </DialogHeader>

                {loadingPreview ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    <span className="ml-2 text-sm text-slate-500">Memuat data...</span>
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
                    {/* Header: Nama Toko (big) + PO Number (big) */}
                    <div className="px-4 pt-4 pb-3 border-b-2 border-slate-800">
                      <div className="flex items-start justify-between">
                        <p className="text-xl font-bold text-slate-800 leading-tight">{selectedPOInfo.namaToko || '-'}</p>
                        <div className="text-right shrink-0 ml-3">
                          <p className="text-xl font-bold text-slate-800 leading-tight">{selectedPO.nomor}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{selectedPO.tanggal ? formatDateShort(selectedPO.tanggal) : ''}</p>
                        </div>
                      </div>
                      {/* Status Pembayaran */}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[11px] text-slate-500 font-medium">Status Pembayaran</span>
                        <span className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold',
                          selectedPOInfo.statusPembayaran === 'lunas'
                            ? 'bg-emerald-100 text-emerald-700'
                            : selectedPOInfo.statusPembayaran === 'dp'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-red-100 text-red-700'
                        )}>
                          {selectedPOInfo.statusPembayaran === 'lunas' ? 'LUNAS' : selectedPOInfo.statusPembayaran === 'dp' ? 'DP' : 'BELUM BAYAR'}
                        </span>
                      </div>
                    </div>

                    {cuttingResult && pkInfo ? (
                      <>
                        {/* Cutting Diagram */}
                        <div className="px-4 pt-3">
                          <CuttingDiagram results={cuttingResult} maxHeight="40vh" />
                        </div>

                        {/* Calculation Summary */}
                        <div className="px-4 py-3 space-y-2">
                          {/* Referensi / Nama Cetakan */}
                          {selectedPOInfo.referensi && (
                            <div className="flex items-baseline gap-2">
                              <span className="text-[11px] text-slate-400 shrink-0 w-28">Nama Cetakan</span>
                              <span className="text-xs text-slate-700 font-medium">{selectedPOInfo.referensi}</span>
                            </div>
                          )}
                          {/* Customer / Toko */}
                          {pkInfo.namaCustomer && (
                            <div className="flex items-baseline gap-2">
                              <span className="text-[11px] text-slate-400 shrink-0 w-28">Customer</span>
                              <span className="text-xs text-slate-700">{pkInfo.namaCustomer}</span>
                            </div>
                          )}
                          {/* Paper Name */}
                          {pkInfo.paperName && (
                            <div className="flex items-baseline gap-2">
                              <span className="text-[11px] text-slate-400 shrink-0 w-28">Nama Bahan</span>
                              <span className="text-xs text-slate-700">{pkInfo.paperName}</span>
                            </div>
                          )}
                          {/* Gramatur */}
                          {pkInfo.grammage && pkInfo.grammage !== '0' && (
                            <div className="flex items-baseline gap-2">
                              <span className="text-[11px] text-slate-400 shrink-0 w-28">Gramatur</span>
                              <span className="text-xs text-slate-700">{pkInfo.grammage}g</span>
                            </div>
                          )}
                          {/* Ukuran Bahan */}
                          {pkInfo.paperWidth && pkInfo.paperHeight && pkInfo.paperWidth !== '0' && (
                            <div className="flex items-baseline gap-2">
                              <span className="text-[11px] text-slate-400 shrink-0 w-28">Ukuran Bahan</span>
                              <span className="text-xs text-slate-700">{pkInfo.paperWidth}×{pkInfo.paperHeight} cm</span>
                            </div>
                          )}
                          {/* Ukuran Potong */}
                          {pkInfo.cutWidth && pkInfo.cutHeight && pkInfo.cutWidth !== '0' && (
                            <div className="flex items-baseline gap-2">
                              <span className="text-[11px] text-slate-400 shrink-0 w-28">Ukuran Potong</span>
                              <span className="text-xs text-slate-700">{pkInfo.cutWidth}×{pkInfo.cutHeight} cm</span>
                            </div>
                          )}
                          {/* Potongan per Lembar */}
                          {cuttingResult.totalPieces > 0 && (
                            <div className="flex items-baseline gap-2">
                              <span className="text-[11px] text-slate-400 shrink-0 w-28">Potongan/Lembar</span>
                              <span className="text-xs text-slate-700 font-medium">{cuttingResult.totalPieces} pcs</span>
                            </div>
                          )}
                          {/* Jumlah Pesanan */}
                          {pkInfo.jumlahPesanan && (
                            <div className="flex items-baseline gap-2">
                              <span className="text-[11px] text-slate-400 shrink-0 w-28">Jumlah Pesanan</span>
                              <span className="text-xs text-slate-700">{pkInfo.jumlahPesanan} pcs</span>
                            </div>
                          )}
                          {/* Jumlah Kertas */}
                          {(cuttingResult.sheetsNeeded > 0 || pkInfo.sheetsNeeded) && (
                            <div className="flex items-baseline gap-2">
                              <span className="text-[11px] text-slate-400 shrink-0 w-28">Jumlah Kertas</span>
                              <span className="text-xs text-slate-700">{(cuttingResult.sheetsNeeded || parseInt(pkInfo.sheetsNeeded) || 0).toLocaleString('id-ID')} lembar</span>
                            </div>
                          )}
                          {/* Harga per Lembar */}
                          {(cuttingResult.pricePerSheet > 0 || pkInfo.pricePerSheet > 0) && (
                            <div className="flex items-baseline gap-2">
                              <span className="text-[11px] text-slate-400 shrink-0 w-28">Harga/Lembar</span>
                              <span className="text-xs text-slate-700">{formatRupiah(cuttingResult.pricePerSheet || pkInfo.pricePerSheet)}</span>
                            </div>
                          )}
                          {/* Total Harga */}
                          {(cuttingResult.totalPrice > 0 || pkInfo.totalPrice > 0) && (
                            <div className="flex items-baseline gap-2">
                              <span className="text-[11px] text-slate-400 shrink-0 w-28">Total Harga Kertas</span>
                              <span className="text-xs font-semibold text-emerald-700">{formatRupiah(cuttingResult.totalPrice || pkInfo.totalPrice)}</span>
                            </div>
                          )}
                          {/* Efficiency */}
                          {cuttingResult.efficiency > 0 && (
                            <div className="flex items-baseline gap-2">
                              <span className="text-[11px] text-slate-400 shrink-0 w-28">Efisiensi</span>
                              <span className={cn(
                                'text-xs font-semibold',
                                cuttingResult.efficiency >= 80 ? 'text-emerald-600' : cuttingResult.efficiency >= 60 ? 'text-amber-600' : 'text-red-600'
                              )}>{cuttingResult.efficiency.toFixed(1)}%</span>
                            </div>
                          )}
                          {/* Strategy */}
                          {cuttingResult.strategy && (
                            <div className="flex items-baseline gap-2">
                              <span className="text-[11px] text-slate-400 shrink-0 w-28">Strategi</span>
                              <span className="text-xs text-slate-700">{cuttingResult.strategy}</span>
                            </div>
                          )}
                        </div>

                        {/* Steps */}
                        {cuttingResult.steps && cuttingResult.steps.length > 0 && (
                          <div className="px-4 pb-3">
                            <p className="text-[11px] text-slate-400 font-medium mb-1.5">Langkah Potong</p>
                            <div className="space-y-1">
                              {cuttingResult.steps.map((step, idx) => (
                                <div key={idx} className="flex items-start gap-2">
                                  <div className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-500 text-white flex items-center justify-center text-[8px] font-bold mt-0.5">{idx + 1}</div>
                                  <span className="text-[11px] text-slate-600 leading-relaxed">{step}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* PPN + Total */}
                        {selectedPOInfo.ppn > 0 && (
                          <div className="border-t border-slate-200 px-4 py-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-500">PPN ({selectedPOInfo.ppn}%)</span>
                              <span className="text-slate-600">
                                {formatRupiahShort((cuttingResult.totalPrice || pkInfo.totalPrice) * selectedPOInfo.ppn / 100)}
                              </span>
                            </div>
                          </div>
                        )}
                        <div className="border-t-2 border-slate-800 px-4 py-2">
                          <div className="flex items-center justify-between text-sm font-bold">
                            <span className="text-slate-800">Grand Total</span>
                            <span className="text-slate-800">{formatRupiahShort(selectedPOInfo.totalHarga)}</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      /* Fallback: Show PO info without cutting diagram */
                      <div className="px-4 py-6 text-center">
                        <Package className="mx-auto h-10 w-10 text-slate-300 mb-2" />
                        <p className="text-sm text-slate-500">Preview potong kertas tidak tersedia</p>
                        <p className="text-xs text-slate-400 mt-1">PO ini tidak terhubung dengan data potong kertas</p>
                      </div>
                    )}

                    {/* Catatan */}
                    {selectedPOInfo.catatan && (
                      <div className="border-t border-slate-100 px-4 py-2 bg-slate-50">
                        <p className="text-[11px] text-slate-400 font-medium mb-0.5">Catatan</p>
                        <p className="text-xs text-slate-600">{selectedPOInfo.catatan}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 mt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs px-3 text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200"
                    onClick={() => setDeleteConfirmId(selectedPO.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Hapus
                  </Button>
                  <div className="flex-1" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs px-4"
                    onClick={() => { setPreviewId(null); setCuttingResult(null); setPkInfo(null) }}
                  >
                    Tutup
                  </Button>
                </div>
              </>
            ) : null}
          </DialogContent>
        </Dialog>

        {/* Custom Date Dialog */}
        <Dialog open={showCustomDialog} onOpenChange={setShowCustomDialog}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Pilih Tanggal</DialogTitle>
              <DialogDescription>
                Pilih rentang tanggal pembelian yang ingin dilihat
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 pt-1">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Dari Tanggal</label>
                <input
                  type="date"
                  value={customStartStr}
                  onChange={e => setCustomStartStr(e.target.value)}
                  className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Sampai Tanggal</label>
                <input
                  type="date"
                  value={customEndStr}
                  onChange={e => setCustomEndStr(e.target.value)}
                  className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <Button variant="outline" size="sm" onClick={() => setShowCustomDialog(false)} className="text-xs">
                Batal
              </Button>
              <Button
                size="sm"
                onClick={applyCustomFilter}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
                disabled={!customStartStr || !customEndStr}
              >
                Terapkan
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Hapus Pembelian?</DialogTitle>
              <DialogDescription>
                Data pembelian ini akan dihapus secara permanen dan tidak dapat dikembalikan.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)} className="text-xs">
                Batal
              </Button>
              <Button
                size="sm"
                onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
                className="text-xs bg-red-500 hover:bg-red-600 text-white"
              >
                Hapus
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}
