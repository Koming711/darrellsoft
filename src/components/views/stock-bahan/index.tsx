'use client'

/**
 * StockBahanView — wadah modul Stock Bahan dengan 8 seksi via hamburger menu:
 * Dashboard | Data Bahan | Stok Masuk | Stok Keluar | Penyesuaian | Riwayat | Laporan | Kategori
 * - Data master (bahan & supplier) diambil sekali di sini lalu dibagikan ke tab.
 *   (Supplier tetap dimuat untuk dropdown Stok Masuk & filter Laporan — tanpa tab CRUD.)
 * - refreshKey naik setiap mutasi → semua tab yang relevan ikut memuat ulang.
 * - Mobile: tombol + melayang untuk input cepat.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Boxes,
  Check,
  ChevronDown,
  ClipboardList,
  FileDown,
  History,
  Layers,
  Loader2,
  Menu,
  PackageMinus,
  PackagePlus,
  PackageSearch,
  Plus,
  Settings2,
  Tags,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { formatIDR } from '@/lib/format'
import { cn } from '@/lib/utils'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { StatusBadge, errText, fmtNum, type DashboardData, type Material, type Supplier } from './shared'
import { DataBahanTab } from './data-bahan-tab'
import { PenyesuaianTab, StokKeluarTab, StokMasukTab } from './transaksi-tabs'
import { RiwayatTab } from './riwayat-tab'
import { LaporanTab } from './laporan-tab'
import { KategoriTab } from './kategori-tab'

type TabKey =
  | 'dashboard'
  | 'bahan'
  | 'masuk'
  | 'keluar'
  | 'penyesuaian'
  | 'riwayat'
  | 'laporan'
  | 'kategori'

const TABS: { key: TabKey; label: string; icon: typeof Boxes }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: PackageSearch },
  { key: 'bahan', label: 'Data Bahan', icon: Boxes },
  { key: 'masuk', label: 'Stok Masuk', icon: PackagePlus },
  { key: 'keluar', label: 'Stok Keluar', icon: PackageMinus },
  { key: 'penyesuaian', label: 'Penyesuaian', icon: ClipboardList },
  { key: 'riwayat', label: 'Riwayat', icon: History },
  { key: 'laporan', label: 'Laporan', icon: FileDown },
  { key: 'kategori', label: 'Kategori', icon: Tags },
]

export default function StockBahanView({
  canAdd,
  canEdit,
  canDelete,
}: {
  canAdd: boolean
  canEdit: boolean
  canDelete: boolean
}) {
  const [tab, setTab] = useState<TabKey>('dashboard')
  const [refreshKey, setRefreshKey] = useState(0)

  const [materials, setMaterials] = useState<Material[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [kategoriMaster, setKategoriMaster] = useState<string[]>([])
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [masterLoading, setMasterLoading] = useState(true)

  // Quick-action lintas tab: pilih bahan → buka form transaksi di tab tujuan.
  const [pendingTab, setPendingTab] = useState<TabKey | null>(null)
  const [preselectMaterialId, setPreselectMaterialId] = useState<string | null>(null)
  const [preselectNonce, setPreselectNonce] = useState(0)

  // Settings: izinkan stok minus (admin).
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [allowNegative, setAllowNegative] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)

  const bumpRefresh = useCallback(() => setRefreshKey(k => k + 1), [])

  // Muat master bahan + supplier + dashboard.
  useEffect(() => {
    let alive = true
    ;(async () => {
      setMasterLoading(true)
      try {
        const [mRes, sRes, kRes] = await Promise.all([
          apiFetch<{ data: Material[] }>('/api/stock-bahan'),
          apiFetch<{ data: Supplier[] }>('/api/stock-bahan/suppliers'),
          apiFetch<{ data: { nama: string }[] }>('/api/stock-bahan/kategori'),
        ])
        if (!alive) return
        setMaterials(mRes.data)
        setSuppliers(sRes.data)
        setKategoriMaster(kRes.data.map(k => k.nama))
      } catch (e) {
        if (alive) toast.error(errText(e))
      } finally {
        if (alive) setMasterLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [refreshKey])

  // Dashboard di-refresh terpisah agar cepat setelah transaksi.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await apiFetch<{ data: DashboardData }>('/api/stock-bahan/dashboard')
        if (alive) setDashboard(res.data)
      } catch {
        /* diabaikan — kartu memakai nilai terakhir */
      }
    })()
    return () => {
      alive = false
    }
  }, [refreshKey])

  const kategoris = useMemo(() => {
    // Union: master kategori + kategori yang tercatat di bahan (aman utk data lama).
    const set = new Set(kategoriMaster)
    for (const m of materials) if (m.kategori) set.add(m.kategori)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [kategoriMaster, materials])

  const quickAction = useCallback(
    (materialId: string, jenis: 'masuk' | 'keluar') => {
      setPreselectMaterialId(materialId)
      setPreselectNonce(n => n + 1)
      setPendingTab(jenis)
      setTab(jenis)
    },
    []
  )

  /** FAB: pindah tab sambil membuka form kosong. */
  const fabGo = useCallback((t: TabKey) => {
    setPreselectMaterialId(null)
    setPreselectNonce(n => n + 1)
    setPendingTab(t)
    setTab(t)
  }, [])

  const consumePreselect = useCallback(() => {
    setPendingTab(null)
    setPreselectMaterialId(null)
  }, [])

  // Buka settings: muat nilai saat ini.
  const openSettings = useCallback(async () => {
    setSettingsOpen(true)
    setSettingsLoading(true)
    try {
      const res = await apiFetch<{ value: string | null }>(
        '/api/settings?key=stock_allow_negative'
      )
      setAllowNegative(res.value === 'true')
    } catch {
      setAllowNegative(false)
    } finally {
      setSettingsLoading(false)
    }
  }, [])

  const saveAllowNegative = useCallback(async (checked: boolean) => {
    setAllowNegative(checked)
    try {
      await apiFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'stock_allow_negative', value: String(checked) }),
      })
      toast.success(checked ? 'Stok minus diizinkan' : 'Stok minus dilarang')
    } catch (e) {
      toast.error(errText(e))
      setAllowNegative(!checked)
    }
  }, [])

  const fabActions: { label: string; icon: typeof Plus; go: TabKey }[] = [
    { label: 'Stok Masuk', icon: PackagePlus, go: 'masuk' },
    { label: 'Stok Keluar', icon: PackageMinus, go: 'keluar' },
    { label: 'Bahan Baru', icon: Boxes, go: 'bahan' },
  ]

  const activeTab = TABS.find(t => t.key === tab)

  return (
    <div className="space-y-4">
      {/* Header: hamburger menu navigasi + pengaturan */}
      <div className="flex items-center justify-between gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="gap-2.5 min-h-[48px] px-4 text-base"
              aria-label={`Menu navigasi Stock Bahan — seksi aktif: ${activeTab?.label}`}
            >
              <Menu className="h-5 w-5" />
              <span className="font-bold tracking-tight">{activeTab?.label}</span>
              <ChevronDown className="h-4 w-4 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel className="text-sm font-semibold text-muted-foreground">Menu Stock Bahan</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {TABS.map(t => {
              const Icon = t.icon
              const active = tab === t.key
              return (
                <DropdownMenuItem
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn('gap-3 py-2.5 text-[15px]', active && 'bg-muted font-bold text-foreground')}
                >
                  <Icon className={cn('h-[18px] w-[18px]', active ? 'text-primary' : 'text-primary/80')} />
                  {t.label}
                  {active && <Check className="ml-auto h-[18px] w-[18px] text-primary" />}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button size="sm" variant="outline" className="gap-1.5" onClick={openSettings}>
          <Settings2 className="h-4 w-4" /> <span className="hidden sm:inline">Pengaturan</span>
        </Button>
      </div>

      <p className="hidden text-sm text-muted-foreground sm:block">
        Bahan → Stok Masuk → Produksi → Stok Keluar → Riwayat otomatis
      </p>

      {/* Konten tab */}
      {tab === 'dashboard' && (
        <DashboardSection
          data={dashboard}
          loading={masterLoading && !dashboard}
          onGo={t => setTab(t)}
        />
      )}

      {tab === 'bahan' && (
        <DataBahanTab
          materials={materials}
          loading={masterLoading}
          onRefresh={bumpRefresh}
          onQuickAction={quickAction}
          formNonce={pendingTab === 'bahan' ? preselectNonce : 0}
          kategoriMaster={kategoris}
        />
      )}

      {tab === 'masuk' && (
        <StokMasukTab
          materials={materials}
          suppliers={suppliers}
          onRefresh={bumpRefresh}
          preselectMaterialId={pendingTab === 'masuk' ? preselectMaterialId : null}
          onConsumePreselect={consumePreselect}
          formNonce={pendingTab === 'masuk' && !preselectMaterialId ? preselectNonce : 0}
        />
      )}

      {tab === 'keluar' && (
        <StokKeluarTab
          materials={materials}
          onRefresh={bumpRefresh}
          preselectMaterialId={pendingTab === 'keluar' ? preselectMaterialId : null}
          onConsumePreselect={consumePreselect}
          formNonce={pendingTab === 'keluar' && !preselectMaterialId ? preselectNonce : 0}
        />
      )}

      {tab === 'penyesuaian' && (
        <PenyesuaianTab materials={materials} onRefresh={bumpRefresh} />
      )}

      {tab === 'riwayat' && <RiwayatTab materials={materials} />}

      {tab === 'laporan' && <LaporanTab suppliers={suppliers} kategoris={kategoris} />}

      {tab === 'kategori' && (
        <KategoriTab
          onRefresh={bumpRefresh}
          onManageBahan={() => setTab('bahan')}
        />
      )}

      {/* FAB + mobile — input cepat */}
      <div className="fixed bottom-20 right-4 z-40 md:hidden">
        <QuickFab actions={fabActions} onPick={fabGo} disabled={!canAdd} />
      </div>

      {/* Dialog pengaturan stok */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" /> Pengaturan Stock
            </DialogTitle>
            <DialogDescription>Preferensi modul Stock Bahan.</DialogDescription>
          </DialogHeader>
          {settingsLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Memuat…
            </div>
          ) : (
            <div className="flex items-start justify-between gap-4 py-2">
              <div>
                <Label htmlFor="sw-negative" className="text-sm font-medium">
                  Izinkan Stok Minus
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Bila aktif, Stok Keluar boleh melebihi stok tersedia (stok jadi minus).
                  Default: dilarang.
                </p>
              </div>
              <Switch
                id="sw-negative"
                checked={allowNegative}
                onCheckedChange={saveAllowNegative}
                aria-label="Izinkan stok minus"
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ==================== DASHBOARD ====================

function DashboardSection({
  data,
  loading,
  onGo,
}: {
  data: DashboardData | null
  loading: boolean
  onGo: (t: TabKey) => void
}) {
  if (loading || !data) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
        <Skeleton className="h-56 w-full" />
      </div>
    )
  }

  const cards = [
    { label: 'Total Jenis Bahan', value: fmtNum(data.totalJenis), tone: 'text-foreground', icon: Layers },
    { label: 'Total Stok', value: fmtNum(data.totalStok), tone: 'text-foreground', icon: Boxes },
    { label: 'Stok Menipis', value: fmtNum(data.stokMenipis), tone: 'text-amber-600', icon: AlertTriangle },
    { label: 'Stok Habis', value: fmtNum(data.stokHabis), tone: 'text-rose-600', icon: AlertTriangle },
  ]

  return (
    <div className="space-y-4">
      {/* Kartu ringkasan */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(c => {
          const Icon = c.icon
          return (
            <Card key={c.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                  <Icon className={cn('h-4 w-4 shrink-0', c.tone)} />
                </div>
                <p className={cn('mt-1.5 text-2xl font-bold tabular-nums', c.tone)}>{c.value}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Nilai persediaan */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
          <div>
            <p className="text-xs text-muted-foreground">Nilai Persediaan</p>
            <p className="text-xl font-bold tabular-nums">{formatIDR(data.nilaiPersediaan)}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Total stok × harga modal terakhir tiap bahan
          </p>
        </CardContent>
      </Card>

      {/* Bahan yang perlu dibeli */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Bahan yang Perlu Dibeli</p>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onGo('bahan')}>
              Lihat Semua <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
            </Button>
          </div>
          {data.perluBeli.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Semua stok aman — tidak ada bahan yang perlu dibeli.
            </p>
          ) : (
            <div className="space-y-2">
              {data.perluBeli.map(b => (
                <div
                  key={b.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-tight">{b.nama}</p>
                    <p className="text-xs text-muted-foreground">{b.kode}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums">
                      {fmtNum(b.stok)} <span className="text-xs font-normal text-muted-foreground">{b.satuan}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Min: {fmtNum(b.stokMin)} {b.satuan}
                    </p>
                  </div>
                  <StatusBadge status={b.status} />
                  {b.hargaModal > 0 && (
                    <p className="w-full text-xs text-muted-foreground sm:w-auto">
                      ± {formatIDR(Math.max(b.stokMin - b.stok, 0) * b.hargaModal)} untuk kembali ke minimum
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ==================== FAB + ====================

function QuickFab({
  actions,
  onPick,
  disabled,
}: {
  actions: { label: string; icon: typeof Plus; go: TabKey }[]
  onPick: (t: TabKey) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (disabled) return null

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Tambah transaksi cepat"
        aria-expanded={open}
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95',
          open && 'rotate-45'
        )}
      >
        <Plus className="h-6 w-6" />
      </button>
      {open && (
        <div className="absolute bottom-16 right-0 w-44 overflow-hidden rounded-xl border bg-card shadow-xl">
          {actions.map(a => {
            const Icon = a.icon
            return (
              <button
                key={a.go}
                onClick={() => {
                  setOpen(false)
                  onPick(a.go)
                }}
                className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-medium hover:bg-muted"
              >
                <Icon className="h-4 w-4 text-primary" />
                {a.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
