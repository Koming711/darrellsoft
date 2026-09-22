'use client'

/**
 * Preview "Detail Rincian Cetakan" — SATU SUMBER KEBENARAN.
 *
 * Dipakai oleh:
 *  1. Halaman editor Hitung Cetakan (popup PreviewDialog setelah klik Preview / baris riwayat)
 *  2. Halaman Riwayat Hitung Cetakan (dialog detail saat baris/kartu diklik)
 *
 * Isi markup 100% sama dengan preview editor (Informasi Pesanan, Rincian Biaya,
 * Gambar Potong Kertas + diagram, Grand Total orange) sehingga hasil JPG/Cetak
 * dari kedua tempat identik.
 */

import { useMemo, useState } from 'react'
import { Calculator, Users, Banknote, Palette, Ruler, Image as ImageIcon, Layers } from 'lucide-react'
import { calculateCuts } from '@/lib/cutting-engine'
import { CuttingDiagram } from '@/components/cutting-results'
import { PhotoLightbox } from '@/components/photo-lightbox'

/** Satu baris Tabel Simulasi Cepat yang ikut tersimpan di record riwayat. */
export interface SimulasiCepatItem {
  jumlah: number
  profit: number
  sheets: number
  modal: number
  modalPcs: number
  jual: number
  jualPcs: number
}

/**
 * Parse kolom simulasiCepat (string JSON) dari record riwayat — aman terhadap
 * data rusak/kosong. Selalu mengembalikan array (kosong bila tidak valid).
 */
export function parseSimulasiCepat(raw: unknown): SimulasiCepatItem[] {
  if (!raw || typeof raw !== 'string') return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .map((s: any) => ({
        jumlah: Math.max(0, Math.round(Number(s?.jumlah) || 0)),
        profit: Number(s?.profit) || 0,
        sheets: Math.max(0, Math.round(Number(s?.sheets) || 0)),
        modal: Math.max(0, Number(s?.modal) || 0),
        modalPcs: Math.max(0, Number(s?.modalPcs) || 0),
        jual: Math.max(0, Number(s?.jual) || 0),
        jualPcs: Math.max(0, Number(s?.jualPcs) || 0),
      }))
      .filter((s: SimulasiCepatItem) => s.jumlah > 0)
  } catch { return [] }
}

/** Bentuk data yang dibutuhkan preview (kompatibel dengan PrintCalculation di halaman editor). */
export interface RincianCetakanData {
  printName: string
  customerName: string
  paperName: string
  paperLength: string
  paperWidth: string
  cutWidth: string
  cutHeight: string
  quantity: string
  jumlahPesanan: string
  berapaMata: string
  setelanKertas?: string
  warna: string
  warnaKhusus: string
  warna2?: string
  warnaKhusus2?: string
  machineName: string
  machineName2?: string
  hargaPlat?: string
  hargaPlat2?: string
  pricePerSheet: string
  /** Harga kertas per kg (info, konsisten dgn Master Harga Kertas) — kosong = tile disembunyikan. */
  pricePerKg?: string
  totalPaperPrice?: number
  finishingName?: string
  finishingBreakdown?: { name: string; cost: number }[]
  packingCost: string
  shippingCost: string
  glueLengthCm?: string
  glueCostPerCm?: string
  biayaLain1?: string
  biayaLain2?: string
  biayaLain1Label?: string
  biayaLain2Label?: string
  calculatedPrintingCost?: number
  calculatedPrintingCost2?: number
  calculatedFinishingCost?: number
  calculatedGlueCost?: number
  calculatedGlueBoronganSheet?: number
  profitPercent?: number
  paperGrammage?: number
  recordNumber?: string
  recordDate?: string
  photoUrl?: string | null
  /** Tabel Simulasi Cepat yang tersimpan bersama record (kosong = tidak ada). */
  simulasiCepat?: SimulasiCepatItem[]
}

