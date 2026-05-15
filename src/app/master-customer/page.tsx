'use client'

import { Users, Plus, Search, Mail, Phone, MapPin, Building2, Loader2, EyeOff } from 'lucide-react'
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

interface Customer {
  id: string
  name: string
  companyName: string | null
  address: string | null
  phone: string | null
  email: string | null
  createdAt: string
  updatedAt: string
}

export default function MasterCustomerPage() {
  const { t } = useLanguage()
  const currentUser = getAuthUser()
  const canAdd = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-customer', 'master-customer-tambah')
  const canEdit = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-customer', 'master-customer-edit')
  const canDelete = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-customer', 'master-customer-hapus')
  const canView = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-customer', 'master-customer-lihat') || canAdd || canEdit || canDelete

  const [searchTerm, setSearchTerm] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)

  useEffect(() => {
    fetchCustomers()
  }, [])

  useDataChange(['customers'], () => {
    fetchCustomers()
  })

  const fetchCustomers = async () => {
    try {
      const response = await authFetch('/api/customers')
      const data = await response.json()
      setCustomers(data)
    } catch (error) {
      console.error('Error fetching customers:', error)
      toast.error('Gagal memuat data customer')
    } finally {
      setLoading(false)
    }
  }

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (customer.companyName && customer.companyName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (customer.address && customer.address.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (customer.phone && customer.phone.includes(searchTerm)) ||
    (customer.email && customer.email.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const handleAdd = () => {
    setEditingCustomer(null)
    setDialogOpen(true)
  }

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer)
    setDialogOpen(true)
  }

  const handleDelete = async (customer: Customer) => {
    if (confirm('Beneran mau dihapus nih?')) {
      try {
        const response = await authFetch(`/api/customers/${customer.id}`, {
          method: 'DELETE'
        })
        if (response.ok) {
          toast.success('Customer berhasil dihapus')
          // Optimistic update: remove from state immediately
          setCustomers(prev => prev.filter(c => c.id !== customer.id))
          notifyDataChange('customers')
        } else {
          toast.error('Gagal menghapus customer')
        }
      } catch (error) {
        console.error('Error deleting customer:', error)
        toast.error('Gagal menghapus customer')
      }
    }
  }

  const handleSave = async (data: any) => {
    try {
      let response: Response
      if (editingCustomer) {
        response = await authFetch(`/api/customers/${editingCustomer.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
      } else {
        response = await authFetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
      }

      if (response.ok) {
        const savedCustomer = await response.json()
        toast.success(editingCustomer ? 'Customer berhasil diperbarui' : 'Customer berhasil ditambahkan')
        setDialogOpen(false)
        // Optimistic update: use API response data to update state immediately
        if (editingCustomer) {
          setCustomers(prev => prev.map(c => c.id === savedCustomer.id ? savedCustomer : c))
        } else {
          setCustomers(prev => [savedCustomer, ...prev])
        }
        notifyDataChange('customers')
      } else {
        toast.error(editingCustomer ? 'Gagal memperbarui customer' : 'Gagal menambahkan customer')
      }
    } catch (error) {
      console.error('Error saving customer:', error)
      toast.error('Gagal menyimpan customer')
    }
  }

  const columns = [
    {
      key: 'name',
      title: 'Nama',
      render: (customer: Customer) => (
        <div>
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div className="min-w-0">
              <span className="font-medium text-slate-800 truncate block">{customer.name}</span>
              {customer.companyName && (
                <span className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                  <Building2 className="w-3 h-3" />
                  {customer.companyName}
                </span>
              )}
            </div>
          </div>
        </div>
      )
    },
    {
      key: 'address',
      title: 'Alamat',
      render: (customer: Customer) => (
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm text-slate-600 truncate">{customer.address || '-'}</span>
        </div>
      )
    },
    {
      key: 'phone',
      title: 'Nomor Telp',
      render: (customer: Customer) => (
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm text-slate-600">{customer.phone || '-'}</span>
        </div>
      )
    },
    {
      key: 'email',
      title: 'Email',
      render: (customer: Customer) => (
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm text-slate-600 truncate">{customer.email || '-'}</span>
        </div>
      )
    }
  ]

  return (
    <DashboardLayout
      title={t('master_customer')}
      subtitle={t('subtitle_master_customer')}
    >
      {canView && (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        {/* Search & Add Button */}
        <div className="p-4 lg:p-6 border-b border-slate-200 space-y-4 lg:space-y-0 lg:flex lg:items-center lg:justify-between lg:gap-4">
          <div className="relative w-full lg:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 lg:w-5 lg:h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 lg:pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {canAdd && (
            <Button onClick={handleAdd} className="w-full lg:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              Tambah Customer
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
                data={filteredCustomers}
                columns={columns}
                keyField="id"
                onEdit={canEdit ? handleEdit : undefined}
                onDelete={canDelete ? handleDelete : undefined}
                showAsButtons={true}
                emptyMessage="Tidak ada data customer ditemukan"
                emptyIcon={<Users className="w-16 h-16 mx-auto text-slate-400" />}
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
          <p className="text-sm mt-1">Anda tidak memiliki izin untuk melihat daftar customer</p>
        </div>
      </div>
      )}

      {/* Add/Edit Dialog */}
      <DialogForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editingCustomer ? 'Edit Customer' : 'Tambah Customer Baru'}
        description={editingCustomer ? 'Edit informasi customer' : 'Isi informasi customer baru'}
        fields={[
          { name: 'name', label: 'Nama Customer', type: 'text', placeholder: 'Nama kontak/person', required: true },
          { name: 'companyName', label: 'Perusahaan', type: 'text', placeholder: 'Nama perusahaan (opsional)', required: false },
          { name: 'address', label: 'Alamat', type: 'text', placeholder: 'Alamat lengkap (opsional)', required: false },
          { name: 'phone', label: 'Nomor Telp', type: 'text', placeholder: '081234567890 (opsional)', required: false },
          { name: 'email', label: 'Email', type: 'email', placeholder: 'email@contoh.com (opsional)', required: false }
        ]}
        initialData={editingCustomer ? {
          name: editingCustomer.name,
          companyName: editingCustomer.companyName || '',
          address: editingCustomer.address || '',
          phone: editingCustomer.phone || '',
          email: editingCustomer.email || ''
        } : undefined}
        onSave={handleSave}
      />
    </DashboardLayout>
  )
}
