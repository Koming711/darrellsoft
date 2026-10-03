'use client'

/**
 * SbRiwayat — tab Riwayat Stok (ledger gabungan masuk/keluar/penyesuaian).
 *
 * - Filter bar: pencarian (no/keterangan/bahan), bahan, jenis mutasi, rentang tanggal.
 *   Pencarian di-debounce 300ms; filter lain langsung memicu refetch.
 * - Desktop: tabel (Tanggal | No. Transaksi | Bahan | Jenis | Masuk | Keluar | Saldo | Keterangan).
 * - Mobile: kartu ringkas per baris.
 * - Print & Simpan PDF: keduanya window.print() memakai #print-area tersembunyi
 *   (CSS @media print pola dari laporan/penjualan — sembunyikan semua kecuali #print-area).
 */

import { useEffect, useState } from 'react'
import { FileDown, History, Printer, RotateCcw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import type { BahanItem, RiwayatItem } from '@/lib/stock-bahan-types'
import { SbJenisBadge, fmtQty, fmtTgl } from '@/components/stock-bahan/sb-shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'Terjadi kesalahan'
}

/** CSS cetak #print-area (pola arsip laporan/penjualan) + sembunyi di layar. */
const PRINT_AREA_CSS = `
@media screen {
  #print-area {
    display: none;
  }
}
@media print {
  body > * {
    height: 0 !important;
    min-height: 0 !important;
    overflow: hidden !important;
    margin: 0 !important;
  }
  body *:not(#print-area):not(#print-area *) {
    visibility: hidden !important;
  }
  #print-area,
  #print-area * {
    visibility: visible !important;
  }
  #print-area {
    display: block !important;
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 24px !important;
    box-shadow: none !important;
    border: none !important;
  }
  @page {
    size: auto;
    margin: 12mm;
  }
}
`

const JENIS_OPTIONS = [
  { value: 'ALL', label: 'Semua Jenis' },
  { value: 'masuk', label: 'Stok Masuk' },
  { value: 'keluar', label: 'Stok Keluar' },
  { value: 'penyesuaian', label: 'Penyesuaian' },
]

function jenisLabel(v: string): string {
  return JENIS_OPTIONS.find((o) => o.value === v)?.label || 'Semua Jenis'
}

