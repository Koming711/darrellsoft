'use client'

/**
 * LaporanTab — Laporan Stock: stok awal, masuk, keluar, penyesuaian, stok akhir,
 * bahan menipis/habis, dan nilai persediaan. Filter: periode, kategori, supplier.
 * Print / PDF via #print-area.
 */

import { useCallback, useEffect, useState } from 'react'
import { Printer } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { formatIDR } from '@/lib/format'
import { cn } from '@/lib/utils'
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
import {
  PRINT_AREA_CSS,
  StatusBadge,
  errText,
  fmtNum,
  fmtTanggal,
  type LaporanData,
  type Supplier,
} from './shared'

export function LaporanTab({
  suppliers,
  kategoris,
}: {
  suppliers: Supplier[]
  kategoris: string[]
}) {
  const [data, setData] = useState<LaporanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dari, setDari] = useState('')
  const [sampai, setSampai] = useState('')
  const [kategori, setKategori] = useState('semua')
  const [supplierId, setSupplierId] = useState('semua')

  const fetchLaporan = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dari) params.set('dari', dari)
      if (sampai) params.set('sampai', sampai)
      if (kategori !== 'semua') params.set('kategori', kategori)
      if (supplierId !== 'semua') params.set('supplierId', supplierId)
      const res = await apiFetch<{ data: LaporanData }>(`/api/stock-bahan/laporan?${params.toString()}`)
      setData(res.data)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setLoading(false)
    }
  }, [dari, sampai, kategori, supplierId])

  useEffect(() => {
    const t = setTimeout(fetchLaporan, 250)
    return () => clearTimeout(t)
  }, [fetchLaporan])

  const menipis = data?.rows.filter(r => r.status === 'menipis') || []
  const habis = data?.rows.filter(r => r.status === 'habis') || []
  const judulPeriode = dari || sampai
    ? `${dari ? fmtTanggal(dari) : '…'} — ${sampai ? fmtTanggal(sampai) : '…'}`
    : 'Semua periode'

  return (
    <div className="space-y-4">
      <style dangerouslySetInnerHTML={{ __html: PRINT_AREA_CSS }} />

      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="grid gap-1">
              <Label htmlFor="lp-dari" className="text-xs">Periode Dari</Label>
              <Input id="lp-dari" type="date" value={dari} onChange={e => setDari(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="lp-sampai" className="text-xs">Sampai</Label>
              <Input id="lp-sampai" type="date" value={sampai} onChange={e => setSampai(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Kategori</Label>
              <Select value={kategori} onValueChange={setKategori}>
                <SelectTrigger aria-label="Filter kategori"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="semua">Semua Kategori</SelectItem>
                  {kategoris.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger aria-label="Filter supplier"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="semua">Semua Supplier</SelectItem>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ringkasan kecil */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs text-muted-foreground">Bahan Menipis</p>
            <p className="text-xl sm:text-2xl font-bold text-amber-600 tabular-nums">{loading ? '…' : menipis.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs text-muted-foreground">Bahan Habis</p>
            <p className="text-xl sm:text-2xl font-bold text-rose-600 tabular-nums">{loading ? '…' : habis.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs text-muted-foreground">Nilai Persediaan</p>
            <p className="text-base sm:text-2xl font-bold tabular-nums">{loading ? '…' : formatIDR(data?.totalNilai || 0)}</p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : !data || data.rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm font-medium">Tidak ada data untuk filter ini</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <div className="flex items-center justify-between px-4 pt-3">
                <p className="text-xs text-muted-foreground">{data.rows.length} bahan · {judulPeriode}</p>
                <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => window.print()}>
                  <Printer className="h-3.5 w-3.5" /> Print
                </Button>
              </div>
              <div className="max-h-[calc(100vh-520px)] overflow-y-auto stock-scroll">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead>Bahan</TableHead>
                      <TableHead className="text-right">Stok Awal</TableHead>
                      <TableHead className="text-right">Masuk</TableHead>
                      <TableHead className="text-right">Keluar</TableHead>
                      <TableHead className="text-right">Penyesuaian</TableHead>
                      <TableHead className="text-right">Stok Akhir</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Nilai Persediaan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map(r => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <p className="text-sm font-medium">{r.nama}</p>
                          <p className="text-xs text-muted-foreground">{r.kode} · {r.kategori || '—'}</p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{fmtNum(r.stokAwal)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-emerald-600">{r.masuk > 0 ? `+${fmtNum(r.masuk)}` : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-rose-600">{r.keluar > 0 ? `−${fmtNum(r.keluar)}` : '—'}</TableCell>
                        <TableCell className={cn('text-right tabular-nums text-sm', r.penyesuaian < 0 ? 'text-rose-600' : r.penyesuaian > 0 ? 'text-emerald-600' : 'text-muted-foreground')}>
                          {r.penyesuaian !== 0 ? `${r.penyesuaian > 0 ? '+' : ''}${fmtNum(r.penyesuaian)}` : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-bold">{fmtNum(r.stokAkhir)} {r.satuan}</TableCell>
                        <TableCell><StatusBadge status={r.status} /></TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-semibold">{formatIDR(r.nilaiPersediaan)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Mobile — kartu */}
          <div className="grid gap-3 md:hidden">
            <Button variant="outline" className="gap-1.5" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print / PDF
            </Button>
            {data.rows.map(r => (
              <Card key={r.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">{r.nama}</p>
                      <p className="text-xs text-muted-foreground">{r.kode} · {r.kategori || '—'}</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div><p className="text-muted-foreground">Awal</p><p className="font-semibold tabular-nums">{fmtNum(r.stokAwal)}</p></div>
                    <div><p className="text-muted-foreground">Masuk</p><p className="font-semibold tabular-nums text-emerald-600">{fmtNum(r.masuk)}</p></div>
                    <div><p className="text-muted-foreground">Keluar</p><p className="font-semibold tabular-nums text-rose-600">{fmtNum(r.keluar)}</p></div>
                    <div><p className="text-muted-foreground">Akhir</p><p className="font-bold tabular-nums">{fmtNum(r.stokAkhir)}</p></div>
                  </div>
                  <p className="text-xs text-muted-foreground text-right">
                    Nilai: <strong className="text-foreground">{formatIDR(r.nilaiPersediaan)}</strong>
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Area cetak */}
      <div id="print-area" className="hidden">
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>Laporan Stock Bahan</h1>
        <p style={{ fontSize: 11, color: '#555', marginBottom: 10 }}>
          Periode: {judulPeriode}
          {kategori !== 'semua' ? ` · Kategori: ${kategori}` : ''}
          {supplierId !== 'semua' ? ` · Supplier: ${suppliers.find(s => s.id === supplierId)?.nama || ''}` : ''}
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              {['Bahan', 'Kategori', 'Stok Awal', 'Masuk', 'Keluar', 'Penyesuaian', 'Stok Akhir', 'Satuan', 'Harga Modal', 'Nilai Persediaan'].map(h => (
                <th key={h} style={{ border: '1px solid #ddd', padding: '4px 6px', textAlign: 'left', background: '#f5f5f5' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.rows || []).map(r => (
              <tr key={r.id}>
                <td style={{ border: '1px solid #ddd', padding: '4px 6px' }}>{r.nama} ({r.kode})</td>
                <td style={{ border: '1px solid #ddd', padding: '4px 6px' }}>{r.kategori}</td>
                <td style={{ border: '1px solid #ddd', padding: '4px 6px', textAlign: 'right' }}>{fmtNum(r.stokAwal)}</td>
                <td style={{ border: '1px solid #ddd', padding: '4px 6px', textAlign: 'right' }}>{fmtNum(r.masuk)}</td>
                <td style={{ border: '1px solid #ddd', padding: '4px 6px', textAlign: 'right' }}>{fmtNum(r.keluar)}</td>
                <td style={{ border: '1px solid #ddd', padding: '4px 6px', textAlign: 'right' }}>{fmtNum(r.penyesuaian)}</td>
                <td style={{ border: '1px solid #ddd', padding: '4px 6px', textAlign: 'right' }}>{fmtNum(r.stokAkhir)}</td>
                <td style={{ border: '1px solid #ddd', padding: '4px 6px' }}>{r.satuan}</td>
                <td style={{ border: '1px solid #ddd', padding: '4px 6px', textAlign: 'right' }}>{formatIDR(r.hargaModal)}</td>
                <td style={{ border: '1px solid #ddd', padding: '4px 6px', textAlign: 'right' }}>{formatIDR(r.nilaiPersediaan)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={9} style={{ border: '1px solid #ddd', padding: '4px 6px', fontWeight: 700, textAlign: 'right' }}>Total Nilai Persediaan</td>
              <td style={{ border: '1px solid #ddd', padding: '4px 6px', textAlign: 'right', fontWeight: 700 }}>{formatIDR(data?.totalNilai || 0)}</td>
            </tr>
          </tbody>
        </table>
        <p style={{ fontSize: 10, color: '#555', marginTop: 8 }}>
          Dicetak: {new Date().toLocaleString('id-ID')}
        </p>
      </div>
    </div>
  )
}

