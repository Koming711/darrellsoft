'use client'

/**
 * TAB "GABUNG" — Hitung Cetakan
 *
 * Gabungkan beberapa riwayat Hitung Cetakan menjadi SATU harga.
 * Alur user: hitung satu per satu (mis. kotak kue: tutup atas, tutup bawah,
 * sekat dalam — tiap komponen disimpan sebagai riwayat sendiri), lalu di tab
 * ini pilih beberapa riwayat → langsung muncul harga gabungan:
 *
 *   Sub Total Gabungan (Σ subTotal) + Profit → Grand Total Gabungan
 *   Harga Modal per Pcs = Σ subTotal ÷ Jumlah Pesanan Gabungan
 *   Harga Jual per Pcs  = Grand Total Gabungan ÷ Jumlah Pesanan Gabungan
 *
 * UI: DUA TABEL lengkap (bukan kartu kecil):
 *   1. "Daftar Hitungan" — semua riwayat dgn kolom penuh incl. Modal/pcs &
 *      Jual/pcs (klik baris / centang untuk masukkan ke gabungan).
 *   2. "Komponen Gabungan" — komponen terpilih dgn kolom penuh (keluarkan per
 *      baris, Kosongkan semua dgn dialog konfirmasi, atur JP gabungan &
 *      profit seragam).
 *
 * JPG/Cetak: dokumen "Rincian Harga Gabungan" dirender di instance offscreen
 * (captureRef) yang SELALU tersedia saat ada komponen — tombol JPG/Cetak
 * berfungsi langsung tanpa perlu membuka preview dulu. Preview dialog
 * menampilkan dokumen yang sama (satu sumber capture).
 *
 * Profit: default mengikuti profit masing-masing hitungan; bisa di-override
 * dengan satu "Profit seragam (%)" untuk seluruh paket.
 *
 * Tidak menulis ke database: murni membaca riwayat yang sudah ada; pilihan
 * komponen disimpan di localStorage per-user agar bertahan saat reload.
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { Layers, Search, Eye, Printer, FileImage, Loader2, X, Square, CheckSquare, Percent, Calculator, Boxes, Trash2 } from 'lucide-react'
import { captureElementAsJpg, fitBlobToA5 } from '@/lib/capture-jpg'
import { shareJpgToWhatsApp } from '@/lib/share-jpg'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { toast } from 'sonner'

// ===== Helpers =====

const fmtRp = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`

/** Format harga per pcs: 2 desimal bila < Rp1.000, bulat bila >= Rp1.000. */
const fmtHargaPcs = (n: number) => {
  const v = Math.round(n * 100) / 100
  if (Math.abs(v) >= 1000) return `Rp ${Math.round(v).toLocaleString('id-ID')}`
  return `Rp ${v.toLocaleString('id-ID', { minimumFractionDigits: v % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })}`
}

const parseJp = (s: unknown): number => {
  const v = parseInt(String(s ?? '').replace(/[^\d]/g, ''), 10)
  return isNaN(v) ? 0 : v
}

function userKey(base: string): string {
  try {
    const a = JSON.parse(localStorage.getItem('auth') || '{}')
    if (a.id) return `${base}_${a.id}`
  } catch {}
  return base
}

/** Convert a Blob into a data URL (untuk embed gambar ke window cetak). */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Gagal membaca data gambar'))
    reader.readAsDataURL(blob)
  })
}

/** Label kertas: nama · gsm (tanpa jumlah warna). */
const labelKertas = (r: { paperName?: string | null; paperGrammage?: string | number | null }) =>
  [r.paperName || '', r.paperGrammage ? `${r.paperGrammage} gsm` : ''].filter(Boolean).join(' · ')

// ===== Tipe =====

/** Field riwayat yang dipakai gabungan (baris dari /api/riwayat-cetakan). */
interface GabungBaris {
  id: string
  printName?: string | null
  customerName?: string | null
  paperName?: string | null
  paperGrammage?: string | number | null
  warna?: string | null
  jumlahPesanan?: string | null
  quantity?: string | null
  subTotal?: number | null
  profitPercent?: number | null
  profitAmount?: number | null
  grandTotal?: number | null
  nomorUrut?: string | null
}

