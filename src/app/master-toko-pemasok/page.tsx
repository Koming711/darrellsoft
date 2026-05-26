'use client'

import { Store, Plus, Search, Phone, MapPin, Package, Loader2, EyeOff } from 'lucide-react'
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
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
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
          {canAdd && (
            <Button onClick={handleAdd} className="w-full lg:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              Tambah Toko/Pemasok
            </Button>
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
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
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
