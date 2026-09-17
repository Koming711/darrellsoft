'use client'

/**
 * Daftar Barang per Customer — halaman khusus untuk mengelola barang milik tiap customer.
 *
 * - Desktop (lg+): panel kiri = daftar customer (bisa dicari, dengan badge jumlah barang),
 *   panel kanan = kelola barang customer terpilih (tambah / edit inline / hapus).
 * - Mobile: dropdown pilih customer di atas, lalu panel kelola barang.
 *
 * Sumber data:
 * - GET  /api/customers        → daftar customer milik user
 * - GET  /api/customer-items   → semua barang milik user (dihitung per customer di client)
 * - POST/PUT/DELETE /api/customer-items[/id] → mutasi barang
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Package,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  X,
  Check,
  Search,
  Users,
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { getAuthUser } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'
import { hasSubPermission } from '@/lib/permissions'
import { useLanguage } from '@/contexts/language-context'
import { notifyDataChange } from '@/lib/data-sync'
import { useDataChange } from '@/hooks/use-data-change'

interface CustomerData {
  id: string
  name: string
  companyName?: string | null
  phone?: string | null
}

interface BarangCustomer {
  id: string
  customerId: string
  name: string
  satuan: string
  harga: number
  createdAt: string
}

const formatRupiah = (n: number) => 'Rp ' + (n || 0).toLocaleString('id-ID')

const parseHarga = (raw: string) => {
  const clean = raw.replace(/\./g, '').replace(/,/g, '').trim()
  return clean === '' ? 0 : Number(clean) || 0
}

export default function MasterBarangCustomerPage() {
  const { t } = useLanguage()
  const currentUser = getAuthUser()
  const canAdd = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-barang-customer', 'master-barang-customer-tambah')
  const canEdit = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-barang-customer', 'master-barang-customer-edit')
  const canDelete = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-barang-customer', 'master-barang-customer-hapus')
  const canView = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-barang-customer', 'master-barang-customer-lihat') || canAdd || canEdit || canDelete

  const [customers, setCustomers] = useState<CustomerData[]>([])
  const [allItems, setAllItems] = useState<BarangCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')

  // Form tambah barang
  const [nama, setNama] = useState('')
  const [satuan, setSatuan] = useState('pcs')
  const [harga, setHarga] = useState('')
  const [saving, setSaving] = useState(false)

  // Edit inline
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNama, setEditNama] = useState('')
  const [editSatuan, setEditSatuan] = useState('')
  const [editHarga, setEditHarga] = useState('')

  const fetchData = useCallback(async () => {
    try {
      const [custRes, itemRes] = await Promise.all([
        authFetch('/api/customers'),
        authFetch('/api/customer-items'),
      ])
      const custData = custRes.ok ? await custRes.json() : []
      const itemData = itemRes.ok ? await itemRes.json() : []
      const custList: CustomerData[] = Array.isArray(custData) ? custData : []
      const itemList: BarangCustomer[] = Array.isArray(itemData) ? itemData : []
      setCustomers(custList)
      setAllItems(itemList)
      setSelectedId((prev) => {
        if (prev && custList.some((c) => c.id === prev)) return prev
        return custList.length > 0 ? custList[0].id : null
      })
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error('Gagal memuat data customer & barang')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Refresh saat data customer / barang berubah di tempat lain (mis. Master Customer, invoice)
  useDataChange(['customers', 'customer-items'], () => {
    fetchData()
  })

  // ===== Derived data =====
  const itemCountByCustomer = useMemo(() => {
    const map: Record<string, number> = {}
    for (const it of allItems) {
      map[it.customerId] = (map[it.customerId] || 0) + 1
    }
    return map
  }, [allItems])

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.companyName?.toLowerCase().includes(q)
    )
  }, [customers, customerSearch])

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedId) || null,
    [customers, selectedId]
  )

  const items = useMemo(
    () => (selectedId ? allItems.filter((it) => it.customerId === selectedId) : []),
    [allItems, selectedId]
  )

  // ===== Mutasi barang =====
  const handleAdd = async () => {
    if (!selectedCustomer) return
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
          customerId: selectedCustomer.id,
          name: nama.trim(),
          satuan: satuan.trim() || 'pcs',
          harga: parseHarga(harga),
        }),
      })
      if (res.ok) {
        const created: BarangCustomer = await res.json()
        setAllItems((prev) => [created, ...prev])
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
    if (!editingId) return
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
        setAllItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)))
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
    if (!confirm(`Hapus barang "${item.name}"?`)) return
    try {
      const res = await authFetch(`/api/customer-items/${item.id}`, { method: 'DELETE' })
      if (res.ok) {
        setAllItems((prev) => prev.filter((it) => it.id !== item.id))
        toast.success('Barang dihapus')
        notifyDataChange('customer-items')
      } else {
        const err = await res.json().catch(() => null)
        toast.error(err?.error || 'Gagal menghapus barang')
      }
    } catch {
      toast.error('Gagal menghapus barang')
    }
  }

  // ===== Sub-komponen: form tambah =====
  const renderAddForm = () => (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <Label className="text-xs">Tambah Barang</Label>
      <div className="grid grid-cols-[1fr_72px_110px] gap-2">
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
  )

  const renderItemRow = (item: BarangCustomer) =>
    editingId === item.id ? (
      <div key={item.id} className="rounded-lg border bg-card p-2.5 space-y-2">
        <div className="grid grid-cols-[1fr_72px_110px] gap-2">
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
      <div key={item.id} className="rounded-lg border bg-card p-2.5 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-800 truncate">{item.name}</p>
          <p className="text-[11px] text-slate-400">
            {formatRupiah(item.harga)} / {item.satuan || 'pcs'}
          </p>
        </div>
        {canEdit && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => startEdit(item)}
            className="h-7 w-7 shrink-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
            aria-label={`Edit ${item.name}`}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
        )}
        {canDelete && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleDelete(item)}
            className="h-7 w-7 shrink-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
            aria-label={`Hapus ${item.name}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    )

  const renderItemsPanel = () => (
    <div className="bg-card rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-[320px]">
      {/* Header customer terpilih */}
      <div className="p-3 sm:p-4 border-b border-slate-200 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
          <Package className="w-5 h-5 text-blue-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--foreground)' }}>
            {selectedCustomer ? selectedCustomer.name : 'Pilih customer'}
          </p>
          <p className="text-[11px] text-slate-400 truncate">
            {selectedCustomer
              ? `${selectedCustomer.companyName ? selectedCustomer.companyName + ' — ' : ''}${items.length} barang`
              : 'Belum ada customer dipilih'}
          </p>
        </div>
        <span className="text-[11px] font-medium text-slate-400 hidden sm:block shrink-0">
          {items.length} {t('records_count')}
        </span>
      </div>

      {/* Konten */}
      <div className="p-3 sm:p-4 space-y-3 flex-1 min-h-0 flex flex-col">
        {!selectedCustomer ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mb-3" />
            <p className="text-sm text-slate-500">Pilih customer terlebih dahulu</p>
            <p className="text-xs text-slate-400 mt-1">Daftar customer bisa ditambahkan di menu Master Customer</p>
          </div>
        ) : (
          <>
            {renderAddForm()}
            <div className="flex-1 min-h-0 max-h-[52vh] overflow-y-auto space-y-2 -mx-1 px-1">
              {items.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Package className="w-10 h-10 text-slate-300 mb-2" />
                  <p className="text-sm text-slate-500">Belum ada barang untuk customer ini</p>
                  <p className="text-xs text-slate-400 mt-1">Tambahkan barang yang sering dipesan agar bisa dipilih cepat saat buat invoice</p>
                </div>
              ) : (
                items.map(renderItemRow)
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )

  return (
    <DashboardLayout
      title={t('master_barang_customer')}
      subtitle={t('subtitle_master_barang_customer')}
    >
      {canView && (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          {/* ===== Panel customer — mobile: dropdown ===== */}
          <div className="bg-card rounded-xl shadow-sm border border-slate-200 p-3 lg:hidden">
            <Label className="text-xs mb-1.5 block">Pilih Customer</Label>
            <select
              value={selectedId ?? ''}
              onChange={(e) => { setSelectedId(e.target.value || null); setEditingId(null) }}
              className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Pilih customer"
            >
              <option value="" disabled>
                — Pilih customer —
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.companyName ? ` — ${c.companyName}` : ''} ({itemCountByCustomer[c.id] || 0} barang)
                </option>
              ))}
            </select>
          </div>

          {/* ===== Panel customer — desktop: list + search ===== */}
          <div className="hidden lg:flex bg-card rounded-xl shadow-sm border border-slate-200 flex-col max-h-[calc(100vh-13rem)] sticky top-[4.5rem] self-start">
            <div className="p-3 border-b border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                  Customer
                </p>
                <span className="text-[11px] text-slate-400">{customers.length} customer</span>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari customer..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center px-3">
                  <Users className="w-10 h-10 text-slate-300 mb-2" />
                  <p className="text-sm text-slate-500">
                    {customers.length === 0 ? 'Belum ada customer' : 'Tidak ada customer ditemukan'}
                  </p>
                </div>
              ) : (
                filteredCustomers.map((c) => {
                  const active = c.id === selectedId
                  const count = itemCountByCustomer[c.id] || 0
                  return (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedId(c.id); setEditingId(null) }}
                      className={`w-full text-left rounded-lg px-2.5 py-2 transition-colors ${
                        active ? 'bg-blue-50 border border-blue-200' : 'border border-transparent hover:bg-slate-50'
                      }`}
                      aria-pressed={active}
                    >
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm truncate ${active ? 'font-semibold text-blue-700' : 'font-medium text-slate-700'}`}>
                            {c.name}
                          </p>
                          {c.companyName && (
                            <p className="text-[11px] text-slate-400 truncate">{c.companyName}</p>
                          )}
                        </div>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                            count > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {count}
                        </span>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* ===== Panel barang ===== */}
          {renderItemsPanel()}
        </div>
      )}
    </DashboardLayout>
  )
}
