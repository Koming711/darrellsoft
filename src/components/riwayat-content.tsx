'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { History, Search, Filter, RotateCcw, Eye, Trash2, Printer, FileImage, Loader2, FileText, Calculator, Layers, Package, Truck, Percent, Scissors, Cog, Banknote, Pencil } from 'lucide-react'
import { captureElementAsJpg, fitBlobToA4, fitBlobToA5, HIRES_PIXEL_RATIO } from '@/lib/capture-jpg'
import { printBlobHiRes } from '@/lib/print-hi-res'
import { RincianCetakanPreview, mapRiwayatToRincianData } from '@/components/rincian-cetakan-preview'
import { FixedDocScaler } from '@/components/fixed-doc-scaler'
import { shareJpgToWhatsApp } from '@/lib/share-jpg'
import { useRouter } from 'next/navigation'
import { MobileTable } from '@/components/mobile-table'
import { useLanguage } from '@/contexts/language-context'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { getAuthHeaders } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'
import { notifyDataChange } from '@/lib/data-sync'
import { useDataChange } from '@/hooks/use-data-change'

interface RiwayatItem {
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
  berapaMata: string
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
  setelanKertas: string
  warna2: string
  warnaKhusus2: string
  hargaPlat2: number
  glueLengthCm: string
  glueCostPerCm: string
  photoUrl?: string | null
  subTotal: number
  profitPercent: number
  profitAmount: number
  grandTotal: number
  createdAt: string
  updatedAt: string
}

interface RiwayatContentProps {
  title: string
  subtitle: string
  defaultFilterType: 'all' | 'Hitung Cetakan' | 'Potong Kertas'
  enableRowPreview?: boolean
  /** Klik baris/kartu → dialog detail rincian; icon restore dihilangkan dari baris; dialog detail mendapat tombol Restore & Hapus */
  detailOnRowClick?: boolean
}

