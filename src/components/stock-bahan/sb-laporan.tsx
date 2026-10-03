'use client'

/**
 * SbLaporan — tab Laporan Stok per periode.
 *
 * - Filter: periode (dari/sampai), bahan, kategori, supplier (mengandung).
 *   Fetch awal tanpa filter (semua periode); tombol Terapkan menjalankan filter,
 *   Reset mengosongkan dan memuat ulang.
 * - 4 kartu ringkasan + 2 chip (Menipis/Habis) dari response.ringkasan.
 * - Desktop: tabel lengkap (stok awal/akhir, mutasi, harga modal, nilai, status).
 *   Mobile: kartu ringkas.
 * - Print & Simpan PDF: window.print() memakai #print-area tersembunyi
 *   (CSS @media print pola dari laporan/penjualan) + baris TOTAL + footer ringkasan.
 */

import { useEffect, useState } from 'react'
import { AlertTriangle, CircleX, FileBarChart, FileDown, Printer, RotateCcw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { formatIDR } from '@/lib/format'
import { KATEGORI_BAHAN } from '@/lib/stock-bahan-types'
import type { BahanItem, LaporanResponse } from '@/lib/stock-bahan-types'
import { SbStatusBadge, fmtQty } from '@/components/stock-bahan/sb-shared'
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

interface FilterState {
  dari: string
  sampai: string
  bahanId: string
  kategori: string
  suplier: string
}

const EMPTY_FILTER: FilterState = { dari: '', sampai: '', bahanId: '', kategori: '', suplier: '' }

/** Penyesuaian net dengan tanda ± (contoh: +5 / -3 / 0). */
function fmtPenyesuaian(n: number): string {
  if (n > 0) return `+${fmtQty(n)}`
  if (n < 0) return `-${fmtQty(Math.abs(n))}`
  return '0'
}

export default function SbLaporan({ bahans }: { bahans: BahanItem[] }) {
  // Draft filter (diisi user) vs applied filter (yang dipakai fetch)
  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTER)
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTER)
  const [reloadKey, setReloadKey] = useState(0)

  const [data, setData] = useState<LaporanResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const sp = new URLSearchParams()
        if (applied.dari) sp.set('dari', applied.dari)
        if (applied.sampai) sp.set('sampai', applied.sampai)
        if (applied.bahanId) sp.set('bahanId', applied.bahanId)
        if (applied.kategori) sp.set('kategori', applied.kategori)
        if (applied.suplier.trim()) sp.set('suplier', applied.suplier.trim())
        const res = await apiFetch<LaporanResponse>(`/api/stock-bahan/laporan?${sp.toString()}`)
        if (!cancelled) setData(res)
      } catch (e) {
        if (!cancelled) {
          toast.error(errText(e))
          setData(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [applied, reloadKey])

  const terapkan = () => setApplied({ ...draft })

  const resetFilter = () => {
    setDraft(EMPTY_FILTER)
    setApplied(EMPTY_FILTER)
    setReloadKey((n) => n + 1)
  }

  const print = () => window.print()

  const savePdf = () => {
    window.print()
    toast.info('Pilih "Save as PDF" pada dialog cetak untuk menyimpan sebagai PDF.')
  }

  const items = data?.items ?? []
  const s = data?.ringkasan ?? null

  const filterParts: string[] = []
  if (applied.dari || applied.sampai) filterParts.push(`Periode: ${applied.dari || '…'} s/d ${applied.sampai || '…'}`)
  if (applied.bahanId) {
    const b = bahans.find((x) => x.id === applied.bahanId)
    filterParts.push(`Bahan: ${b ? b.nama : applied.bahanId}`)
  }
  if (applied.kategori) filterParts.push(`Kategori: ${applied.kategori}`)
  if (applied.suplier.trim()) filterParts.push(`Supplier: "${applied.suplier.trim()}"`)
  const filterLabel = filterParts.length > 0 ? filterParts.join(' • ') : 'Semua periode (tanpa filter)'

  const totalMasuk = items.reduce((acc, i) => acc + i.masuk, 0)
  const totalKeluar = items.reduce((acc, i) => acc + i.keluar, 0)
  const totalNilai = items.reduce((acc, i) => acc + i.nilai, 0)

  return (
    <div className="space-y-4">
      {/* CSS cetak #print-area */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_AREA_CSS }} />

      {/* Header + tombol cetak */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg md:text-xl font-bold tracking-tight">Laporan Stok</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{filterLabel}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={print} className="min-h-[44px] flex-1 sm:flex-none" aria-label="Cetak laporan stok">
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button variant="outline" onClick={savePdf} className="min-h-[44px] flex-1 sm:flex-none" aria-label="Simpan laporan stok sebagai PDF">
            <FileDown className="h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <Card className="p-0 gap-0">
        <CardContent className="p-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Dari tanggal</Label>
              <Input
                type="date"
                value={draft.dari}
                onChange={(e) => setDraft((f) => ({ ...f, dari: e.target.value }))}
                className="min-h-[44px]"
                aria-label="Periode mulai"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Sampai tanggal</Label>
              <Input
                type="date"
                value={draft.sampai}
                onChange={(e) => setDraft((f) => ({ ...f, sampai: e.target.value }))}
                className="min-h-[44px]"
                aria-label="Periode akhir"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Bahan</Label>
              <Select value={draft.bahanId || 'ALL'} onValueChange={(v) => setDraft((f) => ({ ...f, bahanId: v === 'ALL' ? '' : v }))}>
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
              <Label className="text-xs text-muted-foreground">Kategori</Label>
              <Select value={draft.kategori || 'ALL'} onValueChange={(v) => setDraft((f) => ({ ...f, kategori: v === 'ALL' ? '' : v }))}>
                <SelectTrigger className="min-h-[44px] w-full" aria-label="Filter kategori">
                  <SelectValue placeholder="Semua Kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Kategori</SelectItem>
                  {KATEGORI_BAHAN.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Supplier</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
                <Input
                  value={draft.suplier}
                  onChange={(e) => setDraft((f) => ({ ...f, suplier: e.target.value }))}
                  placeholder="Nama supplier mengandung…"
                  aria-label="Filter supplier"
                  className="pl-9 min-h-[44px]"
                />
              </div>
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={terapkan} className="min-h-[44px] flex-1 sm:flex-none" disabled={loading}>
                Terapkan
              </Button>
              <Button variant="outline" onClick={resetFilter} className="min-h-[44px] flex-1 sm:flex-none">
                <RotateCcw className="h-4 w-4" /> Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ringkasan */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : s ? (
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-0 gap-0">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Bahan</p>
                <p className="text-xl md:text-2xl font-bold tabular-nums mt-1">{s.totalBahan}</p>
              </CardContent>
            </Card>
            <Card className="p-0 gap-0">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Masuk</p>
                <p className="text-xl md:text-2xl font-bold tabular-nums mt-1 text-emerald-600">{fmtQty(s.totalMasuk)}</p>
              </CardContent>
            </Card>
            <Card className="p-0 gap-0">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Keluar</p>
                <p className="text-xl md:text-2xl font-bold tabular-nums mt-1 text-orange-600">{fmtQty(s.totalKeluar)}</p>
              </CardContent>
            </Card>
            <Card className="p-0 gap-0">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Nilai Persediaan</p>
                <p className="text-xl md:text-2xl font-bold tabular-nums mt-1">{formatIDR(s.totalNilai)}</p>
              </CardContent>
            </Card>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
              <AlertTriangle className="w-3 h-3" /> Menipis: {s.menipis}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-400">
              <CircleX className="w-3 h-3" /> Habis: {s.habis}
            </span>
          </div>
        </div>
      ) : null}

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
                  <TableHead className="min-w-44">Nama</TableHead>
                  <TableHead className="min-w-28">Kategori</TableHead>
                  <TableHead className="text-right">Stok Awal</TableHead>
                  <TableHead className="text-right">Masuk</TableHead>
                  <TableHead className="text-right">Keluar</TableHead>
                  <TableHead className="text-right">Penyesuaian</TableHead>
                  <TableHead className="text-right">Stok Akhir</TableHead>
                  <TableHead>Satuan</TableHead>
                  <TableHead className="text-right">Harga Modal</TableHead>
                  <TableHead className="text-right">Nilai</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={i.bahanId}>
                    <TableCell>
                      <p className="font-medium leading-snug">{i.nama}</p>
                      <p className="text-[11px] font-mono text-muted-foreground">{i.kode}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{i.kategori || '-'}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtQty(i.stokAwal)}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap text-emerald-600">{fmtQty(i.masuk)}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap text-orange-600">{fmtQty(i.keluar)}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtPenyesuaian(i.penyesuaian)}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap font-semibold">{fmtQty(i.stokAkhir)}</TableCell>
                    <TableCell className="text-muted-foreground">{i.satuan}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{formatIDR(i.hargaSatuan)}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap font-semibold">{formatIDR(i.nilai)}</TableCell>
                    <TableCell>
                      <SbStatusBadge status={i.status} />
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
          items.map((i) => (
            <Card key={i.bahanId} className="p-0 gap-0">
              <CardContent className="p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold leading-snug">{i.nama}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {i.kode}
                      {i.kategori ? ` • ${i.kategori}` : ''}
                    </p>
                  </div>
                  <SbStatusBadge status={i.status} />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold tabular-nums">{fmtQty(i.stokAkhir)}</span>
                  <span className="text-xs text-muted-foreground">{i.satuan}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs tabular-nums">
                  <span className="text-muted-foreground">Masuk</span>
                  <span className="font-semibold text-emerald-600">{fmtQty(i.masuk)}</span>
                  <span className="text-stone-300">•</span>
                  <span className="text-muted-foreground">Keluar</span>
                  <span className="font-semibold text-orange-600">{fmtQty(i.keluar)}</span>
                  <span className="text-stone-300">•</span>
                  <span className="text-muted-foreground">Penyesuaian</span>
                  <span className="font-medium">{fmtPenyesuaian(i.penyesuaian)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-stone-100 pt-2">
                  <span className="text-xs text-muted-foreground">Nilai persediaan</span>
                  <span className="text-sm font-bold tabular-nums">{formatIDR(i.nilai)}</span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* ===== Template cetak (tersembunyi di layar, tampil saat print/PDF) ===== */}
      <div id="print-area" aria-hidden="true">
        <div className="flex items-end justify-between border-b-2 border-stone-800 pb-2">
          <div>
            <p className="text-lg font-bold tracking-wide uppercase">Laporan Stok</p>
            <p className="text-sm font-medium">{filterLabel}</p>
          </div>
          <p className="text-xs text-stone-500" suppressHydrationWarning>
            Dicetak: {new Date().toLocaleString('id-ID')}
          </p>
        </div>
        <table className="w-full border-collapse text-[12px] mt-4">
          <thead>
            <tr>
              {['Nama', 'Stok Awal', 'Masuk', 'Keluar', 'Penyesuaian', 'Stok Akhir', 'Satuan', 'Nilai'].map((h, idx) => (
                <th
                  key={h}
                  className={`border border-stone-300 bg-stone-100 px-2 py-1 font-semibold ${idx >= 1 && idx <= 5 ? 'text-right' : 'text-left'}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.bahanId}>
                <td className="border border-stone-300 px-2 py-1">
                  {i.nama} <span className="text-stone-400">({i.kode})</span>
                </td>
                <td className="border border-stone-300 px-2 py-1 text-right tabular-nums">{fmtQty(i.stokAwal)}</td>
                <td className="border border-stone-300 px-2 py-1 text-right tabular-nums">{fmtQty(i.masuk)}</td>
                <td className="border border-stone-300 px-2 py-1 text-right tabular-nums">{fmtQty(i.keluar)}</td>
                <td className="border border-stone-300 px-2 py-1 text-right tabular-nums">{fmtPenyesuaian(i.penyesuaian)}</td>
                <td className="border border-stone-300 px-2 py-1 text-right tabular-nums font-semibold">{fmtQty(i.stokAkhir)}</td>
                <td className="border border-stone-300 px-2 py-1">{i.satuan}</td>
                <td className="border border-stone-300 px-2 py-1 text-right tabular-nums font-semibold">{formatIDR(i.nilai)}</td>
              </tr>
            ))}
            <tr className="bg-stone-100 font-bold">
              <td className="border border-stone-300 px-2 py-1">TOTAL</td>
              <td className="border border-stone-300 px-2 py-1" />
              <td className="border border-stone-300 px-2 py-1 text-right tabular-nums">{fmtQty(totalMasuk)}</td>
              <td className="border border-stone-300 px-2 py-1 text-right tabular-nums">{fmtQty(totalKeluar)}</td>
              <td className="border border-stone-300 px-2 py-1" />
              <td className="border border-stone-300 px-2 py-1" />
              <td className="border border-stone-300 px-2 py-1" />
              <td className="border border-stone-300 px-2 py-1 text-right tabular-nums">{formatIDR(totalNilai)}</td>
            </tr>
          </tbody>
        </table>
        {s && (
          <div className="mt-3 text-[12px] space-y-0.5">
            <p>
              Ringkasan: {s.totalBahan} bahan • Total Masuk {fmtQty(s.totalMasuk)} • Total Keluar {fmtQty(s.totalKeluar)} •
              Nilai Persediaan {formatIDR(s.totalNilai)}
            </p>
            <p>
              Stok menipis: {s.menipis} bahan • Stok habis: {s.habis} bahan
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <FileBarChart className="h-8 w-8 text-stone-300" aria-hidden="true" />
      <p className="text-sm font-medium">Tidak ada data untuk filter ini</p>
      <p className="text-xs text-muted-foreground">Coba ubah periode atau kosongkan filter bahan/kategori/supplier.</p>
    </div>
  )
}
