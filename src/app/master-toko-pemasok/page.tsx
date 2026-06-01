'use client'

import { Store, Plus, Search, Phone, MapPin, Package, Loader2, EyeOff, DatabaseBackup, Upload, Printer } from 'lucide-react'
import { useState, useEffect } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { MobileTable } from '@/components/mobile-table'
import { Button } from '@/components/ui/button'
import { DialogForm } from '@/components/dialog-form'
import { useLanguage } from '@/contexts/language-context'
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

  const columns = [
    {
      key: 'namaToko',
      title: 'Nama Toko',
      render: (item: TokoPemasok) => (
        <div className="flex items-center gap-3">
          <Store className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <span className="font-medium text-slate-800 truncate">{item.namaToko}</span>
        </div>
      )
    },
    {
      key: 'jenisBarang',
      title: 'Jenis Barang',
      render: (item: TokoPemasok) => (
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm text-slate-600 truncate">{item.jenisBarang || '-'}</span>
        </div>
      )
    },
    {
      key: 'kontak',
      title: 'Kontak',
      render: (item: TokoPemasok) => (
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm text-slate-600">{item.kontak || '-'}</span>
        </div>
      )
    },
    {
      key: 'alamat',
      title: 'Alamat',
      render: (item: TokoPemasok) => (
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm text-slate-600 truncate">{item.alamat || '-'}</span>
        </div>
      )
    }
  ]

  return (
    <DashboardLayout
      title={t('master_toko_pemasok')}
      subtitle={t('subtitle_master_toko_pemasok')}
    >
      {canView && (
      <div className="bg-card rounded-xl shadow-sm border border-slate-200">
        {/* Search & Add Button */}
        <div className="p-4 lg:p-6 border-b border-slate-200 space-y-4 lg:space-y-0 lg:flex lg:items-center lg:justify-between lg:gap-4">
          <div className="relative w-full lg:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 lg:w-5 lg:h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari toko/pemasok..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 lg:pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {canView && (
            <div className="flex gap-2 w-full lg:w-auto">
              <Button onClick={handlePrint} variant="outline" className="flex-1 lg:flex-none">
                <Printer className="w-4 h-4 mr-2" />
                Cetak Tabel
              </Button>
              <Button onClick={handleBackup} variant="outline" disabled={backupLoading === 'backup'} className="flex-1 lg:flex-none">
                {backupLoading === 'backup' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DatabaseBackup className="w-4 h-4 mr-2" />}
                Backup
              </Button>
              <Button onClick={handleRestore} variant="outline" disabled={backupLoading === 'restore'} className="flex-1 lg:flex-none">
                {backupLoading === 'restore' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Restore
              </Button>
              {canAdd && (
                <Button onClick={handleAdd} className="flex-1 lg:flex-none">
                  <Plus className="w-4 h-4 mr-2" />
                  Tambah Toko/Pemasok
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        <div className="p-4 lg:p-6 min-h-[600px]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <div className="w-full">
              <MobileTable
                data={filteredData}
                columns={columns}
                keyField="id"
                onEdit={canEdit ? handleEdit : undefined}
                onDelete={canDelete ? handleDelete : undefined}
                showAsButtons={true}
                emptyMessage="Tidak ada data toko/pemasok ditemukan"
                emptyIcon={<Store className="w-16 h-16 mx-auto text-slate-400" />}
              />
            </div>
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
