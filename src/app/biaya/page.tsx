'use client'

import { useState, useEffect, useMemo } from 'react'
import { Banknote, Plus, Search, Printer, Pencil, Trash2, Loader2, Wallet, CalendarDays, TrendingDown, Receipt, Store } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { notifyDataChange } from '@/lib/data-sync'
import { useDataChange } from '@/hooks/use-data-change'
import { useLanguage } from '@/contexts/language-context'

interface Biaya {
  id: string
  tanggal: string
  kategori: string
  keterangan: string
  jumlah: number
  metodePembayaran: string
  supplier: string
  createdAt: string
  updatedAt: string
}

const KATEGORI_OPTIONS = [
  'Listrik',
  'Air',
  'Tinta',
  'Kertas',
  'Gaji',
  'Sewa',
  'Transportasi',
  'Packing',
  'Ongkir',
  'ATK',
  'Maintenance',
  'Internet',
  'Telepon',
  'Lainnya',
]

const METODE_OPTIONS = ['Tunai', 'Transfer', 'Kartu', 'QRIS', 'Lainnya']

function formatRupiah(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0)
}

function formatDateID(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

function todayISO(): string {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}

export default function BiayaPage() {
  const { t } = useLanguage()
  const currentUser = getAuthUser()
  const canAdd = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'biaya', 'biaya-tambah')
  const canEdit = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'biaya', 'biaya-edit')
  const canDelete = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'biaya', 'biaya-hapus')
  const canView = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'biaya', 'biaya-lihat') || canAdd || canEdit || canDelete

  const [searchTerm, setSearchTerm] = useState('')
  const [filterMonth, setFilterMonth] = useState('') // YYYY-MM
  const [data, setData] = useState<Biaya[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Biaya | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [form, setForm] = useState({
    tanggal: todayISO(),
    kategori: 'Listrik',
    keterangan: '',
    jumlah: '',
    metodePembayaran: 'Tunai',
    supplier: '',
  })

  useEffect(() => {
    fetchData()
  }, [])

  useDataChange(['biaya'], () => {
    fetchData()
  })

  const fetchData = async () => {
    try {
      const response = await authFetch('/api/biaya')
      const result = await response.json()
      setData(Array.isArray(result) ? result : [])
    } catch (error) {
      console.error('Error fetching biaya:', error)
      toast.error('Gagal memuat data biaya')
    } finally {
      setLoading(false)
    }
  }

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchesSearch =
        item.kategori.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.keterangan.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.supplier.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.metodePembayaran.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesMonth = !filterMonth || item.tanggal.startsWith(filterMonth)
      return matchesSearch && matchesMonth
    })
  }, [data, searchTerm, filterMonth])

  const stats = useMemo(() => {
    const now = new Date()
    const ymNow = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const yNow = String(now.getFullYear())
    let totalBulanIni = 0
    let totalTahunIni = 0
    let totalKeseluruhan = 0
    for (const item of data) {
      totalKeseluruhan += item.jumlah || 0
      if (item.tanggal.startsWith(ymNow)) totalBulanIni += item.jumlah || 0
      if (item.tanggal.startsWith(yNow)) totalTahunIni += item.jumlah || 0
    }
    return { totalBulanIni, totalTahunIni, totalKeseluruhan, count: data.length }
  }, [data])

  const handleAdd = () => {
    setEditingItem(null)
    setForm({
      tanggal: todayISO(),
      kategori: 'Listrik',
      keterangan: '',
      jumlah: '',
      metodePembayaran: 'Tunai',
      supplier: '',
    })
    setDialogOpen(true)
  }

  const handleEdit = (item: Biaya) => {
    setEditingItem(item)
    setForm({
      tanggal: item.tanggal,
      kategori: item.kategori,
      keterangan: item.keterangan || '',
      jumlah: String(item.jumlah),
      metodePembayaran: item.metodePembayaran || 'Tunai',
      supplier: item.supplier || '',
    })
    setDialogOpen(true)
  }

  const handleDelete = async (item: Biaya) => {
    if (!confirm('Yakin mau hapus data biaya ini?')) return
    try {
      const response = await authFetch(`/api/biaya/${item.id}`, { method: 'DELETE' })
      if (response.ok) {
        toast.success('Biaya berhasil dihapus')
        setData(prev => prev.filter(d => d.id !== item.id))
        notifyDataChange('biaya')
      } else {
        toast.error('Gagal menghapus biaya')
      }
    } catch (error) {
      console.error('Error deleting biaya:', error)
      toast.error('Gagal menghapus biaya')
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSaving) return
    const jumlahNum = parseFloat(String(form.jumlah).replace(/[^\d.-]/g, '')) || 0
    if (!form.tanggal) { toast.error('Tanggal wajib diisi'); return }
    if (!form.kategori.trim()) { toast.error('Kategori wajib diisi'); return }
    if (!jumlahNum || jumlahNum <= 0) { toast.error('Jumlah harus lebih dari 0'); return }

    setIsSaving(true)
    try {
      const payload = {
        tanggal: form.tanggal,
        kategori: form.kategori.trim(),
        keterangan: form.keterangan.trim(),
        jumlah: jumlahNum,
        metodePembayaran: form.metodePembayaran,
        supplier: form.supplier.trim(),
      }
      let response: Response
      if (editingItem) {
        response = await authFetch(`/api/biaya/${editingItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
      } else {
        response = await authFetch('/api/biaya', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
      }

      if (response.ok) {
        const saved = await response.json()
        toast.success(editingItem ? 'Biaya berhasil diperbarui' : 'Biaya berhasil ditambahkan')
        setDialogOpen(false)
        if (editingItem) {
          setData(prev => prev.map(d => d.id === saved.id ? saved : d))
        } else {
          setData(prev => [saved, ...prev])
        }
        notifyDataChange('biaya')
      } else {
        const errData = await response.json().catch(() => ({}))
        toast.error(errData?.error || 'Gagal menyimpan biaya')
      }
    } catch (error) {
      console.error('Error saving biaya:', error)
      toast.error('Gagal menyimpan biaya')
    } finally {
      setIsSaving(false)
    }
  }

  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=800,width=1000')
    if (!printWindow) {
      toast.error('Gagal membuka jendela print')
      return
    }

    printWindow.document.write('<html><head><title>Laporan Biaya</title>')
    printWindow.document.write(`
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
        h1 { text-align: center; margin-bottom: 4px; font-size: 18px; }
        .meta { text-align: right; font-size: 11px; color: #666; margin-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
        th { background-color: #f2f2f2; font-weight: bold; white-space: nowrap; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .right { text-align: right; }
        .center { text-align: center; }
        .footer { margin-top: 20px; font-size: 11px; color: #666; }
        .grand { font-weight: bold; background-color: #fef9c3; }
        @media print { body { padding: 0; } }
      </style>
    `)
    printWindow.document.write('</head><body>')

    printWindow.document.write('<h1>Laporan Biaya Operasional</h1>')
    printWindow.document.write(`<div class="meta">Dicetak: ${new Date().toLocaleString('id-ID')}${filterMonth ? ` | Periode: ${filterMonth}` : ''}</div>`)

    printWindow.document.write('<table>')
    printWindow.document.write('<thead>')
    printWindow.document.write('<tr>')
    printWindow.document.write('<th>No</th>')
    printWindow.document.write('<th>Tanggal</th>')
    printWindow.document.write('<th>Kategori</th>')
    printWindow.document.write('<th>Keterangan</th>')
    printWindow.document.write('<th>Supplier</th>')
    printWindow.document.write('<th>Metode</th>')
    printWindow.document.write('<th class="right">Jumlah</th>')
    printWindow.document.write('</tr>')
    printWindow.document.write('</thead>')
    printWindow.document.write('<tbody>')

    let total = 0
    filteredData.forEach((item, index) => {
      total += item.jumlah || 0
      printWindow.document.write(`
        <tr>
          <td>${index + 1}</td>
          <td>${formatDateID(item.tanggal)}</td>
          <td>${item.kategori}</td>
          <td>${item.keterangan || '-'}</td>
          <td>${item.supplier || '-'}</td>
          <td>${item.metodePembayaran || '-'}</td>
          <td class="right">${formatRupiah(item.jumlah)}</td>
        </tr>
      `)
    })

    printWindow.document.write(`<tr class="grand"><td colspan="6" class="right">TOTAL</td><td class="right">${formatRupiah(total)}</td></tr>`)
    printWindow.document.write('</tbody></table>')
    printWindow.document.write(`<div class="footer">Total Data: ${filteredData.length} | Total Biaya: ${formatRupiah(total)}</div>`)
    printWindow.document.write('</body></html>')
    printWindow.document.close()

    setTimeout(() => {
      printWindow.print()
    }, 250)

    toast.success('Mencetak laporan biaya...')
  }

  const summaryCards = [
    { label: 'Bulan Ini', value: formatRupiah(stats.totalBulanIni), icon: CalendarDays, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Tahun Ini', value: formatRupiah(stats.totalTahunIni), icon: TrendingDown, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Total Keseluruhan', value: formatRupiah(stats.totalKeseluruhan), icon: Wallet, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Jumlah Transaksi', value: String(stats.count), icon: Receipt, color: 'text-purple-600', bg: 'bg-purple-50' },
  ]

  return (
    <DashboardLayout
      title={t('biaya')}
      subtitle={t('subtitle_biaya')}
    >
      {canView && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {summaryCards.map((card, idx) => (
              <div key={idx} className="bg-card rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center flex-shrink-0`}>
                    <card.icon className={`w-4.5 h-4.5 ${card.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-slate-500 truncate">{card.label}</p>
                    <p className="text-sm sm:text-base font-bold text-slate-800 truncate">{card.value}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-card rounded-xl shadow-sm border border-slate-200">
            {/* Toolbar */}
            <div className="p-3 sm:p-4 border-b border-slate-200 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-4">
              <div className="flex flex-1 flex-col sm:flex-row gap-2 sm:gap-3 sm:max-w-2xl">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari kategori, keterangan, supplier..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <input
                  type="month"
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-44"
                />
                {filterMonth && (
                  <Button onClick={() => setFilterMonth('')} variant="outline" size="sm" className="h-9">
                    Reset
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={handlePrint} variant="outline" size="sm" className="h-9 gap-1.5 text-xs sm:h-auto sm:text-sm">
                  <Printer className="w-3.5 h-3.5" />
                  Cetak
                </Button>
                {canAdd && (
                  <Button onClick={handleAdd} size="sm" className="h-9 gap-1.5 text-xs sm:h-auto sm:text-sm">
                    <Plus className="w-3.5 h-3.5" />
                    Tambah
                  </Button>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="p-3 sm:p-4">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                </div>
              ) : filteredData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Banknote className="w-12 h-12 text-slate-300 mb-3" />
                  <p className="text-sm text-slate-500">
                    {searchTerm || filterMonth ? 'Tidak ada data biaya sesuai filter' : 'Belum ada data biaya. Klik "Tambah" untuk menambahkan.'}
                  </p>
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden lg:block overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-[50px] text-center">#</TableHead>
                          <TableHead className="min-w-[110px]">Tanggal</TableHead>
                          <TableHead className="min-w-[130px]">Kategori</TableHead>
                          <TableHead className="min-w-[200px]">Keterangan</TableHead>
                          <TableHead className="min-w-[140px]">Supplier</TableHead>
                          <TableHead className="min-w-[110px]">Metode</TableHead>
                          <TableHead className="min-w-[130px] text-right">Jumlah</TableHead>
                          <TableHead className="text-center w-[100px]">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredData.map((item, idx) => (
                          <TableRow key={item.id} className="group">
                            <TableCell className="text-center text-slate-400 text-xs">{idx + 1}</TableCell>
                            <TableCell className="text-slate-600 whitespace-nowrap">{formatDateID(item.tanggal)}</TableCell>
                            <TableCell>
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium">
                                {item.kategori}
                              </span>
                            </TableCell>
                            <TableCell className="text-slate-600">
                              {item.keterangan || <span className="text-slate-300">-</span>}
                            </TableCell>
                            <TableCell className="text-slate-600">
                              {item.supplier ? (
                                <span className="flex items-center gap-1">
                                  <Store className="w-3 h-3 text-slate-400" />
                                  {item.supplier}
                                </span>
                              ) : <span className="text-slate-300">-</span>}
                            </TableCell>
                            <TableCell className="text-slate-600">{item.metodePembayaran || '-'}</TableCell>
                            <TableCell className="text-right font-semibold text-slate-800 whitespace-nowrap">{formatRupiah(item.jumlah)}</TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-0.5">
                                {canEdit && (
                                  <Button variant="ghost" size="sm" onClick={() => handleEdit(item)} className="h-7 w-7 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                {canDelete && (
                                  <Button variant="ghost" size="sm" onClick={() => handleDelete(item)} className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="lg:hidden space-y-2 max-h-[70vh] overflow-y-auto">
                    {filteredData.map((item) => (
                      <div
                        key={item.id}
                        className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                              <Banknote className="w-4.5 h-4.5 text-amber-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="font-semibold text-sm text-slate-800">{item.kategori}</h3>
                              <p className="text-xs text-slate-500">{formatDateID(item.tanggal)}</p>
                            </div>
                          </div>
                          <span className="font-bold text-sm text-slate-800 whitespace-nowrap">{formatRupiah(item.jumlah)}</span>
                        </div>

                        {item.keterangan && (
                          <p className="text-xs text-slate-600 ml-12 -mt-1">{item.keterangan}</p>
                        )}

                        <div className="flex flex-wrap items-center gap-2 ml-12 text-xs text-slate-500">
                          {item.supplier && (
                            <span className="inline-flex items-center gap-1">
                              <Store className="w-3 h-3" />
                              {item.supplier}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 rounded">
                            {item.metodePembayaran}
                          </span>
                        </div>

                        {(canEdit || canDelete) && (
                          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 ml-12">
                            {canEdit && (
                              <button
                                onClick={() => handleEdit(item)}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors active:scale-95"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                Edit
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => handleDelete(item)}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors active:scale-95"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Hapus
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Footer total */}
                  <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between text-sm">
                    <span className="text-slate-500">Total {filteredData.length} transaksi</span>
                    <span className="font-bold text-slate-800">
                      {formatRupiah(filteredData.reduce((s, i) => s + (i.jumlah || 0), 0))}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {!canView && (
        <div className="bg-card rounded-xl shadow-sm border border-slate-200">
          <div className="p-4 lg:p-6 min-h-[600px] flex flex-col items-center justify-center text-slate-400">
            <Banknote className="w-16 h-16 mb-4" />
            <p className="text-lg font-semibold text-slate-500">Akses Ditolak</p>
            <p className="text-sm mt-1">Anda tidak memiliki izin untuk melihat daftar biaya</p>
          </div>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Biaya' : 'Tambah Biaya Baru'}</DialogTitle>
            <DialogDescription>{editingItem ? 'Edit informasi biaya operasional' : 'Catat pengeluaran biaya operasional'}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave}>
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-1.5 sm:gap-4">
                <Label htmlFor="tanggal" className="sm:text-right">Tanggal <span className="text-red-500">*</span></Label>
                <Input
                  id="tanggal"
                  type="date"
                  required
                  value={form.tanggal}
                  onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
                  className="sm:col-span-3"
                  disabled={isSaving}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-1.5 sm:gap-4">
                <Label htmlFor="kategori" className="sm:text-right">Kategori <span className="text-red-500">*</span></Label>
                <select
                  id="kategori"
                  required
                  value={form.kategori}
                  onChange={(e) => setForm({ ...form, kategori: e.target.value })}
                  className="sm:col-span-3 h-9 w-full rounded-md border border-slate-300 bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isSaving}
                >
                  {KATEGORI_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
                  {editingItem && !KATEGORI_OPTIONS.includes(editingItem.kategori) && (
                    <option value={editingItem.kategori}>{editingItem.kategori}</option>
                  )}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-1.5 sm:gap-4">
                <Label htmlFor="jumlah" className="sm:text-right">Jumlah (Rp) <span className="text-red-500">*</span></Label>
                <Input
                  id="jumlah"
                  type="number"
                  required
                  min="0"
                  step="any"
                  placeholder="0"
                  value={form.jumlah}
                  onChange={(e) => setForm({ ...form, jumlah: e.target.value })}
                  className="sm:col-span-3"
                  disabled={isSaving}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-1.5 sm:gap-4">
                <Label htmlFor="metodePembayaran" className="sm:text-right">Metode Bayar</Label>
                <select
                  id="metodePembayaran"
                  value={form.metodePembayaran}
                  onChange={(e) => setForm({ ...form, metodePembayaran: e.target.value })}
                  className="sm:col-span-3 h-9 w-full rounded-md border border-slate-300 bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isSaving}
                >
                  {METODE_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-1.5 sm:gap-4">
                <Label htmlFor="supplier" className="sm:text-right">Supplier</Label>
                <Input
                  id="supplier"
                  type="text"
                  placeholder="Nama supplier/vendor (opsional)"
                  value={form.supplier}
                  onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                  className="sm:col-span-3"
                  disabled={isSaving}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-1.5 sm:gap-4">
                <Label htmlFor="keterangan" className="sm:text-right">Keterangan</Label>
                <Input
                  id="keterangan"
                  type="text"
                  placeholder="Catatan tambahan (opsional)"
                  value={form.keterangan}
                  onChange={(e) => setForm({ ...form, keterangan: e.target.value })}
                  className="sm:col-span-3"
                  disabled={isSaving}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
                Batal
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menyimpan...</> : 'Simpan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
