'use client'

import { FileText, Plus, Search, Loader2, Printer, Download, DatabaseBackup, Upload, ChevronDown } from 'lucide-react'
import { useState, useEffect, useRef, useMemo } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
  suplier?: string | null
  kategoriId?: string | null
  kategori?: { id: string; nama: string } | null
  createdAt: string
  updatedAt: string
}

interface KategoriItem {
  id: string
  nama: string
}

interface TokoItem {
  id: string
  namaToko?: string
  jenisBarang?: string
}

interface SuplierOption {
  name: string
  jenisBarang?: string
}

interface FormData {
  name: string
  grammage: string
  width: string
  height: string
  pricePerRim: string
  pricePerKg: string
  kategoriId: string
  suplier: string
}

export default function MasterHargaKertasPage() {
  const { t } = useLanguage()
  const currentUser = getAuthUser()
  const canAdd = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-harga-kertas', 'master-harga-kertas-tambah')
  const canEdit = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-harga-kertas', 'master-harga-kertas-edit')
  const canDelete = currentUser?.role === 'superadmin' || hasSubPermission(currentUser?.role || '', 'master-harga-kertas', 'master-harga-kertas-hapus')

  const [searchTerm, setSearchTerm] = useState('')
  const [kategoriFilter, setKategoriFilter] = useState('all')
  const [suplierFilter, setSuplierFilter] = useState('all')
  const [papers, setPapers] = useState<Paper[]>([])
  const [kategoriList, setKategoriList] = useState<KategoriItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPaper, setEditingPaper] = useState<Paper | null>(null)
  const [formData, setFormData] = useState<FormData>({
    name: '',
    grammage: '',
    width: '',
    height: '',
    pricePerRim: '',
    pricePerKg: '',
    kategoriId: '',
    suplier: ''
  })
  const [activeField, setActiveField] = useState<'pricePerKg' | 'pricePerRim' | null>(null)
  const [saving, setSaving] = useState(false)
  const [backupLoading, setBackupLoading] = useState<string | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchPapers()
    fetchKategoriList()
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

  const fetchKategoriList = async () => {
    try {
      const response = await authFetch('/api/kategori')
      const data = await response.json()
      setKategoriList(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Error fetching kategori:', error)
    }
  }

  // Daftar suplier utk dropdown dialog: gabungan nama toko dari Master Toko
  // Pemasok (Master Suplier) + suplier yang sudah pernah dipakai di kertas.
  // Pakai dropdown Popover sungguhan (bukan <datalist> yang sering tidak
  // tampil di browser/HP) supaya daftar selalu muncul saat diklik.
  const [tokoList, setTokoList] = useState<TokoItem[]>([])
  const [suplierDropdownOpen, setSuplierDropdownOpen] = useState(false)
  useEffect(() => {
    authFetch('/api/toko-pemasok')
      .then(res => res.ok ? res.json() : [])
      .then((list) => setTokoList(Array.isArray(list) ? list : []))
      .catch(() => { /* diamkan saja — saran suplier opsional */ })
  }, [])
  const suplierOptions = useMemo<SuplierOption[]>(() => {
    const map = new Map<string, SuplierOption>()
    papers.forEach(p => {
      const s = (p.suplier || '').trim()
      if (s && !map.has(s.toLowerCase())) map.set(s.toLowerCase(), { name: s })
    })
    tokoList.forEach(t => {
      const s = (t.namaToko || '').trim()
      if (s && !map.has(s.toLowerCase())) map.set(s.toLowerCase(), { name: s, jenisBarang: t.jenisBarang || undefined })
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'id'))
  }, [papers, tokoList])
  const filteredSuplierOptions = useMemo(() => {
    const q = formData.suplier.trim().toLowerCase()
    if (!q) return suplierOptions
    return suplierOptions.filter(o => o.name.toLowerCase().includes(q))
  }, [suplierOptions, formData.suplier])

  const handleBackup = async () => {
    setBackupLoading('backup')
    try {
      const res = await authFetch(`/api/database/backup-master?table=paper`)
      if (!res.ok) {
        let errMsg = 'Gagal backup data kertas'
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
      a.download = match ? match[1] : `backup-paper-${Date.now()}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Backup berhasil diunduh')
    } catch (e) { console.error('Backup error:', e); toast.error('Gagal backup data kertas') }
    setBackupLoading(null)
  }

  const handleRestore = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xlsx'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      if (!confirm('Data kertas yang ada akan diganti dengan data dari file backup. Lanjutkan?')) return
      setBackupLoading('restore')
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('table', 'paper')
        // Note: do NOT set Content-Type header manually — the browser must
        // auto-generate the multipart/form-data boundary for FormData bodies.
        // authFetch already adds x-user-id / x-user-role headers.
        const res = await authFetch('/api/database/restore-master', {
          method: 'POST',
          body: fd,
        })
        const data = await res.json()
        if (res.ok && data.success) {
          toast.success(`Restore berhasil (${data.count} data)`)
          fetchPapers()
          notifyDataChange('papers')
        } else {
          toast.error(data.error || 'Gagal restore data kertas')
        }
      } catch { toast.error('File backup tidak valid') }
      setBackupLoading(null)
    }
    input.click()
  }

  const calculatePricePerSheet = (pricePerRim: number): number => {
    return Math.round(pricePerRim / 500)
  }

  const filteredPapers = papers.filter(paper =>
    (paper.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
     (paper.suplier || '').toLowerCase().includes(searchTerm.toLowerCase())) &&
    (kategoriFilter === 'all' || paper.kategoriId === kategoriFilter) &&
    (suplierFilter === 'all' || (paper.suplier || '') === (suplierFilter === '__none__' ? '' : suplierFilter))
  )

  // Daftar suplier unik utk filter — suplier terisi + "(Tanpa suplier)" bila ada kertas tanpa suplier
  const suplierFilterOptions = (() => {
    const names = Array.from(new Set(papers.map(p => (p.suplier || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'id'))
    const hasEmpty = papers.some(p => !(p.suplier || '').trim())
    return { names, hasEmpty }
  })()

  const handleAdd = () => {
    setEditingPaper(null)
    setFormData({
      name: '',
      grammage: '',
      width: '',
      height: '',
      pricePerRim: '',
      pricePerKg: '',
      kategoriId: '',
      suplier: ''
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
      pricePerKg: calculatedPricePerKg.toString(),
      kategoriId: paper.kategoriId || '',
      suplier: paper.suplier || ''
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
    printWindow.document.write('<thead><tr><th>No</th><th>Nama Bahan</th><th>Suplier</th><th>Gramatur</th><th>Ukuran (cm)</th><th>Harga/Rim</th><th>Harga/Lembar</th></tr></thead>')
    printWindow.document.write('<tbody>')

    filteredPapers.forEach((paper, index) => {
      const pricePerSheet = calculatePricePerSheet(paper.pricePerRim)
      printWindow.document.write(`
        <tr>
          <td>${index + 1}</td>
          <td>${paper.name}</td>
          <td>${paper.suplier || '-'}</td>
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
      kategoriId: formData.kategoriId || null,
      suplier: formData.suplier.trim() || null,
    }

    handleSave(saveData)
  }

  const handleSave = async (data: { name: string; grammage: number; width: number; height: number; pricePerRim: number; kategoriId: string | null; suplier: string | null }) => {
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
          {/* Nama saja — suplier sudah tampil di kolom "Suplier"
              (subtitle di bawah nama membuat suplier tampil dobel). */}
          <span className="font-medium text-slate-800 truncate block">{paper.name}</span>
        </div>
      )
    },
    {
      key: 'suplier',
      title: 'Suplier',
      render: (paper: Paper) => (
        <span className="text-slate-600">{paper.suplier || '—'}</span>
      )
    },
    {
      key: 'kategori',
      title: 'Kategori',
      render: (paper: Paper) => (
        <span className="text-slate-600">{paper.kategori?.nama || '—'}</span>
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
      <div className="bg-card rounded-xl shadow-sm border border-slate-200">
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
          <div className="w-full lg:w-48">
            <Select value={kategoriFilter} onValueChange={setKategoriFilter}>
              <SelectTrigger className="w-full" aria-label="Filter kategori">
                <SelectValue placeholder="Semua kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua kategori</SelectItem>
                {kategoriList.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    {k.nama}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full lg:w-44">
            <Select value={suplierFilter} onValueChange={setSuplierFilter}>
              <SelectTrigger className="w-full" aria-label="Filter suplier">
                <SelectValue placeholder="Semua suplier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua suplier</SelectItem>
                {suplierFilterOptions.names.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
                {suplierFilterOptions.hasEmpty && (
                  <SelectItem value="__none__">(Tanpa suplier)</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 w-full lg:w-auto flex-wrap">
            <Button onClick={handlePrint} variant="outline" className="flex-1 lg:flex-none">
              <Printer className="w-4 h-4 mr-2" />
              Cetak Tabel
            </Button>
            <Button
              onClick={handleBackup}
              variant="outline"
              disabled={backupLoading === 'backup'}
              className="flex-1 lg:flex-none"
            >
              {backupLoading === 'backup' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DatabaseBackup className="w-4 h-4 mr-2" />}
              Backup
            </Button>
            <Button
              onClick={handleRestore}
              variant="outline"
              disabled={backupLoading === 'restore'}
              className="flex-1 lg:flex-none"
            >
              {backupLoading === 'restore' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Restore
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

              {/* Suplier (opsional — untuk membedakan harga antar suplier).
                  Dropdown Popover selalu tampil saat input diklik / ikon ▼. */}
              <div className="space-y-1.5">
                <Label htmlFor="suplier" className="text-sm font-medium">
                  Suplier
                </Label>
                <Popover open={suplierDropdownOpen} onOpenChange={setSuplierDropdownOpen}>
                  <PopoverAnchor asChild>
                    <div className="relative">
                      <Input
                        id="suplier"
                        type="text"
                        placeholder="Ketik atau pilih suplier (opsional)"
                        value={formData.suplier}
                        onChange={(e) => setFormData({ ...formData, suplier: e.target.value })}
                        onClick={() => setSuplierDropdownOpen(true)}
                        autoComplete="off"
                        role="combobox"
                        aria-expanded={suplierDropdownOpen}
                        aria-controls="suplier-dropdown-list"
                        className="pr-9"
                      />
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          tabIndex={-1}
                          aria-label="Buka daftar suplier"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </PopoverTrigger>
                    </div>
                  </PopoverAnchor>
                  <PopoverContent
                    align="start"
                    className="p-0 w-[var(--radix-popover-trigger-width)] max-h-60 overflow-y-auto"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                  >
                    <div id="suplier-dropdown-list" role="listbox" aria-label="Daftar suplier">
                      {filteredSuplierOptions.length > 0 && (
                        <>
                          <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase bg-slate-50 border-b border-slate-100 sticky top-0">Master Suplier</div>
                          {filteredSuplierOptions.map((o) => (
                            <button
                              key={o.name}
                              type="button"
                              role="option"
                              aria-selected={formData.suplier === o.name}
                              onMouseDown={(e) => { e.preventDefault(); setFormData(prev => ({ ...prev, suplier: o.name })); setSuplierDropdownOpen(false) }}
                              className={`w-full text-left px-3 py-2 text-sm transition-colors ${formData.suplier === o.name ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'}`}
                            >
                              <span className="truncate">{o.name}</span>
                              {o.jenisBarang && <span className="text-slate-400 ml-1.5 text-[11px]">({o.jenisBarang})</span>}
                            </button>
                          ))}
                        </>
                      )}
                      {filteredSuplierOptions.length === 0 && (
                        <div className="px-3 py-3 text-sm text-slate-400 text-center">
                          {suplierOptions.length === 0
                            ? 'Belum ada suplier — tambahkan dulu di menu Master Toko Pemasok, atau ketik nama manual di kolom ini'
                            : 'Tidak ada suplier yang cocok — ketik nama manual di kolom ini'}
                        </div>
                      )}
                      {formData.suplier.trim() && (
                        <button
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); setFormData(prev => ({ ...prev, suplier: '' })) }}
                          className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 border-t border-slate-100"
                        >
                          Hapus nama suplier
                        </button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Kategori (opsional — dari Daftar Kategori) */}
              <div className="space-y-1.5">
                <Label htmlFor="kategori" className="text-sm font-medium">
                  Kategori
                </Label>
                <Select
                  value={formData.kategoriId || 'none'}
                  onValueChange={(value) =>
                    setFormData({ ...formData, kategoriId: value === 'none' ? '' : value })
                  }
                >
                  <SelectTrigger id="kategori" className="w-full">
                    <SelectValue placeholder="Tanpa kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tanpa kategori</SelectItem>
                    {kategoriList.map((k) => (
                      <SelectItem key={k.id} value={k.id}>
                        {k.nama}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