/** Baris riwayat cetakan dari API (subset field yang dipakai mapper). */
export interface RiwayatCetakanRow {
  printName?: string | null
  customerName?: string | null
  paperName?: string | null
  paperGrammage?: string | number | null
  paperLength?: string | null
  paperWidth?: string | null
  cutWidth?: string | null
  cutHeight?: string | null
  quantity?: string | null
  jumlahPesanan?: string | null
  berapaMata?: string | null
  setelanKertas?: string | null
  warna?: string | null
  warnaKhusus?: string | null
  warna2?: string | null
  warnaKhusus2?: string | null
  machineName?: string | null
  hargaPlat?: number | null
  machineName2?: string | null
  hargaPlat2?: number | null
  ongkosCetak?: number | null
  ongkosCetak2?: number | null
  totalPaperPrice?: number | null
  pricePerSheet?: number | null
  finishingNames?: string | null
  finishingBreakdown?: string | null
  finishingCost?: number | null
  packingCost?: number | null
  shippingCost?: number | null
  otherCost?: number | null
  otherCost2?: number | null
  otherCostLabel?: string | null
  otherCostLabel2?: string | null
  glueCost?: number | null
  glueBorongan?: number | null
  glueLengthCm?: string | null
  glueCostPerCm?: string | null
  nomorUrut?: string | null
  createdAt?: string | null
  profitPercent?: number | null
  photoUrl?: string | null
  simulasiCepat?: string | null
}

/**
 * Map baris riwayat (Prisma/API) → data preview.
 * Sama persis dengan mapping handlePreviewRiwayat di halaman editor Hitung Cetakan.
 */
/**
 * Derive harga kertas /kg dari harga lembar + ukuran kertas + gramasi.
 * Rumus & pembulatan sama dgn Master Harga Kertas: hasil dibulatkan ke bilangan bulat.
 */
export function deriveKgFromSheet(sheet: number | string | null | undefined, l: string | number | null | undefined, w: string | number | null | undefined, g: string | number | null | undefined): string {
  const S = Number(sheet) || 0
  const L = parseFloat(String(l ?? '')) || 0
  const W = parseFloat(String(w ?? '')) || 0
  const G = parseFloat(String(g ?? '')) || 0
  if (!(S > 0) || !(L > 0) || !(W > 0) || !(G > 0)) return ''
  return Math.round((S * 10000000) / (L * W * G)).toString()
}

export function mapRiwayatToRincianData(r: RiwayatCetakanRow): RincianCetakanData {
  return {
    printName: r.printName || '-',
    customerName: r.customerName || '',
    paperName: r.paperName || '-',
    paperLength: r.paperLength || '',
    paperWidth: r.paperWidth || '',
    cutWidth: r.cutWidth || '',
    cutHeight: r.cutHeight || '',
    quantity: r.quantity || '',
    jumlahPesanan: r.jumlahPesanan || '',
    berapaMata: r.berapaMata || '',
    setelanKertas: r.setelanKertas || '',
    warna: r.warna || '',
    warnaKhusus: r.warnaKhusus || '',
    warna2: r.warna2 || '',
    warnaKhusus2: r.warnaKhusus2 || '',
    machineName: r.machineName || '-',
    machineName2: r.machineName2 || '',
    hargaPlat: (r.hargaPlat ?? 0).toString(),
    hargaPlat2: (r.hargaPlat2 ?? 0).toString(),
    pricePerSheet: (r.pricePerSheet ?? 0).toString(),
    pricePerKg: deriveKgFromSheet(r.pricePerSheet, r.paperLength, r.paperWidth, r.paperGrammage),
    totalPaperPrice: r.totalPaperPrice || 0,
    finishingName: r.finishingNames || '',
    finishingBreakdown: r.finishingBreakdown ? r.finishingBreakdown.split(' | ').map((s) => {
      const firstColonIdx = s.indexOf(': ')
      const name = firstColonIdx > -1 ? s.substring(0, firstColonIdx) : s
      const lastEqRp = s.lastIndexOf('= Rp ')
      const costStr = lastEqRp > -1 ? s.substring(lastEqRp + 5) : '0'
      const cost = parseFloat(costStr.replace(/[^\d-]/g, '')) || 0
      return { name, cost }
    }) : [],
    packingCost: (r.packingCost ?? 0).toString(),
    shippingCost: (r.shippingCost ?? 0).toString(),
    glueLengthCm: r.glueLengthCm || '',
    glueCostPerCm: r.glueCostPerCm || '',
    biayaLain1: (r.otherCost ?? 0).toString(),
    biayaLain2: (r.otherCost2 ?? 0).toString(),
    biayaLain1Label: r.otherCostLabel || 'Biaya Bikin Piso',
    biayaLain2Label: r.otherCostLabel2 || 'Biaya',
    calculatedPrintingCost: r.ongkosCetak || 0,
    calculatedPrintingCost2: r.ongkosCetak2 || 0,
    calculatedFinishingCost: r.finishingCost || 0,
    calculatedGlueCost: r.glueCost || 0,
    calculatedGlueBoronganSheet: r.glueBorongan || 0,
    profitPercent: r.profitPercent || 0,
    paperGrammage: parseInt(String(r.paperGrammage ?? '0')) || 0,
    recordNumber: r.nomorUrut || '',
    recordDate: r.createdAt || '',
    photoUrl: r.photoUrl || '',
    simulasiCepat: parseSimulasiCepat(r.simulasiCepat),
  }
}

