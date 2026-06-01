'use client'

import { useState, useEffect } from 'react'
import { Layers, Plus, Search, Printer, Pencil, Trash2, Loader2, DatabaseBackup, Upload } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { MobileTable } from '@/components/mobile-table'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { useLanguage } from '@/contexts/language-context'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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

interface Finishing {
  id: string
  name: string
  minimumSheets: number
  minimumPrice: number
  additionalPrice: number
  pricePerCm: number
  createdAt: string
  updatedAt: string
}

export default function MasterFinishingPage() {
  const { t } = useLanguage()
  const currentUser = getAuthUser()
  const canAdd = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-finishing', 'master-finishing-tambah')
  const canEdit = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-finishing', 'master-finishing-edit')
  const canDelete = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-finishing', 'master-finishing-hapus')

  const [searchTerm, setSearchTerm] = useState('')
  const [finishings, setFinishings] = useState<Finishing[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingFinishing, setEditingFinishing] = useState<Finishing | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    minimumSheets: '',
    minimumPrice: '',
    additionalPrice: '',
    pricePerCm: '',
    optMinimumSheets: false,
    optMinimumPrice: false,
    optAdditionalPrice: false,
    optPricePerCm: false,
  })
  const [backupLoading, setBackupLoading] = useState<string | null>(null)

  useEffect(() => {
    fetchFinishings()
  }, [])

  useDataChange(['finishings'], () => {
    fetchFinishings()
  })

  const fetchFinishings = async () => {
    setIsLoading(true)
    try {
      const response = await authFetch('/api/finishings')
      const data = await response.json()

      if (Array.isArray(data)) {
        setFinishings(data)
      } else {
        console.error('API did not return an array:', data)
        setFinishings([])
      }
    } catch (error) {
      console.error('Error fetching finishings:', error)
      setFinishings([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleBackup = async () => {
    setBackupLoading('backup')
    try {
      const res = await authFetch(`/api/database/backup-master?table=finishing`)
      if (!res.ok) {
        let errMsg = 'Gagal backup data finishing'
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
      a.download = match ? match[1] : `backup-finishing-${Date.now()}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Backup berhasil diunduh')
    } catch (e) { console.error('Backup error:', e); toast.error('Gagal backup data finishing') }
    setBackupLoading(null)
  }

  const handleRestore = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xlsx'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      if (!confirm('Data finishing yang ada akan diganti dengan data dari file backup. Lanjutkan?')) return
      setBackupLoading('restore')
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('table', 'finishing')
        const res = await authFetch('/api/database/restore-master', {
          method: 'POST',
          body: fd,
        })
        const data = await res.json()
        if (res.ok && data.success) {
          toast.success(`Restore berhasil (${data.count} data)`)
          fetchFinishings()
          notifyDataChange('finishings')
        } else {
          toast.error(data.error || 'Gagal restore data finishing')
        }
      } catch { toast.error('File backup tidak valid') }
      setBackupLoading(null)
    }
    input.click()
  }

  const filteredFinishings = Array.isArray(finishings) ? finishings.filter(finishing =>
    finishing.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) : []

  const handleAdd = () => {
    setEditingFinishing(null)
    setFormData({
      name: '',
      minimumSheets: '',
      minimumPrice: '',
      additionalPrice: '',
      pricePerCm: '',
      optMinimumSheets: false,
      optMinimumPrice: false,
      optAdditionalPrice: false,
      optPricePerCm: false,
    })
    setDialogOpen(true)
  }

  const handleEdit = (finishing: Finishing) => {
    setEditingFinishing(finishing)
    setFormData({
      name: finishing.name,
      minimumSheets: finishing.minimumSheets.toString(),
      minimumPrice: finishing.minimumPrice.toString(),
      additionalPrice: finishing.additionalPrice.toString(),
      pricePerCm: finishing.pricePerCm.toString(),
      optMinimumSheets: finishing.minimumSheets > 0,
      optMinimumPrice: finishing.minimumPrice > 0,
      optAdditionalPrice: finishing.additionalPrice > 0,
      optPricePerCm: finishing.pricePerCm > 0,
    })
    setDialogOpen(true)
  }

  const handleDelete = async (finishing: Finishing) => {
    if (confirm('Beneran mau dihapus nih?')) {
      try {
        const response = await authFetch(`/api/finishings/${finishing.id}`, {
          method: 'DELETE'
        })
        if (response.ok) {
          toast.success('Finishing berhasil dihapus')
          // Optimistic update: remove from state immediately
          setFinishings(prev => prev.filter(f => f.id !== finishing.id))
          notifyDataChange('finishings')
        } else {
          toast.error('Gagal menghapus finishing')
        }
      } catch (error) {
        console.error('Error deleting finishing:', error)
        toast.error('Gagal menghapus finishing')
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const payload = {
        name: formData.name,
        minimumSheets: formData.optMinimumSheets ? (parseFloat(formData.minimumSheets) || 0) : 0,
        minimumPrice: formData.optMinimumPrice ? (parseFloat(formData.minimumPrice) || 0) : 0,
        additionalPrice: formData.optAdditionalPrice ? (parseFloat(formData.additionalPrice) || 0) : 0,
        pricePerCm: formData.optPricePerCm ? (parseFloat(formData.pricePerCm) || 0) : 0,
      }

      const url = editingFinishing
        ? `/api/finishings/${editingFinishing.id}`
        : '/api/finishings'

      const method = editingFinishing ? 'PUT' : 'POST'

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Gagal menyimpan finishing')
        return
      }

      const savedFinishing = await res.json()
      toast.success(editingFinishing ? 'Finishing berhasil diperbarui' : 'Finishing berhasil ditambahkan')
      setDialogOpen(false)
      // Optimistic update: use API response data to update state immediately
      if (editingFinishing) {
        setFinishings(prev => prev.map(f => f.id === savedFinishing.id ? savedFinishing : f))
      } else {
        setFinishings(prev => [savedFinishing, ...prev])
      }
      notifyDataChange('finishings')
    } catch (error) {
      console.error('Error saving finishing:', error)
      toast.error('Gagal menyimpan finishing')
    } finally {
      setSaving(false)
    }
  }

  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=800,width=1000')
    if (!printWindow) {
      toast.error('Gagal membuka jendela print')
      return
    }

    printWindow.document.write('<html><head><title>Master Finishing</title>')
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

    printWindow.document.write('<h1>Master Finishing</h1>')
    printWindow.document.write(`<p style="text-align: right; font-size: 11px; margin-bottom: 10px;">Dicetak: ${new Date().toLocaleString('id-ID')}</p>`)

    printWindow.document.write('<table>')
    printWindow.document.write('<thead>')
    printWindow.document.write('<tr>')
    printWindow.document.write('<th>No</th>')
    printWindow.document.write('<th>Nama Finishing</th>')
    printWindow.document.write('<th class="center">Minim Lembar</th>')
    printWindow.document.write('<th class="right">Harga Minimum (Rp)</th>')
    printWindow.document.write('<th class="right">Harga Lebih (Rp/lembar)</th>')
    printWindow.document.write('<th class="right">Harga per cm (Rp)</th>')
    printWindow.document.write('</tr>')
    printWindow.document.write('</thead>')
    printWindow.document.write('<tbody>')

    filteredFinishings.forEach((f, index) => {
      printWindow.document.write(`
        <tr>
          <td>${index + 1}</td>
          <td>${f.name}</td>
          <td class="center">${f.minimumSheets}</td>
          <td class="right">${f.minimumPrice.toLocaleString('id-ID')}</td>
          <td class="right">${f.additionalPrice.toLocaleString('id-ID')}</td>
          <td class="right">${f.pricePerCm.toLocaleString('id-ID')}</td>
        </tr>
      `)
    })

    printWindow.document.write('</tbody></table>')
    printWindow.document.write('<div class="footer">Total Data: ' + filteredFinishings.length + '</div>')
    printWindow.document.write('</body></html>')
    printWindow.document.close()

    setTimeout(() => {
      printWindow.print()
    }, 250)

    toast.success('Mencetak tabel...')
  }

  // Mobile table columns
  const columns = [
    {
      key: 'name',
      title: 'Nama Finishing',
      render: (finishing: Finishing) => (
        <div className="flex items-center gap-3">
          <Layers className="w-5 h-5 text-purple-600 flex-shrink-0" />
          <span className="font-medium text-slate-800 truncate">{finishing.name}</span>
        </div>
      )
    },
    {
      key: 'minimumSheets',
      title: 'Minim Lembar',
      render: (finishing: Finishing) => finishing.minimumSheets
    },
    {
      key: 'minimumPrice',
      title: 'Harga Minimum',
      render: (finishing: Finishing) => `Rp ${finishing.minimumPrice.toLocaleString('id-ID')}`
    },
    {
      key: 'additionalPrice',
      title: 'Harga Lebih',
      render: (finishing: Finishing) => `Rp ${finishing.additionalPrice.toLocaleString('id-ID')}/lbr`
    },
    {
      key: 'pricePerCm',
      title: 'Harga/cm',
      render: (finishing: Finishing) => `Rp ${finishing.pricePerCm.toLocaleString('id-ID')}`
    }
  ]

  const mobileCardActions = (item: Finishing) => (
    <div className="flex items-center gap-1 mt-3 pt-3 border-t border-slate-100">
      {canEdit && (
        <button
          onClick={(e) => { e.stopPropagation(); handleEdit(item) }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </button>
      )}
      {canDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); handleDelete(item) }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Hapus
        </button>
      )}
    </div>
  )

  return (
    <DashboardLayout
      title={t('master_finishing')}
      subtitle={t('subtitle_master_finishing')}
    >
      {/* Desktop: Single-page fit-to-viewport layout */}
      <div className="hidden lg:flex flex-col bg-card rounded-xl shadow-sm border border-slate-200 overflow-hidden"
           style={{ height: 'calc(100vh - 10rem)' }}>
        {/* Compact Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50/50 flex-shrink-0">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari finishing..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-card"
            />
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs font-normal tabular-nums">
              {filteredFinishings.length} data
            </Badge>
            <Separator orientation="vertical" className="h-5 mx-1" />
            <Button onClick={handlePrint} variant="outline" size="sm" className="gap-1.5">
              <Printer className="w-3.5 h-3.5" />
              Cetak
            </Button>
            <Button
              onClick={handleBackup}
              variant="outline"
              size="sm"
              disabled={backupLoading === 'backup'}
              className="gap-1.5"
            >
              {backupLoading === 'backup' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DatabaseBackup className="w-3.5 h-3.5" />}
              Backup
            </Button>
            <Button
              onClick={handleRestore}
              variant="outline"
              size="sm"
              disabled={backupLoading === 'restore'}
              className="gap-1.5"
            >
              {backupLoading === 'restore' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Restore
            </Button>
            {canAdd && (
              <Button onClick={handleAdd} size="sm" className="gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Tambah
              </Button>
            )}
          </div>
        </div>

        {/* Desktop Table */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : filteredFinishings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <Layers className="w-12 h-12 text-slate-300 mb-3" />
              <p className="text-sm text-slate-500">Tidak ada data finishing ditemukan</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[50px] text-center">#</TableHead>
                  <TableHead className="min-w-[200px]">Nama Finishing</TableHead>
                  <TableHead className="text-center min-w-[120px]">Min. Lembar</TableHead>
                  <TableHead className="text-right min-w-[160px]">Harga Minimum</TableHead>
                  <TableHead className="text-right min-w-[160px]">Harga Lebih/lbr</TableHead>
                  <TableHead className="text-right min-w-[140px]">Harga/cm</TableHead>
                  <TableHead className="text-center w-[100px]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFinishings.map((finishing, idx) => (
                  <TableRow key={finishing.id} className="group">
                    <TableCell className="text-center text-slate-400 text-xs">{idx + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                          <Layers className="w-4 h-4 text-purple-600" />
                        </div>
                        <span className="font-medium text-slate-800">{finishing.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {finishing.minimumSheets > 0 ? (
                        <span className="tabular-nums">{finishing.minimumSheets.toLocaleString('id-ID')}</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {finishing.minimumPrice > 0 ? (
                        <span className="tabular-nums">Rp {finishing.minimumPrice.toLocaleString('id-ID')}</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {finishing.additionalPrice > 0 ? (
                        <span className="tabular-nums">Rp {finishing.additionalPrice.toLocaleString('id-ID')}</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {finishing.pricePerCm > 0 ? (
                        <span className="tabular-nums">Rp {finishing.pricePerCm.toLocaleString('id-ID')}</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-0.5">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(finishing)}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(finishing)}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Mobile: Original layout */}
      <div className="lg:hidden bg-card rounded-xl shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-200 space-y-3">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari finishing..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handlePrint} variant="outline" className="flex-1">
              <Printer className="w-4 h-4 mr-2" />
              Cetak Tabel
            </Button>
            <Button
              onClick={handleBackup}
              variant="outline"
              disabled={backupLoading === 'backup'}
              className="flex-1"
            >
              {backupLoading === 'backup' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DatabaseBackup className="w-4 h-4 mr-2" />}
              Backup
            </Button>
            <Button
              onClick={handleRestore}
              variant="outline"
              disabled={backupLoading === 'restore'}
              className="flex-1"
            >
              {backupLoading === 'restore' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Restore
            </Button>
            {canAdd && (
              <Button onClick={handleAdd} className="flex-1">
                <Plus className="w-4 h-4 mr-2" />
                Tambah Baru
              </Button>
            )}
          </div>
        </div>
        <div className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <MobileTable
              data={filteredFinishings}
              columns={columns}
              keyField="id"
              onEdit={canEdit ? handleEdit : undefined}
              onDelete={canDelete ? handleDelete : undefined}
              showAsButtons={true}
              emptyMessage="Tidak ada data finishing ditemukan"
              emptyIcon={<Layers className="w-16 h-16 mx-auto text-slate-400" />}
              mobileCardActions={mobileCardActions}
            />
          )}
        </div>
      </div>

      {/* Add/Edit Dialog — popup */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingFinishing ? 'Edit Finishing' : 'Tambah Finishing Baru'}</DialogTitle>
            <DialogDescription>
              {editingFinishing ? 'Edit informasi finishing yang sudah ada' : 'Isi informasi finishing baru'}
            </DialogDescription>
          </DialogHeader>
          <Separator className="my-2" />
          <form onSubmit={handleSubmit}>
            <div className="space-y-5">
              {/* Nama Finishing */}
              <div className="space-y-2">
                <Label htmlFor="name">
                  Nama Finishing <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Contoh: Laminating Glossy"
                  required
                />
              </div>

              {/* Minimum Lembar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Min. Lembar</Label>
                  <Switch
                    checked={formData.optMinimumSheets}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, optMinimumSheets: checked, minimumSheets: '' })
                    }
                  />
                </div>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.minimumSheets}
                  onChange={(e) => setFormData({ ...formData, minimumSheets: e.target.value })}
                  placeholder="100"
                  disabled={!formData.optMinimumSheets}
                  className={!formData.optMinimumSheets ? 'opacity-50' : ''}
                />
              </div>

              {/* Harga Minimum */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Harga Minimum (Rp)</Label>
                  <Switch
                    checked={formData.optMinimumPrice}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, optMinimumPrice: checked, minimumPrice: '' })
                    }
                  />
                </div>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.minimumPrice}
                  onChange={(e) => setFormData({ ...formData, minimumPrice: e.target.value })}
                  placeholder="50000"
                  disabled={!formData.optMinimumPrice}
                  className={!formData.optMinimumPrice ? 'opacity-50' : ''}
                />
              </div>

              {/* Harga Lebih */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Harga Lebih/lembar (Rp)</Label>
                  <Switch
                    checked={formData.optAdditionalPrice}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, optAdditionalPrice: checked, additionalPrice: '' })
                    }
                  />
                </div>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.additionalPrice}
                  onChange={(e) => setFormData({ ...formData, additionalPrice: e.target.value })}
                  placeholder="500"
                  disabled={!formData.optAdditionalPrice}
                  className={!formData.optAdditionalPrice ? 'opacity-50' : ''}
                />
              </div>

              {/* Harga per cm */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Harga/cm (Rp)</Label>
                  <Switch
                    checked={formData.optPricePerCm}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, optPricePerCm: checked, pricePerCm: '' })
                    }
                  />
                </div>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.pricePerCm}
                  onChange={(e) => setFormData({ ...formData, pricePerCm: e.target.value })}
                  placeholder="100"
                  disabled={!formData.optPricePerCm}
                  className={!formData.optPricePerCm ? 'opacity-50' : ''}
                />
              </div>
            </div>

            <DialogFooter className="pt-4 mt-4 border-t border-slate-200">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1" disabled={saving}>
                Batal
              </Button>
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menyimpan...</> : (editingFinishing ? 'Update' : 'Simpan')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
