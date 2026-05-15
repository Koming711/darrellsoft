'use client'

import { Printer, Plus, Search, Loader2, DollarSign } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
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
  const printRef = useRef<HTMLDivElement>(null)

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

  const handleDelete = async (cost: PrintingCost) => {
    if (confirm('Beneran mau dihapus nih?')) {
      try {
        const response = await authFetch(`/api/printing-costs/${cost.id}`, {
          method: 'DELETE'
        })
        if (response.ok) {
          toast.success('Ongkos cetak berhasil dihapus')
          // Optimistic update: remove from state immediately
          setPrintingCosts(prev => prev.filter(c => c.id !== cost.id))
          notifyDataChange('printing-costs')
        } else {
          toast.error('Gagal menghapus ongkos cetak')
        }
      } catch (error) {
        console.error('Error deleting printing cost:', error)
        toast.error('Gagal menghapus ongkos cetak')
      }
    }
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

    // Add title
    printWindow.document.write('<h1>Master Ongkos Cetak</h1>')

    // Add print date
    printWindow.document.write(`<p style="text-align: right; font-size: 11px; margin-bottom: 10px;">Dicetak: ${new Date().toLocaleString('id-ID')}</p>`)

    // Add table
    printWindow.document.write('<table>')
    printWindow.document.write('<thead>')
    printWindow.document.write('<tr>')
    printWindow.document.write('<th>No</th>')
    printWindow.document.write('<th>Nama Mesin</th>')
    printWindow.document.write('<th class="center">Area Cetak (cm)</th>')
    printWindow.document.write('<th class="right">Harga/Warna</th>')
    printWindow.document.write('<th class="right">Warna Khusus</th>')
    printWindow.document.write('<th class="center">Min. Cetak</th>')
    printWindow.document.write('<th class="right">Lebih Cetak/Lembar</th>')
    printWindow.document.write('<th class="right">Plat/Lembar</th>')
    printWindow.document.write('</tr>')
    printWindow.document.write('</thead>')
    printWindow.document.write('<tbody>')

    filteredCosts.forEach((cost, index) => {
      printWindow.document.write(`
        <tr>
          <td>${index + 1}</td>
          <td>${cost.machineName}</td>
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

    // Add footer
    printWindow.document.write('<div class="footer">Total Data: ' + filteredCosts.length + '</div>')
    printWindow.document.write('</body></html>')
    printWindow.document.close()

    setTimeout(() => {
      printWindow.print()
    }, 250)

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
        // Optimistic update: use API response data to update state immediately
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

  const columns = [
    {
      key: 'machineName',
      title: 'Nama Mesin',
      render: (cost: PrintingCost) => (
        <div className="flex items-center gap-3">
          <DollarSign className="w-5 h-5 text-green-600 flex-shrink-0" />
          <span className="font-medium text-slate-800 truncate">{cost.machineName}</span>
        </div>
      )
    },
    {
      key: 'printArea',
      title: 'Area Cetak (cm)',
      render: (cost: PrintingCost) => `${cost.printAreaWidth} x ${cost.printAreaHeight}`
    },
    {
      key: 'pricePerColor',
      title: 'Harga/Warna',
      render: (cost: PrintingCost) => (
        <span className="text-emerald-600 font-medium">
          Rp {cost.pricePerColor.toLocaleString('id-ID')}
        </span>
      )
    },
    {
      key: 'specialColorPrice',
      title: 'Warna Khusus',
      render: (cost: PrintingCost) => (
        <span className="text-blue-600 font-medium">
          Rp {cost.specialColorPrice.toLocaleString('id-ID')}
        </span>
      )
    },
    {
      key: 'minimumPrintQuantity',
      title: 'Min. Cetak',
      render: (cost: PrintingCost) => `${cost.minimumPrintQuantity} lembar`
    },
    {
      key: 'priceAboveMinimumPerSheet',
      title: 'Lebih Cetak/Lembar',
      render: (cost: PrintingCost) => (
        <span className="text-orange-600 font-medium">
          Rp {cost.priceAboveMinimumPerSheet.toLocaleString('id-ID')}
        </span>
      )
    },
    {
      key: 'platePricePerSheet',
      title: 'Harga Plat/Lembar',
      render: (cost: PrintingCost) => (
        <span className="text-purple-600 font-medium">
          Rp {cost.platePricePerSheet.toLocaleString('id-ID')}
        </span>
      )
    }
  ]

  return (
    <DashboardLayout
      title={t('master_ongkos_cetak')}
      subtitle={t('subtitle_master_ongkos_cetak')}
    >
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        {/* Search & Add Button */}
        <div className="p-4 lg:p-6 border-b border-slate-200 space-y-4 lg:space-y-0 lg:flex lg:items-center lg:justify-between lg:gap-4">
          <div className="relative w-full lg:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 lg:w-5 lg:h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari mesin..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 lg:pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2 w-full lg:w-auto">
            <Button onClick={handlePrint} variant="outline" className="flex-1 lg:flex-none">
              <Printer className="w-4 h-4 mr-2" />
              Cetak Tabel
            </Button>
            {canAdd && (
              <Button onClick={handleAdd} className="flex-1 lg:flex-none">
                <Plus className="w-4 h-4 mr-2" />
                Tambah Baru
              </Button>
            )}
          </div>
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
                data={filteredCosts}
                columns={columns}
                keyField="id"
                onEdit={canEdit ? handleEdit : undefined}
                onDelete={canDelete ? handleDelete : undefined}
                showAsButtons={true}
                emptyMessage="Tidak ada data ongkos cetak ditemukan"
                emptyIcon={<DollarSign className="w-16 h-16 mx-auto text-slate-400" />}
              />
            </div>
          )}
        </div>
      </div>

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
