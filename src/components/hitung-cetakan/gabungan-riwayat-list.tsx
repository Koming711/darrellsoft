'use client'

/**
 * GabunganRiwayatList — READ/UPDATE/DELETE dokumen Gabungan Hitung Cetakan
 * yang tersimpan di database (model GabunganHitungCetakan).
 *
 * Kolom: Nomor dokumen · Tanggal · Pelanggan · Nama proyek · Nomor riwayat
 * sumber ×2 · Jumlah komponen · Total biaya · Profit · Grand total ·
 * Harga/pcs · Status · aksi (Detail, Preview, Edit, Duplikat, Hapus).
 *
 * Status dokumen dihitung dari snapshot vs baris sumber terkini:
 *   - 'aktif'         : kedua sumber ada & belum diedit sejak disimpan
 *   - 'sumber_berubah': sumber ada tetapi updatedAt ≠ snapshot → banner
 *                       dengan pilihan perbarui / pertahankan snapshot
 *   - 'sumber_hilang' : sumber tidak ditemukan (dihapus) → tetap tampil
 *                       dari snapshot, diberi peringatan
 * Hapus HANYA dokumen gabungan (dialog konfirmasi) — riwayat sumber utuh.
 */

import { useMemo, useState } from 'react'
import { Layers, Search, Eye, Pencil, Copy, Trash2, FileStack, AlertTriangle, RefreshCw, X, Loader2, FileText } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { RiwayatPeriodFilter, RiwayatCustomerFilter, riwayatDateRange, type RiwayatPeriod } from '@/components/dokupro/riwayat-period-filter'
import { fmtRp, fmtHargaPcs } from '@/components/hitung-cetakan/gabungan-format'
import { parseSnapshot, statusSumber, type GabunganStatusSumber } from '@/lib/gabungan-calc'
import { toast } from 'sonner'

export interface GabunganDoc {
  id: string
  nomorUrut: string
  namaProyek: string
  customerName: string
  riwayatCetakanId1: string
  riwayatCetakanId2: string
  nomorSumber1: string
  nomorSumber2: string
  jumlahPesananGabungan: number
  metodeProfit: string
  profitPercent: number
  totalBiayaDasar: number
  totalProfit: number
  grandTotal: number
  modalPerPcs: number
  hargaJualPerPcs: number
  catatan: string
  snapshotData: string
  createdAt: string
  updatedAt: string
}

