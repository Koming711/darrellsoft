'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { useLanguage } from '@/contexts/language-context'
import { authFetch } from '@/lib/auth-fetch'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  ShoppingBag,
  Package,
  CalendarIcon,
  Filter,
  ChevronDown,
  ChevronUp,
  Eye,
  Trash2,
  Clock,
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { formatRupiah, formatTanggal } from '@/lib/format'
import { toast } from 'sonner'
import { fetcher } from '@/lib/fetcher'
import { getAuthHeaders } from '@/lib/auth'
import { notifyDataChange } from '@/lib/data-sync'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

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
    const firstItem = items[0]
    const namaBarang = firstItem?.deskripsi || ''
    const hargaSatuan = firstItem?.harga || 0
    const totalQty = items.reduce((sum: number, it: { qty: number }) => sum + (it.qty || 0), 0)
    const subtotal = items.reduce((sum: number, it: { qty: number; harga: number }) => sum + it.qty * it.harga, 0)
    const ppn = parsed.ppn || 0
    const totalHarga = subtotal + (subtotal * ppn / 100)
    // Collect all item names
    const allItems = items.map((it: { deskripsi: string; qty: number; harga: number }) => ({
      deskripsi: it.deskripsi || '',
      qty: it.qty || 0,
      harga: it.harga || 0,
    }))
    return { namaBarang, hargaSatuan, totalQty, totalHarga, allItems, ppn }
  } catch {
    return { namaBarang: '', hargaSatuan: 0, totalQty: 0, totalHarga: 0, allItems: [] as { deskripsi: string; qty: number; harga: number }[], ppn: 0 }
  }
}

export default function PembelianPage() {
  const { t } = useLanguage()
  const [poHistory, setPoHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Date filter
  const [filterType, setFilterType] = useState<FilterType>('month')
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined)
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined)

  // Custom date inputs (simple approach)
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
      // Validate custom dates
      if (customStartStr && customEndStr) {
        setCustomStartDate(new Date(customStartStr))
        setCustomEndDate(new Date(customEndStr))
        setFilterType('custom')
      } else {
        toast.error('Pilih tanggal mulai dan tanggal akhir')
      }
    } else {
      setFilterType(type)
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
  }

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id)
  }

  // Calculate totals
  const totalPembelian = poHistory.reduce((sum, po) => {
    const info = parseDocInfo(po)
    return sum + (info.totalHarga || 0)
  }, 0)

  const totalItems = poHistory.reduce((sum, po) => {
    const info = parseDocInfo(po)
    return sum + info.totalQty
  }, 0)

  const filterButtons: { type: FilterType; label: string }[] = [
    { type: 'today', label: 'Hari Ini' },
    { type: 'week', label: 'Minggu Ini' },
    { type: 'month', label: 'Bulan Ini' },
    { type: 'custom', label: 'Custom' },
  ]

  return (
    <DashboardLayout title={t('pembelian')} subtitle={t('subtitle_pembelian')}>
      <div className="space-y-4 sm:space-y-6 pb-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
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
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 sm:p-4">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center mb-2">
              <Package className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-500 mb-0.5">Total Item</p>
            <p className="text-base sm:text-lg font-bold text-amber-700 leading-tight">{totalItems.toLocaleString('id-ID')}</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 mr-1">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-medium text-slate-500">Periode:</span>
          </div>
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
              {btn.type === 'custom' && <CalendarIcon className="w-3.5 h-3.5 mr-1" />}
              {btn.label}
            </Button>
          ))}
          {filterType === 'custom' && (
            <div className="flex items-center gap-2 ml-1">
              <input
                type="date"
                value={customStartStr}
                onChange={e => setCustomStartStr(e.target.value)}
                className="h-8 border border-slate-200 rounded-lg px-2 text-xs text-slate-600 focus:outline-none focus:ring-1.5 focus:ring-blue-500"
              />
              <span className="text-xs text-slate-400">—</span>
              <input
                type="date"
                value={customEndStr}
                onChange={e => setCustomEndStr(e.target.value)}
                className="h-8 border border-slate-200 rounded-lg px-2 text-xs text-slate-600 focus:outline-none focus:ring-1.5 focus:ring-blue-500"
              />
              <Button
                size="sm"
                onClick={() => handleFilterChange('custom')}
                className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                disabled={!customStartStr || !customEndStr}
              >
                Terapkan
              </Button>
            </div>
          )}
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
              const isExpanded = expandedId === po.id
              return (
                <Card key={po.id} className="overflow-hidden border-slate-200 hover:border-slate-300 transition-colors">
                  <CardContent className="p-0">
                    {/* Main Row */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50/50 transition-colors"
                      onClick={() => toggleExpand(po.id)}
                    >
                      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
                        <ShoppingBag className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-800 truncate">{po.nomor}</p>
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
                      <div className="shrink-0 text-slate-300">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>

                    {/* Expanded Detail */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3">
                        {/* Items as Rows */}
                        {info.allItems.length > 0 && (
                          <div className="space-y-2 mb-3">
                            {info.allItems.map((item, idx) => (
                              <div key={idx} className="bg-white rounded-lg border border-slate-150 p-3 shadow-sm">
                                <div className="flex items-start gap-2.5">
                                  <span className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center text-[11px] font-semibold shrink-0 mt-0.5">
                                    {idx + 1}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-800 leading-snug">{item.deskripsi || '-'}</p>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-slate-400 uppercase tracking-wide">Qty</span>
                                        <span className="text-xs font-medium text-slate-600">{item.qty.toLocaleString('id-ID')} pcs</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-slate-400 uppercase tracking-wide">Harga</span>
                                        <span className="text-xs font-medium text-slate-600">{item.harga > 0 ? formatRupiah(item.harga) : '-'}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-slate-400 uppercase tracking-wide">Jumlah</span>
                                        <span className="text-xs font-semibold text-emerald-700">{item.harga > 0 ? formatRupiah(item.qty * item.harga) : '-'}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* PPN & Total */}
                        <div className="bg-white rounded-lg border border-slate-150 p-3 shadow-sm space-y-2">
                          {info.ppn > 0 && (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-500">PPN ({info.ppn}%)</span>
                              <span className="text-slate-600">
                                {formatRupiahShort(info.allItems.reduce((s, it) => s + it.qty * it.harga, 0) * info.ppn / 100)}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-sm font-bold">
                            <span className="text-slate-700">Total</span>
                            <span className="text-emerald-700">{formatRupiahShort(info.totalHarga)}</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-200">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] px-2.5 text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200"
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeleteConfirmId(po.id)
                            }}
                          >
                            <Trash2 className="w-3 h-3 mr-1" /> Hapus
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

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
