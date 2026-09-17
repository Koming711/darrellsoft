'use client'

/**
 * CustomerItemPicker — tombol + dialog untuk memilih barang dari daftar
 * barang milik customer yang sedang dipilih di editor (invoice).
 * Memanggil onSelect dengan data barang; editor yang memutuskan
 * bagaimana barang dimasukkan ke daftar item dokumen.
 */

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Package, Loader2, PackagePlus } from 'lucide-react'
import { toast } from 'sonner'
import { getAuthHeaders } from '@/lib/auth'

export interface BarangPilihan {
  id: string
  name: string
  satuan: string
  harga: number
}

interface CustomerItemPickerProps {
  /** ID customer terpilih — null jika belum memilih customer dari master */
  customerId: string | null
  /** Nama customer untuk judul dialog */
  customerName?: string
  onSelect: (item: BarangPilihan) => void
}

const formatRupiah = (n: number) => (n || 0).toLocaleString('id-ID')

export function CustomerItemPicker({ customerId, customerName, onSelect }: CustomerItemPickerProps) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<BarangPilihan[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !customerId) return
    let cancelled = false
    setLoading(true)
    setItems([])
    fetch(`/api/customer-items?customerId=${customerId}`, { headers: getAuthHeaders() })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('gagal'))))
      .then((data) => {
        if (!cancelled) setItems(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!cancelled) toast.error('Gagal memuat daftar barang')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [open, customerId])

  const handlePick = (item: BarangPilihan) => {
    onSelect(item)
    setOpen(false)
  }

  const disabled = !customerId

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs gap-1"
        disabled={disabled}
        title={disabled ? 'Pilih customer dari master terlebih dahulu' : 'Ambil barang dari daftar customer ini'}
        onClick={() => setOpen(true)}
      >
        <PackagePlus className="w-3.5 h-3.5" />
        Dari Daftar
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Package className="w-4 h-4 text-blue-600" />
              Pilih Barang
            </DialogTitle>
            <DialogDescription>
              Daftar barang {customerName ? `— ${customerName}` : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-1.5">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Package className="w-10 h-10 text-slate-300 mb-2" />
                <p className="text-sm text-slate-500">Belum ada barang untuk customer ini</p>
                <p className="text-xs text-slate-400 mt-1">Kelola di menu Master Customer → tombol Barang</p>
              </div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handlePick(item)}
                  className="w-full text-left rounded-lg border bg-card px-3 py-2.5 hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
                >
                  <p className="text-sm font-medium text-slate-800 truncate">{item.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {formatRupiah(item.harga)} / {item.satuan || 'pcs'}
                  </p>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
