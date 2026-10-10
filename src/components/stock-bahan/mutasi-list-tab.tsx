'use client'

/**
 * Daftar transaksi stok (Masuk / Keluar / Penyesuaian).
 * Desktop: tabel lengkap. Mobile: kartu ringkas. Aksi Edit & Hapus
 * (hapus selalu dengan konfirmasi, stok dihitung ulang otomatis).
 */

import { useMemo, useState } from 'react'
import { Pencil, Plus, Printer, Search, Trash2 } from 'lucide-react'
import { formatIDR } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { BahanMutasi } from './shared'
import { JenisBadge, errText, formatAngka, formatTanggalID, masukKeluar } from './shared'

export function MutasiListTab({
  jenis, mutasi, loading, canEdit, canDelete, onAdd, onEdit, onDelete, onPrint,
}: {
  jenis: 'masuk' | 'keluar' | 'penyesuaian'
  mutasi: BahanMutasi[]
  loading: boolean
  canEdit: boolean
  canDelete: boolean
  onAdd: () => void
  onEdit: (m: BahanMutasi) => void
  onDelete: (m: BahanMutasi) => void
  onPrint: () => void
}) {
  const [q, setQ] = useState('')
  const [dari, setDari] = useState('')
  const [sampai, setSampai] = useState('')

  const rows = useMemo(() => {
    const f = q.trim().toLowerCase()
    return mutasi.filter(m => {
      if (dari && m.tanggal < dari) return false
      if (sampai && m.tanggal > sampai) return false
      if (!f) return true
      const hay = [m.nomor, m.namaBahan, m.bahan?.nama, m.bahan?.kode, m.keterangan, m.pemasok, m.nomorNota, m.tujuan, m.alasan]
        .filter(Boolean).join(' ').toLowerCase()
      return hay.includes(f)
    })
  }, [mutasi, q, dari, sampai])

  const judul = jenis === 'masuk' ? 'Stok Masuk' : jenis === 'keluar' ? 'Stok Keluar' : 'Penyesuaian Stok'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nomor / bahan / catatan…" className="pl-8" />
        </div>
        <Input type="date" value={dari} onChange={e => setDari(e.target.value)} className="w-[140px]" aria-label="Dari tanggal" />
        <Input type="date" value={sampai} onChange={e => setSampai(e.target.value)} className="w-[140px]" aria-label="Sampai tanggal" />
        <Button variant="outline" onClick={onPrint} className="min-h-[44px]">
          <Printer className="mr-1 h-4 w-4" /> Print
        </Button>
        {canEdit && (
          <Button onClick={onAdd} className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700">
            <Plus className="mr-1 h-4 w-4" /> {judul}
          </Button>
        )}
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Memuat…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center">
          <p className="text-sm font-medium">Belum ada transaksi {judul.toLowerCase()}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {canEdit ? 'Klik tombol di atas untuk mencatat transaksi pertama.' : 'Belum ada data pada periode ini.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden max-h-[70vh] overflow-y-auto rounded-xl border md:block">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="w-[92px]">Tanggal</TableHead>
                  <TableHead>No. Transaksi</TableHead>
                  <TableHead>Bahan</TableHead>
                  {jenis === 'masuk' && <TableHead className="text-right">Jumlah</TableHead>}
                  {jenis === 'masuk' && <TableHead className="text-right">Harga</TableHead>}
                  {jenis === 'masuk' && <TableHead className="text-right">Total</TableHead>}
                  {jenis === 'masuk' && <TableHead>Pemasok / Nota</TableHead>}
                  {jenis === 'keluar' && <TableHead className="text-right">Jumlah</TableHead>}
                  {jenis === 'keluar' && <TableHead>Tujuan</TableHead>}
                  {jenis === 'penyesuaian' && <TableHead className="text-right">Sistem</TableHead>}
                  {jenis === 'penyesuaian' && <TableHead className="text-right">Fisik</TableHead>}
                  {jenis === 'penyesuaian' && <TableHead className="text-right">Selisih</TableHead>}
                  {jenis === 'penyesuaian' && <TableHead>Alasan</TableHead>}
                  <TableHead className="text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(m => {
                  const { masuk, keluar } = masukKeluar(m)
                  const sistem = Math.round((m.stokSetelah - (jenis === 'penyesuaian' ? m.qty : 0)) * 1e6) / 1e6
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap text-xs">{formatTanggalID(m.tanggal)}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{m.nomor || '—'}</TableCell>
                      <TableCell className="font-medium">{m.namaBahan || m.bahan?.nama}</TableCell>
                      {jenis === 'masuk' && (
                        <>
                          <TableCell className="text-right">{formatAngka(masuk)} {m.satuanBahan}</TableCell>
                          <TableCell className="text-right text-xs">{m.hargaBeli ? formatIDR(m.hargaBeli) : '—'}</TableCell>
                          <TableCell className="text-right text-xs font-medium">{m.totalHarga ? formatIDR(m.totalHarga) : '—'}</TableCell>
                          <TableCell className="text-xs">
                            {m.pemasok || '—'}
                            {m.nomorNota && <span className="block text-muted-foreground">Nota: {m.nomorNota}</span>}
                          </TableCell>
                        </>
                      )}
                      {jenis === 'keluar' && (
                        <>
                          <TableCell className="text-right">{formatAngka(keluar)} {m.satuanBahan}</TableCell>
                          <TableCell className="text-xs">{m.tujuan || '—'}</TableCell>
                        </>
                      )}
                      {jenis === 'penyesuaian' && (
                        <>
                          <TableCell className="text-right text-xs">{formatAngka(sistem)}</TableCell>
                          <TableCell className="text-right text-xs">{formatAngka(m.stokSetelah)}</TableCell>
                          <TableCell className={`text-right text-xs font-semibold ${m.qty < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {m.qty > 0 ? '+' : ''}{formatAngka(m.qty)}
                          </TableCell>
                          <TableCell className="text-xs">{m.alasan || '—'}</TableCell>
                        </>
                      )}
                      <TableCell className="text-center">
                        <div className="inline-flex gap-1">
                          {canEdit && (
                            <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => onEdit(m)} aria-label="Edit transaksi">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button size="sm" variant="outline" className="h-8 px-2 text-red-600 hover:bg-red-50" onClick={() => onDelete(m)} aria-label="Hapus transaksi">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile */}
          <div className="max-h-[70vh] space-y-3 overflow-y-auto md:hidden">
            {rows.map(m => {
              const { masuk, keluar } = masukKeluar(m)
              const sistem = Math.round((m.stokSetelah - (jenis === 'penyesuaian' ? m.qty : 0)) * 1e6) / 1e6
              return (
                <div key={m.id} className="rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{m.namaBahan || m.bahan?.nama}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{m.nomor || '—'} · {formatTanggalID(m.tanggal)}</p>
                    </div>
                    {jenis === 'penyesuaian' ? (
                      <span className={`shrink-0 text-lg font-bold ${m.qty < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {m.qty > 0 ? '+' : ''}{formatAngka(m.qty)}
                      </span>
                    ) : (
                      <span className={`shrink-0 text-lg font-bold ${jenis === 'keluar' ? 'text-orange-600' : 'text-emerald-600'}`}>
                        {jenis === 'keluar' ? '−' : '+'}{formatAngka(jenis === 'keluar' ? keluar : masuk)}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {jenis === 'masuk' && (m.hargaBeli > 0 || m.pemasok || m.nomorNota) && (
                      <p>{m.hargaBeli ? `${formatIDR(m.hargaBeli)} × ${formatAngka(masuk)} = ${formatIDR(m.totalHarga)}` : ''}</p>
                    )}
                    {jenis === 'masuk' && (m.pemasok || m.nomorNota) && <p>{m.pemasok}{m.nomorNota ? ` · Nota ${m.nomorNota}` : ''}</p>}
                    {jenis === 'keluar' && m.tujuan && <p>Tujuan: {m.tujuan}</p>}
                    {jenis === 'penyesuaian' && <p>Sistem {formatAngka(sistem)} → Fisik {formatAngka(m.stokSetelah)} {m.satuanBahan}</p>}
                    {jenis === 'penyesuaian' && m.alasan && <p>Alasan: {m.alasan}</p>}
                    {m.keterangan && <p className="truncate">{m.keterangan}</p>}
                  </div>
                  {(canEdit || canDelete) && (
                    <div className="mt-2 flex gap-2">
                      {canEdit && <Button size="sm" variant="outline" className="h-8 flex-1" onClick={() => onEdit(m)}>Edit</Button>}
                      {canDelete && (
                        <Button size="sm" variant="outline" className="h-8 flex-1 text-red-600 hover:bg-red-50" onClick={() => onDelete(m)}>Hapus</Button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <p className="text-xs text-muted-foreground">{rows.length} transaksi</p>
        </>
      )}
    </div>
  )
}
