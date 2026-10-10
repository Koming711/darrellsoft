'use client'

/**
 * RiwayatTab — buku besar pergerakan stok (StockMovement).
 * Tabel desktop: Tanggal | No. Transaksi | Bahan | Jenis | Masuk | Keluar | Saldo.
 * Filter: search, tanggal, bahan, jenis. Print / PDF via #print-area.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Printer, Search } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
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
  JenisBadge,
  PRINT_AREA_CSS,
  errText,
  fmtNum,
  fmtTanggal,
  type Material,
  type Movement,
} from './shared'

export function RiwayatTab({ materials }: { materials: Material[] }) {
  const [list, setList] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dari, setDari] = useState('')
  const [sampai, setSampai] = useState('')
  const [bahanId, setBahanId] = useState('semua')
  const [jenis, setJenis] = useState('semua')

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('q', search.trim())
      if (dari) params.set('dari', dari)
      if (sampai) params.set('sampai', sampai)
      if (bahanId !== 'semua') params.set('materialId', bahanId)
      if (jenis !== 'semua') params.set('jenis', jenis)
      const res = await apiFetch<{ data: Movement[] }>(`/api/stock-bahan/mutasi?${params.toString()}`)
      setList(res.data)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setLoading(false)
    }
  }, [search, dari, sampai, bahanId, jenis])

  // Debounce pencarian 350ms.
  useEffect(() => {
    const t = setTimeout(fetchList, 350)
    return () => clearTimeout(t)
  }, [fetchList])

  const bahanNama = useMemo(() => {
    const map = new Map(materials.map(m => [m.id, m]))
    return (id: string) => map.get(id)
  }, [materials])

  const judulPeriode = dari || sampai
    ? `${dari ? fmtTanggal(dari) : '…'} — ${sampai ? fmtTanggal(sampai) : '…'}`
    : 'Semua periode'

  return (
    <div className="space-y-4">
      <style dangerouslySetInnerHTML={{ __html: PRINT_AREA_CSS }} />

      {/* Filter */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari…"
                className="pl-8"
                aria-label="Cari riwayat"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="rw-dari" className="text-xs">Dari</Label>
              <Input id="rw-dari" type="date" value={dari} onChange={e => setDari(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="rw-sampai" className="text-xs">Sampai</Label>
              <Input id="rw-sampai" type="date" value={sampai} onChange={e => setSampai(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Bahan</Label>
              <Select value={bahanId} onValueChange={setBahanId}>
                <SelectTrigger aria-label="Filter bahan"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="semua">Semua Bahan</SelectItem>
                  {materials.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Jenis</Label>
              <Select value={jenis} onValueChange={setJenis}>
                <SelectTrigger aria-label="Filter jenis"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="semua">Semua Jenis</SelectItem>
                  <SelectItem value="masuk">Stok Masuk</SelectItem>
                  <SelectItem value="keluar">Stok Keluar</SelectItem>
                  <SelectItem value="penyesuaian">Penyesuaian</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm font-medium">Tidak ada riwayat</p>
            <p className="mt-1 text-xs text-muted-foreground">Ubah filter atau lakukan transaksi stok terlebih dahulu.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop — tabel */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <div className="flex items-center justify-between px-4 pt-3">
                <p className="text-xs text-muted-foreground">{list.length} transaksi · {judulPeriode}</p>
                <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => window.print()}>
                  <Printer className="h-3.5 w-3.5" /> Print
                </Button>
              </div>
              <div className="max-h-[calc(100vh-460px)] overflow-y-auto stock-scroll px-0">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>No. Transaksi</TableHead>
                      <TableHead>Bahan</TableHead>
                      <TableHead>Jenis</TableHead>
                      <TableHead className="text-right">Masuk</TableHead>
                      <TableHead className="text-right">Keluar</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map(m => (
                      <TableRow key={m.id}>
                        <TableCell className="text-sm whitespace-nowrap">{fmtTanggal(m.tanggal)}</TableCell>
                        <TableCell className="font-mono text-xs">{m.refNomor}</TableCell>
                        <TableCell>
                          <p className="text-sm font-medium">{m.material?.nama || '—'}</p>
                          <p className="text-xs text-muted-foreground">{m.keterangan}</p>
                        </TableCell>
                        <TableCell><JenisBadge jenis={m.jenis} /></TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-emerald-600">{m.masuk > 0 ? fmtNum(m.masuk) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-rose-600">{m.keluar > 0 ? fmtNum(m.keluar) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-bold">{fmtNum(m.saldo)} {m.material?.satuan}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Mobile — kartu ringkas */}
          <div className="grid gap-2 md:hidden">
            <Button variant="outline" className="gap-1.5" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print / PDF
            </Button>
            {list.map(m => (
              <Card key={m.id}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{m.material?.nama || '—'}</p>
                      <p className="text-xs text-muted-foreground font-mono">{m.refNomor} · {fmtTanggal(m.tanggal)}</p>
                    </div>
                    <JenisBadge jenis={m.jenis} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="tabular-nums">
                      {m.masuk > 0 && <span className="font-semibold text-emerald-600">+{fmtNum(m.masuk)}</span>}
                      {m.keluar > 0 && <span className="font-semibold text-rose-600">−{fmtNum(m.keluar)}</span>}
                      {m.masuk === 0 && m.keluar === 0 && <span className="text-muted-foreground">—</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Saldo: <strong className="text-foreground tabular-nums">{fmtNum(m.saldo)} {m.material?.satuan}</strong>
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Area cetak */}
      <div id="print-area" className="hidden">
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>Riwayat Stok Bahan</h1>
        <p style={{ fontSize: 11, color: '#555', marginBottom: 10 }}>
          Periode: {judulPeriode}
          {bahanId !== 'semua' ? ` · Bahan: ${bahanNama(bahanId)?.nama || ''}` : ''}
          {jenis !== 'semua' ? ` · Jenis: ${jenis}` : ''}
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              {['Tanggal', 'No. Transaksi', 'Bahan', 'Jenis', 'Keterangan', 'Masuk', 'Keluar', 'Saldo'].map(h => (
                <th key={h} style={{ border: '1px solid #ddd', padding: '4px 6px', textAlign: 'left', background: '#f5f5f5' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map(m => (
              <tr key={m.id}>
                <td style={{ border: '1px solid #ddd', padding: '4px 6px' }}>{fmtTanggal(m.tanggal)}</td>
                <td style={{ border: '1px solid #ddd', padding: '4px 6px' }}>{m.refNomor}</td>
                <td style={{ border: '1px solid #ddd', padding: '4px 6px' }}>{m.material?.nama || ''}</td>
                <td style={{ border: '1px solid #ddd', padding: '4px 6px' }}>{m.jenis}</td>
                <td style={{ border: '1px solid #ddd', padding: '4px 6px' }}>{m.keterangan}</td>
                <td style={{ border: '1px solid #ddd', padding: '4px 6px', textAlign: 'right' }}>{m.masuk > 0 ? fmtNum(m.masuk) : ''}</td>
                <td style={{ border: '1px solid #ddd', padding: '4px 6px', textAlign: 'right' }}>{m.keluar > 0 ? fmtNum(m.keluar) : ''}</td>
                <td style={{ border: '1px solid #ddd', padding: '4px 6px', textAlign: 'right' }}>{fmtNum(m.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
