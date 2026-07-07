'use client'

import { FileText, Printer, RotateCcw, Calculator, Info, MessageCircle, Save, RefreshCw, Trash2, History, UserSearch } from 'lucide-react'
import { useState, useEffect, useMemo, useRef } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { getAuthHeaders } from '@/lib/auth'
import { fetcher } from '@/lib/fetcher'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/language-context'
import { openWhatsApp } from '@/lib/whatsapp-business'
import { useDataChange } from '@/hooks/use-data-change'

interface Paper {
  id: string
  name: string
  grammage: number
  width: number
  height: number
  pricePerRim: number
}

const inputClass = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors'
const selectClass = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors bg-card appearance-none cursor-pointer'
const labelClass = 'flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1.5'
const fmtNum = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const fmtRp = (n: number) => `Rp ${fmtNum(n)}`

export default function HitungHargaKertasPage() {
  const { t } = useLanguage()
  const STORAGE_KEY = 'darrellpos-hitung-harga-kertas'
  const waLinkRef = useRef<HTMLAnchorElement>(null)
  const [papers, setPapers] = useState<Paper[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [selectedPaperId, setSelectedPaperId] = useState('')
  const [namaCustomer, setNamaCustomer] = useState('')
  const [namaCetakan, setNamaCetakan] = useState('')
  const [customGrammage, setCustomGrammage] = useState('')
  const [customWidth, setCustomWidth] = useState('')
  const [customHeight, setCustomHeight] = useState('')
  const [customPricePerRim, setCustomPricePerRim] = useState('')
  const [quantity, setQuantity] = useState('')
  const [mounted, setMounted] = useState(false)

  // Riwayat states
  const [savingRiwayat, setSavingRiwayat] = useState(false)
  const [restoredRiwayatId, setRestoredRiwayatId] = useState<string | null>(null)
  const [riwayatList, setRiwayatList] = useState<any[]>([])

  const fetchPapers = async () => {
    try {
      const response = await fetcher('/api/papers', { headers: getAuthHeaders() })
      const data = await response.json()
      if (Array.isArray(data)) setPapers(data)
    } catch (error) {
      console.error('Error fetching papers:', error)
    }
  }

  const fetchRiwayat = async () => {
    try {
      const res = await fetcher('/api/riwayat-harga-kertas', { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setRiwayatList(Array.isArray(data) ? data : [])
      }
    } catch {}
  }

  // === localStorage ===
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const data = JSON.parse(saved)
        if (data.selectedPaperId) setSelectedPaperId(data.selectedPaperId)
        if (data.namaCustomer) setNamaCustomer(data.namaCustomer)
        if (data.namaCetakan) setNamaCetakan(data.namaCetakan)
        if (data.customGrammage) setCustomGrammage(data.customGrammage)
        if (data.customWidth) setCustomWidth(data.customWidth)
        if (data.customHeight) setCustomHeight(data.customHeight)
        if (data.customPricePerRim) setCustomPricePerRim(data.customPricePerRim)
        if (data.quantity) setQuantity(data.quantity)

      }
    } catch {}
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      selectedPaperId, namaCustomer, namaCetakan, customGrammage, customWidth, customHeight, customPricePerRim, quantity
    }))
  }, [mounted, selectedPaperId, namaCustomer, namaCetakan, customGrammage, customWidth, customHeight, customPricePerRim, quantity])

  useEffect(() => {
    fetchPapers()
    fetchRiwayat()
    fetcher('/api/customers', { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setCustomers(data) })
      .catch(() => {})
  }, [])

  useDataChange(['papers', 'settings'], (entity) => {
    if (entity === 'papers') fetchPapers()
  })

  const selectedPaper = papers.find(p => p.id === selectedPaperId) || null
  const isCustom = !selectedPaperId

  const grammage = selectedPaper ? selectedPaper.grammage : (parseFloat(customGrammage) || 0)
  const paperWidth = selectedPaper ? selectedPaper.width : (parseFloat(customWidth) || 0)
  const paperHeight = selectedPaper ? selectedPaper.height : (parseFloat(customHeight) || 0)
  const pricePerRim = selectedPaper ? selectedPaper.pricePerRim : (parseFloat(customPricePerRim) || 0)
  const qty = parseInt(quantity) || 0

  const calculations = useMemo(() => {
    if (pricePerRim <= 0) return null

    const pricePerSheet = Math.round(pricePerRim / 500)
    const areaCm2 = paperWidth * paperHeight
    const areaM2 = areaCm2 / 10000
    const pricePerM2 = areaM2 > 0 ? Math.round(pricePerSheet / areaM2) : 0
    const weightPerSheetGram = areaM2 > 0 ? grammage * areaM2 : 0
    const weightPerRimKg = (weightPerSheetGram * 500) / 1000
    const totalPrice = Math.round(pricePerSheet * qty)
    const costPerPiece = qty > 0 ? Math.round(totalPrice / qty) : 0
    const totalWeightKg = (weightPerSheetGram * qty) / 1000

    return {
      pricePerSheet,
      pricePerM2,
      weightPerSheetGram,
      weightPerRimKg,
      totalPrice,
      costPerPiece,
      totalWeightKg,
      areaM2,
    }
  }, [pricePerRim, paperWidth, paperHeight, grammage, qty])

  // === Riwayat ===
  const buildPayload = () => ({
    namaCustomer: namaCustomer || '-',
    namaCetakan: namaCetakan || '-',
    paperName: selectedPaper ? selectedPaper.name : 'Custom',
    paperId: selectedPaper?.id || '',
    grammage: grammage.toString(),
    paperWidth: paperWidth.toString(),
    paperHeight: paperHeight.toString(),
    pricePerRim: pricePerRim.toString(),
    quantity: quantity || '0',
    totalPrice: calculations?.totalPrice || 0,
    costPerPiece: calculations?.costPerPiece || 0,
  })

  const resetForm = () => {
    setSelectedPaperId('')
    setNamaCustomer('')
    setNamaCetakan('')
    setCustomGrammage('')
    setCustomWidth('')
    setCustomHeight('')
    setCustomPricePerRim('')
    setQuantity('')
    setRestoredRiwayatId(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  const handleSaveRiwayat = async () => {
    if (!calculations) {
      toast.error('Hitung harga kertas terlebih dahulu')
      return
    }
    setSavingRiwayat(true)
    try {
      const res = await fetcher('/api/riwayat-harga-kertas', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload())
      })
      if (res.ok) {
        toast.success('Riwayat berhasil disimpan!')
        fetchRiwayat()
        resetForm()
      } else {
        toast.error('Gagal menyimpan riwayat')
      }
    } catch {
      toast.error('Gagal menyimpan riwayat')
    }
    setSavingRiwayat(false)
  }

  const handleUpdateRiwayat = async () => {
    if (!restoredRiwayatId) {
      toast.error('Tidak ada data yang di-restore')
      return
    }
    if (!calculations) {
      toast.error('Hitung harga kertas terlebih dahulu')
      return
    }
    setSavingRiwayat(true)
    try {
      const res = await fetcher(`/api/riwayat-harga-kertas/${restoredRiwayatId}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload())
      })
      if (res.ok) {
        toast.success('Riwayat berhasil diupdate!')
        fetchRiwayat()
        resetForm()
      } else {
        toast.error('Gagal mengupdate riwayat')
      }
    } catch {
      toast.error('Gagal mengupdate riwayat')
    }
    setSavingRiwayat(false)
  }

  const handleRestore = (r: any) => {
    setRestoredRiwayatId(r.id)
    setNamaCustomer(r.namaCustomer || '')
    setNamaCetakan(r.namaCetakan || '')
    setSelectedPaperId(r.paperId || '')
    setCustomGrammage(r.grammage || '')
    setCustomWidth(r.paperWidth || '')
    setCustomHeight(r.paperHeight || '')
    setCustomPricePerRim(r.pricePerRim || '')
    setQuantity(r.quantity || '')
    toast.success('Data berhasil di-restore dari riwayat!')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDeleteRiwayat = async (id: string) => {
    if (!confirm('Beneran mau dihapus nih?')) return
    try {
      const res = await fetcher(`/api/riwayat-harga-kertas/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })
      if (res.ok) {
        toast.success('Riwayat berhasil dihapus')
        fetchRiwayat()
      } else {
        toast.error('Gagal menghapus riwayat')
      }
    } catch {
      toast.error('Gagal menghapus riwayat')
    }
  }

  const handleReset = () => {
    resetForm()
    toast.success('Form berhasil direset')
  }

  const handleWhatsApp = () => {
    if (!calculations) { toast.error('Masukkan data kertas terlebih dahulu'); return }
    const paperName = selectedPaper ? selectedPaper.name : 'Custom'
    const message = `Hitung Harga Kertas - www.darrellsoft.com

Customer: ${namaCustomer || '-'}
Nama Cetakan: ${namaCetakan || '-'}
Kertas: ${paperName} (${grammage} gsm)
Ukuran: ${paperWidth} x ${paperHeight} cm
Harga/Rim: ${fmtRp(pricePerRim)}
Berat/Rim: ${Math.round(calculations.weightPerRimKg)} kg` +
      (qty > 0 ? `

Total Harga (${fmtNum(qty)} lbr): ${fmtRp(calculations.totalPrice)}
Harga/Lembar: ${fmtRp(calculations.costPerPiece)}
Total Berat: ${Math.round(calculations.totalWeightKg)} kg` : '')
    const encoded = encodeURIComponent(message)
    openWhatsApp(encoded)
    toast.success('Membuka WhatsApp...')
  }

  const handlePrint = () => {
    if (!calculations) { toast.error('Masukkan data kertas terlebih dahulu'); return }
    const printWindow = window.open('', '', 'height=700,width=600')
    if (!printWindow) { toast.error('Gagal membuka jendela print'); return }
    const now = new Date().toLocaleString('id-ID')
    const paperName = selectedPaper ? selectedPaper.name : 'Custom'
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Hitung Harga Kertas</title>
      <style>body{font-family:Arial,sans-serif;padding:20px;font-size:12px;color:#1e293b}
      h1{text-align:center;font-size:18px;margin-bottom:4px}
      .subtitle{text-align:center;color:#64748b;font-size:11px;margin-bottom:16px}
      .info{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;margin-bottom:16px;font-size:11px}
      .info span{color:#64748b}
      table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px}
      th{background:#f8fafc;border:1px solid #ddd;padding:6px;font-weight:600;text-align:left}
      td{border:1px solid #ddd;padding:6px}
      .right{text-align:right}
      .total{background:linear-gradient(135deg,#059669,#0d9488);color:white;border-radius:8px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;margin-top:12px}
      .total .label{font-size:13px;font-weight:600}
      .total .value{font-size:20px;font-weight:800}
      .footer{text-align:center;color:#94a3b8;font-size:10px;margin-top:16px}
      </style></head><body>
      <h1>Hitung Harga Kertas</h1>
      <p class="subtitle">${namaCetakan || '-'} · Dicetak: ${now}</p>
      <div class="info">
        <span>Kertas:</span> <strong>${paperName}</strong> &nbsp;|&nbsp;
        <span>Gramatur:</span> <strong>${grammage} gsm</strong> &nbsp;|&nbsp;
        <span>Ukuran:</span> <strong>${paperWidth} × ${paperHeight} cm</strong> &nbsp;|&nbsp;
        <span>Harga/Rim:</span> <strong>${fmtRp(pricePerRim)}</strong>
      </div>
      <table>
        <thead><tr><th>Keterangan</th><th class="right">Nilai</th></tr></thead>
        <tbody>
          <tr><td>Harga per Lembar (1 rim = 500 lbr)</td><td class="right">${fmtRp(calculations.pricePerSheet)}</td></tr>
          <tr><td>Harga per m²</td><td class="right">${fmtRp(calculations.pricePerM2)}</td></tr>
          <tr><td>Berat per Lembar</td><td class="right">${Math.round(calculations.weightPerSheetGram)} gram</td></tr>
          <tr><td>Berat per Rim</td><td class="right">${Math.round(calculations.weightPerRimKg)} kg</td></tr>
          ${qty > 0 ? `
          <tr><td><strong>Jumlah</strong></td><td class="right"><strong>${fmtNum(qty)} lembar</strong></td></tr>
          <tr><td><strong>Total Harga</strong></td><td class="right"><strong>${fmtRp(calculations.totalPrice)}</strong></td></tr>
          <tr><td>Harga per Lembar (Cost/Piece)</td><td class="right">${fmtRp(calculations.costPerPiece)}</td></tr>
          <tr><td>Total Berat</td><td class="right">${Math.round(calculations.totalWeightKg)} kg</td></tr>
          ` : ''}
        </tbody>
      </table>
      <div class="footer">www.darrellsoft.com · Kalkulator Hitung Cetakan</div>
      </body></html>`
    printWindow.document.write(html)
    printWindow.document.close()
    setTimeout(() => { printWindow.print() }, 250)
    toast.success('Mencetak...')
  }

  const SectionHeader = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
      <div className="w-6 h-6 rounded-md bg-emerald-100 flex items-center justify-center">{icon}</div>
      <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">{label}</h2>
    </div>
  )

  const ValueBox = ({ label, value, gradient }: { label: string; value: string; gradient: string }) => (
    <div className={`w-full h-[32px] flex items-center justify-between px-2.5 ${gradient} border rounded-lg`}>
      <span className="text-[11px] font-medium text-slate-600">{label}</span>
      <span className="text-xs font-bold">{value}</span>
    </div>
  )

  // Riwayat table component
  const RiwayatTable = ({ items }: { items: any[] }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-[14px] min-w-[600px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80">
            <th className="text-left py-1 px-1 text-slate-500 font-semibold whitespace-nowrap">#</th>
            <th className="text-left py-1 px-1 text-slate-500 font-semibold whitespace-nowrap">Tgl</th>
            <th className="text-left py-1 px-1 text-slate-500 font-semibold whitespace-nowrap">Customer</th>
            <th className="text-left py-1 px-1 text-slate-500 font-semibold whitespace-nowrap hidden sm:table-cell">Nama Cetakan</th>
            <th className="text-left py-1 px-1 text-slate-500 font-semibold whitespace-nowrap">Kertas</th>
            <th className="text-right py-1 px-1 text-slate-500 font-semibold whitespace-nowrap">Qty</th>
            <th className="text-right py-1 px-1 text-slate-500 font-semibold whitespace-nowrap">Total</th>
            <th className="text-right py-1 px-1 text-slate-500 font-semibold whitespace-nowrap hidden lg:table-cell">Per Lbr</th>
            <th className="text-center py-1 px-1 text-slate-500 font-semibold whitespace-nowrap">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r, idx) => (
            <tr key={r.id} className={`border-b border-slate-50 hover:bg-amber-50/40 transition-colors ${idx % 2 === 1 ? 'bg-slate-100' : ''}`}>
              <td className="py-1 px-1 text-slate-400">{idx + 1}</td>
              <td className="py-1 px-1 text-slate-500 whitespace-nowrap">{r.createdAt ? new Date(r.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '-'}</td>
              <td className="py-1 px-1 text-slate-700 font-medium max-w-[120px]">
                {r.namaCustomer && r.namaCustomer !== '-' ? r.namaCustomer : '-'}
              </td>
              <td className="py-1 px-1 text-slate-600 hidden sm:table-cell max-w-[120px]">
                {r.namaCetakan || '-'}
              </td>
              <td className="py-1 px-1 text-slate-600 whitespace-nowrap">
                {r.paperName || '-'} ({r.grammage}gsm)
              </td>
              <td className="py-1 px-1 text-slate-600 text-right whitespace-nowrap">
                {parseInt(r.quantity || 0).toLocaleString('id-ID')}
              </td>
              <td className="py-1 px-1 text-rose-700 font-bold text-right whitespace-nowrap">
                Rp {Math.round(r.totalPrice || 0).toLocaleString('id-ID')}
              </td>
              <td className="py-1 px-1 text-slate-600 text-right hidden lg:table-cell whitespace-nowrap">
                {r.costPerPiece > 0 ? `Rp ${Math.round(r.costPerPiece).toLocaleString('id-ID')}` : '-'}
              </td>
              <td className="py-1 px-1 text-center">
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={() => handleRestore(r)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md text-[11px] font-medium border border-emerald-200 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" /> Restore
                  </button>
                  <button
                    onClick={() => handleDeleteRiwayat(r.id)}
                    className="inline-flex items-center justify-center w-7 h-7 bg-red-50 hover:bg-red-100 text-red-600 rounded-md border border-red-200 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <DashboardLayout title="Hitung Harga Kertas" subtitle="Kalkulator harga kertas per lembar, per m², dan per rim">
      {/* Hidden WA link untuk reuse tab */}
      <a ref={waLinkRef} target="wa" rel="noopener noreferrer" style={{ display: 'none' }} />
      <div className="max-w-[1200px] mx-auto">
        <div className="lg:flex lg:gap-4">

          <div className="flex-1 lg:overflow-y-auto min-w-0 hide-scrollbar">
            <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

              <SectionHeader icon={<Info className="w-3.5 h-3.5 text-blue-600" />} label="Informasi" />
              <div className="px-4 py-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Nama Customer</label>
                    <div className="relative">
                      <UserSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        list="customer-kertas-list"
                        placeholder="Pilih / ketik manual"
                        value={namaCustomer}
                        onChange={(e) => setNamaCustomer(e.target.value)}
                        className={`${inputClass} pl-9`}
                      />
                      <datalist id="customer-kertas-list">
                        {customers.map((c) => (
                          <option key={c.id} value={c.name} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Nama Cetakan</label>
                    <input type="text" placeholder="Contoh: Brosur Lipat 3" value={namaCetakan} onChange={(e) => setNamaCetakan(e.target.value)} className={inputClass} />
                  </div>
                </div>
              </div>

              <SectionHeader icon={<FileText className="w-3.5 h-3.5 text-amber-600" />} label="Pilih Kertas" />
              <div className="px-4 py-3 space-y-3">
                <div>
                  <label className={labelClass}>Jenis Kertas</label>
                  <select value={selectedPaperId} onChange={(e) => setSelectedPaperId(e.target.value)} className={selectClass}>
                    <option value="">Custom (Input Manual)</option>
                    {papers.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — {p.grammage}gsm — {p.width}×{p.height}cm</option>
                    ))}
                  </select>
                </div>

                {isCustom ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelClass}>Gramatur (gsm)</label>
                      <input type="number" min="0" placeholder="120" value={customGrammage} onChange={(e) => setCustomGrammage(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Harga per Rim (Rp)</label>
                      <input type="number" min="0" placeholder="1500000" value={customPricePerRim} onChange={(e) => setCustomPricePerRim(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Lebar Kertas (cm)</label>
                      <input type="number" step="0.1" min="0" placeholder="79" value={customWidth} onChange={(e) => setCustomWidth(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Tinggi Kertas (cm)</label>
                      <input type="number" step="0.1" min="0" placeholder="109" value={customHeight} onChange={(e) => setCustomHeight(e.target.value)} className={inputClass} />
                    </div>
                  </div>
                ) : selectedPaper && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <span className="text-[11px] text-amber-600">Gramatur</span>
                      <p className="text-sm font-bold text-amber-800">{selectedPaper.grammage} gsm</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <span className="text-[11px] text-amber-600">Harga per Rim</span>
                      <p className="text-sm font-bold text-amber-800">{fmtRp(selectedPaper.pricePerRim)}</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <span className="text-[11px] text-amber-600">Ukuran</span>
                      <p className="text-sm font-bold text-amber-800">{selectedPaper.width} × {selectedPaper.height} cm</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <span className="text-[11px] text-amber-600">Nama</span>
                      <p className="text-sm font-bold text-amber-800">{selectedPaper.name}</p>
                    </div>
                  </div>
                )}

                <div>
                  <label className={labelClass}>Jumlah Lembar (opsional)</label>
                  <div className="relative">
                    <FileText className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input type="number" min="0" placeholder="1000" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={`${inputClass} pl-9`} />
                  </div>
                </div>
              </div>

              {!calculations && (
                <div className="px-4 py-8 text-center">
                  <Calculator className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                  <p className="text-sm text-slate-400">Masukkan data kertas untuk mulai menghitung</p>
                  <p className="text-xs text-slate-300 mt-1">Pilih dari master kertas atau input manual</p>
                </div>
              )}

            </div>
          </div>

          <div className="w-full lg:w-[380px] flex-shrink-0 mt-4 lg:mt-0">
            <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden lg:sticky lg:top-4">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
                <div className="w-6 h-6 rounded-md bg-emerald-100 flex items-center justify-center">
                  <Calculator className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Hasil Kalkulasi</h2>
              </div>

              <div className="p-4 space-y-3">
                {calculations ? (
                  <>
                    <div className="space-y-1.5">
                      <ValueBox label="Berat / Lembar" value={`${Math.round(calculations.weightPerSheetGram)} gram`} gradient="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200" />
                      <ValueBox label="Berat / Rim" value={`${Math.round(calculations.weightPerRimKg)} kg`} gradient="bg-gradient-to-r from-orange-50 to-red-50 border-orange-200" />
                    </div>

                    {qty > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50">
                          <span className="text-[11px] text-slate-600">Total Harga ({qty} lbr)</span>
                          <span className="text-xs font-semibold text-slate-700">{fmtRp(calculations.totalPrice)}</span>
                        </div>
                        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50">
                          <span className="text-[11px] text-slate-600">Total Berat</span>
                          <span className="text-xs font-semibold text-slate-700">{Math.round(calculations.totalWeightKg)} kg</span>
                        </div>
                      </div>
                    )}

                    <div className={`rounded-xl p-3.5 text-white ${qty > 0 ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-gradient-to-r from-emerald-500 to-teal-500'}`}>
                      {qty > 0 ? (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold">Total Harga</span>
                          <span className="text-lg font-extrabold">{fmtRp(calculations.totalPrice)}</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold">Harga / Lembar</span>
                          <span className="text-lg font-extrabold">{fmtRp(calculations.pricePerSheet)}</span>
                        </div>
                      )}
                      {qty > 0 ? (
                        <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-white/20">
                          <span className="text-sm font-bold opacity-80">Harga / Lembar</span>
                          <span className="text-sm font-extrabold">{fmtRp(calculations.costPerPiece)}</span>
                        </div>
                      ) : null}
                    </div>

                  </>
                ) : (
                  <div className="py-6 text-center">
                    <Calculator className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="text-xs text-slate-400">Masukkan harga per rim untuk melihat hasil</p>
                  </div>
                )}

                {/* Actions */}
                <div className="space-y-2 pt-1">
                  {restoredRiwayatId ? (
                    <Button
                      onClick={handleUpdateRiwayat}
                      disabled={!calculations || savingRiwayat}
                      className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                      size="sm"
                    >
                      <RefreshCw className={`w-4 h-4 ${savingRiwayat ? 'animate-spin' : ''}`} /> {savingRiwayat ? 'Mengupdate...' : 'Update Riwayat'}
                    </Button>
                  ) : (
                    <Button
                      onClick={handleSaveRiwayat}
                      disabled={!calculations || savingRiwayat}
                      className="w-full gap-2 bg-amber-500 hover:bg-amber-600 text-white"
                      size="sm"
                    >
                      {savingRiwayat ? 'Menyimpan...' : 'Simpan Riwayat'}
                    </Button>
                  )}
                  <Button
                    onClick={handleWhatsApp}
                    disabled={!calculations}
                    className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
                    size="sm"
                  >
                    <MessageCircle className="w-4 h-4" /> Kirim ke WhatsApp
                  </Button>
                  <Button
                    onClick={handlePrint}
                    disabled={!calculations}
                    className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                    size="sm"
                  >
                    <Printer className="w-4 h-4" /> Cetak
                  </Button>
                  <Button
                    onClick={handleReset}
                    disabled={!calculations && !restoredRiwayatId}
                    variant="outline"
                    className="w-full gap-2"
                    size="sm"
                  >
                    <RotateCcw className="w-4 h-4" /> Reset
                  </Button>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* ========== RIWAYAT HARGA KERTAS (Full Width) ========== */}
        <div className="mt-4">
          <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
              <div className="w-6 h-6 rounded-md bg-amber-100 flex items-center justify-center">
                <History className="w-3.5 h-3.5 text-amber-600" />
              </div>
              <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Riwayat Harga Kertas</h2>
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">{riwayatList.length}</span>
            </div>
            {riwayatList.length > 0 ? (
              <RiwayatTable items={riwayatList} />
            ) : (
              <div className="px-4 py-6 text-center">
                <History className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-xs text-slate-400">Belum ada riwayat harga kertas</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