const fmtNum = (n: number) => Math.round(n).toLocaleString('id-ID')
const formatRp = (n: number) => `Rp ${fmtNum(n)}`
// Harga per pcs: 2 desimal bila < Rp1.000 (sama dengan halaman editor)
const formatHargaPcs = (n: number) => `Rp ${n.toLocaleString('id-ID', { maximumFractionDigits: n > 0 && n < 1000 ? 2 : 0 })}`

// Field tile for the CRUD-style info grid
function PvField({ label, value, accent = 'text-slate-800' }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 leading-tight">{label}</p>
      <p className={`text-base font-bold leading-snug break-words ${accent}`} title={typeof value === 'string' ? value : undefined}>{value}</p>
    </div>
  )
}

// Stat tile under the cutting diagram
function PvMiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-center min-w-0">
      <p className="text-[9.5px] text-slate-400 uppercase tracking-wide leading-tight">{label}</p>
      <p className="text-base font-extrabold text-slate-700 break-words leading-tight" title={typeof value === 'string' ? value : undefined}>{value}</p>
    </div>
  )
}

// Cost table row for the rincian biaya table
function PvCost({ name, detail, amount }: { name: React.ReactNode; detail?: React.ReactNode; amount: React.ReactNode }) {
  return (
    <tr className="border-b border-slate-100 last:border-b-0">
      <td className="py-1 pr-2 align-top text-xs font-semibold text-slate-700 leading-snug">{name}</td>
      <td className="py-1 pr-2 align-top text-[10.5px] text-slate-400 leading-snug">{detail}</td>
      <td className="py-1 pl-2 align-top text-right text-sm font-bold text-slate-700 tabular-nums whitespace-nowrap">{amount}</td>
    </tr>
  )
}

