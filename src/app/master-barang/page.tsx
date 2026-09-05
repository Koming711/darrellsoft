'use client'

import { Package, Plus, Search, Loader2, Trash2, ChevronDown } from 'lucide-react'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { getAuthUser } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'
import { hasSubPermission } from '@/lib/permissions'
import { formatRupiah } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useDataChange } from '@/hooks/use-data-change'

interface CustomerItem {
  id: string
  name: string
  companyName: string | null
}

interface Registration {
  customer: { id: string; name: string; companyName: string | null }
}

interface Barang {
  id: string
  kode: string
  nama: string
  modal: number
  jual: number
  keterangan: string
  registrations: Registration[]
}

interface CustomerReg {
  barangId: string
  kode: string
  nama: string
  modal: number
  jual: number
  keterangan: string
  price: number
}

function formatPercent(n: number): string {
  const rounded = Math.round(n * 10) / 10
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`
}

export default function MasterBarangPage() {
  const currentUser = getAuthUser()
  const canAdd = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-barang', 'master-barang-tambah')
  const canEdit = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-barang', 'master-barang-edit')
  const canDelete = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-barang', 'master-barang-hapus')

  const [customers, setCustomers] = useState<CustomerItem[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [barangList, setBarangList] = useState<Barang[]>([])
  const [regs, setRegs] = useState<CustomerReg[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Add dialog state
  const [addOpen, setAddOpen] = useState(false)
  const [addMode, setAddMode] = useState<'checklist' | 'new'>('checklist')
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [savingChecklist, setSavingChecklist] = useState(false)
  const [newForm, setNewForm] = useState({ nama: '', modal: '', jual: '', keterangan: '' })
  const [savingNew, setSavingNew] = useState(false)

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<Barang | null>(null)
  const [editForm, setEditForm] = useState({ nama: '', modal: '', price: '', keterangan: '' })
  const [savingEdit, setSavingEdit] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const selectedCustomer = useMemo(
    () => customers.find(c => c.id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  )

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await authFetch('/api/customers')
      if (res.ok) setCustomers(await res.json())
    } catch { /* silent */ }
  }, [])

  const fetchBarang = useCallback(async () => {
    try {
      const res = await authFetch('/api/barang')
      if (res.ok) setBarangList(await res.json())
    } catch {
      toast.error('Gagal memuat data barang')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchRegs = useCallback(async (customerId: string) => {
    try {
      const res = await authFetch(`/api/barang-customer?customerId=${customerId}`)
      if (res.ok) setRegs(await res.json())
      else setRegs([])
    } catch {
      setRegs([])
    }
  }, [])

  useEffect(() => {
    Promise.all([fetchCustomers(), fetchBarang()]).then(() => setLoading(false))
  }, [fetchCustomers, fetchBarang])

  useDataChange(['barang'], () => {
    fetchBarang()
    if (selectedCustomerId) fetchRegs(selectedCustomerId)
  })

  const handleSelectCustomer = async (id: string | null) => {
    setSelectedCustomerId(id)
    setRegs([])
    setCheckedIds(new Set())
    if (id) await fetchRegs(id)
  }

  // priceMap for selected customer: barangId → custom price
  const priceMap = useMemo(() => {
    const m = new Map<string, number>()
    regs.forEach(r => m.set(r.barangId, r.price))
    return m
  }, [regs])

  /**
   * Daftar barang pelanggan = barang yang TERDAFTAR (punya harga khusus / di-checklist)
   * untuk customer terpilih. Tanpa filter pelanggan = semua barang (read-only).
   */
  const visibleBarang = useMemo(() => {
    let list: Barang[]
    if (!selectedCustomerId) {
      list = barangList
    } else {
      list = barangList.filter(b => priceMap.has(b.id))
    }
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(b =>
      b.nama.toLowerCase().includes(q) ||
      b.kode.toLowerCase().includes(q) ||
      b.keterangan.toLowerCase().includes(q)
    )
  }, [barangList, selectedCustomerId, priceMap, search])

  const getJual = (b: Barang) => (selectedCustomerId ? (priceMap.get(b.id) ?? b.jual) : b.jual)
  const getUntung = (b: Barang) => getJual(b) - b.modal
  const getSelisihPct = (b: Barang) => {
    const jual = getJual(b)
    if (b.modal > 0) return ((jual - b.modal) / b.modal) * 100
    return jual > 0 ? 100 : 0
  }

  // Items not yet registered to the selected customer (for the checklist)
  const unregistered = useMemo(() => {
    if (!selectedCustomerId) return []
    return barangList.filter(b => !priceMap.has(b.id))
  }, [barangList, selectedCustomerId, priceMap])

  const openAdd = () => {
    setAddMode(unregistered.length > 0 ? 'checklist' : 'new')
    setCheckedIds(new Set())
    setNewForm({ nama: '', modal: '', jual: '', keterangan: '' })
    setAddOpen(true)
  }

  const handleSaveChecklist = async () => {
    if (!selectedCustomerId) return
    const entries = [...checkedIds].map(barangId => {
      const b = barangList.find(x => x.id === barangId)
      return { barangId, price: b ? b.jual : 0 }
    })
    if (entries.length === 0) {
      toast.info('Pilih minimal 1 barang terlebih dahulu')
      return
    }
    setSavingChecklist(true)
    try {
      const res = await authFetch('/api/barang-customer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: selectedCustomerId, entries }),
      })
      if (res.ok) {
        toast.success(`${entries.length} barang ditambahkan ke daftar ${selectedCustomer?.name || 'pelanggan'}`)
        setAddOpen(false)
        setCheckedIds(new Set())
        await fetchRegs(selectedCustomerId)
      } else {
        toast.error('Gagal menyimpan daftar barang')
      }
    } catch {
      toast.error('Gagal menyimpan daftar barang')
    } finally {
      setSavingChecklist(false)
    }
  }

  const handleSaveNew = async () => {
    if (!selectedCustomerId) return
    if (!newForm.nama.trim()) {
      toast.error('Nama barang wajib diisi')
      return
    }
    setSavingNew(true)
    try {
      const res = await authFetch('/api/barang', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: newForm.nama,
          modal: Number(newForm.modal) || 0,
          jual: Number(newForm.jual) || 0,
          keterangan: newForm.keterangan,
          customerId: selectedCustomerId,
        }),
      })
      if (res.ok) {
        toast.success(`Barang berhasil ditambahkan & terdaftar untuk ${selectedCustomer?.name || 'pelanggan'}`)
        setAddOpen(false)
        setNewForm({ nama: '', modal: '', jual: '', keterangan: '' })
        await fetchBarang()
        await fetchRegs(selectedCustomerId)
      } else {
        const err = await res.json().catch(() => null)
        toast.error(err?.error || 'Gagal menambahkan barang')
      }
    } catch {
      toast.error('Gagal menambahkan barang')
    } finally {
      setSavingNew(false)
    }
  }

  const openEdit = (b: Barang) => {
    if (!selectedCustomerId) return // mode "Semua Barang" tidak bisa diedit
    setEditing(b)
    setEditForm({
      nama: b.nama,
      modal: String(b.modal),
      price: String(getJual(b)),
      keterangan: b.keterangan,
    })
    setEditOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editing || !selectedCustomerId) return
    setSavingEdit(true)
    try {
      const resBarang = await authFetch(`/api/barang/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: editForm.nama,
          modal: Number(editForm.modal) || 0,
          keterangan: editForm.keterangan,
        }),
      })
      const resReg = await authFetch('/api/barang-customer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomerId,
          entries: [{ barangId: editing.id, price: Number(editForm.price) || 0 }],
        }),
      })
      if (resBarang.ok && resReg.ok) {
        toast.success('Barang berhasil diperbarui')
        setEditOpen(false)
        await fetchBarang()
        await fetchRegs(selectedCustomerId)
      } else {
        toast.error('Gagal memperbarui barang')
      }
    } catch {
      toast.error('Gagal memperbarui barang')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleUnregister = async (b: Barang) => {
    if (!selectedCustomerId) return
    if (!confirm(`Hapus "${b.nama}" dari daftar barang ${selectedCustomer?.name}?`)) return
    try {
      const res = await authFetch(`/api/barang-customer?customerId=${selectedCustomerId}&barangId=${b.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        toast.success(`"${b.nama}" dihapus dari daftar ${selectedCustomer?.name}`)
        await fetchRegs(selectedCustomerId)
      } else {
        toast.error('Gagal menghapus barang dari daftar')
      }
    } catch {
      toast.error('Gagal menghapus barang dari daftar')
    }
  }

  const handleDeleteBarang = async () => {
    if (!editing) return
    setDeleting(true)
    try {
      const res = await authFetch(`/api/barang/${editing.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Barang berhasil dihapus permanen')
        setEditOpen(false)
        await fetchBarang()
        if (selectedCustomerId) await fetchRegs(selectedCustomerId)
      } else {
        toast.error('Gagal menghapus barang')
      }
    } catch {
      toast.error('Gagal menghapus barang')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <DashboardLayout title="Master Barang" subtitle="Kelola daftar barang pelanggan">
      <div className="space-y-4">
        {/* Header: customer filter + search + tambah */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-slate-200 dark:border-zinc-700 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Package className="w-4 h-4 text-violet-600 shrink-0" />
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide truncate">Daftar Barang</h2>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative">
                <select
                  value={selectedCustomerId || ''}
                  onChange={(e) => handleSelectCustomer(e.target.value || null)}
                  className="h-9 w-full sm:w-56 appearance-none rounded-lg border border-slate-200 bg-white dark:bg-zinc-900 dark:border-zinc-700 px-3 pr-8 text-sm text-slate-700 dark:text-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer"
                  aria-label="Pilih pelanggan"
                >
                  <option value="">Semua Barang</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.companyName ? ` — ${c.companyName}` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama / kode barang..."
                  className="pl-8 h-9 sm:w-48"
                />
              </div>
              {selectedCustomerId && canAdd && (
                <Button onClick={openAdd} size="sm" className="h-9 gap-1.5 bg-violet-600 hover:bg-violet-700 text-white">
                  <Plus className="w-4 h-4" /> Tambah
                </Button>
              )}
            </div>
          </div>
          {selectedCustomer && (
            <p className="mt-2 text-xs text-slate-500">
              Menampilkan daftar barang pelanggan: <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedCustomer.name}</span>
              {selectedCustomer.companyName ? ` (${selectedCustomer.companyName})` : ''} — {visibleBarang.length} barang
            </p>
          )}
          {!selectedCustomer && (
            <p className="mt-2 text-xs text-slate-500">
              Mode <span className="font-semibold">Semua Barang</span> — pilih pelanggan untuk mengedit & mendaftarkan barang.
            </p>
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-slate-200 dark:border-zinc-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-violet-600" /></div>
          ) : (
            <div className="max-h-[65vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[50px] text-center">#</TableHead>
                    <TableHead className="min-w-[110px]">Kode</TableHead>
                    <TableHead className="min-w-[200px]">Nama Barang</TableHead>
                    <TableHead className="min-w-[120px] text-right">Modal</TableHead>
                    <TableHead className="min-w-[120px] text-right">Jual</TableHead>
                    <TableHead className="min-w-[110px] text-right">Untung</TableHead>
                    <TableHead className="min-w-[90px] text-right">Selisih</TableHead>
                    <TableHead className="min-w-[160px]">Keterangan</TableHead>
                    {selectedCustomerId && <TableHead className="text-center w-[80px]">Aksi</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleBarang.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={selectedCustomerId ? 9 : 8} className="text-center py-10 text-slate-400 text-sm">
                        {selectedCustomerId ? 'Belum ada barang terdaftar untuk pelanggan ini — klik Tambah untuk mendaftarkan.' : 'Belum ada barang. Pilih pelanggan lalu klik Tambah.'}
                      </TableCell>
                    </TableRow>
                  )}
                  {visibleBarang.map((b, idx) => {
                    const untung = getUntung(b)
                    const pct = getSelisihPct(b)
                    return (
                      <TableRow
                        key={b.id}
                        className={cn(selectedCustomerId && 'cursor-pointer')}
                        onClick={() => selectedCustomerId && canEdit && openEdit(b)}
                      >
                        <TableCell className="text-center text-slate-400 text-xs">{idx + 1}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-200">{b.kode}</span>
                        </TableCell>
                        <TableCell className="font-medium text-slate-800 dark:text-slate-100">{b.nama}</TableCell>
                        <TableCell className="text-right text-slate-600 dark:text-slate-300">{formatRupiah(b.modal)}</TableCell>
                        <TableCell className="text-right font-semibold text-slate-800 dark:text-slate-100">{formatRupiah(getJual(b))}</TableCell>
                        <TableCell className={cn('text-right font-semibold', untung >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                          {formatRupiah(untung)}
                        </TableCell>
                        <TableCell className={cn('text-right text-xs font-semibold', pct >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                          {formatPercent(pct)}
                        </TableCell>
                        <TableCell className="text-slate-500 text-xs">{b.keterangan || '-'}</TableCell>
                        {selectedCustomerId && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center">
                              {canDelete && (
                                <button
                                  onClick={() => handleUnregister(b)}
                                  className="inline-flex items-center justify-center w-7 h-7 bg-red-50 hover:bg-red-100 text-red-600 rounded-md border border-red-200 transition-colors"
                                  title="Hapus dari daftar pelanggan"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-16 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-700">
              <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
            </div>
          )}
          {!loading && visibleBarang.length === 0 && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-700 p-8 text-center text-slate-400 text-sm">
              {selectedCustomerId ? 'Belum ada barang terdaftar untuk pelanggan ini.' : 'Belum ada barang. Pilih pelanggan lalu klik Tambah.'}
            </div>
          )}
          {!loading && visibleBarang.map(b => {
            const untung = getUntung(b)
            const pct = getSelisihPct(b)
            return (
              <div
                key={b.id}
                className={cn(
                  'bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-slate-200 dark:border-zinc-700 p-4',
                  selectedCustomerId && canEdit && 'cursor-pointer active:bg-slate-50'
                )}
                onClick={() => selectedCustomerId && canEdit && openEdit(b)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:text-slate-200">{b.kode}</span>
                    <p className="font-semibold text-slate-800 dark:text-slate-100 mt-1 truncate">{b.nama}</p>
                  </div>
                  {selectedCustomerId && canDelete && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleUnregister(b) }}
                      className="inline-flex items-center justify-center w-7 h-7 shrink-0 bg-red-50 hover:bg-red-100 text-red-600 rounded-md border border-red-200"
                      title="Hapus dari daftar pelanggan"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-slate-400">Modal</span><p className="font-medium text-slate-700 dark:text-slate-200">{formatRupiah(b.modal)}</p></div>
                  <div><span className="text-slate-400">Jual</span><p className="font-semibold text-slate-800 dark:text-slate-100">{formatRupiah(getJual(b))}</p></div>
                  <div><span className="text-slate-400">Untung</span><p className={cn('font-semibold', untung >= 0 ? 'text-emerald-600' : 'text-red-600')}>{formatRupiah(untung)}</p></div>
                  <div><span className="text-slate-400">Selisih</span><p className={cn('font-semibold', pct >= 0 ? 'text-emerald-600' : 'text-red-600')}>{formatPercent(pct)}</p></div>
                </div>
                {b.keterangan && <p className="mt-2 text-[11px] text-slate-500">{b.keterangan}</p>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Add dialog: checklist barang existing / barang baru */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tambah Barang</DialogTitle>
            <DialogDescription>
              Daftarkan barang untuk <span className="font-semibold">{selectedCustomer?.name || 'pelanggan'}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setAddMode('checklist')}
              className={cn(
                'flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors',
                addMode === 'checklist' ? 'bg-violet-600 text-white border-violet-600' : 'bg-card text-slate-600 border-slate-200'
              )}
            >
              Pilih Barang ({unregistered.length})
            </button>
            <button
              onClick={() => setAddMode('new')}
              className={cn(
                'flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors',
                addMode === 'new' ? 'bg-violet-600 text-white border-violet-600' : 'bg-card text-slate-600 border-slate-200'
              )}
            >
              Barang Baru
            </button>
          </div>

          {addMode === 'checklist' ? (
            <div className="space-y-2">
              {unregistered.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">Semua barang sudah terdaftar untuk pelanggan ini.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 p-2">
                  {unregistered.map(b => (
                    <label
                      key={b.id}
                      className="flex items-center gap-2.5 rounded-lg p-2 hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      <Checkbox
                        checked={checkedIds.has(b.id)}
                        onCheckedChange={(v) => {
                          setCheckedIds(prev => {
                            const next = new Set(prev)
                            if (v) next.add(b.id)
                            else next.delete(b.id)
                            return next
                          })
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{b.nama}</p>
                        <p className="text-[11px] text-slate-400">{b.kode} · Jual {formatRupiah(b.jual)}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nama Barang</Label>
                <Input value={newForm.nama} onChange={(e) => setNewForm(p => ({ ...p, nama: e.target.value }))} placeholder="cth: Brosur A4 Art Paper" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Modal</Label>
                  <Input type="number" min={0} value={newForm.modal} onChange={(e) => setNewForm(p => ({ ...p, modal: e.target.value }))} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Harga Jual</Label>
                  <Input type="number" min={0} value={newForm.jual} onChange={(e) => setNewForm(p => ({ ...p, jual: e.target.value }))} placeholder="0" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Keterangan</Label>
                <Input value={newForm.keterangan} onChange={(e) => setNewForm(p => ({ ...p, keterangan: e.target.value }))} placeholder="opsional" />
              </div>
              <p className="text-[11px] text-slate-400">Kode barang otomatis dibuat dari inisial perusahaan pelanggan & unik antar perusahaan.</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Batal</Button>
            {addMode === 'checklist' ? (
              <Button onClick={handleSaveChecklist} disabled={savingChecklist || checkedIds.size === 0} className="bg-violet-600 hover:bg-violet-700 text-white">
                {savingChecklist ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Daftarkan ({checkedIds.size})
              </Button>
            ) : (
              <Button onClick={handleSaveNew} disabled={savingNew || !newForm.nama.trim()} className="bg-violet-600 hover:bg-violet-700 text-white">
                {savingNew ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Simpan & Daftarkan
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog (hanya saat pelanggan dipilih) */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Barang</DialogTitle>
            <DialogDescription>
              {editing?.kode} — untuk <span className="font-semibold">{selectedCustomer?.name || 'pelanggan'}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nama Barang</Label>
              <Input value={editForm.nama} onChange={(e) => setEditForm(p => ({ ...p, nama: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Modal</Label>
                <Input type="number" min={0} value={editForm.modal} onChange={(e) => setEditForm(p => ({ ...p, modal: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Harga Jual ({selectedCustomer?.name || 'pelanggan'})</Label>
                <Input type="number" min={0} value={editForm.price} onChange={(e) => setEditForm(p => ({ ...p, price: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Keterangan</Label>
              <Input value={editForm.keterangan} onChange={(e) => setEditForm(p => ({ ...p, keterangan: e.target.value }))} placeholder="opsional" />
            </div>
            {editing && editForm.modal && Number(editForm.modal) > 0 && (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-2.5 text-xs text-emerald-700 dark:text-emerald-300">
                Untung: <span className="font-bold">{formatRupiah((Number(editForm.price) || 0) - Number(editForm.modal))}</span>
                {' '}({formatPercent(((Number(editForm.price) || 0) - Number(editForm.modal)) / Number(editForm.modal) * 100)})
              </div>
            )}
          </div>
          <DialogFooter className="sm:justify-between">
            {canDelete ? (
              <Button variant="ghost" onClick={handleDeleteBarang} disabled={deleting} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Hapus Barang
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Batal</Button>
              <Button onClick={handleSaveEdit} disabled={savingEdit} className="bg-violet-600 hover:bg-violet-700 text-white">
                {savingEdit && <Loader2 className="w-4 h-4 animate-spin" />} Simpan
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
