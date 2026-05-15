'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useLanguage } from '@/contexts/language-context'
import { getAuthUser } from '@/lib/auth'
import {
  Plus, Search, FileText, Trash2, Eye, Printer, ShoppingCart,
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

interface PurchaseOrderItem {
  description: string
  qty: number
  unit: string
  price: number
  total: number
  notes: string
}

interface PurchaseOrder {
  id: string
  poNumber: string
  supplierName: string
  supplierAddress: string
  supplierPhone: string
  orderDate: string
  deliveryDate: string
  items: string
  subtotal: number
  tax: number
  total: number
  notes: string
  status: string
  createdAt: string
}

const emptyItem = (): PurchaseOrderItem => ({ description: '', qty: 1, unit: 'pcs', price: 0, total: 0, notes: '' })

export default function PurchaseOrderPage() {
  const { t } = useLanguage()
  const [poList, setPoList] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewItem, setPreviewItem] = useState<PurchaseOrder | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editId, setEditId] = useState('')

  // Form state
  const [form, setForm] = useState({
    supplierName: '', supplierAddress: '', supplierPhone: '',
    orderDate: new Date().toISOString().split('T')[0],
    deliveryDate: new Date().toISOString().split('T')[0],
    notes: '',
  })
  const [formItems, setFormItems] = useState<PurchaseOrderItem[]>([emptyItem()])

  const calculatedSubtotal = formItems.reduce((sum, item) => sum + (item.qty * item.price), 0)
  const calculatedTax = Math.round(calculatedSubtotal * 0.11)
  const calculatedTotal = calculatedSubtotal + calculatedTax

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (filterStatus && filterStatus !== 'all') params.set('status', filterStatus)
      const res = await fetch(`/api/purchase-order?${params}`)
      const data = await res.json()
      setPoList(Array.isArray(data) ? data : [])
    } catch { setPoList([]) }
    setLoading(false)
  }, [search, filterStatus])

  useEffect(() => { fetchData() }, [fetchData])

  useDataChange(['purchase-order'], () => { fetchData() })

  const openCreate = () => {
    setIsEditing(false)
    setEditId('')
    setForm({
      supplierName: '', supplierAddress: '', supplierPhone: '',
      orderDate: new Date().toISOString().split('T')[0],
      deliveryDate: new Date().toISOString().split('T')[0],
      notes: '',
    })
    setFormItems([emptyItem()])
    setDialogOpen(true)
  }

  const openEdit = (po: PurchaseOrder) => {
    setIsEditing(true)
    setEditId(po.id)
    setForm({
      supplierName: po.supplierName, supplierAddress: po.supplierAddress,
      supplierPhone: po.supplierPhone, orderDate: po.orderDate,
      deliveryDate: po.deliveryDate, notes: po.notes,
    })
    setFormItems(JSON.parse(po.items || '[]'))
    setDialogOpen(true)
  }

  const handleSave = async () => {
    try {
      const payload = {
        ...form,
        items: JSON.stringify(formItems),
        subtotal: calculatedSubtotal,
        tax: calculatedTax,
        total: calculatedTotal,
        userId: getAuthUser()?.id,
      }
      let res: Response
      if (isEditing) {
        res = await fetch(`/api/purchase-order/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch('/api/purchase-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      if (res.ok) {
        const savedPO = isEditing ? null : await res.json()
        toast.success(isEditing ? 'Purchase Order berhasil diperbarui!' : 'Purchase Order berhasil dibuat!')
        setDialogOpen(false)
        if (isEditing) {
          setPoList(prev => prev.map(po => po.id === editId ? { ...po, ...form, items: JSON.stringify(formItems), subtotal: calculatedSubtotal, tax: calculatedTax, total: calculatedTotal } : po))
        } else if (savedPO) {
          setPoList(prev => [savedPO, ...prev])
        }
        notifyDataChange('purchase-order')
      } else {
        toast.error('Gagal menyimpan Purchase Order')
      }
    } catch { toast.error('Gagal menyimpan Purchase Order') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Beneran mau dihapus nih?')) return
    try {
      const res = await fetch(`/api/purchase-order/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Purchase Order berhasil dihapus')
        setPoList(prev => prev.filter(po => po.id !== id))
        notifyDataChange('purchase-order')
      } else {
        toast.error('Gagal menghapus')
      }
    } catch { toast.error('Gagal menghapus') }
  }

  const formatRp = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)

  const handlePrint = (po: PurchaseOrder) => {
    const items = JSON.parse(po.items || '[]')
    const printWin = window.open('', '_blank')
    if (!printWin) return
    printWin.document.write(`<!DOCTYPE html><html><head><title>Purchase Order ${po.poNumber}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, sans-serif; padding: 40px; color: #1a1a1a; font-size: 13px; }
      .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 16px; }
      .header h1 { font-size: 20px; font-weight: bold; }
      .header h2 { font-size: 14px; color: #555; margin-top: 4px; }
      .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
      .meta h3 { font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 6px; }
      .meta p { margin-bottom: 2px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      th { background: #2563eb; color: white; padding: 10px 12px; text-align: left; font-size: 12px; }
      td { padding: 8px 12px; border-bottom: 1px solid #eee; }
      tr:nth-child(even) { background: #fafafa; }
      .totals { margin-top: 16px; text-align: right; }
      .totals p { margin-bottom: 4px; }
      .totals .grand { font-size: 16px; font-weight: bold; border-top: 2px solid #333; padding-top: 8px; }
      .notes { margin-top: 20px; padding: 12px; background: #f8fafc; border-radius: 6px; }
      .footer { margin-top: 40px; display: flex; justify-content: space-between; }
      .footer .box { text-align: center; width: 180px; }
      .footer .line { border-top: 1px solid #333; margin-top: 60px; }
      @media print { body { padding: 20px; } }
    </style></head><body>
    <div class="header">
      <h1>PURCHASE ORDER</h1>
      <h2>${po.poNumber}</h2>
    </div>
    <div class="meta">
      <div><h3>Supplier</h3><p><strong>${po.supplierName}</strong></p>${po.supplierAddress ? `<p>${po.supplierAddress}</p>` : ''}${po.supplierPhone ? `<p>Telp: ${po.supplierPhone}</p>` : ''}</div>
      <div><h3>Detail Pesanan</h3><p>Tgl Pesan: <strong>${po.orderDate}</strong></p><p>Tgl Kirim: <strong>${po.deliveryDate}</strong></p></div>
    </div>
    <table><thead><tr><th>No</th><th>Deskripsi Barang</th><th style="text-align:center">Qty</th><th>Satuan</th><th style="text-align:right">Harga</th><th style="text-align:right">Total</th></tr></thead><tbody>
    ${items.map((item: PurchaseOrderItem, i: number) => `<tr><td>${i + 1}</td><td>${item.description}</td><td style="text-align:center">${item.qty}</td><td>${item.unit || '-'}</td><td style="text-align:right">${formatRp(item.price)}</td><td style="text-align:right">${formatRp(item.qty * item.price)}</td></tr>`).join('')}
    </tbody></table>
    <div class="totals">
      <p>Sub Total: ${formatRp(po.subtotal)}</p>
      <p>PPN 11%: ${formatRp(po.tax)}</p>
      <p class="grand">Grand Total: ${formatRp(po.total)}</p>
    </div>
    ${po.notes ? `<div class="notes"><strong>Catatan:</strong><br/>${po.notes}</div>` : ''}
    <div class="footer">
      <div class="box"><p>Pemesan</p><div class="line"></div></div>
      <div class="box"><p>Menyetujui</p><div class="line"></div></div>
      <div class="box"><p>Supplier</p><div class="line"></div></div>
    </div>
    <script>window.onload=()=>{window.print()}<\/script>
    </body></html>`)
    printWin.document.close()
  }

  const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
    draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700', icon: AlertCircle },
    ordered: { label: 'Dipesan', color: 'bg-blue-100 text-blue-700', icon: Clock },
    received: { label: 'Diterima', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
    cancelled: { label: 'Batal', color: 'bg-red-100 text-red-700', icon: XCircle },
  }

  const updateItem = (idx: number, field: keyof PurchaseOrderItem, value: any) => {
    setFormItems(prev => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], [field]: value }
      if (field === 'qty' || field === 'price') {
        updated[idx].total = updated[idx].qty * updated[idx].price
      }
      return updated
    })
  }

  return (
    <DashboardLayout title={t('purchase_order') || 'Purchase Order'} subtitle={t('subtitle_purchase_order') || 'Kelola purchase order pembelian'}>
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
            <SelectItem value="ordered">Dipesan</SelectItem>
            <SelectItem value="received">Diterima</SelectItem>
            <SelectItem value="cancelled">Batal</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={openCreate} className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white whitespace-nowrap">
          <Plus className="w-4 h-4 mr-1" /> {t('tambah')} PO
        </Button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">No. PO</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Supplier</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Tgl Pesan</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Total</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">{t('aksi')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">{t('loading')}</td></tr>
              ) : poList.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">{t('tidak_ada_data')}</td></tr>
              ) : (
                poList.map(po => {
                  const sc = statusConfig[po.status] || statusConfig.draft
                  return (
                    <tr key={po.id} className="border-b hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-blue-600">{po.poNumber}</td>
                      <td className="px-4 py-3">{po.supplierName}</td>
                      <td className="px-4 py-3 text-gray-500">{po.orderDate}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatRp(po.total)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className={`${sc.color} text-[11px]`}>
                          <sc.icon className="w-3 h-3 mr-1" />{sc.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => { setPreviewItem(po); setPreviewOpen(true) }} className="p-1.5 hover:bg-blue-50 rounded-lg"><Eye className="w-4 h-4 text-blue-500" /></button>
                          <button onClick={() => openEdit(po)} className="p-1.5 hover:bg-yellow-50 rounded-lg"><FileText className="w-4 h-4 text-yellow-500" /></button>
                          <button onClick={() => handlePrint(po)} className="p-1.5 hover:bg-green-50 rounded-lg"><Printer className="w-4 h-4 text-green-500" /></button>
                          <button onClick={() => handleDelete(po.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4 text-red-400" /></button>
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
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-blue-500" />
              {isEditing ? 'Edit Purchase Order' : 'Buat Purchase Order Baru'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Nama Supplier</Label>
                <Input value={form.supplierName} onChange={e => setForm({ ...form, supplierName: e.target.value })} placeholder="Nama supplier" />
              </div>
              <div className="col-span-2">
                <Label>Alamat Supplier</Label>
                <Input value={form.supplierAddress} onChange={e => setForm({ ...form, supplierAddress: e.target.value })} placeholder="Alamat supplier" />
              </div>
              <div>
                <Label>{t('telepon')}</Label>
                <Input value={form.supplierPhone} onChange={e => setForm({ ...form, supplierPhone: e.target.value })} placeholder="No. Telepon" />
              </div>
              <div>
                <Label>Tanggal Pesan</Label>
                <Input type="date" value={form.orderDate} onChange={e => setForm({ ...form, orderDate: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Tanggal Pengiriman</Label>
                <Input type="date" value={form.deliveryDate} onChange={e => setForm({ ...form, deliveryDate: e.target.value })} />
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
                    <div className="col-span-3">
                      {idx === 0 && <p className="text-[11px] text-gray-400 mb-1">Deskripsi</p>}
                      <Input value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} placeholder="Nama barang" className="h-9 text-sm" />
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && <p className="text-[11px] text-gray-400 mb-1">Qty</p>}
                      <Input type="number" value={item.qty} onChange={e => updateItem(idx, 'qty', Number(e.target.value))} className="h-9 text-sm" />
                    </div>
                    <div className="col-span-1">
                      {idx === 0 && <p className="text-[11px] text-gray-400 mb-1">Satuan</p>}
                      <Input value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} placeholder="pcs" className="h-9 text-sm" />
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && <p className="text-[11px] text-gray-400 mb-1">Harga</p>}
                      <Input type="number" value={item.price} onChange={e => updateItem(idx, 'price', Number(e.target.value))} className="h-9 text-sm" />
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && <p className="text-[11px] text-gray-400 mb-1">Total</p>}
                      <Input value={formatRp(item.qty * item.price)} readOnly className="h-9 text-sm bg-gray-50" />
                    </div>
                    <div className="col-span-2 flex items-center gap-1">
                      <Input value={item.notes} onChange={e => updateItem(idx, 'notes', e.target.value)} placeholder="Ket." className="h-9 text-sm" />
                      {formItems.length > 1 && (
                        <button onClick={() => setFormItems(formItems.filter((_, i) => i !== idx))} className="p-2 hover:bg-red-50 rounded-lg flex-shrink-0">
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Sub Total</span>
                <span className="font-medium">{formatRp(calculatedSubtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">PPN 11%</span>
                <span className="font-medium">{formatRp(calculatedTax)}</span>
              </div>
              <div className="flex justify-between text-base font-bold border-t pt-2">
                <span>Grand Total</span>
                <span className="text-blue-600">{formatRp(calculatedTotal)}</span>
              </div>
            </div>

            <div>
              <Label>Catatan</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Catatan tambahan (opsional)" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('batal')}</Button>
            <Button onClick={handleSave} className="bg-gradient-to-r from-blue-600 to-blue-500 text-white">{t('simpan')}</Button>
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
                  <ShoppingCart className="w-5 h-5 text-blue-500" />
                  {previewItem.poNumber}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-[11px] text-gray-400">Supplier</p><p className="font-medium">{previewItem.supplierName}</p></div>
                  <div><p className="text-[11px] text-gray-400">Tgl Pesan</p><p className="font-medium">{previewItem.orderDate}</p></div>
                  <div><p className="text-[11px] text-gray-400">Tgl Kirim</p><p className="font-medium">{previewItem.deliveryDate}</p></div>
                  <div>
                    <p className="text-[11px] text-gray-400">Status</p>
                    {(() => { const sc = statusConfig[previewItem.status] || statusConfig.draft; return <Badge variant="secondary" className={`${sc.color} text-[11px]`}>{sc.label}</Badge> })()}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <div className="flex justify-between"><span className="text-gray-500">Sub Total</span><span>{formatRp(previewItem.subtotal)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">PPN 11%</span><span>{formatRp(previewItem.tax)}</span></div>
                  <div className="flex justify-between font-bold border-t pt-1"><span>Grand Total</span><span className="text-blue-600">{formatRp(previewItem.total)}</span></div>
                </div>
                {previewItem.notes && <div className="bg-gray-50 rounded-lg p-3"><p className="text-[11px] text-gray-400">Catatan</p><p>{previewItem.notes}</p></div>}
              </div>
              <DialogFooter className="flex gap-2">
                <Button variant="outline" onClick={() => { openEdit(previewItem); setPreviewOpen(false) }} className="flex-1">{t('edit')}</Button>
                <Button onClick={() => { handlePrint(previewItem); setPreviewOpen(false) }} className="flex-1 bg-gradient-to-r from-blue-600 to-blue-500 text-white"><Printer className="w-4 h-4 mr-1" />{t('cetak')}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
