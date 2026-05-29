'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { History, Search, Filter, RotateCcw, Eye, Trash2, Printer, Loader2, FileText, Calculator, Layers, Package, Truck, Percent, Scissors, Cog, Banknote, Receipt } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { MobileTable } from '@/components/mobile-table'
import { useLanguage } from '@/contexts/language-context'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { getAuthHeaders } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'
import { notifyDataChange } from '@/lib/data-sync'
import { useDataChange } from '@/hooks/use-data-change'

// --- Raw data types from API ---
interface CetakanRecord {
  id: string
  nomorUrut: string
  type: string
  printName: string
  customerName: string
  paperName: string
  paperGrammage: string
  paperLength: string
  paperWidth: string
  cutWidth: string
  cutHeight: string
  quantity: string
  jumlahPesanan: string
  warna: string
  warnaKhusus: string
  machineName: string
  hargaPlat: number
  ongkosCetak: number
  ongkosCetakDetail: string
  machineName2: string
  ongkosCetak2: number
  ongkosCetak2Detail: string
  totalPaperPrice: number
  pricePerSheet: number
  finishingNames: string
  finishingBreakdown: string
  finishingCost: number
  packingCost: number
  shippingCost: number
  glueCost: number
  glueBorongan: number
  otherCost: number
  otherCost2: number
  otherCostLabel: string
  otherCostLabel2: string
  subTotal: number
  profitPercent: number
  profitAmount: number
  grandTotal: number
  createdAt: string
  updatedAt: string
}

interface PotongKertasRecord {
  id: string
  nomorUrut: string
  namaCustomer: string
  namaCetakan: string
  paperName: string
  paperId: string
  grammage: string
  paperWidth: string
  paperHeight: string
  cutWidth: string
  cutHeight: string
  quantity: string
  setelanKertas: string
  sheetsNeeded: string
  totalPrice: number
  pricePerSheet: number
  efficiency: number
  strategy: string
  jumlahPesanan: string
  berapaMata: string
  resultData: string
  createdAt: string
  updatedAt: string
}

interface InvoiceInfo {
  id: string
  invoiceNumber: string
  riwayatCetakanId: string | null
}

// --- Grouped type for display ---
interface GroupedItem {
  nomorUrut: string
  hc: CetakanRecord | null
  pk: PotongKertasRecord | null
  invoiceNumber: string | null
  customerName: string
  printName: string
  grandTotal: number
  profitAmount: number
  totalPricePK: number
  createdAt: string
}

interface RiwayatContentProps {
  title: string
  subtitle: string
  defaultFilterType: 'all' | 'Hitung Cetakan' | 'Potong Kertas'
}

