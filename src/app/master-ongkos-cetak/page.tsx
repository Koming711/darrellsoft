'use client'

import { Printer, Plus, Search, Loader2, DollarSign, Pencil, Trash2, Cog } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Button } from '@/components/ui/button'
import { DialogForm } from '@/components/dialog-form'
import { useLanguage } from '@/contexts/language-context'
import { toast } from 'sonner'
import { getAuthUser } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'
import { hasSubPermission } from '@/lib/permissions'
import { notifyDataChange } from '@/lib/data-sync'
import { useDataChange } from '@/hooks/use-data-change'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface PrintingCost {
  id: string
  machineName: string
  grammage: number
  printAreaWidth: number
  printAreaHeight: number
  pricePerColor: number
  specialColorPrice: number
  minimumPrintQuantity: number
  priceAboveMinimumPerSheet: number
  platePricePerSheet: number
  createdAt: string
  updatedAt: string
}

const formatRp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`

export default function MasterOngkosCetakPage() {
  const { t } = useLanguage()
  const currentUser = getAuthUser()
  const canAdd = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-ongkos-cetak', 'master-ongkos-cetak-tambah')
  const canEdit = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-ongkos-cetak', 'master-ongkos-cetak-edit')
  const canDelete = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-ongkos-cetak', 'master-ongkos-cetak-hapus')

  const [searchTerm, setSearchTerm] = useState('')
  const [printingCosts, setPrintingCosts] = useState<PrintingCost[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCost, setEditingCost] = useState<PrintingCost | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => {
    fetchPrintingCosts()
  }, [])

  useDataChange(['printing-costs'], () => {
    fetchPrintingCosts()
  })

  const fetchPrintingCosts = async () => {
    try {
      const response = await authFetch('/api/printing-costs')
      const data = await response.json()
      setPrintingCosts(data)
    } catch (error) {
      console.error('Error fetching printing costs:', error)
      toast.error('Gagal memuat data ongkos cetak')
    } finally {
      setLoading(false)
    }
  }

  const filteredCosts = printingCosts.filter(cost =>
    cost.machineName.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleAdd = () => {
    setEditingCost(null)
    setDialogOpen(true)
  }

  const handleEdit = (cost: PrintingCost) => {
    setEditingCost(cost)
    setDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    try {
      const response = await authFetch(`/api/printing-costs/${id}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        toast.success('Ongkos cetak berhasil dihapus')
        setPrintingCosts(prev => prev.filter(c => c.id !== id))
        notifyDataChange('printing-costs')
      } else {
        toast.error('Gagal menghapus ongkos cetak')
      }
    } catch (error) {
      console.error('Error deleting printing cost:', error)
      toast.error('Gagal menghapus ongkos cetak')
    }
    setDeleteId(null)
  }

  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=800,width=1000')
    if (!printWindow) {
      toast.error('Gagal membuka jendela print')
      return
    }

    printWindow.document.write('<html><head><title>Master Ongkos Cetak</title>')
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
        @media print {
          body { padding: 0; }
        }
      </style>
    `)
    printWindow.document.write('</head><body>')
    printWindow.document.write('<h1>Master Ongkos Cetak</h1>')
    printWindow.document.write(`<p style="text-align: right; font-size: 11px; margin-bottom: 10px;">Dicetak: ${new Date().toLocaleString('id-ID')}</p>`)
    printWindow.document.write('<table>')
    printWindow.document.write('<thead><tr>')
    printWindow.document.write('<th>No</th>')
    printWindow.document.write('<th>Nama Mesin</th>')
    printWindow.document.write('<th>Grammage</th>')
    printWindow.document.write('<th class="center">Area Cetak (cm)</th>')
    printWindow.document.write('<th class="right">Harga/Warna</th>')
    printWindow.document.write('<th class="right">Warna Khusus</th>')
    printWindow.document.write('<th class="center">Min. Cetak</th>')
    printWindow.document.write('<th class="right">Lebih Cetak/Lembar</th>')
    printWindow.document.write('<th class="right">Plat/Lembar</th>')
    printWindow.document.write('</tr></thead><tbody>')

    filteredCosts.forEach((cost, index) => {
      printWindow.document.write(`
        <tr>
          <td>${index + 1}</td>
          <td>${cost.machineName}</td>
          <td>${cost.grammage}g</td>
          <td class="center">${cost.printAreaWidth} x ${cost.printAreaHeight}</td>
          <td class="right">Rp ${cost.pricePerColor.toLocaleString('id-ID')}</td>
          <td class="right">Rp ${cost.specialColorPrice.toLocaleString('id-ID')}</td>
          <td class="center">${cost.minimumPrintQuantity}</td>
          <td class="right">Rp ${cost.priceAboveMinimumPerSheet.toLocaleString('id-ID')}</td>
          <td class="right">Rp ${cost.platePricePerSheet.toLocaleString('id-ID')}</td>
        </tr>
      `)
    })

    printWindow.document.write('</tbody></table>')
    printWindow.document.write('<div class="footer">Total Data: ' + filteredCosts.length + '</div>')
    printWindow.document.write('</body></html>')
    printWindow.document.close()
    setTimeout(() => { printWindow.print() }, 250)
    toast.success('Mencetak tabel...')
  }

  const handleSave = async (data: any) => {
    try {
      let response: Response
      if (editingCost) {
        response = await authFetch(`/api/printing-costs/${editingCost.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
      } else {
        response = await authFetch('/api/printing-costs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
      }

      if (response.ok) {
        const savedCost = await response.json()
        toast.success(editingCost ? 'Ongkos cetak berhasil diperbarui' : 'Ongkos cetak berhasil ditambahkan')
        setDialogOpen(false)
        if (editingCost) {
          setPrintingCosts(prev => prev.map(c => c.id === savedCost.id ? savedCost : c))
        } else {
          setPrintingCosts(prev => [savedCost, ...prev])
        }
        notifyDataChange('printing-costs')
      } else {
        toast.error(editingCost ? 'Gagal memperbarui ongkos cetak' : 'Gagal menambahkan ongkos cetak')
      }
    } catch (error) {
      console.error('Error saving printing cost:', error)
      toast.error('Gagal menyimpan ongkos cetak')
    }
  }

  return (
    <DashboardLayout
      title={t('master_ongkos_cetak')}
      subtitle={t('subtitle_master_ongkos_cetak')}
    >
      <div className="space-y-4 sm:space-y-6 pb-6">
        {/* Header: Search + Actions */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari mesin..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button onClick={handlePrint} variant="outline" size="sm" className="flex-1 sm:flex-none border-slate-200">
              <Printer className="w-3.5 h-3.5 mr-1.5" />
              Cetak
            </Button>
            {canAdd && (
              <Button onClick={handleAdd} size="sm" className="flex-1 sm:flex-none">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Tambah
              </Button>
            )}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="ml-2 text-sm text-slate-500">Memuat data...</span>
          </div>
        ) : filteredCosts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-12 text-center">
            <DollarSign className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">Tidak ada data ongkos cetak</p>
            {searchTerm && (
              <p className="text-xs text-slate-400 mt-1">Coba ubah kata kunci pencarian</p>
            )}
          </div>
        ) : (
          <div className="rounded-lg border bg-white overflow-hidden">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                    <TableHead className="w-10 text-[11px] font-semibold text-gray-500">No</TableHead>
                    <TableHead className="text-[11px] font-semibold text-gray-500">Nama Mesin</TableHead>
                    <TableHead className="text-[11px] font-semibold text-gray-500">Grammage</TableHead>
                    <TableHead className="text-[11px] font-semibold text-gray-500">Area Cetak</TableHead>
                    <TableHead className="text-right text-[11px] font-semibold text-gray-500">Harga/Warna</TableHead>
                    <TableHead className="text-right text-[11px] font-semibold text-gray-500">Warna Khusus</TableHead>
                    <TableHead className="text-right text-[11px] font-semibold text-gray-500">Min. Cetak</TableHead>
                    <TableHead className="text-right text-[11px] font-semibold text-gray-500">Lebih Cetak/Lbr</TableHead>
                    <TableHead className="text-right text-[11px] font-semibold text-gray-500">Plat/Lembar</TableHead>
                    <TableHead className="text-right text-[11px] font-semibold text-gray-500">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCosts.map((cost, idx) => (
                    <TableRow key={cost.id} className="group">
                      <TableCell className="py-2.5 text-xs text-gray-400">{idx + 1}</TableCell>
                      <TableCell className="py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                            <Cog className="w-3.5 h-3.5 text-blue-600" />
                          </div>
                          <span className="text-xs font-medium text-slate-800 truncate max-w-[160px]">{cost.machineName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 text-xs text-slate-600">{cost.grammage}g</TableCell>
                      <TableCell className="py-2.5 text-xs text-slate-600 whitespace-nowrap">{cost.printAreaWidth} × {cost.printAreaHeight} cm</TableCell>
                      <TableCell className="py-2.5 text-xs text-right font-medium text-emerald-700">{formatRp(cost.pricePerColor)}</TableCell>
                      <TableCell className="py-2.5 text-xs text-right font-medium text-blue-700">{formatRp(cost.specialColorPrice)}</TableCell>
                      <TableCell className="py-2.5 text-xs text-right text-slate-600">{cost.minimumPrintQuantity} lbr</TableCell>
                      <TableCell className="py-2.5 text-xs text-right font-medium text-orange-700">{formatRp(cost.priceAboveMinimumPerSheet)}</TableCell>
                      <TableCell className="py-2.5 text-xs text-right font-medium text-purple-700">{formatRp(cost.platePricePerSheet)}</TableCell>
                      <TableCell className="py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                              onClick={() => handleEdit(cost)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {canDelete && (
                            <AlertDialog open={deleteId === cost.id} onOpenChange={(open) => !open && setDeleteId(null)}>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-red-400 hover:text-red-600 hover:bg-red-50"
                                  onClick={() => setDeleteId(cost.id)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Hapus Ongkos Cetak?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Data mesin <strong>{cost.machineName}</strong> akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Batal</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(cost.id)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Hapus
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Card List */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredCosts.map((cost) => (
                <div key={cost.id} className="p-4 space-y-3">
                  {/* Header: Machine Name */}
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      <Cog className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{cost.machineName}</p>
                      <p className="text-[11px] text-slate-400">Grammage: {cost.grammage}g</p>
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2">
                      <p className="text-[9px] text-emerald-500 font-medium">Harga/Warna</p>
                      <p className="text-xs font-bold text-emerald-700">{formatRp(cost.pricePerColor)}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-2">
                      <p className="text-[9px] text-blue-500 font-medium">Warna Khusus</p>
                      <p className="text-xs font-bold text-blue-700">{formatRp(cost.specialColorPrice)}</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                      <p className="text-[9px] text-slate-500 font-medium">Area Cetak</p>
                      <p className="text-xs font-bold text-slate-700">{cost.printAreaWidth} × {cost.printAreaHeight} cm</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                      <p className="text-[9px] text-slate-500 font-medium">Min. Cetak</p>
                      <p className="text-xs font-bold text-slate-700">{cost.minimumPrintQuantity} lbr</p>
                    </div>
                    <div className="bg-orange-50 border border-orange-100 rounded-lg p-2">
                      <p className="text-[9px] text-orange-500 font-medium">Lebih Cetak/Lbr</p>
                      <p className="text-xs font-bold text-orange-700">{formatRp(cost.priceAboveMinimumPerSheet)}</p>
                    </div>
                    <div className="bg-purple-50 border border-purple-100 rounded-lg p-2">
                      <p className="text-[9px] text-purple-500 font-medium">Plat/Lembar</p>
                      <p className="text-xs font-bold text-purple-700">{formatRp(cost.platePricePerSheet)}</p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {(canEdit || canDelete) && (
                    <div className="flex items-center gap-2 pt-1">
                      {canEdit && (
                        <button
                          onClick={() => handleEdit(cost)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => setDeleteId(cost.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Hapus
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Footer: Count */}
            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50">
              <p className="text-[11px] text-slate-400">Total: {filteredCosts.length} mesin cetak</p>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog (mobile) */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Ongkos Cetak?</AlertDialogTitle>
            <AlertDialogDescription>
              Data ini akan dihapus permanen dan tidak dapat dikembalikan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add/Edit Dialog */}
      <DialogForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editingCost ? 'Edit Ongkos Cetak' : 'Tambah Ongkos Cetak Baru'}
        description={editingCost ? 'Edit informasi ongkos cetak' : 'Isi informasi ongkos cetak baru'}
        fields={[
          { name: 'machineName', label: 'Nama Mesin', type: 'text', placeholder: 'Contoh: Heidelberg Speedmaster 74', required: true },
          { name: 'grammage', label: 'Grammage (gsm)', type: 'number', placeholder: '120', required: true },
          { name: 'printAreaWidth', label: 'Area Cetak Lebar (cm)', type: 'number', placeholder: '50', required: true },
          { name: 'printAreaHeight', label: 'Area Cetak Tinggi (cm)', type: 'number', placeholder: '70', required: true },
          { name: 'pricePerColor', label: 'Harga / Warna (Rp)', type: 'number', placeholder: '150000', required: true },
          { name: 'specialColorPrice', label: 'Harga Warna Khusus (Rp)', type: 'number', placeholder: '200000', required: true },
          { name: 'minimumPrintQuantity', label: 'Minimum Cetak (lembar)', type: 'number', placeholder: '500', required: true },
          { name: 'priceAboveMinimumPerSheet', label: 'Lebih Cetak / Lembar (Rp)', type: 'number', placeholder: '50', required: true },
          { name: 'platePricePerSheet', label: 'Harga Plat Cetak / Lembar (Rp)', type: 'number', placeholder: '15000', required: true }
        ]}
        initialData={editingCost ? {
          machineName: editingCost.machineName,
          grammage: editingCost.grammage?.toString() || '',
          printAreaWidth: editingCost.printAreaWidth.toString(),
          printAreaHeight: editingCost.printAreaHeight.toString(),
          pricePerColor: editingCost.pricePerColor.toString(),
          specialColorPrice: editingCost.specialColorPrice.toString(),
          minimumPrintQuantity: editingCost.minimumPrintQuantity.toString(),
          priceAboveMinimumPerSheet: editingCost.priceAboveMinimumPerSheet.toString(),
          platePricePerSheet: editingCost.platePricePerSheet.toString()
        } : undefined}
        onSave={handleSave}
      />
    </DashboardLayout>
  )
}
