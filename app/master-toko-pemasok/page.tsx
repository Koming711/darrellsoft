'use client'

import { Store, Plus, Search, Phone, MapPin, Package, Loader2, EyeOff, DatabaseBackup, Upload, Printer, Pencil, Trash2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Button } from '@/components/ui/button'
import { DialogForm } from '@/components/dialog-form'
import { useLanguage } from '@/contexts/language-context'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from 'sonner'
import { getAuthUser } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'
import { hasSubPermission } from '@/lib/permissions'
import { notifyDataChange } from '@/lib/data-sync'
import { useDataChange } from '@/hooks/use-data-change'

interface TokoPemasok {
  id: string
  namaToko: string
  jenisBarang: string
  kontak: string
  alamat: string
  createdAt: string
  updatedAt: string
}

export default function MasterTokoPemasokPage() {
  const { t } = useLanguage()
  const currentUser = getAuthUser()
  const canAdd = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-toko-pemasok', 'master-toko-pemasok-tambah')
  const canEdit = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-toko-pemasok', 'master-toko-pemasok-edit')
  const canDelete = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-toko-pemasok', 'master-toko-pemasok-hapus')
  const canView = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-toko-pemasok', 'master-toko-pemasok-lihat') || canAdd || canEdit || canDelete

  const [searchTerm, setSearchTerm] = useState('')
  const [data, setData] = useState<TokoPemasok[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<TokoPemasok | null>(null)
  const [backupLoading, setBackupLoading] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  useDataChange(['toko-pemasok'], () => {
    fetchData()
  })

  const fetchData = async () => {
    try {
      const response = await authFetch('/api/toko-pemasok')
      const result = await response.json()
      setData(Array.isArray(result) ? result : [])
    } catch (error) {
      console.error('Error fetching toko pemasok:', error)
      toast.error('Gagal memuat data toko/pemasok')
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=800,width=1000')
    if (!printWindow) {
      toast.error('Gagal membuka jendela print')
      return
    }

    printWindow.document.write('<html><head><title>Master Toko/Pemasok</title>')
    printWindow.document.write(`
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
        h1 { text-align: center; margin-bottom: 20px; font-size: 18px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
        th { background-color: #f2f2f2; font-weight: bold; white-space: nowrap; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .right { text-align: right; }
        .center { text-align: center; }
        .footer { margin-top: 20px; font-size: 11px; color: #666; text-align: center; }
        @media print { body { padding: 0; } }
      </style>
    `)
    printWindow.document.write('</head><body>')

    printWindow.document.write('<h1>Master Toko/Pemasok</h1>')
    printWindow.document.write(`<p style="text-align: right; font-size: 11px; margin-bottom: 10px;">Dicetak: ${new Date().toLocaleString('id-ID')}</p>`)

    printWindow.document.write('<table>')
    printWindow.document.write('<thead>')
    printWindow.document.write('<tr>')
    printWindow.document.write('<th>No</th>')
    printWindow.document.write('<th>Nama Toko</th>')
    printWindow.document.write('<th>Jenis Barang</th>')
    printWindow.document.write('<th>Kontak</th>')
    printWindow.document.write('<th>Alamat</th>')
    printWindow.document.write('</tr>')
    printWindow.document.write('</thead>')
    printWindow.document.write('<tbody>')

    filteredData.forEach((item, index) => {
      printWindow.document.write(`
        <tr>
          <td>${index + 1}</td>
          <td>${item.namaToko}</td>
          <td>${item.jenisBarang || '-'}</td>
          <td>${item.kontak || '-'}</td>
          <td>${item.alamat || '-'}</td>
        </tr>
      `)
    })

    printWindow.document.write('</tbody></table>')
    printWindow.document.write('<div class="footer">Total Data: ' + filteredData.length + '</div>')
    printWindow.document.write('</body></html>')
    printWindow.document.close()

    setTimeout(() => {
      printWindow.print()
    }, 250)

    toast.success('Mencetak tabel...')
  }

  const handleBackup = async () => {
    setBackupLoading('backup')
    try {
      const res = await authFetch(`/api/database/backup-master?table=toko_pemasok`)
      if (!res.ok) {
        let errMsg = 'Gagal backup data toko/pemasok'
        try { const errData = await res.json(); errMsg = errData?.error || errMsg } catch {}
        toast.error(errMsg)
        return
      }
      const blob = await res.blob()
      if (blob.size === 0) {
        toast.error('Backup kosong — tidak ada data')
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = res.headers.get('Content-Disposition')
      const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
      a.download = match ? match[1] : `backup-toko-pemasok-${Date.now()}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Backup berhasil diunduh')
    } catch (e) { console.error('Backup error:', e); toast.error('Gagal backup data toko/pemasok') }
    setBackupLoading(null)
  }

  const handleRestore = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xlsx'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      if (!confirm('Data toko/pemasok yang ada akan diganti dengan data dari file backup. Lanjutkan?')) return
      setBackupLoading('restore')
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('table', 'toko_pemasok')
        const res = await authFetch('/api/database/restore-master', {
          method: 'POST',
          body: fd,
        })
        const data = await res.json()
        if (res.ok && data.success) {
          toast.success(`Restore berhasil (${data.count} data)`)
          fetchData()
          notifyDataChange('toko-pemasok')
        } else {
          toast.error(data.error || 'Gagal restore data toko/pemasok')
        }
      } catch { toast.error('File backup tidak valid') }
      setBackupLoading(null)
    }
    input.click()
  }

  const filteredData = data.filter(item =>
    item.namaToko.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.jenisBarang.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.kontak.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.alamat.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleAdd = () => {
    setEditingItem(null)
    setDialogOpen(true)
  }

  const handleEdit = (item: TokoPemasok) => {
    setEditingItem(item)
    setDialogOpen(true)
  }

  const handleDelete = async (item: TokoPemasok) => {
    if (confirm('Beneran mau dihapus nih?')) {
      try {
        const response = await authFetch(`/api/toko-pemasok/${item.id}`, {
          method: 'DELETE'
        })
        if (response.ok) {
          toast.success('Toko/Pemasok berhasil dihapus')
          setData(prev => prev.filter(d => d.id !== item.id))
          notifyDataChange('toko-pemasok')
        } else {
          toast.error('Gagal menghapus toko/pemasok')
        }
      } catch (error) {
        console.error('Error deleting toko pemasok:', error)
        toast.error('Gagal menghapus toko/pemasok')
      }
    }
  }

  const handleSave = async (formData: any) => {
    try {
      let response: Response
      if (editingItem) {
        response = await authFetch(`/api/toko-pemasok/${editingItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        })
      } else {
        response = await authFetch('/api/toko-pemasok', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        })
      }

      if (response.ok) {
        const saved = await response.json()
        toast.success(editingItem ? 'Toko/Pemasok berhasil diperbarui' : 'Toko/Pemasok berhasil ditambahkan')
        setDialogOpen(false)
        if (editingItem) {
          setData(prev => prev.map(d => d.id === saved.id ? saved : d))
        } else {
          setData(prev => [saved, ...prev])
        }
        notifyDataChange('toko-pemasok')
      } else {
        toast.error(editingItem ? 'Gagal memperbarui toko/pemasok' : 'Gagal menambahkan toko/pemasok')
      }
    } catch (error) {
      console.error('Error saving toko pemasok:', error)
      toast.error('Gagal menyimpan toko/pemasok')
    }
  }

  return (
    <DashboardLayout
      title={t('master_toko_pemasok')}
      subtitle={t('subtitle_master_toko_pemasok')}
    >
      {canView && (
      <div className="bg-card rounded-xl shadow-sm border border-slate-200">
        {/* Toolbar */}
        <div className="p-3 sm:p-4 border-b border-slate-200 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari toko/pemasok..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handlePrint} variant="outline" size="sm" className="h-9 gap-1.5 text-xs sm:h-auto sm:text-sm">
              <Printer className="w-3.5 h-3.5" />
              Cetak
            </Button>
            <Button onClick={handleBackup} variant="outline" size="sm" disabled={backupLoading === 'backup'} className="h-9 gap-1.5 text-xs sm:h-auto sm:text-sm">
              {backupLoading === 'backup' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DatabaseBackup className="w-3.5 h-3.5" />}
              Backup
            </Button>
            <Button onClick={handleRestore} variant="outline" size="sm" disabled={backupLoading === 'restore'} className="h-9 gap-1.5 text-xs sm:h-auto sm:text-sm">
              {backupLoading === 'restore' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Restore
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
              <Store className="w-12 h-12 text-slate-300 mb-3" />
              <p className="text-sm text-slate-500">Tidak ada data toko/pemasok ditemukan</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden lg:block overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[50px] text-center">#</TableHead>
                      <TableHead className="min-w-[200px]">Nama Toko</TableHead>
                      <TableHead className="min-w-[160px]">Jenis Barang</TableHead>
                      <TableHead className="min-w-[140px]">Kontak</TableHead>
                      <TableHead className="min-w-[200px]">Alamat</TableHead>
                      <TableHead className="text-center w-[100px]">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.map((item, idx) => (
                      <TableRow key={item.id} className="group">
                        <TableCell className="text-center text-slate-400 text-xs">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                              <Store className="w-4 h-4 text-emerald-600" />
                            </div>
                            <span className="font-medium text-slate-800">{item.namaToko}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {item.jenisBarang || <span className="text-slate-300">-</span>}
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {item.kontak || <span className="text-slate-300">-</span>}
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {item.alamat || <span className="text-slate-300">-</span>}
                        </TableCell>
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
              <div className="lg:hidden space-y-2">
                {filteredData.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5"
                  >
                    {/* Header */}
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                        <Store className="w-4.5 h-4.5 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm text-slate-800 truncate">{item.namaToko}</h3>
                        {item.jenisBarang && (
                          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <Package className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{item.jenisBarang}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Details */}
                    <div className="space-y-1.5 ml-12">
                      {item.kontak && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span className="text-xs text-slate-600">{item.kontak}</span>
                        </div>
                      )}
                      {item.alamat && (
                        <div className="flex items-start gap-2">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                          <span className="text-xs text-slate-600 line-clamp-2">{item.alamat}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
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
            </>
          )}
        </div>
      </div>
      )}

      {!canView && (
      <div className="bg-card rounded-xl shadow-sm border border-slate-200">
        <div className="p-4 lg:p-6 min-h-[600px] flex flex-col items-center justify-center text-slate-400">
          <EyeOff className="w-16 h-16 mb-4" />
          <p className="text-lg font-semibold text-slate-500">Akses Ditolak</p>
          <p className="text-sm mt-1">Anda tidak memiliki izin untuk melihat daftar toko/pemasok</p>
        </div>
      </div>
      )}

      {/* Add/Edit Dialog */}
      <DialogForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editingItem ? 'Edit Toko/Pemasok' : 'Tambah Toko/Pemasok Baru'}
        description={editingItem ? 'Edit informasi toko/pemasok' : 'Isi informasi toko/pemasok baru'}
        fields={[
          { name: 'namaToko', label: 'Nama Toko', type: 'text', placeholder: 'Nama toko/pemasok', required: true },
          { name: 'jenisBarang', label: 'Jenis Barang', type: 'text', placeholder: 'Contoh: Kertas, Tinta, dll', required: false },
          { name: 'kontak', label: 'Kontak', type: 'text', placeholder: '081234567890 (opsional)', required: false },
          { name: 'alamat', label: 'Alamat', type: 'text', placeholder: 'Alamat lengkap (opsional)', required: false }
        ]}
        initialData={editingItem ? {
          namaToko: editingItem.namaToko,
          jenisBarang: editingItem.jenisBarang || '',
          kontak: editingItem.kontak || '',
          alamat: editingItem.alamat || ''
        } : undefined}
        onSave={handleSave}
      />
    </DashboardLayout>
  )
}
