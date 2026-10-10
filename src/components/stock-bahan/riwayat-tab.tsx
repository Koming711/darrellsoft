'use client'

/**
 * Riwayat Stok — ledger global semua bahan.
 * Kolom: Tanggal | No. Transaksi | Bahan | Jenis | Masuk | Keluar | Saldo.
 * Saldo = saldo berjalan per bahan (dihitung ulang dari ledger).
 * Filter: pencarian, rentang tanggal, bahan, jenis. Sediakan Print & PDF.
 */

import { useMemo, useRef, useState } from 'react'
import { FileDown, Printer, RotateCcw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { downloadPdf, generatePdfFromElement } from '@/lib/generate-pdf'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { Bahan, BahanMutasi } from './shared'
import { JenisBadge, effTgl, errText, formatAngka, formatTanggalID, masukKeluar } from './shared'

export function RiwayatTab({
  bahanList, mutasi, loading,
}: {
  bahanList: Bahan[]
  mutasi: BahanMutasi[]
  loading: boolean
}) {
  const [q, setQ] = useState('')
  const [dari, setDari] = useState('')
  const [sampai, setSampai] = useState('')
  const [bahanId, setBahanId] = useState('semua')
  const [jenis, setJenis] = useState('semua')
  const printRef = useRef<HTMLDivElement>(null)

  /** Ledger dengan saldo berjalan per bahan (dihitung dari yang terlama). */
  const ledger = useMemo(() => {
    const byBahan = new Map<string, BahanMutasi[]>()
    for (const m of mutasi) {
      const arr = byBahan.get(m.bahanId) || []
      arr.push(m)
      byBahan.set(m.bahanId, arr)
    }
    const saldoMap = new Map<string, number>()
    for (const [, arr] of byBahan) {
      arr.sort((a, b) => effTgl(a).localeCompare(effTgl(b)) || a.createdAt.localeCompare(b.createdAt))
      let saldo = 0
      for (const m of arr) {
        const { masuk, keluar } = masukKeluar(m)
        saldo += masuk - keluar
        saldoMap.set(m.id, Math.round(saldo * 1e6) / 1e6)
      }
    }

    const f = q.trim().toLowerCase()
    return mutasi
      .filter(m => {
        if (bahanId !== 'semua' && m.bahanId !== bahanId) return false
        if (jenis !== 'semua' && m.jenis !== jenis) return false
        if (dari && m.tanggal < dari) return false
        if (sampai && m.tanggal > sampai) return false
        if (!f) return true
        const hay = [m.nomor, m.namaBahan, m.bahan?.nama, m.bahan?.kode, m.keterangan, m.pemasok, m.nomorNota, m.tujuan, m.alasan]
          .filter(Boolean).join(' ').toLowerCase()
        return hay.includes(f)
      })
      .sort((a, b) => effTgl(b).localeCompare(effTgl(a)) || b.createdAt.localeCompare(a.createdAt))
      .map(m => ({ ...m, saldo: saldoMap.get(m.id) ?? m.stokSetelah }))
  }, [mutasi, q, dari, sampai, bahanId, jenis])

  const bahanNama = (id: string) => bahanList.find(b => b.id === id)?.nama || ''

  async function handlePdf() {
    if (!printRef.current) return
    try {
      toast.info('Menyiapkan PDF…')
      const blob = await generatePdfFromElement(printRef.current)
      downloadPdf(blob, `riwayat-stok-${new Date().toISOString().slice(0, 10)}.pdf`)
      toast.success('PDF diunduh')
    } catch (e) {
      toast.error(errText(e))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[170px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari bahan / nomor / catatan…" className="pl-8" />
        </div>
        <Input type="date" value={dari} onChange={e => setDari(e.target.value)} className="w-[138px]" aria-label="Dari tanggal" />
        <Input type="date" value={sampai} onChange={e => setSampai(e.target.value)} className="w-[138px]" aria-label="Sampai tanggal" />
        <Select value={bahanId} onValueChange={setBahanId}>
          <SelectTrigger className="w-[170px]" aria-label="Filter bahan"><SelectValue placeholder="Bahan" /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="semua">Semua bahan</SelectItem>
            {bahanList.map(b => <SelectItem key={b.id} value={b.id}>{b.nama}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={jenis} onValueChange={setJenis}>
          <SelectTrigger className="w-[150px]" aria-label="Filter jenis"><SelectValue placeholder="Jenis" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="semua">Semua jenis</SelectItem>
            <SelectItem value="masuk">Stok Masuk</SelectItem>
            <SelectItem value="keluar">Stok Keluar</SelectItem>
            <SelectItem value="penyesuaian">Penyesuaian</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => { setQ(''); setDari(''); setSampai(''); setBahanId('semua'); setJenis('semua') }} className="min-h-[44px]">
          <RotateCcw className="mr-1 h-4 w-4" /> Reset
        </Button>
        <Button variant="outline" onClick={() => window.print()} className="min-h-[44px]">
          <Printer className="mr-1 h-4 w-4" /> Print
        </Button>
        <Button variant="outline" onClick={handlePdf} className="min-h-[44px]">
          <FileDown className="mr-1 h-4 w-4" /> PDF
        </Button>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Memuat…</p>
      ) : ledger.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center">
          <p className="text-sm font-medium">Belum ada riwayat stok</p>
          <p className="mt-1 text-xs text-muted-foreground">Transaksi masuk, keluar, dan penyesuaian akan tampil di sini.</p>
        </div>
      ) : (
        <div className="hidden max-h-[70vh] overflow-y-auto rounded-xl border md:block">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-[92px]">Tanggal</TableHead>
                <TableHead>No. Transaksi</TableHead>
                <TableHead>Bahan</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead className="text-right">Masuk</TableHead>
                <TableHead className="text-right">Keluar</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.map(m => {
                const { masuk, keluar } = masukKeluar(m)
                return (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap text-xs">{formatTanggalID(m.tanggal)}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{m.nomor || '—'}</TableCell>
                    <TableCell className="font-medium">{m.namaBahan || m.bahan?.nama}</TableCell>
                    <TableCell><JenisBadge jenis={m.jenis} /></TableCell>
                    <TableCell className="text-right text-emerald-700">{masuk ? formatAngka(masuk) : '0'}</TableCell>
                    <TableCell className="text-right text-orange-700">{keluar ? formatAngka(keluar) : '0'}</TableCell>
                    <TableCell className="text-right font-semibold">{formatAngka(m.saldo)} <span className="text-xs font-normal text-muted-foreground">{m.satuanBahan}</span></TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Mobile: kartu */}
      {!loading && ledger.length > 0 && (
        <div className="max-h-[70vh] space-y-3 overflow-y-auto md:hidden">
          {ledger.map(m => {
            const { masuk, keluar } = masukKeluar(m)
            return (
              <div key={m.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{m.namaBahan || m.bahan?.nama}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{m.nomor || '—'} · {formatTanggalID(m.tanggal)}</p>
                  </div>
                  <JenisBadge jenis={m.jenis} />
                </div>
                <div className="mt-2 flex items-end justify-between text-sm">
                  <div className="text-xs text-muted-foreground">
                    <span className="text-emerald-700">Masuk {formatAngka(masuk)}</span>
                    <span className="mx-1">·</span>
                    <span className="text-orange-700">Keluar {formatAngka(keluar)}</span>
                  </div>
                  <p className="font-bold">Saldo: {formatAngka(m.saldo)} {m.satuanBahan}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">{ledger.length} transaksi</p>

      {/* Area cetak/PDF */}
      <div ref={printRef} className="hidden">
        <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Riwayat Stok Bahan</h2>
          <p style={{ fontSize: 11, color: '#666', marginBottom: 12 }}>
            {dari || sampai ? `Periode: ${dari || '…'} s/d ${sampai || '…'}` : 'Semua periode'} · dicetak {formatTanggalID(new Date().toISOString().slice(0, 10))}
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#f5f5f4', textAlign: 'left' }}>
                <th style={{ border: '1px solid #ddd', padding: 6 }}>Tanggal</th>
                <th style={{ border: '1px solid #ddd', padding: 6 }}>No. Transaksi</th>
                <th style={{ border: '1px solid #ddd', padding: 6 }}>Bahan</th>
                <th style={{ border: '1px solid #ddd', padding: 6 }}>Jenis</th>
                <th style={{ border: '1px solid #ddd', padding: 6, textAlign: 'right' }}>Masuk</th>
                <th style={{ border: '1px solid #ddd', padding: 6, textAlign: 'right' }}>Keluar</th>
                <th style={{ border: '1px solid #ddd', padding: 6, textAlign: 'right' }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map(m => {
                const mk = masukKeluar(m)
                return (
                  <tr key={m.id}>
                    <td style={{ border: '1px solid #ddd', padding: 6 }}>{formatTanggalID(m.tanggal)}</td>
                    <td style={{ border: '1px solid #ddd', padding: 6 }}>{m.nomor}</td>
                    <td style={{ border: '1px solid #ddd', padding: 6 }}>{m.namaBahan || bahanNama(m.bahanId)}</td>
                    <td style={{ border: '1px solid #ddd', padding: 6 }}>{m.jenis}</td>
                    <td style={{ border: '1px solid #ddd', padding: 6, textAlign: 'right' }}>{mk.masuk ? formatAngka(mk.masuk) : ''}</td>
                    <td style={{ border: '1px solid #ddd', padding: 6, textAlign: 'right' }}>{mk.keluar ? formatAngka(mk.keluar) : ''}</td>
                    <td style={{ border: '1px solid #ddd', padding: 6, textAlign: 'right' }}>{formatAngka(m.saldo)} {m.satuanBahan}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
