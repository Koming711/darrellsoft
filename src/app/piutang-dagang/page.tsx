'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Coins,
  Inbox,
  ReceiptText,
  RefreshCw,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/dashboard-layout'
import { startNavigation } from '@/components/navigation-progress'
import { authFetch, getAuthHeaders } from '@/lib/auth-fetch'
import { formatRupiah, formatTanggal } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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

// ===== Piutang Dagang =====
// Invoice pelunasan itu piutang dagang: sisa pembayaran invoice (terutama
// invoice DP yang dilunasi lewat invoice pelunasan) adalah tagihan pelanggan
// yang harus diterima perusahaan.
// Sumber data: docType=invoice (invoice DP & reguler) — sisa = total − DP.
// Dokumen invoice-pelunasan tertaut (referensiInvoiceId) ditampilkan sebagai
// referensi PEL. Menandai lunas menyinkronkan invoice + dokumen pelunasannya.

interface PiutangRow {
  id: string
  nomor: string
  tanggal: string
  customer: string
  total: number
  dpAmount: number
  sisa: number
  lunas: boolean
  tanggalPelunasan: string
  dueDate: string
  overdue: boolean
  overdueDays: number
  isDp: boolean
  pelNomor: string
  raw: Record<string, unknown>
}

interface HistoryEntry {
  id: string
  nomor: string
  tanggal: string
  pihakKedua: string
  dataJson: string
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type FilterKey = 'belum' | 'lunas' | 'semua'

export default function PiutangDagangPage() {
  const router = useRouter()
  const [rows, setRows] = useState<PiutangRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('belum')
  const [query, setQuery] = useState('')
  // Konfirmasi tandai lunas
  const [confirmRow, setConfirmRow] = useState<PiutangRow | null>(null)
  const [confirmSaving, setConfirmSaving] = useState(false)

  const navigate = useCallback(
    (path: string) => {
      startNavigation()
      router.push(path)
    },
    [router]
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const headers = getAuthHeaders()
      // Ambil invoice + dokumen invoice pelunasan (rentang lebar, pola sama
      // dengan Riwayat Pembayaran) lalu hitung piutang tiap invoice.
      const [resInv, resPel] = await Promise.all([
        authFetch('/api/history?docType=invoice&startDate=2000-01-01&endDate=2099-12-31', { headers }),
        authFetch('/api/history?docType=invoice-pelunasan&startDate=2000-01-01&endDate=2099-12-31', { headers }),
      ])
      if (!resInv.ok) throw new Error('Gagal memuat data piutang dagang')
      const json = await resInv.json()
      const entries: HistoryEntry[] = json.data || []
      const pelEntries: HistoryEntry[] = resPel.ok ? ((await resPel.json()).data || []) : []

      // Peta dokumen pelunasan → invoice (referensiInvoiceId, fallback nomor invoice)
      const pelByInvoice = new Map<string, { nomor: string; lunas: boolean }>()
      for (const pel of pelEntries) {
        try {
          const p = JSON.parse(pel.dataJson) as Record<string, unknown>
          const refId = String(p.referensiInvoiceId ?? '')
          const refNomor = String(p.referensiInvoiceNomor ?? '')
          const info = { nomor: pel.nomor, lunas: p.lunas === true }
          if (refId) pelByInvoice.set(refId, info)
          else if (refNomor) pelByInvoice.set(refNomor, info)
        } catch {
          /* skip dataJson rusak */
        }
      }

      const today = todayStr()
      const list: PiutangRow[] = []
      for (const entry of entries) {
        try {
          const p = JSON.parse(entry.dataJson) as Record<string, unknown>
          // Invoice batal bukan piutang (selaras /api/beranda & laporan penjualan)
          if (p.batal === true || p.batal === 'true') continue
          const itemsRaw = Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : []
          const subtotal = itemsRaw.reduce((acc, it) => acc + Number(it.qty ?? 0) * Number(it.harga ?? 0), 0)
          const ppn = Number(p.ppn ?? 0)
          const total = Math.round(subtotal + subtotal * (ppn / 100))
          const dpAmount =
            p.dpAmount !== undefined && p.dpAmount !== null && Number(p.dpAmount) > 0
              ? Math.round(Number(p.dpAmount))
              : Math.round(total * (Number(p.dp ?? 0) / 100))
          const sisa = Math.max(0, total - dpAmount)
          const lunas = p.lunas === true
          const dueDate = String(p.tanggalJatuhTempo ?? '')
          const overdueDays =
            !lunas && dueDate
              ? Math.floor(
                  (new Date(today + 'T00:00:00').getTime() - new Date(dueDate + 'T00:00:00').getTime()) / 86400000
                )
              : 0
          const clientObj = p.client as Record<string, unknown> | undefined
          const isDp = dpAmount > 0
          const pel = pelByInvoice.get(entry.id) ?? (isDp ? pelByInvoice.get(entry.nomor) : undefined)
          list.push({
            id: entry.id,
            nomor: entry.nomor,
            tanggal: String(p.tanggal ?? entry.tanggal ?? '').slice(0, 10),
            customer: String(clientObj?.nama ?? '') || entry.pihakKedua || '-',
            total,
            dpAmount,
            sisa,
            lunas,
            tanggalPelunasan: String(p.tanggalPelunasan ?? ''),
            dueDate,
            overdue: overdueDays > 0,
            overdueDays: Math.max(0, overdueDays),
            isDp,
            pelNomor: pel?.nomor ?? '',
            raw: p,
          })
        } catch {
          /* skip dataJson rusak */
        }
      }
      // Urut: belum lunas dulu → ada tempo terdekat/terlambat di atas → terbaru
      list.sort((a, b) => {
        if (a.lunas !== b.lunas) return a.lunas ? 1 : -1
        if (a.dueDate && b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
        if (a.dueDate) return -1
        if (b.dueDate) return 1
        return a.tanggal < b.tanggal ? 1 : -1
      })
      setRows(list)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const belumLunas = useMemo(() => rows.filter((r) => !r.lunas), [rows])
  const totalPiutang = useMemo(() => belumLunas.reduce((acc, r) => acc + r.sisa, 0), [belumLunas])
  const overdueCount = useMemo(() => belumLunas.filter((r) => r.overdue).length, [belumLunas])
  const customerList = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of belumLunas) map.set(r.customer, (map.get(r.customer) ?? 0) + r.sisa)
    return Array.from(map.entries())
      .map(([nama, total]) => ({ nama, total }))
      .sort((a, b) => b.total - a.total)
  }, [belumLunas])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (filter === 'belum' && r.lunas) return false
      if (filter === 'lunas' && !r.lunas) return false
      if (!q) return true
      return (
        r.nomor.toLowerCase().includes(q) ||
        r.customer.toLowerCase().includes(q) ||
        r.pelNomor.toLowerCase().includes(q)
      )
    })
  }, [rows, filter, query])

  const handleConfirmLunas = async () => {
    if (!confirmRow) return
    setConfirmSaving(true)
    try {
      const headers = { 'Content-Type': 'application/json', ...getAuthHeaders() }
      // 1) Tandai invoice lunas (invoice = sumber utama status, pola sama
      //    dengan editor invoice pelunasan)
      const res = await authFetch(`/api/history/${confirmRow.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          dataJson: JSON.stringify({ ...confirmRow.raw, lunas: true, tanggalPelunasan: todayStr() }),
        }),
      })
      if (!res.ok) throw new Error('Gagal menandai lunas')
      // 2) Sinkronkan dokumen invoice pelunasan tertaut (jika ada) agar
      //    status di dokumen PEL sama dengan invoice-nya
      try {
        const resPel = await authFetch('/api/history?docType=invoice-pelunasan&startDate=2000-01-01&endDate=2099-12-31', {
          headers: getAuthHeaders(),
        })
        if (resPel.ok) {
          const pelJson = await resPel.json()
          const pelEntries: Array<{ id: string; dataJson: string }> = pelJson.data || []
          for (const pel of pelEntries) {
            try {
              const p = JSON.parse(pel.dataJson) as Record<string, unknown>
              const linked =
                String(p.referensiInvoiceId ?? '') === confirmRow.id ||
                String(p.referensiInvoiceNomor ?? '') === confirmRow.nomor
              if (linked && p.lunas !== true) {
                await authFetch(`/api/history/${pel.id}`, {
                  method: 'PUT',
                  headers,
                  body: JSON.stringify({
                    dataJson: JSON.stringify({ ...p, lunas: true, tanggalPelunasan: todayStr() }),
                  }),
                })
              }
            } catch {
              /* skip dataJson rusak */
            }
          }
        }
      } catch {
        /* sinkron dokumen pelunasan non-kritikal */
      }
      toast.success(`${confirmRow.nomor} ditandai lunas — piutang dagang berkurang`)
      setConfirmRow(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Terjadi kesalahan')
    } finally {
      setConfirmSaving(false)
    }
  }

  const tabs: { key: FilterKey; label: string; count: number }[] = [
    { key: 'belum', label: 'Belum Lunas', count: belumLunas.length },
    { key: 'lunas', label: 'Lunas', count: rows.length - belumLunas.length },
    { key: 'semua', label: 'Semua', count: rows.length },
  ]

  return (
    <DashboardLayout title="Piutang Dagang">
      <div className="space-y-5">
        {/* Header + refresh */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-bold tracking-tight">Piutang Dagang</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sisa pembayaran invoice yang belum diterima — invoice pelunasan adalah piutang dagang.
            </p>
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            aria-label="Muat ulang data"
            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white transition-colors hover:border-amber-300 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Strip ringkasan */}
        {loading ? (
          <Skeleton className="h-20 w-full rounded-xl" />
        ) : (
          <div className="rounded-xl border border-stone-200 bg-white p-4 md:p-5 flex items-center gap-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950" aria-hidden="true">
              <Coins className="h-5 w-5 text-amber-700 dark:text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Total Piutang Dagang</p>
              <p className="text-xl md:text-2xl font-bold text-amber-700 dark:text-amber-400 mt-0.5 truncate">
                {formatRupiah(totalPiutang)}
              </p>
            </div>
            <div className="ml-auto flex flex-col items-end gap-1.5 shrink-0">
              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                {belumLunas.length} invoice belum lunas
              </span>
              {overdueCount > 0 ? (
                <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                  <AlertTriangle className="h-3 w-3 mr-1" aria-hidden="true" />
                  {overdueCount} terlambat
                </span>
              ) : null}
            </div>
          </div>
        )}

        {/* Rekap per pelanggan */}
        {!loading && customerList.length > 0 && (
          <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-[10px] uppercase tracking-wider text-stone-400 dark:text-zinc-500 font-semibold mb-2">
              Rekap per Pelanggan
            </p>
            <ul className="divide-y divide-stone-100 dark:divide-zinc-800">
              {customerList.slice(0, 5).map((s) => (
                <li key={s.nama} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm font-medium truncate">{s.nama}</span>
                  <span className="text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-400 shrink-0">
                    {formatRupiah(s.total)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Filter + pencarian */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
            {tabs.map((tb) => (
              <button
                key={tb.key}
                onClick={() => setFilter(tb.key)}
                aria-pressed={filter === tb.key}
                className={`px-3 h-8 rounded-md text-xs font-medium transition-colors ${
                  filter === tb.key
                    ? 'bg-white text-stone-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100'
                    : 'text-stone-500 hover:text-stone-700 dark:text-zinc-400'
                }`}
              >
                {tb.label} ({tb.count})
              </button>
            ))}
          </div>
          <div className="relative sm:ml-auto sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari no. invoice / pelanggan..."
              aria-label="Cari piutang dagang"
              className="pl-9 h-10"
            />
          </div>
        </div>

        {/* Daftar piutang */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-stone-200 bg-white py-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
            {filter === 'lunas' ? (
              <Inbox className="h-10 w-10 text-stone-300 mx-auto mb-2 dark:text-zinc-700" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-10 w-10 text-emerald-200 mx-auto mb-2 dark:text-emerald-900" aria-hidden="true" />
            )}
            <p className="text-sm text-muted-foreground px-4">
              {rows.length === 0
                ? 'Belum ada invoice — buat invoice terlebih dahulu.'
                : filter === 'belum'
                  ? 'Tidak ada piutang — semua invoice sudah lunas.'
                  : 'Tidak ada data pada filter ini.'}
            </p>
          </div>
        ) : (
          <ul className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100 overflow-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:divide-zinc-800">
            {filtered.map((r) => (
              <li key={r.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/invoice?detail=${r.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate(`/invoice?detail=${r.id}`)
                    }
                  }}
                  aria-label={`Buka detail invoice ${r.nomor}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950" aria-hidden="true">
                    <ReceiptText className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium truncate">{r.nomor}</p>
                      {r.isDp ? (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-violet-300 text-violet-700 dark:border-violet-700 dark:text-violet-300">
                          DP
                        </Badge>
                      ) : null}
                      {r.pelNomor ? (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-stone-300 text-stone-600 dark:border-zinc-600 dark:text-zinc-300">
                          PEL: {r.pelNomor}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.customer}
                      {r.tanggal ? ` · ${formatTanggal(r.tanggal)}` : ''}
                      {r.total > 0 ? ` · total ${formatRupiah(r.total)}` : ''}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {r.lunas ? (
                        <span className="text-emerald-700 dark:text-emerald-400">
                          Lunas{r.tanggalPelunasan ? ` · ${formatTanggal(r.tanggalPelunasan)}` : ''}
                        </span>
                      ) : r.dueDate ? (
                        r.overdue ? (
                          <span className="font-medium text-red-600">Terlambat {r.overdueDays} hari</span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            tempo {formatTanggal(r.dueDate)}
                          </span>
                        )
                      ) : (
                        'Piutang dagang — sisa pembayaran'
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0" onClick={(e) => e.stopPropagation()}>
                    <p className={`text-sm font-semibold tabular-nums ${r.lunas ? 'text-stone-400 line-through' : 'text-amber-700 dark:text-amber-400'}`}>
                      {formatRupiah(r.sisa)}
                    </p>
                    {r.dpAmount > 0 && !r.lunas ? (
                      <p className="text-[11px] text-muted-foreground">DP {formatRupiah(r.dpAmount)}</p>
                    ) : null}
                    {!r.lunas && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmRow(r)}
                        className="mt-1 h-8 px-2.5 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950"
                      >
                        Tandai Lunas
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Konfirmasi tandai lunas */}
        <AlertDialog open={!!confirmRow} onOpenChange={(open) => !open && setConfirmRow(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Tandai invoice lunas?</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmRow
                  ? `${confirmRow.nomor} atas nama ${confirmRow.customer} — sisa ${formatRupiah(confirmRow.sisa)} akan ditandai lunas hari ini${confirmRow.pelNomor ? ` beserta invoice pelunasannya (${confirmRow.pelNomor})` : ''}.`
                  : ''}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={confirmSaving}>Batal</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  void handleConfirmLunas()
                }}
                disabled={confirmSaving}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {confirmSaving ? 'Menyimpan...' : 'Ya, Tandai Lunas'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  )
}
