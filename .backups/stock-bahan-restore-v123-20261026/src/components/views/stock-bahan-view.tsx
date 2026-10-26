'use client'

/**
 * StockBahanView — versi SIMPLIFIKASI (4 menu sederhana).
 *
 * 1. Stock Bahan  : master bahan + ringkasan (total jenis, menipis, habis),
 *                   search nama/kode, filter kategori & status, pagination,
 *                   detail, edit, hapus (hanya bahan tanpa transaksi).
 * 2. Stock Masuk  : pembelian & penerimaan barang (nomor auto SM-xxx, harga
 *                   beli, total otomatis, pemasok, no. nota / referensi PO).
 * 3. Stock Keluar : pemakaian bahan (nomor auto SK-xxx, stok sebelum/sesudah,
 *                   tujuan pemakaian, referensi pekerjaan).
 * 4. Laporan Stock: saldo awal + masuk − keluar = saldo akhir per periode,
 *                   filter tanggal/bahan/kategori, detail histori, cetak,
 *                   PDF & ekspor CSV.
 *
 * Fitur pendukung tetap tersedia tanpa menambah menu:
 * - Dashboard lama  → ringkasan kecil di atas halaman Stock Bahan.
 * - Penyesuaian stok → tombol di panel samping (dialog SP-xxx).
 * - Riwayat         → dialog Detail Bahan & dialog Detail Histori Laporan.
 * - Kategori        → filter & form bahan.
 *
 * Semua perubahan stok lewat transaksi/penyesuaian (ledger BahanMutasi);
 * form master bahan TIDAK mengubah stok langsung.
 */

import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Boxes,
  ChevronsUpDown,
  ClipboardList,
  Eye,
  FileDown,
  History,
  Loader2,
  Menu as MenuIcon,
  Package,
  PackageMinus,
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
import { statusStok, type StockStatus } from '@/lib/stock-bahan-types'
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
  TableFooter,
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
  referensi?: string
  alasan: string
  createdAt: string
  bahan?: { kode: string; nama: string; satuan: string }
}

interface LaporanRow {
  bahanId: string
  kode: string
  nama: string
  kategori: string
  satuan: string
  stokMin: number
  stokAwal: number
  masuk: number
  keluar: number
  penyesuaian: number
  stokAkhir: number
  hargaSatuan: number
  nilai: number
  status: StockStatus
}

interface RiwayatRow {
  id: string
  tanggal: string
  nomor: string
  jenis: string
  masuk: number
  keluar: number
  saldo: number
  keterangan: string
  bahanNama?: string
  satuan?: string
}

interface DetailResponse {
  bahan: Bahan
  ringkasan: { totalMasuk: number; totalKeluar: number; jumlahTransaksi: number; nilaiStok: number }
  riwayat: Array<{
    id: string
    tanggal: string
    nomor: string
    jenis: string
    qty: number
    saldo: number
    satuan: string
    tujuan: string
    referensi: string
    alasan: string
    keterangan: string
    hargaBeli: number
    totalHarga: number
    pemasok: string
    nomorNota: string
  }>
}

interface PoOption {
  poNumber: string
  supplierName: string
}

type TabId = 'data' | 'masuk' | 'keluar' | 'laporan'

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

const TUJUAN_KELUAR = ['Produksi', 'Pemakaian Internal', 'Sampel', 'Rusak', 'Lainnya']

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
  { id: 'data', label: 'Stock Bahan', desc: 'Master bahan & ringkasan stok', icon: Shapes },
  { id: 'masuk', label: 'Stock Masuk', desc: 'Pembelian & penerimaan barang', icon: PackagePlus },
  { id: 'keluar', label: 'Stock Keluar', desc: 'Pemakaian bahan produksi', icon: PackageMinus },
  { id: 'laporan', label: 'Laporan Stock', desc: 'Saldo awal, mutasi & saldo akhir', icon: BarChart3 },
]

/** Tanggal hari ini yyyy-mm-dd (zona aplikasi). */
function todayStr(): string {
  return new Date().toLocaleDateString('sv-SE')
}

