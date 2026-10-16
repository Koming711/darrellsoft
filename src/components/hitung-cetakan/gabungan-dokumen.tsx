'use client'

/**
 * GabunganDokumen — dokumen "RINCIAN GABUNGAN HITUNG CETAKAN" (Bagian C)
 * + komposisi preview TIGA BAGIAN (Riwayat 1 / Riwayat 2 / Hasil Gabungan).
 *
 * Preview Riwayat 1 & 2 memakai komponen ASLI aplikasi (RincianCetakanPreview
 * + mapRiwayatToRincianData) — dokumen rincian perhitungan yang sama persis
 * dengan preview satu riwayat — sehingga Bagian A & B identik dengan sumber.
 *
 * Dokumen gabungan dirender berlebar TETAP 768px (tanpa varian responsif)
 * supaya capture JPG/Cetak identik mobile & desktop (pola sama dengan
 * dokumen "Rincian Harga Gabungan" lama); tampilan dialog di-skala via
 * FixedDocScaler.
 *
 * Semua angka berasal dari DATA ASLI (baris riwayat / snapshot yang
 * tersimpan) — tidak ada nilai statis/dummy.
 */

import { Calculator, Layers, FileText } from 'lucide-react'
import { FixedDocScaler } from '@/components/fixed-doc-scaler'
import { RincianCetakanPreview, mapRiwayatToRincianData, type RiwayatCetakanRow } from '@/components/rincian-cetakan-preview'
import { fmtRp, fmtHargaPcs } from '@/components/hitung-cetakan/gabungan-format'
import type { GabunganHasil } from '@/lib/gabungan-calc'

// ============================================================
// Dokumen gabungan (Bagian C)
// ============================================================

export interface GabunganDokumenProps {
  /** Nomor dokumen gabungan (mis. GB/10/26/0001) — kosong = belum tersimpan */
  nomorDokumen?: string
  /** Tanggal dokumen (ISO) — default hari ini */
  tanggal?: string | Date
  customerName: string
  namaProyek: string
  nomorSumber1: string
  nomorSumber2: string
  r1: RiwayatCetakanRow | null
  r2: RiwayatCetakanRow | null
  hasil: GabunganHasil
  catatan?: string
}

