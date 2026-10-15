'use client'

/**
 * GabunganCompare — PANEL PERBANDINGAN DUA RIWAYAT (Panel A & Panel B).
 *
 * Desktop : dua kolom berdampingan.
 * Mobile  : kartu bertumpuk vertikal.
 * Data tampil apa adanya dari baris riwayat/snapshot; nilai tidak tersedia
 * ditampilkan "-" (tidak pernah mengarang).
 *
 * Tombol per panel: Lihat Detail · Preview Riwayat · Ganti Riwayat ·
 * Keluarkan dari Pilihan (dilempar ke parent via callback).
 */

import { Eye, FileText, Repeat, X } from 'lucide-react'
import { fmtRp, fmtHargaPcs, parseJp } from '@/components/hitung-cetakan/gabungan-format'

export interface CompareRow {
  id?: string | null
  nomorUrut?: string | null
  createdAt?: string | null
  customerName?: string | null
  printName?: string | null
  paperName?: string | null
  paperGrammage?: string | number | null
  paperLength?: string | null
  paperWidth?: string | null
  cutWidth?: string | null
  cutHeight?: string | null
  jumlahPesanan?: string | null
  quantity?: string | null
  berapaMata?: string | null
  setelanKertas?: string | null
  warna?: string | null
  warnaKhusus?: string | null
  warna2?: string | null
  warnaKhusus2?: string | null
  machineName?: string | null
  machineName2?: string | null
  hargaPlat?: number | null
  hargaPlat2?: number | null
  ongkosCetak?: number | null
  ongkosCetak2?: number | null
  totalPaperPrice?: number | null
  finishingNames?: string | null
  finishingCost?: number | null
  packingCost?: number | null
  shippingCost?: number | null
  otherCost?: number | null
  otherCost2?: number | null
  otherCostLabel?: string | null
  otherCostLabel2?: string | null
  subTotal?: number | null
  profitPercent?: number | null
  profitAmount?: number | null
  grandTotal?: number | null
}

const tglId = (s?: string | null) =>
  s
    ? new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
    : '-'

/** Baris field label : nilai (nilai kosong → "-"). */
function Cf({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  const empty = value === '' || value === null || value === undefined
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-zinc-800 last:border-b-0">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 whitespace-nowrap">{label}</span>
      <span className={`text-sm font-bold text-right tabular-nums break-words ${empty ? 'text-slate-300 dark:text-zinc-600' : accent || 'text-slate-700 dark:text-slate-200'}`}>
        {empty ? '-' : value}
      </span>
    </div>
  )
}

