'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useLanguage } from '@/contexts/language-context'
import { getAuthUser } from '@/lib/auth'
import {
  Plus, Search, FileText, Trash2, Eye, Printer, Download,
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

interface InvoiceItem {
  description: string
  qty: number
  price: number
  total: number
}

interface Invoice {
  id: string
  invoiceNumber: string
  customerName: string
  customerAddress: string
  customerPhone: string
  customerEmail: string
  invoiceDate: string
  dueDate: string
  items: string
  subTotal: number
  discount: number
  tax: number
  grandTotal: number
  notes: string
  status: string
  createdAt: string
}

const emptyItem = (): InvoiceItem => ({ description: '', qty: 1, price: 0, total: 0 })

export default function InvoicePage() {
  const { t } = useLanguage()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewItem, setPreviewItem] = useState<Invoice | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editId, setEditId] = useState('')

  // Form state
  const [form, setForm] = useState({
    customerName: '', customerAddress: '', customerPhone: '', customerEmail: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: '', discount: 0, tax: 0, notes: '',
  })
  const [formItems, setFormItems] = useState<InvoiceItem[]>([emptyItem()])
  const [customers, setCustomers] = useState<{ id: string; name: string; companyName: string | null; address: string; phone: string; email: string }[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('')

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await fetch('/api/customers')
      const data = await res.json()
      setCustomers(Array.isArray(data) ? data : [])
    } catch { setCustomers([]) }
  }, [])

  useEffect(() => { fetchCustomers() }, [fetchCustomers])

  const handleCustomerSelect = (customerId: string) => {
    setSelectedCustomerId(customerId)
    if (customerId) {
      const c = customers.find(c => c.id === customerId)
      if (c) {
        setForm(prev => ({
          ...prev,
          customerName: c.name,
          customerAddress: c.address,
          customerPhone: c.phone,
          customerEmail: c.email,
        }))
      }
    }
  }

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    try {
      const user = getAuthUser()
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (filterStatus && filterStatus !== 'all') params.set('status', filterStatus)
      const res = await fetch(`/api/invoices?${params}`)
      const data = await res.json()
      setInvoices(Array.isArray(data) ? data : [])
    } catch { setInvoices([]) }
    setLoading(false)
  }, [search, filterStatus])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])

  useDataChange(['invoice'], () => { fetchInvoices() })

  const openCreate = () => {
    setIsEditing(false)
    setEditId('')
    setSelectedCustomerId('')
    setForm({
      customerName: '', customerAddress: '', customerPhone: '', customerEmail: '',
      invoiceDate: new Date().toISOString().split('T')[0],
      dueDate: '', discount: 0, tax: 0, notes: '',
    })
    setFormItems([emptyItem()])
    setDialogOpen(true)
  }

  const openEdit = (inv: Invoice) => {
    setIsEditing(true)
    setEditId(inv.id)
    setForm({
      customerName: inv.customerName,
      customerAddress: inv.customerAddress,
      customerPhone: inv.customerPhone,
      customerEmail: inv.customerEmail,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      discount: inv.discount,
      tax: inv.tax,
      notes: inv.notes,
    })
    setFormItems(JSON.parse(inv.items || '[]'))
    setDialogOpen(true)
  }

  const calcSubTotal = () => formItems.reduce((s, i) => s + (i.qty * i.price), 0)
  const calcGrandTotal = () => {
    const sub = calcSubTotal()
    return sub - (form.discount || 0) + (form.tax || 0)
  }

  const handleSave = async () => {
    const subTotal = calcSubTotal()
    const grandTotal = calcGrandTotal()
    const items = formItems.map(i => ({ ...i, total: i.qty * i.price }))

    try {
      const user = getAuthUser()
      let res: Response
      if (isEditing) {
        res = await fetch(`/api/invoices/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, items: JSON.stringify(items), subTotal, grandTotal }),
        })
      } else {
        res = await fetch('/api/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, items: JSON.stringify(items), subTotal, grandTotal, userId: user?.id }),
        })
      }
      if (res.ok) {
        const savedInvoice = isEditing ? null : await res.json()
        toast.success(isEditing ? 'Invoice berhasil diperbarui!' : 'Invoice berhasil dibuat!')
        setDialogOpen(false)
        // Optimistic update
        if (isEditing) {
          setInvoices(prev => prev.map(inv => inv.id === editId ? { ...inv, ...form, items: JSON.stringify(formItems.map(i => ({ ...i, total: i.qty * i.price }))), subTotal, grandTotal } : inv))
        } else if (savedInvoice) {
          setInvoices(prev => [savedInvoice, ...prev])
        }
        notifyDataChange('invoice')
      } else {
        toast.error('Gagal menyimpan invoice')
      }
    } catch {
      toast.error('Gagal menyimpan invoice')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Beneran mau dihapus nih?')) return
    try {
      const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Invoice berhasil dihapus')
        // Optimistic update: remove from state immediately
        setInvoices(prev => prev.filter(inv => inv.id !== id))
        notifyDataChange('invoice')
      } else {
        toast.error('Gagal menghapus')
      }
    } catch { toast.error('Gagal menghapus') }
  }

  const handlePrint = (inv: Invoice) => {
    const items = JSON.parse(inv.items || '[]')
    const printWin = window.open('', '_blank')
    if (!printWin) return
    printWin.document.write(`<!DOCTYPE html><html><head><title>Invoice ${inv.invoiceNumber}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, sans-serif; padding: 40px; color: #1a1a1a; font-size: 13px; }
      .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
      .header h1 { font-size: 24px; color: #f97316; }
      .header .info p { margin-bottom: 4px; color: #555; }
      .meta { display: flex; justify-content: space-between; margin-bottom: 24px; }
      .meta div { flex: 1; }
      .meta h3 { font-size: 12px; text-transform: uppercase; color: #888; margin-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      th { background: #f97316; color: white; padding: 10px 12px; text-align: left; font-size: 12px; }
      td { padding: 8px 12px; border-bottom: 1px solid #eee; }
      tr:nth-child(even) { background: #fafafa; }
      .totals { margin-left: auto; width: 280px; }
      .totals .row { display: flex; justify-content: space-between; padding: 6px 0; }
      .totals .row.grand { font-size: 16px; font-weight: bold; border-top: 2px solid #f97316; padding-top: 10px; margin-top: 6px; }
      .notes { margin-top: 24px; padding: 12px; background: #fff8f0; border-radius: 8px; }
      .footer { margin-top: 40px; display: flex; justify-content: space-between; }
      .footer .box { text-align: center; width: 180px; }
      .footer .line { border-top: 1px solid #333; margin-top: 60px; }
      @media print { body { padding: 20px; } }
    </style></head><body>
    <div class="header">
      <div><h1>INVOICE</h1><p class="info">${inv.invoiceNumber}</p></div>
      <div class="info" style="text-align:right;">
        <p><strong>${new Date(inv.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></p>
        ${inv.dueDate ? `<p>Jatuh Tempo: ${inv.dueDate}</p>` : ''}
      </div>
    </div>
    <div class="meta">
      <div><h3>Kepada</h3><p><strong>${inv.customerName}</strong></p>${inv.customerAddress ? `<p>${inv.customerAddress}</p>` : ''}${inv.customerPhone ? `<p>Telp: ${inv.customerPhone}</p>` : ''}${inv.customerEmail ? `<p>${inv.customerEmail}</p>` : ''}</div>
    </div>
    <table><thead><tr><th>No</th><th>Deskripsi</th><th style="text-align:center">Qty</th><th style="text-align:right">Harga</th><th style="text-align:right">Total</th></tr></thead><tbody>
    ${items.map((item: InvoiceItem, i: number) => `<tr><td>${i + 1}</td><td>${item.description}</td><td style="text-align:center">${item.qty}</td><td style="text-align:right">${(item.price || 0).toLocaleString('id-ID')}</td><td style="text-align:right">${((item.qty || 0) * (item.price || 0)).toLocaleString('id-ID')}</td></tr>`).join('')}
    </tbody></table>
    <div class="totals">
      <div class="row"><span>Sub Total</span><span>Rp ${(inv.subTotal || 0).toLocaleString('id-ID')}</span></div>
      ${inv.discount ? `<div class="row"><span>Diskon</span><span>- Rp ${(inv.discount || 0).toLocaleString('id-ID')}</span></div>` : ''}
      ${inv.tax ? `<div class="row"><span>Pajak</span><span>+ Rp ${(inv.tax || 0).toLocaleString('id-ID')}</span></div>` : ''}
      <div class="row grand"><span>Grand Total</span><span>Rp ${(inv.grandTotal || 0).toLocaleString('id-ID')}</span></div>
    </div>
    ${inv.notes ? `<div class="notes"><strong>Catatan:</strong><br/>${inv.notes}</div>` : ''}
    <div class="footer">
      <div class="box"><p>Penerima</p><div class="line"></div></div>
      <div class="box"><p>Hormat kami</p><div class="line"></div></div>
    </div>
    <script>window.onload=()=>{window.print()}<\/script>
    </body></html>`)
    printWin.document.close()
  }

  const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
    draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700', icon: AlertCircle },
    sent: { label: 'Terkirim', color: 'bg-blue-100 text-blue-700', icon: Clock },
    paid: { label: 'Lunas', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
    cancelled: { label: 'Batal', color: 'bg-red-100 text-red-700', icon: XCircle },
  }

  const updateItem = (idx: number, field: keyof InvoiceItem, value: any) => {
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
    <DashboardLayout title={t('invoice') || 'Invoice'} subtitle={t('subtitle_invoice') || 'Kelola invoice penjualan'}>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder={t('cari') + '...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder={t('semua')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('semua')}</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Terkirim</SelectItem>
            <SelectItem value="paid">Lunas</SelectItem>
            <SelectItem value="cancelled">Batal</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={openCreate} className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white whitespace-nowrap">
          <Plus className="w-4 h-4 mr-1" /> {t('tambah')} Invoice
        </Button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">No. Invoice</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">{t('customer_label')}</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">{t('tanggal')}</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">{t('grand_total')}</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">{t('aksi')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">{t('loading')}</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">{t('tidak_ada_data')}</td></tr>
              ) : (
                invoices.map(inv => {
                  const sc = statusConfig[inv.status] || statusConfig.draft
                  return (
                    <tr key={inv.id} className="border-b hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-blue-600">{inv.invoiceNumber}</td>
                      <td className="px-4 py-3">{inv.customerName}</td>
                      <td className="px-4 py-3 text-gray-500">{inv.invoiceDate}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className={`${sc.color} text-[11px]`}>
                          <sc.icon className="w-3 h-3 mr-1" />{sc.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">Rp {(inv.grandTotal || 0).toLocaleString('id-ID')}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => { setPreviewItem(inv); setPreviewOpen(true) }} className="p-1.5 hover:bg-blue-50 rounded-lg" title={t('lihat_detail')}><Eye className="w-4 h-4 text-blue-500" /></button>
                          <button onClick={() => openEdit(inv)} className="p-1.5 hover:bg-yellow-50 rounded-lg" title={t('edit')}><FileText className="w-4 h-4 text-yellow-500" /></button>
                          <button onClick={() => handlePrint(inv)} className="p-1.5 hover:bg-green-50 rounded-lg" title={t('cetak')}><Printer className="w-4 h-4 text-green-500" /></button>
                          <button onClick={() => handleDelete(inv.id)} className="p-1.5 hover:bg-red-50 rounded-lg" title={t('hapus')}><Trash2 className="w-4 h-4 text-red-400" /></button>
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
            <DialogTitle>{isEditing ? 'Edit Invoice' : 'Buat Invoice Baru'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Pilih dari Master Customer</Label>
                <Select value={selectedCustomerId} onValueChange={handleCustomerSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="-- Pilih Customer --" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}{c.companyName ? ` (${c.companyName})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>{t('nama_customer')}</Label>
                <Input value={form.customerName} onChange={e => { setForm({ ...form, customerName: e.target.value }); setSelectedCustomerId('') }} placeholder="Nama pelanggan" />
              </div>
              <div className="col-span-2">
                <Label>Alamat</Label>
                <Input value={form.customerAddress} onChange={e => setForm({ ...form, customerAddress: e.target.value })} placeholder="Alamat pelanggan" />
              </div>
              <div>
                <Label>{t('telepon')}</Label>
                <Input value={form.customerPhone} onChange={e => setForm({ ...form, customerPhone: e.target.value })} placeholder="No. Telepon" />
              </div>
              <div>
                <Label>{t('email')}</Label>
                <Input value={form.customerEmail} onChange={e => setForm({ ...form, customerEmail: e.target.value })} placeholder="Email" />
              </div>
              <div>
                <Label>Tanggal Invoice</Label>
                <Input type="date" value={form.invoiceDate} onChange={e => setForm({ ...form, invoiceDate: e.target.value })} />
              </div>
              <div>
                <Label>Jatuh Tempo</Label>
                <Input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
              </div>
            </div>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="font-semibold">Item</Label>
                <Button size="sm" variant="outline" onClick={() => setFormItems([...formItems, emptyItem()])}><Plus className="w-3 h-3 mr-1" />Tambah</Button>
              </div>
              <div className="space-y-2">
                {formItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      {idx === 0 && <p className="text-[11px] text-gray-400 mb-1">Deskripsi</p>}
                      <Input value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} placeholder="Nama item" className="h-9 text-sm" />
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && <p className="text-[11px] text-gray-400 mb-1">Qty</p>}
                      <Input type="number" value={item.qty} onChange={e => updateItem(idx, 'qty', Number(e.target.value))} className="h-9 text-sm" />
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && <p className="text-[11px] text-gray-400 mb-1">Harga</p>}
                      <Input type="number" value={item.price} onChange={e => updateItem(idx, 'price', Number(e.target.value))} className="h-9 text-sm" />
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && <p className="text-[11px] text-gray-400 mb-1">Total</p>}
                      <div className="h-9 flex items-center text-sm font-medium px-2 bg-gray-50 rounded-md">{(item.qty * item.price).toLocaleString('id-ID')}</div>
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

            {/* Totals */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Sub Total</span><span>Rp {calcSubTotal().toLocaleString('id-ID')}</span></div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px]">Diskon (Rp)</Label>
                  <Input type="number" value={form.discount} onChange={e => setForm({ ...form, discount: Number(e.target.value) })} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-[11px]">Pajak (Rp)</Label>
                  <Input type="number" value={form.tax} onChange={e => setForm({ ...form, tax: Number(e.target.value) })} className="h-8 text-sm" />
                </div>
              </div>
              <div className="flex justify-between text-lg font-bold pt-2 border-t"><span>Grand Total</span><span className="text-orange-600">Rp {calcGrandTotal().toLocaleString('id-ID')}</span></div>
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
                  <FileText className="w-5 h-5 text-orange-500" />
                  {previewItem.invoiceNumber}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-[11px] text-gray-400">{t('customer_label')}</p><p className="font-medium">{previewItem.customerName}</p></div>
                  <div><p className="text-[11px] text-gray-400">{t('tanggal')}</p><p className="font-medium">{previewItem.invoiceDate}</p></div>
                  <div><p className="text-[11px] text-gray-400">{t('telepon')}</p><p className="font-medium">{previewItem.customerPhone || '-'}</p></div>
                  <div>
                    <p className="text-[11px] text-gray-400">Status</p>
                    {(() => { const sc = statusConfig[previewItem.status] || statusConfig.draft; return <Badge variant="secondary" className={`${sc.color} text-[11px]`}>{sc.label}</Badge> })()}
                  </div>
                </div>
                {previewItem.notes && <div className="bg-gray-50 rounded-lg p-3"><p className="text-[11px] text-gray-400">Catatan</p><p>{previewItem.notes}</p></div>}
                <div className="bg-orange-50 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-500">Grand Total</p>
                  <p className="text-2xl font-bold text-orange-600">Rp {(previewItem.grandTotal || 0).toLocaleString('id-ID')}</p>
                </div>
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
