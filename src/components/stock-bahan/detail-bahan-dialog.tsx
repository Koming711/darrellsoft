'use client'

/**
 * Detail Bahan — informasi lengkap + riwayat stok per bahan.
 * Bagian: info utama (kode, kategori, supplier, stok, minimum, harga modal,
 * lokasi, catatan), Riwayat Stok (ledger), Stok Masuk, Stok Keluar,
 * Penyesuaian, dan Riwayat Harga Modal (dari transaksi masuk).
 */

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { formatIDR } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import type { Bahan, BahanMutasi } from './shared'
import { AktifBadge, JenisBadge, StatusStokBadge, formatAngka, formatTanggalID, masukKeluar } from './shared'

const BAGIAN = [
  { key: 'riwayat', label: 'Riwayat Stok' },
  { key: 'masuk', label: 'Stok Masuk' },
  { key: 'keluar', label: 'Stok Keluar' },
  { key: 'penyesuaian', label: 'Penyesuaian' },
  { key: 'harga', label: 'Riwayat Harga' },
] as const

type BagianKey = (typeof BAGIAN)[number]['key']

export function DetailBahanDialog({
  open, onOpenChange, bahan, mutasi, canEdit,
  onEdit, onStokMasuk, onStokKeluar,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  bahan: Bahan | null
  mutasi: BahanMutasi[]
  canEdit: boolean
  onEdit: (b: Bahan) => void
  onStokMasuk: (b: Bahan) => void
  onStokKeluar: (b: Bahan) => void
}) {
  const [bagian, setBagian] = useState<BagianKey>('riwayat')

  const list = useMemo(
    () =>
      mutasi
        .filter(m => m.bahanId === bahan?.id)
        .sort((a, b) => (b.tanggal || b.createdAt).localeCompare(a.tanggal || a.createdAt) || b.createdAt.localeCompare(a.createdAt)),
    [mutasi, bahan?.id],
  )

  const hargaList = useMemo(
    () => list.filter(m => m.jenis === 'masuk' && m.hargaBeli > 0),
    [list],
  )

  if (!bahan) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-6 text-lg">
            {bahan.nama}
            <StatusStokBadge b={bahan} />
            {!bahan.aktif && <AktifBadge aktif={false} />}
          </DialogTitle>
          <DialogDescription>{bahan.kode}{bahan.kategori ? ` · ${bahan.kategori}` : ''}</DialogDescription>
        </DialogHeader>

        {/* Info utama */}
        <div className="grid grid-cols-2 gap-3 rounded-xl border bg-stone-50 p-4 sm:grid-cols-4">
          <div>
            <p className="text-[11px] text-muted-foreground">Stok saat ini</p>
            <p className="text-xl font-bold">{formatAngka(bahan.stok)} <span className="text-xs font-normal">{bahan.satuan}</span></p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Stok minimum</p>
            <p className="text-sm font-semibold">{formatAngka(bahan.stokMin)} {bahan.satuan}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Harga modal terakhir</p>
            <p className="text-sm font-semibold">{bahan.hargaSatuan ? formatIDR(bahan.hargaSatuan) : '—'}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Nilai stok</p>
            <p className="text-sm font-semibold text-emerald-700">{formatIDR(Math.round(bahan.stok * bahan.hargaSatuan))}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Supplier</p>
            <p className="text-sm font-medium">{bahan.pemasok || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Lokasi</p>
            <p className="text-sm font-medium">{bahan.lokasi || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Referensi PO</p>
            <p className="text-sm font-medium">{bahan.referensiPo || '—'}</p>
          </div>
          <div className="col-span-2">
            <p className="text-[11px] text-muted-foreground">Catatan</p>
            <p className="text-sm">{bahan.keterangan || '—'}</p>
          </div>
        </div>

        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="min-h-[40px] flex-1 bg-emerald-600 hover:bg-emerald-700 sm:flex-none" onClick={() => onStokMasuk(bahan)}>
              + Stok Masuk
            </Button>
            <Button size="sm" className="min-h-[40px] flex-1 bg-orange-600 hover:bg-orange-700 sm:flex-none" onClick={() => onStokKeluar(bahan)}>
              − Stok Keluar
            </Button>
            <Button size="sm" variant="outline" className="min-h-[40px] flex-1 sm:flex-none" onClick={() => onEdit(bahan)}>
              Edit Bahan
            </Button>
          </div>
        )}

        {/* Bagian riwayat */}
        <div className="flex flex-wrap gap-1.5">
          {BAGIAN.map(b => (
            <button
              key={b.key}
              type="button"
              onClick={() => setBagian(b.key)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                bagian === b.key ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200',
              )}
            >
              {b.label}
            </button>
          ))}
        </div>

        {bagian === 'harga' ? (
          hargaList.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Belum ada transaksi masuk dengan harga beli.</p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border p-3">
              {hargaList.map(m => (
                <div key={m.id} className="flex items-center justify-between gap-2 border-b pb-2 text-sm last:border-0 last:pb-0">
                  <div>
                    <p className="font-semibold">{formatIDR(m.hargaBeli)} <span className="text-xs font-normal text-muted-foreground">/ {m.satuanBahan}</span></p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatTanggalID(m.tanggal)} · {m.nomor} · {formatAngka(m.qty)} {m.satuanBahan}{m.pemasok ? ` · ${m.pemasok}` : ''}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[11px]">{m.totalHarga ? formatIDR(m.totalHarga) : ''}</Badge>
                </div>
              ))}
              <p className="pt-1 text-[11px] text-muted-foreground">
                Harga modal transaksi lama tidak berubah — riwayat harga dipakai untuk HPP.
              </p>
            </div>
          )
        ) : (
          (() => {
            const rows =
              bagian === 'riwayat' ? list : list.filter(m => m.jenis === bagian)
            if (rows.length === 0) {
              return (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Belum ada {bagian === 'riwayat' ? 'riwayat stok' : bagian === 'masuk' ? 'transaksi masuk' : bagian === 'keluar' ? 'transaksi keluar' : 'penyesuaian'} untuk bahan ini.
                </p>
              )
            }
            return (
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border p-3">
                {rows.map(m => {
                  const { masuk, keluar } = masukKeluar(m)
                  return (
                    <div key={m.id} className="flex items-center justify-between gap-2 border-b pb-2 text-sm last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] text-muted-foreground">{m.nomor || '—'} · {formatTanggalID(m.tanggal)}</p>
                        <p className="truncate text-xs">
                          {m.jenis === 'masuk' && (m.pemasok || m.nomorNota) && `${m.pemasok}${m.nomorNota ? ` · Nota ${m.nomorNota}` : ''}`}
                          {m.jenis === 'keluar' && (m.tujuan || m.keterangan) && `${m.tujuan}${m.keterangan ? ` — ${m.keterangan}` : ''}`}
                          {m.jenis === 'penyesuaian' && (m.alasan || m.keterangan) && `${m.alasan}${m.keterangan ? ` — ${m.keterangan}` : ''}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <JenisBadge jenis={m.jenis} />
                        <span className={cn('font-bold', m.jenis === 'keluar' || m.qty < 0 ? 'text-orange-600' : 'text-emerald-600')}>
                          {m.jenis === 'keluar' ? '−' : '+'}{formatAngka(m.jenis === 'keluar' ? keluar : masuk)}
                        </span>
                        <span className="hidden w-24 text-right text-xs text-muted-foreground sm:inline">
                          Saldo {formatAngka(m.stokSetelah)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()
        )}
      </DialogContent>
    </Dialog>
  )
}