/** Tanggal pertama bulan ini yyyy-mm-dd. */
function firstDayOfMonth(): string {
  const t = todayStr()
  return `${t.slice(0, 7)}-01`
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

function r2(n: number): number {
  return Math.round(n * 100) / 100
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
          <span className="truncate">{label}</span>
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

/** Badge status stok: Aman / Menipis / Habis. */
function StokStatusBadge({ stok, stokMin }: { stok: number; stokMin: number }) {
  const s = statusStok(stok, stokMin)
  if (s === 'habis') return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Habis</Badge>
  if (s === 'menipis') return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Menipis</Badge>
  return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Aman</Badge>
}

/** Badge jenis mutasi. */
function JenisBadge({ jenis }: { jenis: string }) {
  if (jenis === 'masuk') return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Masuk</Badge>
  if (jenis === 'keluar') return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Keluar</Badge>
  return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Penyesuaian</Badge>
}

// ============================================================
// Export: Print, PDF, CSV
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

/** Ekspor CSV (pemisah ";" + BOM agar langsung rapi di Excel). */
function exportCsv(title: string, columns: string[], rows: string[][], summary?: string) {
  const esc = (v: string | number) => {
    const s = String(v ?? '')
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines: string[] = [title]
  if (summary) lines.push(summary)
  lines.push('')
  lines.push(columns.map(esc).join(';'))
  for (const r of rows) lines.push(r.map(esc).join(';'))
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${title.replace(/\s+/g, '-')}-${todayStr()}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  toast.success('CSV berhasil diunduh')
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
  const [tab, setTab] = useState<TabId>('data')
  const [menuOpen, setMenuOpen] = useState(false)

  // switch "Izinkan stok minus"
  const [izinkanMinus, setIzinkanMinus] = useState(false)
  const [savingMinus, setSavingMinus] = useState(false)

  // dialog Tambah/Edit bahan
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Bahan | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Bahan | null>(null)

  // dialog detail bahan & penyesuaian
  const [detailTarget, setDetailTarget] = useState<Bahan | null>(null)
  const [penyesuaianOpen, setPenyesuaianOpen] = useState(false)
  const [penyesuaianBahanId, setPenyesuaianBahanId] = useState('')
  const [penyesuaianBahanNama, setPenyesuaianBahanNama] = useState('')

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

  // ====== statistik ringkasan (dashboard lama → ringkasan kecil) ======
  const aktif = useMemo(() => bahan.filter((b) => b.aktif), [bahan])
  const menipis = useMemo(
    () => bahan.filter((b) => b.aktif && b.stok > 0 && b.stokMin > 0 && b.stok <= b.stokMin),
    [bahan]
  )
  const habis = useMemo(() => bahan.filter((b) => b.aktif && (b.stok || 0) <= 0), [bahan])
  const nilaiPersediaan = useMemo(
    () => bahan.reduce((a, b) => a + (b.stok || 0) * (b.hargaSatuan || 0), 0),
    [bahan]
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

  const openPenyesuaian = (bahanId?: string) => {
    setPenyesuaianBahanId(bahanId || '')
    const b = bahan.find((x) => x.id === bahanId)
    setPenyesuaianBahanNama(b ? `${b.nama} (${b.kode})` : '')
    setPenyesuaianOpen(true)
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
    </div>
  )

  const switchMinus = (
    <div className={cn('flex items-center justify-between gap-2 rounded-lg px-3 py-2', savingMinus && 'opacity-60')}>
      <span className="text-xs font-medium leading-tight text-muted-foreground">Izinkan stok minus</span>
      <Switch checked={izinkanMinus} onCheckedChange={toggleIzinkanMinus} disabled={savingMinus} aria-label="Izinkan stok minus" />
    </div>
  )

  const sideTools = (
    <div className="space-y-2">
      {canAdd && (
        <Button variant="outline" className="w-full justify-start gap-2" onClick={() => openPenyesuaian()}>
          <ArrowLeftRight className="h-4 w-4 text-amber-600" /> Penyesuaian Stok
        </Button>
      )}
      {switchMinus}
    </div>
  )

  const currentNav = NAV_ITEMS.find((n) => n.id === tab)

  /** Header tiap tab: judul + Nilai persediaan. */
  const tabHeader = (
    <div className="hidden flex-wrap items-center justify-between gap-3 lg:flex">
      <h2 className="flex items-center gap-2 text-xl font-bold">
        {currentNav && <currentNav.icon className="h-5 w-5 text-emerald-600" />} {currentNav?.label || 'Stock Bahan'}
      </h2>
      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-muted-foreground sm:inline">Nilai persediaan</span>
        <Badge className="bg-emerald-100 text-sm text-emerald-700 hover:bg-emerald-100">{formatIDR(nilaiPersediaan)}</Badge>
      </div>
    </div>
  )

  // FAB mobile: tambah bahan di tab Stock Bahan (tab transaksi punya tombol
  // "Catat" sendiri di toolbarnya).
  const fabAction = tab === 'data' && canAdd ? openTambah : undefined

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
            {sideTools}
          </CardContent>
        </Card>
      </aside>

      {/* ===== Menu mobile ===== */}
      <div className="flex items-center gap-3 lg:hidden">
        <Button variant="outline" size="sm" onClick={() => setMenuOpen(true)}>
          <MenuIcon className="h-4 w-4" /> Menu
        </Button>
        <h2 className="text-lg font-bold">{currentNav?.label || 'Stock Bahan'}</h2>
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
          {sideTools}
        </SheetContent>
      </Sheet>

      {/* ===== Konten ===== */}
      <div className="min-w-0 flex-1 space-y-4">
        {loading ? (
          <Spinner label="Memuat stock bahan…" />
        ) : (
          <>
            {tabHeader}
            {tab === 'data' && (
              <DataTab
                bahan={bahan}
                canAdd={canAdd}
                canEdit={canEdit}
                canDelete={canDelete}
                onTambah={openTambah}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
                onDetail={setDetailTarget}
                onPenyesuaian={openPenyesuaian}
              />
            )}
            {tab === 'masuk' && (
              <MasukTab
                mutasi={mutasi}
                bahan={aktif}
                canAdd={canAdd}
                canEdit={canEdit}
                canDelete={canDelete}
                onSaved={refresh}
              />
            )}
            {tab === 'keluar' && (
              <KeluarTab
                mutasi={mutasi}
                bahan={aktif}
                canAdd={canAdd}
                canEdit={canEdit}
                canDelete={canDelete}
                onSaved={refresh}
                izinkanMinus={izinkanMinus}
              />
            )}
            {tab === 'laporan' && <LaporanTab bahan={bahan} />}
          </>
        )}
      </div>

      {/* FAB mobile — tambah bahan (tab Stock Bahan) */}
      {!loading && fabAction && (
        <button
          type="button"
          onClick={fabAction}
          aria-label="Tambah data"
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

      {/* Dialog detail bahan */}
      <DetailDialog
        bahan={detailTarget}
        onOpenChange={(o) => {
          if (!o) setDetailTarget(null)
        }}
        canEdit={canEdit}
        onEdit={(b) => {
          setDetailTarget(null)
          openEdit(b)
        }}
        onPenyesuaian={(b) => {
          setDetailTarget(null)
          openPenyesuaian(b.id)
        }}
      />

      {/* Dialog penyesuaian stok */}
      <PenyesuaianDialog
        open={penyesuaianOpen}
        onOpenChange={setPenyesuaianOpen}
        bahan={bahan}
        initialBahanId={penyesuaianBahanId}
        initialBahanNama={penyesuaianBahanNama}
        onSaved={refresh}
      />

      {/* Konfirmasi hapus bahan */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus bahan?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `"${deleteTarget.nama}" (${deleteTarget.kode}) akan dihapus permanen. Bahan yang sudah punya transaksi tidak dapat dihapus — gunakan Nonaktifkan.`
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
                  setDeleteTarget(null)
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
// Tab: Stock Bahan (master + ringkasan)
// ============================================================

function DataTab({
  bahan,
  canAdd,
  canEdit,
  canDelete,
  onTambah,
  onEdit,
  onDelete,
  onDetail,
  onPenyesuaian,
}: {
  bahan: Bahan[]
  canAdd: boolean
  canEdit: boolean
  canDelete: boolean
  onTambah: () => void
  onEdit: (b: Bahan) => void
  onDelete: (b: Bahan) => void
  onDetail: (b: Bahan) => void
  onPenyesuaian: (bahanId: string) => void
}) {
  const [q, setQ] = useState('')
  const [fKategori, setFKategori] = useState('all')
  const [fStatus, setFStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

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
        if (term && !`${b.nama} ${b.kode}`.toLowerCase().includes(term)) return false
        if (fKategori !== 'all' && (b.kategori || '') !== fKategori) return false
        if (fStatus === 'nonaktif') {
          if (b.aktif) return false
        } else {
          if (!b.aktif) return false
          const s = statusStok(b.stok, b.stokMin)
          if (fStatus !== 'all' && s !== fStatus) return false
        }
        return true
      })
      .sort((a, b) => a.nama.localeCompare(b.nama))
  }, [bahan, q, fKategori, fStatus])

  // reset ke halaman 1 saat filter berubah
  useEffect(() => {
    setPage(1)
  }, [q, fKategori, fStatus, pageSize])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  // Ringkasan (pengganti Dashboard Stock lama) dihitung dari seluruh bahan aktif
  const menipis = bahan.filter((b) => b.aktif && b.stok > 0 && b.stokMin > 0 && b.stok <= b.stokMin).length
  const habis = bahan.filter((b) => b.aktif && (b.stok || 0) <= 0).length

  return (
    <div className="space-y-4">
      {/* Ringkasan kecil (pengganti Dashboard Stock lama) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={Shapes} label="Total Jenis Bahan" value={bahan.length} sub={`${bahan.filter((b) => b.aktif).length} aktif`} />
        <StatCard icon={AlertTriangle} label="Stok Menipis" value={menipis} sub="stok ≤ stok minimum" tone="amber" />
        <StatCard icon={TrendingDown} label="Stok Habis" value={habis} sub="stok ≤ 0" tone="red" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-44 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / kode bahan…" className="pl-9" />
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
          <SelectTrigger className="w-full sm:w-40" aria-label="Filter status stok">
            <SelectValue placeholder="Semua status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            <SelectItem value="aman">Aman</SelectItem>
            <SelectItem value="menipis">Menipis</SelectItem>
            <SelectItem value="habis">Habis</SelectItem>
            <SelectItem value="nonaktif">Nonaktif</SelectItem>
          </SelectContent>
        </Select>
        {canAdd && (
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={onTambah}>
            <Plus className="h-4 w-4" /> Tambah Bahan
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState text={canAdd ? 'Belum ada bahan — klik "Tambah Bahan" untuk mulai.' : 'Belum ada bahan.'} />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama bahan</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Satuan</TableHead>
                  <TableHead className="text-right">Stok tersedia</TableHead>
                  <TableHead className="text-right">Stok minimum</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((b) => (
                  <TableRow key={b.id} className={cn(!b.aktif && 'bg-muted/40')}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{b.kode}</TableCell>
                    <TableCell>
                      <div className="font-medium">{b.nama}</div>
                      {(b.pemasok || b.lokasi) && (
                        <div className="max-w-56 truncate text-xs text-muted-foreground">
                          {[b.pemasok, b.lokasi].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{b.kategori || '—'}</TableCell>
                    <TableCell className="text-sm">{b.satuan}</TableCell>
                    <TableCell className={cn('whitespace-nowrap text-right font-semibold', b.stok <= 0 ? 'text-red-600' : b.stokMin > 0 && b.stok <= b.stokMin ? 'text-amber-600' : '')}>
                      {fmtNum(b.stok)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm">{fmtNum(b.stokMin)}</TableCell>
                    <TableCell>
                      {b.aktif ? (
                        <StokStatusBadge stok={b.stok} stokMin={b.stokMin} />
                      ) : (
                        <Badge variant="secondary">Nonaktif</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDetail(b)} aria-label={`Detail ${b.nama}`}>
                          <Eye className="h-4 w-4" />
                        </Button>
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
          <div className="space-y-2 md:hidden">
            {pageRows.map((b) => (
              <Card key={b.id} className={cn(!b.aktif && 'opacity-75')}>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold">{b.nama}</div>
                      <div className="text-xs text-muted-foreground">{b.kode} · {b.kategori || 'Tanpa kategori'}</div>
                    </div>
                    {b.aktif ? (
                      <StokStatusBadge stok={b.stok} stokMin={b.stokMin} />
                    ) : (
                      <Badge variant="secondary">Nonaktif</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-xs">
                    <div><span className="text-muted-foreground">Stok: </span><span className={cn('font-semibold', b.stok <= 0 && 'text-red-600')}>{fmtNum(b.stok)}</span></div>
                    <div><span className="text-muted-foreground">Min: </span><span className="font-semibold">{fmtNum(b.stokMin)}</span></div>
                    <div><span className="text-muted-foreground">Satuan: </span><span className="font-semibold">{b.satuan}</span></div>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    <Button variant="outline" size="sm" onClick={() => onDetail(b)}>
                      <Eye className="h-3.5 w-3.5" /> Detail
                    </Button>
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
                    {canAdd && (
                      <Button variant="outline" size="sm" onClick={() => onPenyesuaian(b.id)}>
                        <ArrowLeftRight className="h-3.5 w-3.5" /> Sesuaikan
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                {filtered.length === 0 ? '0' : `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filtered.length)}`} dari {filtered.length} bahan
              </span>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="h-7 w-[70px] text-xs" aria-label="Baris per halaman">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} / hal</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                Sebelumnya
              </Button>
              <span className="text-xs text-muted-foreground">Hal. {safePage} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
                Berikutnya
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================
// Dialog: Detail Bahan (riwayat lengkap satu bahan)
// ============================================================

function DetailDialog({
  bahan,
  onOpenChange,
  canEdit,
  onEdit,
  onPenyesuaian,
}: {
  bahan: Bahan | null
  onOpenChange: (o: boolean) => void
  canEdit: boolean
  onEdit: (b: Bahan) => void
  onPenyesuaian: (b: Bahan) => void
}) {
  const [detail, setDetail] = useState<DetailResponse | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!bahan) {
      setDetail(null)
      return
    }
    let cancelled = false
    setLoading(true)
    apiFetch<DetailResponse>(`/api/stock-bahan/${encodeURIComponent(bahan.id)}`)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch(() => {
        if (!cancelled) toast.error('Gagal memuat detail bahan')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [bahan])

  return (
    <Dialog open={!!bahan} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-emerald-600" /> Detail Bahan
          </DialogTitle>
          <DialogDescription>
            {bahan ? `${bahan.kode} — ${bahan.nama}` : ''}
          </DialogDescription>
        </DialogHeader>

        {loading || !detail ? (
          <Spinner label="Memuat detail…" />
        ) : (
          <div className="space-y-4">
            {/* Info master */}
            <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-4">
              <div>
                <div className="text-xs text-muted-foreground">Stok tersedia</div>
                <div className="font-bold">{fmtNum(detail.bahan.stok)} {detail.bahan.satuan}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Stok minimum</div>
                <div className="font-semibold">{fmtNum(detail.bahan.stokMin)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Harga modal</div>
                <div className="font-semibold">{formatIDR(detail.bahan.hargaSatuan)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Nilai stok</div>
                <div className="font-semibold">{formatIDR(detail.ringkasan.nilaiStok)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Kategori</div>
                <div className="font-medium">{detail.bahan.kategori || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Pemasok</div>
                <div className="truncate font-medium">{detail.bahan.pemasok || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Lokasi</div>
                <div className="truncate font-medium">{detail.bahan.lokasi || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total transaksi</div>
                <div className="font-medium">
                  +{fmtNum(detail.ringkasan.totalMasuk)} / −{fmtNum(detail.ringkasan.totalKeluar)} ({detail.ringkasan.jumlahTransaksi})
                </div>
              </div>
              {(detail.bahan.keterangan) && (
                <div className="col-span-2 sm:col-span-4">
                  <div className="text-xs text-muted-foreground">Spesifikasi / keterangan</div>
                  <div className="whitespace-pre-wrap text-sm">{detail.bahan.keterangan || '—'}</div>
                </div>
              )}
            </div>

            {/* Riwayat mutasi */}
            <div>
              <div className="mb-2 text-sm font-semibold">Riwayat transaksi (terbaru dulu)</div>
              {detail.riwayat.length === 0 ? (
                <EmptyState text="Belum ada transaksi untuk bahan ini." />
              ) : (
                <div className="max-h-72 overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Nomor</TableHead>
                        <TableHead>Jenis</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                        <TableHead>Keterangan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.riwayat.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="whitespace-nowrap text-xs">{fmtTanggal(r.tanggal)}</TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-xs">{r.nomor || '—'}</TableCell>
                          <TableCell><JenisBadge jenis={r.jenis} /></TableCell>
                          <TableCell className={cn('whitespace-nowrap text-right text-xs font-semibold', r.jenis === 'masuk' ? 'text-emerald-700' : r.jenis === 'keluar' ? 'text-red-600' : r.qty > 0 ? 'text-emerald-700' : 'text-red-600')}>
                            {r.jenis === 'masuk' ? '+' : r.jenis === 'keluar' ? '−' : r.qty > 0 ? '+' : ''}
                            {fmtNum(Math.abs(r.qty))} {r.satuan}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right text-xs">{fmtNum(r.saldo)}</TableCell>
                          <TableCell className="max-w-44 truncate text-xs text-muted-foreground">
                            {r.jenis === 'keluar'
                              ? [r.tujuan, r.referensi, r.keterangan].filter(Boolean).join(' — ') || '—'
                              : r.jenis === 'penyesuaian'
                                ? [r.alasan, r.keterangan].filter(Boolean).join(' — ') || '—'
                                : [r.pemasok, r.nomorNota, r.keterangan].filter(Boolean).join(' — ') || '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {bahan && canEdit && (
            <Button variant="outline" onClick={() => onPenyesuaian(bahan)}>
              <ArrowLeftRight className="h-4 w-4" /> Penyesuaian
            </Button>
          )}
          {bahan && canEdit && (
            <Button variant="outline" onClick={() => onEdit(bahan)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Dialog: Tambah / Edit Bahan (tanpa ubah stok langsung)
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
  const [spesifikasi, setSpesifikasi] = useState('')
  const [satuan, setSatuan] = useState('pcs')
  const [stokMin, setStokMin] = useState('0')
  const [pemasok, setPemasok] = useState('')
  const [supplierListOpen, setSupplierListOpen] = useState(false)
  const [lokasi, setLokasi] = useState('')
  const [keterangan, setKeterangan] = useState('')
  const [aktif, setAktif] = useState(true)
  const [saving, setSaving] = useState(false)

  const kategoriOptions = useMemo(() => {
    const set = new Set<string>(KATEGORI_BAWAAN)
    for (const b of bahan) {
      const k = (b.kategori || '').trim()
      if (k) set.add(k)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [bahan])

  const supplierOptions = useMemo(() => {
    const set = new Set<string>()
    for (const b of bahan) {
      const s = (b.pemasok || '').trim()
      if (s) set.add(s)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [bahan])

  const filteredSuppliers = useMemo(() => {
    const q = pemasok.trim().toLowerCase()
    if (!q) return supplierOptions
    return supplierOptions.filter((s) => s.toLowerCase().includes(q))
  }, [supplierOptions, pemasok])

  // Prediksi kode bahan berikutnya — logika sama dengan POST /api/stock-bahan.
  const nextKode = useMemo(() => {
    let maxNum = 0
    for (const b of bahan) {
      const m = /^BHN-(\d+)$/i.exec(b.kode || '')
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10))
    }
    return `BHN-${String(maxNum + 1).padStart(3, '0')}`
  }, [bahan])

  useEffect(() => {
    if (!open) return
    if (editing) {
      setNama(editing.nama)
      setKategori(editing.kategori || 'Tanpa kategori')
      // keterangan menyimpan "Ref PO: x | catatan" — tampilkan bagian catatan saja
      const m = /^Ref PO:\s*(.+?)(?:\s*\|\s*(.*))?$/.exec((editing.keterangan || '').trim())
      setSpesifikasi('')
      setKeterangan(m ? (m[2] || '').trim() : (editing.keterangan || '').trim())
      setSatuan(editing.satuan || 'pcs')
      setStokMin(String(editing.stokMin ?? 0))
      setPemasok(editing.pemasok || '')
      setLokasi(editing.lokasi || '')
      setAktif(editing.aktif)
    } else {
      setNama('')
      setKategori('Tanpa kategori')
      setSpesifikasi('')
      setSatuan('pcs')
      setStokMin('0')
      setPemasok('')
      setLokasi('')
      setKeterangan('')
      setAktif(true)
    }
    setSupplierListOpen(false)
  }, [open, editing])

  const submit = async () => {
    if (!nama.trim() || saving) return
    setSaving(true)
    try {
      // Spesifikasi digabung rapi ke keterangan (baris pertama spesifikasi).
      const ketParts = [spesifikasi.trim(), keterangan.trim()].filter(Boolean)
      const payload = {
        nama: nama.trim(),
        kategori: kategori === 'Tanpa kategori' ? '' : kategori,
        satuan,
        stokMin: Number(stokMin) || 0,
        pemasok: pemasok.trim(),
        lokasi: lokasi.trim(),
        aktif,
        keterangan: ketParts.join('\n'),
      }
      if (editing) {
        await apiFetch('/api/stock-bahan', { method: 'PUT', body: JSON.stringify({ id: editing.id, ...payload }) })
        toast.success('Perubahan bahan disimpan')
      } else {
        await apiFetch('/api/stock-bahan', { method: 'POST', body: JSON.stringify(payload) })
        toast.success(`Bahan ditambahkan (${payload.nama}) — catat stok lewat Stock Masuk atau Penyesuaian`)
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
            {editing
              ? `Kode ${editing.kode} — stok tersedia ${fmtNum(editing.stok)} ${editing.satuan} (diubah lewat transaksi / penyesuaian).`
              : `Kode bahan: ${nextKode} (otomatis & unik). Stok diisi lewat Stock Masuk atau Penyesuaian Stok.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="bhn-nama">Nama bahan *</Label>
            <Input id="bhn-nama" value={nama} onChange={(e) => setNama(e.target.value)} placeholder="mis. Kertas Art Paper 150gsm" />
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Spesifikasi / gramatur</Label>
              <Input value={spesifikasi} onChange={(e) => setSpesifikasi(e.target.value)} placeholder="mis. 150gsm, A3+ / Kertas Kraf" />
            </div>
            <div className="space-y-1.5">
              <Label>Stok minimum</Label>
              <Input type="number" min="0" step="any" value={stokMin} onChange={(e) => setStokMin(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Pemasok utama</Label>
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
                    placeholder="Ketik atau pilih dari daftar…"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setSupplierListOpen((v) => !v)}
                    aria-label="Tampilkan daftar pemasok"
                    aria-expanded={supplierListOpen}
                  >
                    <ChevronsUpDown className="h-4 w-4" />
                  </Button>
                </div>
                {supplierListOpen && (
                  <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-background shadow-md">
                    {supplierOptions.length === 0 ? (
                      <div className="p-3 text-xs text-muted-foreground">Belum ada pemasok tersimpan — ketik manual saja.</div>
                    ) : filteredSuppliers.length === 0 ? (
                      <div className="p-3 text-xs text-muted-foreground">Tidak ada yang cocok — lanjut ketik manual.</div>
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
            <Label>Keterangan</Label>
            <Textarea rows={2} value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Opsional" />
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

// ============================================================
// Dialog: Penyesuaian Stok (fitur pendukung, akses via panel samping)
// ============================================================

function PenyesuaianDialog({
  open,
  onOpenChange,
  bahan,
  initialBahanId,
  initialBahanNama,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  bahan: Bahan[]
  initialBahanId: string
  initialBahanNama: string
  onSaved: () => Promise<void>
}) {
  const [bahanId, setBahanId] = useState('')
  const [tanggal, setTanggal] = useState(todayStr())
  const [stokFisik, setStokFisik] = useState('')
  const [alasan, setAlasan] = useState('Lainnya')
  const [keterangan, setKeterangan] = useState('')
  const [saving, setSaving] = useState(false)

  // Bahan nonaktif yang dipilih dari detail → tetap ada di daftar.
  const bahanList = useMemo(() => {
    if (!initialBahanId || bahan.some((b) => b.id === initialBahanId)) return bahan
    return [
      ...bahan,
      {
        id: initialBahanId,
        kode: '',
        nama: initialBahanNama || '(bahan nonaktif)',
        kategori: '',
        satuan: 'pcs',
        stok: 0,
        stokMin: 0,
        hargaSatuan: 0,
        keterangan: '',
        aktif: false,
        lokasi: '',
        pemasok: '',
      } as Bahan,
    ]
  }, [bahan, initialBahanId, initialBahanNama])

  const selected = bahanList.find((b) => b.id === bahanId)
  const selisih = selected ? r2((Number(stokFisik) || 0) - selected.stok) : null
  const canSave = !!bahanId && stokFisik !== '' && Number(stokFisik) >= 0 && selisih !== 0 && !saving

  useEffect(() => {
    if (!open) return
    setBahanId(initialBahanId || '')
    setTanggal(todayStr())
    setStokFisik('')
    setAlasan('Lainnya')
    setKeterangan('')
  }, [open, initialBahanId])

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
      toast.success(`Penyesuaian tercatat (${selected?.nama}: ${fmtNum(selected?.stok || 0)} → ${fmtNum(Number(stokFisik))} ${selected?.satuan || ''})`)
      onOpenChange(false)
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
          <DialogDescription>
            Stok opname: samakan stok sistem dengan stok fisik. Nomor transaksi dibuat otomatis (SP-xxx).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tanggal</Label>
            <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Bahan</Label>
            <BahanPicker bahan={bahanList} value={bahanId} onChange={setBahanId} />
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
// Pemilih bahan (dropdown dengan info stok)
// ============================================================

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

// ============================================================
// Bar filter tanggal umum untuk tab transaksi
// ============================================================

function FilterBar({
  q,
  setQ,
  qPlaceholder,
  dari,
  setDari,
  sampai,
  setSampai,
  children,
  onReset,
}: {
  q: string
  setQ: (v: string) => void
  qPlaceholder: string
  dari: string
  setDari: (v: string) => void
  sampai: string
  setSampai: (v: string) => void
  children?: React.ReactNode
  onReset: () => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-44 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={qPlaceholder} className="pl-9" />
        </div>
        <Input type="date" value={dari} onChange={(e) => setDari(e.target.value)} aria-label="Dari tanggal" className="w-full sm:w-40" />
        <Input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} aria-label="Sampai tanggal" className="w-full sm:w-40" />
        {children}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onReset}>
          Reset
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// Konfirmasi batalkan transaksi (masuk/keluar/penyesuaian)
// ============================================================

function CancelTransaksiDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: { mutasi: Mutasi; label: string } | null
  onClose: () => void
  onDeleted: () => Promise<void>
}) {
  const [deleting, setDeleting] = useState(false)
  return (
    <AlertDialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Batalkan transaksi?</AlertDialogTitle>
          <AlertDialogDescription>
            {target
              ? `Transaksi ${target.mutasi.nomor} (${target.mutasi.namaBahan} ${target.mutasi.jenis === 'masuk' ? '+' : '−'}${fmtNum(target.mutasi.qty)} ${target.mutasi.satuanBahan}) akan dibatalkan. Saldo stok ${target.mutasi.namaBahan} dikoreksi otomatis mengikuti pembatalan ini.`
              : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Kembali</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700"
            disabled={deleting}
            onClick={async () => {
              if (!target) return
              setDeleting(true)
              try {
                await apiFetch(`/api/stock-bahan/mutasi?id=${encodeURIComponent(target.mutasi.id)}`, { method: 'DELETE' })
                toast.success(`Transaksi ${target.mutasi.nomor} dibatalkan — saldo dikoreksi`)
                onClose()
                await onDeleted()
              } catch (e: any) {
                toast.error(e?.message || 'Gagal membatalkan transaksi')
              } finally {
                setDeleting(false)
              }
            }}
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Ya, Batalkan
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ============================================================
// Tab: Stock Masuk
// ============================================================

function MasukTab({
  mutasi,
  bahan,
  canAdd,
  canEdit,
  canDelete,
  onSaved,
}: {
  mutasi: Mutasi[]
  bahan: Bahan[]
  canAdd: boolean
  canEdit: boolean
  canDelete: boolean
  onSaved: () => Promise<void>
}) {
  const [q, setQ] = useState('')
  const [dari, setDari] = useState('')
  const [sampai, setSampai] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editRow, setEditRow] = useState<Mutasi | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Mutasi | null>(null)

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
      .sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || '') || (b.createdAt || '').localeCompare(a.createdAt || ''))
  }, [mutasi, q, dari, sampai])

  const totalNilai = rows.reduce((a, m) => a + (m.totalHarga || 0), 0)

  return (
    <div className="space-y-4">
      <FilterBar
        q={q} setQ={setQ} qPlaceholder="Cari nomor / bahan / pemasok / nota…"
        dari={dari} setDari={setDari} sampai={sampai} setSampai={setSampai}
        onReset={() => { setQ(''); setDari(''); setSampai('') }}
      >
        {canAdd && (
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
            <PackagePlus className="h-4 w-4" /> Catat Stok Masuk
          </Button>
        )}
      </FilterBar>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            printTable(
              'Stok Masuk',
              ['Nomor', 'Tanggal', 'Bahan', 'Jumlah', 'Satuan', 'Harga Beli', 'Total', 'Pemasok', 'No. Nota'],
              rows.map((m) => [m.nomor, fmtTanggal(m.tanggal), m.namaBahan, fmtNum(m.qty), m.satuanBahan, formatIDR(m.hargaBeli), formatIDR(m.totalHarga), m.pemasok || '-', m.nomorNota || '-']),
              `${rows.length} transaksi · total ${formatIDR(totalNilai)}`
            )
          }
        >
          <Printer className="h-4 w-4" /> Print
        </Button>
        <span className="text-xs text-muted-foreground">{rows.length} transaksi · total {formatIDR(totalNilai)}</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState text="Belum ada transaksi stok masuk." />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomor</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Nama bahan</TableHead>
                  <TableHead className="text-right">Jumlah masuk</TableHead>
                  <TableHead>Satuan</TableHead>
                  <TableHead className="text-right">Harga beli</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Pemasok</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs font-semibold">{m.nomor}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{fmtTanggal(m.tanggal)}</TableCell>
                    <TableCell className="text-sm font-medium">
                      <div>{m.namaBahan || m.bahan?.nama || '-'}</div>
                      {(m.nomorNota || m.keterangan) && (
                        <div className="max-w-48 truncate text-xs text-muted-foreground">
                          {[m.nomorNota && `Nota: ${m.nomorNota}`, m.keterangan].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm font-semibold text-emerald-700">
                      +{fmtNum(m.qty)}
                    </TableCell>
                    <TableCell className="text-sm">{m.satuanBahan}</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm">{formatIDR(m.hargaBeli)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm font-semibold">{formatIDR(m.totalHarga)}</TableCell>
                    <TableCell className="text-sm">{m.pemasok || '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditRow(m)} aria-label={`Edit ${m.nomor}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700" onClick={() => setCancelTarget(m)} aria-label={`Batalkan ${m.nomor}`}>
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
          <div className="space-y-2 md:hidden">
            {rows.map((m) => (
              <Card key={m.id}>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold">{m.namaBahan || m.bahan?.nama || '-'}</div>
                      <div className="font-mono text-xs text-muted-foreground">{m.nomor} · {fmtTanggal(m.tanggal)}</div>
                    </div>
                    <span className="whitespace-nowrap text-sm font-bold text-emerald-700">+{fmtNum(m.qty)} {m.satuanBahan}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <div><span className="text-muted-foreground">Harga: </span><span className="font-semibold">{formatIDR(m.hargaBeli)}</span></div>
                    <div><span className="text-muted-foreground">Total: </span><span className="font-semibold">{formatIDR(m.totalHarga)}</span></div>
                    <div><span className="text-muted-foreground">Pemasok: </span><span className="font-semibold">{m.pemasok || '—'}</span></div>
                    <div><span className="text-muted-foreground">Nota: </span><span className="font-semibold">{m.nomorNota || '—'}</span></div>
                  </div>
                  {(canEdit || canDelete) && (
                    <div className="flex justify-end gap-1 pt-1">
                      {canEdit && (
                        <Button variant="outline" size="sm" onClick={() => setEditRow(m)}>
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => setCancelTarget(m)}>
                          <Trash2 className="h-3.5 w-3.5" /> Batalkan
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

      <MasukDialog
        open={dialogOpen || !!editRow}
        onOpenChange={(o) => {
          setDialogOpen(o)
          if (!o) setEditRow(null)
        }}
        bahan={bahan}
        onSaved={onSaved}
        edit={editRow}
      />
      <CancelTransaksiDialog target={cancelTarget ? { mutasi: cancelTarget, label: cancelTarget.nomor } : null} onClose={() => setCancelTarget(null)} onDeleted={onSaved} />
    </div>
  )
}

// ============================================================
// Dialog: Stok Masuk (nomor otomatis, total otomatis, referensi PO)
// ============================================================

function MasukDialog({
  open,
  onOpenChange,
  bahan,
  onSaved,
  edit,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  bahan: Bahan[]
  onSaved: () => Promise<void>
  edit?: Mutasi | null
}) {
  const [bahanId, setBahanId] = useState('')
  const [tanggal, setTanggal] = useState(todayStr())
  const [qty, setQty] = useState('')
  const [hargaBeli, setHargaBeli] = useState('')
  const [pemasok, setPemasok] = useState('')
  const [nomorNota, setNomorNota] = useState('')
  const [keterangan, setKeterangan] = useState('')
  const [saving, setSaving] = useState(false)

  // Referensi PO (opsional — menghubungkan transaksi masuk dengan PO)
  const [poList, setPoList] = useState<PoOption[]>([])
  const [poListOpen, setPoListOpen] = useState(false)
  const [poLoading, setPoLoading] = useState(false)

  // Bahan nonaktif tidak ada di daftar `bahan` — tambahkan dari snapshot mutasi agar tetap tampil saat edit.
  const bahanList = useMemo(() => {
    if (!edit || bahan.some((b) => b.id === edit.bahanId)) return bahan
    const fallback = {
      id: edit.bahanId,
      kode: edit.bahan?.kode || '',
      nama: edit.namaBahan || edit.bahan?.nama || '(bahan nonaktif)',
      kategori: '',
      satuan: edit.satuanBahan || edit.bahan?.satuan || 'pcs',
      stok: 0,
      stokMin: 0,
      hargaSatuan: 0,
      keterangan: '',
      aktif: false,
      lokasi: '',
      pemasok: '',
    } as Bahan
    return [...bahan, fallback]
  }, [bahan, edit])

  const selected = bahanList.find((b) => b.id === bahanId)
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

  // Prefill saat edit transaksi; reset saat mode tambah.
  useEffect(() => {
    if (!open) return
    setPoListOpen(false)
    if (edit) {
      setBahanId(edit.bahanId)
      setTanggal(edit.tanggal || todayStr())
      setQty(String(edit.qty ?? ''))
      setHargaBeli(String(edit.hargaBeli ?? 0))
      setPemasok(edit.pemasok || '')
      setNomorNota(edit.nomorNota || '')
      setKeterangan(edit.keterangan || '')
    } else {
      reset()
    }
  }, [open, edit])

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
    if (!canSave) return
    setSaving(true)
    try {
      if (edit) {
        await apiFetch('/api/stock-bahan/mutasi', {
          method: 'PUT',
          body: JSON.stringify({
            id: edit.id,
            bahanId,
            qty: Number(qty),
            tanggal,
            hargaBeli: Number(hargaBeli) || 0,
            pemasok,
            nomorNota,
            keterangan,
          }),
        })
        toast.success(`Transaksi ${edit.nomor} diperbarui (saldo ikut dihitung ulang)`)
      } else {
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
      }
      onOpenChange(false)
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
          <DialogTitle>{edit ? 'Edit Stok Masuk' : 'Stock Masuk'}</DialogTitle>
          <DialogDescription>
            {edit
              ? `Nomor ${edit.nomor} — ubah data transaksi. Saldo dihitung ulang otomatis.`
              : 'Nomor transaksi dibuat otomatis. Stok bertambah setelah disimpan.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tanggal</Label>
            <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Bahan</Label>
            <BahanPicker
              bahan={bahanList}
              value={bahanId}
              onChange={(id) => {
                setBahanId(id)
                const b = bahanList.find((x) => x.id === id)
                if (b?.pemasok && !pemasok) setPemasok(b.pemasok)
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Jumlah masuk *</Label>
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
              <Input value={formatIDR(total)} disabled aria-label="Total (otomatis)" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Pemasok</Label>
            <Input value={pemasok} onChange={(e) => setPemasok(e.target.value)} placeholder="Nama pemasok" />
          </div>
          <div className="space-y-1.5">
            <Label>Nomor nota / referensi pembelian</Label>
            <div className="relative">
              <div className="flex gap-2">
                <Input value={nomorNota} onChange={(e) => setNomorNota(e.target.value)} placeholder="mis. NOTA-123 / nomor PO" />
                <Button type="button" variant="outline" size="icon" onClick={loadPoList} aria-label="Tampilkan daftar PO" aria-expanded={poListOpen}>
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
                          setNomorNota(p.poNumber)
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
            <p className="text-xs text-muted-foreground">Bisa diisi dari daftar Purchase Order (tombol di kanan).</p>
          </div>
          <div className="space-y-1.5">
            <Label>Keterangan</Label>
            <Textarea rows={2} value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Catatan" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={!canSave} onClick={submit}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
            {edit ? 'Simpan Perubahan' : 'Simpan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Tab: Stock Keluar
// ============================================================

function KeluarTab({
  mutasi,
  bahan,
  canAdd,
  canEdit,
  canDelete,
  onSaved,
  izinkanMinus,
}: {
  mutasi: Mutasi[]
  bahan: Bahan[]
  canAdd: boolean
  canEdit: boolean
  canDelete: boolean
  onSaved: () => Promise<void>
  izinkanMinus: boolean
}) {
  const [q, setQ] = useState('')
  const [dari, setDari] = useState('')
  const [sampai, setSampai] = useState('')
  const [fTujuan, setFTujuan] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editRow, setEditRow] = useState<Mutasi | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Mutasi | null>(null)

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return mutasi
      .filter((m) => m.jenis === 'keluar')
      .filter((m) => {
        if (term && !`${m.nomor} ${m.namaBahan} ${m.keterangan} ${m.tujuan} ${m.referensi || ''}`.toLowerCase().includes(term)) return false
        if (fTujuan !== 'all' && (m.tujuan || '') !== fTujuan) return false
        if (dari && m.tanggal && m.tanggal < dari) return false
        if (sampai && m.tanggal && m.tanggal > sampai) return false
        return true
      })
      .sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || '') || (b.createdAt || '').localeCompare(a.createdAt || ''))
  }, [mutasi, q, fTujuan, dari, sampai])

  return (
    <div className="space-y-4">
      <FilterBar
        q={q} setQ={setQ} qPlaceholder="Cari nomor / bahan / referensi…"
        dari={dari} setDari={setDari} sampai={sampai} setSampai={setSampai}
        onReset={() => { setQ(''); setDari(''); setSampai(''); setFTujuan('all') }}
      >
        <Select value={fTujuan} onValueChange={setFTujuan}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter tujuan">
            <SelectValue placeholder="Semua tujuan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua tujuan</SelectItem>
            {TUJUAN_KELUAR.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canAdd && (
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
            <PackageMinus className="h-4 w-4" /> Catat Stok Keluar
          </Button>
        )}
      </FilterBar>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            printTable(
              'Stok Keluar',
              ['Nomor', 'Tanggal', 'Bahan', 'Stok Sebelum', 'Jumlah', 'Satuan', 'Stok Sesudah', 'Tujuan', 'Referensi'],
              rows.map((m) => [
                m.nomor,
                fmtTanggal(m.tanggal),
                m.namaBahan,
                fmtNum(r2(m.stokSetelah + m.qty)),
                fmtNum(m.qty),
                m.satuanBahan,
                fmtNum(m.stokSetelah),
                m.tujuan || '-',
                m.referensi || '-',
              ]),
              `${rows.length} transaksi`
            )
          }
        >
          <Printer className="h-4 w-4" /> Print
        </Button>
        {!izinkanMinus && <span className="text-xs text-muted-foreground">Stok tidak boleh minus — transaksi melebihi saldo ditolak.</span>}
      </div>

      {rows.length === 0 ? (
        <EmptyState text="Belum ada transaksi stok keluar." />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomor</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Nama bahan</TableHead>
                  <TableHead className="text-right">Stok sebelum</TableHead>
                  <TableHead className="text-right">Jumlah keluar</TableHead>
                  <TableHead>Satuan</TableHead>
                  <TableHead className="text-right">Stok sesudah</TableHead>
                  <TableHead>Tujuan</TableHead>
                  <TableHead>Referensi pekerjaan</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs font-semibold">{m.nomor}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{fmtTanggal(m.tanggal)}</TableCell>
                    <TableCell className="text-sm font-medium">
                      <div>{m.namaBahan || m.bahan?.nama || '-'}</div>
                      {m.keterangan && <div className="max-w-40 truncate text-xs text-muted-foreground">{m.keterangan}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm">{fmtNum(r2(m.stokSetelah + m.qty))}</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm font-semibold text-red-600">−{fmtNum(m.qty)}</TableCell>
                    <TableCell className="text-sm">{m.satuanBahan}</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm">{fmtNum(m.stokSetelah)}</TableCell>
                    <TableCell className="text-sm">{m.tujuan || '—'}</TableCell>
                    <TableCell className="max-w-32 truncate text-sm">{m.referensi || '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditRow(m)} aria-label={`Edit ${m.nomor}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700" onClick={() => setCancelTarget(m)} aria-label={`Batalkan ${m.nomor}`}>
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
          <div className="space-y-2 md:hidden">
            {rows.map((m) => (
              <Card key={m.id}>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold">{m.namaBahan || m.bahan?.nama || '-'}</div>
                      <div className="font-mono text-xs text-muted-foreground">{m.nomor} · {fmtTanggal(m.tanggal)}</div>
                    </div>
                    <span className="whitespace-nowrap text-sm font-bold text-red-600">−{fmtNum(m.qty)} {m.satuanBahan}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-xs">
                    <div><span className="text-muted-foreground">Sebelum: </span><span className="font-semibold">{fmtNum(r2(m.stokSetelah + m.qty))}</span></div>
                    <div><span className="text-muted-foreground">Sesudah: </span><span className="font-semibold">{fmtNum(m.stokSetelah)}</span></div>
                    <div><span className="text-muted-foreground">Tujuan: </span><span className="font-semibold">{m.tujuan || '—'}</span></div>
                  </div>
                  {m.referensi && <div className="text-xs text-muted-foreground">Ref: {m.referensi}</div>}
                  {(canEdit || canDelete) && (
                    <div className="flex justify-end gap-1 pt-1">
                      {canEdit && (
                        <Button variant="outline" size="sm" onClick={() => setEditRow(m)}>
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => setCancelTarget(m)}>
                          <Trash2 className="h-3.5 w-3.5" /> Batalkan
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

      <KeluarDialog
        open={dialogOpen || !!editRow}
        onOpenChange={(o) => {
          setDialogOpen(o)
          if (!o) setEditRow(null)
        }}
        bahan={bahan}
        onSaved={onSaved}
        edit={editRow}
        izinkanMinus={izinkanMinus}
      />
      <CancelTransaksiDialog target={cancelTarget ? { mutasi: cancelTarget, label: cancelTarget.nomor } : null} onClose={() => setCancelTarget(null)} onDeleted={onSaved} />
    </div>
  )
}

// ============================================================
// Dialog: Stok Keluar (validasi stok tersedia, tujuan, referensi)
// ============================================================

function KeluarDialog({
  open,
  onOpenChange,
  bahan,
  onSaved,
  edit,
  izinkanMinus,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  bahan: Bahan[]
  onSaved: () => Promise<void>
  edit?: Mutasi | null
  izinkanMinus: boolean
}) {
  const [bahanId, setBahanId] = useState('')
  const [tanggal, setTanggal] = useState(todayStr())
  const [qty, setQty] = useState('')
  const [tujuan, setTujuan] = useState('Produksi')
  const [referensi, setReferensi] = useState('')
  const [keterangan, setKeterangan] = useState('')
  const [saving, setSaving] = useState(false)

  // Bahan nonaktif tidak ada di daftar `bahan` — tambahkan dari snapshot mutasi agar tetap tampil saat edit.
  const bahanList = useMemo(() => {
    if (!edit || bahan.some((b) => b.id === edit.bahanId)) return bahan
    const fallback = {
      id: edit.bahanId,
      kode: edit.bahan?.kode || '',
      nama: edit.namaBahan || edit.bahan?.nama || '(bahan nonaktif)',
      kategori: '',
      satuan: edit.satuanBahan || edit.bahan?.satuan || 'pcs',
      stok: 0,
      stokMin: 0,
      hargaSatuan: 0,
      keterangan: '',
      aktif: false,
      lokasi: '',
      pemasok: '',
    } as Bahan
    return [...bahan, fallback]
  }, [bahan, edit])

  const selected = bahanList.find((b) => b.id === bahanId)
  const qtyNum = Number(qty) || 0
  // Validasi frontend: jumlah > 0 dan tidak melebihi stok tersedia.
  const melebihiStok = !izinkanMinus && !!selected && qtyNum > selected.stok
  const canSave = !!bahanId && qtyNum > 0 && !melebihiStok && !saving

  const reset = () => {
    setBahanId('')
    setTanggal(todayStr())
    setQty('')
    setTujuan('Produksi')
    setReferensi('')
    setKeterangan('')
  }

  // Prefill saat edit transaksi; reset saat mode tambah.
  useEffect(() => {
    if (!open) return
    if (edit) {
      setBahanId(edit.bahanId)
      setTanggal(edit.tanggal || todayStr())
      setQty(String(edit.qty ?? ''))
      setTujuan(edit.tujuan || 'Produksi')
      setReferensi(edit.referensi || '')
      setKeterangan(edit.keterangan || '')
    } else {
      reset()
    }
  }, [open, edit])

  const submit = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      if (edit) {
        await apiFetch('/api/stock-bahan/mutasi', {
          method: 'PUT',
          body: JSON.stringify({ id: edit.id, bahanId, qty: qtyNum, tanggal, tujuan, referensi, keterangan }),
        })
        toast.success(`Transaksi ${edit.nomor} diperbarui (saldo ikut dihitung ulang)`)
      } else {
        await apiFetch('/api/stock-bahan/mutasi', {
          method: 'POST',
          body: JSON.stringify({ bahanId, jenis: 'keluar', qty: qtyNum, tanggal, tujuan, referensi, keterangan }),
        })
        toast.success(`Stok keluar tercatat (${selected?.nama} −${fmtNum(qtyNum)} ${selected?.satuan})`)
      }
      onOpenChange(false)
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
          <DialogTitle>{edit ? 'Edit Stok Keluar' : 'Stock Keluar'}</DialogTitle>
          <DialogDescription>
            {edit
              ? `Nomor ${edit.nomor} — ubah data transaksi. Saldo dihitung ulang otomatis.`
              : 'Nomor transaksi dibuat otomatis. Stok berkurang setelah disimpan.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tanggal</Label>
            <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Bahan</Label>
            <BahanPicker bahan={bahanList} value={bahanId} onChange={setBahanId} />
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Stok tersedia</div>
              <div className="font-semibold">{selected ? `${fmtNum(selected.stok)} ${selected.satuan}` : '— pilih bahan'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Sisa setelah transaksi</div>
              <div className={cn('font-semibold', !selected ? '' : !izinkanMinus && qtyNum > selected.stok ? 'text-red-600' : qtyNum > 0 ? 'text-emerald-700' : '')}>
                {selected ? `${fmtNum(r2(selected.stok - qtyNum))} ${selected.satuan}` : '—'}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Jumlah keluar *</Label>
              <Input
                type="number"
                min="0"
                step="any"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="0"
                aria-invalid={melebihiStok}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Satuan</Label>
              <Input value={selected?.satuan || '—'} disabled />
            </div>
          </div>
          {melebihiStok && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              Jumlah keluar melebihi stok tersedia ({fmtNum(selected?.stok || 0)} {selected?.satuan}) — transaksi akan ditolak.
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tujuan pemakaian</Label>
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
              <Label>Nomor pekerjaan / referensi</Label>
              <Input value={referensi} onChange={(e) => setReferensi(e.target.value)} placeholder="mis. INV-0451 / Ordin 12" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Keterangan</Label>
            <Textarea rows={2} value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Catatan" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={!canSave} onClick={submit}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageMinus className="h-4 w-4" />}
            {edit ? 'Simpan Perubahan' : 'Simpan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Tab: Laporan Stock
// ============================================================

function LaporanTab({ bahan }: { bahan: Bahan[] }) {
  const [dari, setDari] = useState(firstDayOfMonth())
  const [sampai, setSampai] = useState(todayStr())
  const [fKategori, setFKategori] = useState('all')
  const [q, setQ] = useState('')
  const [items, setItems] = useState<LaporanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [detailRow, setDetailRow] = useState<LaporanRow | null>(null)

  const kategoriList = useMemo(() => {
    const set = new Set<string>()
    for (const b of bahan) {
      const k = (b.kategori || '').trim()
      if (k) set.add(k)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [bahan])

  const loadLaporan = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dari) params.set('dari', dari)
      if (sampai) params.set('sampai', sampai)
      if (fKategori !== 'all') params.set('kategori', fKategori)
      if (q.trim()) params.set('q', q.trim())
      const data = await apiFetch<{ items: LaporanRow[] }>(`/api/stock-bahan/laporan?${params.toString()}`)
      setItems(Array.isArray(data?.items) ? data.items : [])
    } catch {
      toast.error('Gagal memuat laporan stok')
    } finally {
      setLoading(false)
    }
  }, [dari, sampai, fKategori, q])

  useEffect(() => {
    const t = setTimeout(loadLaporan, q ? 350 : 0)
    return () => clearTimeout(t)
  }, [loadLaporan, q])

  const totalMasuk = items.reduce((a, i) => a + i.masuk, 0)
  const totalKeluar = items.reduce((a, i) => a + i.keluar, 0)
  const totalNilai = items.reduce((a, i) => a + i.nilai, 0)

  const periodeLabel = `${dari ? fmtTanggal(dari) : 'awal'} — ${sampai ? fmtTanggal(sampai) : 'sekarang'}`

  const tableCols = ['Kode', 'Nama Bahan', 'Satuan', 'Saldo Awal', 'Total Masuk', 'Total Keluar', 'Saldo Akhir', 'Stok Minimum', 'Status']
  const tableRows = items.map((i) => [
    i.kode,
    i.nama,
    i.satuan,
    fmtNum(i.stokAwal),
    fmtNum(i.masuk),
    fmtNum(i.keluar),
    fmtNum(i.stokAkhir),
    fmtNum(i.stokMin),
    i.status === 'aman' ? 'Aman' : i.status === 'menipis' ? 'Menipis' : 'Habis',
  ])

  return (
    <div className="space-y-4">
      {/* Filter periode + bahan + kategori */}
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" value={dari} onChange={(e) => setDari(e.target.value)} aria-label="Dari tanggal" className="w-full sm:w-40" />
        <Input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} aria-label="Sampai tanggal" className="w-full sm:w-40" />
        <div className="relative min-w-40 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nama / kode bahan…" className="pl-9" />
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setDari(firstDayOfMonth()); setSampai(todayStr()); setQ(''); setFKategori('all') }}
        >
          Reset
        </Button>
      </div>

      {/* Aksi cetak / ekspor */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => printTable('Laporan Stock', tableCols, tableRows, `Periode ${periodeLabel} · ${items.length} bahan`)}>
          <Printer className="h-4 w-4" /> Cetak
        </Button>
        <Button variant="outline" size="sm" onClick={() => exportPdf('Laporan Stock', tableCols, tableRows, `Periode ${periodeLabel} · ${items.length} bahan`)}>
          <ClipboardList className="h-4 w-4" /> PDF
        </Button>
        <Button variant="outline" size="sm" onClick={() => exportCsv('Laporan Stock', tableCols, tableRows, `Periode ${periodeLabel} · ${items.length} bahan`)}>
          <FileDown className="h-4 w-4" /> CSV/Excel
        </Button>
        <span className="text-xs text-muted-foreground">Periode {periodeLabel}</span>
      </div>

      {/* Ringkasan kecil */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={PackagePlus} label="Total Masuk (periode)" value={fmtNum(r2(totalMasuk))} sub="seluruh bahan terfilter" tone="emerald" />
        <StatCard icon={PackageMinus} label="Total Keluar (periode)" value={fmtNum(r2(totalKeluar))} sub="seluruh bahan terfilter" tone="red" />
        <StatCard icon={Package} label="Nilai Persediaan" value={formatIDR(totalNilai)} sub="saldo akhir × harga modal" tone="emerald" />
      </div>

      {loading ? (
        <Spinner label="Menghitung laporan…" />
      ) : items.length === 0 ? (
        <EmptyState text="Tidak ada data untuk filter ini." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kode</TableHead>
                <TableHead>Nama bahan</TableHead>
                <TableHead>Satuan</TableHead>
                <TableHead className="text-right">Saldo awal</TableHead>
                <TableHead className="text-right">Total masuk</TableHead>
                <TableHead className="text-right">Total keluar</TableHead>
                <TableHead className="text-right">Saldo akhir</TableHead>
                <TableHead className="text-right">Stok minimum</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => (
                <TableRow
                  key={i.bahanId}
                  className="cursor-pointer"
                  title="Klik untuk lihat detail histori"
                  onClick={() => setDetailRow(i)}
                >
                  <TableCell className="whitespace-nowrap font-mono text-xs">{i.kode}</TableCell>
                  <TableCell className="text-sm font-medium">{i.nama}</TableCell>
                  <TableCell className="text-sm">{i.satuan}</TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm">{fmtNum(i.stokAwal)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm text-emerald-700">+{fmtNum(i.masuk)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm text-red-600">−{fmtNum(i.keluar)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm font-bold">
                    {fmtNum(i.stokAkhir)}
                    {i.penyesuaian !== 0 && (
                      <div className="text-[11px] font-normal text-muted-foreground">termasuk penyesuaian {i.penyesuaian > 0 ? '+' : ''}{fmtNum(i.penyesuaian)}</div>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm">{fmtNum(i.stokMin)}</TableCell>
                  <TableCell><StokStatusBadge stok={i.stokAkhir} stokMin={i.stokMin} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell colSpan={4} className="text-right text-sm">Total ({items.length} bahan)</TableCell>
                <TableCell className="whitespace-nowrap text-right text-sm">+{fmtNum(r2(totalMasuk))}</TableCell>
                <TableCell className="whitespace-nowrap text-right text-sm">−{fmtNum(r2(totalKeluar))}</TableCell>
                <TableCell className="whitespace-nowrap text-right text-sm">{formatIDR(totalNilai)}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      {/* Detail histori bahan dalam periode */}
      <LaporanDetailDialog
        row={detailRow}
        dari={dari}
        sampai={sampai}
        onOpenChange={(o) => {
          if (!o) setDetailRow(null)
        }}
      />
    </div>
  )
}

// ============================================================
// Dialog: Detail histori satu bahan (dari Laporan)
// ============================================================

function LaporanDetailDialog({
  row,
  dari,
  sampai,
  onOpenChange,
}: {
  row: LaporanRow | null
  dari: string
  sampai: string
  onOpenChange: (o: boolean) => void
}) {
  const [rows, setRows] = useState<RiwayatRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!row) {
      setRows(null)
      return
    }
    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams({ bahanId: row.bahanId })
    if (dari) params.set('dari', dari)
    if (sampai) params.set('sampai', sampai)
    apiFetch<{ items: RiwayatRow[] }>(`/api/stock-bahan/riwayat?${params.toString()}`)
      .then((d) => {
        if (!cancelled) setRows(Array.isArray(d?.items) ? d.items : [])
      })
      .catch(() => {
        if (!cancelled) toast.error('Gagal memuat histori bahan')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [row, dari, sampai])

  const periodeLabel = `${dari ? fmtTanggal(dari) : 'awal'} — ${sampai ? fmtTanggal(sampai) : 'sekarang'}`

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-emerald-600" /> Detail Histori Bahan
          </DialogTitle>
          <DialogDescription>
            {row ? `${row.kode} — ${row.nama} · periode ${periodeLabel}` : ''}
          </DialogDescription>
        </DialogHeader>

        {row && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-4">
              <div>
                <div className="text-xs text-muted-foreground">Saldo awal</div>
                <div className="font-semibold">{fmtNum(row.stokAwal)} {row.satuan}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total masuk</div>
                <div className="font-semibold text-emerald-700">+{fmtNum(row.masuk)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total keluar</div>
                <div className="font-semibold text-red-600">−{fmtNum(row.keluar)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Saldo akhir</div>
                <div className="font-bold">{fmtNum(row.stokAkhir)} {row.satuan}</div>
              </div>
            </div>

            {loading ? (
              <Spinner label="Memuat histori…" />
            ) : !rows || rows.length === 0 ? (
              <EmptyState text="Tidak ada transaksi pada periode ini." />
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Nomor</TableHead>
                      <TableHead>Jenis</TableHead>
                      <TableHead className="text-right">Masuk</TableHead>
                      <TableHead className="text-right">Keluar</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead>Keterangan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-xs">{fmtTanggal(r.tanggal)}</TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{r.nomor || '—'}</TableCell>
                        <TableCell><JenisBadge jenis={r.jenis} /></TableCell>
                        <TableCell className="whitespace-nowrap text-right text-xs text-emerald-700">{r.masuk ? `+${fmtNum(r.masuk)}` : ''}</TableCell>
                        <TableCell className="whitespace-nowrap text-right text-xs text-red-600">{r.keluar ? `−${fmtNum(r.keluar)}` : ''}</TableCell>
                        <TableCell className="whitespace-nowrap text-right text-xs">{fmtNum(r.saldo)}</TableCell>
                        <TableCell className="max-w-40 truncate text-xs text-muted-foreground">{r.keterangan || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
