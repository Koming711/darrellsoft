'use client'

/**
 * Laporan Stok — ringkasan per bahan untuk periode terpilih:
 * stok awal, masuk, keluar, penyesuaian, stok akhir, nilai persediaan.
 * Filter: periode, bahan, kategori, supplier. Sediakan Print & PDF.
 */

import { useMemo, useRef, useState } from 'react'
import { FileDown, Printer, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { formatIDR } from '@/lib/format'
import { downloadPdf, generatePdfFromElement } from '@/lib/generate-pdf'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { Bahan, BahanMutasi, PemasokRingkas } from './shared'
import { StatusStokBadge, effTgl, errText, formatAngka, formatTanggalID } from './shared'

interface BarisLaporan {
  bahan: Bahan
  stokAwal: number
  masuk: number
  keluar: number
  penyesuaian: number
  stokAkhir: number
  nilai: number
}

export function LaporanTab({
  bahanList, mutasi, pemasokList,
}: {
  bahanList: Bahan[]
  mutasi: BahanMutasi[]
  pemasokList: PemasokRingkas[]
}) {
  const [dari, setDari] = useState('')
  const [sampai, setSampai] = useState('')
  const [bahanId, setBahanId] = useState('semua')
  const [kategori, setKategori] = useState('semua')
  const [pemasok, setPemasok] = useState('semua')
  const printRef = useRef<HTMLDivElement>(null)

  const kategoriList = useMemo(
    () => [...new Set(bahanList.map(b => b.kategori).filter(Boolean))].sort(),
    [bahanList],
  )

  const baris = useMemo<BarisLaporan[]>(() => {
    return bahanList
      .filter(b => (bahanId === 'semua' ? true : b.id === bahanId))
      .filter(b => (kategori === 'semua' ? true : b.kategori === kategori))
      .filter(b => (pemasok === 'semua' ? true : (b.pemasok || '') === pemasok))
      .map(b => {
        let stokAwal = 0
        let masuk = 0
        let keluar = 0
        let penyesuaian = 0
        for (const m of mutasi) {
          if (m.bahanId !== b.id) continue
          const tgl = effTgl(m)
          const inRange = (!dari || tgl >= dari) && (!sampai || tgl <= sampai)
          if (inRange) {
            if (m.jenis === 'masuk') masuk += m.qty
            else if (m.jenis === 'keluar') keluar += m.qty
            else penyesuaian += m.qty
          } else if (dari && tgl < dari) {
            // kontribusi saldo sebelum periode
            if (m.jenis === 'masuk') stokAwal += m.qty
            else if (m.jenis === 'keluar') stokAwal -= m.qty
            else stokAwal += m.qty
          }
        }
        stokAwal = Math.round(stokAwal * 1e6) / 1e6
        const stokAkhir = Math.round((stokAwal + masuk - keluar + penyesuaian) * 1e6) / 1e6
        return { bahan: b, stokAwal, masuk, keluar, penyesuaian, stokAkhir, nilai: Math.round(stokAkhir * b.hargaSatuan) }
      })
      .sort((a, b) => a.bahan.nama.localeCompare(b.bahan.nama))
  }, [bahanList, mutasi, bahanId, kategori, pemasok, dari, sampai])

  const totalNilai = baris.reduce((s, r) => s + r.nilai, 0)
  const menipis = bahanList.filter(b => b.stok > 0 && b.stokMin > 0 && b.stok <= b.stokMin).length
  const habis = bahanList.filter(b => b.stok <= 0).length

  async function handlePdf() {
    if (!printRef.current) return
    try {
      toast.info('Menyiapkan PDF…')
      const blob = await generatePdfFromElement(printRef.current)
      downloadPdf(blob, `laporan-stok-${new Date().toISOString().slice(0, 10)}.pdf`)
      toast.success('PDF diunduh')
    } catch (e) {
      toast.error(errText(e))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" value={dari} onChange={e => setDari(e.target.value)} className="w-[138px]" aria-label="Dari tanggal" />
        <Input type="date" value={sampai} onChange={e => setSampai(e.target.value)} className="w-[138px]" aria-label="Sampai tanggal" />
        <Select value={bahanId} onValueChange={setBahanId}>
          <SelectTrigger className="w-[160px]" aria-label="Filter bahan"><SelectValue placeholder="Bahan" /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="semua">Semua bahan</SelectItem>
            {bahanList.map(b => <SelectItem key={b.id} value={b.id}>{b.nama}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={kategori} onValueChange={setKategori}>
          <SelectTrigger className="w-[150px]" aria-label="Filter kategori"><SelectValue placeholder="Kategori" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="semua">Semua kategori</SelectItem>
            {kategoriList.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={pemasok} onValueChange={setPemasok}>
          <SelectTrigger className="w-[160px]" aria-label="Filter supplier"><SelectValue placeholder="Supplier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="semua">Semua supplier</SelectItem>
            {pemasokList.map(p => <SelectItem key={p.id} value={p.namaToko}>{p.namaToko}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => { setDari(''); setSampai(''); setBahanId('semua'); setKategori('semua'); setPemasok('semua') }} className="min-h-[44px]">
          <RotateCcw className="mr-1 h-4 w-4" /> Reset
        </Button>
        <Button variant="outline" onClick={() => window.print()} className="min-h-[44px]">
          <Printer className="mr-1 h-4 w-4" /> Print
        </Button>
        <Button variant="outline" onClick={handlePdf} className="min-h-[44px]">
          <FileDown className="mr-1 h-4 w-4" /> PDF
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="border-0 shadow-sm"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Nilai Persediaan</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{formatIDR(totalNilai)}</p>
          <p className="text-[11px] text-muted-foreground">stok akhir × harga modal terakhir</p>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Bahan Menipis</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{menipis}</p>
          <p className="text-[11px] text-muted-foreground">stok ≤ stok minimum</p>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Bahan Habis</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{habis}</p>
          <p className="text-[11px] text-muted-foreground">stok ≤ 0</p>
        </CardContent></Card>
      </div>

      {baris.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center">
          <p className="text-sm font-medium">Tidak ada data untuk filter ini</p>
        </div>
      ) : (
        <div className="hidden max-h-[65vh] overflow-y-auto rounded-xl border md:block">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead>Bahan</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead className="text-right">Stok Awal</TableHead>
                <TableHead className="text-right">Masuk</TableHead>
                <TableHead className="text-right">Keluar</TableHead>
                <TableHead className="text-right">Penyesuaian</TableHead>
                <TableHead className="text-right">Stok Akhir</TableHead>
                <TableHead className="text-right">Nilai</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {baris.map(r => (
                <TableRow key={r.bahan.id}>
                  <TableCell className="font-medium">{r.bahan.nama} <span className="text-xs text-muted-foreground">{r.bahan.kode}</span></TableCell>
                  <TableCell className="text-xs">{r.bahan.kategori || '—'}</TableCell>
                  <TableCell className="text-right text-xs">{formatAngka(r.stokAwal)}</TableCell>
                  <TableCell className="text-right text-emerald-700">{formatAngka(r.masuk)}</TableCell>
                  <TableCell className="text-right text-orange-700">{formatAngka(r.keluar)}</TableCell>
                  <TableCell className="text-right text-xs">{r.penyesuaian > 0 ? '+' : ''}{formatAngka(r.penyesuaian)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatAngka(r.stokAkhir)} <span className="text-xs font-normal text-muted-foreground">{r.bahan.satuan}</span></TableCell>
                  <TableCell className="text-right text-xs font-medium">{formatIDR(r.nilai)}</TableCell>
                  <TableCell><StatusStokBadge b={r.bahan} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Mobile: kartu */}
      {baris.length > 0 && (
        <div className="max-h-[65vh] space-y-3 overflow-y-auto md:hidden">
          {baris.map(r => (
            <div key={r.bahan.id} className="rounded-xl border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.bahan.nama}</p>
                  <p className="text-[11px] text-muted-foreground">{r.bahan.kategori || 'Tanpa kategori'} · {r.bahan.kode}</p>
                </div>
                <StatusStokBadge b={r.bahan} />
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
                <div><p className="text-muted-foreground">Awal</p><p className="font-semibold">{formatAngka(r.stokAwal)}</p></div>
                <div><p className="text-muted-foreground">Masuk</p><p className="font-semibold text-emerald-700">{formatAngka(r.masuk)}</p></div>
                <div><p className="text-muted-foreground">Keluar</p><p className="font-semibold text-orange-700">{formatAngka(r.keluar)}</p></div>
                <div><p className="text-muted-foreground">Akhir</p><p className="font-semibold">{formatAngka(r.stokAkhir)}</p></div>
              </div>
              <p className="mt-2 text-right text-sm font-bold text-emerald-700">{formatIDR(r.nilai)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Area cetak/PDF */}
      <div ref={printRef} className="hidden">
        <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Laporan Stok Bahan</h2>
          <p style={{ fontSize: 11, color: '#666', marginBottom: 12 }}>
            {dari || sampai ? `Periode: ${dari || '…'} s/d ${sampai || '…'}` : 'Semua periode'} · Nilai persediaan: {formatIDR(totalNilai)} · dicetak {formatTanggalID(new Date().toISOString().slice(0, 10))}
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#f5f5f4', textAlign: 'left' }}>
                <th style={{ border: '1px solid #ddd', padding: 6 }}>Bahan</th>
                <th style={{ border: '1px solid #ddd', padding: 6 }}>Kategori</th>
                <th style={{ border: '1px solid #ddd', padding: 6, textAlign: 'right' }}>Awal</th>
                <th style={{ border: '1px solid #ddd', padding: 6, textAlign: 'right' }}>Masuk</th>
                <th style={{ border: '1px solid #ddd', padding: 6, textAlign: 'right' }}>Keluar</th>
                <th style={{ border: '1px solid #ddd', padding: 6, textAlign: 'right' }}>Penyesuaian</th>
                <th style={{ border: '1px solid #ddd', padding: 6, textAlign: 'right' }}>Akhir</th>
                <th style={{ border: '1px solid #ddd', padding: 6, textAlign: 'right' }}>Nilai</th>
              </tr>
            </thead>
            <tbody>
              {baris.map(r => (
                <tr key={r.bahan.id}>
                  <td style={{ border: '1px solid #ddd', padding: 6 }}>{r.bahan.nama}</td>
                  <td style={{ border: '1px solid #ddd', padding: 6 }}>{r.bahan.kategori}</td>
                  <td style={{ border: '1px solid #ddd', padding: 6, textAlign: 'right' }}>{formatAngka(r.stokAwal)}</td>
                  <td style={{ border: '1px solid #ddd', padding: 6, textAlign: 'right' }}>{formatAngka(r.masuk)}</td>
                  <td style={{ border: '1px solid #ddd', padding: 6, textAlign: 'right' }}>{formatAngka(r.keluar)}</td>
                  <td style={{ border: '1px solid #ddd', padding: 6, textAlign: 'right' }}>{formatAngka(r.penyesuaian)}</td>
                  <td style={{ border: '1px solid #ddd', padding: 6, textAlign: 'right' }}>{formatAngka(r.stokAkhir)} {r.bahan.satuan}</td>
                  <td style={{ border: '1px solid #ddd', padding: 6, textAlign: 'right' }}>{formatIDR(r.nilai)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