/** Panel satu riwayat — seluruh informasi penting perhitungan asli. */
export function GabunganComparePanel({
  label,
  slotIndex,
  r,
  onDetail,
  onPreview,
  onGanti,
  onKeluarkan,
}: {
  label: string
  slotIndex: 1 | 2
  r: CompareRow | null
  onDetail?: (r: CompareRow) => void
  onPreview?: (r: CompareRow) => void
  onGanti?: (slot: 1 | 2) => void
  onKeluarkan?: (slot: 1 | 2) => void
}) {
  const jp = r ? parseJp(r.jumlahPesanan) || parseJp(r.quantity) : 0
  const sub = Number(r?.subTotal) || 0
  const pAmt = Number(r?.profitAmount) || 0
  const pct = Math.round(Number(r?.profitPercent) || 0)
  const grand = Number(r?.grandTotal) || 0

  const ukKertas = r && r.paperLength && r.paperWidth ? `${r.paperLength} × ${r.paperWidth} cm` : ''
  const ukPotong = r && r.cutWidth && r.cutHeight ? `${r.cutWidth} × ${r.cutHeight} cm` : ''
  const kertas = r ? [r.paperName || '', r.paperGrammage && r.paperGrammage !== '0' ? `${r.paperGrammage} gsm` : ''].filter(Boolean).join(' · ') : ''

  const biayaLain: { label: string; v: number }[] = []
  if (Number(r?.otherCost) > 0) biayaLain.push({ label: r?.otherCostLabel || 'Biaya Lain 1', v: Number(r?.otherCost) })
  if (Number(r?.otherCost2) > 0) biayaLain.push({ label: r?.otherCostLabel2 || 'Biaya Lain 2', v: Number(r?.otherCost2) })

  return (
    <div className="rounded-xl border-2 border-blue-200 dark:border-blue-800/60 bg-card overflow-hidden">
      {/* Header panel */}
      <div className="flex items-start justify-between gap-2 px-3 sm:px-4 py-2.5 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800/60">
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-blue-500 dark:text-blue-400">Panel {label}</p>
          <p className="font-bold text-slate-800 dark:text-slate-100 truncate leading-tight">{r?.printName || '-'}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {r?.customerName || '-'}{r?.nomorUrut ? ` · ${r.nomorUrut}` : ''}{r?.createdAt ? ` · ${tglId(r.createdAt)}` : ''}
          </p>
        </div>
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-extrabold flex items-center justify-center" aria-hidden="true">
          {slotIndex}
        </span>
      </div>

      {/* Body */}
      <div className="px-3 sm:px-4 py-2">
        <Cf label="Tanggal" value={tglId(r?.createdAt)} />
        <Cf label="Pelanggan" value={r?.customerName || ''} />
        <Cf label="Nama Cetakan" value={r?.printName || ''} />
        <Cf label="Bahan / Kertas" value={kertas} />
        <Cf label="Ukuran Kertas" value={ukKertas} />
        <Cf label="Ukuran Potongan" value={ukPotong} />
        <Cf label="Jumlah Pesanan" value={jp > 0 ? `${jp.toLocaleString('id-ID')} lbr` : ''} />
        <Cf label="Jumlah Mata" value={r?.berapaMata || ''} />
        <Cf label="Setelan Kertas" value={r?.setelanKertas || ''} />
        <Cf label="Warna Cetak" value={[r?.warna || '', r?.warnaKhusus && r.warnaKhusus !== '0' ? `khusus ${r.warnaKhusus}` : ''].filter(Boolean).join(' + ')} />
        <Cf label="Mesin" value={[r?.machineName || '', r?.machineName2 || ''].filter(Boolean).join(' + ')} />
        <Cf label="Harga Plat" value={r ? fmtRp((Number(r.hargaPlat) || 0) + (Number(r.hargaPlat2) || 0)) : ''} />
        <Cf label="Ongkos Cetak" value={r ? fmtRp((Number(r.ongkosCetak) || 0) + (Number(r.ongkosCetak2) || 0)) : ''} />
        <Cf label="Finishing" value={r?.finishingNames || ''} />
        {biayaLain.map((b, i) => (
          <Cf key={i} label={b.label} value={fmtRp(b.v)} />
        ))}
        <Cf label="Packing" value={r && Number(r.packingCost) > 0 ? fmtRp(Number(r.packingCost)) : ''} />
        <Cf label="Kirim" value={r && Number(r.shippingCost) > 0 ? fmtRp(Number(r.shippingCost)) : ''} />

        {/* Ringkasan biaya */}
        <div className="mt-2 rounded-lg bg-slate-50 dark:bg-zinc-800/60 px-3 py-2 space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Sub Total (Biaya Dasar)</span>
            <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 tabular-nums">{r ? fmtRp(sub) : '-'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-violet-600 dark:text-violet-400 uppercase">Profit {pAmt > 0 ? `(${pct}%)` : ''}</span>
            <span className="text-sm font-extrabold text-violet-600 dark:text-violet-400 tabular-nums">{r ? (pAmt > 0 ? fmtRp(pAmt) : '-') : '-'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Grand Total</span>
            <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">{r ? fmtRp(grand) : '-'}</span>
          </div>
          <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-zinc-700">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Modal/pcs</span>
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 tabular-nums">{r && jp > 0 ? fmtHargaPcs(sub / jp) : '-'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Jual/pcs</span>
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{r && jp > 0 ? fmtHargaPcs(grand / jp) : '-'}</span>
          </div>
        </div>

        {/* Aksi per panel */}
        <div className="grid grid-cols-2 gap-1.5 mt-3">
          <button
            onClick={() => r && onDetail?.(r)}
            disabled={!r}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 px-2 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Eye className="w-3.5 h-3.5" /> Lihat Detail
          </button>
          <button
            onClick={() => r && onPreview?.(r)}
            disabled={!r}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 px-2 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileText className="w-3.5 h-3.5" /> Preview Riwayat
          </button>
          <button
            onClick={() => onGanti?.(slotIndex)}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-800 px-2 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
          >
            <Repeat className="w-3.5 h-3.5" /> Ganti Riwayat
          </button>
          <button
            onClick={() => onKeluarkan?.(slotIndex)}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-800 px-2 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Keluarkan
          </button>
        </div>
      </div>
    </div>
  )
}

/** Dua panel perbandingan — grid 2 kolom desktop, bertumpuk mobile. */
export function GabunganCompareGrid({
  r1,
  r2,
  onDetail,
  onPreview,
  onGanti,
  onKeluarkan,
}: {
  r1: CompareRow | null
  r2: CompareRow | null
  onDetail?: (r: CompareRow) => void
  onPreview?: (r: CompareRow) => void
  onGanti?: (slot: 1 | 2) => void
  onKeluarkan?: (slot: 1 | 2) => void
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <GabunganComparePanel label="A — Riwayat 1" slotIndex={1} r={r1} onDetail={onDetail} onPreview={onPreview} onGanti={onGanti} onKeluarkan={onKeluarkan} />
      <GabunganComparePanel label="B — Riwayat 2" slotIndex={2} r={r2} onDetail={onDetail} onPreview={onPreview} onGanti={onGanti} onKeluarkan={onKeluarkan} />
    </div>
  )
}
