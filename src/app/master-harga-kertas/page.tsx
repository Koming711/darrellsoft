'use client'

import { FileText, Plus, Search, Loader2, Printer, Download } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { MobileTable } from '@/components/mobile-table'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/contexts/language-context'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from 'sonner'
import { getAuthUser } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'
import { hasSubPermission } from '@/lib/permissions'
import { notifyDataChange } from '@/lib/data-sync'
import { useDataChange } from '@/hooks/use-data-change'

interface Paper {
  id: string
  name: string
  grammage: number
  width: number
  height: number
  pricePerRim: number
  createdAt: string
  updatedAt: string
}

interface FormData {
  name: string
  grammage: string
  width: string
  height: string
  pricePerRim: string
  pricePerKg: string
}

export default function MasterHargaKertasPage() {
  const { t } = useLanguage()
  const currentUser = getAuthUser()
  const canAdd = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-harga-kertas', 'master-harga-kertas-tambah')
  const canEdit = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-harga-kertas', 'master-harga-kertas-edit')
  const canDelete = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-harga-kertas', 'master-harga-kertas-hapus')

  const [searchTerm, setSearchTerm] = useState('')
  const [papers, setPapers] = useState<Paper[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPaper, setEditingPaper] = useState<Paper | null>(null)
  const [formData, setFormData] = useState<FormData>({
    name: '',
    grammage: '',
    width: '',
    height: '',
    pricePerRim: '',
    pricePerKg: ''
  })
  const [activeField, setActiveField] = useState<'pricePerKg' | 'pricePerRim' | null>(null)
  const [saving, setSaving] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchPapers()
  }, [])

  useDataChange(['papers'], () => {
    fetchPapers()
  })

  const fetchPapers = async () => {
    try {
      const response = await authFetch('/api/papers')
      const data = await response.json()
      setPapers(data)
    } catch (error) {
      console.error('Error fetching papers:', error)
      toast.error('Gagal memuat data kertas')
    } finally {
      setLoading(false)
    }
  }

  const calculatePricePerSheet = (pricePerRim: number): number => {
    return Math.round(pricePerRim / 500)
  }

  const filteredPapers = papers.filter(paper =>
    paper.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleAdd = () => {
    setEditingPaper(null)
    setFormData({
      name: '',
      grammage: '',
      width: '',
      height: '',
      pricePerRim: '',
      pricePerKg: ''
    })
    setActiveField(null)
    setDialogOpen(true)
  }

  const handleEdit = (paper: Paper) => {
    setEditingPaper(paper)
    const w = paper.width
    const h = paper.height
    const g = paper.grammage
    const calculatedPricePerKg = (w > 0 && h > 0 && g > 0)
      ? Math.round((paper.pricePerRim * 20000) / (w * h * g))
      : 0
    setFormData({
      name: paper.name,
      grammage: paper.grammage.toString(),
      width: paper.width.toString(),
      height: paper.height.toString(),
      pricePerRim: paper.pricePerRim.toString(),
      pricePerKg: calculatedPricePerKg.toString()
    })
    setActiveField('pricePerRim')
    setDialogOpen(true)
  }

  const handleDelete = async (paper: Paper) => {
    if (confirm('Beneran mau dihapus nih?')) {
      try {
        const response = await authFetch(`/api/papers/${paper.id}`, {
          method: 'DELETE'
        })
        if (response.ok) {
          toast.success('Kertas berhasil dihapus')
          // Optimistic update: remove from state immediately
          setPapers(prev => prev.filter(p => p.id !== paper.id))
          notifyDataChange('papers')
        } else {
          toast.error('Gagal menghapus kertas')
        }
      } catch (error) {
        console.error('Error deleting paper:', error)
        toast.error('Gagal menghapus kertas')
      }
    }
  }

  const handlePrint = () => {
    const printContent = printRef.current
    if (!printContent) return

    const printWindow = window.open('', '', 'height=800,width=800')
    if (!printWindow) {
      toast.error('Gagal membuka jendela print')
      return
    }

    printWindow.document.write('<html><head><title>Master Harga Kertas</title>')
    printWindow.document.write(`
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1 { text-align: center; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; font-weight: bold; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .right { text-align: right; }
        .footer { margin-top: 20px; font-size: 12px; color: #666; text-align: center; }
      </style>
    `)
    printWindow.document.write('</head><body>')

    // Add title
    printWindow.document.write('<h1>Master Harga Kertas</h1>')

    // Add print date
    printWindow.document.write(`<p style="text-align: right; font-size: 12px; margin-bottom: 10px;">Dicetak: ${new Date().toLocaleString('id-ID')}</p>`)

    // Add table
    printWindow.document.write('<table>')
    printWindow.document.write('<thead><tr><th>No</th><th>Nama Bahan</th><th>Gramatur</th><th>Ukuran (cm)</th><th>Harga/Rim</th><th>Harga/Lembar</th></tr></thead>')
    printWindow.document.write('<tbody>')

    filteredPapers.forEach((paper, index) => {
      const pricePerSheet = calculatePricePerSheet(paper.pricePerRim)
      printWindow.document.write(`
        <tr>
          <td>${index + 1}</td>
          <td>${paper.name}</td>
          <td>${paper.grammage} gsm</td>
          <td>${paper.width} x ${paper.height}</td>
          <td class="right">Rp ${paper.pricePerRim.toLocaleString('id-ID')}</td>
          <td class="right">Rp ${pricePerSheet.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
      `)
    })

    printWindow.document.write('</tbody></table>')

    // Add footer
    printWindow.document.write('<div class="footer">Total Data: ' + filteredPapers.length + '</div>')
    printWindow.document.write('</body></html>')
    printWindow.document.close()

    setTimeout(() => {
      printWindow.print()
    }, 250)

    toast.success('Mencetak tabel...')
  }

  const handleFieldChange = (field: keyof FormData, value: string) => {
    const updated = { ...formData, [field]: value }
    setFormData(updated)

    const w = parseFloat(updated.width) || 0
    const h = parseFloat(updated.height) || 0
    const g = parseFloat(updated.grammage) || 0

    // Calculate the other price field based on which one is being edited
    if (field === 'pricePerKg') {
      setActiveField('pricePerKg')
      const pricePerKg = parseFloat(value) || 0
      if (w > 0 && h > 0 && g > 0 && pricePerKg > 0) {
        const calculatedRim = Math.round((w * h * g * pricePerKg) / 20000)
        setFormData(prev => ({ ...prev, pricePerRim: calculatedRim.toString() }))
      }
    } else if (field === 'pricePerRim') {
      setActiveField('pricePerRim')
      const pricePerRim = parseFloat(value) || 0
      if (w > 0 && h > 0 && g > 0 && pricePerRim > 0) {
        const calculatedKg = Math.round((pricePerRim * 20000) / (w * h * g))
        setFormData(prev => ({ ...prev, pricePerKg: calculatedKg.toString() }))
      }
    }

    // Recalculate when dimensions or grammage change
    if ((field === 'width' || field === 'height' || field === 'grammage') && w > 0 && h > 0 && g > 0) {
      if (activeField === 'pricePerKg') {
        const pricePerKg = parseFloat(updated.pricePerKg) || 0
        if (pricePerKg > 0) {
          const calculatedRim = Math.round((w * h * g * pricePerKg) / 20000)
          setFormData(prev => ({ ...prev, pricePerRim: calculatedRim.toString() }))
        }
      } else if (activeField === 'pricePerRim') {
        const pricePerRim = parseFloat(updated.pricePerRim) || 0
        if (pricePerRim > 0) {
          const calculatedKg = Math.round((pricePerRim * 20000) / (w * h * g))
          setFormData(prev => ({ ...prev, pricePerKg: calculatedKg.toString() }))
        }
      }
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast.error('Nama bahan wajib diisi')
      return
    }
    if (!formData.grammage || parseFloat(formData.grammage) <= 0) {
      toast.error('Gramatur wajib diisi')
      return
    }
    if (!formData.width || parseFloat(formData.width) <= 0) {
      toast.error('Lebar kertas wajib diisi')
      return
    }
    if (!formData.height || parseFloat(formData.height) <= 0) {
      toast.error('Tinggi kertas wajib diisi')
      return
    }
    if (!formData.pricePerRim || parseFloat(formData.pricePerRim) <= 0) {
      toast.error('Harga per rim wajib diisi')
      return
    }

    const saveData = {
      name: formData.name,
      grammage: parseFloat(formData.grammage),
      width: parseFloat(formData.width),
      height: parseFloat(formData.height),
      pricePerRim: parseFloat(formData.pricePerRim),
    }

    handleSave(saveData)
  }

  const handleSave = async (data: { name: string; grammage: number; width: number; height: number; pricePerRim: number }) => {
    if (saving) return
    setSaving(true)
    try {
      let response: Response
      if (editingPaper) {
        response = await authFetch(`/api/papers/${editingPaper.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
      } else {
        response = await authFetch('/api/papers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
      }

      if (response.ok) {
        const savedPaper = await response.json()
        toast.success(editingPaper ? 'Kertas berhasil diperbarui' : 'Kertas berhasil ditambahkan')
        setDialogOpen(false)
        // Optimistic update: use API response data to update state immediately
        if (editingPaper) {
          setPapers(prev => prev.map(p => p.id === savedPaper.id ? savedPaper : p))
        } else {
          setPapers(prev => [savedPaper, ...prev])
        }
        notifyDataChange('papers')
      } else {
        toast.error(editingPaper ? 'Gagal memperbarui kertas' : 'Gagal menambahkan kertas')
      }
    } catch (error) {
      console.error('Error saving paper:', error)
      toast.error('Gagal menyimpan kertas')
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    {
      key: 'name',
      title: 'Nama Bahan',
      render: (paper: Paper) => (
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <span className="font-medium text-slate-800 truncate">{paper.name}</span>
        </div>
      )
    },
    {
      key: 'grammage',
      title: 'Gramatur',
      render: (paper: Paper) => `${paper.grammage} gsm`
    },
    {
      key: 'size',
      title: 'Ukuran (cm)',
      render: (paper: Paper) => `${paper.width} x ${paper.height}`
    },
    {
      key: 'pricePerRim',
      title: 'Harga/Rim',
      render: (paper: Paper) => (
        <span className="text-emerald-600 font-medium">
          Rp {paper.pricePerRim.toLocaleString('id-ID')}
        </span>
      )
    },
    {
      key: 'pricePerSheet',
      title: 'Harga/Lembar',
      render: (paper: Paper) => (
        <span className="text-blue-600 font-medium">
          Rp {calculatePricePerSheet(paper.pricePerRim).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      )
    }
  ]

  return (
    <DashboardLayout
      title={t('master_harga_kertas')}
      subtitle={t('subtitle_master_harga_kertas')}

    >
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        {/* Search & Add Button */}
        <div className="p-4 lg:p-6 border-b border-slate-200 space-y-4 lg:space-y-0 lg:flex lg:items-center lg:justify-between lg:gap-4">
          <div className="relative w-full lg:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 lg:w-5 lg:h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari kertas..."
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

        {/* Hidden printable content */}
        <div ref={printRef} className="hidden">
          {filteredPapers.map((paper, index) => (
            <div key={paper.id}>
              {index + 1}. {paper.name} - {paper.grammage} gsm - {paper.width} x {paper.height} cm -
              Rp {paper.pricePerRim.toLocaleString('id-ID')}/rim -
              Rp {calculatePricePerSheet(paper.pricePerRim).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/lembar
            </div>
          ))}
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
                data={filteredPapers}
                columns={columns}
                keyField="id"
                onEdit={canEdit ? handleEdit : undefined}
                onDelete={canDelete ? handleDelete : undefined}
                showAsButtons={true}
                emptyMessage="Tidak ada data kertas ditemukan"
                emptyIcon={<FileText className="w-16 h-16 mx-auto text-slate-400" />}
              />
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingPaper ? 'Edit Data Kertas' : 'Tambah Kertas Baru'}</DialogTitle>
            <DialogDescription>
              {editingPaper ? 'Edit informasi kertas' : 'Isi informasi kertas baru'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-3 py-2">
              {/* Nama Bahan */}
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-sm font-medium">
                  Nama Bahan
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Contoh: Art Paper 150"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              {/* Gramatur */}
              <div className="space-y-1.5">
                <Label htmlFor="grammage" className="text-sm font-medium">
                  Gramatur (gsm)
                </Label>
                <Input
                  id="grammage"
                  type="number"
                  placeholder="150"
                  value={formData.grammage}
                  onChange={(e) => handleFieldChange('grammage', e.target.value)}
                  required
                />
              </div>

              {/* Lebar & Tinggi sejajar */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="width" className="text-sm font-medium">
                    Lebar (cm)
                  </Label>
                  <Input
                    id="width"
                    type="number"
                    placeholder="65"
                    value={formData.width}
                    onChange={(e) => handleFieldChange('width', e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="height" className="text-sm font-medium">
                    Tinggi (cm)
                  </Label>
                  <Input
                    id="height"
                    type="number"
                    placeholder="100"
                    value={formData.height}
                    onChange={(e) => handleFieldChange('height', e.target.value)}
                    required
                  />
                </div>
              </div>



              {/* Harga per Kg */}
              <div className="space-y-1.5">
                <Label htmlFor="pricePerKg" className="text-sm font-medium">
                  Harga/Kg (Rp)
                </Label>
                <Input
                  id="pricePerKg"
                  type="number"
                  placeholder="15000"
                  value={formData.pricePerKg}
                  onChange={(e) => handleFieldChange('pricePerKg', e.target.value)}
                />
              </div>

              {/* Harga per Rim */}
              <div className="space-y-1.5">
                <Label htmlFor="pricePerRim" className="text-sm font-medium">
                  Harga/Rim (Rp)
                </Label>
                <Input
                  id="pricePerRim"
                  type="number"
                  placeholder="12500000"
                  value={formData.pricePerRim}
                  onChange={(e) => handleFieldChange('pricePerRim', e.target.value)}
                  required
                />
              </div>


            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                Batal
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menyimpan...</> : t('simpan')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