export function RincianCetakanPreview({ data }: { data: RincianCetakanData | null }) {
  const d = data
  const [photoZoom, setPhotoZoom] = useState(false)

  // Preview summary values - derived from data for consistent display
  const pvCustomerName = d?.customerName || '-'
  const pvPrintName = d?.printName || '-'
  const pvCutWidth = d?.cutWidth || ''
  const pvCutHeight = d?.cutHeight || ''
  const pvQuantity = parseInt(d?.quantity || '0') || 0
  const pvPaperPrice = d?.totalPaperPrice || ((parseFloat(d?.pricePerSheet || '0') || 0) * pvQuantity)
  const pvPrintingCost = d?.calculatedPrintingCost ?? 0
  const pvPrintingCost2 = d?.calculatedPrintingCost2 ?? 0
  const pvFinishingCost = d?.calculatedFinishingCost ?? 0
  const pvGlueCost = d?.calculatedGlueCost ?? 0
  const pvGlueBorongan = d?.calculatedGlueBoronganSheet ?? 0
  const pvPacking = parseFloat(d?.packingCost || '0') || 0
  const pvShipping = parseFloat(d?.shippingCost || '0') || 0
  const pvBiayaLain1 = parseFloat(d?.biayaLain1 || '0') || 0
  const pvBiayaLain2 = parseFloat(d?.biayaLain2 || '0') || 0
  const pvBiayaLain1Label = d?.biayaLain1Label || 'Biaya Bikin Piso'
  const pvBiayaLain2Label = d?.biayaLain2Label || 'Biaya'
  const pvProfitPercent = d?.profitPercent ?? 0
  const pvGlueTotal = pvGlueCost + pvGlueBorongan
  const pvSubTotal = pvPaperPrice + pvPrintingCost + pvPrintingCost2 + pvFinishingCost + pvPacking + pvShipping + pvBiayaLain1 + pvBiayaLain2 + pvGlueTotal
  const pvProfitAmount = pvSubTotal * (pvProfitPercent / 100)
  const pvGrandTotal = pvSubTotal + pvProfitAmount
  // Extra preview detail values (lengkap semuanya)
  const pvHargaPerLembar = parseFloat(d?.pricePerSheet || '0') || 0
  const pvJumlahPesanan = parseInt(d?.jumlahPesanan || '0') || 0
  const pvSetelan = parseInt(d?.setelanKertas || '0') || 0
  const pvBerapaMata = d?.berapaMata || ''
  const pvGrammage = d?.paperGrammage || 0
  const pvHargaPlat1 = parseFloat(d?.hargaPlat || '0') || 0
  const pvHargaPlat2 = parseFloat(d?.hargaPlat2 || '0') || 0
  const pvGlueLength = parseFloat(d?.glueLengthCm || '0') || 0
  const pvGluePerCm = parseFloat(d?.glueCostPerCm || '0') || 0
  const pvUkuranKertas = d && (parseFloat(d.paperLength) > 0 || parseFloat(d.paperWidth) > 0) ? `${d.paperLength || '-'} × ${d.paperWidth || '-'} cm` : '-'
  const pvUkuranPotongan = pvCutWidth && pvCutHeight ? `${pvCutWidth} × ${pvCutHeight} cm` : '-'
  const pvHargaPerPcs = pvJumlahPesanan > 0 ? pvGrandTotal / pvJumlahPesanan : pvQuantity > 0 ? pvGrandTotal / pvQuantity : 0
  // Harga Modal per Pcs = Sub Total (total modal) ÷ jumlah pesanan — sama dengan "Harga Modal" di summary editor
  const pvHargaModalPcs = pvJumlahPesanan > 0 ? pvSubTotal / pvJumlahPesanan : pvQuantity > 0 ? pvSubTotal / pvQuantity : 0
  // Cutting engine result for the gambar potong kertas (same engine & mapping as computedPaper:
  // paperLength -> paperWidth param, paperWidth -> paperHeight param)
  const pvCutResult = useMemo(() => {
    if (!d) return null
    const pw = parseFloat(d.paperLength) || 0
    const ph = parseFloat(d.paperWidth) || 0
    const cw = parseFloat(d.cutWidth) || 0
    const ch = parseFloat(d.cutHeight) || 0
    const qty = parseInt(d.quantity || '0') || 0
    const setelan = parseInt(d.setelanKertas || '0') || 0
    const price = parseFloat(d.pricePerSheet || '0') || 0
    const totalQty = qty + setelan
    if (pw <= 0 || ph <= 0 || cw <= 0 || ch <= 0 || totalQty <= 0 || price <= 0) return null
    try {
      return calculateCuts({
        paperWidth: pw, paperHeight: ph, cutWidth: cw, cutHeight: ch,
        quantity: totalQty, pricePerSheet: price, optimizationMode: 'maximal',
        customerName: '', paperMaterial: '', grammage: 0,
      })
    } catch { return null }
  }, [d])
  const pvSheetsNeeded = pvCutResult?.sheetsNeeded ?? (pvHargaPerLembar > 0 && pvPaperPrice > 0 ? Math.ceil(pvPaperPrice / pvHargaPerLembar) : 0)
  const pvHasCetak2 = (d?.machineName2 && d.machineName2 !== '') || pvPrintingCost2 > 0
  const pvHasFinishing = (d?.finishingName && d.finishingName !== '') || (d?.finishingBreakdown && d.finishingBreakdown.length > 0)

  if (!d) return null

  // Tabel Simulasi: pakai baris tersimpan bersama record; bila kosong (record lama
  // sebelum kolom simulasiCepat ada) → sintesis 1 baris dari data record itu sendiri
  // agar simulasi cetak SELALU tampil di Rincian Harga Cetakan.
  const storedSim = d.simulasiCepat ?? []
  const simJumlahFallback = pvJumlahPesanan > 0 ? pvJumlahPesanan : pvQuantity
  const pvSimRows: SimulasiCepatItem[] = storedSim.length > 0
    ? storedSim
    : simJumlahFallback > 0 && pvGrandTotal > 0
      ? [{
          jumlah: simJumlahFallback,
          profit: pvProfitPercent,
          sheets: pvSheetsNeeded,
          modal: Math.round(pvSubTotal),
          modalPcs: pvHargaModalPcs,
          jual: Math.round(pvGrandTotal),
          jualPcs: pvHargaPerPcs,
        }]
      : []
  const pvSimFromRecord = storedSim.length === 0 && pvSimRows.length > 0

  return (
    <>
      {/* Header */}
      <div className="text-center pb-2 border-b-2 border-slate-200 mb-2">
        <div className="flex items-center justify-center gap-2">
          <Calculator className="w-5 h-5 text-blue-600" />
          <h1 className="text-xl font-bold text-slate-900">Rincian Harga Cetakan</h1>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          <span className="font-semibold text-slate-600">{pvPrintName}</span>
          {d.recordNumber ? <span> · No. {d.recordNumber}</span> : null}
          <span> · {d.recordDate ? new Date(d.recordDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </p>
      </div>

      {/* Layout DOKUMEN TETAP (tanpa varian responsif) — hasil JPG/Cetak sama
          persis di semua perangkat; tampilan layar kecil di-skala via FixedDocScaler */}
      <div className="grid grid-cols-5 gap-3 items-start">
        {/* ===== KOLOM KIRI: INFORMASI + RINCIAN BIAYA ===== */}
        <div className="col-span-3 space-y-3">
          {/* Informasi Pesanan - CRUD field grid */}
          <div className="border border-slate-200 rounded-xl p-3 bg-white">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center">
                <Users className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <p className="text-sm font-bold text-slate-700 uppercase tracking-wide">Informasi Pesanan</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <PvField label="Nama Customer" value={pvCustomerName} accent="text-blue-800" />
              <PvField label="Nama Barang" value={pvPrintName} accent="text-indigo-800" />
              <PvField label="Jumlah Pesanan" value={pvJumlahPesanan > 0 ? `${pvJumlahPesanan.toLocaleString('id-ID')} lbr` : '-'} accent="text-purple-800" />
              <PvField label="Jumlah Cetakan" value={`${pvQuantity.toLocaleString('id-ID')} lbr${pvSetelan > 0 ? ` +${pvSetelan} setelan` : ''}`} />
              <PvField label="Lembar Kertas" value={pvSheetsNeeded > 0 ? `${fmtNum(pvSheetsNeeded)} lbr` : '-'} accent="text-teal-800" />
              {d.pricePerKg && <PvField label="Harga Kertas /kg" value={`Rp ${Number(d.pricePerKg).toLocaleString('id-ID')}`} accent="text-teal-800" />}
              {pvBerapaMata !== '' && pvBerapaMata !== '0' && <PvField label="Berapa Mata" value={pvBerapaMata} />}
              <PvField label="Ukuran Kertas" value={pvUkuranKertas} accent="text-teal-800" />
              <PvField label="Ukuran Potongan" value={pvUkuranPotongan} />
              <PvField label="Warna Cetak" value={`${d.warna || 0} warna${d.warnaKhusus && parseInt(d.warnaKhusus) > 0 ? ` + ${d.warnaKhusus} khusus` : ''}`} />
              {pvHasCetak2 && (
                <PvField label="Warna Cetak 2" value={`${d.warna2 || 0} warna${d.warnaKhusus2 && parseInt(d.warnaKhusus2) > 0 ? ` + ${d.warnaKhusus2} khusus` : ''}`} />
              )}
            </div>
          </div>

          {/* Rincian Biaya - tabel CRUD */}
          <div className="border border-slate-200 rounded-xl p-3 bg-white">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Banknote className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <p className="text-sm font-bold text-slate-700 uppercase tracking-wide">Rincian Biaya</p>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 pb-1.5 pr-2 w-[38%]">Keterangan</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 pb-1.5 pr-2">Rincian</th>
                  <th className="text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 pb-1.5 pl-2 whitespace-nowrap">Jumlah (Rp)</th>
                </tr>
              </thead>
              <tbody>
                <PvCost
                  name={<span>Bahan Kertas{d.paperName ? <span className="text-slate-500"> — {d.paperName}</span> : null}{pvGrammage > 0 ? <span className="text-slate-400"> · {pvGrammage} gsm</span> : null}</span>}
                  detail={pvHargaPerLembar > 0 && pvSheetsNeeded > 0 ? `${pvSheetsNeeded.toLocaleString('id-ID')} lbr × ${formatRp(pvHargaPerLembar)}` : undefined}
                  amount={pvPaperPrice > 0 ? formatRp(pvPaperPrice) : '-'}
                />
                <PvCost
                  name={d.machineName && d.machineName !== '-' ? `Ongkos Cetak — ${d.machineName}` : 'Ongkos Cetak'}
                  detail={`${d.warna || 0} warna${d.warnaKhusus && parseInt(d.warnaKhusus) > 0 ? ` + ${d.warnaKhusus} khusus` : ''}${pvHargaPlat1 > 0 ? ` · plat ${formatRp(pvHargaPlat1)}/lbr` : ''}`}
                  amount={formatRp(pvPrintingCost)}
                />
                {pvHasCetak2 && (
                  <PvCost
                    name={d.machineName2 && d.machineName2 !== '' ? `Ongkos Cetak 2 — ${d.machineName2}` : 'Ongkos Cetak 2'}
                    detail={`${d.warna2 || 0} warna${d.warnaKhusus2 && parseInt(d.warnaKhusus2) > 0 ? ` + ${d.warnaKhusus2} khusus` : ''}${pvHargaPlat2 > 0 ? ` · plat ${formatRp(pvHargaPlat2)}/lbr` : ''}`}
                    amount={formatRp(pvPrintingCost2)}
                  />
                )}
                {pvHasFinishing && d.finishingBreakdown && d.finishingBreakdown.length > 0
                  ? d.finishingBreakdown.map((fb, i) => (
                    <PvCost key={`fin-${i}`} name={`Finishing — ${fb.name}`} amount={formatRp(fb.cost)} />
                  ))
                  : (pvHasFinishing && <PvCost name={`Finishing — ${d.finishingName}`} amount={formatRp(pvFinishingCost)} />)}
                {pvPacking > 0 && <PvCost name="Ongkos Packing" amount={formatRp(pvPacking)} />}
                {pvShipping > 0 && <PvCost name="Ongkos Kirim" amount={formatRp(pvShipping)} />}
                {pvGlueCost > 0 && (
                  <PvCost
                    name="Ongkos Lem"
                    detail={pvGlueLength > 0 && pvGluePerCm > 0 ? `${pvGlueLength} cm × ${formatRp(pvGluePerCm)}/cm` : undefined}
                    amount={formatRp(pvGlueCost)}
                  />
                )}
                {pvGlueBorongan > 0 && <PvCost name="Lem Borongan" amount={formatRp(pvGlueBorongan)} />}
                {pvBiayaLain1 > 0 && <PvCost name={pvBiayaLain1Label} amount={formatRp(pvBiayaLain1)} />}
                {pvBiayaLain2 > 0 && <PvCost name={pvBiayaLain2Label} amount={formatRp(pvBiayaLain2)} />}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200">
                  <td colSpan={2} className="pt-2 text-xs font-bold text-slate-600 uppercase tracking-wide">Sub Total</td>
                  <td className="pt-2 text-right text-sm font-extrabold text-slate-800 tabular-nums">{formatRp(pvSubTotal)}</td>
                </tr>
                {pvProfitPercent > 0 && pvProfitAmount > 0 && (
                  <tr>
                    <td colSpan={2} className="pt-1.5 text-xs font-bold text-orange-600 uppercase tracking-wide">Profit ({pvProfitPercent}%)</td>
                    <td className="pt-1.5 text-right text-sm font-extrabold text-orange-600 tabular-nums">{formatRp(pvProfitAmount)}</td>
                  </tr>
                )}
                <tr>
                  <td colSpan={2} className="pt-2 text-sm font-extrabold text-slate-900 uppercase tracking-wide">Grand Total</td>
                  <td className="pt-2 text-right text-lg font-extrabold text-emerald-600 tabular-nums">{formatRp(pvGrandTotal)}</td>
                </tr>
                {pvHargaModalPcs > 0 && (
                  <tr>
                    <td colSpan={2} className="pt-1.5 text-[11px] font-semibold text-slate-500">Harga Modal per Pcs{pvJumlahPesanan > 0 ? ` (${pvJumlahPesanan.toLocaleString('id-ID')} lbr)` : ''}</td>
                    <td className="pt-1.5 text-right text-xs font-bold text-slate-600 tabular-nums">{formatHargaPcs(pvHargaModalPcs)}</td>
                  </tr>
                )}
                {pvHargaPerPcs > 0 && (
                  <tr>
                    <td colSpan={2} className="pt-1.5 text-[11px] font-semibold text-slate-500">Harga Jual per Pcs{pvJumlahPesanan > 0 ? ` (${pvJumlahPesanan.toLocaleString('id-ID')} lbr)` : ''}</td>
                    <td className="pt-1.5 text-right text-xs font-bold text-emerald-700 tabular-nums">{formatHargaPcs(pvHargaPerPcs)}</td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>

          {/* Foto Lampiran — ikut tampil di JPG/Cetak karena capture = isi preview */}
          {d.photoUrl && (
            <div className="border border-slate-200 rounded-xl p-3 bg-white">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center">
                  <ImageIcon className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <p className="text-sm font-bold text-slate-700 uppercase tracking-wide">Foto Lampiran</p>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-2 flex justify-center">
                <button
                  type="button"
                  onClick={() => setPhotoZoom(true)}
                  aria-label="Perbesar foto lampiran"
                  title="Klik untuk perbesar foto"
                  className="inline-flex cursor-zoom-in rounded transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <img src={d.photoUrl} alt="Foto Lampiran" className="max-h-64 w-auto max-w-full rounded object-contain" />
                </button>
              </div>
            </div>
          )}
          {d.photoUrl && (
            <PhotoLightbox src={d.photoUrl} open={photoZoom} onOpenChange={setPhotoZoom} />
          )}
        </div>

        {/* ===== KOLOM KANAN: GAMBAR POTONG + TOTAL ===== */}
        <div className="col-span-2 space-y-3">
          {/* Gambar Potong Kertas */}
          <div className="border border-violet-200 rounded-xl p-3 bg-violet-50/50" data-hc="preview-diagram">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center">
                <Palette className="w-3.5 h-3.5 text-violet-600" />
              </div>
              <p className="text-sm font-bold text-slate-700 uppercase tracking-wide">Gambar Potong Kertas</p>
            </div>
            {pvCutResult ? (
              <>
                <div className="bg-white rounded-lg border border-slate-200 p-2">
                  <CuttingDiagram results={pvCutResult} maxHeight="224px" />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <PvMiniStat label="Potong / Lembar" value={pvCutResult.totalPieces.toLocaleString('id-ID')} />
                  <PvMiniStat label="Lembar Dipakai" value={pvCutResult.sheetsNeeded.toLocaleString('id-ID')} />
                  <PvMiniStat label="Efisiensi Kertas" value={`${pvCutResult.efficiency.toFixed(1)}%`} />
                  <PvMiniStat label="Skenario" value={pvCutResult.scenarioType.replace(/-/g, ' ')} />
                </div>
              </>
            ) : (
              <div className="text-center py-10 text-xs text-slate-400 border border-dashed border-slate-300 rounded-lg bg-white/60">
                <Ruler className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                Lengkapi ukuran kertas &amp; ukuran potongan
                <br />untuk melihat gambar potong kertas
              </div>
            )}
          </div>

          {/* GRAND TOTAL — isinya hanya grand total saja (permintaan owner) */}
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl p-3 flex items-center shadow-lg shadow-orange-500/25">
            <div>
              <p className="text-[11px] text-orange-100 uppercase tracking-wide">Grand Total</p>
              <p className="text-3xl font-extrabold text-white">{formatRp(pvGrandTotal)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ===== TABEL SIMULASI CETAK — tersimpan di record; bila record lama tidak punya,
          tampilkan 1 baris hasil hitung otomatis dari data record (selalu tampil) ===== */}
      {pvSimRows.length > 0 && (
        <div className="mt-3 border border-cyan-200 rounded-xl p-3 bg-cyan-50/40">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg bg-cyan-100 flex items-center justify-center">
              <Layers className="w-3.5 h-3.5 text-cyan-600" />
            </div>
            <p className="text-sm font-bold text-slate-700 uppercase tracking-wide">Tabel Simulasi ({pvSimRows.length})</p>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 pb-1.5 pr-2">Jumlah Pesanan</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 pb-1.5 pr-2 whitespace-nowrap">Lembar Kertas</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 pb-1.5 pr-2">Profit</th>
                <th className="text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 pb-1.5 px-2 whitespace-nowrap">Modal</th>
                <th className="text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 pb-1.5 px-2 whitespace-nowrap">Modal/Pcs</th>
                <th className="text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 pb-1.5 px-2 whitespace-nowrap">Harga Jual</th>
                <th className="text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 pb-1.5 pl-2 whitespace-nowrap">Jual/Pcs</th>
              </tr>
            </thead>
            <tbody>
              {pvSimRows.map((s, i) => (
                <tr key={`sim-${i}`} className="border-b border-slate-100 last:border-b-0">
                  <td className="py-1 pr-2 text-xs font-semibold text-slate-700 tabular-nums whitespace-nowrap">{s.jumlah.toLocaleString('id-ID')} lbr</td>
                  <td className="py-1 pr-2 text-xs font-semibold text-teal-700 tabular-nums whitespace-nowrap">{s.sheets > 0 ? s.sheets.toLocaleString('id-ID') : '-'}</td>
                  <td className="py-1 pr-2 text-xs text-slate-500 tabular-nums whitespace-nowrap">{s.profit > 0 ? `${s.profit}%` : '-'}</td>
                  <td className="py-1 px-2 text-right text-xs font-bold text-slate-700 tabular-nums whitespace-nowrap">{formatRp(s.modal)}</td>
                  <td className="py-1 px-2 text-right text-xs text-slate-600 tabular-nums whitespace-nowrap">{s.modalPcs > 0 ? formatHargaPcs(s.modalPcs) : '-'}</td>
                  <td className="py-1 px-2 text-right text-xs font-bold text-emerald-700 tabular-nums whitespace-nowrap">{formatRp(s.jual)}</td>
                  <td className="py-1 pl-2 text-right text-xs font-semibold text-emerald-700 tabular-nums whitespace-nowrap">{s.jualPcs > 0 ? formatHargaPcs(s.jualPcs) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1.5 text-[9.5px] text-slate-400">{pvSimFromRecord
            ? '* Simulasi dihitung otomatis dari data yang tersimpan (jumlah pesanan record ini).'
            : '* Hasil Simulasi Cepat saat data disimpan — perbandingan jumlah pesanan.'}</p>
        </div>
      )}
    </>
  )
}
