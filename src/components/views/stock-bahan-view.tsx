'use client'

/**
 * StockBahanView — halaman Stock Bahan versi v123 (paritas produksi
 * www.darrellsoft.com): 8 menu dalam satu halaman.
 *
 * - Dashboard Stock : ringkasan (jenis, total stok, menipis, habis)
 *                     + daftar "Bahan yang perlu dibeli".
 * - Data Bahan      : CRUD master bahan (kode auto BHN-001, ...), filter
 *                     kategori & status, search nama/kode/lokasi.
 * - Stok Masuk      : pembelian & penerimaan barang (nomor auto SM-001,
 *                     harga beli, total otomatis, supplier, no. nota).
 * - Stok Keluar     : produksi, sampel, rusak (nomor auto SK-001, tujuan).
 * - Penyesuaian Stok: stok fisik vs sistem (nomor auto SP-001, alasan,
 *                     selisih otomatis).
 * - Riwayat Stok    : ledger semua transaksi + filter bahan/jenis/tanggal.
 * - Laporan Stok    : nilai persediaan, menipis, habis + Print/PDF.
 * - Kategori        : dialog kategori otomatis dari bahan (klik → Data Bahan
 *                     terfilter).
 *
 * Switch "Izinkan stok minus" tersimpan per-user (UserSetting key
 * stock_izinkan_minus) dan divalidasi ulang di server.
 */

import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Boxes,
  ChevronsUpDown,
  ClipboardList,
  History,
  LayoutGrid,
  Loader2,
  Menu as MenuIcon,
  Package,
  PackageMinus,
  PackageOpen,
  PackagePlus,
  Pencil,
  Plus,
  Printer,
  Search,
  Shapes,
  Tag,
  Trash2,
  TrendingDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { jsPDF } from 'jspdf'
import { apiFetch } from '@/lib/client'
import { formatIDR } from '@/lib/format'
import type { SessionUser } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ============================================================
// Tipe data
// ============================================================

interface Bahan {
  id: string
  kode: string
  nama: string
  kategori: string
  satuan: string
  stok: number
  stokMin: number
  hargaSatuan: number
  keterangan: string
  aktif: boolean
  lokasi: string
  pemasok: string
  userId?: string | null
  createdAt?: string
  updatedAt?: string
}

interface Mutasi {
  id: string
  bahanId: string
  jenis: 'masuk' | 'keluar' | 'penyesuaian' | string
  qty: number
  stokSetelah: number
  keterangan: string
  nomor: string
  tanggal: string
  nomorNota: string
  pemasok: string
  hargaBeli: number
  totalHarga: number
  satuanBahan: string
  namaBahan: string
  tujuan: string
  alasan: string
  createdAt: string
  bahan?: { kode: string; nama: string; satuan: string }
}

interface PoOption {
  poNumber: string
  supplierName: string
}

type TabId =
  | 'dashboard'
  | 'data'
  | 'masuk'
  | 'keluar'
  | 'penyesuaian'
  | 'riwayat'
  | 'laporan'

// ============================================================
// Konstanta
// ============================================================

const SATUAN_OPTIONS = [
  'pcs',
  'lembar',
  'rim',
  'box',
  'pack',
  'roll',
  'kg',
  'gram',
  'liter',
  'ml',
  'tube',
  'kaleng',
]

const KATEGORI_BAWAAN = ['Kertas', 'Tinta', 'Kimia', 'Plastik', 'Alat', 'Lainnya']

const TUJUAN_KELUAR = ['Produksi', 'Sampel', 'Rusak', 'Pemakaian internal', 'Lainnya']

const ALASAN_PENYESUAIAN = [
  'Stok opname',
  'Stok rusak',
  'Stok hilang',
  'Salah hitung',
  'Koreksi data',
  'Lainnya',
]

interface NavItem {
  id: TabId
  label: string
  desc: string
  icon: ComponentType<{ className?: string }>
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard Stock', desc: 'Ringkasan & bahan yang perlu dibeli', icon: LayoutGrid },
  { id: 'data', label: 'Data Bahan', desc: 'Kelola master bahan', icon: Shapes },
  { id: 'masuk', label: 'Stok Masuk', desc: 'Pembelian & penerimaan barang', icon: PackagePlus },
  { id: 'keluar', label: 'Stok Keluar', desc: 'Produksi, sampel, rusak', icon: PackageOpen },
  { id: 'penyesuaian', label: 'Penyesuaian Stok', desc: 'Stok fisik vs sistem', icon: ArrowLeftRight },
  { id: 'riwayat', label: 'Riwayat Stok', desc: 'Ledger semua transaksi', icon: History },
  { id: 'laporan', label: 'Laporan Stok', desc: 'Nilai persediaan & filter', icon: BarChart3 },
]

/** Tanggal hari ini yyyy-mm-dd (zona aplikasi). */
function todayStr(): string {
  return new Date().toLocaleDateString('sv-SE')
}

/** Tampilkan angka desimal rapi (buang .0). */
function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}

function fmtTanggal(t: string): string {
  if (!t) return '-'
  try {
    const d = new Date(t + 'T00:00:00')
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return t
  }
}

// ============================================================
// Komponen kecil
// ============================================================

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'slate',
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string | number
  sub: string
  tone?: 'slate' | 'amber' | 'red' | 'emerald'
}) {
  const toneCls =
    tone === 'amber'
      ? 'text-amber-600'
      : tone === 'red'
        ? 'text-red-600'
        : tone === 'emerald'
          ? 'text-emerald-600'
          : 'text-foreground'
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span>{label}</span>
        </div>
        <div className={cn('mt-2 text-3xl font-bold leading-none', toneCls)}>{value}</div>
        <div className="mt-1.5 text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
      {text}
    </div>
  )
}

