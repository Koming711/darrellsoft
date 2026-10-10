'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, PackageCheck, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { getAuthHeaders } from '@/lib/auth'
import { notifyDataChange } from '@/lib/data-sync'
import { cn } from '@/lib/utils'

/**
 * Dialog "Terima Barang" — petakan item Purchase Order ke bahan Stock Bahan.
 * Submit → POST /api/purchase-order/receive → mutasi masuk otomatis dibuat
 * (stok & harga satuan ter-update tanpa input ulang di modul Stock Bahan).
 */

interface POItem {
  id?: string
  deskripsi?: string
  qty?: number
  satuan?: string
  harga?: number
}

interface BahanLite {
  id: string
  nama: string
  satuan: string
  stok: number
  hargaSatuan: number
}

interface RowState {
  bahanId: string // '' = lewati (tidak masuk stok)
  qty: string
  harga: string
}

export function PoReceiveDialog({
  open,
  onOpenChange,
  po,
  onReceived,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  po: { id: string; nomor: string; dataJson: string } | null
  onReceived?: () => void
}) {
  const [items, setItems] = useState<POItem[]>([])
  const [bahans, setBahans] = useState<BahanLite[]>([])
  const [rows, setRows] = useState<Record<number, RowState>>({})
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Pencocokan otomatis nama item PO → master bahan (prefill, user tetap bisa ubah)
  const matchBahan = useCallback((nama: string, list: BahanLite[]): BahanLite | null => {
    const q = nama.toLowerCase().trim()
    if (!q) return null
    return (
      list.find(b => b.nama.toLowerCase() === q) ||
      list.find(b => {
        const n = b.nama.toLowerCase()
        if (n.length < 4) return false
        return n.includes(q) || q.includes(n)
      }) ||
      null
    )
  }, [])

  // Saat dialog dibuka: parse item PO + muat daftar bahan + prefill baris
  useEffect(() => {
    if (!open || !po) return
    let cancelled = false

    const run = async () => {
      setLoading(true)
      try {
        const parsed = JSON.parse(po.dataJson || '{}')
        const poItems: POItem[] = Array.isArray(parsed.items) ? parsed.items : []
        const res = await fetch('/api/stock-bahan', { headers: getAuthHeaders(), cache: 'no-store' })
        const list: BahanLite[] = res.ok ? await res.json() : []
        if (cancelled) return

        setItems(poItems)
        setBahans(Array.isArray(list) ? list : [])

        const nextRows: Record<number, RowState> = {}
        poItems.forEach((it, idx) => {
          const matched = matchBahan(String(it.deskripsi || ''), Array.isArray(list) ? list : [])
          nextRows[idx] = {
            bahanId: matched ? matched.id : '',
            qty: it.qty && it.qty > 0 ? String(it.qty) : '',
            harga: it.harga && it.harga > 0 ? String(it.harga) : '',
          }
        })
        setRows(nextRows)
      } catch (err) {
        console.error('Gagal memuat data penerimaan PO:', err)
        if (!cancelled) toast.error('Gagal memuat data untuk penerimaan barang')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [open, po, matchBahan])

  const bahanById = useMemo(() => {
    const map = new Map<string, BahanLite>()
    for (const b of bahans) map.set(b.id, b)
    return map
  }, [bahans])

  const mappedCount = useMemo(
    () =>
      Object.values(rows).filter(r => r.bahanId && r.bahanId !== '' && Number(r.qty) > 0).length,
    [rows]
  )

  const setRow = (idx: number, patch: Partial<RowState>) =>
    setRows(prev => ({ ...prev, [idx]: { ...prev[idx], ...patch } }))

  const handleSubmit = async () => {
    if (!po) return
    const payloadItems = Object.entries(rows)
      .filter(([, r]) => r.bahanId && r.bahanId !== '' && Number(r.qty) > 0)
      .map(([idx, r]) => ({
        itemIndex: Number(idx),
        bahanId: r.bahanId,
        qty: Number(r.qty),
        hargaSatuan: Number(r.harga) || 0,
      }))

    if (payloadItems.length === 0) {
      toast.error('Pilih minimal satu bahan dengan jumlah lebih dari 0')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/purchase-order/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ poId: po.id, items: payloadItems }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.success) {
        const stokList: { nama: string; stok: number; satuan: string }[] = json.stokSekarang || []
        toast.success(`${json.jumlahItem} bahan otomatis masuk Stock Bahan`, {
          description:
            stokList.length > 0
              ? `Stok kini: ${stokList.map(s => `${s.nama} ${s.stok.toLocaleString('id-ID')} ${s.satuan}`).join(', ')}`
              : `No. PO ${po.nomor}`,
        })
        notifyDataChange('stock-bahan')
        onOpenChange(false)
        onReceived?.()
      } else {
        toast.error(json.error || 'Gagal memproses penerimaan barang')
      }
    } catch {
      toast.error('Gagal memproses penerimaan barang')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!submitting) onOpenChange(o) }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-emerald-600" />
            Terima Barang ke Stock Bahan
          </DialogTitle>
          <DialogDescription>
            Petakan item PO <span className="font-mono font-semibold">{po?.nomor || '-'}</span> ke
            bahan. Barang yang dipetakan otomatis masuk stok (riwayat mutasi &amp; harga satuan
            ter-update).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            PO ini tidak memiliki item.
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-3 scrollbar-thin">
            {items.map((it, idx) => {
              const row = rows[idx] || { bahanId: '', qty: '', harga: '' }
              const bahan = row.bahanId ? bahanById.get(row.bahanId) : null
              const satuanBeda =
                bahan && it.satuan && bahan.satuan && it.satuan.toLowerCase() !== bahan.satuan.toLowerCase()
              return (
                <div
                  key={it.id || idx}
                  className={cn(
                    'rounded-lg border p-3 space-y-2.5',
                    row.bahanId ? 'border-emerald-200 bg-emerald-50/40' : 'border-stone-200'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-snug">{it.deskripsi || `Item ${idx + 1}`}</p>
                    {row.bahanId ? (
                      <Badge className="shrink-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0">Masuk stok</Badge>
                    ) : (
                      <Badge variant="secondary" className="shrink-0">Dilewati</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    PO: {it.qty ? it.qty.toLocaleString('id-ID') : 0} {it.satuan || ''} ×{' '}
                    {(it.harga || 0).toLocaleString('id-ID')}
                  </p>

                  <div className="grid gap-2 sm:grid-cols-[1fr_120px_140px]">
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Bahan Stock Bahan</Label>
                      <Select
                        value={row.bahanId || 'skip'}
                        onValueChange={v => setRow(idx, { bahanId: v === 'skip' ? '' : v })}
                      >
                        <SelectTrigger className="min-h-[40px]">
                          <SelectValue placeholder="Pilih bahan" />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          <SelectItem value="skip">— Lewati (tidak masuk stok) —</SelectItem>
                          {bahans.map(b => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.nama} ({b.stok.toLocaleString('id-ID')} {b.satuan})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`po-qty-${idx}`} className="text-xs">
                        Jumlah{bahan ? ` (${bahan.satuan})` : ''}
                      </Label>
                      <Input
                        id={`po-qty-${idx}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        value={row.qty}
                        onChange={e => setRow(idx, { qty: e.target.value })}
                        className="min-h-[40px]"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`po-harga-${idx}`} className="text-xs">Harga Beli / satuan</Label>
                      <Input
                        id={`po-harga-${idx}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        value={row.harga}
                        onChange={e => setRow(idx, { harga: e.target.value })}
                        className="min-h-[40px]"
                      />
                    </div>
                  </div>

                  {satuanBeda && (
                    <p className="flex items-start gap-1.5 text-xs text-amber-600">
                      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      Satuan PO ({it.satuan}) berbeda dengan satuan bahan ({bahan!.satuan}) —
                      pastikan jumlah sesuai satuan bahan.
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className="text-xs text-muted-foreground order-2 sm:order-1">
            {mappedCount} item akan masuk stok
          </p>
          <div className="flex gap-2 order-1 sm:order-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting} className="min-h-[44px]">
              Batal
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || loading || mappedCount === 0}
              className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px]"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Memproses…
                </>
              ) : (
                <>
                  <PackageCheck className="h-4 w-4 mr-1.5" /> Terima
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
