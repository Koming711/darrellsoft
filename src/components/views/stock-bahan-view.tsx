'use client'

/**
 * StockBahanView — modul Stock Bahan (shell dengan tab submenu).
 *
 * Tab (submenu): Dashboard Stock, Data Bahan, Stok Masuk, Stok Keluar,
 * Penyesuaian Stok, Riwayat Stok, Laporan Stok, Data Supplier.
 *
 * - Shell memuat data master (bahan + supplier) dan menyediakan refresh
 *   ke semua tab; transaksi difetch per tab.
 * - Tab aktif tersinkron dengan URL (?tab=) agar bisa dibagikan/di-bookmark.
 * - Migrasi idempoten dijalankan sekali per sesi (saldo awal data lama).
 * - FAB "+" di mobile untuk tambah transaksi cepat.
 * - Desktop: tabel. Mobile: kartu. Mengikuti konvensi UI aplikasi.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  LayoutDashboard,
  Boxes,
  PackagePlus,
  PackageMinus,
  Scale,
  History,
  FileBarChart,
  Truck,
  Plus,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import type { SessionUser } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { BahanItem, SuplierItem } from '@/lib/stock-bahan-types'
import SbDashboard from '@/components/stock-bahan/sb-dashboard'
import SbDataBahan from '@/components/stock-bahan/sb-data-bahan'
import SbStokMasuk from '@/components/stock-bahan/sb-stok-masuk'
import SbStokKeluar from '@/components/stock-bahan/sb-stok-keluar'
import SbPenyesuaian from '@/components/stock-bahan/sb-penyesuaian'
import SbRiwayat from '@/components/stock-bahan/sb-riwayat'
import SbLaporan from '@/components/stock-bahan/sb-laporan'
import SbSupplier from '@/components/stock-bahan/sb-supplier'

export type SbTab = 'dashboard' | 'data' | 'masuk' | 'keluar' | 'penyesuaian' | 'riwayat' | 'laporan' | 'supplier'

const TABS: { id: SbTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard Stock', icon: LayoutDashboard },
  { id: 'data', label: 'Data Bahan', icon: Boxes },
  { id: 'masuk', label: 'Stok Masuk', icon: PackagePlus },
  { id: 'keluar', label: 'Stok Keluar', icon: PackageMinus },
  { id: 'penyesuaian', label: 'Penyesuaian Stok', icon: Scale },
  { id: 'riwayat', label: 'Riwayat Stok', icon: History },
  { id: 'laporan', label: 'Laporan Stok', icon: FileBarChart },
  { id: 'supplier', label: 'Data Supplier', icon: Truck },
]

export interface StockBahanViewProps {
  user: SessionUser
  canAdd: boolean
  canEdit: boolean
  canDelete: boolean
}

export default function StockBahanView({ user, canAdd, canEdit, canDelete }: StockBahanViewProps) {
  const [tab, setTabState] = useState<SbTab>(() => {
    if (typeof window !== 'undefined') {
      const t = new URLSearchParams(window.location.search).get('tab')
      if (t && TABS.some((x) => x.id === t)) return t as SbTab
    }
    return 'dashboard'
  })
  const [bahans, setBahans] = useState<BahanItem[]>([])
  const [supliers, setSupliers] = useState<SuplierItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fabOpen, setFabOpen] = useState(false)

  // Sinyal untuk membuka form "tambah" di tab transaksi (dari FAB / aksi cepat)
  const [addSignal, setAddSignal] = useState(0)
  // Preselect bahan untuk Stok Masuk/Keluar cepat dari Data Bahan
  const [preselect, setPreselect] = useState<{ tab: 'masuk' | 'keluar'; bahanId: string } | null>(null)

  const setTab = useCallback((t: SbTab) => {
    setTabState(t)
    setFabOpen(false)
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', t)
      window.history.replaceState({}, '', url.toString())
    } catch {
      /* ignore */
    }
  }, [])

  const refreshBahans = useCallback(async () => {
    try {
      const rows = await apiFetch<BahanItem[]>('/api/stock-bahan')
      setBahans(rows)
    } catch (e: any) {
      toast.error(e?.message || 'Gagal memuat data bahan')
    }
  }, [])

  const refreshSupliers = useCallback(async () => {
    try {
      const rows = await apiFetch<SuplierItem[]>('/api/stock-bahan/suplier')
      setSupliers(rows)
    } catch (e: any) {
      toast.error(e?.message || 'Gagal memuat data supplier')
    }
  }, [])

  const migrateDone = useRef(false)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Migrasi idempoten (saldo awal data lama) — sekali per sesi browser
      if (!migrateDone.current) {
        migrateDone.current = true
        const key = `sb_migrated_${user.id || 'anon'}`
        if (!sessionStorage.getItem(key)) {
          try {
            await apiFetch('/api/stock-bahan/migrate', { method: 'POST' })
            sessionStorage.setItem(key, '1')
          } catch {
            /* migrasi gagal diam — recalc tetap jalan saat transaksi baru */
          }
        }
      }
      await Promise.all([refreshBahans(), refreshSupliers()])
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [refreshBahans, refreshSupliers, user.id])

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshBahans(), refreshSupliers()])
  }, [refreshBahans, refreshSupliers])

  const isAdmin = user.role === 'ADMIN'

  const openQuick = (target: 'masuk' | 'keluar', bahanId?: string) => {
    setFabOpen(false)
    if (bahanId) {
      setPreselect({ tab: target, bahanId })
    } else {
      setAddSignal((n) => n + 1)
    }
    setTab(target)
  }

  const handleQuickMasuk = (bahanId: string) => openQuick('masuk', bahanId)
  const handleQuickKeluar = (bahanId: string) => openQuick('keluar', bahanId)

  const consumePreselect = useCallback(() => setPreselect(null), [])

  const fabActions: { label: string; onClick: () => void }[] = [
    { label: 'Tambah Bahan', onClick: () => { setFabOpen(false); setAddSignal((n) => n + 1); setTab('data') } },
    { label: 'Stok Masuk', onClick: () => openQuick('masuk') },
    { label: 'Stok Keluar', onClick: () => openQuick('keluar') },
    { label: 'Penyesuaian Stok', onClick: () => { setFabOpen(false); setAddSignal((n) => n + 1); setTab('penyesuaian') } },
    { label: 'Tambah Supplier', onClick: () => { setFabOpen(false); setAddSignal((n) => n + 1); setTab('supplier') } },
  ]

  return (
    <div className="space-y-4">
      {/* ===== Tab bar (submenu) — scrollable di mobile ===== */}
      <div className="-mx-3 px-3 lg:mx-0 lg:px-0 overflow-x-auto hide-scrollbar" role="tablist" aria-label="Menu Stock Bahan">
        <div className="flex gap-1.5 w-max lg:w-full lg:flex-wrap min-w-full">
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors border',
                  active
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-card text-muted-foreground border-border hover:bg-accent hover:text-foreground'
                )}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ===== Konten tab ===== */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Memuat data stok…
        </div>
      ) : (
        <>
          {tab === 'dashboard' && (
            <SbDashboard
              bahans={bahans}
              onOpenDetail={(bahanId) => { setTab('data'); window.setTimeout(() => setPreselect(null), 0) }}
            />
          )}
          {tab === 'data' && (
            <SbDataBahan
              bahans={bahans}
              loading={loading}
              canAdd={canAdd}
              canEdit={canEdit}
              canDelete={canDelete}
              supliers={supliers}
              onChanged={refreshAll}
              onQuickMasuk={handleQuickMasuk}
              onQuickKeluar={handleQuickKeluar}
              addSignal={addSignal}
            />
          )}
          {tab === 'masuk' && (
            <SbStokMasuk
              bahans={bahans}
              supliers={supliers}
              canAdd={canAdd}
              canEdit={canEdit}
              canDelete={canDelete}
              onChanged={refreshAll}
              preselectBahanId={preselect?.tab === 'masuk' ? preselect.bahanId : undefined}
              onPreselectConsumed={consumePreselect}
              addSignal={addSignal}
            />
          )}
          {tab === 'keluar' && (
            <SbStokKeluar
              bahans={bahans}
              canAdd={canAdd}
              canEdit={canEdit}
              canDelete={canDelete}
              onChanged={refreshAll}
              isAdmin={isAdmin}
              preselectBahanId={preselect?.tab === 'keluar' ? preselect.bahanId : undefined}
              onPreselectConsumed={consumePreselect}
              addSignal={addSignal}
            />
          )}
          {tab === 'penyesuaian' && (
            <SbPenyesuaian
              bahans={bahans}
              canAdd={canAdd}
              canEdit={canEdit}
              canDelete={canDelete}
              onChanged={refreshAll}
              addSignal={addSignal}
            />
          )}
          {tab === 'riwayat' && <SbRiwayat bahans={bahans} />}
          {tab === 'laporan' && <SbLaporan bahans={bahans} />}
          {tab === 'supplier' && (
            <SbSupplier
              supliers={supliers}
              canAdd={canAdd}
              canEdit={canEdit}
              canDelete={canDelete}
              onChanged={refreshSupliers}
              addSignal={addSignal}
            />
          )}
        </>
      )}

      {/* ===== FAB "+" mobile — tambah transaksi cepat ===== */}
      <div className="lg:hidden">
        {fabOpen && (
          <>
            <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setFabOpen(false)} />
            <div className="fixed right-4 bottom-24 z-50 w-48 rounded-xl border bg-card shadow-lg overflow-hidden">
              {fabActions.map((a) => (
                <button
                  key={a.label}
                  onClick={a.onClick}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-[13px] font-medium text-left hover:bg-accent transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-primary" />
                  {a.label}
                </button>
              ))}
            </div>
          </>
        )}
        <button
          onClick={() => setFabOpen((v) => !v)}
          aria-label="Tambah transaksi cepat"
          className="fixed right-4 bottom-20 z-50 flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 transition-transform"
        >
          <Plus className={cn('w-6 h-6 transition-transform', fabOpen && 'rotate-45')} />
        </button>
      </div>
    </div>
  )
}
