'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import {
  BadgePercent,
  Pencil,
  Plus,
  Search,
  Trash2,
  Loader2,
  PackageOpen,
} from 'lucide-react'
import { getAuthUser } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'
import { notifyDataChange } from '@/lib/data-sync'
import { cn } from '@/lib/utils'
import {
  BarangFormDialog,
  type BarangCustomerOption,
  type BarangFormSavedItem,
} from '@/components/views/barang-form-dialog'
import BackupRestoreButtons from '@/components/views/backup-restore-buttons'

/**
 * Halaman Harga Customer — daftar harga jual khusus per customer per barang.
 *
 * Sumber data: tabel BarangCustomer yang sudah ada (registrasi barang→customer
 * + harga khusus) via /api/harga-customer. Prioritas harga di invoice
 * (diterapkan otomatis oleh /api/items + invoice-editor): harga khusus customer
 * yang aktif & berlaku → harga standar barang. Harga pokok (Barang.modal)
 * TIDAK pernah diubah fitur ini.
 *
 * Popup TAMBAH memakai komponen bersama BarangFormDialog (sama persis dengan
 * popup "Tambah Barang" Master Barang / Buat Invoice, sesuai desain aplikasi
 * desktop): NAMA BARANG berupa DROPDOWN barang dari halaman Barang
 * (/api/items) — pilih barang yg sudah ada lalu isi harga khusus, atau pilih
 * "+ Barang baru" utk membuat barang baru; foto, Untuk Pelanggan, satuan,
 * qty, harga jual, harga modal + profit dua arah, keterangan.
 * Simpan barang yg SUDAH ADA = POST /api/harga-customer (daftarkan harga
 * khusus, tanpa membuat barang baru). Simpan barang baru = POST /api/items —
 * bila pelanggan dipilih, barang otomatis terdaftar (BarangCustomer)
 * sehingga langsung muncul di daftar harga khusus.
 * Dialog edit harga khusus tetap khusus mode edit.
 */

interface HargaRow {
  id: string
  customerId: string
  customerName: string
  barangId: string
  kode: string
  namaBarang: string
  satuan: string
  standardPrice: number
  hargaPokok: number
  harga: number
  validFrom: string | null
  validUntil: string | null
  isActive: boolean
}

interface CustomerOpt {
  id: string
  name: string
  companyName: string | null
}

interface BarangOpt {
  id: string
  code: string
  name: string
  unit: string
  standardPrice: number
  hpp: number | null
}

const rupiah = (n: number | null | undefined) =>
  `Rp ${(n ?? 0).toLocaleString('id-ID')}`

/** Teks selisih bertanda: +Rp 1.000 / -Rp 500; 0 → '-' */
const selisihText = (n: number) => {
  if (!n) return '-'
  const abs = Math.abs(n).toLocaleString('id-ID')
  return n > 0 ? `+Rp ${abs}` : `-Rp ${abs}`
}