export function RiwayatContent({ title, subtitle, defaultFilterType }: RiwayatContentProps) {
  const { t } = useLanguage()
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState(defaultFilterType)
  const [cetakanData, setCetakanData] = useState<CetakanRecord[]>([])
  const [potongKertasData, setPotongKertasData] = useState<PotongKertasRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Build invoice map
  const invoiceMap = useRef<Map<string, string>>(new Map())

  // Preview
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewItem, setPreviewItem] = useState<GroupedItem | null>(null)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchRiwayat()
  }, [])

  useDataChange(['riwayat-cetakan', 'riwayat-potong-kertas', 'invoices'], () => {
    fetchRiwayat()
  })

  const fetchRiwayat = async () => {
    setLoading(true)
    try {
      const headers = getAuthHeaders()
      const [cetakanRes, pkRes, invoiceRes] = await Promise.all([
        authFetch('/api/riwayat-cetakan', { headers }),
        authFetch('/api/riwayat-potong-kertas', { headers }),
        authFetch('/api/invoices', { headers }),
      ])
      if (cetakanRes.ok) {
        const data = await cetakanRes.json()
        setCetakanData(Array.isArray(data) ? data : [])
      }
      if (pkRes.ok) {
        const data = await pkRes.json()
        setPotongKertasData(Array.isArray(data) ? data : [])
      }
      if (invoiceRes.ok) {
        const invData = await invoiceRes.json()
        const map = new Map<string, string>()
        if (Array.isArray(invData)) {
          for (const inv of invData) {
            if (inv.riwayatCetakanId) {
              map.set(inv.riwayatCetakanId, inv.invoiceNumber)
            }
          }
        }
        invoiceMap.current = map
      }
    } catch {
      toast.error('Gagal memuat riwayat')
    } finally {
      setLoading(false)
    }
  }

  // Group data by nomorUrut
  const groupedData = useMemo(() => {
    const map = new Map<string, GroupedItem>()

    // Add HC records
    for (const hc of cetakanData) {
      const key = hc.nomorUrut || hc.id
      if (!map.has(key)) {
        map.set(key, {
          nomorUrut: hc.nomorUrut,
          hc: null,
          pk: null,
          invoiceNumber: null,
          customerName: hc.customerName || '',
          printName: hc.printName || '',
          grandTotal: 0,
          profitAmount: 0,
          totalPricePK: 0,
          createdAt: hc.createdAt,
        })
      }
      const group = map.get(key)!
      group.hc = hc
      group.invoiceNumber = invoiceMap.current.get(hc.id) || null
      group.grandTotal = hc.grandTotal || 0
      group.profitAmount = hc.profitAmount || 0
      if (!group.customerName) group.customerName = hc.customerName || ''
      if (!group.printName) group.printName = hc.printName || ''
    }

    // Add PK records
    for (const pk of potongKertasData) {
      const key = pk.nomorUrut || pk.id
      if (!map.has(key)) {
        map.set(key, {
          nomorUrut: pk.nomorUrut,
          hc: null,
          pk: null,
          invoiceNumber: null,
          customerName: pk.namaCustomer || '',
          printName: pk.namaCetakan || '',
          grandTotal: 0,
          profitAmount: 0,
          totalPricePK: 0,
          createdAt: pk.createdAt,
        })
      }
      const group = map.get(key)!
      group.pk = pk
      group.totalPricePK = pk.totalPrice || 0
      if (!group.customerName) group.customerName = pk.namaCustomer || ''
      if (!group.printName) group.printName = pk.namaCetakan || ''
    }

    // Sort by createdAt desc
    return Array.from(map.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [cetakanData, potongKertasData])

  const filteredHistories = groupedData.filter(g => {
    const term = searchTerm.toLowerCase()
    const matchesSearch =
      g.nomorUrut.toLowerCase().includes(term) ||
      g.customerName.toLowerCase().includes(term) ||
      g.printName.toLowerCase().includes(term) ||
      (g.invoiceNumber || '').toLowerCase().includes(term) ||
      (g.hc?.paperName || '').toLowerCase().includes(term) ||
      (g.hc?.machineName || '').toLowerCase().includes(term) ||
      (g.pk?.paperName || '').toLowerCase().includes(term)

    const matchesFilter =
      filterType === 'all' ||
      (filterType === 'Hitung Cetakan' && g.hc) ||
      (filterType === 'Potong Kertas' && g.pk)

    return matchesSearch && matchesFilter
  })

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch { return d }
  }

  const formatRp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`

  const handleRestore = (item: GroupedItem) => {
    // Prefer restoring HC if available, else PK
    if (item.hc) {
      const h = item.hc
      const params = new URLSearchParams()
      if (h.printName) params.set('printName', h.printName)
      if (h.customerName) params.set('customerName', h.customerName)
      if (h.paperName) params.set('paperName', h.paperName)
      if (h.paperLength) params.set('paperLength', h.paperLength)
      if (h.paperWidth) params.set('paperWidth', h.paperWidth)
      if (h.cutWidth) params.set('cutWidth', h.cutWidth)
      if (h.cutHeight) params.set('cutHeight', h.cutHeight)
      if (h.quantity) params.set('quantity', h.quantity)
      if (h.totalPaperPrice) params.set('totalPaperPrice', h.totalPaperPrice.toString())
      if (h.profitPercent) params.set('profitPercent', h.profitPercent.toString())
      if (h.paperGrammage && h.paperGrammage !== '0') params.set('paperGrammage', h.paperGrammage)
      if (h.pricePerSheet) params.set('pricePerSheet', h.pricePerSheet.toString())
      if (h.warna && h.warna !== '-') params.set('warna', h.warna)
      if (h.warnaKhusus && h.warnaKhusus !== '-' && parseInt(h.warnaKhusus) > 0) params.set('warnaKhusus', h.warnaKhusus)
      if (h.hargaPlat) params.set('hargaPlat', h.hargaPlat.toString())
      if (h.machineName && h.machineName !== '-') params.set('machineName', h.machineName)
      if (h.machineName2 && h.machineName2 !== '-') params.set('machineName2', h.machineName2)
      if (h.finishingNames && h.finishingNames !== '-') params.set('finishingNames', h.finishingNames)
      if (h.packingCost) params.set('packingCost', h.packingCost.toString())
      if (h.shippingCost) params.set('shippingCost', h.shippingCost.toString())
      if (h.glueCost) params.set('glueCost', h.glueCost.toString())
      if (h.glueBorongan) params.set('glueBorongan', h.glueBorongan.toString())
      if (h.otherCost) params.set('otherCost', h.otherCost.toString())
      params.set('restoredFromRiwayat', '1')
      window.location.href = `/hitung-cetakan?${params.toString()}`
    } else if (item.pk) {
      const p = item.pk
      const params = new URLSearchParams()
      if (p.namaCetakan) params.set('printName', p.namaCetakan)
      if (p.namaCustomer) params.set('customerName', p.namaCustomer)
      if (p.paperName) params.set('paperName', p.paperName)
      if (p.paperWidth) params.set('paperWidth', p.paperWidth)
      if (p.paperHeight) params.set('paperLength', p.paperHeight)
      if (p.cutWidth) params.set('cutWidth', p.cutWidth)
      if (p.cutHeight) params.set('cutHeight', p.cutHeight)
      if (p.quantity) params.set('quantity', p.quantity)
      if (p.totalPrice) params.set('totalPaperPrice', p.totalPrice.toString())
      params.set('restoredFromRiwayat', '1')
      window.location.href = `/potong-kertas?${params.toString()}`
    }
  }

  const handlePreview = (item: GroupedItem) => {
    setPreviewItem(item)
    setPreviewOpen(true)
  }

  const handleDelete = async (item: GroupedItem) => {
    if (!confirm('Beneran mau dihapus nih?')) return
    try {
      const headers = { 'Content-Type': 'application/json', ...getAuthHeaders() }
      // Delete both HC and PK if they exist
      if (item.hc) {
        await authFetch(`/api/riwayat-cetakan/${item.hc.id}`, { method: 'DELETE', headers })
      }
      if (item.pk) {
        await authFetch(`/api/riwayat-potong-kertas/${item.pk.id}`, { method: 'DELETE', headers })
      }
      toast.success('Riwayat berhasil dihapus')
      notifyDataChange('riwayat-cetakan')
      notifyDataChange('riwayat-potong-kertas')
    } catch {
      toast.error('Gagal menghapus riwayat')
    }
  }

  const handlePrint = () => {
    const el = previewRef.current
    if (!el || !previewItem) return
    const pw = window.open('', '_blank')
    if (!pw) { toast.error('Popup diblokir'); return }
    pw.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Preview - ${previewItem.printName}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @page { size: A4; margin: 10mm; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; }
        .header { text-align: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; }
        .header h1 { font-size: 16px; font-weight: 700; color: #0f172a; }
        .header p { font-size: 10px; color: #64748b; margin-top: 2px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 10px; }
        .cell { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 5px; padding: 6px 8px; }
        .cell .lbl { font-size: 8px; color: #64748b; font-weight: 500; }
        .cell .val { font-size: 12px; font-weight: 700; color: #0f172a; }
        .cell .val.grn { color: #059669; }
        .cell .val.red { color: #e11d48; }
        .total-bar { background: #0f172a; color: white; border-radius: 6px; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; }
        .total-bar .lbl { font-size: 9px; color: #94a3b8; }
        .total-bar .val { font-size: 16px; font-weight: 800; color: #22c55e; }
      </style>
    </head><body>${el.innerHTML}</body></html>`)
    pw.document.close()
    pw.onload = () => pw.print()
  }

  const handlePdf = async () => {
    const el = previewRef.current
    if (!el) return
    setIsGeneratingPdf(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
      const imgData = canvas.toDataURL('image/jpeg', 0.95)
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfW = pdf.internal.pageSize.getWidth()
      const pdfH = pdf.internal.pageSize.getHeight()
      const margin = 8
      const cw = pdfW - margin * 2
      const ih = (canvas.height * cw) / canvas.width
      const maxH = pdfH - margin * 2
      let fw = cw, fh = ih
      if (fh > maxH) { fw = (maxH * cw) / ih; fh = maxH }
      pdf.addImage(imgData, 'JPEG', margin + (cw - fw) / 2, margin, fw, fh)
      pdf.save(`riwayat-${Date.now()}.pdf`)
      toast.success('PDF berhasil diunduh!')
    } catch { toast.error('Gagal menghasilkan PDF') }
    finally { setIsGeneratingPdf(false) }
  }

  const columns = [
    {
      key: 'nomorUrut',
      title: 'Nomor',
      render: (g: GroupedItem) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wide bg-blue-50 text-blue-700 border border-blue-200">
          {g.nomorUrut || '-'}
        </span>
      )
    },
    {
      key: 'invoiceNumber',
      title: 'No. Invoice',
      render: (g: GroupedItem) => g.invoiceNumber ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wide bg-violet-50 text-violet-700 border border-violet-200">
          <Receipt className="w-3 h-3" />
          {g.invoiceNumber}
        </span>
      ) : (
        <span className="text-slate-300 text-xs">-</span>
      )
    },
    {
      key: 'status',
      title: 'Status',
      render: (g: GroupedItem) => {
        const hasHC = !!g.hc
        const hasPK = !!g.pk
        return (
          <div className="flex items-center gap-1 flex-wrap">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${hasPK ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-50 text-gray-300 border border-gray-200'}`}>
              {hasPK ? '✓' : '○'} PK
            </span>
            <span className="text-gray-300 text-[9px]">→</span>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${hasHC ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-gray-50 text-gray-300 border border-gray-200'}`}>
              {hasHC ? '✓' : '○'} HC
            </span>
          </div>
        )
      }
    },
    {
      key: 'customerName',
      title: 'Nama Customer',
      render: (g: GroupedItem) => (
        <span className="text-slate-700 truncate">{g.customerName || '-'}</span>
      )
    },
    {
      key: 'printName',
      title: 'Nama Cetakan',
      render: (g: GroupedItem) => (
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span className="font-medium text-slate-800 truncate">{g.printName}</span>
        </div>
      )
    },
    {
      key: 'profitAmount',
      title: 'Uang Capek',
      render: (g: GroupedItem) => (
        <span className={`font-semibold ${g.profitAmount > 0 ? 'text-violet-700' : 'text-slate-400'}`}>
          {g.profitAmount > 0 ? formatRp(g.profitAmount) : '-'}
        </span>
      )
    },
    {
      key: 'totalPricePK',
      title: 'Modal Kertas',
      render: (g: GroupedItem) => (
        <span className={`font-semibold ${g.totalPricePK > 0 ? 'text-teal-700' : 'text-slate-400'}`}>
          {g.totalPricePK > 0 ? formatRp(g.totalPricePK) : '-'}
        </span>
      )
    },
    {
      key: 'grandTotal',
      title: 'Total Jual',
      render: (g: GroupedItem) => (
        <span className="font-bold text-emerald-700">{g.grandTotal > 0 ? formatRp(g.grandTotal) : '-'}</span>
      )
    },
    {
      key: 'createdAt',
      title: 'Tanggal',
      render: (g: GroupedItem) => (
        <span className="text-xs text-slate-500">{formatDate(g.createdAt)}</span>
      )
    }
  ]

  // --- Preview helpers ---
  const hc = previewItem?.hc
  const pk = previewItem?.pk

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 lg:p-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="flex flex-col lg:flex-row gap-4 w-full lg:flex-1">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" placeholder="Cari riwayat..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
                className="pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white w-full lg:w-auto">
                <option value="all">Semua</option>
                <option value="Hitung Cetakan">Dengan Hitung Cetakan</option>
                <option value="Potong Kertas">Dengan Potong Kertas</option>
              </select>
            </div>
          </div>
          <div className="text-xs text-slate-400">{filteredHistories.length} data</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 lg:p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-2" />
            <span className="text-sm text-slate-500">Memuat riwayat...</span>
          </div>
        ) : (
          <MobileTable
            data={filteredHistories}
            columns={columns}
            keyField="nomorUrut"
            onDelete={handleDelete}
            showAsButtons={true}
            emptyMessage="Belum ada riwayat penjualan"
            emptyIcon={<History className="w-12 h-12 mx-auto text-slate-400" />}
            extraActions={(item: GroupedItem) => (
              <div className="flex items-center gap-1">
                <button onClick={() => handlePreview(item)} title="Preview"
                  className="p-1.5 rounded-lg bg-violet-100 hover:bg-violet-200 text-violet-700 transition-colors">
                  <Eye className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleRestore(item)} title="Restore"
                  className="p-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 transition-colors">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            mobileCardActions={(item: GroupedItem) => (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                <button onClick={() => handlePreview(item)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium transition-colors">
                  <Eye className="w-3.5 h-3.5" /> Preview
                </button>
                <button onClick={() => handleRestore(item)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors">
                  <RotateCcw className="w-3.5 h-3.5" /> Restore
                </button>
                <button onClick={() => handleDelete(item)}
                  className="py-2 px-3 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          />
        )}
      </div>

      {/* ===== PREVIEW DIALOG ===== */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-violet-600" />
              Detail Riwayat Penjualan
            </DialogTitle>
          </DialogHeader>

          {previewItem && (
            <>
              <div ref={previewRef} className="p-4 bg-white space-y-3">
                {/* Header */}
                <div className="text-center pb-3 border-b-2 border-slate-200">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <FileText className="w-5 h-5 text-blue-600" />
                    <h1 className="text-lg font-bold text-slate-900">
                      Riwayat Penjualan
                    </h1>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {previewItem.printName} · {formatDate(previewItem.createdAt)}
                  </p>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${pk ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-50 text-gray-300 border border-gray-200'}`}>
                      {pk ? '✓' : '○'} Potong Kertas
                    </span>
                    <span className="text-gray-300 text-[9px]">→</span>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${hc ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-gray-50 text-gray-300 border border-gray-200'}`}>
                      {hc ? '✓' : '○'} Hitung Cetakan
                    </span>
                    {previewItem.invoiceNumber && (
                      <>
                        <span className="text-gray-300 text-[9px]">→</span>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200">
                          <Receipt className="w-3 h-3" /> {previewItem.invoiceNumber}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* === INFORMASI CETAKAN === */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center">
                      <FileText className="w-3 h-3 text-blue-600" />
                    </div>
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Informasi Cetakan</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5">
                      <p className="text-[10px] text-blue-500 font-medium">Nama Customer</p>
                      <p className="text-sm font-bold text-blue-800">{previewItem.customerName || '-'}</p>
                    </div>
                    <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-2.5">
                      <p className="text-[10px] text-indigo-500 font-medium">Nama Cetakan</p>
                      <p className="text-sm font-bold text-indigo-800">{previewItem.printName || '-'}</p>
                    </div>
                    <div className="bg-purple-50 border border-purple-100 rounded-lg p-2.5">
                      <p className="text-[10px] text-purple-500 font-medium">Jumlah Pesanan</p>
                      <p className="text-sm font-bold text-purple-800">
                        {hc?.jumlahPesanan ? parseInt(hc.jumlahPesanan || '0').toLocaleString('id-ID') : pk?.jumlahPesanan ? parseInt(pk.jumlahPesanan || '0').toLocaleString('id-ID') : '-'}
                      </p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                      <p className="text-[10px] text-slate-500 font-medium">Ukuran Potongan</p>
                      <p className="text-sm font-bold text-slate-700">
                        {(hc?.cutWidth && hc.cutHeight) ? `${hc.cutWidth} × ${hc.cutHeight} cm` : (pk?.cutWidth && pk.cutHeight) ? `${pk.cutWidth} × ${pk.cutHeight} cm` : '-'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* === POTONG KERTAS SECTION === */}
                {pk && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-5 h-5 rounded bg-emerald-100 flex items-center justify-center">
                        <Scissors className="w-3 h-3 text-emerald-600" />
                      </div>
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Potong Kertas</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] text-emerald-500 font-medium">Jenis Kertas</p>
                          <p className="text-sm font-bold text-emerald-800">{pk.paperName || '-'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-emerald-500 font-medium">Grammage</p>
                          <p className="text-sm font-bold text-emerald-800">{pk.grammage || '-'} gsm</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-emerald-500 font-medium">Ukuran Bahan</p>
                          <p className="text-sm font-bold text-emerald-800">{pk.paperWidth}×{pk.paperHeight} cm</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-emerald-500 font-medium">Setelan Kertas</p>
                          <p className="text-sm font-bold text-emerald-800">{pk.setelanKertas || '-'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-emerald-500 font-medium">Jumlah Lembar</p>
                          <p className="text-sm font-bold text-emerald-800">{parseInt(pk.sheetsNeeded || '0').toLocaleString('id-ID')} lbr</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-emerald-500 font-medium">Efisiensi</p>
                          <p className="text-sm font-bold text-emerald-800">{pk.efficiency ? `${pk.efficiency}%` : '-'}</p>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-emerald-200 flex items-center justify-between">
                        <span className="text-xs text-emerald-600 font-medium">Total Modal Kertas</span>
                        <span className="text-lg font-extrabold text-emerald-700">{formatRp(pk.totalPrice)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* === HARGA BAHAN KERTAS (from HC) === */}
                {hc && hc.totalPaperPrice > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-5 h-5 rounded bg-teal-100 flex items-center justify-center">
                        <FileText className="w-3 h-3 text-teal-600" />
                      </div>
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Harga Bahan Kertas</p>
                    </div>
                    <div className="bg-teal-50 border border-teal-100 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div>
                          <p className="text-sm font-bold text-teal-800">{hc.paperName || '-'}</p>
                          <p className="text-[10px] text-teal-500">
                            {hc.paperGrammage || 0} gsm · Ukuran Bahan: {hc.paperLength || '-'}×{hc.paperWidth || '-'} cm
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-extrabold text-teal-700">{formatRp(hc.totalPaperPrice)}</p>
                          <p className="text-[9px] text-teal-500">Total harga kertas</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* === ONGKOS CETAK === */}
                {hc && hc.ongkosCetak > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center">
                        <Calculator className="w-3 h-3 text-blue-600" />
                      </div>
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">{t('ongkos_cetak_label')}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-bold text-blue-800">Total Ongkos Cetak</p>
                        <p className="text-lg font-extrabold text-blue-700">{formatRp(hc.ongkosCetak)}</p>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Nama Mesin</span>
                          <span className="font-semibold text-slate-700">{hc.machineName || '-'}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Jumlah Warna</span>
                          <span className="font-semibold text-slate-700">
                            {hc.warna || 0} warna
                            {hc.warnaKhusus && parseInt(hc.warnaKhusus) > 0 ? <span className="text-amber-600"> + {hc.warnaKhusus} khusus</span> : ''}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Harga Plat</span>
                          <span className="font-semibold text-slate-700">{formatRp(hc.hargaPlat)}</span>
                        </div>
                      </div>
                      {hc.ongkosCetakDetail && hc.ongkosCetakDetail !== '-' && (
                        <div className="mt-2 pt-2 border-t border-blue-200">
                          <p className="text-[9px] text-blue-500 font-medium mb-0.5">Rumus:</p>
                          <p className="text-[9px] text-blue-600 leading-relaxed">{hc.ongkosCetakDetail}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* === ONGKOS CETAK 2 === */}
                {hc && hc.ongkosCetak2 > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-5 h-5 rounded bg-fuchsia-100 flex items-center justify-center">
                        <Calculator className="w-3 h-3 text-fuchsia-600" />
                      </div>
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Ongkos Cetak 2</p>
                    </div>
                    <div className="bg-fuchsia-50 border border-fuchsia-100 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-bold text-fuchsia-800">Total Ongkos Cetak 2</p>
                        <p className="text-lg font-extrabold text-fuchsia-700">{formatRp(hc.ongkosCetak2)}</p>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Nama Mesin</span>
                          <span className="font-semibold text-slate-700">{hc.machineName2 || '-'}</span>
                        </div>
                      </div>
                      {hc.ongkosCetak2Detail && hc.ongkosCetak2Detail !== '-' && (
                        <div className="mt-2 pt-2 border-t border-fuchsia-200">
                          <p className="text-[9px] text-fuchsia-500 font-medium mb-0.5">Rumus:</p>
                          <p className="text-[9px] text-fuchsia-600 leading-relaxed">{hc.ongkosCetak2Detail}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* === FINISHING === */}
                {hc && hc.finishingNames && hc.finishingNames !== '-' && hc.finishingCost > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-5 h-5 rounded bg-rose-100 flex items-center justify-center">
                        <Layers className="w-3 h-3 text-rose-600" />
                      </div>
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">{t('finishing_label')}</p>
                    </div>
                    <div className="bg-rose-50 border border-rose-100 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-bold text-rose-800">{hc.finishingNames}</p>
                        <p className="text-lg font-extrabold text-rose-700">{formatRp(hc.finishingCost)}</p>
                      </div>
                      {hc.finishingBreakdown && hc.finishingBreakdown !== '-' && (
                        <div className="mt-1.5 pt-1.5 border-t border-rose-200">
                          <p className="text-[9px] text-rose-500 font-medium mb-0.5">Detail:</p>
                          <div className="space-y-1">
                            {hc.finishingBreakdown.split(' | ').map((fb, i) => (
                              <p key={i} className="text-[9px] text-rose-600 leading-relaxed">{fb}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* === BIAYA TAMBAHAN === */}
                {hc && (hc.packingCost > 0 || hc.shippingCost > 0 || hc.glueCost > 0 || hc.glueBorongan > 0 || hc.otherCost > 0) && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-5 h-5 rounded bg-amber-100 flex items-center justify-center">
                        <Truck className="w-3 h-3 text-amber-600" />
                      </div>
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Biaya Tambahan</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                      <div className="grid grid-cols-2 gap-2">
                        {hc.packingCost > 0 && (
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-amber-500" />
                            <div>
                              <p className="text-[9px] text-amber-500">Ongkos Packing</p>
                              <p className="text-sm font-bold text-amber-700">{formatRp(hc.packingCost)}</p>
                            </div>
                          </div>
                        )}
                        {hc.shippingCost > 0 && (
                          <div className="flex items-center gap-2">
                            <Truck className="w-4 h-4 text-amber-500" />
                            <div>
                              <p className="text-[9px] text-amber-500">Ongkos Kirim</p>
                              <p className="text-sm font-bold text-amber-700">{formatRp(hc.shippingCost)}</p>
                            </div>
                          </div>
                        )}
                        {hc.glueCost > 0 && (
                          <div className="flex items-center gap-2">
                            <Cog className="w-4 h-4 text-amber-500" />
                            <div>
                              <p className="text-[9px] text-amber-500">Ongkos Lem</p>
                              <p className="text-sm font-bold text-amber-700">{formatRp(hc.glueCost)}</p>
                            </div>
                          </div>
                        )}
                        {hc.glueBorongan > 0 && (
                          <div className="flex items-center gap-2">
                            <Cog className="w-4 h-4 text-amber-500" />
                            <div>
                              <p className="text-[9px] text-amber-500">Lem Borongan</p>
                              <p className="text-sm font-bold text-amber-700">{formatRp(hc.glueBorongan)}</p>
                            </div>
                          </div>
                        )}
                        {hc.otherCost > 0 && (
                          <div className="flex items-center gap-2">
                            <Banknote className="w-4 h-4 text-amber-500" />
                            <div>
                              <p className="text-[9px] text-amber-500">{hc.otherCostLabel || 'Biaya Lain-lain'}</p>
                              <p className="text-sm font-bold text-amber-700">{formatRp(hc.otherCost)}</p>
                            </div>
                          </div>
                        )}
                        {hc.otherCost2 > 0 && (
                          <div className="flex items-center gap-2">
                            <Banknote className="w-4 h-4 text-amber-500" />
                            <div>
                              <p className="text-[9px] text-amber-500">{hc.otherCostLabel2 || 'Biaya Lainnya'}</p>
                              <p className="text-sm font-bold text-amber-700">{formatRp(hc.otherCost2)}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* === PROFIT === */}
                {hc && hc.profitPercent > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-5 h-5 rounded bg-orange-100 flex items-center justify-center">
                        <Percent className="w-3 h-3 text-orange-600" />
                      </div>
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Profit</p>
                    </div>
                    <div className="bg-orange-50 border border-orange-100 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-orange-600">Profit ({hc.profitPercent}%)</p>
                        <p className="text-lg font-bold text-orange-700">{formatRp(hc.profitAmount)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* === RINGKASAN HARGA === */}
                {hc && (
                  <div>
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Ringkasan Harga</p>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                        <span className="text-xs text-slate-500">Harga Kertas</span>
                        <span className="text-xs font-semibold text-teal-700">{formatRp(hc.totalPaperPrice)}</span>
                      </div>
                      {hc.ongkosCetak > 0 && (
                        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                          <span className="text-xs text-slate-500">Ongkos Cetak</span>
                          <span className="text-xs font-semibold text-blue-700">{formatRp(hc.ongkosCetak)}</span>
                        </div>
                      )}
                      {hc.ongkosCetak2 > 0 && (
                        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                          <span className="text-xs text-slate-500">Ongkos Cetak 2</span>
                          <span className="text-xs font-semibold text-fuchsia-700">{formatRp(hc.ongkosCetak2)}</span>
                        </div>
                      )}
                      {hc.finishingCost > 0 && (
                        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                          <span className="text-xs text-slate-500">Finishing</span>
                          <span className="text-xs font-semibold text-rose-700">{formatRp(hc.finishingCost)}</span>
                        </div>
                      )}
                      {hc.packingCost > 0 && (
                        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                          <span className="text-xs text-slate-500">Ongkos Packing</span>
                          <span className="text-xs font-semibold text-amber-700">{formatRp(hc.packingCost)}</span>
                        </div>
                      )}
                      {hc.shippingCost > 0 && (
                        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                          <span className="text-xs text-slate-500">Ongkos Kirim</span>
                          <span className="text-xs font-semibold text-amber-700">{formatRp(hc.shippingCost)}</span>
                        </div>
                      )}
                      {hc.glueCost > 0 && (
                        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                          <span className="text-xs text-slate-500">Ongkos Lem</span>
                          <span className="text-xs font-semibold text-amber-700">{formatRp(hc.glueCost)}</span>
                        </div>
                      )}
                      {hc.glueBorongan > 0 && (
                        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                          <span className="text-xs text-slate-500">Lem Borongan</span>
                          <span className="text-xs font-semibold text-amber-700">{formatRp(hc.glueBorongan)}</span>
                        </div>
                      )}
                      {hc.otherCost > 0 && (
                        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                          <span className="text-xs text-slate-500">{hc.otherCostLabel || 'Biaya Lain-lain'}</span>
                          <span className="text-xs font-semibold text-amber-700">{formatRp(hc.otherCost)}</span>
                        </div>
                      )}
                      {hc.otherCost2 > 0 && (
                        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                          <span className="text-xs text-slate-500">{hc.otherCostLabel2 || 'Biaya Lainnya'}</span>
                          <span className="text-xs font-semibold text-amber-700">{formatRp(hc.otherCost2)}</span>
                        </div>
                      )}
                      {hc.profitAmount > 0 && (
                        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                          <span className="text-xs text-slate-500">Profit ({hc.profitPercent}%)</span>
                          <span className="text-xs font-semibold text-orange-700">{formatRp(hc.profitAmount)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-xs font-medium text-slate-500">Sub Total</span>
                        <span className="text-xs font-bold text-slate-700">{formatRp(hc.subTotal)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* === GRAND TOTAL === */}
                <div className="bg-slate-900 text-white rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400">Grand Total</p>
                    <p className="text-2xl font-extrabold text-emerald-400">{formatRp(previewItem.grandTotal || previewItem.totalPricePK || 0)}</p>
                  </div>
                  <div className="text-right text-[10px] text-slate-400 space-y-0.5">
                    {hc && <p>Sub Total: {formatRp(hc.subTotal)}</p>}
                    {hc && hc.profitAmount > 0 && <p>Uang Capek: {formatRp(hc.profitAmount)}</p>}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="sticky bottom-0 bg-white border-t border-slate-200 p-4 flex gap-3">
                <button onClick={handlePrint}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors">
                  <Printer className="w-4 h-4" /> Cetak
                </button>
                <button onClick={() => handleRestore(previewItem)}
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-xl transition-colors">
                  <RotateCcw className="w-4 h-4" /> Restore
                </button>
                <button onClick={() => handlePdf()}
                  disabled={isGeneratingPdf}
                  className="flex-1 flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50">
                  {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} PDF
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
