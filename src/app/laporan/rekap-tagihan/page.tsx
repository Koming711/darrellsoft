'use client'

/**
 * Rekap Tagihan per Customer — halaman laporan (menu Laporan → Rekap Tagihan per Customer).
 *
 * - Sumber data sama dengan halaman Piutang Dagang: /api/history docType=invoice
 *   (rentang lebar 2000–2099), sisa = total − DP, lunas = p.lunas === true,
 *   invoice batal di-skip — supaya angka KONSISTEN dengan Piutang Dagang.
 * - Tampilan: strip total → pencarian customer → daftar kartu per customer
 *   (nama, jumlah invoice, total tagihan). Kartu bisa dibuka (accordion) untuk
 *   melihat daftar invoice di dalamnya: nomor, tanggal, jatuh tempo, sisa,
 *   badge "Terlambat X hari" bila lewat tempo.
 * - Halaman ini READ-ONLY (laporan) — penandaan lunas tetap di Invoice/Piutang.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Coins,
  Inbox,
  RefreshCw,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/dashboard-layout'
import { authFetch, getAuthHeaders } from '@/lib/auth-fetch'
import { formatRupiah } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'

interface HistoryEntry {
  id: string
  nomor: string
  pihakKedua?: string
  dataJson: string
  tanggal?: string
}

interface TagihanInvoice {
  id: string
  nomor: string
  tanggal: string
  sisa: number
  dueDate: string
  overdueDays: number
}

interface CustomerTagihan {
  nama: string
  invoices: TagihanInvoice[]
  total: number
}

function todayStr(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export default function RekapTagihanPage() {
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<CustomerTagihan[]>([])
  const [query, setQuery] = useState('')
  // Accordion: nama customer yang kartunya sedang terbuka (null = semua tutup)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const headers = getAuthHeaders()
      const res = await authFetch(
        '/api/history?docType=invoice&startDate=2000-01-01&endDate=2099-12-31',
        { headers }
      )
      if (!res.ok) throw new Error('Gagal memuat data tagihan')
      const json = await res.json()
      const entries: HistoryEntry[] = json.data || []

      const today = todayStr()
      const map = new Map<string, CustomerTagihan>()
      for (const entry of entries) {
        try {
          const p = JSON.parse(entry.dataJson) as Record<string, unknown>
          // Invoice batal bukan tagihan (selaras Piutang Dagang & laporan penjualan)
          if (p.batal === true || p.batal === 'true') continue
          // Status lunas diambil dari field invoice itu sendiri — SAMA dengan
          // halaman Piutang Dagang supaya rekap & halaman konsisten.
          if (p.lunas === true) continue
          const itemsRaw = Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : []
          const subtotal = itemsRaw.reduce(
            (acc, it) => acc + Number(it.qty ?? 0) * Number(it.harga ?? 0),
            0
          )
          const ppn = Number(p.ppn ?? 0)
          const total = Math.round(subtotal + subtotal * (ppn / 100))
          const dpAmount =
            p.dpAmount !== undefined && p.dpAmount !== null && Number(p.dpAmount) > 0
              ? Math.round(Number(p.dpAmount))
              : Math.round(total * (Number(p.dp ?? 0) / 100))
          const sisa = Math.max(0, total - dpAmount)
          if (sisa <= 0) continue
          const dueDate = String(p.tanggalJatuhTempo ?? '')
          const overdueDays =
            dueDate && dueDate < today
              ? Math.floor(
                  (new Date(today + 'T00:00:00').getTime() -
                    new Date(dueDate + 'T00:00:00').getTime()) /
                    86400000
                )
              : 0
          const clientObj = p.client as Record<string, unknown> | undefined
          const nama = String(clientObj?.nama ?? '') || entry.pihakKedua || '-'
          const prev = map.get(nama) ?? { nama, invoices: [], total: 0 }
          prev.invoices.push({
            id: entry.id,
            nomor: entry.nomor,
            tanggal: String(p.tanggal ?? entry.tanggal ?? '').slice(0, 10),
            sisa,
            dueDate,
            overdueDays,
          })
          prev.total += sisa
          map.set(nama, prev)
        } catch {
          /* skip dataJson rusak */
        }
      }

      // Customer urut tagihan terbesar; invoice di dalamnya urut terbaru dulu
      const list = Array.from(map.values())
        .map((c) => ({
          ...c,
          invoices: [...c.invoices].sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1)),
        }))
        .sort((a, b) => b.total - a.total)
      setCustomers(list)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const totalTagihan = useMemo(() => customers.reduce((acc, c) => acc + c.total, 0), [customers])
  const totalInvoice = useMemo(
    () => customers.reduce((acc, c) => acc + c.invoices.length, 0),
    [customers]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((c) => c.nama.toLowerCase().includes(q))
  }, [customers, query])

  return (
    <DashboardLayout title="Rekap Tagihan per Customer">
      <div className="space-y-5">
        {/* Header + refresh */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-bold tracking-tight">Rekap Tagihan per Customer</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sisa pembayaran invoice yang belum diterima, dikelompokkan per customer — angka sama dengan Piutang Dagang.
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
              <p className="text-xs font-medium text-muted-foreground">Total Tagihan</p>
              <p className="text-xl md:text-2xl font-bold text-amber-700 dark:text-amber-400 mt-0.5 truncate">
                {formatRupiah(totalTagihan)}
              </p>
            </div>
            <div className="ml-auto flex flex-col items-end gap-1.5 shrink-0">
              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                {totalInvoice} invoice belum lunas
              </span>
              <span className="inline-flex items-center rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {customers.length} customer
              </span>
            </div>
          </div>
        )}

        {/* Pencarian customer */}
        {!loading && customers.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari customer..."
              aria-label="Cari customer"
              className="pl-9 h-10"
            />
          </div>
        )}

        {/* Daftar rekap per customer */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
            ))}
          </div>
        ) : customers.length === 0 ? (
          <div className="rounded-xl border border-stone-200 bg-white py-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <CheckCircle2 className="h-10 w-10 text-emerald-200 mx-auto mb-2 dark:text-emerald-900" aria-hidden="true" />
            <p className="text-sm text-muted-foreground px-4">
              Semua invoice sudah lunas — tidak ada tagihan.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-stone-200 bg-white py-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <Inbox className="h-10 w-10 text-stone-300 mx-auto mb-2 dark:text-zinc-700" aria-hidden="true" />
            <p className="text-sm text-muted-foreground px-4">
              Tidak ada customer yang cocok dengan pencarian.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => {
              const open = expanded === c.nama
              const hasOverdue = c.invoices.some((inv) => inv.overdueDays > 0)
              return (
                <div
                  key={c.nama}
                  className="rounded-xl border border-stone-200 bg-white overflow-hidden dark:border-zinc-800 dark:bg-zinc-900"
                >
                  {/* Kepala kartu customer — tap untuk buka/tutup daftar invoice */}
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : c.nama)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-stone-50 dark:hover:bg-zinc-800/60"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-100 text-sm font-bold text-stone-600 dark:bg-zinc-800 dark:text-zinc-300" aria-hidden="true">
                      {c.nama.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{c.nama}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {c.invoices.length} invoice belum lunas
                        {hasOverdue ? ' · ada yang terlambat' : ''}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-sm md:text-base font-bold tabular-nums text-amber-700 dark:text-amber-400">
                        {formatRupiah(c.total)}
                      </span>
                      {hasOverdue && (
                        <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                          <AlertTriangle className="h-3 w-3 mr-1" aria-hidden="true" />
                          terlambat
                        </span>
                      )}
                    </div>
                    {open ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-stone-400" aria-hidden="true" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-stone-400" aria-hidden="true" />
                    )}
                  </button>

                  {/* Daftar invoice dalam kartu (accordion) */}
                  {open && (
                    <ul className="border-t border-stone-100 divide-y divide-stone-100 dark:border-zinc-800 dark:divide-zinc-800" aria-label={`Invoice ${c.nama}`}>
                      {c.invoices.map((inv) => (
                        <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{inv.nomor}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {inv.tanggal || '-'}
                              {inv.dueDate ? ` · jatuh tempo ${inv.dueDate}` : ''}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                              {formatRupiah(inv.sisa)}
                            </span>
                            {inv.overdueDays > 0 && (
                              <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                                Terlambat {inv.overdueDays} hari
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
