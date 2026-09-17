'use client'

/**
 * CustomerItemsManager — dialog kelola daftar barang milik satu customer.
 * Dipakai di halaman Master Customer (tombol "Barang" pada setiap baris customer).
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Package, Plus, Trash2, Pencil, Loader2, X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { authFetch } from '@/lib/auth-fetch'
import { notifyDataChange } from '@/lib/data-sync'

export interface BarangCustomer {
  id: string
  customerId: string
  name: string
  satuan: string
  harga: number
  createdAt: string
}

interface CustomerItemsManagerProps {
  customer: { id: string; name: string; companyName?: string | null } | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Dipanggil setiap daftar barang berubah — untuk update badge jumlah barang */
  onCountChange?: (customerId: string, count: number) => void
}

const formatRupiah = (n: number) => (n || 0).toLocaleString('id-ID')

export function CustomerItemsManager({ customer, open, onOpenChange, onCountChange }: CustomerItemsManagerProps) {
  const [items, setItems] = useState<BarangCustomer[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [nama, setNama] = useState('')
  const [satuan, setSatuan] = useState('pcs')
  const [harga, setHarga] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNama, setEditNama] = useState('')
  const [editSatuan, setEditSatuan] = useState('')
  const [editHarga, setEditHarga] = useState('')

  // Ref agar fetchItems stabil — onCountChange dari parent sering berubah identitas
  // (inline callback) dan tidak boleh memicu re-fetch loop.
  const onCountChangeRef = useRef(onCountChange)
  useEffect(() => { onCountChangeRef.current = onCountChange })

  const fetchItems = useCallback(async (customerId: string) => {
    setLoading(true)
    try {
      const res = await authFetch(`/api/customer-items?customerId=${customerId}`)
      if (res.ok) {
        const data = await res.json()
        const list: BarangCustomer[] = Array.isArray(data) ? data : []
        setItems(list)
        onCountChangeRef.current?.(customerId, list.length)
      } else {
        toast.error('Gagal memuat daftar barang')
      }
    } catch {
      toast.error('Gagal memuat daftar barang')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open && customer) {
      setEditingId(null)
      setNama(''); setSatuan('pcs'); setHarga('')
      fetchItems(customer.id)
    }
    if (!open) {
      setItems([])
    }
  }, [open, customer, fetchItems])

  const parseHarga = (raw: string) => {
    const clean = raw.replace(/\./g, '').replace(/,/g, '').trim()
    return clean === '' ? 0 : Number(clean) || 0
  }

  const handleAdd = async () => {
    if (!customer) return
    if (nama.trim() === '') {
      toast.error('Nama barang wajib diisi')
      return
    }
    setSaving(true)
    try {
      const res = await authFetch('/api/customer-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          name: nama.trim(),
          satuan: satuan.trim() || 'pcs',
          harga: parseHarga(harga),
        }),
      })
      if (res.ok) {
        const created: BarangCustomer = await res.json()
        setItems((prev) => [created, ...prev])
        onCountChange?.(customer.id, items.length + 1)
        setNama(''); setSatuan('pcs'); setHarga('')
        toast.success('Barang ditambahkan')
        notifyDataChange('customer-items')
      } else {
        const err = await res.json().catch(() => null)
        toast.error(err?.error || 'Gagal menambahkan barang')
      }
    } catch {
      toast.error('Gagal menambahkan barang')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (item: BarangCustomer) => {
    setEditingId(item.id)
    setEditNama(item.name)
    setEditSatuan(item.satuan)
    setEditHarga(item.harga ? item.harga.toLocaleString('id-ID') : '')
  }

  const handleUpdate = async () => {
    if (!customer || !editingId) return
    if (editNama.trim() === '') {
      toast.error('Nama barang wajib diisi')
      return
    }
    setSaving(true)
    try {
      const res = await authFetch(`/api/customer-items/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editNama.trim(),
          satuan: editSatuan.trim() || 'pcs',
          harga: parseHarga(editHarga),
        }),
      })
      if (res.ok) {
        const updated: BarangCustomer = await res.json()
        setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)))
        setEditingId(null)
        toast.success('Barang diperbarui')
        notifyDataChange('customer-items')
      } else {
        const err = await res.json().catch(() => null)
        toast.error(err?.error || 'Gagal memperbarui barang')
      }
    } catch {
      toast.error('Gagal memperbarui barang')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item: BarangCustomer) => {
    if (!customer) return
    if (!confirm(`Hapus barang "${item.name}"?`)) return
    try {
      const res = await authFetch(`/api/customer-items/${item.id}`, { method: 'DELETE' })
      if (res.ok) {
        setItems((prev) => prev.filter((it) => it.id !== item.id))
        onCountChange?.(customer.id, items.length - 1)
        toast.success('Barang dihapus')
        notifyDataChange('customer-items')
      } else {
        toast.error('Gagal menghapus barang')
      }
    } catch {
      toast.error('Gagal menghapus barang')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Package className="w-4 h-4 text-blue-600" />
            Daftar Barang
          </DialogTitle>
          <DialogDescription>
            {customer ? (
              <span>
                {customer.name}
                {customer.companyName ? ` — ${customer.companyName}` : ''}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {/* Form tambah barang */}
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <Label className="text-xs">Tambah Barang</Label>
          <div className="grid grid-cols-[1fr_72px_100px] gap-2">
            <Input
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              placeholder="Nama barang"
              className="h-9 text-sm"
            />
            <Input
              value={satuan}
              onChange={(e) => setSatuan(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              placeholder="pcs"
              className="h-9 text-sm"
            />
            <Input
              value={harga}
              onChange={(e) => setHarga(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              placeholder="Harga"
              inputMode="numeric"
              className="h-9 text-sm text-right"
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={handleAdd} disabled={saving || nama.trim() === ''} className="h-8 gap-1 text-xs">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Tambah
            </Button>
          </div>
        </div>

        {/* Daftar barang */}
        <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Package className="w-10 h-10 text-slate-300 mb-2" />
              <p className="text-sm text-slate-500">Belum ada barang untuk customer ini</p>
              <p className="text-xs text-slate-400 mt-1">Tambahkan barang yang sering dipesan agar bisa dipilih cepat saat buat invoice</p>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="rounded-lg border bg-card p-2.5">
                {editingId === item.id ? (
                  /* Mode edit inline */
                  <div className="space-y-2">
                    <div className="grid grid-cols-[1fr_72px_100px] gap-2">
                      <Input
                        value={editNama}
                        onChange={(e) => setEditNama(e.target.value)}
                        className="h-8 text-sm"
                        placeholder="Nama barang"
                      />
                      <Input
                        value={editSatuan}
                        onChange={(e) => setEditSatuan(e.target.value)}
                        className="h-8 text-sm"
                        placeholder="pcs"
                      />
                      <Input
                        value={editHarga}
                        onChange={(e) => setEditHarga(e.target.value)}
                        inputMode="numeric"
                        className="h-8 text-sm text-right"
                        placeholder="Harga"
                      />
                    </div>
                    <div className="flex justify-end gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} className="h-7 gap-1 text-xs">
                        <X className="w-3 h-3" /> Batal
                      </Button>
                      <Button size="sm" onClick={handleUpdate} disabled={saving} className="h-7 gap-1 text-xs">
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Simpan
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Mode tampil */
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{item.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {formatRupiah(item.harga)} / {item.satuan || 'pcs'}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startEdit(item)}
                      className="h-7 w-7 shrink-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                      aria-label={`Edit ${item.name}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(item)}
                      className="h-7 w-7 shrink-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                      aria-label={`Hapus ${item.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