export default function HargaCustomerPage() {
  const [ready, setReady] = useState(false)
  const [rows, setRows] = useState<HargaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Master data untuk form & filter
  const [customers, setCustomers] = useState<CustomerOpt[]>([])
  const [barangList, setBarangList] = useState<BarangOpt[]>([])
  const [masterError, setMasterError] = useState(false)

  // Filter (server-side)
  const [q, setQ] = useState('')
  const [fCustomer, setFCustomer] = useState('all')
  const [fBarang, setFBarang] = useState('all')
  const [fStatus, setFStatus] = useState('all')

  // Popup "Tambah Barang" (BarangFormDialog — sama persis dgn Master Barang)
  const [addOpen, setAddOpen] = useState(false)

  // Form dialog edit harga khusus
  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [fCustomerId, setFCustomerId] = useState('')
  const [fBarangId, setFBarangId] = useState('')
  const [fHarga, setFHarga] = useState('')
  const [fSatuan, setFSatuan] = useState('')
  const [fFrom, setFFrom] = useState('')
  const [fUntil, setFUntil] = useState('')

  // Konfirmasi hapus
  const [deleteTarget, setDeleteTarget] = useState<HargaRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadRows = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (q.trim()) p.set('q', q.trim())
      if (fCustomer !== 'all') p.set('customerId', fCustomer)
      if (fBarang !== 'all') p.set('barangId', fBarang)
      if (fStatus !== 'all') p.set('status', fStatus)
      const res = await authFetch(`/api/harga-customer?${p.toString()}`)
      if (res.ok) setRows(await res.json())
      else toast.error('Gagal memuat daftar harga customer')
    } catch {
      toast.error('Gagal memuat daftar harga customer')
    } finally {
      setLoading(false)
    }
  }, [q, fCustomer, fBarang, fStatus])

  useEffect(() => {
    if (!getAuthUser()) {
      window.location.href = '/login'
      return
    }
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    const t = setTimeout(loadRows, q ? 350 : 0)
    return () => clearTimeout(t)
  }, [ready, loadRows, q])

  // Master data (customer & barang) untuk dropdown form — dimuat saat halaman
  // siap DAN setiap kali dialog tambah/edit dibuka agar isi dropdown selalu
  // freshest (mis. user baru menambah master di tab lain).
  const loadMaster = useCallback(async () => {
    setMasterError(false)
    try {
      const [cRes, bRes] = await Promise.all([
        authFetch('/api/customers'),
        authFetch('/api/items?active=1'),
      ])
      if (!cRes.ok || !bRes.ok) {
        setMasterError(true)
        return
      }
      setCustomers(await cRes.json())
      const data = await bRes.json()
      setBarangList(Array.isArray(data?.items) ? data.items : [])
    } catch {
      // master list gagal dimuat — form tetap bisa dibuka, validasi menahan simpan
      setMasterError(true)
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    void loadMaster()
  }, [ready, loadMaster])

  const selectedBarang = useMemo(
    () => barangList.find((b) => b.id === fBarangId) ?? null,
    [barangList, fBarangId]
  )

  const openTambah = () => {
    void loadMaster()
    setAddOpen(true)
  }

  /** Data dipulihkan dr file backup (komponen BackupRestoreButtons) —
   *  muat ulang daftar harga & master agar tampilan langsung freshest. */
  const handleRestored = () => {
    void loadRows()
    void loadMaster()
  }

  /** Barang baru tersimpan dari popup "Tambah Barang" (BarangFormDialog).
   *  Muat ulang daftar harga + master; barang umum (tanpa pelanggan) tidak
   *  masuk daftar harga khusus — beri tahu user agar tidak bingung. */
  const handleBarangSaved = (
    _item: BarangFormSavedItem | null,
    customerId: string
  ) => {
    // Barang baru mengubah entitas items & harga-customer → invalidasi cache
    // smart-fetch agar loadRows/loadMaster tidak membaca salinan lama.
    notifyDataChange('items')
    notifyDataChange('harga-customer')
    void loadRows()
    void loadMaster()
    if (customerId === 'none') {
      toast.info(
        'Barang umum tersimpan — tidak tampil di daftar harga khusus per pelanggan'
      )
    }
  }

  const openEdit = (row: HargaRow) => {
    void loadMaster()
    setEditId(row.id)
    setFCustomerId(row.customerId)
    setFBarangId(row.barangId)
    setFHarga(String(row.harga || ''))
    setFSatuan(row.satuan || '')
    setFFrom(row.validFrom ?? '')
    setFUntil(row.validUntil ?? '')
    setFormOpen(true)
  }

  /** Simpan edit harga khusus (dialog edit — popup tambah kini BarangFormDialog). */
  const submitForm = async () => {
    if (!editId) return
    if (!fCustomerId) return toast.error('Pilih customer terlebih dahulu')
    if (!fBarangId) return toast.error('Pilih barang terlebih dahulu')
    const harga = Number(fHarga)
    if (!Number.isFinite(harga) || harga < 0)
      return toast.error('Harga tidak boleh negatif')
    if (fFrom && fUntil && fUntil < fFrom)
      return toast.error('Tanggal akhir berlaku tidak boleh sebelum tanggal mulai')

    setSaving(true)
    try {
      const res = await authFetch(`/api/harga-customer/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: fCustomerId,
          barangId: fBarangId,
          price: harga,
          validFrom: fFrom || null,
          validUntil: fUntil || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || 'Gagal menyimpan harga customer')
        return
      }
      toast.success('Harga customer diperbarui')
      setFormOpen(false)
      // Invalidasi cache smart-fetch — tanpa ini loadRows membaca cache 60 dtk
      // dan perubahan tidak tampil sampai reload (bug "hapus/edit tidak hilang").
      notifyDataChange('harga-customer')
      await loadRows()
    } catch {
      toast.error('Gagal menyimpan harga customer')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await authFetch(`/api/harga-customer/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || 'Gagal menghapus harga customer')
        return
      }
      toast.success('Harga khusus dihapus — customer kembali memakai harga standar')
      setDeleteTarget(null)
      // Invalidasi cache smart-fetch — tanpa ini loadRows membaca cache 60 dtk
      // dan baris yang dihapus tetap tampil sampai reload (bug yang dilaporkan).
      notifyDataChange('harga-customer')
      await loadRows()
    } catch {
      toast.error('Gagal menghapus harga customer')
    } finally {
      setDeleting(false)
    }
  }

  const toggleStatus = async (row: HargaRow) => {
    try {
      const res = await authFetch(`/api/harga-customer/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !row.isActive }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data?.error || 'Gagal mengubah status')
        return
      }
      toast.success(row.isActive ? 'Harga dinonaktifkan' : 'Harga diaktifkan')
      notifyDataChange('harga-customer')
      await loadRows()
    } catch {
      toast.error('Gagal mengubah status')
    }
  }

  const marginOf = (r: HargaRow) => r.harga - (r.hargaPokok ?? 0)

  return (
    <DashboardLayout title="Harga Customer" subtitle="Harga jual khusus per customer — otomatis dipakai saat membuat invoice">
      {!ready ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Memuat…</div>
      ) : (
        <div className="space-y-4" data-testid="halaman-harga-customer">
          {/* ===== Toolbar: cari + filter + tambah ===== */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari customer atau barang…"
                className="pl-9"
                aria-label="Cari harga customer"
              />
            </div>
            <Select value={fCustomer} onValueChange={setFCustomer}>
              <SelectTrigger className="w-full sm:w-[200px] bg-white" aria-label="Filter customer">
                <SelectValue placeholder="Semua customer" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="all">Semua customer</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {/* Nama pelanggan = nama yang terisi di Master Customer */}
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fBarang} onValueChange={setFBarang}>
              <SelectTrigger className="w-full sm:w-[200px] bg-white" aria-label="Filter barang">
                <SelectValue placeholder="Semua barang" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="all">Semua barang</SelectItem>
                {barangList.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger className="w-full sm:w-[150px] bg-white" aria-label="Filter status">
                <SelectValue placeholder="Semua status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                <SelectItem value="aktif">Aktif</SelectItem>
                <SelectItem value="nonaktif">Nonaktif</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex flex-wrap items-center gap-2">
              {/* Backup & Restore data barang + harga per pelanggan (.xlsx) */}
              <BackupRestoreButtons onRestored={handleRestored} />
              <Button
                onClick={openTambah}
                className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1 sm:flex-none"
                data-testid="harga-customer-tambah"
              >
                <Plus className="h-4 w-4 mr-1" /> Tambah
              </Button>
            </div>
          </div>

          {/* ===== Tabel (desktop) ===== */}
          <div className="hidden md:block rounded-lg border bg-card shadow-sm overflow-hidden">
            <div className="max-h-[600px] overflow-y-auto">
              {/* Tinggi baris presisi 9mm + zebra (baris ganjil abu slate-100, hover seragam
                  lebih gelap) — konvensi sama dgn tabel /barang */}
              <Table className="[&_td]:py-[2px] [&_tbody_tr:last-child]:border-b [&_tbody_tr:hover]:bg-slate-200/70 dark:[&_tbody_tr:hover]:bg-zinc-700/50">
                <TableHeader className="sticky top-0 bg-muted/95 z-10">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[150px]">Customer</TableHead>
                    <TableHead className="min-w-[180px]">Nama Barang</TableHead>
                    <TableHead className="text-center min-w-[90px]">Status</TableHead>
                    <TableHead className="text-right min-w-[110px]">Harga Standar</TableHead>
                    <TableHead className="text-right min-w-[120px]">Harga Khusus</TableHead>
                    <TableHead className="text-right min-w-[100px]">Selisih</TableHead>
                    <TableHead className="text-right min-w-[100px]">HPP</TableHead>
                    <TableHead className="text-right min-w-[100px]">Margin</TableHead>
                    <TableHead className="min-w-[70px]">Satuan</TableHead>
                    <TableHead className="text-right min-w-[100px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="!py-10 text-center text-sm text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Memuat…
                      </TableCell>
                    </TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="!py-12 text-center">
                        <PackageOpen className="h-10 w-10 mx-auto text-slate-300 mb-2" />
                        <p className="text-sm text-muted-foreground">
                          Belum ada harga khusus. Klik &quot;Tambah&quot; untuk menambah barang — pilih pelanggan agar harga khususnya terdaftar di sini.
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r, idx) => {
                      const selisih = r.harga - r.standardPrice
                      const margin = marginOf(r)
                      return (
                      <TableRow
                        key={r.id}
                        className={cn(
                          'h-[9mm]',
                          idx % 2 === 1 && 'bg-slate-100 dark:bg-zinc-800/60'
                        )}
                      >
                        <TableCell className="font-medium text-slate-700">{r.customerName}</TableCell>
                        <TableCell className="text-slate-700">{r.namaBarang}</TableCell>
                        <TableCell className="text-center">
                          <button
                            onClick={() => toggleStatus(r)}
                            title="Klik untuk mengubah status"
                            className="inline-flex"
                          >
                            <Badge
                              variant="outline"
                              className={
                                r.isActive
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 cursor-pointer hover:bg-emerald-100'
                                  : 'bg-slate-100 text-slate-500 border-slate-200 cursor-pointer hover:bg-slate-200'
                              }
                            >
                              {r.isActive ? 'Aktif' : 'Nonaktif'}
                            </Badge>
                          </button>
                        </TableCell>
                        <TableCell className="text-right text-slate-500 whitespace-nowrap">
                          {rupiah(r.standardPrice)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-emerald-700 whitespace-nowrap">
                          {rupiah(r.harga)}
                        </TableCell>
                        {/* Selisih = harga khusus − harga standar; hijau = naik, rose = turun */}
                        <TableCell
                          className={
                            'text-right whitespace-nowrap tabular-nums ' +
                            (selisih > 0
                              ? 'text-emerald-600'
                              : selisih < 0
                                ? 'text-rose-600'
                                : 'text-slate-400')
                          }
                        >
                          {selisihText(selisih)}
                        </TableCell>
                        <TableCell className="text-right text-slate-600 whitespace-nowrap tabular-nums">
                          {rupiah(r.hargaPokok)}
                        </TableCell>
                        {/* Margin = harga khusus − HPP; '-' bila HPP belum diisi (0) */}
                        <TableCell
                          className={
                            'text-right whitespace-nowrap tabular-nums ' +
                            (r.hargaPokok > 0
                              ? margin > 0
                                ? 'text-emerald-600'
                                : margin < 0
                                  ? 'text-rose-600'
                                  : 'text-slate-500'
                              : 'text-slate-400')
                          }
                        >
                          {r.hargaPokok > 0 ? rupiah(margin) : '-'}
                        </TableCell>
                        <TableCell className="text-slate-500">{r.satuan}</TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(r)}
                              aria-label={`Edit harga ${r.namaBarang} untuk ${r.customerName}`}
                              className="h-6 w-6 p-0"
                            >
                              <Pencil className="h-3.5 w-3.5 text-slate-500" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteTarget(r)}
                              aria-label={`Hapus harga ${r.namaBarang} untuk ${r.customerName}`}
                              className="h-6 w-6 p-0"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* ===== Kartu (HP) ===== */}
          <div className="md:hidden space-y-3">
            {loading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Memuat…
              </div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center rounded-lg border bg-card">
                <PackageOpen className="h-10 w-10 mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-muted-foreground px-6">
                  Belum ada harga khusus. Klik &quot;Tambah&quot; untuk menambah barang — pilih pelanggan agar harga khususnya terdaftar di sini.
                </p>
              </div>
            ) : (
              rows.map((r) => (
                <div key={r.id} className="rounded-lg border bg-card p-4 shadow-sm space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-slate-800 truncate">{r.customerName}</p>
                      <p className="text-xs text-slate-500 truncate">{r.namaBarang}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        r.isActive
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 flex-shrink-0'
                          : 'bg-slate-100 text-slate-500 border-slate-200 flex-shrink-0'
                      }
                    >
                      {r.isActive ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Harga Standar</p>
                      <p className="text-slate-600">{rupiah(r.standardPrice)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Harga Khusus</p>
                      <p className="font-semibold text-emerald-700">{rupiah(r.harga)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Selisih</p>
                      <p
                        className={
                          r.harga - r.standardPrice > 0
                            ? 'text-emerald-600'
                            : r.harga - r.standardPrice < 0
                              ? 'text-rose-600'
                              : 'text-slate-400'
                        }
                      >
                        {selisihText(r.harga - r.standardPrice)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">HPP</p>
                      <p className="text-slate-600">{rupiah(r.hargaPokok)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Margin</p>
                      <p
                        className={
                          r.hargaPokok > 0
                            ? marginOf(r) > 0
                              ? 'text-emerald-600'
                              : marginOf(r) < 0
                                ? 'text-rose-600'
                                : 'text-slate-500'
                            : 'text-slate-400'
                        }
                      >
                        {r.hargaPokok > 0 ? rupiah(marginOf(r)) : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Satuan</p>
                      <p className="text-slate-600">{r.satuan}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => openEdit(r)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-9 text-red-600 hover:bg-red-50"
                      onClick={() => setDeleteTarget(r)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Hapus
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Ringkasan kecil */}
          {!loading && rows.length > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <BadgePercent className="h-3.5 w-3.5" />
              {rows.length} harga khusus · dipakai otomatis di invoice bila aktif &amp; berlaku; selain itu harga standar barang.
            </p>
          )}
        </div>
      )}

      {/* ===== Popup Tambah Barang (BarangFormDialog — sama persis dgn
          Master Barang / Buat Invoice, sesuai desain aplikasi desktop) ===== */}
      <BarangFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        customers={customers as BarangCustomerOption[]}
        customerFilter={fCustomer}
        lockedCustomerNote="Mengikuti pelanggan yang dipilih di filter halaman ini."
        barangOptions={barangList}
        onSaved={handleBarangSaved}
      />

      {/* ===== Dialog Edit Harga Khusus ===== */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Harga Customer</DialogTitle>
            <DialogDescription>
              Ubah customer, barang, harga, atau periode berlaku untuk harga khusus ini.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5 py-1">
            {masterError && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                Gagal memuat data customer &amp; barang. Tutup lalu buka ulang dialog ini untuk mencoba lagi.
              </p>
            )}
            <div className="space-y-1.5">
              <Label>Customer *</Label>
              <Select
                value={fCustomerId || undefined}
                onValueChange={setFCustomerId}
              >
                <SelectTrigger className="w-full bg-white" aria-label="Pilih customer" data-testid="form-pilih-customer">
                  <SelectValue placeholder="Pilih customer" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {/* Nama pelanggan = nama yang terisi di Master Customer */}
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!masterError && customers.length === 0 && (
                <p className="text-[11px] text-amber-700">
                  Belum ada customer di master — tambahkan dulu di menu Master Customer.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Barang *</Label>
              <Select
                value={fBarangId || undefined}
                onValueChange={(v) => {
                  setFBarangId(v)
                  const b = barangList.find((x) => x.id === v)
                  if (b) {
                    setFSatuan(b.unit || 'pcs')
                    if (!fHarga) setFHarga(String(b.standardPrice || 0))
                  }
                }}
              >
                <SelectTrigger className="w-full bg-white" aria-label="Pilih barang" data-testid="form-pilih-barang">
                  <SelectValue placeholder="Pilih barang" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {barangList.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedBarang && (
                <div className="rounded-md bg-slate-50 border px-3 py-2 text-xs text-slate-600 space-y-0.5">
                  <p><span className="text-slate-400">Kode:</span> {selectedBarang.code || '-'}</p>
                  <p><span className="text-slate-400">Nama:</span> {selectedBarang.name}</p>
                  <p><span className="text-slate-400">Harga standar:</span> {rupiah(selectedBarang.standardPrice)}</p>
                </div>
              )}
              {!masterError && barangList.length === 0 && (
                <p className="text-[11px] text-amber-700">
                  Belum ada barang — tambahkan dulu di menu Barang.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Harga Khusus Customer *</Label>
                <Input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={fHarga}
                  onChange={(e) => setFHarga(e.target.value)}
                  placeholder="0"
                  data-testid="form-harga-khusus"
                />
                {Number(fHarga) > 0 && (
                  <p className="text-[11px] text-slate-400">{rupiah(Number(fHarga))}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Satuan</Label>
                <Input
                  value={fSatuan}
                  onChange={(e) => setFSatuan(e.target.value)}
                  placeholder="pcs"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tanggal Mulai Berlaku</Label>
                <Input
                  type="date"
                  value={fFrom}
                  onChange={(e) => setFFrom(e.target.value)}
                  data-testid="form-tanggal-mulai"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tanggal Akhir (opsional)</Label>
                <Input
                  type="date"
                  value={fUntil}
                  onChange={(e) => setFUntil(e.target.value)}
                  data-testid="form-tanggal-akhir"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              Kosongkan tanggal akhir bila harga berlaku terus. Harga nonaktif/kedaluwarsa otomatis diabaikan invoice.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button
              onClick={submitForm}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="harga-customer-simpan"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Konfirmasi Hapus ===== */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus harga khusus ini?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget &&
                `Harga ${rupiah(deleteTarget.harga)} untuk ${deleteTarget.namaBarang} milik ${deleteTarget.customerName} akan dihapus. Setelah itu customer kembali memakai harga standar ${rupiah(deleteTarget.standardPrice)} di invoice.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                confirmDelete()
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="harga-customer-hapus-yakin"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  )
}