/** Satu blok rincian biaya per riwayat sumber di dalam dokumen gabungan. */
function RincianSumber({
  label,
  r,
  nomorSumber,
}: {
  label: string
  r: RiwayatCetakanRow | null
  nomorSumber: string
}) {
  if (!r) {
    return (
      <div className="rounded-lg border border-slate-200 p-3 mb-3">
        <p className="text-sm font-bold text-slate-500">{label}</p>
        <p className="text-xs text-slate-400 mt-1">Data sumber tidak tersedia (-)</p>
      </div>
    )
  }
  const jp = parseInt(String(r.jumlahPesanan ?? '').replace(/[^\d]/g, '')) || 0
  const sub = Number(r.subTotal) || 0
  const pAmt = Number(r.profitAmount) || 0
  const pct = Math.round(Number(r.profitPercent) || 0)
  const grand = Number(r.grandTotal) || 0

  // Komponen biaya yang TERCATAT pada riwayat (informatif — Sub Total
  // tetap memakai nilai subTotal asli riwayat sebagai satu-satunya acuan).
  const komponen: { name: string; detail: string; amount: number | null }[] = [
    {
      name: 'Kertas',
      detail: [r.paperName || '-', r.paperGrammage && r.paperGrammage !== '0' ? `${r.paperGrammage} gsm` : '', r.paperLength && r.paperWidth ? `${r.paperLength}×${r.paperWidth} cm` : ''].filter(Boolean).join(' · '),
      amount: Number(r.totalPaperPrice) || 0,
    },
    {
      name: `Plat${Number(r.hargaPlat2) > 0 ? ' ×2' : ''}`,
      detail: r.machineName || '-',
      amount: Number(r.hargaPlat) || 0,
    },
    {
      name: 'Ongkos Cetak',
      detail: [r.machineName || '', r.warna ? `${r.warna} warna` : ''].filter(Boolean).join(' · ') || '-',
      amount: Number(r.ongkosCetak) || 0,
    },
  ]
  if (Number(r.ongkosCetak2) > 0) {
    komponen.push({
      name: 'Ongkos Cetak 2',
      detail: [r.machineName2 || '', r.warna2 ? `${r.warna2} warna` : ''].filter(Boolean).join(' · ') || '-',
      amount: Number(r.ongkosCetak2),
    })
  }
  if (Number(r.finishingCost) > 0) {
    komponen.push({ name: 'Finishing', detail: r.finishingNames || '-', amount: Number(r.finishingCost) })
  }
  if (Number(r.glueCost) > 0) {
    komponen.push({ name: 'Ongkos Lem', detail: r.glueLengthCm ? `${r.glueLengthCm} cm` : '-', amount: Number(r.glueCost) })
  }
  if (Number(r.glueBorongan) > 0) {
    komponen.push({ name: 'Lem Borongan', detail: '-', amount: Number(r.glueBorongan) })
  }
  if (Number(r.packingCost) > 0) {
    komponen.push({ name: 'Ongkos Packing', detail: '-', amount: Number(r.packingCost) })
  }
  if (Number(r.shippingCost) > 0) {
    komponen.push({ name: 'Ongkos Kirim', detail: '-', amount: Number(r.shippingCost) })
  }
  if (Number(r.otherCost) > 0) {
    komponen.push({ name: r.otherCostLabel || 'Biaya Lain', detail: '-', amount: Number(r.otherCost) })
  }
  if (Number(r.otherCost2) > 0) {
    komponen.push({ name: r.otherCostLabel2 || 'Biaya Lain 2', detail: '-', amount: Number(r.otherCost2) })
  }

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden mb-3">
      <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-slate-800 leading-tight">{label}</p>
          <p className="text-[11px] text-slate-500 leading-tight">
            {r.printName || '-'}{nomorSumber ? ` · No. ${nomorSumber}` : ''}
          </p>
        </div>
        <p className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
          {r.customerName || '-'}{jp > 0 ? ` · ${jp.toLocaleString('id-ID')} lbr` : ''}
        </p>
      </div>
      <table className="w-full">
        <tbody>
          {komponen.map((k, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-b-0">
              <td className="py-1 pl-3 pr-2 text-xs font-semibold text-slate-700 align-top whitespace-nowrap">{k.name}</td>
              <td className="py-1 pr-2 text-[10.5px] text-slate-400 align-top">{k.detail}</td>
              <td className="py-1 pr-3 pl-2 text-right text-xs font-bold text-slate-700 tabular-nums whitespace-nowrap">
                {k.amount !== null ? fmtRp(k.amount) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-slate-200 bg-slate-50/60">
        <div className="flex justify-between items-center px-3 py-1.5">
          <span className="text-xs font-bold text-slate-600 uppercase">Sub Total (Biaya Dasar)</span>
          <span className="text-sm font-extrabold text-slate-800 tabular-nums">{fmtRp(sub)}</span>
        </div>
        <div className="flex justify-between items-center px-3 pb-1.5">
          <span className="text-xs font-semibold text-violet-600">
            Profit{pAmt > 0 ? ` (${pct}%)` : ''}
          </span>
          <span className="text-xs font-bold text-violet-600 tabular-nums">{pAmt > 0 ? fmtRp(pAmt) : '-'}</span>
        </div>
        <div className="flex justify-between items-center px-3 pb-2">
          <span className="text-xs font-bold text-slate-600 uppercase">Grand Total</span>
          <span className="text-sm font-extrabold text-emerald-700 tabular-nums">{fmtRp(grand)}</span>
        </div>
        <div className="flex justify-between items-center px-3 pb-2 text-[10.5px] text-slate-500">
          <span>Modal/pcs: <span className="font-semibold text-slate-600">{jp > 0 ? fmtHargaPcs(sub / jp) : '-'}</span></span>
          <span>Jual/pcs: <span className="font-semibold text-emerald-700">{jp > 0 ? fmtHargaPcs(grand / jp) : '-'}</span></span>
        </div>
      </div>
    </div>
  )
}

/** Dokumen "RINCIAN GABUNGAN HITUNG CETAKAN" — Bagian C. */
export function GabunganDokumen({
  nomorDokumen,
  tanggal,
  customerName,
  namaProyek,
  nomorSumber1,
  nomorSumber2,
  r1,
  r2,
  hasil,
  catatan,
}: GabunganDokumenProps) {
  const tgl = tanggal ? new Date(tanggal) : new Date()
  const jp = hasil.jumlahPesananGabungan
  return (
    <div className="p-5 bg-white w-full">
      {/* Header dokumen */}
      <div className="text-center pb-3 border-b-2 border-slate-200 mb-3">
        <div className="flex items-center justify-center gap-2">
          <Layers className="w-5 h-5 text-blue-600" />
          <h1 className="text-2xl font-bold text-slate-900 uppercase">Rincian Gabungan Hitung Cetakan</h1>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          {customerName ? <span className="font-semibold text-slate-600">{customerName} · </span> : null}
          <span>{tgl.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </p>
        <div className="flex items-center justify-center gap-3 mt-1.5 text-[11px] font-semibold text-slate-500 flex-wrap">
          <span className="rounded-full bg-blue-50 border border-blue-100 px-2 py-0.5 text-blue-700">
            {nomorDokumen || 'Draft — belum tersimpan'}
          </span>
          <span className="rounded-full bg-slate-50 border border-slate-200 px-2 py-0.5">Sumber 1: {nomorSumber1 || '-'}</span>
          <span className="rounded-full bg-slate-50 border border-slate-200 px-2 py-0.5">Sumber 2: {nomorSumber2 || '-'}</span>
        </div>
        {namaProyek && <p className="text-sm font-bold text-slate-700 mt-2">{namaProyek}</p>}
      </div>

      {/* Rincian per riwayat sumber */}
      <RincianSumber label="Riwayat 1" r={r1} nomorSumber={nomorSumber1} />
      <RincianSumber label="Riwayat 2" r={r2} nomorSumber={nomorSumber2} />

      {/* Total gabungan */}
      <div className="border-t-2 border-slate-200 pt-2.5 space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-sm font-bold text-slate-600 uppercase tracking-wide">Total Biaya Gabungan (R1 + R2)</span>
          <span className="text-base font-extrabold text-slate-800 tabular-nums">{fmtRp(hasil.totalBiayaDasar)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm font-bold text-orange-600 uppercase tracking-wide">
            {hasil.metodeProfit === 'seragam'
              ? `Profit Seragam (${hasil.profitPercent.toLocaleString('id-ID')}%)`
              : 'Profit Gabungan (masing-masing)'}
          </span>
          <span className="text-base font-extrabold text-orange-600 tabular-nums">{fmtRp(hasil.totalProfit)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-base font-extrabold text-slate-900 uppercase tracking-wide">Grand Total Gabungan</span>
          <span className="text-xl font-extrabold text-emerald-600 tabular-nums">{fmtRp(hasil.grandTotal)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs font-semibold text-slate-500">Jumlah Pesanan Gabungan</span>
          <span className="text-sm font-bold text-slate-600 tabular-nums">
            {jp > 0 ? `${jp.toLocaleString('id-ID')} lbr` : '-'}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs font-semibold text-slate-500">Harga Modal per Pcs</span>
          <span className="text-sm font-bold text-slate-600 tabular-nums">
            {jp > 0 ? fmtHargaPcs(hasil.modalPerPcs) : '-'}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs font-semibold text-slate-500">Harga Jual per Pcs</span>
          <span className="text-sm font-bold text-emerald-700 tabular-nums">
            {jp > 0 ? fmtHargaPcs(hasil.hargaJualPerPcs) : '-'}
          </span>
        </div>
      </div>

      {/* Banner grand total */}
      <div className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl p-4 flex items-center justify-between shadow-lg shadow-blue-500/25 mt-3">
        <div>
          <p className="text-xs text-blue-100 uppercase tracking-wide">Grand Total Gabungan</p>
          <p className="text-3xl font-extrabold text-white">{fmtRp(hasil.grandTotal)}</p>
        </div>
        <div className="text-right text-sm text-blue-100/90 space-y-0.5">
          <p>Total Biaya: <span className="font-semibold text-white">{fmtRp(hasil.totalBiayaDasar)}</span></p>
          <p>Profit: <span className="font-semibold text-white">{fmtRp(hasil.totalProfit)}</span></p>
          {jp > 0 && <p>Jual/Pcs: <span className="font-semibold text-white">{fmtHargaPcs(hasil.hargaJualPerPcs)}</span></p>}
        </div>
      </div>

      {/* Catatan */}
      {catatan && catatan.trim() !== '' && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Catatan</p>
          <p className="text-xs text-slate-600 whitespace-pre-wrap break-words">{catatan}</p>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Preview tiga bagian (Riwayat 1 / Riwayat 2 / Hasil Gabungan / Semua)
// ============================================================

export type GabunganPreviewTab = 'r1' | 'r2' | 'gabungan' | 'semua'

export const GABUNGAN_PREVIEW_TABS: { key: GabunganPreviewTab; label: string }[] = [
  { key: 'r1', label: 'Riwayat 1' },
  { key: 'r2', label: 'Riwayat 2' },
  { key: 'gabungan', label: 'Hasil Gabungan' },
  { key: 'semua', label: 'Tampilan Semua' },
]

/** Dokumen riwayat tunggal (Bagian A/B) — komponen ASLI aplikasi, 720px. */
export function DokumenRiwayatSumber({ r }: { r: RiwayatCetakanRow | null }) {
  if (!r) {
    return (
      <div className="p-8 bg-white text-center w-full">
        <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
        <p className="text-sm text-slate-400">Data riwayat tidak tersedia</p>
      </div>
    )
  }
  return <RincianCetakanPreview data={mapRiwayatToRincianData(r)} />
}

/** Konten preview 3 bagian — dipakai dialog preview & capture offscreen. */
export function GabunganPreviewContent({
  tab,
  r1,
  r2,
  nomorSumber1,
  nomorSumber2,
  gabungan,
  catatan,
}: {
  tab: GabunganPreviewTab
  r1: RiwayatCetakanRow | null
  r2: RiwayatCetakanRow | null
  nomorSumber1: string
  nomorSumber2: string
  gabungan: GabunganDokumenProps
  catatan?: string
}) {
  if (tab === 'r1') {
    return (
      <FixedDocScaler fixedWidth={720} innerClassName="p-4 bg-white">
        <DokumenRiwayatSumber r={r1} />
      </FixedDocScaler>
    )
  }
  if (tab === 'r2') {
    return (
      <FixedDocScaler fixedWidth={720} innerClassName="p-4 bg-white">
        <DokumenRiwayatSumber r={r2} />
      </FixedDocScaler>
    )
  }
  if (tab === 'gabungan') {
    return (
      <FixedDocScaler fixedWidth={768} innerClassName="bg-white">
        <GabunganDokumen {...gabungan} catatan={catatan} />
      </FixedDocScaler>
    )
  }
  // 'semua' — ketiga bagian bertumpuk, masing-masing pada lebar tetapnya
  return (
    <div className="bg-slate-100 py-3 space-y-4">
      <div className="px-3">
        <div className="mx-auto max-w-full rounded-lg bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white text-[11px] font-bold uppercase tracking-wide">
            <Calculator className="w-3.5 h-3.5" /> Bagian A — Riwayat 1 ({nomorSumber1 || '-'})
          </div>
          <FixedDocScaler fixedWidth={720} innerClassName="p-4 bg-white">
            <DokumenRiwayatSumber r={r1} />
          </FixedDocScaler>
        </div>
      </div>
      <div className="px-3">
        <div className="mx-auto max-w-full rounded-lg bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white text-[11px] font-bold uppercase tracking-wide">
            <Calculator className="w-3.5 h-3.5" /> Bagian B — Riwayat 2 ({nomorSumber2 || '-'})
          </div>
          <FixedDocScaler fixedWidth={720} innerClassName="p-4 bg-white">
            <DokumenRiwayatSumber r={r2} />
          </FixedDocScaler>
        </div>
      </div>
      <div className="px-3">
        <div className="mx-auto max-w-full rounded-lg bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 text-white text-[11px] font-bold uppercase tracking-wide">
            <Layers className="w-3.5 h-3.5" /> Bagian C — Hasil Gabungan
          </div>
          <FixedDocScaler fixedWidth={768} innerClassName="bg-white">
            <GabunganDokumen {...gabungan} catatan={catatan} />
          </FixedDocScaler>
        </div>
      </div>
    </div>
  )
}
