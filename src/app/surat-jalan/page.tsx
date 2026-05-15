'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useLanguage } from '@/contexts/language-context'
import { getAuthUser } from '@/lib/auth'
import {
  Plus, Search, FileText, Trash2, Eye, Printer, Truck,
  CheckCircle2, Clock, XCircle, AlertCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { toast } from 'sonner'
import { notifyDataChange } from '@/lib/data-sync'
import { useDataChange } from '@/hooks/use-data-change'

interface SuratJalanItem {
  description: string
  qty: number
  unit: string
  notes: string
}

interface SuratJalan {
  id: string
  suratJalanNumber: string
  customerName: string
  customerAddress: string
  customerPhone: string
  driverName: string
  vehicleNumber: string
  deliveryDate: string
  items: string
  notes: string
  status: string
  createdAt: string
}

const emptyItem = (): SuratJalanItem => ({ description: '', qty: 1, unit: 'pcs', notes: '' })

export default function SuratJalanPage() {
  const { t } = useLanguage()
  const [suratJalanList, setSuratJalanList] = useState<SuratJalan[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewItem, setPreviewItem] = useState<SuratJalan | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editId, setEditId] = useState('')

  // Form state
  const [form, setForm] = useState({
    customerName: '', customerAddress: '', customerPhone: '',
    driverName: '', vehicleNumber: '',
    deliveryDate: new Date().toISOString().split('T')[0], notes: '',
  })
  const [formItems, setFormItems] = useState<SuratJalanItem[]>([emptyItem()])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const user = getAuthUser()
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (filterStatus && filterStatus !== 'all') params.set('status', filterStatus)
      const res = await fetch(`/api/surat-jalan?${params}`)
      const data = await res.json()
      setSuratJalanList(Array.isArray(data) ? data : [])
    } catch { setSuratJalanList([]) }
    setLoading(false)
  }, [search, filterStatus])

  useEffect(() => { fetchData() }, [fetchData])

  useDataChange(['surat-jalan'], () => { fetchData() })

  const openCreate = () => {
    setIsEditing(false)
    setEditId('')
    setForm({
      customerName: '', customerAddress: '', customerPhone: '',
      driverName: '', vehicleNumber: '',
      deliveryDate: new Date().toISOString().split('T')[0], notes: '',
    })
    setFormItems([emptyItem()])
    setDialogOpen(true)
  }

  const openEdit = (sj: SuratJalan) => {
    setIsEditing(true)
    setEditId(sj.id)
    setForm({
      customerName: sj.customerName, customerAddress: sj.customerAddress,
      customerPhone: sj.customerPhone, driverName: sj.driverName,
      vehicleNumber: sj.vehicleNumber, deliveryDate: sj.deliveryDate,
      notes: sj.notes,
    })
    setFormItems(JSON.parse(sj.items || '[]'))
    setDialogOpen(true)
  }

  const handleSave = async () => {
    const user = getAuthUser()
    try {
      let res: Response
      if (isEditing) {
        res = await fetch(`/api/surat-jalan/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, items: JSON.stringify(formItems) }),
        })
      } else {
        res = await fetch('/api/surat-jalan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, items: JSON.stringify(formItems), userId: user?.id }),
        })
      }
      if (res.ok) {
        const savedSJ = isEditing ? null : await res.json()
        toast.success(isEditing ? 'Surat Jalan berhasil diperbarui!' : 'Surat Jalan berhasil dibuat!')
        setDialogOpen(false)
        // Optimistic update
        if (isEditing) {
          setSuratJalanList(prev => prev.map(sj => sj.id === editId ? { ...sj, ...form, items: JSON.stringify(formItems) } : sj))
        } else if (savedSJ) {
          setSuratJalanList(prev => [savedSJ, ...prev])
        }
        notifyDataChange('surat-jalan')
      } else {
        toast.error('Gagal menyimpan surat jalan')
      }
    } catch { toast.error('Gagal menyimpan surat jalan') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Beneran mau dihapus nih?')) return
    try {
      const res = await fetch(`/api/surat-jalan/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Surat Jalan berhasil dihapus')
        // Optimistic update: remove from state immediately
        setSuratJalanList(prev => prev.filter(sj => sj.id !== id))
        notifyDataChange('surat-jalan')
      } else {
        toast.error('Gagal menghapus')
      }
    } catch { toast.error('Gagal menghapus') }
  }

  const handlePrint = (sj: SuratJalan) => {
    const items = JSON.parse(sj.items || '[]')
    const printWin = window.open('', '_blank')
    if (!printWin) return
    printWin.document.write(`<!DOCTYPE html><html><head><title>Surat Jalan ${sj.suratJalanNumber}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, sans-serif; padding: 40px; color: #1a1a1a; font-size: 13px; }
      .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 16px; }
      .header h1 { font-size: 20px; font-weight: bold; }
      .header h2 { font-size: 14px; color: #555; margin-top: 4px; }
      .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
      .meta div { }
      .meta h3 { font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 6px; }
      .meta p { margin-bottom: 2px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      th { background: #f97316; color: white; padding: 10px 12px; text-align: left; font-size: 12px; }
      td { padding: 8px 12px; border-bottom: 1px solid #eee; }
      tr:nth-child(even) { background: #fafafa; }
      .notes { margin-top: 20px; padding: 12px; background: #f8fafc; border-radius: 6px; }
      .footer { margin-top: 40px; display: flex; justify-content: space-between; }
      .footer .box { text-align: center; width: 180px; }
      .footer .line { border-top: 1px solid #333; margin-top: 60px; }
      @media print { body { padding: 20px; } }
    </style></head><body>
    <div class="header">
      <h1>SURAT JALAN</h1>
      <h2>${sj.suratJalanNumber}</h2>
    </div>
    <div class="meta">
      <div><h3>Kepada</h3><p><strong>${sj.customerName}</strong></p>${sj.customerAddress ? `<p>${sj.customerAddress}</p>` : ''}${sj.customerPhone ? `<p>Telp: ${sj.customerPhone}</p>` : ''}</div>
      <div><h3>Pengiriman</h3><p>Tanggal: <strong>${sj.deliveryDate}</strong></p>${sj.driverName ? `<p>Pengemudi: ${sj.driverName}</p>` : ''}${sj.vehicleNumber ? `<p>No. Kendaraan: ${sj.vehicleNumber}</p>` : ''}</div>
    </div>
    <table><thead><tr><th>No</th><th>Deskripsi Barang</th><th style="text-align:center">Qty</th><th>Satuan</th><th>Keterangan</th></tr></thead><tbody>
    ${items.map((item: SuratJalanItem, i: number) => `<tr><td>${i + 1}</td><td>${item.description}</td><td style="text-align:center">${item.qty}</td><td>${item.unit || '-'}</td><td>${item.notes || '-'}</td></tr>`).join('')}
    </tbody></table>
    ${sj.notes ? `<div class="notes"><strong>Catatan:</strong><br/>${sj.notes}</div>` : ''}
    <div class="footer">
      <div class="box"><p>Penerima</p><div class="line"></div></div>
      <div class="box"><p>Pengirim</p><div class="line"></div></div>
      <div class="box"><p>Supir</p><div class="line"></div></div>
    </div>
    <script>window.onload=()=>{window.print()}<\/script>
    </body></html>`)
    printWin.document.close()
  }

  const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
    draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700', icon: AlertCircle },
    delivered: { label: 'Dikirim', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
    cancelled: { label: 'Batal', color: 'bg-red-100 text-red-700', icon: XCircle },
  }

  const updateItem = (idx: number, field: keyof SuratJalanItem, value: any) => {
    setFormItems(prev => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], [field]: value }
      return updated
    })
  }

  return (
    <DashboardLayout title={t('surat_jalan') || 'Surat Jalan'} subtitle={t('subtitle_surat_jalan') || 'Kelola surat jalan pengiriman'}>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder={t('cari') + '...'} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder={t('semua')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('semua')}</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="delivered">Dikirim</SelectItem>
            <SelectItem value="cancelled">Batal</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={openCreate} className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white whitespace-nowrap">
          <Plus className="w-4 h-4 mr-1" /> {t('tambah')} Surat Jalan
        </Button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">No. Surat Jalan</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">{t('customer_label')}</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Tgl Kirim</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Pengemudi</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">{t('aksi')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">{t('loading')}</td></tr>
              ) : suratJalanList.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">{t('tidak_ada_data')}</td></tr>
              ) : (
                suratJalanList.map(sj => {
                  const sc = statusConfig[sj.status] || statusConfig.draft
                  return (
                    <tr key={sj.id} className="border-b hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-blue-600">{sj.suratJalanNumber}</td>
                      <td className="px-4 py-3">{sj.customerName}</td>
                      <td className="px-4 py-3 text-gray-500">{sj.deliveryDate}</td>
                      <td className="px-4 py-3 text-gray-500">{sj.driverName || '-'}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className={`${sc.color} text-[11px]`}>
                          <sc.icon className="w-3 h-3 mr-1" />{sc.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => { setPreviewItem(sj); setPreviewOpen(true) }} className="p-1.5 hover:bg-blue-50 rounded-lg"><Eye className="w-4 h-4 text-blue-500" /></button>
                          <button onClick={() => openEdit(sj)} className="p-1.5 hover:bg-yellow-50 rounded-lg"><FileText className="w-4 h-4 text-yellow-500" /></button>
                          <button onClick={() => handlePrint(sj)} className="p-1.5 hover:bg-green-50 rounded-lg"><Printer className="w-4 h-4 text-green-500" /></button>
                          <button onClick={() => handleDelete(sj.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4 text-red-400" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Surat Jalan' : 'Buat Surat Jalan Baru'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>{t('nama_customer')}</Label>
                <Input value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} placeholder="Nama pelanggan" />
              </div>
              <div className="col-span-2">
                <Label>Alamat Pengiriman</Label>
                <Input value={form.customerAddress} onChange={e => setForm({ ...form, customerAddress: e.target.value })} placeholder="Alamat tujuan" />
              </div>
              <div>
                <Label>{t('telepon')}</Label>
                <Input value={form.customerPhone} onChange={e => setForm({ ...form, customerPhone: e.target.value })} placeholder="No. Telepon" />
              </div>
              <div>
                <Label>Tanggal Kirim</Label>
                <Input type="date" value={form.deliveryDate} onChange={e => setForm({ ...form, deliveryDate: e.target.value })} />
              </div>
              <div>
                <Label>Pengemudi</Label>
                <Input value={form.driverName} onChange={e => setForm({ ...form, driverName: e.target.value })} placeholder="Nama pengemudi" />
              </div>
              <div>
                <Label>No. Kendaraan</Label>
                <Input value={form.vehicleNumber} onChange={e => setForm({ ...form, vehicleNumber: e.target.value })} placeholder="B 1234 XYZ" />
              </div>
            </div>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="font-semibold">Daftar Barang</Label>
                <Button size="sm" variant="outline" onClick={() => setFormItems([...formItems, emptyItem()])}><Plus className="w-3 h-3 mr-1" />Tambah</Button>
              </div>
              <div className="space-y-2">
                {formItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4">
                      {idx === 0 && <p className="text-[11px] text-gray-400 mb-1">Deskripsi</p>}
                      <Input value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} placeholder="Nama barang" className="h-9 text-sm" />
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && <p className="text-[11px] text-gray-400 mb-1">Qty</p>}
                      <Input type="number" value={item.qty} onChange={e => updateItem(idx, 'qty', Number(e.target.value))} className="h-9 text-sm" />
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && <p className="text-[11px] text-gray-400 mb-1">Satuan</p>}
                      <Input value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} placeholder="pcs" className="h-9 text-sm" />
                    </div>
                    <div className="col-span-3">
                      {idx === 0 && <p className="text-[11px] text-gray-400 mb-1">Keterangan</p>}
                      <Input value={item.notes} onChange={e => updateItem(idx, 'notes', e.target.value)} placeholder="Catatan" className="h-9 text-sm" />
                    </div>
                    <div className="col-span-1">
                      {formItems.length > 1 && (
                        <button onClick={() => setFormItems(formItems.filter((_, i) => i !== idx))} className="p-2 hover:bg-red-50 rounded-lg">
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label>Catatan</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Catatan tambahan (opsional)" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('batal')}</Button>
            <Button onClick={handleSave} className="bg-gradient-to-r from-orange-500 to-amber-500 text-white">{t('simpan')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg">
          {previewItem && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Truck className="w-5 h-5 text-orange-500" />
                  {previewItem.suratJalanNumber}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-[11px] text-gray-400">{t('customer_label')}</p><p className="font-medium">{previewItem.customerName}</p></div>
                  <div><p className="text-[11px] text-gray-400">Tgl Kirim</p><p className="font-medium">{previewItem.deliveryDate}</p></div>
                  <div><p className="text-[11px] text-gray-400">Pengemudi</p><p className="font-medium">{previewItem.driverName || '-'}</p></div>
                  <div><p className="text-[11px] text-gray-400">No. Kendaraan</p><p className="font-medium">{previewItem.vehicleNumber || '-'}</p></div>
                  <div>
                    <p className="text-[11px] text-gray-400">Status</p>
                    {(() => { const sc = statusConfig[previewItem.status] || statusConfig.draft; return <Badge variant="secondary" className={`${sc.color} text-[11px]`}>{sc.label}</Badge> })()}
                  </div>
                </div>
                {previewItem.notes && <div className="bg-gray-50 rounded-lg p-3"><p className="text-[11px] text-gray-400">Catatan</p><p>{previewItem.notes}</p></div>}
              </div>
              <DialogFooter className="flex gap-2">
                <Button variant="outline" onClick={() => { openEdit(previewItem); setPreviewOpen(false) }} className="flex-1">{t('edit')}</Button>
                <Button onClick={() => { handlePrint(previewItem); setPreviewOpen(false) }} className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white"><Printer className="w-4 h-4 mr-1" />{t('cetak')}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
