'use client'

import { Package, Search, Loader2, Printer, Users } from 'lucide-react'
import { useState, useEffect, useMemo, useRef } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useLanguage } from '@/contexts/language-context'
import { toast } from 'sonner'
import { authFetch } from '@/lib/auth-fetch'
import { useDataChange } from '@/hooks/use-data-change'

// Customer option for the selector: master customers merged with every
// client name found on the user's own invoices (from /api/customer-barang/customers)
interface CustomerOption {
  name: string
  company: string | null
  hasInvoices: boolean
}

// One barang (item) row billed on a customer's invoice (from /api/customer-barang)
interface CustomerBarangItem {
  id: string
  nomor: string
  tanggal: string
  createdAt: string
  namaBarang: string
  qty: number
  hargaSatuan: number
  totalHarga: number
}

function formatRupiahShort(n: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(n)
}

function formatDateShort(iso: string): string {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

export default function DaftarBarangCustomerPage() {
  const { t } = useLanguage()

  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [loadingCustomers, setLoadingCustomers] = useState(true)
  const [selectedName, setSelectedName] = useState<string>('')

  const [barang, setBarang] = useState<CustomerBarangItem[]>([])
  const [loadingBarang, setLoadingBarang] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  // Remember the last fetched customer name so fetchBarang can be called
  // safely from data-change listeners without stale closure issues.
  const selectedNameRef = useRef('')
  selectedNameRef.current = selectedName

  const fetchBarang = async (customerName: string) => {
    if (!customerName) return
    setLoadingBarang(true)
    try {
      const res = await authFetch(`/api/customer-barang?customer=${encodeURIComponent(customerName)}`)
      const data = await res.json()
      setBarang(Array.isArray(data.barang) ? data.barang : [])
    } catch (error) {
      console.error('Error fetching customer barang:', error)
      toast.error('Gagal memuat daftar barang')
      setBarang([])
    } finally {
      setLoadingBarang(false)
    }
  }

  const fetchCustomers = async () => {
    try {
      const response = await authFetch('/api/customer-barang/customers')
      const data = await response.json()
      const list: CustomerOption[] = Array.isArray(data.customers) ? data.customers : []
      setCustomers(list)
      // Auto-select the first customer that actually has invoices so the page
      // shows content immediately; fall back to the first customer.
      setSelectedName(prev => {
        if (prev && list.some(c => c.name === prev)) return prev
        const withInvoices = list.find(c => c.hasInvoices)
        return withInvoices ? withInvoices.name : (list[0]?.name || '')
      })
    } catch (error) {
      console.error('Error fetching customers:', error)
      toast.error('Gagal memuat data customer')
    } finally {
      setLoadingCustomers(false)
    }
  }

  useEffect(() => {
    fetchCustomers()
  }, [])

  // Refresh when invoices or customers change (other tab/page)
  useDataChange(['invoice', 'customers'], () => {
    fetchCustomers()
    if (selectedNameRef.current) fetchBarang(selectedNameRef.current)
  })

  // Fetch barang whenever the selected customer changes
  const loadedForRef = useRef('')
  useEffect(() => {
    if (!selectedName) return
    if (loadedForRef.current === selectedName) return
    loadedForRef.current = selectedName
    fetchBarang(selectedName)
  }, [selectedName])

  const selectedCustomer = customers.find(c => c.name === selectedName)

  const filteredBarang = useMemo(() => {
    const q = searchTerm.toLowerCase().trim()
    if (!q) return barang
    return barang.filter(b =>
      b.namaBarang.toLowerCase().includes(q) ||
      (b.nomor || '').toLowerCase().includes(q)
    )
  }, [barang, searchTerm])

  const totalQty = filteredBarang.reduce((sum, b) => sum + (Number(b.qty) || 0), 0)
  const totalNilai = filteredBarang.reduce((sum, b) => sum + (Number(b.totalHarga) || 0), 0)

  const handlePrint = () => {
    if (!selectedCustomer) {
      toast.error('Pilih customer terlebih dahulu')
      return
    }
    if (filteredBarang.length === 0) {
      toast.error('Tidak ada data barang untuk dicetak')
      return
    }

    const printWindow = window.open('', '', 'height=800,width=1000')
    if (!printWindow) {
      toast.error('Gagal membuka jendela print')
      return
    }

    printWindow.document.write('<html><head><title>Daftar Barang per Customer</title>')
    printWindow.document.write(`
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
        h1 { text-align: center; margin-bottom: 4px; font-size: 18px; }
        .sub { text-align: center; margin-bottom: 16px; font-size: 12px; color: #555; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
        th { background-color: #f2f2f2; font-weight: bold; white-space: nowrap; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        tfoot td { background-color: #f2f2f2; font-weight: bold; }
        .right { text-align: right; }
        .center { text-align: center; }
        .footer { margin-top: 20px; font-size: 11px; color: #666; text-align: center; }
        @media print { body { padding: 0; } }
      </style>
    `)
    printWindow.document.write('</head><body>')

    printWindow.document.write('<h1>Daftar Barang per Customer</h1>')
    printWindow.document.write(`<p class="sub">Customer: <strong>${selectedCustomer.name}</strong></p>`)
    printWindow.document.write(`<p style="text-align: right; font-size: 11px; margin-bottom: 10px;">Dicetak: ${new Date().toLocaleString('id-ID')}</p>`)

    printWindow.document.write('<table>')
    printWindow.document.write('<thead>')
    printWindow.document.write('<tr>')
    printWindow.document.write('<th class="center">No</th>')
    printWindow.document.write('<th>Tanggal</th>')
    printWindow.document.write('<th>No. Invoice</th>')
    printWindow.document.write('<th>Nama Barang</th>')
    printWindow.document.write('<th class="center">Qty</th>')
    printWindow.document.write('<th class="right">Harga Satuan</th>')
    printWindow.document.write('<th class="right">Total</th>')
    printWindow.document.write('</tr>')
    printWindow.document.write('</thead>')
    printWindow.document.write('<tbody>')

    filteredBarang.forEach((b, index) => {
      printWindow.document.write(`
        <tr>
          <td class="center">${index + 1}</td>
          <td>${formatDateShort(b.tanggal || b.createdAt)}</td>
          <td>${b.nomor || '-'}</td>
          <td>${b.namaBarang}</td>
          <td class="center">${b.qty}</td>
          <td class="right">${formatRupiahShort(b.hargaSatuan)}</td>
          <td class="right">${formatRupiahShort(b.totalHarga)}</td>
        </tr>
      `)
    })

    printWindow.document.write('</tbody>')
    printWindow.document.write(`
      <tfoot>
        <tr>
          <td colspan="4" class="right">Total (${filteredBarang.length} barang)</td>
          <td class="center">${totalQty}</td>
          <td class="right">-</td>
          <td class="right">${formatRupiahShort(totalNilai)}</td>
        </tr>
      </tfoot>
    `)
    printWindow.document.write('</table>')
    printWindow.document.write('<div class="footer">Total Data: ' + filteredBarang.length + '</div>')
    printWindow.document.write('</body></html>')
    printWindow.document.close()

    setTimeout(() => {
      printWindow.print()
    }, 250)

    toast.success('Mencetak daftar barang...')
  }

  return (
    <DashboardLayout
      title={t('barang_customer')}
      subtitle={t('subtitle_barang_customer')}
    >
      <div className="bg-card rounded-xl shadow-sm border border-slate-200">
        {/* Toolbar */}
        <div className="p-3 sm:p-4 border-b border-slate-200 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center w-full sm:w-auto">
            <div className="w-full sm:w-64">
              <Select value={selectedName} onValueChange={setSelectedName} disabled={loadingCustomers || customers.length === 0}>
                <SelectTrigger className="w-full bg-white" aria-label="Pilih customer">
                  <SelectValue placeholder={loadingCustomers ? 'Memuat customer...' : 'Pilih customer'} />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.name} value={c.name}>
                      {c.company ? `${c.name} — ${c.company}` : c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Cari barang / invoice..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handlePrint} variant="outline" size="sm" className="h-9 gap-1.5 text-xs sm:h-auto sm:text-sm">
              <Printer className="w-3.5 h-3.5" />
              Cetak
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-3 sm:p-4">
          {loadingCustomers ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="w-12 h-12 text-slate-300 mb-3" />
              <p className="text-sm text-slate-500">Belum ada data customer</p>
            </div>
          ) : !selectedCustomer ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="w-12 h-12 text-slate-300 mb-3" />
              <p className="text-sm text-slate-500">Pilih customer untuk melihat daftar barang</p>
            </div>
          ) : loadingBarang ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : filteredBarang.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="w-12 h-12 text-slate-300 mb-3" />
              <p className="text-sm text-slate-500">
                {barang.length === 0
                  ? `Belum ada barang untuk customer ${selectedCustomer.name}`
                  : 'Tidak ada barang yang cocok dengan pencarian'}
              </p>
            </div>
          ) : (
            <>
              {/* Summary chips (mobile) */}
              <div className="lg:hidden flex flex-wrap gap-2 mb-3">
                <div className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                  {filteredBarang.length} barang
                </div>
                <div className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                  {totalQty} qty
                </div>
                <div className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
                  {formatRupiahShort(totalNilai)}
                </div>
              </div>

              {/* Desktop Table */}
              <div className="hidden lg:block overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[50px] text-center">#</TableHead>
                      <TableHead className="min-w-[110px]">Tanggal</TableHead>
                      <TableHead className="min-w-[150px]">No. Invoice</TableHead>
                      <TableHead className="min-w-[220px]">Nama Barang</TableHead>
                      <TableHead className="text-center w-[70px]">Qty</TableHead>
                      <TableHead className="text-right min-w-[120px]">Harga Satuan</TableHead>
                      <TableHead className="text-right min-w-[130px]">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBarang.map((b, idx) => (
                      <TableRow key={b.id}>
                        <TableCell className="text-center text-slate-400 text-xs">{idx + 1}</TableCell>
                        <TableCell className="text-slate-500 whitespace-nowrap text-sm">{formatDateShort(b.tanggal || b.createdAt)}</TableCell>
                        <TableCell className="font-medium text-slate-700 whitespace-nowrap text-sm">{b.nomor || '-'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                              <Package className="w-4 h-4 text-blue-600" />
                            </div>
                            <span className="text-slate-800 text-sm">{b.namaBarang}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-slate-600 text-sm">{b.qty}</TableCell>
                        <TableCell className="text-right text-slate-600 whitespace-nowrap text-sm">{formatRupiahShort(b.hargaSatuan)}</TableCell>
                        <TableCell className="text-right font-medium text-slate-700 whitespace-nowrap text-sm">{formatRupiahShort(b.totalHarga)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                      <TableCell colSpan={4} className="text-right font-semibold text-slate-600">
                        Total ({filteredBarang.length} barang)
                      </TableCell>
                      <TableCell className="text-center font-semibold text-slate-700">{totalQty}</TableCell>
                      <TableCell className="text-right text-slate-400">-</TableCell>
                      <TableCell className="text-right font-bold text-slate-800 whitespace-nowrap">{formatRupiahShort(totalNilai)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="lg:hidden space-y-2">
                {filteredBarang.map((b) => (
                  <div key={b.id} className="bg-white border border-slate-200 rounded-xl p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                          <Package className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 break-words">{b.namaBarang}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {formatDateShort(b.tanggal || b.createdAt)} • {b.nomor || '-'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold text-slate-700">{formatRupiahShort(b.totalHarga)}</p>
                        <p className="text-[11px] text-slate-400">{b.qty} × {formatRupiahShort(b.hargaSatuan)}</p>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Mobile total */}
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Total ({filteredBarang.length} barang)
                  </span>
                  <span className="text-sm font-bold text-slate-800">{formatRupiahShort(totalNilai)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
