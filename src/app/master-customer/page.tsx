'use client'

import { Users, Plus, Search, Mail, Phone, MapPin, Building2, Loader2, EyeOff, DatabaseBackup, Upload, Printer, Pencil, Trash2 } from 'lucide-react'
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
  const [backupLoading, setBackupLoading] = useState<string | null>(null)

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

  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=800,width=1000')
    if (!printWindow) {
      toast.error('Gagal membuka jendela print')
      return
    }

    printWindow.document.write('<html><head><title>Master Customer</title>')
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

    printWindow.document.write('<h1>Master Customer</h1>')
    printWindow.document.write(`<p style="text-align: right; font-size: 11px; margin-bottom: 10px;">Dicetak: ${new Date().toLocaleString('id-ID')}</p>`)

    printWindow.document.write('<table>')
    printWindow.document.write('<thead>')
    printWindow.document.write('<tr>')
    printWindow.document.write('<th>No</th>')
    printWindow.document.write('<th>Nama</th>')
    printWindow.document.write('<th>Perusahaan</th>')
    printWindow.document.write('<th>Alamat</th>')
    printWindow.document.write('<th>Nomor Telp</th>')
    printWindow.document.write('<th>Email</th>')
    printWindow.document.write('</tr>')
    printWindow.document.write('</thead>')
    printWindow.document.write('<tbody>')

    filteredCustomers.forEach((c, index) => {
      printWindow.document.write(`
        <tr>
          <td>${index + 1}</td>
          <td>${c.name}</td>
          <td>${c.companyName || '-'}</td>
          <td>${c.address || '-'}</td>
          <td>${c.phone || '-'}</td>
          <td>${c.email || '-'}</td>
        </tr>
      `)
    })

    printWindow.document.write('</tbody></table>')
    printWindow.document.write('<div class="footer">Total Data: ' + filteredCustomers.length + '</div>')
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
      const res = await authFetch(`/api/database/backup-master?table=customer`)
      if (!res.ok) {
        let errMsg = 'Gagal backup data customer'
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
      a.download = match ? match[1] : `backup-customer-${Date.now()}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Backup berhasil diunduh')
    } catch (e) { console.error('Backup error:', e); toast.error('Gagal backup data customer') }
    setBackupLoading(null)
  }

  const handleRestore = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xlsx'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      if (!confirm('Data customer yang ada akan diganti dengan data dari file backup. Lanjutkan?')) return
      setBackupLoading('restore')
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('table', 'customer')
        const res = await authFetch('/api/database/restore-master', {
          method: 'POST',
          body: fd,
        })
        const data = await res.json()
        if (res.ok && data.success) {
          toast.success(`Restore berhasil (${data.count} data)`)
          fetchCustomers()
          notifyDataChange('customers')
        } else {
          toast.error(data.error || 'Gagal restore data customer')
        }
      } catch { toast.error('File backup tidak valid') }
      setBackupLoading(null)
    }
    input.click()
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

  return (
    <DashboardLayout
      title={t('master_customer')}
      subtitle={t('subtitle_master_customer')}
    >
      {canView && (
      <div className="bg-card rounded-xl shadow-sm border border-slate-200">
        {/* Toolbar */}
        <div className="p-3 sm:p-4 border-b border-slate-200 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari customer..."
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
          ) : filteredCustomers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="w-12 h-12 text-slate-300 mb-3" />
              <p className="text-sm text-slate-500">Tidak ada data customer ditemukan</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden lg:block overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[50px] text-center">#</TableHead>
                      <TableHead className="min-w-[200px]">Nama</TableHead>
                      <TableHead className="min-w-[160px]">Perusahaan</TableHead>
                      <TableHead className="min-w-[200px]">Alamat</TableHead>
                      <TableHead className="min-w-[140px]">Nomor Telp</TableHead>
                      <TableHead className="min-w-[180px]">Email</TableHead>
                      <TableHead className="text-center w-[100px]">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCustomers.map((customer, idx) => (
                      <TableRow key={customer.id} className="group">
                        <TableCell className="text-center text-slate-400 text-xs">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                              <Users className="w-4 h-4 text-blue-600" />
                            </div>
                            <span className="font-medium text-slate-800">{customer.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {customer.companyName || <span className="text-slate-300">-</span>}
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {customer.address || <span className="text-slate-300">-</span>}
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {customer.phone || <span className="text-slate-300">-</span>}
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {customer.email || <span className="text-slate-300">-</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-0.5">
                            {canEdit && (
                              <Button variant="ghost" size="sm" onClick={() => handleEdit(customer)} className="h-7 w-7 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(customer)} className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50">
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
                {filteredCustomers.map((customer) => (
                  <div
                    key={customer.id}
                    className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5"
                  >
                    {/* Header */}
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <Users className="w-4.5 h-4.5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm text-slate-800 truncate">{customer.name}</h3>
                        {customer.companyName && (
                          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <Building2 className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{customer.companyName}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Details */}
                    <div className="space-y-1.5 ml-12">
                      {customer.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span className="text-xs text-slate-600">{customer.phone}</span>
                        </div>
                      )}
                      {customer.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span className="text-xs text-slate-600 truncate">{customer.email}</span>
                        </div>
                      )}
                      {customer.address && (
                        <div className="flex items-start gap-2">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                          <span className="text-xs text-slate-600 line-clamp-2">{customer.address}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {(canEdit || canDelete) && (
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-100 ml-12">
                        {canEdit && (
                          <button
                            onClick={() => handleEdit(customer)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors active:scale-95"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(customer)}
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
        // Enable "Pick from Contacts" button only when adding a new customer (mobile only, auto-detected)
        contactPicker={!editingCustomer ? {
          nameField: 'name',
          telField: 'phone',
          emailField: 'email'
        } : undefined}
        onSave={handleSave}
      />
    </DashboardLayout>
  )
}