export function RiwayatContent({ title, subtitle, defaultFilterType, enableRowPreview = false, detailOnRowClick = false }: RiwayatContentProps) {
  const { t } = useLanguage()
  const router = useRouter()
  const rowClickDetail = enableRowPreview || detailOnRowClick
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState(defaultFilterType)
  const [histories, setHistories] = useState<RiwayatItem[]>([])
  const [loading, setLoading] = useState(true)

  // Preview
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewItem, setPreviewItem] = useState<RiwayatItem | null>(null)
  const [isGeneratingJpg, setIsGeneratingJpg] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  // Data preview "Detail Rincian Cetakan" (identik dengan preview editor) untuk item hitung_cetakan
  const previewRincian = useMemo(
    () => (previewItem && previewItem.type === 'hitung_cetakan' ? mapRiwayatToRincianData(previewItem) : null),
    [previewItem]
  )

  useEffect(() => {
    fetchRiwayat()
  }, [])

  useDataChange(['riwayat-cetakan', 'riwayat-potong-kertas'], () => {
    fetchRiwayat()
  })

  const fetchRiwayat = async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/riwayat-cetakan', { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setHistories(Array.isArray(data) ? data : [])
      }
    } catch {
      toast.error('Gagal memuat riwayat')
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = (item: RiwayatItem) => {
    const isHitungCetak = item.type === 'hitung_cetakan'
    const params = new URLSearchParams()
    // Field umum
    if (item.printName) params.set('printName', item.printName)
    if (item.customerName) params.set('customerName', item.customerName)
    if (item.paperName) params.set('paperName', item.paperName)
    if (item.paperLength) params.set('paperLength', item.paperLength)
    if (item.paperWidth) params.set('paperWidth', item.paperWidth)
    if (item.cutWidth) params.set('cutWidth', item.cutWidth)
    if (item.cutHeight) params.set('cutHeight', item.cutHeight)
    if (item.quantity) params.set('quantity', item.quantity)
    if (item.jumlahPesanan) params.set('jumlahPesanan', item.jumlahPesanan)
    if (item.berapaMata) params.set('berapaMata', item.berapaMata)
    if (item.totalPaperPrice) params.set('totalPaperPrice', item.totalPaperPrice.toString())
    if (item.profitPercent) params.set('profitPercent', item.profitPercent.toString())
    params.set('restoredFromRiwayat', '1')

    if (isHitungCetak) {
      // Field khusus hitung cetakan
      if (item.paperGrammage && item.paperGrammage !== '0') params.set('paperGrammage', item.paperGrammage)
      if (item.pricePerSheet) params.set('pricePerSheet', item.pricePerSheet.toString())
      if (item.warna && item.warna !== '-') params.set('warna', item.warna)
      if (item.warnaKhusus && item.warnaKhusus !== '-' && parseInt(item.warnaKhusus) > 0) params.set('warnaKhusus', item.warnaKhusus)
      if (item.hargaPlat) params.set('hargaPlat', item.hargaPlat.toString())
      if (item.machineName && item.machineName !== '-') params.set('machineName', item.machineName)
      if (item.machineName2 && item.machineName2 !== '-') params.set('machineName2', item.machineName2)
      if (item.finishingNames && item.finishingNames !== '-') params.set('finishingNames', item.finishingNames)
      if (item.packingCost) params.set('packingCost', item.packingCost.toString())
      if (item.shippingCost) params.set('shippingCost', item.shippingCost.toString())
      if (item.glueCost) params.set('glueCost', item.glueCost.toString())
      if (item.glueBorongan) params.set('glueBorongan', item.glueBorongan.toString())
      if (item.otherCost) params.set('otherCost', item.otherCost.toString())
      window.location.href = `/hitung-cetakan?${params.toString()}`
    } else {
      window.location.href = `/potong-kertas?${params.toString()}`
    }
  }

  const handlePreview = (item: RiwayatItem) => {
    setPreviewItem(item)
    setPreviewOpen(true)
  }

  const handleDelete = async (item: RiwayatItem): Promise<boolean> => {
    if (!confirm('Beneran mau dihapus nih?')) return false
    try {
      const res = await authFetch(`/api/riwayat-cetakan/${item.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      })
      if (res.ok) {
        toast.success('Riwayat berhasil dihapus')
        // Optimistic update: remove from state immediately
        setHistories(prev => prev.filter(h => h.id !== item.id))
        notifyDataChange('riwayat-cetakan')
        return true
      }
      toast.error('Gagal menghapus riwayat')
      return false
    } catch {
      toast.error('Gagal menghapus riwayat')
      return false
    }
  }

  // Cetak hi-res 300 DPI: hasil cetak = gambar JPG yang sama dengan hasil JPG
  // (identik mobile & desktop) — fixedWidth 720px agar preview dialog responsif
  // menghasilkan gambar yang sama di semua perangkat.
  const handlePrint = async () => {
    const el = previewRef.current
    if (!el || !previewItem) return
    const isHC = previewItem.type === 'hitung_cetakan'
    setIsPrinting(true)
    try {
      if (isHC) {
        // Hitung Cetakan: cetak ke halaman A5 landscape (210 × 148 mm)
        const blob = await captureElementAsJpg(el, { pixelRatio: HIRES_PIXEL_RATIO, fixedWidth: 720 })
        const custLabel = (previewItem.customerName || previewItem.printName || 'rincian-cetakan')
        const ok = await printBlobHiRes(blob, { title: `Rincian Harga Cetakan ${custLabel}`, page: 'A5 landscape', margin: '5mm' })
        if (!ok) { toast.error('Popup diblokir. Izinkan popup untuk mencetak.'); return }
      } else {
        // Potong Kertas: cetak ke halaman A4 — gambar identik dengan dialog
        const blob = await captureElementAsJpg(el, { pixelRatio: HIRES_PIXEL_RATIO, fixedWidth: 720 })
        const ok = await printBlobHiRes(blob, { title: `Preview - ${previewItem.printName}`, page: 'A4', margin: '10mm' })
        if (!ok) { toast.error('Popup diblokir. Izinkan popup untuk mencetak.'); return }
      }
    } catch {
      toast.error('Gagal menyiapkan cetakan')
    } finally {
      setIsPrinting(false)
    }
  }

  const handleJpg = async () => {
    const el = previewRef.current
    if (!el || !previewItem) return
    setIsGeneratingJpg(true)
    try {
      // Hi-res 300 DPI + fixedWidth 720px → identik mobile & desktop.
      // Hitung Cetakan: A5 landscape (210 × 148 mm @300 DPI = 2480×1748 px)
      // Potong Kertas: A4 portrait (210 × 297 mm @300 DPI = 2480×3508 px)
      const rawBlob = await captureElementAsJpg(el, { pixelRatio: HIRES_PIXEL_RATIO, fixedWidth: 720 })
      const blob = previewItem.type === 'hitung_cetakan'
        ? await fitBlobToA5(rawBlob, { orientation: 'landscape', marginPct: 3 })
        : await fitBlobToA4(rawBlob, { orientation: 'portrait', marginPct: 3 })
      const custLabel = (previewItem.customerName || previewItem.printName || 'preview')
      const fileName = `rincian-cetakan-${custLabel.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.jpg`
      const result = await shareJpgToWhatsApp({ blob, fileName, documentLabel: 'Rincian Harga Cetakan' })
      if (result.status === 'shared') {
        toast.success('Gambar JPG dikirim ke WhatsApp')
      } else if (result.status === 'downloaded') {
        toast.success('JPG diunduh ke perangkat', { description: 'File JPG telah disimpan ke folder Downloads.' })
      } else if (result.status === 'error') {
        toast.error(result.error || 'Gagal memproses JPG')
      }
    } catch (err) {
      console.error('JPG generation error:', err)
      toast.error('Gagal menghasilkan gambar JPG')
    } finally {
      setIsGeneratingJpg(false)
    }
  }

  const filteredHistories = histories.filter(h => {
    const term = searchTerm.toLowerCase()
    const matchesSearch = h.printName.toLowerCase().includes(term) || h.customerName.toLowerCase().includes(term) || h.paperName.toLowerCase().includes(term) || h.machineName.toLowerCase().includes(term)
    const isHitungCetak = h.type === 'hitung_cetakan'
    const matchesFilter = filterType === 'all' || (filterType === 'Hitung Cetakan' && isHitungCetak) || (filterType === 'Potong Kertas' && !isHitungCetak)
    return matchesSearch && matchesFilter
  })

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch { return d }
  }

  const formatRp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`

  const isItemHitungCetak = (h: RiwayatItem) => h.type === 'hitung_cetakan'

  const columns = [
    {
      key: 'jenis',
      title: 'Jenis',
      render: (h: RiwayatItem) => {
        const jenis = isItemHitungCetak(h) ? 'Hitung Cetakan' : 'Potong Kertas'
        const isPotong = jenis === 'Potong Kertas'
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${isPotong ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>
            {isPotong ? '✂️' : '🖨️'} {jenis}
          </span>
        )
      }
    },
    {
      key: 'nomorUrut',
      title: 'Nomor',
      render: (h: RiwayatItem) => {
        if (!h.nomorUrut) return <span className="text-slate-400">-</span>
        const isHC = isItemHitungCetak(h)
        return (
          <span className={`font-semibold text-xs ${isHC ? 'text-blue-700' : 'text-teal-700'}`}>{h.nomorUrut}</span>
        )
      }
    },
    {
      key: 'customerName',
      title: 'Nama Customer',
      render: (h: RiwayatItem) => (
        <span className="text-slate-700 truncate">{h.customerName || '-'}</span>
      )
    },
    {
      key: 'printName',
      title: 'Nama Cetakan',
      render: (h: RiwayatItem) => (
        <div className="flex items-center gap-2">
          {isItemHitungCetak(h) ? (
            <Calculator className="w-4 h-4 text-blue-600 flex-shrink-0" />
          ) : (
            <Scissors className="w-4 h-4 text-teal-600 flex-shrink-0" />
          )}
          <span className="font-medium text-slate-800 truncate">{h.printName}</span>
        </div>
      )
    },
    {
      key: 'profitAmount',
      title: 'Profit',
      render: (h: RiwayatItem) => (
        <span className={`font-semibold ${h.profitAmount > 0 ? 'text-violet-700' : 'text-slate-400'}`}>
          {h.profitAmount > 0 ? formatRp(h.profitAmount) : '-'}
        </span>
      )
    },
    {
      key: 'quantity',
      title: 'Jumlah',
      render: (h: RiwayatItem) => `${parseInt(h.quantity || '0').toLocaleString()} lbr`
    },
    {
      key: 'pricePerSheet',
      title: 'Harga/Lembar',
      render: (h: RiwayatItem) => {
        const qty = parseInt(h.quantity || '0')
        if (qty <= 0) return <span className="text-slate-400">-</span>
        return <span className="font-semibold text-slate-700">{formatRp(Math.round(h.grandTotal / qty))}</span>
      }
    },
    {
      key: 'grandTotal',
      title: 'Total Harga',
      render: (h: RiwayatItem) => (
        <span className="font-bold text-emerald-700">{formatRp(h.grandTotal)}</span>
      )
    },
    {
      key: 'createdAt',
      title: 'Tanggal',
      render: (h: RiwayatItem) => (
        <span className="text-xs text-slate-500">{formatDate(h.createdAt)}</span>
      )
    }
  ]

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
                <option value="all">Semua Tipe</option>
                <option value="Hitung Cetakan">Hitung Cetakan</option>
                <option value="Potong Kertas">Potong Kertas</option>
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
            keyField="id"
            onDelete={handleDelete}
            showAsButtons={true}
            onRowClick={rowClickDetail ? handlePreview : undefined}
            emptyMessage="Belum ada riwayat perhitungan"
            emptyIcon={<History className="w-12 h-12 mx-auto text-slate-400" />}
            extraActions={(item: RiwayatItem) => (
              <div className="flex items-center gap-1">
                {!rowClickDetail && (
                  <button onClick={() => handlePreview(item)} title={t('preview')}
                    className="p-1.5 rounded-lg bg-violet-100 hover:bg-violet-200 text-violet-700 transition-colors">
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                )}
                {!detailOnRowClick && (
                  <button onClick={() => handleRestore(item)} title={t('restore_ke_hitung')}
                    className="p-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 transition-colors">
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
            mobileCardActions={(item: RiwayatItem) => (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                {!rowClickDetail && (
                  <button onClick={() => handlePreview(item)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium transition-colors">
                    <Eye className="w-3.5 h-3.5" /> Preview
                  </button>
                )}
                {!detailOnRowClick && (
                  <button onClick={() => handleRestore(item)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors">
                    <RotateCcw className="w-3.5 h-3.5" /> Restore
                  </button>
                )}
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
        <DialogContent className={previewItem && isItemHitungCetak(previewItem) ? 'sm:max-w-4xl max-h-[92vh] overflow-y-auto p-0' : 'max-w-2xl max-h-[92vh] overflow-y-auto p-0'}>
          <DialogHeader className="px-4 sm:px-5 pt-4 pb-3 border-b border-slate-200">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-violet-600" />
              {previewItem && isItemHitungCetak(previewItem) ? 'Detail Rincian Cetakan' : 'Detail Riwayat Cetakan'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Rincian perhitungan cetakan beserta tombol aksi
            </DialogDescription>
          </DialogHeader>

          {previewItem && (
            <>
              {isItemHitungCetak(previewItem) ? (
                <FixedDocScaler fixedWidth={720} innerRef={previewRef} innerClassName="p-4 bg-white">
                  <RincianCetakanPreview data={previewRincian} />
                </FixedDocScaler>
              ) : (
              <FixedDocScaler fixedWidth={720} innerRef={previewRef} innerClassName="p-5 bg-white space-y-4">
                {/* Header */}
                <div className="text-center pb-3 border-b-2 border-slate-200">
                  <div className="inline-flex items-center justify-center gap-1.5 mb-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200">
                    {isItemHitungCetak(previewItem) ? (
                      <Calculator className="w-3.5 h-3.5 text-blue-600" />
                    ) : (
                      <Scissors className="w-3.5 h-3.5 text-teal-600" />
                    )}
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">
                      {isItemHitungCetak(previewItem) ? 'Hitung Cetakan' : 'Potong Kertas'}
                    </span>
                  </div>
                  <h1 className="text-lg font-bold text-slate-900">
                    {isItemHitungCetak(previewItem) ? 'Rincian Harga Cetakan' : 'Rincian Potong Kertas'}
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    {previewItem.printName} · {formatDate(previewItem.createdAt)}
                  </p>
                  {previewItem.nomorUrut && (
                    <p className="text-[10px] text-slate-400 mt-0.5 font-mono tracking-wide">No. {previewItem.nomorUrut}</p>
                  )}
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
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                      <p className="text-[10px] text-slate-500 font-medium">Nama Customer</p>
                      <p className="text-sm font-bold text-slate-800 break-words">{previewItem.customerName || '-'}</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                      <p className="text-[10px] text-slate-500 font-medium">Nama Cetakan</p>
                      <p className="text-sm font-bold text-slate-800 break-words">{previewItem.printName || '-'}</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                      <p className="text-[10px] text-slate-500 font-medium">Jumlah Cetakan</p>
                      <p className="text-sm font-bold text-slate-800">{parseInt(previewItem.quantity || '0').toLocaleString('id-ID')} <span className="text-xs font-normal text-slate-400">lembar</span></p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                      <p className="text-[10px] text-slate-500 font-medium">Ukuran Potongan</p>
                      <p className="text-sm font-bold text-slate-800">{previewItem.cutWidth && previewItem.cutHeight ? `${previewItem.cutWidth} × ${previewItem.cutHeight} cm` : '-'}</p>
                    </div>
                    {isItemHitungCetak(previewItem) && (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-500 font-medium">Warna Cetak</p>
                        <p className="text-sm font-bold text-slate-800">
                          {previewItem.warna || 0} warna
                          {previewItem.warnaKhusus && parseInt(previewItem.warnaKhusus) > 0 ? ` + ${previewItem.warnaKhusus} khusus` : ''}
                        </p>
                      </div>
                    )}
                    {previewItem.jumlahPesanan && parseInt(previewItem.jumlahPesanan) > 0 && (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-500 font-medium">Jumlah Pesanan</p>
                        <p className="text-sm font-bold text-slate-800">{parseInt(previewItem.jumlahPesanan).toLocaleString('id-ID')} <span className="text-xs font-normal text-slate-400">pcs</span></p>
                      </div>
                    )}
                    {previewItem.berapaMata && parseInt(previewItem.berapaMata) > 0 && (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-500 font-medium">Berapa Mata</p>
                        <p className="text-sm font-bold text-slate-800">{previewItem.berapaMata} <span className="text-xs font-normal text-slate-400">mata</span></p>
                      </div>
                    )}
                  </div>
                </div>

                {/* === HARGA BAHAN KERTAS === */}
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
                        <p className="text-sm font-bold text-teal-800">{previewItem.paperName || '-'}</p>
                        <p className="text-[10px] text-teal-500">
                          {previewItem.paperGrammage || 0} gsm · Ukuran Bahan: {previewItem.paperLength || '-'}×{previewItem.paperWidth || '-'} cm
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-extrabold text-teal-700">{formatRp(previewItem.totalPaperPrice)}</p>
                        <p className="text-[9px] text-teal-500">Total harga kertas</p>
                      </div>
                    </div>
                    {parseInt(previewItem.quantity || '0') > 0 && previewItem.totalPaperPrice > 0 && (
                      <div className="mt-1.5 pt-1.5 border-t border-teal-200 text-[10px] text-teal-600">
                        Harga per lembar: <strong>{formatRp(Math.round(previewItem.totalPaperPrice / parseInt(previewItem.quantity || '1')))}</strong>
                        <span className="text-teal-400 ml-1">({parseInt(previewItem.quantity || '0').toLocaleString('id-ID')} lbr)</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* === ONGKOS CETAK === */}
                {previewItem.ongkosCetak > 0 && (
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
                        <p className="text-lg font-extrabold text-blue-700">{formatRp(previewItem.ongkosCetak)}</p>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Nama Mesin</span>
                          <span className="font-semibold text-slate-700">{previewItem.machineName || '-'}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Jumlah Warna</span>
                          <span className="font-semibold text-slate-700">
                            {previewItem.warna || 0} warna
                            {previewItem.warnaKhusus && parseInt(previewItem.warnaKhusus) > 0 ? <span className="text-amber-600"> + {previewItem.warnaKhusus} khusus</span> : ''}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Harga Plat</span>
                          <span className="font-semibold text-slate-700">{formatRp(previewItem.hargaPlat)}</span>
                        </div>
                      </div>
                      {previewItem.ongkosCetakDetail && previewItem.ongkosCetakDetail !== '-' && (
                        <div className="mt-2 pt-2 border-t border-blue-200">
                          <p className="text-[9px] text-blue-500 font-medium mb-0.5">Rumus:</p>
                          <p className="text-[9px] text-blue-600 leading-relaxed">{previewItem.ongkosCetakDetail}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* === ONGKOS CETAK 2 === */}
                {previewItem.ongkosCetak2 > 0 && (
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
                        <p className="text-lg font-extrabold text-fuchsia-700">{formatRp(previewItem.ongkosCetak2)}</p>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Nama Mesin</span>
                          <span className="font-semibold text-slate-700">{previewItem.machineName2 || '-'}</span>
                        </div>
                      </div>
                      {previewItem.ongkosCetak2Detail && previewItem.ongkosCetak2Detail !== '-' && (
                        <div className="mt-2 pt-2 border-t border-fuchsia-200">
                          <p className="text-[9px] text-fuchsia-500 font-medium mb-0.5">Rumus:</p>
                          <p className="text-[9px] text-fuchsia-600 leading-relaxed">{previewItem.ongkosCetak2Detail}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* === FINISHING === */}
                {previewItem.finishingNames && previewItem.finishingNames !== '-' && previewItem.finishingCost > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-5 h-5 rounded bg-rose-100 flex items-center justify-center">
                        <Layers className="w-3 h-3 text-rose-600" />
                      </div>
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">{t('finishing_label')}</p>
                    </div>
                    <div className="bg-rose-50 border border-rose-100 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-bold text-rose-800">{previewItem.finishingNames}</p>
                        <p className="text-lg font-extrabold text-rose-700">{formatRp(previewItem.finishingCost)}</p>
                      </div>
                      {previewItem.finishingBreakdown && previewItem.finishingBreakdown !== '-' && (
                        <div className="mt-1.5 pt-1.5 border-t border-rose-200">
                          <p className="text-[9px] text-rose-500 font-medium mb-0.5">Detail:</p>
                          <div className="space-y-1">
                            {previewItem.finishingBreakdown.split(' | ').map((fb, i) => (
                              <p key={i} className="text-[9px] text-rose-600 leading-relaxed">{fb}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* === BIAYA TAMBAHAN === */}
                {(previewItem.packingCost > 0 || previewItem.shippingCost > 0 || previewItem.glueCost > 0 || previewItem.glueBorongan > 0 || previewItem.otherCost > 0) && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-5 h-5 rounded bg-amber-100 flex items-center justify-center">
                        <Truck className="w-3 h-3 text-amber-600" />
                      </div>
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Biaya Tambahan</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                      <div className="grid grid-cols-2 gap-2">
                        {previewItem.packingCost > 0 && (
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-amber-500" />
                            <div>
                              <p className="text-[9px] text-amber-500">Ongkos Packing</p>
                              <p className="text-sm font-bold text-amber-700">{formatRp(previewItem.packingCost)}</p>
                            </div>
                          </div>
                        )}
                        {previewItem.shippingCost > 0 && (
                          <div className="flex items-center gap-2">
                            <Truck className="w-4 h-4 text-amber-500" />
                            <div>
                              <p className="text-[9px] text-amber-500">Ongkos Kirim</p>
                              <p className="text-sm font-bold text-amber-700">{formatRp(previewItem.shippingCost)}</p>
                            </div>
                          </div>
                        )}
                        {previewItem.glueCost > 0 && (
                          <div className="flex items-center gap-2">
                            <Cog className="w-4 h-4 text-amber-500" />
                            <div>
                              <p className="text-[9px] text-amber-500">Ongkos Lem</p>
                              <p className="text-sm font-bold text-amber-700">{formatRp(previewItem.glueCost)}</p>
                            </div>
                          </div>
                        )}
                        {previewItem.glueBorongan > 0 && (
                          <div className="flex items-center gap-2">
                            <Cog className="w-4 h-4 text-amber-500" />
                            <div>
                              <p className="text-[9px] text-amber-500">Lem Borongan</p>
                              <p className="text-sm font-bold text-amber-700">{formatRp(previewItem.glueBorongan)}</p>
                            </div>
                          </div>
                        )}
                        {previewItem.otherCost > 0 && (
                          <div className="flex items-center gap-2">
                            <Banknote className="w-4 h-4 text-amber-500" />
                            <div>
                              <p className="text-[9px] text-amber-500">Biaya Lain-lain</p>
                              <p className="text-sm font-bold text-amber-700">{formatRp(previewItem.otherCost)}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* === PROFIT === */}
                {previewItem.profitPercent > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-5 h-5 rounded bg-orange-100 flex items-center justify-center">
                        <Percent className="w-3 h-3 text-orange-600" />
                      </div>
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Profit</p>
                    </div>
                    <div className="bg-orange-50 border border-orange-100 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-orange-600">Profit ({previewItem.profitPercent}%)</p>
                        <p className="text-lg font-bold text-orange-700">{formatRp(previewItem.profitAmount)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* === RINGKASAN HARGA === */}
                <div>
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Ringkasan Harga</p>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                      <span className="text-xs text-slate-500">Harga Kertas</span>
                      <span className="text-xs font-semibold text-teal-700">{formatRp(previewItem.totalPaperPrice)}</span>
                    </div>
                    {previewItem.ongkosCetak > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                        <span className="text-xs text-slate-500">Ongkos Cetak</span>
                        <span className="text-xs font-semibold text-blue-700">{formatRp(previewItem.ongkosCetak)}</span>
                      </div>
                    )}
                    {previewItem.ongkosCetak2 > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                        <span className="text-xs text-slate-500">Ongkos Cetak 2</span>
                        <span className="text-xs font-semibold text-fuchsia-700">{formatRp(previewItem.ongkosCetak2)}</span>
                      </div>
                    )}
                    {previewItem.finishingCost > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                        <span className="text-xs text-slate-500">Finishing</span>
                        <span className="text-xs font-semibold text-rose-700">{formatRp(previewItem.finishingCost)}</span>
                      </div>
                    )}
                    {previewItem.packingCost > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                        <span className="text-xs text-slate-500">Ongkos Packing</span>
                        <span className="text-xs font-semibold text-amber-700">{formatRp(previewItem.packingCost)}</span>
                      </div>
                    )}
                    {previewItem.shippingCost > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                        <span className="text-xs text-slate-500">Ongkos Kirim</span>
                        <span className="text-xs font-semibold text-amber-700">{formatRp(previewItem.shippingCost)}</span>
                      </div>
                    )}
                    {previewItem.glueCost > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                        <span className="text-xs text-slate-500">Ongkos Lem</span>
                        <span className="text-xs font-semibold text-amber-700">{formatRp(previewItem.glueCost)}</span>
                      </div>
                    )}
                    {previewItem.glueBorongan > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                        <span className="text-xs text-slate-500">Lem Borongan</span>
                        <span className="text-xs font-semibold text-amber-700">{formatRp(previewItem.glueBorongan)}</span>
                      </div>
                    )}
                    {previewItem.otherCost > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                        <span className="text-xs text-slate-500">Biaya Lain-lain</span>
                        <span className="text-xs font-semibold text-amber-700">{formatRp(previewItem.otherCost)}</span>
                      </div>
                    )}
                    {previewItem.profitAmount > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                        <span className="text-xs text-slate-500">Profit ({previewItem.profitPercent}%)</span>
                        <span className="text-xs font-semibold text-orange-700">{formatRp(previewItem.profitAmount)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between px-3 py-2.5 border-t-2 border-slate-200 bg-slate-100/70">
                      <span className="text-sm font-bold text-slate-700">Sub Total</span>
                      <span className="text-sm font-extrabold text-slate-900">{formatRp(previewItem.subTotal)}</span>
                    </div>
                  </div>
                </div>

                {/* === GRAND TOTAL === */}
                <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl p-4 flex items-center justify-between shadow-lg shadow-orange-500/25">
                  <div>
                    <p className="text-xs text-orange-100">Grand Total</p>
                    <p className="text-2xl font-extrabold text-white">{formatRp(previewItem.grandTotal)}</p>
                    {previewItem.jumlahPesanan && parseInt(previewItem.jumlahPesanan) > 0 && previewItem.grandTotal > 0 && (
                      <p className="text-[11px] text-orange-100 font-semibold mt-0.5">≈ {formatRp(Math.round(previewItem.grandTotal / parseInt(previewItem.jumlahPesanan)))} /pcs</p>
                    )}
                  </div>
                  <div className="text-right text-[10px] text-orange-100/90 space-y-0.5">
                    <p>Sub Total: {formatRp(previewItem.subTotal)}</p>
                    {previewItem.profitAmount > 0 && <p>Profit: {formatRp(previewItem.profitAmount)}</p>}
                  </div>
                </div>
              </FixedDocScaler>
              )}

              {/* Action Buttons — kecil, 1 baris: Cetak · JPG · Edit */}
              <div className="sticky bottom-0 bg-white border-t border-slate-200 px-4 py-3 sm:px-5">
                <div className="flex gap-2">
                  <button onClick={handlePrint} disabled={isPrinting} title={previewItem && isItemHitungCetak(previewItem) ? 'Cetak rincian (fit A5 landscape, sama persis dengan preview)' : 'Cetak rincian'}
                    className="flex-1 min-w-0 flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-semibold py-1.5 sm:py-2 rounded-md sm:rounded-lg text-[11px] sm:text-xs whitespace-nowrap transition-colors">
                    {isPrinting ? <><Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />Cetak...</> : <><Printer className="w-3.5 h-3.5 shrink-0" /> Cetak</>}
                  </button>
                  <button onClick={handleJpg} disabled={isGeneratingJpg} title={previewItem && isItemHitungCetak(previewItem) ? 'Kirim gambar JPG A5 landscape (WhatsApp / unduh)' : 'Kirim gambar JPG ukuran A4 (WhatsApp / unduh)'}
                    className="flex-1 min-w-0 flex items-center justify-center gap-1 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-400 text-white font-semibold py-1.5 sm:py-2 rounded-md sm:rounded-lg text-[11px] sm:text-xs whitespace-nowrap transition-colors">
                    {isGeneratingJpg ? <><Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />JPG...</> : <><FileImage className="w-3.5 h-3.5 shrink-0" /> JPG</>}
                  </button>
                  <button onClick={() => handleRestore(previewItem)} title="Edit perhitungan di kalkulator"
                    className="flex-1 min-w-0 flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-1.5 sm:py-2 rounded-md sm:rounded-lg text-[11px] sm:text-xs whitespace-nowrap transition-colors">
                    <Pencil className="w-3.5 h-3.5 shrink-0" /> Edit
                  </button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