export function GabunganTab({ rows }: { rows: GabungBaris[] }) {
  // ===== Pilihan komponen (persist di localStorage) =====
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selLoaded, setSelLoaded] = useState(false)
  const [search, setSearch] = useState('')
  // ===== Dialog kosongkan =====
  const [clearOpen, setClearOpen] = useState(false)
  // ===== Input gabungan =====
  const [jumlahGabungan, setJumlahGabungan] = useState('')
  const [profitSeragam, setProfitSeragam] = useState('')
  // ===== Preview / aksi dokumen =====
  const [previewOpen, setPreviewOpen] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [isGeneratingJpg, setIsGeneratingJpg] = useState(false)
  // Instance dokumen offscreen — sumber capture JPG/Cetak (selalu mounted
  // saat ada komponen, sehingga JPG/Cetak berfungsi tanpa buka preview).
  const captureRef = useRef<HTMLDivElement>(null)

  // Muat pilihan tersimpan sekali saat mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(userKey('hitung-cetakan-gabungan-ids'))
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) setSelectedIds(arr.filter((x: unknown) => typeof x === 'string'))
      }
    } catch {}
    setSelLoaded(true)
  }, [])

  // Simpan pilihan tiap berubah (setelah load awal)
  useEffect(() => {
    if (selLoaded) {
      try { localStorage.setItem(userKey('hitung-cetakan-gabungan-ids'), JSON.stringify(selectedIds)) } catch {}
    }
  }, [selectedIds, selLoaded])

  const toggle = (id: string) =>
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => `${r.printName || ''} ${r.customerName || ''}`.toLowerCase().includes(q))
  }, [rows, search])

  const selected = useMemo(() => rows.filter(r => selectedIds.includes(r.id)), [rows, selectedIds])

  // ===== Perhitungan gabungan =====
  // Jumlah pesanan gabungan: bila semua komponen punya JP sama (mis. 3000 kotak),
  // pakai nilai itu; kalau beda, pakai JP hitungan pertama — user bisa override.
  const autoJumlah = useMemo(() => {
    const jps = selected.map(r => parseJp(r.jumlahPesanan)).filter(v => v > 0)
    return jps.length ? jps[0] : 0
  }, [selected])

  const nGabungan = parseJp(jumlahGabungan) > 0 ? parseJp(jumlahGabungan) : autoJumlah

  const totals = useMemo(() => {
    const sub = selected.reduce((s, r) => s + (Number(r.subTotal) || 0), 0)
    const profitAsli = selected.reduce((s, r) => s + (Number(r.profitAmount) || 0), 0)
    const pt = profitSeragam.trim()
    const pv = parseFloat(pt.replace(',', '.'))
    const seragam = pt !== '' && !isNaN(pv) && pv >= 0
    const profit = seragam ? (sub * pv) / 100 : profitAsli
    const grand = sub + profit
    const perPcs = nGabungan > 0 ? grand / nGabungan : 0
    const modalPcs = nGabungan > 0 ? sub / nGabungan : 0
    return { sub, profitAsli, seragam, profitVal: seragam ? pv : 0, profit, grand, perPcs, modalPcs }
  }, [selected, profitSeragam, nGabungan])

  const gabungCustomer = useMemo(() => {
    const withCust = selected.find(r => (r.customerName || '').trim() !== '')
    return withCust ? withCust.customerName.trim() : ''
  }, [selected])

  // ===== Cetak & JPG (capture dari instance offscreen — tidak perlu preview terbuka) =====
  const handlePrint = async () => {
    const el = captureRef.current
    if (!el) { toast.error('Pilih komponen terlebih dahulu'); return }
    setIsPrinting(true)
    try {
      const blob = await captureElementAsJpg(el, { pixelRatio: 3 })
      const dataUrl = await blobToDataUrl(blob)
      const custLabel = gabungCustomer || 'gabungan'
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>Rincian Harga Gabungan ${custLabel}</title>
<style>
  @page { size: A5 landscape; margin: 5mm; }
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #ffffff; }
  body { display: flex; align-items: center; justify-content: center; overflow: hidden; }
  img { display: block; max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; }
</style></head>
<body><img src="${dataUrl}" alt="Rincian Harga Gabungan" onload="setTimeout(function(){ window.focus(); window.print(); }, 250)" /></body></html>`
      const pw = window.open('', '_blank')
      if (!pw) { toast.error('Popup diblokir'); return }
      pw.document.write(html)
      pw.document.close()
    } catch (e) {
      console.error('Print error:', e)
      toast.error('Gagal menyiapkan cetakan')
    } finally { setIsPrinting(false) }
  }

  const handleJpg = async () => {
    const el = captureRef.current
    if (!el) { toast.error('Pilih komponen terlebih dahulu'); return }
    setIsGeneratingJpg(true)
    try {
      const rawBlob = await captureElementAsJpg(el, { pixelRatio: 3 })
      const blob = await fitBlobToA5(rawBlob, { orientation: 'landscape', marginPct: 3 })
      const custLabel = gabungCustomer || 'gabungan'
      const fileName = `rincian-gabungan-${custLabel.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.jpg`
      const result = await shareJpgToWhatsApp({ blob, fileName, documentLabel: 'Rincian Harga Gabungan' })
      if (result.status === 'shared') {
        toast.success('Gambar JPG dikirim ke WhatsApp')
      } else if (result.status === 'downloaded') {
        toast.success('JPG diunduh ke perangkat', { description: 'File JPG telah disimpan ke folder Downloads.' })
      } else if (result.status === 'error') {
        toast.error(result.error || 'Gagal memproses JPG')
      }
    } catch (e) {
      console.error('JPG generation error:', e)
      toast.error('Gagal menghasilkan gambar JPG')
    } finally { setIsGeneratingJpg(false) }
  }

  // ===== Dokumen "Rincian Harga Gabungan" =====
  // Dipakai di 2 tempat: instance offscreen (sumber capture) & preview dialog.
  const renderDokumen = () => (
    <div className="p-4 sm:p-5 bg-white max-w-3xl w-full mx-auto">
      {/* Header dokumen */}
      <div className="text-center pb-3 border-b-2 border-slate-200 mb-3">
        <div className="flex items-center justify-center gap-2">
          <Calculator className="w-5 h-5 text-blue-600" />
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Rincian Harga Gabungan</h1>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          {gabungCustomer !== '' ? <span className="font-semibold text-slate-600">{gabungCustomer} · </span> : null}
          <span>{new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          <span> · {selected.length} komponen</span>
        </p>
      </div>

      {/* Tabel komponen */}
      <table className="w-full mb-3">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left text-xs font-bold uppercase tracking-wide text-slate-400 pb-2 pr-2">Komponen</th>
            <th className="text-right text-xs font-bold uppercase tracking-wide text-slate-400 pb-2 pr-2 whitespace-nowrap">Jumlah</th>
            <th className="text-right text-xs font-bold uppercase tracking-wide text-slate-400 pb-2 pr-2 whitespace-nowrap">Modal/Pcs</th>
            <th className="text-right text-xs font-bold uppercase tracking-wide text-slate-400 pb-2 pr-2 whitespace-nowrap">Sub Total</th>
            <th className="text-right text-xs font-bold uppercase tracking-wide text-slate-400 pb-2 pr-2 whitespace-nowrap">
              {totals.seragam ? 'Sub Total' : 'Profit'}
            </th>
            <th className="text-right text-xs font-bold uppercase tracking-wide text-slate-400 pb-2 pl-2 whitespace-nowrap">Jual/Pcs</th>
          </tr>
        </thead>
        <tbody>
          {selected.map((r, i) => {
            const jp = parseJp(r.jumlahPesanan)
            const modalPcs = jp > 0 ? (Number(r.subTotal) || 0) / jp : 0
            const jualPcs = jp > 0 ? (Number(r.grandTotal) || 0) / jp : 0
            return (
              <tr key={r.id} className="border-b border-slate-100 last:border-b-0">
                <td className="py-2 pr-2 align-top">
                  <p className="text-sm font-bold text-slate-700 leading-snug">{i + 1}. {r.printName || '-'}</p>
                  <p className="text-xs text-slate-400 leading-snug">{labelKertas(r)}</p>
                </td>
                <td className="py-2 pr-2 align-top text-right text-sm text-slate-500 tabular-nums whitespace-nowrap">
                  {jp > 0 ? `${jp.toLocaleString('id-ID')} lbr` : '-'}
                </td>
                <td className="py-2 pr-2 align-top text-right text-xs font-semibold text-slate-500 tabular-nums whitespace-nowrap">
                  {jp > 0 ? fmtHargaPcs(modalPcs) : '—'}
                </td>
                <td className="py-2 pr-2 align-top text-right text-sm font-semibold text-slate-600 tabular-nums whitespace-nowrap">
                  {fmtRp(Number(r.subTotal) || 0)}
                </td>
                <td className="py-2 pr-2 align-top text-right text-sm font-semibold tabular-nums whitespace-nowrap">
                  {totals.seragam ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <span className="text-violet-600">
                      {Number(r.profitAmount) > 0 ? `${Math.round(Number(r.profitPercent) || 0)}% · ${fmtRp(Number(r.profitAmount))}` : '—'}
                    </span>
                  )}
                </td>
                <td className="py-2 pl-2 align-top text-right text-sm font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                  {jp > 0 ? fmtHargaPcs(jualPcs) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Total gabungan */}
      <div className="border-t-2 border-slate-200 pt-2.5 space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-sm font-bold text-slate-600 uppercase tracking-wide">Sub Total Gabungan</span>
          <span className="text-base font-extrabold text-slate-800 tabular-nums">{fmtRp(totals.sub)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm font-bold text-orange-600 uppercase tracking-wide">
            {totals.seragam ? `Profit (${totals.profitVal.toLocaleString('id-ID')}% seragam)` : 'Total Profit'}
          </span>
          <span className="text-base font-extrabold text-orange-600 tabular-nums">{fmtRp(totals.profit)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-base font-extrabold text-slate-900 uppercase tracking-wide">Grand Total Gabungan</span>
          <span className="text-xl font-extrabold text-emerald-600 tabular-nums">{fmtRp(totals.grand)}</span>
        </div>
        {nGabungan > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-500">
              Harga Modal per Pcs ({nGabungan.toLocaleString('id-ID')} lbr)
            </span>
            <span className="text-sm font-bold text-slate-600 tabular-nums">{fmtHargaPcs(totals.modalPcs)}</span>
          </div>
        )}
        {nGabungan > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-500">
              Harga Jual per Pcs ({nGabungan.toLocaleString('id-ID')} lbr)
            </span>
            <span className="text-sm font-bold text-emerald-700 tabular-nums">{fmtHargaPcs(totals.perPcs)}</span>
          </div>
        )}
      </div>

      {/* Grand total banner */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl p-4 flex items-center justify-between shadow-lg shadow-emerald-500/25 mt-3">
        <div>
          <p className="text-xs text-emerald-100 uppercase tracking-wide">Grand Total Gabungan</p>
          <p className="text-3xl font-extrabold text-white">{fmtRp(totals.grand)}</p>
        </div>
        <div className="text-right text-sm text-emerald-100/90 space-y-0.5">
          <p>Sub Total: <span className="font-semibold text-white">{fmtRp(totals.sub)}</span></p>
          <p>{totals.seragam ? `Profit (${totals.profitVal}%)` : 'Profit'}: <span className="font-semibold text-white">{fmtRp(totals.profit)}</span></p>
          {nGabungan > 0 && <p>Modal/Pcs: <span className="font-semibold text-white">{fmtHargaPcs(totals.modalPcs)}</span></p>}
          {nGabungan > 0 && <p>Jual/Pcs: <span className="font-semibold text-white">{fmtHargaPcs(totals.perPcs)}</span></p>}
        </div>
      </div>
    </div>
  )

  // ===== Kelas tabel (font besar) =====
  const thCls = 'sticky top-0 z-10 h-10 px-2 bg-slate-100 dark:bg-zinc-800 text-[11px] lg:text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300 whitespace-nowrap'
  const tdCls = 'px-2 py-2.5 text-sm text-slate-700 dark:text-slate-200 align-middle'

  return (
    <div className="space-y-4">
      {/* ===== TABEL 1: DAFTAR HITUNGAN ===== */}
      <div className="bg-card rounded-xl border border-slate-200 dark:border-zinc-700 p-3 sm:p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
              <Layers className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold text-slate-800 dark:text-slate-100">
                Daftar Hitungan
                <span className="ml-2 text-xs font-semibold text-slate-400">
                  {rows.length} hitungan{selectedIds.length > 0 ? ` · ${selectedIds.length} dipilih` : ''}
                </span>
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
                Klik baris / centang untuk memasukkan ke gabungan — hitung tiap komponen satu per satu (mis. kotak kue: tutup atas, tutup bawah, sekat), simpan ke riwayat, lalu gabung di sini jadi 1 harga.
              </p>
            </div>
          </div>
          {rows.length > 0 && (
            <button
              onClick={() => setSelectedIds(Array.from(new Set([...selectedIds, ...filtered.map(r => r.id)])))}
              className="flex-shrink-0 text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 px-2.5 py-1.5 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors whitespace-nowrap"
            >
              Pilih Semua
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="border border-dashed border-slate-300 dark:border-zinc-600 rounded-lg py-10 text-center">
            <Boxes className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-zinc-600" />
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Belum ada hitungan tersimpan</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Hitung tiap komponen di tab Editor lalu simpan ke riwayat — setelah itu pilih di sini untuk digabung.</p>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari nama barang / customer..."
                className="pl-9 h-9 text-sm"
              />
            </div>
            <div className="max-h-[26rem] overflow-y-auto scrollbar-thin rounded-lg border border-slate-200 dark:border-zinc-700">
              <Table className="min-w-[940px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={`${thCls} w-7 text-center`}>✓</TableHead>
                    <TableHead className={`${thCls} w-14`}>No.</TableHead>
                    <TableHead className={thCls}>Nama Barang</TableHead>
                    <TableHead className={thCls}>Customer</TableHead>
                    <TableHead className={thCls}>Kertas · gsm</TableHead>
                    <TableHead className={`${thCls} text-right`}>JP (lbr)</TableHead>
                    <TableHead className={`${thCls} text-right`}>Sub Total</TableHead>
                    <TableHead className={`${thCls} text-right`}>Modal/pcs</TableHead>
                    <TableHead className={`${thCls} text-right`}>Profit</TableHead>
                    <TableHead className={`${thCls} text-right`}>Grand Total</TableHead>
                    <TableHead className={`${thCls} text-right`}>Jual/pcs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={11} className="text-center py-8 text-sm text-slate-400">
                        Tidak ada hitungan yang cocok dengan pencarian.
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map(r => {
                    const isSel = selectedIds.includes(r.id)
                    const jp = parseJp(r.jumlahPesanan)
                    const pct = Math.round(Number(r.profitPercent) || 0)
                    const pAmt = Number(r.profitAmount) || 0
                    const sub = Number(r.subTotal) || 0
                    const grand = Number(r.grandTotal) || 0
                    return (
                      <TableRow
                        key={r.id}
                        onClick={() => toggle(r.id)}
                        aria-pressed={isSel}
                        className={`cursor-pointer transition-colors ${isSel
                          ? 'bg-emerald-50 hover:bg-emerald-100/70 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30'
                          : 'hover:bg-slate-50 dark:hover:bg-zinc-800/60'}`}
                      >
                        <TableCell className={`${tdCls} text-center`}>
                          {isSel
                            ? <CheckSquare className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mx-auto" />
                            : <Square className="w-5 h-5 text-slate-300 dark:text-zinc-600 mx-auto" />}
                        </TableCell>
                        <TableCell className={`${tdCls} text-slate-400 text-[11px] font-semibold tabular-nums`}>
                          {r.nomorUrut || '—'}
                        </TableCell>
                        <TableCell className={`${tdCls} max-w-[135px]`}>
                          <p className={`font-bold truncate ${isSel ? 'text-emerald-900 dark:text-emerald-200' : 'text-slate-800 dark:text-slate-100'}`} title={r.printName || '-'}>
                            {r.printName || '-'}
                          </p>
                        </TableCell>
                        <TableCell className={`${tdCls} max-w-[85px]`}>
                          <p className="truncate text-slate-600 dark:text-slate-300" title={r.customerName || ''}>{r.customerName || '—'}</p>
                        </TableCell>
                        <TableCell className={`${tdCls} max-w-[100px]`}>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400" title={labelKertas(r)}>{labelKertas(r) || '—'}</p>
                        </TableCell>
                        <TableCell className={`${tdCls} text-right tabular-nums`}>
                          {jp > 0 ? jp.toLocaleString('id-ID') : '—'}
                        </TableCell>
                        <TableCell className={`${tdCls} text-right font-semibold tabular-nums`}>
                          {fmtRp(sub)}
                        </TableCell>
                        <TableCell className={`${tdCls} text-right text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums`}>
                          {jp > 0 ? fmtHargaPcs(sub / jp) : '—'}
                        </TableCell>
                        <TableCell className={`${tdCls} text-right tabular-nums`}>
                          {pAmt > 0 ? (
                            <>
                              <p className="font-semibold text-violet-600 dark:text-violet-400">{pct}%</p>
                              <p className="text-xs text-slate-400 tabular-nums">{fmtRp(pAmt)}</p>
                            </>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className={`${tdCls} text-right font-extrabold text-slate-800 dark:text-slate-100 tabular-nums`}>
                          {fmtRp(grand)}
                        </TableCell>
                        <TableCell className={`${tdCls} text-right font-bold text-emerald-600 dark:text-emerald-400 tabular-nums`}>
                          {jp > 0 ? fmtHargaPcs(grand / jp) : '—'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      {/* ===== TABEL 2: KOMPONEN GABUNGAN ===== */}
      {selected.length > 0 && (
        <div className="bg-card rounded-xl border-2 border-emerald-300 dark:border-emerald-700 p-3 sm:p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                <Calculator className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold text-slate-800 dark:text-slate-100">
                  Komponen Gabungan <span className="text-slate-400 font-semibold">({selected.length} komponen)</span>
                </p>
                {gabungCustomer !== '' && (
                  <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 truncate">{gabungCustomer}</p>
                )}
              </div>
            </div>
            <button
              onClick={() => setClearOpen(true)}
              className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 px-2.5 py-1.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" /> Kosongkan
            </button>
          </div>

          {/* Tabel komponen terpilih */}
          <div className="rounded-lg border border-slate-200 dark:border-zinc-700 overflow-x-auto">
            <Table className="min-w-[880px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={`${thCls} w-10`}>No.</TableHead>
                  <TableHead className={thCls}>Nama Barang</TableHead>
                  <TableHead className={thCls}>Kertas · gsm</TableHead>
                  <TableHead className={`${thCls} text-right`}>JP (lbr)</TableHead>
                  <TableHead className={`${thCls} text-right`}>Sub Total</TableHead>
                  <TableHead className={`${thCls} text-right`}>Modal/pcs</TableHead>
                  <TableHead className={`${thCls} text-right`}>Profit</TableHead>
                  <TableHead className={`${thCls} text-right`}>Grand Total</TableHead>
                  <TableHead className={`${thCls} text-right`}>Jual/pcs</TableHead>
                  <TableHead className={`${thCls} w-10 text-center`}>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selected.map((r, i) => {
                  const jp = parseJp(r.jumlahPesanan)
                  const pct = Math.round(Number(r.profitPercent) || 0)
                  const pAmt = Number(r.profitAmount) || 0
                  const sub = Number(r.subTotal) || 0
                  const grand = Number(r.grandTotal) || 0
                  return (
                    <TableRow key={r.id} className="bg-emerald-50/40 hover:bg-emerald-50 dark:bg-emerald-900/10 dark:hover:bg-emerald-900/20">
                      <TableCell className={`${tdCls} text-slate-400 text-xs font-semibold tabular-nums`}>{i + 1}</TableCell>
                      <TableCell className={`${tdCls} font-bold text-slate-800 dark:text-slate-100 max-w-[170px]`}>
                        <p className="truncate" title={r.printName || '-'}>{r.printName || '-'}</p>
                      </TableCell>
                      <TableCell className={`${tdCls} max-w-[140px]`}>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400" title={labelKertas(r)}>{labelKertas(r) || '—'}</p>
                      </TableCell>
                      <TableCell className={`${tdCls} text-right tabular-nums`}>
                        {jp > 0 ? jp.toLocaleString('id-ID') : '—'}
                      </TableCell>
                      <TableCell className={`${tdCls} text-right font-semibold tabular-nums`}>
                        {fmtRp(sub)}
                      </TableCell>
                      <TableCell className={`${tdCls} text-right text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums`}>
                        {jp > 0 ? fmtHargaPcs(sub / jp) : '—'}
                      </TableCell>
                      <TableCell className={`${tdCls} text-right tabular-nums`}>
                        {pAmt > 0 ? (
                          <>
                            <p className="font-semibold text-violet-600 dark:text-violet-400">{pct}%</p>
                            <p className="text-xs text-slate-400 tabular-nums">{fmtRp(pAmt)}</p>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className={`${tdCls} text-right font-extrabold text-slate-800 dark:text-slate-100 tabular-nums`}>
                        {fmtRp(grand)}
                      </TableCell>
                      <TableCell className={`${tdCls} text-right font-bold text-emerald-600 dark:text-emerald-400 tabular-nums`}>
                        {jp > 0 ? fmtHargaPcs(grand / jp) : '—'}
                      </TableCell>
                      <TableCell className={`${tdCls} text-center`}>
                        <button
                          onClick={e => { e.stopPropagation(); toggle(r.id) }}
                          aria-label={`Keluarkan ${r.printName || 'komponen'} dari gabungan`}
                          title="Keluarkan dari gabungan"
                          className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors"
                        >
                          <X className="w-4.5 h-4.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Input jumlah gabungan + profit seragam */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Jumlah Pesanan Gabungan
              </label>
              <Input
                value={jumlahGabungan}
                onChange={e => setJumlahGabungan(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                placeholder={autoJumlah > 0 ? autoJumlah.toLocaleString('id-ID') : '0'}
                className="h-10 text-sm"
              />
            </div>
            <div>
              <label className="flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                <Percent className="w-3.5 h-3.5" /> Profit Seragam (opsional)
              </label>
              <Input
                value={profitSeragam}
                onChange={e => setProfitSeragam(e.target.value.replace(/[^\d.,]/g, ''))}
                inputMode="decimal"
                placeholder="Ikut masing-masing"
                className="h-10 text-sm"
              />
            </div>
          </div>

          {/* Total gabungan */}
          <div className="rounded-xl border border-slate-200 dark:border-zinc-700 overflow-hidden">
            <div className="flex justify-between items-center px-4 py-2 bg-white dark:bg-zinc-900">
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Sub Total Gabungan</span>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200 tabular-nums">{fmtRp(totals.sub)}</span>
            </div>
            <div className="flex justify-between items-center px-4 py-2 bg-white dark:bg-zinc-900 border-t border-slate-100 dark:border-zinc-800">
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {totals.seragam ? `Profit ${totals.profitVal.toLocaleString('id-ID')}% (seragam)` : 'Total Profit'}
              </span>
              <span className="text-sm font-bold text-violet-600 dark:text-violet-400 tabular-nums">
                {totals.seragam ? `${fmtRp(totals.profit)} (${totals.profitVal}%)` : fmtRp(totals.profit)}
              </span>
            </div>
            <div className="flex justify-between items-center px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600">
              <span className="text-sm font-bold text-emerald-100 uppercase tracking-wide">Grand Total Gabungan</span>
              <span className="text-2xl font-extrabold text-white tabular-nums">{fmtRp(totals.grand)}</span>
            </div>
            {nGabungan > 0 && (
              <div className="grid grid-cols-2 divide-x divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Modal/Pcs</span>
                  <span className="text-sm font-extrabold text-slate-600 dark:text-slate-300 tabular-nums">{fmtHargaPcs(totals.modalPcs)}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Jual/Pcs <span className="text-slate-400">({nGabungan.toLocaleString('id-ID')} pcs)</span>
                  </span>
                  <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">{fmtHargaPcs(totals.perPcs)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Aksi dokumen */}
          <div className="flex gap-2">
            <button
              onClick={() => setPreviewOpen(true)}
              className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              <Eye className="w-4.5 h-4.5" /> Preview
            </button>
            <button
              onClick={handleJpg}
              disabled={isGeneratingJpg}
              title="Kirim gambar JPG gabungan (WhatsApp / unduh)"
              className="flex-1 flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-400 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              {isGeneratingJpg ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <FileImage className="w-4.5 h-4.5" />} JPG
            </button>
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              title="Cetak rincian gabungan (fit A5 landscape)"
              className="flex-1 flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              {isPrinting ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Printer className="w-4.5 h-4.5" />} Cetak
            </button>
          </div>
        </div>
      )}

      {/* Empty state: ada hitungan tapi belum ada komponen dipilih */}
      {rows.length > 0 && selected.length === 0 && (
        <div className="border border-dashed border-emerald-300 dark:border-emerald-700 rounded-xl py-6 text-center bg-emerald-50/40 dark:bg-emerald-900/10">
          <Layers className="w-8 h-8 mx-auto mb-2 text-emerald-300 dark:text-emerald-700" />
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Belum ada komponen dipilih</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Centang hitungan di tabel &quot;Daftar Hitungan&quot; di atas — bisa lebih dari satu (mis. tutup atas + tutup bawah + sekat).</p>
        </div>
      )}

      {/* Instance dokumen offscreen — sumber capture JPG/Cetak (tidak terlihat,
          selalu mounted saat ada komponen agar tombol JPG/Cetak berfungsi langsung) */}
      {selected.length > 0 && (
        <div
          ref={captureRef}
          aria-hidden="true"
          className="fixed top-0 bg-white"
          style={{ left: '-10000px', width: '768px', zIndex: -1, pointerEvents: 'none' }}
        >
          {renderDokumen()}
        </div>
      )}

      {/* ===== DIALOG KONFIRMASI KOSONGKAN ===== */}
      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kosongkan gabungan?</AlertDialogTitle>
            <AlertDialogDescription>
              Semua komponen ({selected.length}) akan dikeluarkan dari gabungan. Riwayat hitungan tidak terhapus — bisa dipilih lagi kapan saja.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setSelectedIds([]); setClearOpen(false); toast.success('Gabungan dikosongkan') }}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              Kosongkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== PREVIEW DIALOG: RINCIAN HARGA GABUNGAN ===== */}
      {previewOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 lg:p-0" onClick={() => setPreviewOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            onClick={e => e.stopPropagation()}
            className="relative bg-card rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden lg:max-w-none lg:max-h-none lg:h-full lg:rounded-none lg:border-0"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-200 bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 rounded-t-xl select-none flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400 cursor-pointer" onClick={() => setPreviewOpen(false)} />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                </div>
                <span className="text-[22px] font-bold text-slate-700 dark:text-slate-200 ml-2 leading-tight truncate">Rincian Harga Gabungan</span>
              </div>
              <button onClick={() => setPreviewOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1" aria-label="Tutup preview">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Konten dokumen */}
            <div className="overflow-y-auto flex-1 min-h-0 overscroll-contain">
              {renderDokumen()}
            </div>

            {/* Footer aksi */}
            <div className="sticky bottom-0 bg-card border-t border-slate-200 dark:border-zinc-700 p-3 flex gap-2 flex-shrink-0">
              <button
                onClick={handlePrint}
                disabled={isPrinting}
                className="flex-1 flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-semibold py-2 rounded-lg text-sm whitespace-nowrap transition-colors"
              >
                {isPrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} Cetak
              </button>
              <button
                onClick={handleJpg}
                disabled={isGeneratingJpg}
                className="flex-1 flex items-center justify-center gap-1 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-400 text-white font-semibold py-2 rounded-lg text-sm whitespace-nowrap transition-colors"
              >
                {isGeneratingJpg ? <><Loader2 className="w-4 h-4 animate-spin" />JPG...</> : <><FileImage className="w-4 h-4" /> JPG</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
