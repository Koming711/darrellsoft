'use client'

/**
 * StockBahanView — modul Stock Bahan (simple seperti aplikasi kasir).
 *
 * Menu sidebar:
 *   Dashboard Stock · Data Bahan · Stok Masuk · Stok Keluar ·
 *   Penyesuaian Stok · Riwayat Stok · Laporan Stok · Kategori
 *   + Izinkan Stok Minus (admin).
 * Desktop: sidebar permanen di kiri (sticky). Mobile: drawer geser dari
 * kiri via tombol Menu di header — teks menu besar & mudah disentuh.
 *
 * Alur: Bahan → Stok Masuk → stok bertambah → Produksi/Pemakaian →
 * Stok Keluar → stok berkurang → Riwayat otomatis.
 * Desktop: header + summary cards + tabel. Mobile: kartu + tombol FAB +.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowLeftRight, BarChart3, Boxes, ClipboardList, FileDown, History,
  LayoutDashboard, Loader2, Menu, MoreVertical, Package, PackageMinus, PackagePlus,
  Pencil, Plus, Search, Settings2, Tags, Trash2, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { formatIDR } from '@/lib/format'
import { notifyDataChange } from '@/lib/data-sync'
import type { SessionUser } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { BahanFormDialog } from './bahan-form-dialog'
import { DetailBahanDialog } from './detail-bahan-dialog'
import { MutasiFormDialog, type MutasiJenis } from './mutasi-form-dialog'
import { MutasiListTab } from './mutasi-list-tab'
import { RiwayatTab } from './riwayat-tab'
import { LaporanTab } from './laporan-tab'
import type { Bahan, BahanMutasi, PemasokRingkas } from './shared'
import {
  AktifBadge, StatusStokBadge, errText, formatAngka, statusStok,
} from './shared'

type Section =
  | 'dashboard' | 'data-bahan' | 'masuk' | 'keluar' | 'penyesuaian' | 'riwayat' | 'laporan'

const MENU_ITEMS: { key: Section; label: string; icon: typeof LayoutDashboard; desc: string }[] = [
  { key: 'dashboard', label: 'Dashboard Stock', icon: LayoutDashboard, desc: 'Ringkasan & bahan yang perlu dibeli' },
  { key: 'data-bahan', label: 'Data Bahan', icon: Boxes, desc: 'Kelola master bahan' },
  { key: 'masuk', label: 'Stok Masuk', icon: PackagePlus, desc: 'Pembelian & penerimaan barang' },
  { key: 'keluar', label: 'Stok Keluar', icon: PackageMinus, desc: 'Produksi, sampel, rusak' },
  { key: 'penyesuaian', label: 'Penyesuaian Stok', icon: ArrowLeftRight, desc: 'Stok fisik vs sistem' },
  { key: 'riwayat', label: 'Riwayat Stok', icon: History, desc: 'Ledger semua transaksi' },
  { key: 'laporan', label: 'Laporan Stok', icon: BarChart3, desc: 'Nilai persediaan & filter' },
]

export default function StockBahanView({
  user,
  canAdd,
  canEdit,
  canDelete,
}: {
  user: SessionUser
  canAdd: boolean
  canEdit: boolean
  canDelete: boolean
}) {
  const isAdmin = user.role === 'ADMIN'

  const [section, setSection] = useState<Section>('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const [fabOpen, setFabOpen] = useState(false)
  const [kategoriOpen, setKategoriOpen] = useState(false)

  const [list, setList] = useState<Bahan[]>([])
  const [mutasi, setMutasi] = useState<BahanMutasi[]>([])
  const [pemasokList, setPemasokList] = useState<PemasokRingkas[]>([])
  const [loading, setLoading] = useState(true)
  const [mutasiLoading, setMutasiLoading] = useState(true)
  const [allowNegative, setAllowNegative] = useState(false)
  const [savingSetting, setSavingSetting] = useState(false)

  // Data Bahan filters
  const [search, setSearch] = useState('')
  const [filterKategori, setFilterKategori] = useState('semua')
  const [filterStatus, setFilterStatus] = useState('semua')

  // Dialogs
  const [formOpen, setFormOpen] = useState(false)
  const [editingBahan, setEditingBahan] = useState<Bahan | null>(null)
  const [detailBahan, setDetailBahan] = useState<Bahan | null>(null)
  const [deleteBahan, setDeleteBahan] = useState<Bahan | null>(null)
  const [mutasiJenis, setMutasiJenis] = useState<MutasiJenis>('masuk')
  const [mutasiOpen, setMutasiOpen] = useState(false)
  const [editingMutasi, setEditingMutasi] = useState<BahanMutasi | null>(null)
  const [deleteMutasi, setDeleteMutasi] = useState<BahanMutasi | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadList = useCallback(async () => {
    try {
      const data = await apiFetch<Bahan[]>('/api/stock-bahan')
      setList(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMutasi = useCallback(async () => {
    setMutasiLoading(true)
    try {
      const data = await apiFetch<BahanMutasi[]>('/api/stock-bahan/mutasi?limit=5000')
      setMutasi(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setMutasiLoading(false)
    }
  }, [])

  const loadPemasok = useCallback(async () => {
    try {
      const data = await apiFetch<PemasokRingkas[]>('/api/toko-pemasok')
      setPemasokList(Array.isArray(data) ? data : [])
    } catch {
      // supplier opsional — halaman tetap jalan tanpa Master Suplier
    }
  }, [])

  const loadAllowNegative = useCallback(async () => {
    try {
      const data = await apiFetch<{ key: string; value: string | null }>('/api/settings?key=stock_allow_negative')
      setAllowNegative(data?.value === '1' || data?.value === 'true')
    } catch {
      /* default false */
    }
  }, [])

  useEffect(() => {
    void loadList()
    void loadMutasi()
    void loadPemasok()
    void loadAllowNegative()
  }, [loadList, loadMutasi, loadPemasok, loadAllowNegative])

  // Drawer menu mobile: kunci scroll body + tutup dengan tombol Escape.
  useEffect(() => {
    if (!menuOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const refresh = useCallback(() => {
    void loadList()
    void loadMutasi()
    notifyDataChange('stock-bahan')
  }, [loadList, loadMutasi])

  async function toggleAllowNegative(v: boolean) {
    setSavingSetting(true)
    const prev = allowNegative
    setAllowNegative(v)
    try {
      await apiFetch('/api/settings', { method: 'POST', body: JSON.stringify({ key: 'stock_allow_negative', value: v ? '1' : '0' }) })
      toast.success(v ? 'Stok minus DIIZINKAN' : 'Stok minus DILARANG')
    } catch (e) {
      setAllowNegative(prev)
      toast.error(errText(e))
    } finally {
      setSavingSetting(false)
    }
  }

  // ===== Aksi =====
  function openTambah() {
    setEditingBahan(null)
    setFormOpen(true)
  }
  function openEdit(b: Bahan) {
    setEditingBahan(b)
    setFormOpen(true)
  }
  function openMutasiBaru(jenis: MutasiJenis, b?: Bahan) {
    setMutasiJenis(jenis)
    setEditingMutasi(b ? ({ id: '', bahanId: b.id, jenis, qty: 0, stokSetelah: 0, hargaBeli: 0, totalHarga: 0, nomor: '', tanggal: '', nomorNota: '', pemasok: b.pemasok || '', tujuan: '', alasan: '', namaBahan: b.nama, satuanBahan: b.satuan, keterangan: '', createdAt: '' } as BahanMutasi) : null)
    setMutasiOpen(true)
  }

  async function hapusBahan(b: Bahan) {
    setDeleting(true)
    try {
      await apiFetch(`/api/stock-bahan?id=${b.id}`, { method: 'DELETE' })
      toast.success(`Bahan "${b.nama}" dihapus`)
      refresh()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      // Tutup dialog sukses maupun gagal — dialog yang menempel
      // akan menghalangi konfirmasi berikutnya.
      setDeleteBahan(null)
      setDeleting(false)
    }
  }

  async function nonaktifkanBahan(b: Bahan) {
    setDeleting(true)
    try {
      await apiFetch('/api/stock-bahan', {
        method: 'PUT',
        body: JSON.stringify({ id: b.id, nama: b.nama, aktif: false }),
      })
      toast.success(`Bahan "${b.nama}" dinonaktifkan — riwayat tetap tersimpan`)
      setDeleteBahan(null)
      refresh()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setDeleting(false)
    }
  }

  async function hapusMutasi(m: BahanMutasi) {
    setDeleting(true)
    try {
      await apiFetch(`/api/stock-bahan/mutasi?id=${m.id}`, { method: 'DELETE' })
      toast.success(`Transaksi ${m.nomor || ''} dihapus — stok dihitung ulang`)
      refresh()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setDeleteMutasi(null)
      setDeleting(false)
    }
  }

  // ===== Turunan =====
  const kategoriList = useMemo(
    () => [...new Set(list.map(b => b.kategori).filter(Boolean))].sort(),
    [list],
  )

  const bahanFiltered = useMemo(() => {
    const f = search.trim().toLowerCase()
    return list
      .filter(b => (filterKategori === 'semua' ? true : (b.kategori || 'tanpa-kategori') === filterKategori))
      .filter(b =>
        filterStatus === 'semua'
          ? true
          : filterStatus === 'aktif'
            ? b.aktif
            : !b.aktif,
      )
      .filter(b =>
        !f
          ? true
          : [b.nama, b.kode, b.kategori, b.pemasok, b.lokasi, b.referensiPo].filter(Boolean).join(' ').toLowerCase().includes(f),
      )
  }, [list, search, filterKategori, filterStatus])

  const perluDibeli = useMemo(
    () => list.filter(b => b.stok <= b.stokMin).sort((a, b) => a.stok - b.stok),
    [list],
  )

  const totalStok = useMemo(() => Math.round(list.reduce((s, b) => s + b.stok, 0) * 1e4) / 1e4, [list])
  const jumlahMenipis = useMemo(() => list.filter(b => statusStok(b) === 'menipis').length, [list])
  const jumlahHabis = useMemo(() => list.filter(b => statusStok(b) === 'habis').length, [list])
  const nilaiPersediaan = useMemo(() => list.reduce((s, b) => s + b.stok * b.hargaSatuan, 0), [list])

  const mutasiByJenis = useMemo(
    () => ({
      masuk: mutasi.filter(m => m.jenis === 'masuk'),
      keluar: mutasi.filter(m => m.jenis === 'keluar'),
      penyesuaian: mutasi.filter(m => m.jenis === 'penyesuaian'),
    }),
    [mutasi],
  )

  // Konten sidebar — dipakai bersama: aside desktop & drawer mobile.
  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Kepala sidebar */}
      <div className="flex items-center gap-2.5 border-b px-4 py-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
          <Package className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold leading-tight">Stock Bahan</p>
          <p className="truncate text-xs text-muted-foreground">Manajemen stok bahan cetak</p>
        </div>
      </div>

      {/* Item menu */}
      <nav aria-label="Menu Stock Bahan" className="flex-1 space-y-1 overflow-y-auto p-2">
        {MENU_ITEMS.map(item => {
          const Icon = item.icon
          const active = section === item.key
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => { setSection(item.key); setMenuOpen(false) }}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-colors',
                active ? 'bg-emerald-600 text-white shadow-sm' : 'hover:bg-stone-100 dark:hover:bg-stone-800',
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="min-w-0">
                <span className="block text-[15px] font-bold leading-tight">{item.label}</span>
                <span className={cn('block truncate text-xs', active ? 'text-emerald-100' : 'text-muted-foreground')}>{item.desc}</span>
              </span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => { setKategoriOpen(true); setMenuOpen(false) }}
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-colors hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <Tags className="h-5 w-5 shrink-0" />
          <span className="min-w-0">
            <span className="block text-[15px] font-bold leading-tight">Kategori</span>
            <span className="block truncate text-xs text-muted-foreground">{kategoriList.length} kategori terpakai</span>
          </span>
        </button>
      </nav>

      {/* Setelan admin */}
      {isAdmin && (
        <div className="border-t p-3">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 p-3 dark:bg-stone-800/50">
            <div className="flex items-start gap-2">
              <Settings2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-bold">Izinkan Stok Minus</p>
                <p className="text-[11px] leading-tight text-muted-foreground">Opsi admin. Stok keluar boleh melebihi stok.</p>
              </div>
            </div>
            <Switch
              checked={allowNegative}
              onCheckedChange={v => void toggleAllowNegative(v)}
              disabled={savingSetting}
              aria-label="Izinkan stok minus"
            />
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="flex gap-4">
      {/* ===== Sidebar menu (desktop: selalu tampil, sticky) ===== */}
      <aside className="hidden w-64 shrink-0 md:block">
        <div className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-hidden rounded-2xl border bg-card shadow-sm">
          {sidebar}
        </div>
      </aside>

      {/* ===== Konten ===== */}
      <div className="min-w-0 flex-1 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="min-h-[44px] gap-2 px-3 text-[15px] font-bold md:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Buka menu Stock Bahan"
          >
            <Menu className="h-5 w-5" /> Menu
          </Button>
          <div className="flex items-center gap-2">
            <Package className="hidden h-5 w-5 text-emerald-600 sm:block" />
            <h2 className="text-lg font-bold">{MENU_ITEMS.find(m => m.key === section)?.label}</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground md:inline">Nilai persediaan</span>
          <span className="hidden rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-700 md:inline">
            {formatIDR(Math.round(nilaiPersediaan))}
          </span>
          {canAdd && (
            <Button onClick={openTambah} className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700">
              <Plus className="mr-1 h-4 w-4" /> Tambah Bahan
            </Button>
          )}
        </div>
      </div>

      {/* ===== Dashboard ===== */}
      {section === 'dashboard' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="border-0 shadow-sm"><CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground"><Boxes className="h-4 w-4" /><p className="text-xs">Total Jenis Bahan</p></div>
              <p className="mt-1 text-2xl font-bold">{list.length}</p>
              <p className="text-[11px] text-muted-foreground">{list.filter(b => b.aktif).length} aktif</p>
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground"><Package className="h-4 w-4" /><p className="text-xs">Total Stok</p></div>
              <p className="mt-1 text-2xl font-bold">{formatAngka(totalStok)}</p>
              <p className="text-[11px] text-muted-foreground">semua satuan digabung</p>
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground"><AlertTriangle className="h-4 w-4 text-amber-500" /><p className="text-xs">Stok Menipis</p></div>
              <p className="mt-1 text-2xl font-bold text-amber-600">{jumlahMenipis}</p>
              <p className="text-[11px] text-muted-foreground">stok ≤ minimum</p>
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground"><AlertTriangle className="h-4 w-4 text-red-500" /><p className="text-xs">Stok Habis</p></div>
              <p className="mt-1 text-2xl font-bold text-red-600">{jumlahHabis}</p>
              <p className="text-[11px] text-muted-foreground">stok ≤ 0</p>
            </CardContent></Card>
          </div>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-bold">Bahan yang perlu dibeli</h3>
                <Badge2Count n={perluDibeli.length} />
              </div>
              {perluDibeli.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Semua stok aman — tidak ada bahan yang perlu dibeli 🎉</p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nama bahan</TableHead>
                          <TableHead className="text-right">Stok sekarang</TableHead>
                          <TableHead className="text-right">Stok minimum</TableHead>
                          <TableHead>Satuan</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {perluDibeli.map(b => (
                          <TableRow key={b.id}>
                            <TableCell className="font-medium">{b.nama} <span className="text-xs text-muted-foreground">{b.kode}</span></TableCell>
                            <TableCell className="text-right font-semibold">{formatAngka(b.stok)}</TableCell>
                            <TableCell className="text-right text-xs">{formatAngka(b.stokMin)}</TableCell>
                            <TableCell className="text-xs">{b.satuan}</TableCell>
                            <TableCell><StatusStokBadge b={b} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="mt-3 space-y-2 md:hidden">
                    {perluDibeli.map(b => (
                      <div key={b.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{b.nama}</p>
                          <p className="text-xs text-muted-foreground">Stok {formatAngka(b.stok)} {b.satuan} · Min {formatAngka(b.stokMin)}</p>
                        </div>
                        <StatusStokBadge b={b} />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== Data Bahan ===== */}
      {section === 'data-bahan' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama / kode / lokasi…" className="pl-8" />
            </div>
            <Select value={filterKategori} onValueChange={setFilterKategori}>
              <SelectTrigger className="w-[160px]" aria-label="Filter kategori"><SelectValue placeholder="Kategori" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="semua">Semua kategori</SelectItem>
                {kategoriList.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                <SelectItem value="tanpa-kategori">Tanpa kategori</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]" aria-label="Filter status"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="semua">Semua status</SelectItem>
                <SelectItem value="aktif">Aktif</SelectItem>
                <SelectItem value="nonaktif">Nonaktif</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Memuat…</p>
          ) : bahanFiltered.length === 0 ? (
            <div className="rounded-xl border border-dashed py-12 text-center">
              <p className="text-sm font-medium">Tidak ada bahan yang cocok</p>
              <p className="mt-1 text-xs text-muted-foreground">{canAdd ? 'Klik "Tambah Bahan" untuk memulai.' : 'Ubah pencarian atau filter.'}</p>
            </div>
          ) : (
            <>
              {/* Desktop tabel */}
              <div className="hidden max-h-[68vh] overflow-y-auto rounded-xl border md:block">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>Kode</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead className="text-right">Stok</TableHead>
                      <TableHead className="text-right">Minimum</TableHead>
                      <TableHead>Satuan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bahanFiltered.map(b => (
                      <TableRow key={b.id} className={cn(!b.aktif && 'opacity-60')}>
                        <TableCell className="font-medium">
                          {b.nama}
                          {b.pemasok && <span className="block text-[11px] text-muted-foreground">{b.pemasok}</span>}
                          {b.referensiPo && <span className="block text-[11px] font-medium text-emerald-700/90">PO: {b.referensiPo}</span>}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{b.kode}</TableCell>
                        <TableCell className="text-xs">{b.kategori || '—'}</TableCell>
                        <TableCell className="text-right font-semibold">{formatAngka(b.stok)}</TableCell>
                        <TableCell className="text-right text-xs">{formatAngka(b.stokMin)}</TableCell>
                        <TableCell className="text-xs">{b.satuan}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <StatusStokBadge b={b} />
                            {!b.aktif && <AktifBadge aktif={false} />}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="inline-flex gap-1">
                            <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => setDetailBahan(b)} aria-label={`Detail ${b.nama}`}>
                              <ClipboardList className="h-3.5 w-3.5" />
                            </Button>
                            {canEdit && (
                              <>
                                <Button size="sm" variant="outline" className="h-8 px-2 text-emerald-700 hover:bg-emerald-50" onClick={() => openMutasiBaru('masuk', b)} aria-label="Stok masuk">
                                  <PackagePlus className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 px-2 text-orange-700 hover:bg-orange-50" onClick={() => openMutasiBaru('keluar', b)} aria-label="Stok keluar">
                                  <PackageMinus className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => openEdit(b)} aria-label="Edit bahan">
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            {canDelete && (
                              <Button size="sm" variant="outline" className="h-8 px-2 text-red-600 hover:bg-red-50" onClick={() => setDeleteBahan(b)} aria-label="Hapus bahan">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile kartu */}
              <div className="max-h-[68vh] space-y-3 overflow-y-auto md:hidden">
                {bahanFiltered.map(b => (
                  <div key={b.id} className={cn('rounded-xl border p-4', !b.aktif && 'opacity-60')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-base font-bold">{b.nama}</p>
                        <p className="text-[11px] text-muted-foreground">{b.kode}{b.kategori ? ` · ${b.kategori}` : ''}{b.lokasi ? ` · ${b.lokasi}` : ''}</p>
                      </div>
                      <StatusStokBadge b={b} />
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <p className="text-2xl font-bold">Stok: {formatAngka(b.stok)} <span className="text-sm font-medium">{b.satuan}</span></p>
                    </div>
                    <p className="text-xs text-muted-foreground">Minimum: {formatAngka(b.stokMin)} {b.satuan}{b.pemasok ? ` · ${b.pemasok}` : ''}</p>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <Button size="sm" variant="outline" className="min-h-[40px] text-xs" onClick={() => setDetailBahan(b)}>Detail</Button>
                      <Button size="sm" className="min-h-[40px] bg-emerald-600 text-xs hover:bg-emerald-700" onClick={() => openMutasiBaru('masuk', b)}>Stok Masuk</Button>
                      <Button size="sm" className="min-h-[40px] bg-orange-600 text-xs hover:bg-orange-700" onClick={() => openMutasiBaru('keluar', b)}>Stok Keluar</Button>
                    </div>
                    {(canEdit || canDelete) && (
                      <div className="mt-2 flex gap-2">
                        {canEdit && <Button size="sm" variant="ghost" className="h-8 flex-1 text-xs" onClick={() => openEdit(b)}><Pencil className="mr-1 h-3 w-3" /> Edit</Button>}
                        {canDelete && <Button size="sm" variant="ghost" className="h-8 flex-1 text-xs text-red-600" onClick={() => setDeleteBahan(b)}><Trash2 className="mr-1 h-3 w-3" /> Hapus</Button>}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">{bahanFiltered.length} bahan</p>
            </>
          )}
        </div>
      )}

      {/* ===== Stok Masuk / Keluar / Penyesuaian ===== */}
      {(section === 'masuk' || section === 'keluar' || section === 'penyesuaian') && (
        <MutasiListTab
          jenis={section}
          mutasi={mutasiByJenis[section]}
          loading={mutasiLoading}
          canEdit={canEdit}
          canDelete={canDelete}
          onAdd={() => openMutasiBaru(section)}
          onEdit={m => { setMutasiJenis(section); setEditingMutasi(m); setMutasiOpen(true) }}
          onDelete={setDeleteMutasi}
          onPrint={() => window.print()}
        />
      )}

      {/* ===== Riwayat ===== */}
      {section === 'riwayat' && (
        <RiwayatTab bahanList={list} mutasi={mutasi} loading={mutasiLoading} />
      )}

      {/* ===== Laporan ===== */}
      {section === 'laporan' && (
        <LaporanTab bahanList={list} mutasi={mutasi} pemasokList={pemasokList} />
      )}

      {/* Drawer sidebar menu (mobile: geser dari kiri) */}
      <div className={cn('fixed inset-0 z-50 md:hidden', !menuOpen && 'pointer-events-none')}>
        {/* Overlay */}
        <div
          className={cn('absolute inset-0 bg-black/50 transition-opacity duration-200', menuOpen ? 'opacity-100' : 'opacity-0')}
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
        {/* Panel */}
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Menu Stock Bahan"
          className={cn(
            'absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-card shadow-2xl transition-transform duration-200 ease-out',
            menuOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Tutup menu"
            className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full hover:bg-stone-100"
          >
            <X className="h-5 w-5" />
          </button>
          {sidebar}
        </aside>
      </div>

      {/* FAB mobile — tambah transaksi cepat */}
      {canAdd && (
        <button
          type="button"
          onClick={() => setFabOpen(true)}
          aria-label="Tambah transaksi cepat"
          className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/40 transition-transform hover:scale-105 active:scale-95 md:hidden"
        >
          <Plus className="h-7 w-7" />
        </button>
      )}
      <Dialog open={fabOpen} onOpenChange={setFabOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="pr-6 text-lg font-bold">Tambah Cepat</DialogTitle>
            <DialogDescription>Pilih transaksi yang ingin dicatat</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 pb-2">
            <Button className="min-h-[52px] justify-start bg-emerald-600 text-[15px] font-bold hover:bg-emerald-700" onClick={() => { setFabOpen(false); openMutasiBaru('masuk') }}>
              <PackagePlus className="mr-2 h-5 w-5" /> Stok Masuk
            </Button>
            <Button className="min-h-[52px] justify-start bg-orange-600 text-[15px] font-bold hover:bg-orange-700" onClick={() => { setFabOpen(false); openMutasiBaru('keluar') }}>
              <PackageMinus className="mr-2 h-5 w-5" /> Stok Keluar
            </Button>
            <Button className="min-h-[52px] justify-start bg-stone-700 text-[15px] font-bold hover:bg-stone-800" onClick={() => { setFabOpen(false); openMutasiBaru('penyesuaian') }}>
              <ArrowLeftRight className="mr-2 h-5 w-5" /> Penyesuaian Stok
            </Button>
            {canAdd && (
              <Button variant="outline" className="min-h-[52px] justify-start text-[15px] font-bold" onClick={() => { setFabOpen(false); openTambah() }}>
                <Boxes className="mr-2 h-5 w-5" /> Bahan Baru
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Kategori */}
      <Dialog open={kategoriOpen} onOpenChange={setKategoriOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="pr-6 text-lg font-bold">Kategori Bahan</DialogTitle>
            <DialogDescription>Klik kategori untuk membuka Data Bahan terfilter</DialogDescription>
          </DialogHeader>
          {kategoriList.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Belum ada kategori. Kategori otomatis muncul saat bahan dibuat.</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pb-2">
              <button
                type="button"
                onClick={() => { setFilterKategori('semua'); setSection('data-bahan'); setKategoriOpen(false) }}
                className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-[15px] font-bold hover:bg-stone-50"
              >
                Semua kategori <span className="text-xs font-normal text-muted-foreground">{list.length} bahan</span>
              </button>
              {kategoriList.map(k => {
                const n = list.filter(b => b.kategori === k).length
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => { setFilterKategori(k); setSection('data-bahan'); setKategoriOpen(false) }}
                    className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-[15px] font-bold hover:bg-stone-50"
                  >
                    {k} <span className="text-xs font-normal text-muted-foreground">{n} bahan</span>
                  </button>
                )
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog bahan */}
      <BahanFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editingBahan}
        pemasokList={pemasokList}
        onSaved={refresh}
      />

      {/* Dialog detail bahan */}
      <DetailBahanDialog
        open={!!detailBahan}
        onOpenChange={v => !v && setDetailBahan(null)}
        bahan={detailBahan}
        mutasi={mutasi}
        canEdit={canEdit}
        onEdit={b => { setDetailBahan(null); openEdit(b) }}
        onStokMasuk={b => { setDetailBahan(null); openMutasiBaru('masuk', b) }}
        onStokKeluar={b => { setDetailBahan(null); openMutasiBaru('keluar', b) }}
      />

      {/* Dialog transaksi (tambah/edit) */}
      <MutasiFormDialog
        open={mutasiOpen}
        onOpenChange={setMutasiOpen}
        jenis={mutasiJenis}
        bahanList={list}
        editing={editingMutasi}
        pemasokList={pemasokList}
        onSaved={refresh}
      />

      {/* Konfirmasi hapus bahan */}
      <AlertDialog open={!!deleteBahan} onOpenChange={v => !v && setDeleteBahan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus bahan "{deleteBahan?.nama}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Bahan tanpa transaksi akan dihapus permanen. Bahan yang sudah dipakai dalam
              transaksi TIDAK bisa dihapus — sistem akan menawarkan menonaktifkannya agar
              riwayat tetap tercatat.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="min-h-[44px]">Batal</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px] bg-red-600 hover:bg-red-700"
              disabled={deleting}
              onClick={e => { e.preventDefault(); if (deleteBahan) void hapusBahan(deleteBahan) }}
            >
              {deleting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Konfirmasi hapus transaksi */}
      <AlertDialog open={!!deleteMutasi} onOpenChange={v => !v && setDeleteMutasi(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus transaksi {deleteMutasi?.nomor}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteMutasi?.jenis === 'masuk'
                ? `Stok masuk ${formatAngka(deleteMutasi?.qty ?? 0)} ${deleteMutasi?.satuanBahan} akan dibatalkan dan stok dihitung ulang.`
                : deleteMutasi?.jenis === 'keluar'
                  ? `Stok keluar ${formatAngka(deleteMutasi?.qty ?? 0)} ${deleteMutasi?.satuanBahan} akan dibatalkan dan stok dihitung ulang.`
                  : 'Penyesuaian akan dibatalkan dan stok dihitung ulang.'}
              {' '}Riwayat transaksi lain tetap aman.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="min-h-[44px]">Batal</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px] bg-red-600 hover:bg-red-700"
              disabled={deleting}
              onClick={e => { e.preventDefault(); if (deleteMutasi) void hapusMutasi(deleteMutasi) }}
            >
              {deleting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  )
}

function Badge2Count({ n }: { n: number }) {
  return (
    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
      {n} bahan
    </span>
  )
}
