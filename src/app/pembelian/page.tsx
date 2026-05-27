'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { useLanguage } from '@/contexts/language-context'
import { authFetch } from '@/lib/auth-fetch'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  ShoppingBag,
  Package,
  ChevronDown,
  ChevronUp,
  Trash2,
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { formatRupiah } from '@/lib/format'
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

interface ParsedItem {
  namaToko: string
  namaBarang: string
  namaBahan: string
  gramatur: string
  ukuranBahan: string
  ukuranPotong: string
  hargaPerLembar: number
  jumlahPesanan: string
  jumlahKertas: number
  totalHargaKertas: number
}

function parseDeskripsiLines(deskripsi: string): { namaBarang: string; namaBahan: string; gramatur: string; ukuranBahan: string; ukuranPotong: string; jumlahPesanan: string } {
  const lines = deskripsi.split('\n').map(l => l.trim()).filter(Boolean)
  let namaBarang = ''
  let namaBahan = ''
  let gramatur = ''
  let ukuranBahan = ''
  let ukuranPotong = ''
  let jumlahPesanan = ''

  if (lines.length > 0) {
    namaBarang = lines[0]
  }

  // Line 2: "PaperName 150g 65x100" → nama bahan, gramatur, ukuran bahan
  if (lines.length > 1) {
    const bahanLine = lines[1]
    // Try to extract grammatur (e.g. "150g")
    const gramMatch = bahanLine.match(/(\d+(?:\.\d+)?)g/)
    if (gramMatch) gramatur = gramMatch[1] + 'g'
    // Try to extract ukuran bahan (e.g. "65x100" or "65×100")
    const ukuranMatch = bahanLine.match(/(\d+(?:\.\d+)?)[x×](\d+(?:\.\d+)?)/)
    if (ukuranMatch) ukuranBahan = ukuranMatch[1] + '×' + ukuranMatch[2]
    // Nama bahan = everything before grammatur/ukuran
    let bahanName = bahanLine
    if (gramMatch) bahanName = bahanName.replace(gramMatch[0], '').trim()
    if (ukuranMatch) bahanName = bahanName.replace(ukuranMatch[0], '').trim()
    bahanName = bahanName.replace(/\s+/g, ' ').trim()
    if (bahanName) namaBahan = bahanName
  }

  // Find "Uk. potong" line
  for (const line of lines) {
    const potongMatch = line.match(/Uk\.?\s*potong\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i)
    if (potongMatch) {
      ukuranPotong = potongMatch[1] + '×' + potongMatch[2]
      break
    }
  }

  // Find "Jumlah jadi" line → jumlah pesanan
  for (const line of lines) {
    const jmlMatch = line.match(/Jumlah\s+jadi\s*(\d[\d.]*)\s*lembar/i)
    if (jmlMatch) {
      jumlahPesanan = jmlMatch[1] + ' lembar'
      break
    }
  }

  return { namaBarang, namaBahan, gramatur, ukuranBahan, ukuranPotong, jumlahPesanan }
}

function parseDocInfo(entry: HistoryEntry) {
  try {
    const parsed = JSON.parse(entry.dataJson)
    const items = parsed.items || []
    const pemasok = parsed.pemasok || {}
    const namaToko = pemasok.nama || entry.pihakKedua || ''
    const ppn = parsed.ppn || 0

    const subtotal = items.reduce((sum: number, it: { qty: number; harga: number }) => sum + it.qty * it.harga, 0)
    const totalHarga = subtotal + (subtotal * ppn / 100)

    const totalQty = items.reduce((sum: number, it: { qty: number }) => sum + (it.qty || 0), 0)

    // Parse each item into detailed fields
    const allItems: ParsedItem[] = items.map((it: { deskripsi: string; qty: number; harga: number }) => {
      const parsed2 = parseDeskripsiLines(it.deskripsi || '')
      return {
        namaToko,
        namaBarang: parsed2.namaBarang,
        namaBahan: parsed2.namaBahan,
        gramatur: parsed2.gramatur,
        ukuranBahan: parsed2.ukuranBahan,
        ukuranPotong: parsed2.ukuranPotong,
        hargaPerLembar: it.harga || 0,
        jumlahPesanan: parsed2.jumlahPesanan,
        jumlahKertas: it.qty || 0,
        totalHargaKertas: (it.qty || 0) * (it.harga || 0),
      }
    })

    return { namaToko, totalQty, totalHarga, allItems, ppn }
  } catch {
    return { namaToko: '', totalQty: 0, totalHarga: 0, allItems: [] as ParsedItem[], ppn: 0 }
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
  }

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id)
  }

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
                            {info.allItems.map((item, idx) => {
                              const rows: { label: string; value: string }[] = [
                                { label: 'Nama Toko', value: item.namaToko },
                                { label: 'Nama Barang', value: item.namaBarang },
                                { label: 'Nama Bahan', value: item.namaBahan },
                                { label: 'Gramatur', value: item.gramatur },
                                { label: 'Ukuran Bahan', value: item.ukuranBahan },
                                { label: 'Ukuran Potong', value: item.ukuranPotong },
                                { label: 'Harga/lembar', value: item.hargaPerLembar > 0 ? formatRupiah(item.hargaPerLembar) : '-' },
                                { label: 'Jumlah Pesanan', value: item.jumlahPesanan },
                                { label: 'Jumlah Kertas', value: item.jumlahKertas > 0 ? `${item.jumlahKertas.toLocaleString('id-ID')} lembar` : '-' },
                                { label: 'Total Harga Kertas', value: item.totalHargaKertas > 0 ? formatRupiah(item.totalHargaKertas) : '-' },
                              ]
                              return (
                                <div key={idx} className="bg-white rounded-lg border border-slate-150 p-3 shadow-sm">
                                  <div className="flex items-start gap-2.5">
                                    <span className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center text-[11px] font-semibold shrink-0 mt-0.5">
                                      {idx + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      {rows.map((row, rIdx) => (
                                        row.value ? (
                                          <div key={rIdx} className="flex items-baseline gap-2">
                                            <span className="text-[11px] text-slate-400 shrink-0 w-28">{row.label}</span>
                                            <span className={cn(
                                              'text-xs',
                                              row.label === 'Total Harga Kertas' ? 'font-semibold text-emerald-700' : 'text-slate-700'
                                            )}>{row.value}</span>
                                          </div>
                                        ) : null
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* PPN & Total */}
                        <div className="bg-white rounded-lg border border-slate-150 p-3 shadow-sm space-y-2">
                          {info.ppn > 0 && (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-500">PPN ({info.ppn}%)</span>
                              <span className="text-slate-600">
                                {formatRupiahShort(info.allItems.reduce((s, it) => s + it.totalHargaKertas, 0) * info.ppn / 100)}
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