export default function SbRiwayat({ bahans }: { bahans: BahanItem[] }) {
  const [q, setQ] = useState('')
  const [bahanId, setBahanId] = useState('ALL')
  const [jenis, setJenis] = useState('ALL')
  const [dari, setDari] = useState('')
  const [sampai, setSampai] = useState('')

  const [items, setItems] = useState<RiwayatItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  // Debounce pencarian 300ms
  const [debouncedQ, setDebouncedQ] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  // Refetch saat filter berubah (pencarian ter-debounce)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const sp = new URLSearchParams()
        if (debouncedQ.trim()) sp.set('q', debouncedQ.trim())
        if (bahanId !== 'ALL') sp.set('bahanId', bahanId)
        if (jenis !== 'ALL') sp.set('jenis', jenis)
        if (dari) sp.set('dari', dari)
        if (sampai) sp.set('sampai', sampai)
        const res = await apiFetch<{ items: RiwayatItem[]; total: number }>(
          `/api/stock-bahan/riwayat?${sp.toString()}`
        )
        if (!cancelled) {
          setItems(res.items)
          setTotal(res.total)
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(errText(e))
          setItems([])
          setTotal(0)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [debouncedQ, bahanId, jenis, dari, sampai, reloadKey])

  const resetFilter = () => {
    setQ('')
    setBahanId('ALL')
    setJenis('ALL')
    setDari('')
    setSampai('')
    setReloadKey((n) => n + 1)
  }

  const print = () => window.print()

  const savePdf = () => {
    window.print()
    toast.info('Pilih "Save as PDF" pada dialog cetak untuk menyimpan sebagai PDF.')
  }

  const filterParts: string[] = []
  if (debouncedQ.trim()) filterParts.push(`Pencarian: "${debouncedQ.trim()}"`)
  if (bahanId !== 'ALL') {
    const b = bahans.find((x) => x.id === bahanId)
    filterParts.push(`Bahan: ${b ? b.nama : bahanId}`)
  }
  if (jenis !== 'ALL') filterParts.push(`Jenis: ${jenisLabel(jenis)}`)
  if (dari || sampai) filterParts.push(`Periode: ${dari || '…'} s/d ${sampai || '…'}`)
  const filterLabel = filterParts.length > 0 ? filterParts.join(' • ') : 'Semua data (tanpa filter)'

  return (
    <div className="space-y-4">
      {/* CSS cetak #print-area */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_AREA_CSS }} />

      {/* Header + tombol cetak */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg md:text-xl font-bold tracking-tight">Riwayat Stok</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? 'Memuat…' : `${total} transaksi tercatat`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={print} className="min-h-[44px] flex-1 sm:flex-none" aria-label="Cetak riwayat stok">
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button variant="outline" onClick={savePdf} className="min-h-[44px] flex-1 sm:flex-none" aria-label="Simpan riwayat stok sebagai PDF">
            <FileDown className="h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <Card className="p-0 gap-0">
        <CardContent className="p-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari no. transaksi / keterangan / bahan…"
                aria-label="Cari riwayat stok"
                className="pl-9 min-h-[44px]"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Bahan</Label>
              <Select value={bahanId} onValueChange={setBahanId}>
                <SelectTrigger className="min-h-[44px] w-full" aria-label="Filter bahan">
                  <SelectValue placeholder="Semua Bahan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Bahan</SelectItem>
                  {bahans.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.nama}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Jenis</Label>
              <Select value={jenis} onValueChange={setJenis}>
                <SelectTrigger className="min-h-[44px] w-full" aria-label="Filter jenis mutasi">
                  <SelectValue placeholder="Semua Jenis" />
                </SelectTrigger>
                <SelectContent>
                  {JENIS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Dari tanggal</Label>
              <Input type="date" value={dari} onChange={(e) => setDari(e.target.value)} className="min-h-[44px]" aria-label="Tanggal mulai" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Sampai tanggal</Label>
              <Input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} className="min-h-[44px]" aria-label="Tanggal akhir" />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={resetFilter} className="min-h-[44px] w-full sm:w-auto">
                <RotateCcw className="h-4 w-4" /> Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-stone-50">
                <TableRow className="bg-stone-50 hover:bg-stone-50">
                  <TableHead className="w-28">Tanggal</TableHead>
                  <TableHead className="min-w-36">No. Transaksi</TableHead>
                  <TableHead className="min-w-44">Bahan</TableHead>
                  <TableHead className="min-w-32">Jenis</TableHead>
                  <TableHead className="text-right">Masuk</TableHead>
                  <TableHead className="text-right">Keluar</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="min-w-40">Keterangan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">{fmtTgl(r.tanggal)}</TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{r.nomor}</TableCell>
                    <TableCell className="font-medium">{r.bahanNama}</TableCell>
                    <TableCell>
                      <SbJenisBadge jenis={r.jenis} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {r.masuk > 0 ? (
                        <span className="font-medium text-emerald-600">{fmtQty(r.masuk)}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {r.keluar > 0 ? (
                        <span className="font-medium text-orange-600">{fmtQty(r.keluar)}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      <span className="font-semibold">{fmtQty(r.saldo)}</span>{' '}
                      <span className="text-xs text-muted-foreground">{r.satuan}</span>
                    </TableCell>
                    <TableCell className="max-w-40 truncate text-muted-foreground" title={r.keterangan}>
                      {r.keterangan || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2.5">
        {loading ? (
          [1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          items.map((r) => (
            <Card key={r.id} className="p-0 gap-0">
              <CardContent className="p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-snug">{r.bahanNama}</p>
                  <SbJenisBadge jenis={r.jenis} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {fmtTgl(r.tanggal)} • {r.nomor}
                </p>
                <div className="flex items-center gap-1.5 text-xs tabular-nums">
                  <span className="text-muted-foreground">Masuk</span>
                  <span className="font-semibold text-emerald-600">{fmtQty(r.masuk)}</span>
                  <span className="text-stone-300">•</span>
                  <span className="text-muted-foreground">Keluar</span>
                  <span className="font-semibold text-orange-600">{fmtQty(r.keluar)}</span>
                </div>
                <p className="text-sm tabular-nums">
                  <span className="text-muted-foreground">Saldo: </span>
                  <span className="font-bold">{fmtQty(r.saldo)}</span>{' '}
                  <span className="text-xs text-muted-foreground">{r.satuan}</span>
                </p>
                {r.keterangan && (
                  <p className="text-xs text-muted-foreground truncate" title={r.keterangan}>
                    {r.keterangan}
                  </p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* ===== Template cetak (tersembunyi di layar, tampil saat print/PDF) ===== */}
      <div id="print-area" aria-hidden="true">
        <div className="flex items-end justify-between border-b-2 border-stone-800 pb-2">
          <div>
            <p className="text-lg font-bold tracking-wide uppercase">Riwayat Stok</p>
            <p className="text-sm font-medium">{filterLabel}</p>
          </div>
          <p className="text-xs text-stone-500" suppressHydrationWarning>
            Dicetak: {new Date().toLocaleString('id-ID')}
          </p>
        </div>
        <table className="w-full border-collapse text-[12px] mt-4">
          <thead>
            <tr>
              {['Tanggal', 'No', 'Bahan', 'Jenis', 'Masuk', 'Keluar', 'Saldo'].map((h, i) => (
                <th
                  key={h}
                  className={`border border-stone-300 bg-stone-100 px-2 py-1 font-semibold ${i >= 4 ? 'text-right' : 'text-left'}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id}>
                <td className="border border-stone-300 px-2 py-1 whitespace-nowrap">{fmtTgl(r.tanggal)}</td>
                <td className="border border-stone-300 px-2 py-1 whitespace-nowrap">{r.nomor}</td>
                <td className="border border-stone-300 px-2 py-1">{r.bahanNama}</td>
                <td className="border border-stone-300 px-2 py-1 whitespace-nowrap">{jenisLabel(r.jenis)}</td>
                <td className="border border-stone-300 px-2 py-1 text-right tabular-nums">{r.masuk > 0 ? fmtQty(r.masuk) : '-'}</td>
                <td className="border border-stone-300 px-2 py-1 text-right tabular-nums">{r.keluar > 0 ? fmtQty(r.keluar) : '-'}</td>
                <td className="border border-stone-300 px-2 py-1 text-right tabular-nums font-semibold">{fmtQty(r.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-stone-500 mt-3">
          Total {total} transaksi tercatat (ditampilkan: {items.length} baris).
        </p>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <History className="h-8 w-8 text-stone-300" aria-hidden="true" />
      <p className="text-sm font-medium">Belum ada riwayat stok</p>
      <p className="text-xs text-muted-foreground">Transaksi stok masuk, keluar, dan penyesuaian akan tercatat di sini.</p>
    </div>
  )
}
