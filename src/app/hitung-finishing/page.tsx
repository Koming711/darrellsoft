'use client'

import { Layers, Plus, Trash2, Printer, RotateCcw, Calculator, Ruler, Info, MessageCircle, History, Save, UserSearch, RefreshCw } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { getAuthHeaders } from '@/lib/auth'
import { fetcher } from '@/lib/fetcher'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/language-context'
import { openWhatsApp } from '@/lib/whatsapp-business'
import { useDataChange } from '@/hooks/use-data-change'

interface Finishing {
  id: string
  name: string
  minimumSheets: number
  minimumPrice: number
  additionalPrice: number
  pricePerCm: number
}

interface SelectedFinishing {
  finishing: Finishing
  cost: number
  isMin: boolean
  breakdown: string
}

const STORAGE_KEY = 'darrellpos-hitung-finishing'
const inputClass = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors'
const selectClass = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors bg-white appearance-none cursor-pointer'
const labelClass = 'flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1.5'

export default function HitungFinishingPage() {
  const { t } = useLanguage()
  const waLinkRef = useRef<HTMLAnchorElement>(null)
  const [finishings, setFinishings] = useState<Finishing[]>([])
  const [selectedFinishings, setSelectedFinishings] = useState<SelectedFinishing[]>([])
  const [selectedFinishingIds, setSelectedFinishingIds] = useState<string[]>([])
  const [namaCustomer, setNamaCustomer] = useState('')
  const [namaCetakan, setNamaCetakan] = useState('')
  const [jumlahLembar, setJumlahLembar] = useState('')
  const [lebarCm, setLebarCm] = useState('')
  const [tinggiCm, setTinggiCm] = useState('')
  const [mounted, setMounted] = useState(false)
  const [savingRiwayat, setSavingRiwayat] = useState(false)
  const [restoredRiwayatId, setRestoredRiwayatId] = useState<string | null>(null)
  const [riwayatList, setRiwayatList] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])

  // === Riwayat ===
  const fetchRiwayat = async () => {
    try {
      const res = await fetcher('/api/riwayat-finishing', { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setRiwayatList(Array.isArray(data) ? data : [])
      }
    } catch {}
  }

  const buildPayload = () => ({
    namaCustomer: namaCustomer || '-',
    namaCetakan: namaCetakan || '-',
    jumlahLembar: jumlahLembar || '0',
    lebarCm: lebarCm || '0',
    tinggiCm: tinggiCm || '0',
    finishingNames: selectedFinishings.map(sf => sf.finishing.name).join(', '),
    finishingIds: selectedFinishings.map(sf => sf.finishing.id).join(','),
    totalCost,
    hargaPerLembar,
  })

  const resetForm = () => {
    setNamaCustomer('')
    setNamaCetakan('')
    setJumlahLembar('')
    setLebarCm('')
    setTinggiCm('')
    setSelectedFinishings([])
    setSelectedFinishingIds([])
    setRestoredRiwayatId(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  const handleSaveRiwayat = async () => {
    if (selectedFinishings.length === 0) {
      toast.error('Tambahkan finishing terlebih dahulu')
      return
    }
    setSavingRiwayat(true)
    try {
      const res = await fetcher('/api/riwayat-finishing', {
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
    if (selectedFinishings.length === 0) {
      toast.error('Tambahkan finishing terlebih dahulu')
      return
    }
    setSavingRiwayat(true)
    try {
      const res = await fetcher(`/api/riwayat-finishing/${restoredRiwayatId}`, {
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

  // === Restore from URL params ===
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const restored = params.get('restoredFromRiwayat')
    if (restored === '1') {
      const ids = params.get('finishingIds')
      const name = params.get('namaCetakan') || ''
      const qty = params.get('jumlahLembar') || ''
      const w = params.get('lebarCm') || ''
      const h = params.get('tinggiCm') || ''

      const cust = params.get('namaCustomer') || ''
      setNamaCustomer(cust)
      setNamaCetakan(name)
      setJumlahLembar(qty)
      setLebarCm(w)
      setTinggiCm(h)

      if (ids) {
        const idArr = ids.split(',').filter(Boolean)
        setSelectedFinishingIds(idArr)
      }

      toast.success('Data berhasil di-restore dari riwayat!')
      // Clean URL params
      window.history.replaceState({}, '', '/hitung-finishing')
    }
  }, [])

  // === Load from localStorage ===
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const data = JSON.parse(saved)
        if (data.namaCustomer) setNamaCustomer(data.namaCustomer)
        if (data.namaCetakan) setNamaCetakan(data.namaCetakan)
        if (data.jumlahLembar) setJumlahLembar(data.jumlahLembar)
        if (data.lebarCm) setLebarCm(data.lebarCm)
        if (data.tinggiCm) setTinggiCm(data.tinggiCm)
        if (Array.isArray(data.selectedFinishingIds)) setSelectedFinishingIds(data.selectedFinishingIds)
      }
    } catch { /* ignore */ }
    setMounted(true)
  }, [])

  // === Save to localStorage ===
  useEffect(() => {
    if (!mounted) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      namaCustomer, namaCetakan, jumlahLembar, lebarCm, tinggiCm, selectedFinishingIds
    }))
  }, [mounted, namaCustomer, namaCetakan, jumlahLembar, lebarCm, tinggiCm, selectedFinishingIds])

  // Rebuild selected finishings from IDs when finishings are loaded
  useEffect(() => {
    if (finishings.length === 0 || selectedFinishingIds.length === 0) return
    setSelectedFinishings(prev => {
      if (prev.length > 0) return prev
      const rebuilt = selectedFinishingIds
        .map(id => finishings.find(f => f.id === id))
        .filter(Boolean)
        .map(f => {
          const result = calculateFinishingCost(f)
          return { finishing: f, ...result }
        })
      return rebuilt as SelectedFinishing[]
    })
  }, [finishings, selectedFinishingIds])

  const fetchFinishings = async () => {
    try {
      const response = await fetcher('/api/finishings', { headers: getAuthHeaders() })
      const data = await response.json()
      if (Array.isArray(data)) setFinishings(data)
    } catch (error) {
      console.error('Error fetching finishings:', error)
    }
  }

  useEffect(() => {
    fetchFinishings()
    fetchRiwayat()
    // Fetch customers for datalist
    fetcher('/api/customers', { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setCustomers(data) })
      .catch(() => {})
  }, [])

  useDataChange(['finishings', 'settings'], (entity) => {
    if (entity === 'finishings') fetchFinishings()
  })

  const calculateFinishingCost = (finishing: Finishing): { cost: number; isMin: boolean; breakdown: string } => {
    const qty = parseInt(jumlahLembar) || 0
    const cw = parseFloat(lebarCm) || 0
    const ch = parseFloat(tinggiCm) || 0

    const minSheets = finishing.minimumSheets
    const minPrice = finishing.minimumPrice
    const hargaLebih = finishing.additionalPrice
    const hargaPerCm = finishing.pricePerCm
    const isPond = finishing.name.toLowerCase().includes('pond')

    if (qty <= 0) {
      return { cost: minPrice, isMin: true, breakdown: `Harga minimum: Rp ${minPrice.toLocaleString('id-ID')}` }
    }

    // Pond type: different calculation (per sheet cutting)
    if (isPond) {
      if (qty <= minSheets) {
        return {
          cost: minPrice,
          isMin: true,
          breakdown: `Qty ${qty} ≤ minim ${minSheets} → Harga minimum: Rp ${minPrice.toLocaleString('id-ID')}`
        }
      }
      const selisih = qty - minSheets
      const tambahan = selisih * hargaLebih
      const total = minPrice + tambahan
      return {
        cost: total,
        isMin: false,
        breakdown: `Min Rp ${minPrice.toLocaleString('id-ID')} + (${qty} - ${minSheets}) × Rp ${hargaLebih.toLocaleString('id-ID')} = Rp ${total.toLocaleString('id-ID')}`
      }
    }

    // Standard finishing: area-based + per-sheet
    let part1 = 0
    let part1Text = ''
    if (qty > minSheets && hargaLebih > 0) {
      const selisih = qty - minSheets
      part1 = selisih * hargaLebih
      part1Text = `(${qty} - ${minSheets}) × Rp ${hargaLebih.toLocaleString('id-ID')} = Rp ${part1.toLocaleString('id-ID')}`
    }

    let part2 = 0
    let part2Text = ''
    if (cw > 0 && ch > 0 && hargaPerCm > 0) {
      const areaCost = cw * ch * hargaPerCm
      part2 = areaCost * qty
      part2Text = `(${cw} × ${ch}) × Rp ${hargaPerCm.toLocaleString('id-ID')} × ${qty} = Rp ${part2.toLocaleString('id-ID')}`
    }

    const total = part1 + part2

    if (total <= minPrice) {
      const parts = [part1Text, part2Text].filter(Boolean)
      const calcText = parts.length > 0 ? `${parts.join(' + ')} = Rp ${total.toLocaleString('id-ID')} ≤ Rp ${minPrice.toLocaleString('id-ID')}` : ''
      return {
        cost: minPrice,
        isMin: true,
        breakdown: calcText ? `${calcText} → Harga minimum: Rp ${minPrice.toLocaleString('id-ID')}` : `Harga minimum: Rp ${minPrice.toLocaleString('id-ID')}`
      }
    }

    const parts = [part1Text, part2Text].filter(Boolean)
    const breakdown = parts.join(' + ') + ` = Rp ${total.toLocaleString('id-ID')}`

    return { cost: total, isMin: false, breakdown }
  }

  // Recalculate all selected finishings when inputs change
  useEffect(() => {
    setSelectedFinishings(prev =>
      prev.map(sf => {
        const result = calculateFinishingCost(sf.finishing)
        return { ...sf, cost: result.cost, isMin: result.isMin, breakdown: result.breakdown }
      })
    )
  }, [jumlahLembar, lebarCm, tinggiCm])

  const handleAddFinishing = (finishingId: string) => {
    if (!finishingId) {
      toast.error('Pilih finishing terlebih dahulu')
      return
    }
    const finishing = finishings.find(f => f.id === finishingId)
    if (!finishing) return
    if (selectedFinishings.find(sf => sf.finishing.id === finishingId)) {
      toast.error('Finishing ini sudah ditambahkan')
      return
    }
    const result = calculateFinishingCost(finishing)
    setSelectedFinishings([...selectedFinishings, { finishing, ...result }])
    setSelectedFinishingIds(prev => [...prev, finishingId])
    toast.success(`${finishing.name} ditambahkan`)
  }

  const handleRemoveFinishing = (finishingId: string) => {
    const removed = selectedFinishings.find(sf => sf.finishing.id === finishingId)
    setSelectedFinishings(selectedFinishings.filter(sf => sf.finishing.id !== finishingId))
    setSelectedFinishingIds(prev => prev.filter(id => id !== finishingId))
    if (removed) toast.success(`${removed.finishing.name} dihapus`)
  }

  const totalCost = Math.round(selectedFinishings.reduce((sum, sf) => sum + sf.cost, 0))
  const qty = parseInt(jumlahLembar) || 0
  const hargaPerLembar = qty > 0 && selectedFinishings.length > 0 ? Math.round(totalCost / qty) : 0

  const fmt = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`

  const handleReset = () => {
    resetForm()
    toast.success('Form berhasil direset')
  }

  const handleWhatsApp = () => {
    if (selectedFinishings.length === 0) { toast.error('Tambahkan finishing terlebih dahulu'); return }
    const text = `Hitung Finishing - www.darrellsoft.com\n\n` +
      `Nama Customer: ${namaCustomer || '-'}\n` +
      `Nama Cetakan: ${namaCetakan || '-'}\n` +
      `Jumlah: ${qty.toLocaleString('id-ID')} lembar\n` +
      `Ukuran: ${lebarCm || '0'} × ${tinggiCm || '0'} cm\n\n` +
      `Daftar Finishing:\n` +
      selectedFinishings.map((sf, i) => `${i + 1}. ${sf.finishing.name}: ${fmt(sf.cost)}`).join('\n') +
      `\n\nTotal: ${fmt(totalCost)}\n` +
      `Harga/Lembar: ${fmt(hargaPerLembar)}`
    const encoded = encodeURIComponent(text)
    openWhatsApp(encoded)
    toast.success('Membuka WhatsApp...')
  }

  const handlePrint = () => {
    if (selectedFinishings.length === 0) {
      toast.error('Tambahkan finishing terlebih dahulu')
      return
    }
    const printWindow = window.open('', '', 'height=800,width=700')
    if (!printWindow) { toast.error('Gagal membuka jendela print'); return }

    const now = new Date().toLocaleString('id-ID')
    const rows = selectedFinishings.map((sf, i) => `
      <tr>
        <td style="padding:6px;border:1px solid #ddd;text-align:center">${i + 1}</td>
        <td style="padding:6px;border:1px solid #ddd">${sf.finishing.name}</td>
        <td style="padding:6px;border:1px solid #ddd;text-align:right">Rp ${sf.cost.toLocaleString('id-ID')}</td>
      </tr>
    `).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Hitung Finishing</title>
      <style>
        body{font-family:Arial,sans-serif;padding:20px;font-size:12px;color:#1e293b}
        h1{text-align:center;font-size:18px;margin-bottom:4px}
        .subtitle{text-align:center;color:#64748b;font-size:11px;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px}
        th{background:#f8fafc;border:1px solid #ddd;padding:6px;font-weight:600;text-align:left}
        td{border:1px solid #ddd;padding:6px}
        .right{text-align:right}
        .total{background:linear-gradient(135deg,#059669,#0d9488);color:white;border-radius:8px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;margin-top:12px}
        .total .label{font-size:13px;font-weight:600}
        .total .value{font-size:20px;font-weight:800}
        .info{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;margin-bottom:16px;font-size:11px}
        .info span{color:#64748b}
        .footer{text-align:center;color:#94a3b8;font-size:10px;margin-top:16px}
      </style></head><body>
      <h1>Hitung Finishing</h1>
      <p class="subtitle">${namaCetakan || '-'} · Dicetak: ${now}</p>
      <div class="info">
        <span>Jumlah:</span> <strong>${qty.toLocaleString('id-ID')} lembar</strong> &nbsp;|&nbsp;
        <span>Ukuran:</span> <strong>${lebarCm || '0'} × ${tinggiCm || '0'} cm</strong>
      </div>
      <table>
        <thead><tr><th>#</th><th>Nama Finishing</th><th class="right">Biaya</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="total"><span class="label">Total Finishing</span><span class="value">Rp ${totalCost.toLocaleString('id-ID')}</span></div>
      ${hargaPerLembar > 0 ? `<div style="text-align:right;margin-top:8px;font-size:11px;color:#64748b">Harga per lembar: <strong>Rp ${hargaPerLembar.toLocaleString('id-ID')}</strong></div>` : ''}
      <div class="footer">www.darrellsoft.com · Kalkulator Hitung Cetakan</div>
      </body></html>`

    printWindow.document.write(html)
    printWindow.document.close()
    setTimeout(() => { printWindow.print() }, 250)
    toast.success('Mencetak...')
  }

  const handleRestore = (r: any) => {
    // Restore data langsung ke state tanpa reload halaman
    setRestoredRiwayatId(r.id)
    setNamaCustomer(r.namaCustomer || '')
    setNamaCetakan(r.namaCetakan || '')
    setJumlahLembar(r.jumlahLembar || '')
    setLebarCm(r.lebarCm && r.lebarCm !== '0' ? r.lebarCm : '')
    setTinggiCm(r.tinggiCm && r.tinggiCm !== '0' ? r.tinggiCm : '')

    if (r.finishingIds) {
      const idArr = r.finishingIds.split(',').filter(Boolean)
      setSelectedFinishingIds(idArr)
      setSelectedFinishings([])
    }

    toast.success('Data berhasil di-restore dari riwayat!')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDeleteRiwayat = async (id: string) => {
    if (!confirm('Beneran mau dihapus nih?')) return
    try {
      const res = await fetcher(`/api/riwayat-finishing/${id}`, {
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

  // Section header
  const SectionHeader = ({ icon, label, badge }: { icon: React.ReactNode; label: string; badge?: number }) => (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
      <div className="w-6 h-6 rounded-md bg-emerald-100 flex items-center justify-center">{icon}</div>
      <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">{label}</h2>
      {badge !== undefined && badge > 0 && (
        <span className="text-[11px] font-semibold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded-full">{badge}</span>
      )}
    </div>
  )

  const ValueBox = ({ label, value, gradient }: { label: string; value: string; gradient: string }) => (
    <div className={`w-full h-[32px] flex items-center justify-between px-2.5 ${gradient} border rounded-lg`}>
      <span className="text-[11px] font-medium text-slate-600">{label}</span>
      <span className="text-xs font-bold">{value}</span>
    </div>
  )

  // Riwayat table component (full width, responsive)
  const RiwayatTable = ({ items }: { items: any[] }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-[14px] min-w-[600px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80">
            <th className="text-left py-1 px-1 text-slate-500 font-semibold whitespace-nowrap">#</th>
            <th className="text-left py-1 px-1 text-slate-500 font-semibold whitespace-nowrap">Tgl</th>
            <th className="text-left py-1 px-1 text-slate-500 font-semibold whitespace-nowrap">Customer</th>
            <th className="text-left py-1 px-1 text-slate-500 font-semibold whitespace-nowrap">Finishing</th>
            <th className="text-left py-1 px-1 text-slate-500 font-semibold whitespace-nowrap hidden sm:table-cell">Nama Cetakan</th>
            <th className="text-right py-1 px-1 text-slate-500 font-semibold whitespace-nowrap">Qty</th>
            <th className="text-left py-1 px-1 text-slate-500 font-semibold whitespace-nowrap hidden md:table-cell">Ukuran</th>
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
              <td className="py-1 px-1 text-slate-600 max-w-[160px]">
                {r.finishingNames}
              </td>
              <td className="py-1 px-1 text-slate-600 hidden sm:table-cell max-w-[120px]">
                {r.namaCetakan || '-'}
              </td>
              <td className="py-1 px-1 text-slate-600 text-right whitespace-nowrap">
                {parseInt(r.jumlahLembar || 0).toLocaleString('id-ID')}
              </td>
              <td className="py-1 px-1 text-slate-500 hidden sm:table-cell whitespace-nowrap">
                {r.lebarCm && r.lebarCm !== '0' ? `${r.lebarCm} × ${r.tinggiCm} cm` : '-'}
              </td>
              <td className="py-1 px-1 text-rose-700 font-bold text-right whitespace-nowrap">
                Rp {Math.round(r.totalCost || 0).toLocaleString('id-ID')}
              </td>
              <td className="py-1 px-1 text-slate-600 text-right hidden md:table-cell whitespace-nowrap">
                {r.hargaPerLembar > 0 ? `Rp ${Math.round(r.hargaPerLembar).toLocaleString('id-ID')}` : '-'}
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
    <DashboardLayout title="Hitung Finishing" subtitle="Kalkulator biaya finishing cetakan">
      {/* Hidden WA link untuk reuse tab */}
      <a ref={waLinkRef} target="wa" rel="noopener noreferrer" style={{ display: 'none' }} />
      <div className="max-w-[1200px] mx-auto">
        <div className="lg:flex lg:gap-4">

          {/* ========== LEFT: INPUT ========== */}
          <div className="flex-1 lg:overflow-y-auto min-w-0 hide-scrollbar">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

              {/* Section: Info Cetakan */}
              <SectionHeader icon={<Info className="w-3.5 h-3.5 text-blue-600" />} label="Informasi" />
              <div className="px-4 py-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Nama Customer</label>
                    <div className="relative">
                      <UserSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        list="customer-finishing-list"
                        placeholder="Pilih / ketik manual"
                        value={namaCustomer}
                        onChange={(e) => setNamaCustomer(e.target.value)}
                        className={`${inputClass} pl-9`}
                      />
                      <datalist id="customer-finishing-list">
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
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Lebar (cm)</label>
                    <div className="relative">
                      <Ruler className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input type="number" step="0.1" min="0" placeholder="21" value={lebarCm} onChange={(e) => setLebarCm(e.target.value)} className={`${inputClass} pl-9`} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Tinggi (cm)</label>
                    <div className="relative">
                      <Ruler className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input type="number" step="0.1" min="0" placeholder="29.7" value={tinggiCm} onChange={(e) => setTinggiCm(e.target.value)} className={`${inputClass} pl-9`} />
                    </div>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Jumlah Lembar</label>
                  <div className="relative">
                    <Layers className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input type="number" min="0" placeholder="1000" value={jumlahLembar} onChange={(e) => setJumlahLembar(e.target.value)} className={`${inputClass} pl-9`} />
                  </div>
                </div>
              </div>

              {/* Section: Pilih Finishing */}
              <SectionHeader icon={<Layers className="w-3.5 h-3.5 text-rose-600" />} label="Pilih Finishing" badge={selectedFinishings.length} />
              <div className="px-4 py-3">
                <div className="flex gap-2">
                  <select id="finishing-select" className={selectClass} defaultValue="">
                    <option value="">-- Pilih finishing --</option>
                    {finishings.filter(f => !selectedFinishings.find(sf => sf.finishing.id === f.id)).map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                  <Button
                    onClick={() => {
                      const s = document.getElementById('finishing-select') as HTMLSelectElement
                      if (s) { handleAddFinishing(s.value); s.value = '' }
                    }}
                    className="h-[34px] px-3 bg-rose-600 hover:bg-rose-700 text-white text-xs flex-shrink-0"
                    size="sm"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Tambah
                  </Button>
                </div>
              </div>

              {/* Section: Daftar Finishing Terpilih */}
              {selectedFinishings.length > 0 && (
                <div className="border-t border-slate-100">
                  <div className="px-4 py-2 bg-slate-50/60">
                    <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Daftar Finishing</h3>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-[240px] overflow-y-auto">
                    {selectedFinishings.map((sf) => (
                      <div key={sf.finishing.id} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="w-6 h-6 rounded-md bg-purple-50 flex items-center justify-center flex-shrink-0">
                              <Layers className="w-3.5 h-3.5 text-purple-600" />
                            </div>
                            <span className="text-sm font-semibold text-slate-800 truncate">{sf.finishing.name}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-sm font-bold text-emerald-600">Rp {sf.cost.toLocaleString('id-ID')}</span>
                            <button
                              onClick={() => handleRemoveFinishing(sf.finishing.id)}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {selectedFinishings.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <Calculator className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                  <p className="text-sm text-slate-400">Belum ada finishing dipilih</p>
                  <p className="text-xs text-slate-300 mt-1">Pilih finishing dari daftar di atas untuk mulai menghitung</p>
                </div>
              )}

            </div>

          </div>

          {/* ========== RIGHT: SUMMARY ========== */}
          <div className="w-full lg:w-[380px] flex-shrink-0 mt-4 lg:mt-0">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden lg:sticky lg:top-4">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
                <div className="w-6 h-6 rounded-md bg-emerald-100 flex items-center justify-center">
                  <Calculator className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Ringkasan</h2>
              </div>

              <div className="p-4 space-y-3">
                {/* Input summary */}
                <div className="space-y-1.5">
                  <ValueBox
                    label="Jumlah Lembar"
                    value={qty > 0 ? `${qty.toLocaleString('id-ID')} lbr` : '-'}
                    gradient="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200"
                  />
                  <ValueBox
                    label="Ukuran"
                    value={(parseFloat(lebarCm) > 0 && parseFloat(tinggiCm) > 0) ? `${lebarCm} × ${tinggiCm} cm` : '-'}
                    gradient="bg-gradient-to-r from-violet-50 to-purple-50 border-violet-200"
                  />
                </div>

                {/* Per-finishing breakdown */}
                {selectedFinishings.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-100">
                    {selectedFinishings.map((sf) => (
                      <div key={sf.finishing.id} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50">
                        <span className="text-[11px] text-slate-600 truncate max-w-[240px]">{sf.finishing.name}</span>
                        <span className="text-xs font-semibold text-slate-700 flex-shrink-0">Rp {sf.cost.toLocaleString('id-ID')}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Total */}
                <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl p-3.5 text-white">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Total Finishing</span>
                    <span className="text-lg font-extrabold">Rp {totalCost.toLocaleString('id-ID')}</span>
                  </div>
                  {hargaPerLembar > 0 && (
                    <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-white/20">
                      <span className="text-[11px] opacity-80">Per Lembar</span>
                      <span className="text-xs font-bold">Rp {hargaPerLembar.toLocaleString('id-ID')}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="space-y-2 pt-1">
                  {restoredRiwayatId ? (
                    <Button
                      onClick={handleUpdateRiwayat}
                      disabled={selectedFinishings.length === 0 || savingRiwayat}
                      className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                      size="sm"
                    >
                      <RefreshCw className={`w-4 h-4 ${savingRiwayat ? 'animate-spin' : ''}`} /> {savingRiwayat ? 'Mengupdate...' : 'Update Riwayat'}
                    </Button>
                  ) : (
                    <Button
                      onClick={handleSaveRiwayat}
                      disabled={selectedFinishings.length === 0 || savingRiwayat}
                      className="w-full gap-2 bg-amber-500 hover:bg-amber-600 text-white"
                      size="sm"
                    >
                      {savingRiwayat ? 'Menyimpan...' : 'Simpan Riwayat'}
                    </Button>
                  )}
                  <Button
                    onClick={handleWhatsApp}
                    disabled={selectedFinishings.length === 0}
                    className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
                    size="sm"
                  >
                    <MessageCircle className="w-4 h-4" /> Kirim ke WhatsApp
                  </Button>
                  <Button
                    onClick={handlePrint}
                    disabled={selectedFinishings.length === 0}
                    className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                    size="sm"
                  >
                    <Printer className="w-4 h-4" /> Cetak
                  </Button>
                  <Button
                    onClick={handleReset}
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

        {/* ========== RIWAYAT FINISHING (Full Width) ========== */}
        <div className="mt-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
              <div className="w-6 h-6 rounded-md bg-amber-100 flex items-center justify-center">
                <History className="w-3.5 h-3.5 text-amber-600" />
              </div>
              <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Riwayat Finishing</h2>
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">{riwayatList.length}</span>
            </div>
            {riwayatList.length > 0 ? (
              <RiwayatTable items={riwayatList} />
            ) : (
              <div className="px-4 py-6 text-center">
                <History className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-xs text-slate-400">Belum ada riwayat finishing</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