function Spinner({ label = 'Memuat…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  )
}

/** Badge jenis mutasi. */
function JenisBadge({ jenis }: { jenis: string }) {
  if (jenis === 'masuk') return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Masuk</Badge>
  if (jenis === 'keluar') return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Keluar</Badge>
  return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Penyesuaian</Badge>
}

// ============================================================
// Export: Print & PDF generik
// ============================================================

function printTable(title: string, columns: string[], rows: string[][], summary?: string) {
  const win = window.open('', '_blank', 'width=1000,height=700')
  if (!win) {
    toast.error('Popup diblokir — izinkan popup untuk mencetak')
    return
  }
  const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#0f172a}
    h1{font-size:18px;margin:0 0 4px}
    p.sub{color:#64748b;font-size:12px;margin:0 0 16px}
    table{border-collapse:collapse;width:100%;font-size:11px}
    th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}
    th{background:#f1f5f9}
    tfoot td{font-weight:bold;background:#f8fafc}
    @media print{button{display:none}}
  </style></head><body>
  <h1>${esc(title)}</h1><p class="sub">${esc(summary || '')} — dicetak ${new Date().toLocaleString('id-ID')}</p>
  <table><thead><tr>${columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
  <button onclick="window.print()" style="margin-top:16px;padding:8px 16px">Cetak</button>
  </body></html>`)
  win.document.close()
  win.focus()
}

function exportPdf(title: string, columns: string[], rows: string[][], summary?: string) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  doc.setFontSize(14)
  doc.text(title, 14, 15)
  doc.setFontSize(9)
  doc.setTextColor(110)
  doc.text(`${summary || ''} — dicetak ${new Date().toLocaleString('id-ID')}`, 14, 21)
  doc.setTextColor(0)

  const colW = (pageW - 28) / columns.length
  let y = 28
  // header
  doc.setFillColor(241, 245, 249)
  doc.rect(14, y - 5, pageW - 28, 7, 'F')
  doc.setFontSize(8)
  columns.forEach((c, i) => doc.text(String(c).slice(0, 24), 16 + i * colW, y))
  y += 7
  doc.setFontSize(8)
  rows.forEach((r) => {
    if (y > 200) {
      doc.addPage()
      y = 20
    }
    r.forEach((c, i) => doc.text(String(c).slice(0, 26), 16 + i * colW, y))
    y += 6
  })
  doc.save(`${title.replace(/\s+/g, '-')}.pdf`)
}

// ============================================================
// View utama
// ============================================================

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
  void user
  const [loading, setLoading] = useState(true)
  const [bahan, setBahan] = useState<Bahan[]>([])
  const [mutasi, setMutasi] = useState<Mutasi[]>([])
  const [tab, setTab] = useState<TabId>('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const [kategoriOpen, setKategoriOpen] = useState(false)
  const [dataKategoriFilter, setDataKategoriFilter] = useState('')

  // switch "Izinkan stok minus"
  const [izinkanMinus, setIzinkanMinus] = useState(false)
  const [savingMinus, setSavingMinus] = useState(false)

  // dialog Tambah/Edit bahan
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Bahan | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Bahan | null>(null)

  const loadBahan = useCallback(async () => {
    const data = await apiFetch<Bahan[]>('/api/stock-bahan')
    setBahan(Array.isArray(data) ? data : [])
  }, [])

  const loadMutasi = useCallback(async () => {
    const data = await apiFetch<Mutasi[]>('/api/stock-bahan/mutasi?limit=1000')
    setMutasi(Array.isArray(data) ? data : [])
  }, [])

  const loadSetting = useCallback(async () => {
    try {
      const data = await apiFetch<{ key: string; value: string | null }>(
        '/api/settings?key=stock_izinkan_minus'
      )
      setIzinkanMinus(data?.value === 'true')
    } catch {
      // default tetap false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await Promise.all([loadBahan(), loadMutasi(), loadSetting()])
      } catch {
        toast.error('Gagal memuat data stock bahan')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadBahan, loadMutasi, loadSetting])

  const refresh = useCallback(async () => {
    try {
      await Promise.all([loadBahan(), loadMutasi()])
    } catch {
      toast.error('Gagal memuat ulang data')
    }
  }, [loadBahan, loadMutasi])

  const toggleIzinkanMinus = async (v: boolean) => {
    setSavingMinus(true)
    try {
      await apiFetch('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ key: 'stock_izinkan_minus', value: v ? 'true' : 'false' }),
      })
      setIzinkanMinus(v)
      toast.success(v ? 'Stok minus diizinkan' : 'Stok minus dilarang')
    } catch {
      toast.error('Gagal menyimpan pengaturan')
    } finally {
      setSavingMinus(false)
    }
  }

  // ====== statistik global ======
  const aktif = useMemo(() => bahan.filter((b) => b.aktif), [bahan])
  const totalStok = useMemo(() => bahan.reduce((a, b) => a + (b.stok || 0), 0), [bahan])
  const menipis = useMemo(
    () => bahan.filter((b) => b.stok > 0 && b.stokMin > 0 && b.stok <= b.stokMin),
    [bahan]
  )
  const habis = useMemo(() => bahan.filter((b) => (b.stok || 0) <= 0), [bahan])
  const nilaiPersediaan = useMemo(
    () => bahan.reduce((a, b) => a + (b.stok || 0) * (b.hargaSatuan || 0), 0),
    [bahan]
  )
  const perluBeli = useMemo(
    () => aktif.filter((b) => b.stok <= b.stokMin),
    [aktif]
  )
  const kategoriTerpakai = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of bahan) {
      const k = (b.kategori || '').trim()
      if (k) map.set(k, (map.get(k) || 0) + 1)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [bahan])

  const openTambah = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (b: Bahan) => {
    setEditing(b)
    setFormOpen(true)
  }

  const goTab = (t: TabId) => {
    setTab(t)
    setMenuOpen(false)
  }

  const navList = (
    <div className="space-y-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        const activeTab = tab === item.id
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => goTab(item.id)}
            className={cn(
              'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
              activeTab ? 'bg-emerald-600 text-white shadow-sm' : 'hover:bg-muted'
            )}
          >
            <Icon className={cn('mt-0.5 h-4.5 w-4.5 shrink-0', activeTab ? 'text-white' : 'text-muted-foreground')} />
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-tight">{item.label}</span>
              <span className={cn('block text-xs leading-tight', activeTab ? 'text-white/80' : 'text-muted-foreground')}>
                {item.desc}
              </span>
            </span>
          </button>
        )
      })}
      <button
        type="button"
        onClick={() => {
          setMenuOpen(false)
          setKategoriOpen(true)
        }}
        className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted"
      >
        <Tag className="mt-0.5 h-4.5 w-4.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-tight">Kategori</span>
          <span className="block text-xs leading-tight text-muted-foreground">
            {kategoriTerpakai.length} kategori terpakai
          </span>
        </span>
      </button>
    </div>
  )

  const switchMinus = (
    <div className={cn('flex items-center justify-between gap-2 rounded-lg px-3 py-2', savingMinus && 'opacity-60')}>
      <span className="text-xs font-medium leading-tight text-muted-foreground">Izinkan stok minus</span>
      <Switch checked={izinkanMinus} onCheckedChange={toggleIzinkanMinus} disabled={savingMinus} aria-label="Izinkan stok minus" />
    </div>
  )

  /** Header tiap tab: judul + Nilai persediaan + Tambah Bahan (paritas produksi v123). */
  const tabHeader = (label: string, Icon: ComponentType<{ className?: string }>) => (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-xl font-bold">
        <Icon className="h-5 w-5 text-emerald-600" /> {label}
      </h2>
      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-muted-foreground sm:inline">Nilai persediaan</span>
        <Badge className="bg-emerald-100 text-sm text-emerald-700 hover:bg-emerald-100">{formatIDR(nilaiPersediaan)}</Badge>
        {canAdd && (
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={openTambah}>
            <Plus className="h-4 w-4" /> Tambah Bahan
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
      {/* ===== Panel kiri (desktop) ===== */}
      <aside className="hidden w-64 shrink-0 lg:block">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-3 rounded-lg bg-emerald-50 p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
                <Boxes className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-bold leading-tight">Stock Bahan</div>
                <div className="text-[11px] leading-tight text-muted-foreground">Manajemen stok bahan cetak</div>
              </div>
            </div>
            <Separator className="my-3" />
            {navList}
            <Separator className="my-3" />
            {switchMinus}
          </CardContent>
        </Card>
      </aside>

      {/* ===== Menu mobile ===== */}
      <div className="flex items-center gap-3 lg:hidden">
        <Button variant="outline" size="sm" onClick={() => setMenuOpen(true)}>
          <MenuIcon className="h-4 w-4" /> Menu
        </Button>
        <h2 className="text-lg font-bold">{NAV_ITEMS.find((n) => n.id === tab)?.label}</h2>
      </div>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 overflow-y-auto p-4">
          <SheetHeader className="p-0 pb-2 text-left">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Boxes className="h-5 w-5 text-emerald-600" /> Stock Bahan
            </SheetTitle>
          </SheetHeader>
          {navList}
          <Separator className="my-3" />
          {switchMinus}
        </SheetContent>
      </Sheet>

      {/* ===== Konten ===== */}
      <div className="min-w-0 flex-1 space-y-4">
        {loading ? (
          <Spinner label="Memuat stock bahan…" />
        ) : (
          <>
            <div className="hidden lg:block">{tabHeader(NAV_ITEMS.find((n) => n.id === tab)?.label || 'Stock Bahan', NAV_ITEMS.find((n) => n.id === tab)?.icon || Boxes)}</div>
            {tab === 'dashboard' && (
              <DashboardTab bahan={bahan} aktif={aktif} totalStok={totalStok} menipis={menipis} habis={habis} perluBeli={perluBeli} />
            )}
            {tab === 'data' && (
              <DataBahanTab
                bahan={bahan}
                canAdd={canAdd}
                canEdit={canEdit}
                canDelete={canDelete}
                onTambah={openTambah}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
                kategoriFilterInit={dataKategoriFilter}
                onKategoriFilterConsumed={() => setDataKategoriFilter('')}
              />
            )}
            {tab === 'masuk' && (
              <MasukTab mutasi={mutasi} bahan={aktif} canAdd={canAdd} onSaved={refresh} />
            )}
            {tab === 'keluar' && (
              <KeluarTab mutasi={mutasi} bahan={aktif} canAdd={canAdd} onSaved={refresh} izinkanMinus={izinkanMinus} />
            )}
            {tab === 'penyesuaian' && (
              <PenyesuaianTab mutasi={mutasi} bahan={bahan} canAdd={canAdd} onSaved={refresh} />
            )}
            {tab === 'riwayat' && (
              <RiwayatTab mutasi={mutasi} bahan={bahan} canAdd={canAdd} />
            )}
            {tab === 'laporan' && (
              <LaporanTab bahan={bahan} nilaiPersediaan={nilaiPersediaan} menipis={menipis} habis={habis} canAdd={canAdd} />
            )}
          </>
        )}
      </div>

      {/* FAB mobile — tambah bahan */}
      {canAdd && !loading && (
        <button
          type="button"
          onClick={openTambah}
          aria-label="Tambah Bahan"
          className="fixed bottom-24 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition-transform hover:scale-105 active:scale-95 lg:hidden"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* Dialog Tambah/Edit bahan */}
      <BahanFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        bahan={bahan}
        onSaved={refresh}
      />

      {/* Dialog kategori (dari nav Kategori) */}
      <KategoriDialog
        open={kategoriOpen}
        onOpenChange={setKategoriOpen}
        kategori={kategoriTerpakai}
        onPick={(k) => {
          setKategoriOpen(false)
          setDataKategoriFilter(k)
          setTab('data')
        }}
      />

      {/* Konfirmasi hapus */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus bahan?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `"${deleteTarget.nama}" (${deleteTarget.kode}) beserta seluruh riwayat mutasinya akan dihapus permanen.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={async () => {
                if (!deleteTarget) return
                try {
                  await apiFetch(`/api/stock-bahan?id=${encodeURIComponent(deleteTarget.id)}`, { method: 'DELETE' })
                  toast.success('Bahan dihapus')
                  setDeleteTarget(null)
                  await refresh()
                } catch (e: any) {
                  toast.error(e?.message || 'Gagal menghapus bahan')
                }
              }}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ============================================================
// Tab: Dashboard Stock
// ============================================================

function DashboardTab({
  bahan,
  aktif,
  totalStok,
  menipis,
  habis,
  perluBeli,
}: {
  bahan: Bahan[]
  aktif: Bahan[]
  totalStok: number
  menipis: Bahan[]
  habis: Bahan[]
  perluBeli: Bahan[]
}) {
  void bahan
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Shapes} label="Total Jenis Bahan" value={bahan.length} sub={`${aktif.length} aktif`} />
        <StatCard icon={Package} label="Total Stok" value={fmtNum(totalStok)} sub="semua satuan digabung" />
        <StatCard icon={AlertTriangle} label="Stok Menipis" value={menipis.length} sub="stok ≤ minimum" tone="amber" />
        <StatCard icon={TrendingDown} label="Stok Habis" value={habis.length} sub="stok ≤ 0" tone="red" />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-base font-bold">Bahan yang perlu dibeli</h3>
            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{perluBeli.length} bahan</Badge>
          </div>
          {perluBeli.length === 0 ? (
            <EmptyState text="Semua stok aman — tidak ada bahan yang perlu dibeli 🎉" />
          ) : (
            <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {perluBeli.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{b.nama}</div>
                    <div className="text-xs text-muted-foreground">
                      {b.kode} · stok {fmtNum(b.stok)} {b.satuan} / minimum {fmtNum(b.stokMin)} {b.satuan}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {b.stok <= 0 ? (
                      <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Stok Habis</Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Stok Menipis</Badge>
                    )}
                    <span className="whitespace-nowrap text-xs font-medium text-amber-700">
                      butuh ± {fmtNum(Math.max(b.stokMin - b.stok, 0))} {b.satuan}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// Tab: Data Bahan
// ============================================================

function DataBahanTab({
  bahan,
  canAdd,
  canEdit,
  canDelete,
  onTambah,
  onEdit,
  onDelete,
  kategoriFilterInit,
  onKategoriFilterConsumed,
}: {
  bahan: Bahan[]
  canAdd: boolean
  canEdit: boolean
  canDelete: boolean
  onTambah: () => void
  onEdit: (b: Bahan) => void
  onDelete: (b: Bahan) => void
  kategoriFilterInit: string
  onKategoriFilterConsumed: () => void
}) {
  const [q, setQ] = useState('')
  const [fKategori, setFKategori] = useState('all')
  const [fStatus, setFStatus] = useState('all')

  useEffect(() => {
    if (kategoriFilterInit) {
      setFKategori(kategoriFilterInit)
      onKategoriFilterConsumed()
    }
  }, [kategoriFilterInit, onKategoriFilterConsumed])

  const kategoriList = useMemo(() => {
    const set = new Set<string>()
    for (const b of bahan) {
      const k = (b.kategori || '').trim()
      if (k) set.add(k)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [bahan])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return bahan
      .filter((b) => {
        if (
          term &&
          !`${b.nama} ${b.kode} ${b.lokasi}`.toLowerCase().includes(term)
        )
          return false
        if (fKategori !== 'all' && (b.kategori || '') !== fKategori) return false
        if (fStatus === 'aktif' && !b.aktif) return false
        if (fStatus === 'nonaktif' && b.aktif) return false
        return true
      })
      .sort((a, b) => a.nama.localeCompare(b.nama))
  }, [bahan, q, fKategori, fStatus])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / kode / lokasi…" className="pl-9" />
        </div>
        <Select value={fKategori} onValueChange={setFKategori}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter kategori">
            <SelectValue placeholder="Semua kategori" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua kategori</SelectItem>
            {kategoriList.map((k) => (
              <SelectItem key={k} value={k}>{k}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fStatus} onValueChange={setFStatus}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Filter status">
            <SelectValue placeholder="Semua status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            <SelectItem value="aktif">Aktif</SelectItem>
            <SelectItem value="nonaktif">Nonaktif</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState text={canAdd ? 'Belum ada bahan — klik "Tambah Bahan" untuk mulai.' : 'Belum ada bahan.'} />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden max-h-[560px] overflow-y-auto rounded-lg border md:block">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead className="text-right">Stok</TableHead>
                  <TableHead className="text-right">Harga Modal</TableHead>
                  <TableHead>Lokasi</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{b.kode}</TableCell>
                    <TableCell>
                      <div className="font-medium">{b.nama}</div>
                      {(b.pemasok || b.keterangan) && (
                        <div className="max-w-56 truncate text-xs text-muted-foreground">
                          {[b.pemasok, b.keterangan].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{b.kategori || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <span className={cn('font-semibold', b.stok <= 0 ? 'text-red-600' : b.stokMin > 0 && b.stok <= b.stokMin ? 'text-amber-600' : '')}>
                        {fmtNum(b.stok)} {b.satuan}
                      </span>
                      {b.stokMin > 0 && <div className="text-[11px] text-muted-foreground">min {fmtNum(b.stokMin)}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm">{formatIDR(b.hargaSatuan)}</TableCell>
                    <TableCell className="text-sm">{b.lokasi || '—'}</TableCell>
                    <TableCell>
                      {b.aktif ? (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Aktif</Badge>
                      ) : (
                        <Badge variant="secondary">Nonaktif</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(b)} aria-label={`Edit ${b.nama}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700" onClick={() => onDelete(b)} aria-label={`Hapus ${b.nama}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile */}
          <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1 md:hidden">
            {filtered.map((b) => (
              <Card key={b.id}>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold">{b.nama}</div>
                      <div className="text-xs text-muted-foreground">{b.kode} · {b.kategori || 'Tanpa kategori'}</div>
                    </div>
                    {b.aktif ? (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Aktif</Badge>
                    ) : (
                      <Badge variant="secondary">Nonaktif</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <div><span className="text-muted-foreground">Stok: </span><span className={cn('font-semibold', b.stok <= 0 && 'text-red-600')}>{fmtNum(b.stok)} {b.satuan}</span></div>
                    <div><span className="text-muted-foreground">Min: </span><span className="font-semibold">{fmtNum(b.stokMin)}</span></div>
                    <div><span className="text-muted-foreground">Harga modal: </span><span className="font-semibold">{formatIDR(b.hargaSatuan)}</span></div>
                    <div><span className="text-muted-foreground">Lokasi: </span><span className="font-semibold">{b.lokasi || '—'}</span></div>
                  </div>
                  {(canEdit || canDelete) && (
                    <div className="flex justify-end gap-1 pt-1">
                      {canEdit && (
                        <Button variant="outline" size="sm" onClick={() => onEdit(b)}>
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => onDelete(b)}>
                          <Trash2 className="h-3.5 w-3.5" /> Hapus
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================
// Tab: Stok Masuk
// ============================================================

function MutasiFilterBar({
  q,
  setQ,
  qPlaceholder,
  dari,
  setDari,
  sampai,
  setSampai,
  onReset,
}: {
  q: string
  setQ: (v: string) => void
  qPlaceholder: string
  dari: string
  setDari: (v: string) => void
  sampai: string
  setSampai: (v: string) => void
  onReset: () => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={qPlaceholder} className="pl-9" />
        </div>
        <Input type="date" value={dari} onChange={(e) => setDari(e.target.value)} aria-label="Dari tanggal" className="w-full sm:w-40" />
        <Input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} aria-label="Sampai tanggal" className="w-full sm:w-40" />
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onReset}>
          Reset
        </Button>
      </div>
    </div>
  )
}

function MasukTab({
  mutasi,
  bahan,
  canAdd,
  onSaved,
}: {
  mutasi: Mutasi[]
  bahan: Bahan[]
  canAdd: boolean
  onSaved: () => Promise<void>
}) {
  const [q, setQ] = useState('')
  const [dari, setDari] = useState('')
  const [sampai, setSampai] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return mutasi
      .filter((m) => m.jenis === 'masuk')
      .filter((m) => {
        if (term && !`${m.nomor} ${m.namaBahan} ${m.keterangan} ${m.pemasok} ${m.nomorNota}`.toLowerCase().includes(term))
          return false
        if (dari && m.tanggal && m.tanggal < dari) return false
        if (sampai && m.tanggal && m.tanggal > sampai) return false
        return true
      })
  }, [mutasi, q, dari, sampai])

  const totalNilai = rows.reduce((a, m) => a + (m.totalHarga || 0), 0)

  return (
    <div className="space-y-4">
      <MutasiFilterBar
        q={q} setQ={setQ} qPlaceholder="Cari nomor / bahan / catatan…"
        dari={dari} setDari={setDari} sampai={sampai} setSampai={setSampai}
        onReset={() => { setQ(''); setDari(''); setSampai('') }}
      />
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => printTable('Stok Masuk', ['Nomor', 'Tanggal', 'Bahan', 'Jumlah', 'Harga Beli', 'Total', 'Pemasok', 'No. Nota', 'Catatan'], rows.map((m) => [m.nomor, fmtTanggal(m.tanggal), m.namaBahan, `${fmtNum(m.qty)} ${m.satuanBahan}`, formatIDR(m.hargaBeli), formatIDR(m.totalHarga), m.pemasok || '-', m.nomorNota || '-', m.keterangan || '-']), `${rows.length} transaksi · total ${formatIDR(totalNilai)}`)}>
          <Printer className="h-4 w-4" /> Print
        </Button>
        {canAdd && (
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
            <PackagePlus className="h-4 w-4" /> Stok Masuk
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState text="Belum ada transaksi stok masuk." />
      ) : (
        <div className="max-h-[520px] overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Nomor</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Bahan</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
                <TableHead className="text-right">Harga Beli</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Pemasok</TableHead>
                <TableHead>No. Nota</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs font-semibold">{m.nomor}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{fmtTanggal(m.tanggal)}</TableCell>
                  <TableCell className="text-sm font-medium">{m.namaBahan || m.bahan?.nama || '-'}</TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm text-emerald-700">
                    +{fmtNum(m.qty)} {m.satuanBahan}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm">{formatIDR(m.hargaBeli)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm font-semibold">{formatIDR(m.totalHarga)}</TableCell>
                  <TableCell className="text-sm">{m.pemasok || '—'}</TableCell>
                  <TableCell className="text-sm">{m.nomorNota || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <MasukDialog open={dialogOpen} onOpenChange={setDialogOpen} bahan={bahan} onSaved={onSaved} />
    </div>
  )
}

function BahanPicker({
  bahan,
  value,
  onChange,
  disabled,
}: {
  bahan: Bahan[]
  value: string
  onChange: (id: string) => void
  disabled?: boolean
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label="Pilih bahan">
        <SelectValue placeholder="Pilih bahan" />
      </SelectTrigger>
      <SelectContent>
        {bahan.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Belum ada bahan aktif</div>}
        {bahan.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.nama} ({b.kode}) — stok {fmtNum(b.stok)} {b.satuan}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function MasukDialog({
  open,
  onOpenChange,
  bahan,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  bahan: Bahan[]
  onSaved: () => Promise<void>
}) {
  const [bahanId, setBahanId] = useState('')
  const [tanggal, setTanggal] = useState(todayStr())
  const [qty, setQty] = useState('')
  const [hargaBeli, setHargaBeli] = useState('')
  const [pemasok, setPemasok] = useState('')
  const [nomorNota, setNomorNota] = useState('')
  const [keterangan, setKeterangan] = useState('')
  const [saving, setSaving] = useState(false)

  const selected = bahan.find((b) => b.id === bahanId)
  const total = (Number(qty) || 0) * (Number(hargaBeli) || 0)
  const canSave = !!bahanId && Number(qty) > 0 && !saving

  const reset = () => {
    setBahanId('')
    setTanggal(todayStr())
    setQty('')
    setHargaBeli('')
    setPemasok('')
    setNomorNota('')
    setKeterangan('')
  }

  const submit = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await apiFetch('/api/stock-bahan/mutasi', {
        method: 'POST',
        body: JSON.stringify({
          bahanId,
          jenis: 'masuk',
          qty: Number(qty),
          tanggal,
          hargaBeli: Number(hargaBeli) || 0,
          pemasok,
          nomorNota,
          keterangan,
        }),
      })
      toast.success(`Stok masuk tercatat (${selected?.nama} +${fmtNum(Number(qty))} ${selected?.satuan})`)
      onOpenChange(false)
      reset()
      await onSaved()
    } catch (e: any) {
      toast.error(e?.message || 'Gagal menyimpan stok masuk')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Stok Masuk</DialogTitle>
          <DialogDescription>Nomor transaksi dibuat otomatis. Stok diperbarui setelah disimpan.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tanggal</Label>
            <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Bahan</Label>
            <BahanPicker
              bahan={bahan}
              value={bahanId}
              onChange={(id) => {
                setBahanId(id)
                const b = bahan.find((x) => x.id === id)
                if (b?.pemasok && !pemasok) setPemasok(b.pemasok)
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Jumlah *</Label>
              <Input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Satuan</Label>
              <Input value={selected?.satuan || '—'} disabled />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Harga beli / satuan</Label>
              <Input type="number" min="0" step="any" value={hargaBeli} onChange={(e) => setHargaBeli(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Total</Label>
              <Input value={formatIDR(total)} disabled />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Nama supplier</Label>
            <Input value={pemasok} onChange={(e) => setPemasok(e.target.value)} placeholder="Nama supplier" />
          </div>
          <div className="space-y-1.5">
            <Label>Nomor nota / faktur</Label>
            <Input value={nomorNota} onChange={(e) => setNomorNota(e.target.value)} placeholder="Nomor nota / faktur" />
          </div>
          <div className="space-y-1.5">
            <Label>Catatan</Label>
            <Textarea rows={2} value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Catatan" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={!canSave} onClick={submit}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
            Catat Stok Masuk
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Tab: Stok Keluar
// ============================================================

function KeluarTab({
  mutasi,
  bahan,
  canAdd,
  onSaved,
  izinkanMinus,
}: {
  mutasi: Mutasi[]
  bahan: Bahan[]
  canAdd: boolean
  onSaved: () => Promise<void>
  izinkanMinus: boolean
}) {
  const [q, setQ] = useState('')
  const [dari, setDari] = useState('')
  const [sampai, setSampai] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return mutasi
      .filter((m) => m.jenis === 'keluar')
      .filter((m) => {
        if (term && !`${m.nomor} ${m.namaBahan} ${m.keterangan} ${m.tujuan}`.toLowerCase().includes(term)) return false
        if (dari && m.tanggal && m.tanggal < dari) return false
        if (sampai && m.tanggal && m.tanggal > sampai) return false
        return true
      })
  }, [mutasi, q, dari, sampai])

  return (
    <div className="space-y-4">
      <MutasiFilterBar
        q={q} setQ={setQ} qPlaceholder="Cari nomor / bahan / catatan…"
        dari={dari} setDari={setDari} sampai={sampai} setSampai={setSampai}
        onReset={() => { setQ(''); setDari(''); setSampai('') }}
      />
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => printTable('Stok Keluar', ['Nomor', 'Tanggal', 'Bahan', 'Jumlah', 'Tujuan', 'Catatan'], rows.map((m) => [m.nomor, fmtTanggal(m.tanggal), m.namaBahan, `${fmtNum(m.qty)} ${m.satuanBahan}`, m.tujuan || '-', m.keterangan || '-']), `${rows.length} transaksi`)}>
          <Printer className="h-4 w-4" /> Print
        </Button>
        {canAdd && (
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
            <PackageMinus className="h-4 w-4" /> Stok Keluar
          </Button>
        )}
        {!izinkanMinus && <span className="text-xs text-muted-foreground">Stok tidak boleh minus — aktifkan "Izinkan stok minus" bila perlu.</span>}
      </div>

      {rows.length === 0 ? (
        <EmptyState text="Belum ada transaksi stok keluar." />
      ) : (
        <div className="max-h-[520px] overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Nomor</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Bahan</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
                <TableHead>Tujuan</TableHead>
                <TableHead>Catatan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs font-semibold">{m.nomor}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{fmtTanggal(m.tanggal)}</TableCell>
                  <TableCell className="text-sm font-medium">{m.namaBahan || m.bahan?.nama || '-'}</TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm text-red-600">
                    −{fmtNum(m.qty)} {m.satuanBahan}
                  </TableCell>
                  <TableCell className="text-sm">{m.tujuan || '—'}</TableCell>
                  <TableCell className="max-w-48 truncate text-sm text-muted-foreground">{m.keterangan || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <KeluarDialog open={dialogOpen} onOpenChange={setDialogOpen} bahan={bahan} onSaved={onSaved} />
    </div>
  )
}

function KeluarDialog({
  open,
  onOpenChange,
  bahan,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  bahan: Bahan[]
  onSaved: () => Promise<void>
}) {
  const [bahanId, setBahanId] = useState('')
  const [tanggal, setTanggal] = useState(todayStr())
  const [qty, setQty] = useState('')
  const [tujuan, setTujuan] = useState('Lainnya')
  const [keterangan, setKeterangan] = useState('')
  const [saving, setSaving] = useState(false)

  const selected = bahan.find((b) => b.id === bahanId)
  const canSave = !!bahanId && Number(qty) > 0 && !saving

  const reset = () => {
    setBahanId('')
    setTanggal(todayStr())
    setQty('')
    setTujuan('Lainnya')
    setKeterangan('')
  }

  const submit = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await apiFetch('/api/stock-bahan/mutasi', {
        method: 'POST',
        body: JSON.stringify({ bahanId, jenis: 'keluar', qty: Number(qty), tanggal, tujuan, keterangan }),
      })
      toast.success(`Stok keluar tercatat (${selected?.nama} −${fmtNum(Number(qty))} ${selected?.satuan})`)
      onOpenChange(false)
      reset()
      await onSaved()
    } catch (e: any) {
      toast.error(e?.message || 'Gagal menyimpan stok keluar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Stok Keluar</DialogTitle>
          <DialogDescription>Nomor transaksi dibuat otomatis. Stok diperbarui setelah disimpan.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tanggal</Label>
            <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Bahan</Label>
            <BahanPicker bahan={bahan} value={bahanId} onChange={setBahanId} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Jumlah *</Label>
              <Input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Satuan</Label>
              <Input value={selected?.satuan || '—'} disabled />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Tujuan</Label>
            <Select value={tujuan} onValueChange={setTujuan}>
              <SelectTrigger aria-label="Tujuan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TUJUAN_KELUAR.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Catatan</Label>
            <Textarea rows={2} value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Catatan" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={!canSave} onClick={submit}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageMinus className="h-4 w-4" />}
            Catat Stok Keluar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Tab: Penyesuaian Stok
// ============================================================

function PenyesuaianTab({
  mutasi,
  bahan,
  canAdd,
  onSaved,
}: {
  mutasi: Mutasi[]
  bahan: Bahan[]
  canAdd: boolean
  onSaved: () => Promise<void>
}) {
  const [q, setQ] = useState('')
  const [dari, setDari] = useState('')
  const [sampai, setSampai] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return mutasi
      .filter((m) => m.jenis === 'penyesuaian')
      .filter((m) => {
        if (term && !`${m.nomor} ${m.namaBahan} ${m.keterangan} ${m.alasan}`.toLowerCase().includes(term)) return false
        if (dari && m.tanggal && m.tanggal < dari) return false
        if (sampai && m.tanggal && m.tanggal > sampai) return false
        return true
      })
  }, [mutasi, q, dari, sampai])

  return (
    <div className="space-y-4">
      <MutasiFilterBar
        q={q} setQ={setQ} qPlaceholder="Cari nomor / bahan / catatan…"
        dari={dari} setDari={setDari} sampai={sampai} setSampai={setSampai}
        onReset={() => { setQ(''); setDari(''); setSampai('') }}
      />
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => printTable('Penyesuaian Stok', ['Nomor', 'Tanggal', 'Bahan', 'Stok Sistem', 'Stok Fisik', 'Selisih', 'Alasan', 'Catatan'], rows.map((m) => [m.nomor, fmtTanggal(m.tanggal), m.namaBahan, `${fmtNum(m.stokSetelah - m.qty)} ${m.satuanBahan}`, `${fmtNum(m.stokSetelah)} ${m.satuanBahan}`, `${m.qty > 0 ? '+' : ''}${fmtNum(m.qty)}`, m.alasan || '-', m.keterangan || '-']), `${rows.length} penyesuaian`)}>
          <Printer className="h-4 w-4" /> Print
        </Button>
        {canAdd && (
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
            <ArrowLeftRight className="h-4 w-4" /> Penyesuaian Stok
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState text="Belum ada penyesuaian stok." />
      ) : (
        <div className="max-h-[520px] overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Nomor</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Bahan</TableHead>
                <TableHead className="text-right">Stok Sistem</TableHead>
                <TableHead className="text-right">Stok Fisik</TableHead>
                <TableHead className="text-right">Selisih</TableHead>
                <TableHead>Alasan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs font-semibold">{m.nomor}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{fmtTanggal(m.tanggal)}</TableCell>
                  <TableCell className="text-sm font-medium">{m.namaBahan || m.bahan?.nama || '-'}</TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm">{fmtNum(m.stokSetelah - m.qty)} {m.satuanBahan}</TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm font-semibold">{fmtNum(m.stokSetelah)} {m.satuanBahan}</TableCell>
                  <TableCell className={cn('whitespace-nowrap text-right text-sm font-semibold', m.qty > 0 ? 'text-emerald-700' : 'text-red-600')}>
                    {m.qty > 0 ? '+' : ''}{fmtNum(m.qty)}
                  </TableCell>
                  <TableCell className="text-sm">{m.alasan || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PenyesuaianDialog open={dialogOpen} onOpenChange={setDialogOpen} bahan={bahan} onSaved={onSaved} />
    </div>
  )
}

function PenyesuaianDialog({
  open,
  onOpenChange,
  bahan,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  bahan: Bahan[]
  onSaved: () => Promise<void>
}) {
  const [bahanId, setBahanId] = useState('')
  const [tanggal, setTanggal] = useState(todayStr())
  const [stokFisik, setStokFisik] = useState('')
  const [alasan, setAlasan] = useState('Lainnya')
  const [keterangan, setKeterangan] = useState('')
  const [saving, setSaving] = useState(false)

  const selected = bahan.find((b) => b.id === bahanId)
  const selisih = selected ? (Number(stokFisik) || 0) - selected.stok : null
  const canSave = !!bahanId && stokFisik !== '' && Number(stokFisik) >= 0 && selisih !== 0 && !saving

  const reset = () => {
    setBahanId('')
    setTanggal(todayStr())
    setStokFisik('')
    setAlasan('Lainnya')
    setKeterangan('')
  }

  const submit = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await apiFetch('/api/stock-bahan/mutasi', {
        method: 'POST',
        body: JSON.stringify({
          bahanId,
          jenis: 'penyesuaian',
          stokFisik: Number(stokFisik),
          tanggal,
          alasan,
          keterangan,
        }),
      })
      toast.success(`Penyesuaian tercatat (${selected?.nama}: ${selected?.stok} → ${fmtNum(Number(stokFisik))} ${selected?.satuan})`)
      onOpenChange(false)
      reset()
      await onSaved()
    } catch (e: any) {
      toast.error(e?.message || 'Gagal menyimpan penyesuaian')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Penyesuaian Stok</DialogTitle>
          <DialogDescription>Nomor transaksi dibuat otomatis. Stok diperbarui setelah disimpan.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tanggal</Label>
            <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Bahan</Label>
            <BahanPicker bahan={bahan} value={bahanId} onChange={setBahanId} />
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Stok sistem</div>
              <div className="font-semibold">{selected ? `${fmtNum(selected.stok)} ${selected.satuan}` : '— pilih bahan'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Selisih</div>
              <div className={cn('font-semibold', selisih === null ? '' : selisih > 0 ? 'text-emerald-700' : selisih < 0 ? 'text-red-600' : '')}>
                {selisih === null ? '—' : `${selisih > 0 ? '+' : ''}${fmtNum(selisih)} ${selected?.satuan || ''}`}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Stok fisik *</Label>
              <Input type="number" min="0" step="any" value={stokFisik} onChange={(e) => setStokFisik(e.target.value)} placeholder="0" disabled={!selected} />
            </div>
            <div className="space-y-1.5">
              <Label>Alasan</Label>
              <Select value={alasan} onValueChange={setAlasan}>
                <SelectTrigger aria-label="Alasan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALASAN_PENYESUAIAN.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Catatan</Label>
            <Textarea rows={2} value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Catatan" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={!canSave} onClick={submit}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
            Catat Penyesuaian
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Tab: Riwayat Stok (ledger)
// ============================================================

function RiwayatTab({
  mutasi,
  bahan,
  canAdd,
}: {
  mutasi: Mutasi[]
  bahan: Bahan[]
  canAdd: boolean
}) {
  const [q, setQ] = useState('')
  const [dari, setDari] = useState('')
  const [sampai, setSampai] = useState('')
  const [fBahan, setFBahan] = useState('all')
  const [fJenis, setFJenis] = useState('all')

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return mutasi.filter((m) => {
      if (term && !`${m.namaBahan} ${m.nomor} ${m.keterangan}`.toLowerCase().includes(term)) return false
      if (dari && m.tanggal && m.tanggal < dari) return false
      if (sampai && m.tanggal && m.tanggal > sampai) return false
      if (fBahan !== 'all' && m.bahanId !== fBahan) return false
      if (fJenis !== 'all' && m.jenis !== fJenis) return false
      return true
    })
  }, [mutasi, q, dari, sampai, fBahan, fJenis])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari bahan / nomor / catatan…" className="pl-9" />
        </div>
        <Input type="date" value={dari} onChange={(e) => setDari(e.target.value)} aria-label="Dari tanggal" className="w-full sm:w-40" />
        <Input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} aria-label="Sampai tanggal" className="w-full sm:w-40" />
        <Select value={fBahan} onValueChange={setFBahan}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter bahan">
            <SelectValue placeholder="Semua bahan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua bahan</SelectItem>
            {bahan.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.nama}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fJenis} onValueChange={setFJenis}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Filter jenis">
            <SelectValue placeholder="Semua jenis" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua jenis</SelectItem>
            <SelectItem value="masuk">Stok Masuk</SelectItem>
            <SelectItem value="keluar">Stok Keluar</SelectItem>
            <SelectItem value="penyesuaian">Penyesuaian</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => { setQ(''); setDari(''); setSampai(''); setFBahan('all'); setFJenis('all') }}>
          Reset
        </Button>
        <Button variant="outline" size="sm" onClick={() => printTable('Riwayat Stok', ['Tanggal', 'Nomor', 'Jenis', 'Bahan', 'Qty', 'Stok Akhir', 'Keterangan'], rows.map((m) => [fmtTanggal(m.tanggal), m.nomor, m.jenis, m.namaBahan, `${m.qty < 0 ? '' : m.jenis === 'keluar' ? '−' : '+'}${fmtNum(Math.abs(m.qty))} ${m.satuanBahan}`, `${fmtNum(m.stokSetelah)} ${m.satuanBahan}`, m.keterangan || '-']), `${rows.length} transaksi`)}>
          <Printer className="h-4 w-4" /> Print
        </Button>
        {canAdd && <span className="text-xs text-muted-foreground">Catat transaksi lewat tab Stok Masuk / Stok Keluar / Penyesuaian.</span>}
      </div>

      {rows.length === 0 ? (
        <EmptyState text="Belum ada transaksi stok." />
      ) : (
        <div className="max-h-[520px] overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Nomor</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead>Bahan</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Stok Akhir</TableHead>
                <TableHead>Keterangan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-sm">{fmtTanggal(m.tanggal)}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs font-semibold">{m.nomor}</TableCell>
                  <TableCell><JenisBadge jenis={m.jenis} /></TableCell>
                  <TableCell className="text-sm font-medium">{m.namaBahan || m.bahan?.nama || '-'}</TableCell>
                  <TableCell className={cn('whitespace-nowrap text-right text-sm font-semibold', m.jenis === 'masuk' ? 'text-emerald-700' : m.jenis === 'keluar' ? 'text-red-600' : m.qty > 0 ? 'text-emerald-700' : 'text-red-600')}>
                    {m.jenis === 'masuk' ? '+' : m.jenis === 'keluar' ? '−' : m.qty > 0 ? '+' : ''}
                    {fmtNum(Math.abs(m.qty))} {m.satuanBahan}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm">{fmtNum(m.stokSetelah)} {m.satuanBahan}</TableCell>
                  <TableCell className="max-w-52 truncate text-sm text-muted-foreground">
                    {m.jenis === 'keluar' && m.tujuan ? `${m.tujuan}${m.keterangan ? ' — ' + m.keterangan : ''}` : m.jenis === 'penyesuaian' && m.alasan ? `${m.alasan}${m.keterangan ? ' — ' + m.keterangan : ''}` : m.keterangan || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Tab: Laporan Stok
// ============================================================

function LaporanTab({
  bahan,
  nilaiPersediaan,
  menipis,
  habis,
  canAdd,
}: {
  bahan: Bahan[]
  nilaiPersediaan: number
  menipis: Bahan[]
  habis: Bahan[]
  canAdd: boolean
}) {
  const [fKategori, setFKategori] = useState('all')
  const [fSupplier, setFSupplier] = useState('all')

  const kategoriList = useMemo(() => {
    const set = new Set<string>()
    for (const b of bahan) {
      const k = (b.kategori || '').trim()
      if (k) set.add(k)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [bahan])

  const supplierList = useMemo(() => {
    const set = new Set<string>()
    for (const b of bahan) {
      const s = (b.pemasok || '').trim()
      if (s) set.add(s)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [bahan])

  const rows = useMemo(
    () =>
      bahan
        .filter((b) => {
          if (fKategori !== 'all' && (b.kategori || '') !== fKategori) return false
          if (fSupplier !== 'all' && (b.pemasok || '') !== fSupplier) return false
          return true
        })
        .sort((a, b) => a.nama.localeCompare(b.nama)),
    [bahan, fKategori, fSupplier]
  )

  const nilaiFiltered = rows.reduce((a, b) => a + (b.stok || 0) * (b.hargaSatuan || 0), 0)

  const tableCols = ['Kode', 'Nama', 'Kategori', 'Stok', 'Satuan', 'Harga Modal', 'Nilai']
  const tableRows = rows.map((b) => [
    b.kode,
    b.nama,
    b.kategori || '-',
    fmtNum(b.stok),
    b.satuan,
    formatIDR(b.hargaSatuan),
    formatIDR((b.stok || 0) * (b.hargaSatuan || 0)),
  ])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={fKategori} onValueChange={setFKategori}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter kategori">
            <SelectValue placeholder="Semua kategori" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua kategori</SelectItem>
            {kategoriList.map((k) => (
              <SelectItem key={k} value={k}>{k}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fSupplier} onValueChange={setFSupplier}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Filter supplier">
            <SelectValue placeholder="Semua supplier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua supplier</SelectItem>
            {supplierList.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => { setFKategori('all'); setFSupplier('all') }}>
          Reset
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => printTable('Laporan Stok', tableCols, tableRows, `Nilai persediaan ${formatIDR(nilaiFiltered)}`)}>
          <Printer className="h-4 w-4" /> Print
        </Button>
        <Button variant="outline" size="sm" onClick={() => exportPdf('Laporan Stok', tableCols, tableRows, `Nilai persediaan ${formatIDR(nilaiFiltered)}`)}>
          <ClipboardList className="h-4 w-4" /> PDF
        </Button>
        {canAdd && <span className="hidden text-xs text-muted-foreground sm:inline">Stok akhir × harga modal terakhir</span>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={Package} label="Nilai Persediaan" value={formatIDR(nilaiPersediaan)} sub="stok akhir × harga modal terakhir" tone="emerald" />
        <StatCard icon={AlertTriangle} label="Bahan Menipis" value={menipis.length} sub="stok ≤ stok minimum" tone="amber" />
        <StatCard icon={TrendingDown} label="Bahan Habis" value={habis.length} sub="stok ≤ 0" tone="red" />
      </div>

      {rows.length === 0 ? (
        <EmptyState text="Tidak ada data untuk filter ini" />
      ) : (
        <div className="max-h-[520px] overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Kode</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead className="text-right">Stok</TableHead>
                <TableHead className="text-right">Harga Modal</TableHead>
                <TableHead className="text-right">Nilai</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">{b.kode}</TableCell>
                  <TableCell className="text-sm font-medium">{b.nama}</TableCell>
                  <TableCell className="text-sm">{b.kategori || '—'}</TableCell>
                  <TableCell className={cn('whitespace-nowrap text-right text-sm font-semibold', b.stok <= 0 ? 'text-red-600' : b.stokMin > 0 && b.stok <= b.stokMin ? 'text-amber-600' : '')}>
                    {fmtNum(b.stok)} {b.satuan}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm">{formatIDR(b.hargaSatuan)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm font-semibold">{formatIDR((b.stok || 0) * (b.hargaSatuan || 0))}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell colSpan={5} className="text-right text-sm">Total Nilai</TableCell>
                <TableCell className="whitespace-nowrap text-right text-sm">{formatIDR(nilaiFiltered)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

/**
 * Dialog Kategori Bahan — daftar kategori otomatis dari bahan.
 * Klik kategori → buka Data Bahan terfilter kategori tersebut.
 */
function KategoriDialog({
  open,
  onOpenChange,
  kategori,
  onPick,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  kategori: Array<[string, number]>
  onPick: (k: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kategori Bahan</DialogTitle>
          <DialogDescription>Klik kategori untuk membuka Data Bahan terfilter</DialogDescription>
        </DialogHeader>
        {kategori.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Belum ada kategori. Kategori otomatis muncul saat bahan dibuat.
          </p>
        ) : (
          <div className="flex max-h-72 flex-wrap gap-2 overflow-y-auto py-1">
            {kategori.map(([k, count]) => (
              <button
                key={k}
                type="button"
                onClick={() => onPick(k)}
                className="flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1.5 text-sm transition-colors hover:border-emerald-500 hover:bg-emerald-50"
              >
                <Tag className="h-3.5 w-3.5 text-emerald-600" />
                <span className="font-medium">{k}</span>
                <span className="text-xs text-muted-foreground">({count})</span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Helper: pisah keterangan "Ref PO: x | catatan"
// ============================================================

function splitRefPo(ket: string): { poRef: string; catatan: string } {
  const m = /^Ref PO:\s*(.+?)(?:\s*\|\s*(.*))?$/.exec((ket || '').trim())
  if (m) return { poRef: m[1].trim(), catatan: (m[2] || '').trim() }
  return { poRef: '', catatan: (ket || '').trim() }
}

// ============================================================
// Dialog: Tambah / Edit Bahan
// ============================================================

function BahanFormDialog({
  open,
  onOpenChange,
  editing,
  bahan,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: Bahan | null
  bahan: Bahan[]
  onSaved: () => Promise<void>
}) {
  const [nama, setNama] = useState('')
  const [kategori, setKategori] = useState('Tanpa kategori')
  const [satuan, setSatuan] = useState('pcs')
  const [stok, setStok] = useState('0')
  const [stokMin, setStokMin] = useState('0')
  const [hargaSatuan, setHargaSatuan] = useState('0')
  const [pemasok, setPemasok] = useState('')
  const [supplierListOpen, setSupplierListOpen] = useState(false)
  const [lokasi, setLokasi] = useState('')
  const [poRef, setPoRef] = useState('')
  const [catatan, setCatatan] = useState('')
  const [aktif, setAktif] = useState(true)
  const [saving, setSaving] = useState(false)

  // Referensi PO — daftar PO dari /api/purchase-order
  const [poList, setPoList] = useState<PoOption[]>([])
  const [poListOpen, setPoListOpen] = useState(false)
  const [poLoading, setPoLoading] = useState(false)

  const kategoriOptions = useMemo(() => {
    const set = new Set<string>(KATEGORI_BAWAAN)
    for (const b of bahan) {
      const k = (b.kategori || '').trim()
      if (k) set.add(k)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [bahan])

  // Opsi dropdown Nama Supplier — dikumpulkan dari bahan yang sudah ada (unik + urut abjad).
  const supplierOptions = useMemo(() => {
    const set = new Set<string>()
    for (const b of bahan) {
      const s = (b.pemasok || '').trim()
      if (s) set.add(s)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [bahan])

  // Ketik manual selalu bisa; daftar dropdown menyeleksi mengikuti teks yang diketik.
  const filteredSuppliers = useMemo(() => {
    const q = pemasok.trim().toLowerCase()
    if (!q) return supplierOptions
    return supplierOptions.filter((s) => s.toLowerCase().includes(q))
  }, [supplierOptions, pemasok])

  useEffect(() => {
    if (!open) return
    if (editing) {
      setNama(editing.nama)
      setKategori(editing.kategori || 'Tanpa kategori')
      setSatuan(editing.satuan || 'pcs')
      setStok(String(editing.stok ?? 0))
      setStokMin(String(editing.stokMin ?? 0))
      setHargaSatuan(String(editing.hargaSatuan ?? 0))
      setPemasok(editing.pemasok || '')
      setLokasi(editing.lokasi || '')
      const split = splitRefPo(editing.keterangan || '')
      setPoRef(split.poRef)
      setCatatan(split.catatan)
      setAktif(editing.aktif)
    } else {
      setNama('')
      setKategori('Tanpa kategori')
      setSatuan('pcs')
      setStok('0')
      setStokMin('0')
      setHargaSatuan('0')
      setPemasok('')
      setLokasi('')
      setPoRef('')
      setCatatan('')
      setAktif(true)
    }
    setPoListOpen(false)
    setSupplierListOpen(false)
  }, [open, editing])

  const loadPoList = async () => {
    setPoListOpen((v) => !v)
    if (poList.length > 0) return
    setPoLoading(true)
    try {
      const data = await apiFetch<PoOption[] | { data?: PoOption[] }>('/api/purchase-order')
      const arr = Array.isArray(data) ? data : (data?.data ?? [])
      setPoList(arr.slice(0, 50))
    } catch {
      toast.error('Gagal memuat daftar PO')
    } finally {
      setPoLoading(false)
    }
  }

  const submit = async () => {
    if (!nama.trim() || saving) return
    setSaving(true)
    try {
      const payload = {
        nama: nama.trim(),
        kategori: kategori === 'Tanpa kategori' ? '' : kategori,
        satuan,
        stok: Number(stok) || 0,
        stokMin: Number(stokMin) || 0,
        hargaSatuan: Number(hargaSatuan) || 0,
        pemasok: pemasok.trim(),
        lokasi: lokasi.trim(),
        aktif,
        keterangan: catatan.trim(),
        poRef: poRef.trim(),
      }
      if (editing) {
        await apiFetch('/api/stock-bahan', { method: 'PUT', body: JSON.stringify({ id: editing.id, ...payload }) })
        toast.success('Perubahan bahan disimpan')
      } else {
        await apiFetch('/api/stock-bahan', { method: 'POST', body: JSON.stringify(payload) })
        toast.success(`Bahan ditambahkan (${payload.nama})`)
      }
      onOpenChange(false)
      await onSaved()
    } catch (e: any) {
      toast.error(e?.message || 'Gagal menyimpan bahan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bahan-popup-compact max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Bahan' : 'Tambah Bahan'}</DialogTitle>
          <DialogDescription>
            {editing ? `Kode ${editing.kode} — ubah data bahan.` : 'Kode bahan : (otomatis)'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="bhn-nama">Nama bahan *</Label>
            <Input id="bhn-nama" value={nama} onChange={(e) => setNama(e.target.value)} placeholder="mis. Kertas Kraft 250gsm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Kategori</Label>
              <Select value={kategori} onValueChange={setKategori}>
                <SelectTrigger aria-label="Kategori">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bahan-popup-compact">
                  <SelectItem value="Tanpa kategori">Tanpa kategori</SelectItem>
                  {kategoriOptions.map((k) => (
                    <SelectItem key={k} value={k}>{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Satuan *</Label>
              <Select value={satuan} onValueChange={setSatuan}>
                <SelectTrigger aria-label="Satuan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bahan-popup-compact">
                  {SATUAN_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Stok awal</Label>
              <Input type="number" min="0" step="any" value={stok} onChange={(e) => setStok(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Stok minimum</Label>
              <Input type="number" min="0" step="any" value={stokMin} onChange={(e) => setStokMin(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Harga modal / pcs</Label>
              <Input type="number" min="0" step="any" value={hargaSatuan} onChange={(e) => setHargaSatuan(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nama Supplier</Label>
              <div className="relative">
                <div className="flex gap-2">
                  <Input
                    value={pemasok}
                    onChange={(e) => {
                      setPemasok(e.target.value)
                      setSupplierListOpen(true)
                    }}
                    onFocus={() => setSupplierListOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setSupplierListOpen(false)
                    }}
                    placeholder="Ketik manual atau pilih dari daftar…"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setSupplierListOpen((v) => !v)}
                    aria-label="Tampilkan daftar supplier"
                    aria-expanded={supplierListOpen}
                  >
                    <ChevronsUpDown className="h-4 w-4" />
                  </Button>
                </div>
                {supplierListOpen && (
                  <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-background shadow-md">
                    {supplierOptions.length === 0 ? (
                      <div className="p-3 text-xs text-muted-foreground">Belum ada supplier tersimpan — ketik manual saja.</div>
                    ) : filteredSuppliers.length === 0 ? (
                      <div className="p-3 text-xs text-muted-foreground">Tidak ada yang cocok — ketik manual lanjut.</div>
                    ) : (
                      filteredSuppliers.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={cn(
                            'flex w-full items-center px-3 py-2 text-left text-sm hover:bg-muted',
                            pemasok === s && 'bg-muted font-medium'
                          )}
                          onClick={() => {
                            setPemasok(s)
                            setSupplierListOpen(false)
                          }}
                        >
                          <span className="truncate">{s}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Lokasi penyimpanan</Label>
              <Input value={lokasi} onChange={(e) => setLokasi(e.target.value)} placeholder="mis. Gudang A — Rak 2" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Referensi PO</Label>
            <div className="relative">
              <div className="flex gap-2">
                <Input value={poRef} onChange={(e) => setPoRef(e.target.value)} placeholder="Ketik atau pilih nomor PO…" />
                <Button type="button" variant="outline" size="icon" onClick={loadPoList} aria-label="Tampilkan daftar PO">
                  {poLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronsUpDown className="h-4 w-4" />}
                </Button>
              </div>
              {poListOpen && (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-background shadow-md">
                  {poList.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground">Belum ada purchase order.</div>
                  ) : (
                    poList.map((p) => (
                      <button
                        key={p.poNumber}
                        type="button"
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setPoRef(p.poNumber)
                          if (!pemasok && p.supplierName) setPemasok(p.supplierName)
                          setPoListOpen(false)
                        }}
                      >
                        <span className="font-mono text-xs font-semibold">{p.poNumber}</span>
                        <span className="max-w-40 truncate text-xs text-muted-foreground">{p.supplierName}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Nomor PO pembelian bahan ini (opsional).</p>
          </div>
          <div className="space-y-1.5">
            <Label>Catatan</Label>
            <Textarea rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Opsional" />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">Status aktif bahan</div>
              <div className="text-xs text-muted-foreground">Bahan nonaktif disembunyikan dari transaksi baru.</div>
            </div>
            <Switch checked={aktif} onCheckedChange={setAktif} aria-label="Status aktif bahan" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={!nama.trim() || saving} onClick={submit}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? 'Simpan Perubahan' : 'Tambah Bahan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
