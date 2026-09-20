'use client'

import { Printer, RotateCcw, Calculator, Info, Palette, MessageCircle, Save, RefreshCw, Trash2, History, UserSearch } from 'lucide-react'
import { useState, useEffect, useMemo, useRef } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { getAuthHeaders } from '@/lib/auth'
import { fetcher } from '@/lib/fetcher'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useLanguage } from '@/contexts/language-context'
import { openWhatsApp } from '@/lib/whatsapp-business'
import { useDataChange } from '@/hooks/use-data-change'

// === Interfaces ===
interface PrintingCost {
  id: string
  machineName: string
  grammage: number
  printAreaWidth: number
  printAreaHeight: number
  pricePerColor: number
  specialColorPrice: number
  minimumPrintQuantity: number
  priceAboveMinimumPerSheet: number
  platePricePerSheet: number
}

// === CSS Classes ===
const inputClass = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors'
const selectClass = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors bg-card appearance-none cursor-pointer'
const labelClass = 'flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1.5'

// Kartu riwayat (mobile) — 1 halaman fit to mobile, CRUD (Restore/Hapus) selalu bisa diakses
function RiwayatCards({ items, restoredId, onRestore, onDelete }: {
  items: any[]
  restoredId: string | null
  onRestore: (r: any) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="md:hidden p-3 space-y-2.5">
      {items.map((r) => (
        <div key={r.id} className={`rounded-xl border p-3.5 transition-colors ${restoredId === r.id ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
          {/* Baris 1: customer + cetakan + tanggal */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[15px] text-slate-900 truncate">{r.namaCustomer && r.namaCustomer !== '-' ? r.namaCustomer : '-'}</p>
              <p className="text-xs text-slate-500 truncate">{r.namaCetakan || '-'}</p>
            </div>
            <span className="text-[10px] text-slate-400 whitespace-nowrap flex-shrink-0 mt-1">{r.createdAt ? new Date(r.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '-'}</span>
          </div>

          {/* Baris 2: mesin + warna */}
          <p className="text-[11px] text-slate-600 mt-1.5 leading-snug">
            {r.machineName || '-'} · {r.jumlahWarna} warna{parseInt(r.warnaKhusus || 0) > 0 ? ` +${r.warnaKhusus} khusus` : ''}
          </p>

          {/* Baris 3: ringkasan angka */}
          <div className="grid grid-cols-3 gap-2 mt-2.5 bg-slate-50 rounded-lg p-2.5 text-center">
            <div>
              <p className="text-[13px] font-bold text-slate-800 leading-tight">{parseInt(r.jumlahLembar || 0).toLocaleString('id-ID')}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Jumlah</p>
            </div>
            <div className="border-x border-slate-200">
              <p className="text-[13px] font-bold text-slate-800 leading-tight">{r.hargaPerLembar > 0 ? `Rp ${Math.round(r.hargaPerLembar).toLocaleString('id-ID')}` : '-'}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Per Lbr</p>
            </div>
            <div>
              <p className="text-[13px] font-extrabold text-emerald-700 leading-tight">Rp {Math.round(r.totalOngkosCetak || 0).toLocaleString('id-ID')}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Total</p>
            </div>
          </div>

          {/* Baris 4: aksi CRUD (touch target 44px) */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
            <button
              onClick={() => onRestore(r)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[44px] bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[13px] font-semibold border border-emerald-200 transition-colors"
            >
              <RotateCcw className="w-4 h-4" /> Restore
            </button>
            <button
              onClick={() => onDelete(r.id)}
              aria-label="Hapus riwayat"
              title="Hapus"
              className="inline-flex items-center justify-center w-[44px] h-[44px] bg-red-50 hover:bg-red-100 text-red-600 rounded-lg border border-red-200 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function HitungOngkosCetakPage() {
  const { t } = useLanguage()
  const waLinkRef = useRef<HTMLAnchorElement>(null)

  // === Data states ===
  const [printingCosts, setPrintingCosts] = useState<PrintingCost[]>([])
  const [customers, setCustomers] = useState<any[]>([])

  // === Form states ===
  const STORAGE_KEY = 'hitung-ongkos-cetak-form'

  const [namaCustomer, setNamaCustomer] = useState('')
  const [namaCetakan, setNamaCetakan] = useState('')
  const [selectedMachineId, setSelectedMachineId] = useState('')
  const [jumlahWarna, setJumlahWarna] = useState('')
  const [warnaKhusus, setWarnaKhusus] = useState('')
  const [hargaPlat, setHargaPlat] = useState('')
  const [selectedMachineId2, setSelectedMachineId2] = useState('')
  const [jumlahWarna2, setJumlahWarna2] = useState('')
  const [warnaKhusus2, setWarnaKhusus2] = useState('')
  const [hargaPlat2, setHargaPlat2] = useState('')
  const [jumlahLembar, setJumlahLembar] = useState('')
  const [isLoaded, setIsLoaded] = useState(false)

  // === Riwayat states ===
  const [savingRiwayat, setSavingRiwayat] = useState(false)
  const [restoredRiwayatId, setRestoredRiwayatId] = useState<string | null>(null)
  const [riwayatList, setRiwayatList] = useState<any[]>([])

  // === Riwayat ===
  const fetchRiwayat = async () => {
    try {
      const res = await fetcher('/api/riwayat-ongkos-cetak', { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setRiwayatList(Array.isArray(data) ? data : [])
      }
    } catch {}
  }

  // === Fetch APIs ===
  const fetchPrintingCostsData = async () => {
    try {
      const printingRes = await fetcher('/api/printing-costs', { headers: getAuthHeaders() })
      const printingData = await printingRes.json()
      if (Array.isArray(printingData)) setPrintingCosts(printingData)
    } catch (error) {
      console.error('Error fetching data:', error)
    }
  }

  const fetchSettingsData = () => {
    fetcher('/api/settings?key=profit', { headers: getAuthHeaders() })
      .then(res => res.json())
      .then(data => { /* settings can be consumed as needed */ })
      .catch(() => {})
  }

  useEffect(() => {
    fetchPrintingCostsData()
    fetchRiwayat()
    fetcher('/api/customers', { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setCustomers(data) })
      .catch(() => {})
  }, [])

  useDataChange(['printing-costs', 'settings'], (entity) => {
    if (entity === 'printing-costs') fetchPrintingCostsData()
    if (entity === 'settings') fetchSettingsData()
  })

  // === Derived values ===
  const selectedMachine = printingCosts.find(m => m.id === selectedMachineId) || null
  const selectedMachine2 = printingCosts.find(m => m.id === selectedMachineId2) || null

  const qty = parseInt(jumlahLembar) || 0
  const warna = parseInt(jumlahWarna) || 0
  const warnaKhususVal = parseInt(warnaKhusus) || 0
  const plat = parseFloat(hargaPlat) || 0
  const warna2 = parseInt(jumlahWarna2) || 0
  const warnaKhususVal2 = parseInt(warnaKhusus2) || 0
  const plat2 = parseFloat(hargaPlat2) || 0

  // Auto-fill hargaPlat when machine changes
  useEffect(() => {
    if (selectedMachine && !hargaPlat) {
      setHargaPlat(selectedMachine.platePricePerSheet?.toString() || '')
    }
  }, [selectedMachine])

  // Auto-fill hargaPlat2 when machine2 changes
  useEffect(() => {
    if (selectedMachine2 && !hargaPlat2) {
      setHargaPlat2(selectedMachine2.platePricePerSheet?.toString() || '')
    }
  }, [selectedMachine2])

  // === Calculations ===
  const calculations = useMemo(() => {
    // Printing cost 1
    let ongkosCetak = 0
    if (selectedMachine && qty > 0 && warna > 0) {
      ongkosCetak += (selectedMachine.pricePerColor * warna) + (selectedMachine.specialColorPrice * warnaKhususVal)
      if (qty > selectedMachine.minimumPrintQuantity) {
        ongkosCetak += (qty - selectedMachine.minimumPrintQuantity) * selectedMachine.priceAboveMinimumPerSheet
      }
      ongkosCetak += plat * (warna + warnaKhususVal)
    }

    const totalOngkosCetak = Math.round(ongkosCetak)
    const hargaPerLembar = qty > 0 ? Math.round(totalOngkosCetak / qty) : 0

    // Printing cost 2
    let ongkosCetak2 = 0
    if (selectedMachine2 && qty > 0 && warna2 > 0) {
      ongkosCetak2 += (selectedMachine2.pricePerColor * warna2) + (selectedMachine2.specialColorPrice * warnaKhususVal2)
      if (qty > selectedMachine2.minimumPrintQuantity) {
        ongkosCetak2 += (qty - selectedMachine2.minimumPrintQuantity) * selectedMachine2.priceAboveMinimumPerSheet
      }
      ongkosCetak2 += plat2 * (warna2 + warnaKhususVal2)
    }

    const totalOngkosCetak2 = Math.round(ongkosCetak2)
    const hargaPerLembar2 = qty > 0 ? Math.round(totalOngkosCetak2 / qty) : 0

    const grandTotal = totalOngkosCetak + totalOngkosCetak2

    return {
      ongkosCetak: totalOngkosCetak,
      totalOngkosCetak,
      hargaPerLembar,
      ongkosCetak2: totalOngkosCetak2,
      totalOngkosCetak2,
      hargaPerLembar2,
      grandTotal,
    }
  }, [qty, selectedMachine, warna, warnaKhususVal, plat, selectedMachine2, warna2, warnaKhususVal2, plat2])

  // === localStorage persistence ===
  const formData = { namaCustomer, namaCetakan, selectedMachineId, jumlahWarna, warnaKhusus, hargaPlat, selectedMachineId2, jumlahWarna2, warnaKhusus2, hargaPlat2, jumlahLembar }

  useEffect(() => {
    if (!isLoaded) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(formData))
  }, [formData, isLoaded])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.namaCustomer) setNamaCustomer(parsed.namaCustomer)
        if (parsed.namaCetakan) setNamaCetakan(parsed.namaCetakan)
        if (parsed.selectedMachineId) setSelectedMachineId(parsed.selectedMachineId)
        if (parsed.jumlahWarna) setJumlahWarna(parsed.jumlahWarna)
        if (parsed.warnaKhusus) setWarnaKhusus(parsed.warnaKhusus)
        if (parsed.hargaPlat) setHargaPlat(parsed.hargaPlat)
        if (parsed.selectedMachineId2) setSelectedMachineId2(parsed.selectedMachineId2)
        if (parsed.jumlahWarna2) setJumlahWarna2(parsed.jumlahWarna2)
        if (parsed.warnaKhusus2) setWarnaKhusus2(parsed.warnaKhusus2)
        if (parsed.hargaPlat2) setHargaPlat2(parsed.hargaPlat2)
        if (parsed.jumlahLembar) setJumlahLembar(parsed.jumlahLembar)
      }
    } catch {}
    setIsLoaded(true)
  }, [])

  const buildPayload = () => ({
    namaCustomer: namaCustomer || '-',
    namaCetakan: namaCetakan || '-',
    machineName: selectedMachine?.machineName || '-',
    machineId: selectedMachine?.id || '',
    jumlahWarna: jumlahWarna || '0',
    warnaKhusus: warnaKhusus || '0',
    hargaPlat: hargaPlat || '0',
    jumlahLembar: jumlahLembar || '0',
    totalOngkosCetak: calculations.totalOngkosCetak,
    hargaPerLembar: calculations.hargaPerLembar,
    machineId2: selectedMachine2?.id || '',
    machineName2: selectedMachine2?.machineName || '',
    jumlahWarna2: jumlahWarna2 || '0',
    warnaKhusus2: warnaKhusus2 || '0',
    hargaPlat2: hargaPlat2 || '0',
    totalOngkosCetak2: calculations.totalOngkosCetak2,
  })

  const resetForm = () => {
    setNamaCustomer('')
    setNamaCetakan('')
    setSelectedMachineId('')
    setJumlahWarna('')
    setWarnaKhusus('')
    setHargaPlat('')
    setSelectedMachineId2('')
    setJumlahWarna2('')
    setWarnaKhusus2('')
    setHargaPlat2('')
    setJumlahLembar('')
    setRestoredRiwayatId(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  const handleSaveRiwayat = async () => {
    if (calculations.grandTotal <= 0) {
      toast.error('Hitung ongkos cetak terlebih dahulu')
      return
    }
    setSavingRiwayat(true)
    try {
      const res = await fetcher('/api/riwayat-ongkos-cetak', {
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
    if (calculations.grandTotal <= 0) {
      toast.error('Hitung ongkos cetak terlebih dahulu')
      return
    }
    setSavingRiwayat(true)
    try {
      const res = await fetcher(`/api/riwayat-ongkos-cetak/${restoredRiwayatId}`, {
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
    setSelectedMachineId(r.machineId || '')
    setJumlahWarna(r.jumlahWarna || '')
    setWarnaKhusus(r.warnaKhusus || '0')
    setHargaPlat(r.hargaPlat || '')
    setSelectedMachineId2(r.machineId2 || '')
    setJumlahWarna2(r.jumlahWarna2 || '')
    setWarnaKhusus2(r.warnaKhusus2 || '0')
    setHargaPlat2(r.hargaPlat2 || '')
    setJumlahLembar(r.jumlahLembar || '')
    toast.success('Data berhasil di-restore dari riwayat!')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDeleteRiwayat = async (id: string) => {
    if (!confirm('Beneran mau dihapus nih?')) return
    try {
      const res = await fetcher(`/api/riwayat-ongkos-cetak/${id}`, {
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

  // === Handlers ===
  const handleReset = () => {
    resetForm()
    toast.success('Form berhasil direset')
  }

  const handleWhatsApp = () => {
    const machineName = selectedMachine?.machineName || '-'
    const machineName2 = selectedMachine2?.machineName || '-'
    let message = `Hitung Ongkos Cetak - www.darrellsoft.com

Nama Customer: ${namaCustomer || '-'}
Nama Cetakan: ${namaCetakan || '-'}
Jumlah Lembar: ${qty.toLocaleString('id-ID')}

--- Ongkos Cetak ---
Mesin: ${machineName}
Jumlah Warna: ${warna}${warnaKhususVal > 0 ? ` (+ ${warnaKhususVal} khusus)` : ''}
Harga Plat/Warna: ${fmt(plat)}
Total Ongkos Cetak: ${fmt(calculations.totalOngkosCetak)}`
    if (calculations.totalOngkosCetak2 > 0) {
      message += `

--- Ongkos Cetak 2 ---
Mesin: ${machineName2}
Jumlah Warna: ${warna2}${warnaKhususVal2 > 0 ? ` (+ ${warnaKhususVal2} khusus)` : ''}
Harga Plat/Warna: ${fmt(plat2)}
Total Ongkos Cetak 2: ${fmt(calculations.totalOngkosCetak2)}`
    }
    message += `

Grand Total: ${fmt(calculations.grandTotal)}
Harga/Lembar: ${fmt(qty > 0 ? Math.round(calculations.grandTotal / qty) : 0)}`
    const encoded = encodeURIComponent(message)
    openWhatsApp(encoded)
    toast.success('Membuka WhatsApp...')
  }

  const handlePrint = () => {
    if (qty <= 0) { toast.error('Masukkan jumlah lembar terlebih dahulu'); return }
    const printWindow = window.open('', '', 'height=900,width=700')
    if (!printWindow) { toast.error('Gagal membuka jendela print'); return }
    const now = new Date().toLocaleString('id-ID')
    const machineName = selectedMachine?.machineName || '-'
    const machineName2 = selectedMachine2?.machineName || '-'
    const fmt = (n: number) => `Rp ${n.toLocaleString('id-ID')}`
    const grandHargaPerLembar = qty > 0 ? Math.round(calculations.grandTotal / qty) : 0
    const ongkosCetak2Row = calculations.totalOngkosCetak2 > 0
      ? `<tr><td>Ongkos Cetak 2 (${machineName2}: ${warna2} warna${warnaKhususVal2 > 0 ? ` + ${warnaKhususVal2} khusus` : ''})</td><td class="text-right text-bold">${fmt(calculations.ongkosCetak2)}</td></tr>`
      : ''
    const ongkosCetak2Box = calculations.totalOngkosCetak2 > 0
      ? `<div class="value-box" style="background:#e0e7ff;border-color:#c7d2fe;"><span class="lbl">Ongkos Cetak 2</span><span class="val">${fmt(calculations.ongkosCetak2)}</span></div>`
      : ''
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Hitung Ongkos Cetak</title>
      <style>
        @page { size: A4; margin: 10mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1e293b; width: 190mm; min-height: 277mm; }
        .page { width: 100%; min-height: 100%; display: flex; flex-direction: column; }
        .header { text-align: center; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0; margin-bottom: 14px; }
        .header h1 { font-size: 18px; font-weight: 800; color: #0f172a; margin-bottom: 2px; }
        .header .subtitle { font-size: 11px; color: #64748b; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
        .info-item { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; }
        .info-item .label { font-size: 9px; color: #64748b; font-weight: 500; }
        .info-item .value { font-size: 12px; font-weight: 700; color: #1e293b; margin-top: 1px; }
        .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; padding: 6px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
        .detail-table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 10px; }
        .detail-table th { background: #f1f5f9; padding: 5px 8px; text-align: left; font-weight: 600; border: 1px solid #e2e8f0; font-size: 9px; text-transform: uppercase; color: #475569; }
        .detail-table td { padding: 5px 8px; border: 1px solid #e2e8f0; }
        .detail-table tr:nth-child(even) td { background: #f8fafc; }
        .text-right { text-align: right; }
        .text-bold { font-weight: 700; }
        .value-box { height: 28px; display: flex; align-items: center; justify-content: space-between; padding: 0 8px; border-radius: 6px; border: 1px solid; margin-bottom: 6px; }
        .value-box .lbl { font-size: 9px; font-weight: 500; color: #475569; }
        .value-box .val { font-size: 10px; font-weight: 700; color: #1e293b; }
        .total-card { background: linear-gradient(135deg, #f59e0b, #ea580c); border-radius: 10px; padding: 14px; color: white; margin-top: 10px; }
        .total-card .row1 { display: flex; justify-content: space-between; align-items: center; }
        .total-card .row1 .label { font-size: 12px; font-weight: 600; }
        .total-card .row1 .value { font-size: 18px; font-weight: 800; }
        .total-card .divider { height: 1px; background: rgba(255,255,255,0.25); margin: 8px 0; }
        .total-card .row2 { display: flex; justify-content: space-between; align-items: center; }
        .total-card .row2 .label { font-size: 9px; opacity: 0.8; }
        .total-card .row2 .value { font-size: 11px; font-weight: 700; }
        .footer { text-align: center; padding-top: 10px; border-top: 1px solid #e2e8f0; margin-top: auto; }
        .footer p { font-size: 9px; color: #94a3b8; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style></head><body>
      <div class="page">
        <div class="header">
          <h1>Hitung Ongkos Cetak</h1>
          <div class="subtitle">${namaCetakan || 'Tanpa Nama'} · Dicetak: ${now}</div>
        </div>

        <div class="info-grid">
          <div class="info-item"><div class="label">Nama Cetakan</div><div class="value">${namaCetakan || '-'}</div></div>
          <div class="info-item"><div class="label">Jumlah Lembar</div><div class="value">${qty.toLocaleString('id-ID')} lbr</div></div>
          <div class="info-item"><div class="label">Mesin Cetak</div><div class="value">${machineName}</div></div>
          <div class="info-item"><div class="label">Jumlah Warna</div><div class="value">${warna} warna${warnaKhususVal > 0 ? ` + ${warnaKhususVal} khusus` : ''}</div></div>
        </div>

        <div class="section-title">&#9432; Rincian Biaya</div>
        <table class="detail-table">
          <thead><tr><th>Keterangan</th><th class="text-right">Nilai</th></tr></thead>
          <tbody>
            <tr><td>Ongkos Cetak (${machineName}: ${warna} warna${warnaKhususVal > 0 ? ` + ${warnaKhususVal} khusus` : ''})</td><td class="text-right text-bold">${fmt(calculations.ongkosCetak)}</td></tr>
            ${ongkosCetak2Row}
          </tbody>
        </table>

        <div class="value-box" style="background:#f3e8ff;border-color:#e9d5ff;">
          <span class="lbl">Ongkos Cetak</span>
          <span class="val">${fmt(calculations.ongkosCetak)}</span>
        </div>
        ${ongkosCetak2Box}

        <div class="total-card">
          <div class="row1"><span class="label">Grand Total Ongkos Cetak</span><span class="value">${fmt(calculations.grandTotal)}</span></div>
          <div class="divider"></div>
          <div class="row2"><span class="label">Harga per Lembar (${qty.toLocaleString('id-ID')} lbr)</span><span class="value">${fmt(grandHargaPerLembar)}/lbr</span></div>
        </div>

        <div class="footer"><p>www.darrellsoft.com · Kalkulator Hitung Cetakan</p></div>
      </div>
      </body></html>`
    printWindow.document.write(html)
    printWindow.document.close()
    setTimeout(() => { printWindow.print() }, 400)
    toast.success('Mencetak...')
  }

  // === Sub-components ===
  const SectionHeader = ({ icon, label, color = 'emerald', badge }: { icon: React.ReactNode; label: string; color?: string; badge?: string | number }) => (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
      <div className={`w-6 h-6 rounded-md bg-${color}-100 flex items-center justify-center`}>{icon}</div>
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

  const fmt = (n: number) => `Rp ${n.toLocaleString('id-ID')}`

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
            <th className="text-left py-1 px-1 text-slate-500 font-semibold whitespace-nowrap">Mesin</th>
            <th className="text-right py-1 px-1 text-slate-500 font-semibold whitespace-nowrap">Warna</th>
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
                {r.machineName || '-'}
              </td>
              <td className="py-1 px-1 text-slate-600 text-right whitespace-nowrap">
                {r.jumlahWarna}{parseInt(r.warnaKhusus || 0) > 0 ? `+${r.warnaKhusus}` : ''}
              </td>
              <td className="py-1 px-1 text-slate-600 text-right whitespace-nowrap">
                {parseInt(r.jumlahLembar || 0).toLocaleString('id-ID')}
              </td>
              <td className="py-1 px-1 text-rose-700 font-bold text-right whitespace-nowrap">
                Rp {Math.round(r.totalOngkosCetak || 0).toLocaleString('id-ID')}
              </td>
              <td className="py-1 px-1 text-slate-600 text-right hidden lg:table-cell whitespace-nowrap">
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

  // === Render ===
  return (
    <DashboardLayout title="Hitung Ongkos Cetak" subtitle="Kalkulator ongkos cetak - mesin, warna, dan plat">
      {/* Hidden WA link untuk reuse tab */}
      <a ref={waLinkRef} target="wa" rel="noopener noreferrer" style={{ display: 'none' }} />
      <div className="max-w-[1200px] mx-auto">
        <div className="lg:flex lg:gap-4">

          {/* ========== LEFT COLUMN: Form ========== */}
          <div className="flex-1 lg:overflow-y-auto min-w-0 hide-scrollbar">
            <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden space-y-0">

              {/* Section 1: Informasi */}
              <SectionHeader icon={<Info className="w-3.5 h-3.5 text-blue-600" />} label="Informasi" color="blue" />
              <div className="px-4 py-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Nama Customer</label>
                    <div className="relative">
                      <UserSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        list="customer-ongkos-list"
                        placeholder="Pilih / ketik manual"
                        value={namaCustomer}
                        onChange={(e) => setNamaCustomer(e.target.value)}
                        className={`${inputClass} pl-9`}
                      />
                      <datalist id="customer-ongkos-list">
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
                <div>
                  <label className={labelClass}>Jumlah Lembar</label>
                  <input type="number" min="0" placeholder="Contoh: 1000" value={jumlahLembar} onChange={(e) => setJumlahLembar(e.target.value)} className={inputClass} />
                </div>
              </div>

              {/* Section 2: Ongkos Cetak */}
              <SectionHeader icon={<Calculator className="w-3.5 h-3.5 text-purple-600" />} label="Ongkos Cetak" color="purple" />
              <div className="px-4 py-3 space-y-3">
                <div>
                  <label className={labelClass}>Mesin</label>
                  <select value={selectedMachineId} onChange={(e) => { setSelectedMachineId(e.target.value); setHargaPlat('') }} className={selectClass}>
                    <option value="">Pilih mesin</option>
                    {printingCosts.map((m) => (
                      <option key={m.id} value={m.id}>{m.machineName}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Jumlah Warna</label>
                    <div className="relative">
                      <Palette className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input type="number" min="0" placeholder="4" value={jumlahWarna} onChange={(e) => setJumlahWarna(e.target.value)} className={`${inputClass} pl-9`} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Warna Khusus</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-500">★</span>
                      <input type="number" min="0" placeholder="0" value={warnaKhusus} onChange={(e) => setWarnaKhusus(e.target.value)} className={`${inputClass} pl-9`} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Harga Plat per Warna (Rp)</label>
                    <input type="number" step="0.01" min="0" placeholder={selectedMachine ? selectedMachine.platePricePerSheet.toString() : '0'} value={hargaPlat} onChange={(e) => setHargaPlat(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Ongkos Cetak</label>
                    <ValueBox label="Subtotal" value={calculations.ongkosCetak > 0 ? fmt(calculations.ongkosCetak) : 'Rp 0'} gradient="bg-gradient-to-r from-purple-50 to-violet-50 border-purple-200" />
                  </div>
                </div>

              </div>

              {/* Section 3: Ongkos Cetak 2 */}
              <SectionHeader icon={<Calculator className="w-3.5 h-3.5 text-indigo-600" />} label="Ongkos Cetak 2" color="indigo" />
              <div className="px-4 py-3 space-y-3">
                <div>
                  <label className={labelClass}>Mesin</label>
                  <select value={selectedMachineId2} onChange={(e) => { setSelectedMachineId2(e.target.value); setHargaPlat2('') }} className={selectClass}>
                    <option value="">Pilih mesin</option>
                    {printingCosts.map((m) => (
                      <option key={m.id} value={m.id}>{m.machineName}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Jumlah Warna</label>
                    <div className="relative">
                      <Palette className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input type="number" min="0" placeholder="4" value={jumlahWarna2} onChange={(e) => setJumlahWarna2(e.target.value)} className={`${inputClass} pl-9`} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Warna Khusus</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-500">★</span>
                      <input type="number" min="0" placeholder="0" value={warnaKhusus2} onChange={(e) => setWarnaKhusus2(e.target.value)} className={`${inputClass} pl-9`} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Harga Plat per Warna (Rp)</label>
                    <input type="number" step="0.01" min="0" placeholder={selectedMachine2 ? selectedMachine2.platePricePerSheet.toString() : '0'} value={hargaPlat2} onChange={(e) => setHargaPlat2(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Ongkos Cetak 2</label>
                    <ValueBox label="Subtotal" value={calculations.ongkosCetak2 > 0 ? fmt(calculations.ongkosCetak2) : 'Rp 0'} gradient="bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-200" />
                  </div>
                </div>

              </div>

              {/* Empty state when no data */}
              {qty <= 0 && (
                <div className="px-4 py-6 text-center">
                  <Calculator className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                  <p className="text-sm text-slate-400">Masukkan jumlah lembar untuk melihat hasil kalkulasi</p>
                </div>
              )}

            </div>
          </div>

          {/* ========== RIGHT COLUMN: Results Panel ========== */}
          <div className="w-full lg:w-[380px] flex-shrink-0 mt-4 lg:mt-0">
            <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden lg:sticky lg:top-4">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
                <div className="w-6 h-6 rounded-md bg-emerald-100 flex items-center justify-center">
                  <Calculator className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Hasil Kalkulasi</h2>
              </div>

              <div className="p-4 space-y-3">
                {qty > 0 ? (
                  <>
                    <div className="space-y-1.5">
                      <ValueBox label="Ongkos Cetak" value={fmt(calculations.ongkosCetak)} gradient="bg-gradient-to-r from-purple-50 to-violet-50 border-purple-200" />
                      {calculations.totalOngkosCetak2 > 0 && (
                        <ValueBox label="Ongkos Cetak 2" value={fmt(calculations.ongkosCetak2)} gradient="bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-200" />
                      )}
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50">
                        <span className="text-[11px] text-slate-600">Total Ongkos Cetak</span>
                        <span className="text-xs font-semibold text-slate-700">{fmt(calculations.totalOngkosCetak)}</span>
                      </div>
                      {calculations.totalOngkosCetak2 > 0 && (
                        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50">
                          <span className="text-[11px] text-slate-600">Total Ongkos Cetak 2</span>
                          <span className="text-xs font-semibold text-slate-700">{fmt(calculations.totalOngkosCetak2)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50">
                        <span className="text-[11px] text-slate-600">Harga per Lembar</span>
                        <span className="text-xs font-semibold text-slate-700">{fmt(qty > 0 ? Math.round(calculations.grandTotal / qty) : 0)}/lbr</span>
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl p-3.5 text-white">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">Grand Total Ongkos Cetak</span>
                        <span className="text-lg font-extrabold">{fmt(calculations.grandTotal)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-white/20">
                        <span className="text-[11px] opacity-80">Untuk {qty.toLocaleString('id-ID')} lembar</span>
                        <span className="text-xs font-bold">{fmt(qty > 0 ? Math.round(calculations.grandTotal / qty) : 0)}/lbr</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="py-6 text-center">
                    <Calculator className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="text-xs text-slate-400">Masukkan jumlah lembar untuk melihat hasil</p>
                  </div>
                )}

                {/* Actions */}
                <div className="space-y-2 pt-1">
                  {restoredRiwayatId ? (
                    <Button
                      onClick={handleUpdateRiwayat}
                      disabled={calculations.grandTotal <= 0 || savingRiwayat}
                      className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                      size="sm"
                    >
                      <RefreshCw className={`w-4 h-4 ${savingRiwayat ? 'animate-spin' : ''}`} /> {savingRiwayat ? 'Mengupdate...' : 'Update Riwayat'}
                    </Button>
                  ) : (
                    <Button
                      onClick={handleSaveRiwayat}
                      disabled={calculations.grandTotal <= 0 || savingRiwayat}
                      className="w-full gap-2 bg-amber-500 hover:bg-amber-600 text-white"
                      size="sm"
                    >
                      {savingRiwayat ? 'Menyimpan...' : 'Simpan Riwayat'}
                    </Button>
                  )}
                  <Button
                    onClick={handleWhatsApp}
                    disabled={calculations.grandTotal <= 0}
                    className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
                    size="sm"
                  >
                    <MessageCircle className="w-4 h-4" /> Kirim ke WhatsApp
                  </Button>
                  <Button
                    onClick={handlePrint}
                    disabled={calculations.grandTotal <= 0}
                    className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                    size="sm"
                  >
                    <Printer className="w-4 h-4" /> Cetak
                  </Button>
                  <Button
                    onClick={handleReset}
                    disabled={calculations.grandTotal <= 0 && !restoredRiwayatId}
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

        {/* ========== RIWAYAT ONGKOS CETAK (Full Width) ========== */}
        <div className="mt-4">
          <div className="bg-card rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
              <div className="w-6 h-6 rounded-md bg-amber-100 flex items-center justify-center">
                <History className="w-3.5 h-3.5 text-amber-600" />
              </div>
              <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Riwayat Ongkos Cetak</h2>
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">{riwayatList.length}</span>
            </div>
            {riwayatList.length > 0 ? (
              <>
                <RiwayatCards items={riwayatList} restoredId={restoredRiwayatId} onRestore={handleRestore} onDelete={handleDeleteRiwayat} />
                <div className="hidden md:block"><RiwayatTable items={riwayatList} /></div>
              </>
            ) : (
              <div className="px-4 py-6 text-center">
                <History className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-xs text-slate-400">Belum ada riwayat ongkos cetak</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