const tglId = (s?: string | null, jam = false) =>
  s
    ? new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) +
      (jam ? ` · ${new Date(s).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : '')
    : '-'

/** Status badge sumber untuk satu dokumen. */
export function StatusSumberBadge({ status }: { status: GabunganStatusSumber }) {
  if (status === 'ok')
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">✓ Aktif</span>
  if (status === 'berubah')
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap">⚠ Sumber berubah</span>
  return <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-400 whitespace-nowrap">Sumber hilang</span>
}

export function GabunganRiwayatList({
  docs,
  rows,
  loading,
  onRefresh,
  onPreviewDoc,
  onEdited,
  onDuplicate,
}: {
  docs: GabunganDoc[]
  rows: Record<string, { updatedAt?: string | null } & Record<string, unknown>>
  loading: boolean
  onRefresh: () => void
  onPreviewDoc: (doc: GabunganDoc) => void
  onEdited: (doc: GabunganDoc) => void
  onDuplicate: (doc: GabunganDoc) => void
}) {
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<RiwayatPeriod>('all')
  const [fDateFrom, setFDateFrom] = useState('')
  const [fDateTo, setFDateTo] = useState('')
  const [fMonth, setFMonth] = useState<number | null>(null)
  const [fYear, setFYear] = useState<number | null>(null)
  const [customerFilter, setCustomerFilter] = useState('')

  // Dialog state
  const [detailDoc, setDetailDoc] = useState<GabunganDoc | null>(null)
  const [editDoc, setEditDoc] = useState<GabunganDoc | null>(null)
  const [deleteDoc, setDeleteDoc] = useState<GabunganDoc | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [isRefreshingSumber, setIsRefreshingSumber] = useState(false)

  // Form edit
  const [eNama, setENama] = useState('')
  const [eJp, setEJp] = useState('')
  const [eMetode, setEMetode] = useState<'masing_masing' | 'seragam'>('masing_masing')
  const [ePct, setEPct] = useState('')
  const [eCatatan, setECatatan] = useState('')
  const [eSrc1, setESrc1] = useState('')
  const [eSrc2, setESrc2] = useState('')
  const [gantiPicker, setGantiPicker] = useState<1 | 2 | null>(null)
  const [gantiSearch, setGantiSearch] = useState('')

  const eff = useMemo(() => riwayatDateRange(period, fDateFrom, fDateTo, fMonth, fYear), [period, fDateFrom, fDateTo, fMonth, fYear])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return docs.filter((d) => {
      const t = String(d.createdAt || '').slice(0, 10)
      if (eff.dateFrom && t && t < eff.dateFrom) return false
      if (eff.dateTo && t && t > eff.dateTo) return false
      if (customerFilter && String(d.customerName || '').trim() !== customerFilter) return false
      if (q && !`${d.nomorUrut} ${d.namaProyek} ${d.customerName} ${d.nomorSumber1} ${d.nomorSumber2}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [docs, search, customerFilter, eff])

  const filtersActive = period !== 'all' || !!fDateFrom || !!fDateTo || !!customerFilter || !!search.trim()
  const resetFilters = () => {
    setPeriod('all'); setFDateFrom(''); setFDateTo(''); setCustomerFilter(''); setSearch('')
  }

  const customerOptions = useMemo(() => {
    const set = new Set<string>()
    for (const d of docs) {
      const n = String(d.customerName || '').trim()
      if (n && n !== '-') set.add(n)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'))
  }, [docs])

  /** Status sumber per dokumen (snapshot vs baris live). */
  const statusOf = (d: GabunganDoc): GabunganStatusSumber =>
    statusSumber(parseSnapshot(d.snapshotData), rows[d.riwayatCetakanId1], rows[d.riwayatCetakanId2])

  // ===== Aksi =====
  const openEdit = (d: GabunganDoc) => {
    setEditDoc(d)
    setENama(d.namaProyek || '')
    setEJp(d.jumlahPesananGabungan > 0 ? String(d.jumlahPesananGabungan) : '')
    setEMetode(d.metodeProfit === 'seragam' ? 'seragam' : 'masing_masing')
    setEPct(d.metodeProfit === 'seragam' ? String(d.profitPercent || '') : '')
    setECatatan(d.catatan || '')
    setESrc1(d.riwayatCetakanId1)
    setESrc2(d.riwayatCetakanId2)
  }

  const submitEdit = async () => {
    if (!editDoc) return
    setIsSavingEdit(true)
    try {
      const res = await fetch(`/api/gabungan-cetakan/${editDoc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          namaProyek: eNama,
          jumlahPesananGabungan: parseInt(eJp.replace(/[^\d]/g, ''), 10) || 0,
          metodeProfit: eMetode,
          profitPercent: eMetode === 'seragam' ? parseFloat(ePct.replace(',', '.')) || 0 : 0,
          catatan: eCatatan,
          riwayatCetakanId1: eSrc1,
          riwayatCetakanId2: eSrc2,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(json?.error || 'Gagal menyimpan perubahan gabungan')
        return
      }
      toast.success('Dokumen gabungan diperbarui', { description: 'Hasil gabungan dihitung ulang dari sumber terbaru.' })
      setEditDoc(null)
      onEdited(json as GabunganDoc)
      onRefresh()
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setIsSavingEdit(false)
    }
  }

  const submitDelete = async () => {
    if (!deleteDoc) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/gabungan-cetakan/${deleteDoc.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        toast.error(json?.error || 'Gagal menghapus dokumen gabungan')
        return
      }
      toast.success('Dokumen gabungan dihapus', { description: `Riwayat sumber ${deleteDoc.nomorSumber1} & ${deleteDoc.nomorSumber2} tetap utuh.` })
      setDeleteDoc(null)
      onRefresh()
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setIsDeleting(false)
    }
  }

  /** "Perbarui dari sumber terbaru" — PATCH refreshSumber (snapshot + angka dihitung ulang). */
  const refreshSumber = async (d: GabunganDoc) => {
    setIsRefreshingSumber(true)
    try {
      const res = await fetch(`/api/gabungan-cetakan/${d.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshSumber: true }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(json?.error || 'Gagal memperbarui dari sumber')
        return
      }
      toast.success('Diperbarui dari sumber terbaru', { description: 'Snapshot gabungan kini mengikuti data riwayat terbaru.' })
      onRefresh()
      onEdited(json as GabunganDoc)
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setIsRefreshingSumber(false)
    }
  }

  const thCls = 'sticky top-0 z-10 h-10 px-2 bg-slate-100 dark:bg-zinc-800 text-[11px] lg:text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300 whitespace-nowrap'
  const tdCls = 'px-2 py-2.5 text-sm text-slate-700 dark:text-slate-200 align-middle'

  // Kandidat pengganti sumber (riwayat milik user, bukan pasangan aktif)
  const kandidatGanti = useMemo(() => {
    const q = gantiSearch.trim().toLowerCase()
    const other = gantiPicker === 1 ? eSrc2 : eSrc1
    return rows && Object.values(rows as Record<string, { id?: string; nomorUrut?: string; printName?: string; customerName?: string }>)
      .filter((r) => r.id && r.id !== other)
      .filter((r) => !q || `${r.nomorUrut || ''} ${r.printName || ''} ${r.customerName || ''}`.toLowerCase().includes(q))
      .sort((a, b) => String(b.nomorUrut || '').localeCompare(String(a.nomorUrut || '')))
      .slice(0, 30)
  }, [rows, gantiPicker, eSrc1, eSrc2, gantiSearch])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-card rounded-xl border border-slate-200 dark:border-zinc-700 p-3 sm:p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
              <FileStack className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold text-slate-800 dark:text-slate-100">
                Riwayat Gabungan
                <span className="ml-2 text-xs font-semibold text-slate-400">{filtered.length === docs.length ? `${docs.length} dokumen` : `${filtered.length} dari ${docs.length} dokumen`}</span>
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
                Dokumen gabungan tersimpan permanen di database — buka kembali, edit, duplikat, cetak, atau hapus. Riwayat sumber tidak pernah ikut terhapus.
              </p>
            </div>
          </div>
          <button onClick={onRefresh} title="Muat ulang daftar" aria-label="Muat ulang daftar gabungan" className="flex-shrink-0 p-2 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Filter */}
        <RiwayatPeriodFilter
          period={period}
          onChangePeriod={setPeriod}
          from={fDateFrom}
          to={fDateTo}
          onFromChange={setFDateFrom}
          onToChange={setFDateTo}
          month={fMonth}
          onMonthChange={setFMonth}
          year={fYear}
          onYearChange={setFYear}
          idPrefix="gab-riwayat"
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari no. gabungan / proyek / pelanggan / no. riwayat..."
              aria-label="Cari dokumen gabungan"
              className="pl-9 min-h-[44px] text-sm bg-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <RiwayatCustomerFilter idPrefix="gab-riwayat" options={customerOptions} value={customerFilter} onChange={setCustomerFilter} ariaLabel="Filter pelanggan gabungan" fullWidth />
            {filtersActive && (
              <button onClick={resetFilters} aria-label="Reset filter" title="Reset Filter" className="h-11 w-11 shrink-0 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Loading */}
        {loading && docs.length === 0 && (
          <div className="py-10 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
            Memuat dokumen gabungan…
          </div>
        )}

        {/* Empty */}
        {!loading && docs.length === 0 && (
          <div className="border border-dashed border-slate-300 dark:border-zinc-600 rounded-lg py-10 text-center">
            <FileStack className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-zinc-600" />
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Belum ada dokumen gabungan tersimpan</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Buka tab &quot;Buat Gabungan&quot;, pilih 2 riwayat, lalu tekan Simpan Gabungan.</p>
          </div>
        )}

        {/* Filter kosong */}
        {!loading && docs.length > 0 && filtered.length === 0 && (
          <div className="border border-dashed border-slate-300 dark:border-zinc-600 rounded-lg py-6 text-center text-sm text-slate-400">
            Tidak ada dokumen yang cocok dengan filter periode / pelanggan / pencarian.
          </div>
        )}

        {/* Mobile: kartu */}
        {filtered.length > 0 && (
          <div className="lg:hidden space-y-2">
            {filtered.map((d) => {
              const st = statusOf(d)
              return (
                <div key={d.id} className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-card p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] font-bold text-blue-700 dark:text-blue-400">{d.nomorUrut || '-'}</p>
                      <p className="font-bold text-[15px] text-slate-800 dark:text-slate-100 truncate leading-tight">{d.namaProyek || '(tanpa nama proyek)'}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{d.customerName || '—'} · {tglId(d.createdAt)}</p>
                    </div>
                    <StatusSumberBadge status={st} />
                  </div>
                  <div className="text-[10.5px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3">
                    <span>Sumber: <span className="font-mono font-semibold">{d.nomorSumber1 || '-'}</span> + <span className="font-mono font-semibold">{d.nomorSumber2 || '-'}</span></span>
                    <span>{d.jumlahPesananGabungan > 0 ? `${d.jumlahPesananGabungan.toLocaleString('id-ID')} lbr` : '-'} · 2 komponen</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 dark:bg-zinc-800/60 rounded-lg p-2.5 text-center">
                    <div>
                      <p className="text-[12px] font-bold text-slate-800 dark:text-slate-100 leading-tight">{fmtRp(d.totalBiayaDasar)}</p>
                      <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">Total Biaya</p>
                    </div>
                    <div className="border-x border-slate-200 dark:border-zinc-700">
                      <p className="text-[12px] font-bold text-violet-600 dark:text-violet-400 leading-tight">{fmtRp(d.totalProfit)}</p>
                      <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">Profit</p>
                    </div>
                    <div>
                      <p className="text-[12px] font-extrabold text-emerald-700 dark:text-emerald-400 leading-tight">{fmtRp(d.grandTotal)}</p>
                      <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">Grand Total</p>
                    </div>
                  </div>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 text-right">
                    Modal/pcs <span className="font-semibold">{d.jumlahPesananGabungan > 0 ? fmtHargaPcs(d.modalPerPcs) : '-'}</span> · Jual/pcs <span className="font-semibold text-emerald-600 dark:text-emerald-400">{d.jumlahPesananGabungan > 0 ? fmtHargaPcs(d.hargaJualPerPcs) : '-'}</span>
                  </p>
                  {/* Aksi */}
                  <div className="grid grid-cols-4 gap-1.5">
                    <button onClick={() => setDetailDoc(d)} title="Detail" className="flex flex-col items-center justify-center gap-0.5 rounded-lg border border-slate-200 dark:border-zinc-700 py-2 text-[10px] font-semibold text-slate-600 dark:text-slate-300 min-h-[44px]"><Eye className="w-3.5 h-3.5" /> Detail</button>
                    <button onClick={() => onPreviewDoc(d)} title="Preview" className="flex flex-col items-center justify-center gap-0.5 rounded-lg border border-slate-200 dark:border-zinc-700 py-2 text-[10px] font-semibold text-slate-600 dark:text-slate-300 min-h-[44px]"><FileText className="w-3.5 h-3.5" /> Preview</button>
                    <button onClick={() => openEdit(d)} title="Edit" className="flex flex-col items-center justify-center gap-0.5 rounded-lg border border-blue-200 dark:border-blue-800 py-2 text-[10px] font-semibold text-blue-600 dark:text-blue-400 min-h-[44px]"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                    <button onClick={() => setDeleteDoc(d)} title="Hapus" className="flex flex-col items-center justify-center gap-0.5 rounded-lg border border-rose-200 dark:border-rose-800 py-2 text-[10px] font-semibold text-rose-600 dark:text-rose-400 min-h-[44px]"><Trash2 className="w-3.5 h-3.5" /> Hapus</button>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    <button onClick={() => onDuplicate(d)} className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 min-h-[44px]"><Copy className="w-3.5 h-3.5" /> Duplikat Dokumen</button>
                  </div>
                  {st === 'berubah' && (
                    <button onClick={() => refreshSumber(d)} disabled={isRefreshingSumber} className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 py-2 text-xs font-semibold text-amber-700 dark:text-amber-400 min-h-[44px] disabled:opacity-50">
                      <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingSumber ? 'animate-spin' : ''}`} /> Perbarui dari Sumber Terbaru
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Desktop: tabel */}
        {filtered.length > 0 && (
          <div className="hidden lg:block rounded-lg border border-slate-200 dark:border-zinc-700 overflow-x-auto max-h-[34rem] overflow-y-auto scrollbar-thin">
            <Table className="min-w-[1180px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={thCls}>No. Gabungan</TableHead>
                  <TableHead className={thCls}>Tanggal</TableHead>
                  <TableHead className={thCls}>Pelanggan</TableHead>
                  <TableHead className={thCls}>Nama Proyek</TableHead>
                  <TableHead className={thCls}>Sumber (2 riwayat)</TableHead>
                  <TableHead className={thCls}>Komponen</TableHead>
                  <TableHead className={`${thCls} text-right`}>JP Gabungan</TableHead>
                  <TableHead className={`${thCls} text-right`}>Total Biaya</TableHead>
                  <TableHead className={`${thCls} text-right`}>Profit</TableHead>
                  <TableHead className={`${thCls} text-right`}>Grand Total</TableHead>
                  <TableHead className={`${thCls} text-right`}>Modal/pcs</TableHead>
                  <TableHead className={`${thCls} text-right`}>Jual/pcs</TableHead>
                  <TableHead className={thCls}>Status</TableHead>
                  <TableHead className={`${thCls} text-center`}>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => {
                  const st = statusOf(d)
                  return (
                    <TableRow key={d.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/60">
                      <TableCell className={`${tdCls} font-mono text-xs font-bold text-blue-700 dark:text-blue-400 whitespace-nowrap`}>{d.nomorUrut || '-'}</TableCell>
                      <TableCell className={`${tdCls} text-muted-foreground whitespace-nowrap text-xs`}>{tglId(d.createdAt)}</TableCell>
                      <TableCell className={`${tdCls} max-w-[110px]`}><p className="truncate" title={d.customerName || ''}>{d.customerName || '—'}</p></TableCell>
                      <TableCell className={`${tdCls} max-w-[150px]`}>
                        <p className="truncate font-semibold" title={d.namaProyek || ''}>{d.namaProyek || '(tanpa nama proyek)'}</p>
                      </TableCell>
                      <TableCell className={`${tdCls} whitespace-nowrap`}>
                        <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{d.nomorSumber1 || '-'}</p>
                        <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{d.nomorSumber2 || '-'}</p>
                      </TableCell>
                      <TableCell className={`${tdCls} text-center`}>2</TableCell>
                      <TableCell className={`${tdCls} text-right tabular-nums`}>{d.jumlahPesananGabungan > 0 ? d.jumlahPesananGabungan.toLocaleString('id-ID') : '-'}</TableCell>
                      <TableCell className={`${tdCls} text-right font-semibold tabular-nums`}>{fmtRp(d.totalBiayaDasar)}</TableCell>
                      <TableCell className={`${tdCls} text-right font-semibold text-violet-600 dark:text-violet-400 tabular-nums`}>{fmtRp(d.totalProfit)}</TableCell>
                      <TableCell className={`${tdCls} text-right font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums`}>{fmtRp(d.grandTotal)}</TableCell>
                      <TableCell className={`${tdCls} text-right text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums`}>{d.jumlahPesananGabungan > 0 ? fmtHargaPcs(d.modalPerPcs) : '-'}</TableCell>
                      <TableCell className={`${tdCls} text-right text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums`}>{d.jumlahPesananGabungan > 0 ? fmtHargaPcs(d.hargaJualPerPcs) : '-'}</TableCell>
                      <TableCell className={tdCls}><StatusSumberBadge status={st} /></TableCell>
                      <TableCell className={`${tdCls} text-center`}>
                        <div className="flex items-center justify-center gap-0.5">
                          <button onClick={() => setDetailDoc(d)} title="Detail" aria-label={`Detail ${d.nomorUrut}`} className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"><Eye className="w-4 h-4" /></button>
                          <button onClick={() => onPreviewDoc(d)} title="Preview" aria-label={`Preview ${d.nomorUrut}`} className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"><FileText className="w-4 h-4" /></button>
                          <button onClick={() => openEdit(d)} title="Edit" aria-label={`Edit ${d.nomorUrut}`} className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => onDuplicate(d)} title="Duplikat" aria-label={`Duplikat ${d.nomorUrut}`} className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"><Copy className="w-4 h-4" /></button>
                          <button onClick={() => setDeleteDoc(d)} title="Hapus" aria-label={`Hapus ${d.nomorUrut}`} className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* ===== DIALOG DETAIL ===== */}
      <Dialog open={!!detailDoc} onOpenChange={(o) => !o && setDetailDoc(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          {detailDoc && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Layers className="w-4.5 h-4.5 text-blue-600" />
                  {detailDoc.nomorUrut}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {detailDoc.namaProyek || '(tanpa nama proyek)'} · {detailDoc.customerName || '—'} · dibuat {tglId(detailDoc.createdAt, true)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                {/* Status sumber */}
                {(() => {
                  const st = statusOf(detailDoc)
                  if (st === 'ok') return null
                  return (
                    <div className={`rounded-lg border px-3 py-2.5 text-xs ${st === 'berubah' ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300' : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300'}`}>
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="font-bold">
                            {st === 'berubah'
                              ? 'Riwayat sumber telah berubah setelah dokumen ini disimpan.'
                              : 'Salah satu/kedua riwayat sumber sudah tidak ditemukan.'}
                          </p>
                          <p className="mt-0.5">
                            {st === 'berubah'
                              ? 'Snapshot yang tersimpan tetap dipakai. Klik "Perbarui dari Sumber" untuk menghitung ulang dari data terbaru.'
                              : 'Dokumen gabungan tampil dari snapshot yang tersimpan; data sumber tidak diubah.'}
                          </p>
                          {st === 'berubah' && (
                            <button onClick={() => { const d = detailDoc; setDetailDoc(null); refreshSumber(d) }} disabled={isRefreshingSumber} className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-2.5 py-1.5 text-[11px] font-bold transition-colors">
                              <RefreshCw className={`w-3 h-3 ${isRefreshingSumber ? 'animate-spin' : ''}`} /> Perbarui dari Sumber
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })()}
                {/* Info utama */}
                <div className="rounded-lg border border-slate-200 dark:border-zinc-700 divide-y divide-slate-100 dark:divide-zinc-800 px-3 text-sm">
                  <div className="flex justify-between py-2"><span className="text-slate-400 text-xs font-semibold uppercase">Riwayat Sumber</span><span className="font-mono text-xs font-bold text-right">{detailDoc.nomorSumber1 || '-'}<br />{detailDoc.nomorSumber2 || '-'}</span></div>
                  <div className="flex justify-between py-2"><span className="text-slate-400 text-xs font-semibold uppercase">Jumlah Komponen</span><span className="font-bold">2</span></div>
                  <div className="flex justify-between py-2"><span className="text-slate-400 text-xs font-semibold uppercase">Jumlah Pesanan Gabungan</span><span className="font-bold tabular-nums">{detailDoc.jumlahPesananGabungan > 0 ? `${detailDoc.jumlahPesananGabungan.toLocaleString('id-ID')} lbr` : '-'}</span></div>
                  <div className="flex justify-between py-2"><span className="text-slate-400 text-xs font-semibold uppercase">Metode Profit</span><span className="font-bold">{detailDoc.metodeProfit === 'seragam' ? `Seragam ${detailDoc.profitPercent}%` : 'Mengikuti masing-masing riwayat'}</span></div>
                  <div className="flex justify-between py-2"><span className="text-slate-400 text-xs font-semibold uppercase">Total Biaya</span><span className="font-bold tabular-nums">{fmtRp(detailDoc.totalBiayaDasar)}</span></div>
                  <div className="flex justify-between py-2"><span className="text-slate-400 text-xs font-semibold uppercase">Profit</span><span className="font-bold text-violet-600 tabular-nums">{fmtRp(detailDoc.totalProfit)}</span></div>
                  <div className="flex justify-between py-2"><span className="text-slate-400 text-xs font-semibold uppercase">Grand Total</span><span className="font-extrabold text-emerald-600 tabular-nums">{fmtRp(detailDoc.grandTotal)}</span></div>
                  <div className="flex justify-between py-2"><span className="text-slate-400 text-xs font-semibold uppercase">Modal per Pcs</span><span className="font-bold tabular-nums">{detailDoc.jumlahPesananGabungan > 0 ? fmtHargaPcs(detailDoc.modalPerPcs) : '-'}</span></div>
                  <div className="flex justify-between py-2"><span className="text-slate-400 text-xs font-semibold uppercase">Harga Jual per Pcs</span><span className="font-bold text-emerald-700 tabular-nums">{detailDoc.jumlahPesananGabungan > 0 ? fmtHargaPcs(detailDoc.hargaJualPerPcs) : '-'}</span></div>
                </div>
                {detailDoc.catatan && (
                  <div className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Catatan</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words mt-0.5">{detailDoc.catatan}</p>
                  </div>
                )}
                {/* Rincian rumus */}
                <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900 px-3 py-2 text-[11px] text-blue-800 dark:text-blue-300 space-y-0.5">
                  <p className="font-bold uppercase tracking-wide text-[10px] text-blue-500">Rumus Gabungan</p>
                  <p>Total Biaya = Sub Total {detailDoc.nomorSumber1 || 'R1'} + Sub Total {detailDoc.nomorSumber2 || 'R2'} = <span className="font-bold">{fmtRp(detailDoc.totalBiayaDasar)}</span></p>
                  <p>Profit = {detailDoc.metodeProfit === 'seragam' ? `${detailDoc.profitPercent}% × Total Biaya` : 'Profit R1 + Profit R2'} = <span className="font-bold">{fmtRp(detailDoc.totalProfit)}</span></p>
                  <p>Grand Total = Total Biaya + Profit = <span className="font-bold">{fmtRp(detailDoc.grandTotal)}</span></p>
                  {detailDoc.jumlahPesananGabungan > 0 && (
                    <>
                      <p>Modal/pcs = Total Biaya ÷ {detailDoc.jumlahPesananGabungan.toLocaleString('id-ID')} = <span className="font-bold">{fmtHargaPcs(detailDoc.modalPerPcs)}</span></p>
                      <p>Jual/pcs = Grand Total ÷ {detailDoc.jumlahPesananGabungan.toLocaleString('id-ID')} = <span className="font-bold">{fmtHargaPcs(detailDoc.hargaJualPerPcs)}</span></p>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG EDIT ===== */}
      <Dialog open={!!editDoc} onOpenChange={(o) => !o && setEditDoc(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          {editDoc && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Pencil className="w-4.5 h-4.5 text-blue-600" /> Edit Gabungan {editDoc.nomorUrut}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Ubah pengaturan gabungan — hasil dihitung ulang saat disimpan. Riwayat sumber tidak diubah.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">Nama Proyek Gabungan</label>
                  <Input value={eNama} onChange={(e) => setENama(e.target.value)} placeholder="mis. Kotak Kue Lebaran — Atas + Bawah" className="h-10 text-sm" maxLength={200} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">Jumlah Pesanan Gabungan</label>
                    <Input value={eJp} onChange={(e) => setEJp(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="mis. 3000" className="h-10 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">Metode Profit</label>
                    <select value={eMetode} onChange={(e) => setEMetode(e.target.value === 'seragam' ? 'seragam' : 'masing_masing')} className="w-full h-10 text-sm rounded-md border border-slate-300 dark:border-zinc-700 bg-card px-2 cursor-pointer" aria-label="Metode profit gabungan">
                      <option value="masing_masing">Masing-masing riwayat</option>
                      <option value="seragam">Seragam (%)</option>
                    </select>
                  </div>
                </div>
                {eMetode === 'seragam' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">Persen Profit Seragam (%)</label>
                    <Input value={ePct} onChange={(e) => setEPct(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" placeholder="mis. 15" className="h-10 text-sm" />
                  </div>
                )}
                {/* Ganti riwayat sumber */}
                <div className="rounded-lg border border-slate-200 dark:border-zinc-700 p-3 space-y-2">
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Riwayat Sumber</p>
                  {[1, 2].map((slot) => {
                    const curId = slot === 1 ? eSrc1 : eSrc2
                    const cur = Object.values(rows as Record<string, { id?: string; nomorUrut?: string; printName?: string; customerName?: string }>).find((r) => r.id === curId)
                    const curNo = cur?.nomorUrut || (slot === 1 ? editDoc.nomorSumber1 : editDoc.nomorSumber2)
                    return (
                      <div key={slot} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-slate-500 dark:text-slate-400">
                          <span className="font-bold text-blue-600 dark:text-blue-400">R{slot}:</span>{' '}
                          <span className="font-mono font-semibold">{curNo || '-'}</span>
                          {cur?.printName ? <span className="text-slate-400"> · {cur.printName}</span> : ''}
                        </span>
                        <button onClick={() => { setGantiPicker(slot as 1 | 2); setGantiSearch('') }} className="text-[11px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors whitespace-nowrap">
                          Ganti
                        </button>
                      </div>
                    )
                  })}
                  <p className="text-[10px] text-slate-400">Mengganti sumber akan menghitung ulang seluruh hasil gabungan dari data asli riwayat terpilih.</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">Catatan</label>
                  <textarea value={eCatatan} onChange={(e) => setECatatan(e.target.value)} rows={2} maxLength={2000} placeholder="Catatan dokumen (opsional)" className="w-full text-sm rounded-md border border-slate-300 dark:border-zinc-700 bg-card px-3 py-2 min-h-[44px] resize-y" />
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setEditDoc(null)} className="flex-1 h-10 rounded-lg border border-slate-300 dark:border-zinc-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors">Batal</button>
                  <button onClick={submitEdit} disabled={isSavingEdit} className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white text-sm font-bold transition-colors flex items-center justify-center gap-1.5">
                    {isSavingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Simpan Perubahan
                  </button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== PICKER GANTI SUMBER (dalam dialog edit) ===== */}
      <Dialog open={gantiPicker !== null} onOpenChange={(o) => !o && setGantiPicker(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Ganti Riwayat Sumber {gantiPicker === 1 ? '1' : '2'}</DialogTitle>
            <DialogDescription className="text-xs">Pilih riwayat pengganti — riwayat sumber satunya tetap dipertahankan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input value={gantiSearch} onChange={(e) => setGantiSearch(e.target.value)} placeholder="Cari nomor / barang / pelanggan…" className="h-10 text-sm" aria-label="Cari riwayat pengganti" />
            <div className="max-h-72 overflow-y-auto scrollbar-thin rounded-lg border border-slate-200 dark:border-zinc-700 divide-y divide-slate-100 dark:divide-zinc-800">
              {kandidatGanti.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-6">Tidak ada riwayat yang cocok.</p>
              )}
              {kandidatGanti.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    if (gantiPicker === 1) setESrc1(r.id!)
                    else setESrc2(r.id!)
                    setGantiPicker(null)
                    toast.success(`Sumber ${gantiPicker} diganti ke ${r.nomorUrut || 'riwayat terpilih'}`, { description: 'Tekan Simpan Perubahan untuk menghitung ulang.' })
                  }}
                  className="w-full text-left px-3 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{r.printName || '-'}</p>
                  <p className="text-[10.5px] text-slate-400 truncate">{r.customerName || '—'} · <span className="font-mono">{r.nomorUrut || '-'}</span></p>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG KONFIRMASI HAPUS ===== */}
      <AlertDialog open={!!deleteDoc} onOpenChange={(o) => !o && setDeleteDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus dokumen gabungan?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus dokumen gabungan {deleteDoc?.nomorUrut || ''}?
              Riwayat hitung cetakan sumber ({deleteDoc?.nomorSumber1 || '-'} & {deleteDoc?.nomorSumber2 || '-'}) tidak akan ikut terhapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); submitDelete() }}
              disabled={isDeleting}
              className="bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
