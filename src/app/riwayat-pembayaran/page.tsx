'use client'

import { useCallback, useEffect, useState } from 'react'
import { Banknote, CalendarDays, ChevronRight, Layers, RefreshCw, User, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/dashboard-layout'
import { authFetch, getAuthHeaders } from '@/lib/auth-fetch'
import { formatRupiah } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { InvoicePreview } from '@/components/dokupro/invoice-preview'
import type { InvoiceData } from '@/lib/types'
import { normalizeInvoiceData } from '@/lib/normalize-invoice'
import { fetchUserCompany } from '@/lib/company-settings'
import { generateInvoicePdf, sharePdfViaWhatsApp } from '@/lib/generate-pdf'

// ===== Types =====
interface HistoryEntry {
  id: string
  docType: string
  nomor: string
  tanggal: string
  pihakKedua: string
  total: string
  dataJson: string
  createdAt: string
}

interface InvoiceDpRow {
  id: string
  nomor: string
  tanggal: string
  customerName: string
  total: number
  dpAmount: number
  settledAmount: number
  sisa: number
  lunas: boolean
  tanggalJatuhTempo: string
  data: Record<string, unknown> | null
}

interface PelunasanRow {
  id: string
  nomor: string
  tanggal: string
  referensiNomor: string
  nominal: number
  lunas: boolean
  tanggalJatuhTempo: string
  data: Record<string, unknown> | null
}

/**
 * Badge status invoice. Lunas → hijau, Belum Lunas → oranye,
 * dengan info jatuh tempo bila tersedia.
 */
function StatusBadge({ status, dueDate }: { status: 'LUNAS' | 'BELUM_BAYAR'; dueDate: string | null }) {
  if (status === 'LUNAS') {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900">
        Lunas
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className="bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-50 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900"
      title={dueDate ? `Jatuh tempo ${dueDate}` : undefined}
    >
      Belum Lunas
    </Badge>
  )
}

/** Badge tipe invoice: DP = biru, Pelunasan = emerald */
function TypeBadge({ type }: { type: string }) {
  const isDp = type === 'DP'
  return (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0 ${
        isDp
          ? 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-50 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
      }`}
    >
      {type}
    </Badge>
  )
}

/** Warna angka sisa tagihan: 0 → hijau (lunas), lainnya → oranye */
function sisaClass(sisa: number): string {
  return sisa <= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
}

/** Format tanggal ISO (YYYY-MM-DD) → "19 Jul 2026" */
function formatDateID(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Parse daftar entry history menjadi baris terstruktur; skip JSON rusak. */
function parseHistory<T>(entries: HistoryEntry[], mapFn: (parsed: Record<string, unknown>, entry: HistoryEntry) => T | null): T[] {
  const out: T[] = []
  for (const entry of entries) {
    try {
      const parsed = JSON.parse(entry.dataJson) as Record<string, unknown>
      const row = mapFn(parsed, entry)
      if (row) out.push(row)
    } catch {
      /* skip rusak */
    }
  }
  return out
}

export default function RiwayatPembayaranPage() {
  const [dpRows, setDpRows] = useState<InvoiceDpRow[]>([])
  const [settlementRows, setSettlementRows] = useState<PelunasanRow[]>([])
  const [loading, setLoading] = useState(true)

  // Pratinjau invoice A5
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewData, setPreviewData] = useState<InvoiceData | null>(null)
  const [previewIsPelunasan, setPreviewIsPelunasan] = useState(false)
  const [previewDpOverride, setPreviewDpOverride] = useState<number | undefined>(undefined)
  const [previewScale, setPreviewScale] = useState(0.5)
  const [sendingPdf, setSendingPdf] = useState(false)

  // Data toko milik user (fallback konten invoice lama yang tidak menyimpan company)
  const [userCompany, setUserCompany] = useState<Partial<InvoiceData['company']> | null>(null)
  useEffect(() => {
    let alive = true
    fetchUserCompany().then((c) => {
      if (alive) setUserCompany(c)
    })
    return () => {
      alive = false
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const headers = getAuthHeaders()
      const [invRes, pelRes] = await Promise.all([
        authFetch('/api/history?docType=invoice&startDate=2000-01-01&endDate=2099-12-31', { headers }),
        authFetch('/api/history?docType=invoice-pelunasan&startDate=2000-01-01&endDate=2099-12-31', { headers }),
      ])
      if (!invRes.ok || !pelRes.ok) throw new Error('Gagal memuat data pembayaran')
      const invJson = await invRes.json()
      const pelJson = await pelRes.json()
      const invEntries: HistoryEntry[] = invJson.data || []
      const pelEntries: HistoryEntry[] = pelJson.data || []

      // Pelunasan: referensi nomor → { lunas, nominal }
      const pelunasanList = parseHistory(pelEntries, (p, entry) => {
        const itemsRaw = Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : []
        const subtotal = itemsRaw.reduce((acc, it) => acc + Number(it.qty ?? 0) * Number(it.harga ?? 0), 0)
        const ppn = Number(p.ppn ?? 0)
        const docTotal = Number(p.originalTotal ?? 0) > 0 ? Number(p.originalTotal) : subtotal + subtotal * (ppn / 100)
        const dpAmount =
          p.dpAmount !== undefined && p.dpAmount !== null && Number(p.dpAmount) > 0
            ? Number(p.dpAmount)
            : docTotal * (Number(p.dp ?? 0) / 100)
        const referensiNomor = String(p.referensiInvoiceNomor ?? '')
        if (!referensiNomor) return null
        const row: PelunasanRow = {
          id: entry.id,
          nomor: entry.nomor,
          tanggal: String(p.tanggal ?? entry.tanggal ?? '').slice(0, 10),
          referensiNomor,
          nominal: Math.max(0, docTotal - dpAmount),
          lunas: p.lunas === true,
          tanggalJatuhTempo: String(p.tanggalJatuhTempo ?? ''),
          data: p,
        }
        return row
      })
      setSettlementRows(pelunasanList.sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1)))

      const settledMap = new Map<string, { lunas: boolean; nominal: number }>()
      for (const p of pelunasanList) {
        const prev = settledMap.get(p.referensiNomor)
        if (!prev || (p.lunas && !prev.lunas)) {
          settledMap.set(p.referensiNomor, { lunas: p.lunas, nominal: p.lunas ? p.nominal : prev?.nominal ?? 0 })
        }
      }

      const dpList = parseHistory(invEntries, (p, entry) => {
        const itemsRaw = Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : []
        const subtotal = itemsRaw.reduce((acc, it) => acc + Number(it.qty ?? 0) * Number(it.harga ?? 0), 0)
        const ppn = Number(p.ppn ?? 0)
        const total = subtotal + subtotal * (ppn / 100)
        const dpAmount =
          p.dpAmount !== undefined && p.dpAmount !== null && Number(p.dpAmount) > 0
            ? Number(p.dpAmount)
            : total * (Number(p.dp ?? 0) / 100)
        if (dpAmount <= 0) return null // hanya invoice dengan DP
        const client = (p.client ?? {}) as Record<string, unknown>
        const lunas = p.lunas === true
        const settled = settledMap.get(entry.nomor)
        const settledAmount = lunas ? total - dpAmount : settled?.lunas ? settled.nominal : 0
        const sisa = Math.max(0, Math.round(total - dpAmount - settledAmount))
        const row: InvoiceDpRow = {
          id: entry.id,
          nomor: entry.nomor,
          tanggal: String(p.tanggal ?? entry.tanggal ?? '').slice(0, 10),
          customerName: entry.pihakKedua || String(client.nama ?? '') || '-',
          total: Math.round(total),
          dpAmount: Math.round(dpAmount),
          settledAmount: Math.round(settledAmount),
          sisa,
          lunas: lunas || sisa <= 0,
          tanggalJatuhTempo: String(p.tanggalJatuhTempo ?? ''),
          data: p,
        }
        return row
      })
      setDpRows(dpList.sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1)))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Scale A5 Invoice preview to fit inside a popup on both mobile & desktop
  useEffect(() => {
    const DESIGN_W = 576
    const DESIGN_H = DESIGN_W * (210 / 148)
    const updateInvScale = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const marginX = 24
      const marginY = 32
      const topPad = 48
      const btnArea = 56
      const availW = vw - marginX * 2
      const availH = vh - marginY * 2 - topPad - btnArea
      const s = Math.min(availW / DESIGN_W, availH / DESIGN_H)
      setPreviewScale(Math.max(0.28, Math.min(0.85, s)))
    }
    updateInvScale()
    window.addEventListener('resize', updateInvScale)
    return () => window.removeEventListener('resize', updateInvScale)
  }, [])

  // Total piutang = Σ sisa tagihan invoice DP
  const totalPiutang = dpRows.reduce((acc, r) => acc + r.sisa, 0)
  const dpOnly = dpRows
  const settlementOnly = settlementRows

  const openPreview = (row: InvoiceDpRow | PelunasanRow, isPelunasan: boolean) => {
    if (!row.data) return
    // Normalisasi data lama (dataJson tanpa key `company`) + fallback data toko user agar preview tidak crash / tidak generik
    const merged = normalizeInvoiceData(row.data, userCompany)
    setPreviewData(merged)
    setPreviewIsPelunasan(isPelunasan)
    if (isPelunasan) {
      const dp =
        (row.data as Record<string, unknown>).dpAmount !== undefined && Number((row.data as Record<string, unknown>).dpAmount) > 0
          ? Number((row.data as Record<string, unknown>).dpAmount)
          : undefined
      setPreviewDpOverride(dp)
    } else {
      setPreviewDpOverride(undefined)
    }
    setPreviewOpen(true)
  }

  const handleSendPdf = useCallback(async () => {
    if (!previewData) return
    setSendingPdf(true)
    try {
      const blob = await generateInvoicePdf(previewData)
      const fileName = `Invoice_${previewData.nomor || 'draft'}.pdf`
      await sharePdfViaWhatsApp(blob, fileName, `Invoice ${previewData.nomor}`)
      toast.success('PDF dikirim via WhatsApp')
    } catch (err) {
      console.error(err)
      toast.error('Gagal mengirim PDF')
    } finally {
      setSendingPdf(false)
    }
  }, [previewData])

  return (
    <DashboardLayout title="Riwayat Pembayaran">
      <div className="space-y-6">
        {/* Header + refresh */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-bold tracking-tight">Riwayat Pembayaran</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Invoice DP dan transaksi pelunasan atas pesanan.
            </p>
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            aria-label="Muat ulang data"
            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white transition-colors hover:border-emerald-300 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900"
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
              <Wallet className="h-5 w-5 text-amber-700 dark:text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Total Piutang</p>
              <p className="text-xl md:text-2xl font-bold text-amber-700 dark:text-amber-400 mt-0.5 truncate">
                {formatRupiah(totalPiutang)}
              </p>
            </div>
            <div className="ml-auto flex flex-col items-end gap-1.5 shrink-0">
              <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300">
                {dpOnly.length} Invoice DP
              </span>
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                {settlementOnly.length} Pelunasan
              </span>
            </div>
          </div>
        )}

        {/* ===== Bagian 1: Daftar Invoice DP ===== */}
        <section aria-label="Daftar Invoice DP" className="space-y-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Daftar Invoice DP</h2>
              {!loading && dpOnly.length > 0 && (
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {dpOnly.length}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Invoice pesanan dengan uang muka (DP) dan sisa tagihannya.
            </p>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : dpOnly.length === 0 ? (
              <DpEmptyState />
            ) : (
              <div className="max-h-96 overflow-auto scrollbar-thin">
                <Table className="min-w-[760px]">
                  <TableHeader className="sticky top-0 z-10 bg-stone-50 dark:bg-zinc-800">
                    <TableRow className="bg-stone-50 hover:bg-stone-50 dark:bg-zinc-800 dark:hover:bg-zinc-800">
                      <TableHead>Nomor</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Pelanggan</TableHead>
                      <TableHead className="text-right">Total Pesanan</TableHead>
                      <TableHead className="text-right">Total DP</TableHead>
                      <TableHead className="text-right">Sudah Dipelunasi</TableHead>
                      <TableHead className="text-right">Sisa Tagihan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-10"><span className="sr-only">Buka detail</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dpRows.map((inv) => (
                      <TableRow
                        key={inv.id}
                        tabIndex={0}
                        onClick={() => openPreview(inv, false)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openPreview(inv, false)
                          }
                        }}
                        aria-label={`Buka invoice DP ${inv.nomor}`}
                        className="cursor-pointer"
                      >
                        <TableCell className="whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            {inv.nomor} <TypeBadge type="DP" />
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatDateID(inv.tanggal)}</TableCell>
                        <TableCell className="max-w-40 truncate">{inv.customerName}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{formatRupiah(inv.total)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{formatRupiah(inv.dpAmount)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap text-emerald-700 dark:text-emerald-400">
                          {formatRupiah(inv.settledAmount)}
                        </TableCell>
                        <TableCell className={`text-right font-semibold whitespace-nowrap ${sisaClass(inv.sisa)}`}>
                          {formatRupiah(inv.sisa)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={inv.lunas ? 'LUNAS' : 'BELUM_BAYAR'} dueDate={inv.tanggalJatuhTempo || null} />
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="h-4 w-4 text-stone-400 dark:text-zinc-600" aria-hidden="true" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {loading ? (
              [1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)
            ) : dpOnly.length === 0 ? (
              <div className="rounded-xl border border-stone-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"><DpEmptyState /></div>
            ) : (
              dpOnly.map((inv) => (
                <button
                  key={inv.id}
                  onClick={() => openPreview(inv, false)}
                  aria-label={`Buka invoice DP ${inv.nomor}`}
                  className="w-full text-left"
                >
                  <div
                    className={`rounded-xl border border-l-4 bg-white p-4 space-y-2.5 transition-all active:bg-stone-50 hover:shadow-sm dark:bg-zinc-900 dark:active:bg-zinc-800 ${
                      inv.lunas
                        ? 'border-stone-200 border-l-emerald-500 dark:border-zinc-800 dark:border-l-emerald-600'
                        : 'border-stone-200 border-l-amber-500 dark:border-zinc-800 dark:border-l-amber-600'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-sm font-bold truncate">{inv.nomor}</p>
                        <TypeBadge type="DP" />
                      </div>
                      <StatusBadge status={inv.lunas ? 'LUNAS' : 'BELUM_BAYAR'} dueDate={inv.tanggalJatuhTempo || null} />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="flex items-center gap-1.5 text-sm font-medium min-w-0">
                        <User className="h-3.5 w-3.5 shrink-0 text-stone-400 dark:text-zinc-500" aria-hidden="true" />
                        <span className="truncate">{inv.customerName}</span>
                      </p>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {formatDateID(inv.tanggal)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="grid flex-1 grid-cols-3 gap-2 border-t border-dashed border-stone-200 pt-2.5 dark:border-zinc-800">
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</p>
                          <p className="text-[13px] font-semibold tabular-nums whitespace-nowrap">{formatRupiah(inv.total)}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">DP</p>
                          <p className="text-[13px] font-semibold tabular-nums whitespace-nowrap">{formatRupiah(inv.dpAmount)}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Sisa</p>
                          <p className={`text-[13px] font-bold tabular-nums whitespace-nowrap ${sisaClass(inv.sisa)}`}>
                            {formatRupiah(inv.sisa)}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-stone-300 dark:text-zinc-600" aria-hidden="true" />
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        {/* ===== Bagian 2: Transaksi Pelunasan ===== */}
        <section aria-label="Transaksi Pelunasan" className="space-y-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Transaksi Pelunasan</h2>
              {!loading && settlementOnly.length > 0 && (
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {settlementOnly.length}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pembayaran pelunasan atas invoice DP.
            </p>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : settlementOnly.length === 0 ? (
              <SettlementEmptyState />
            ) : (
              <div className="max-h-96 overflow-auto scrollbar-thin">
                <Table className="min-w-[560px]">
                  <TableHeader className="sticky top-0 z-10 bg-stone-50 dark:bg-zinc-800">
                    <TableRow className="bg-stone-50 hover:bg-stone-50 dark:bg-zinc-800 dark:hover:bg-zinc-800">
                      <TableHead>Nomor</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Invoice DP</TableHead>
                      <TableHead className="text-right">Nominal</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-10"><span className="sr-only">Buka detail</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settlementRows.map((inv) => (
                      <TableRow
                        key={inv.id}
                        tabIndex={0}
                        onClick={() => openPreview(inv, true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openPreview(inv, true)
                          }
                        }}
                        aria-label={`Buka transaksi pelunasan ${inv.nomor}`}
                        className="cursor-pointer"
                      >
                        <TableCell className="font-medium whitespace-nowrap">{inv.nomor}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDateID(inv.tanggal)}</TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">
                          {inv.referensiNomor || '-'}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-emerald-700 whitespace-nowrap dark:text-emerald-400">
                          {formatRupiah(inv.nominal)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={inv.lunas ? 'LUNAS' : 'BELUM_BAYAR'} dueDate={inv.tanggalJatuhTempo || null} />
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="h-4 w-4 text-stone-400 dark:text-zinc-600" aria-hidden="true" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {loading ? (
              [1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)
            ) : settlementOnly.length === 0 ? (
              <div className="rounded-xl border border-stone-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"><SettlementEmptyState /></div>
            ) : (
              settlementRows.map((inv) => (
                <button
                  key={inv.id}
                  onClick={() => openPreview(inv, true)}
                  aria-label={`Buka transaksi pelunasan ${inv.nomor}`}
                  className="w-full text-left"
                >
                  <div className="rounded-xl border border-l-4 border-stone-200 border-l-emerald-500 bg-white p-4 space-y-2 transition-all active:bg-stone-50 hover:shadow-sm dark:border-zinc-800 dark:border-l-emerald-600 dark:bg-zinc-900 dark:active:bg-zinc-800">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold truncate">{inv.nomor}</p>
                      <StatusBadge status={inv.lunas ? 'LUNAS' : 'BELUM_BAYAR'} dueDate={inv.tanggalJatuhTempo || null} />
                    </div>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{formatDateID(inv.tanggal)}</span>
                      {inv.referensiNomor ? <span className="font-mono truncate">· DP {inv.referensiNomor}</span> : null}
                    </p>
                    <div className="flex items-end justify-between gap-2 border-t border-dashed border-stone-200 pt-2.5 dark:border-zinc-800">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Nominal Pelunasan</p>
                      <p className="text-base font-bold tabular-nums whitespace-nowrap text-emerald-700 dark:text-emerald-400">
                        {formatRupiah(inv.nominal)}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        {/* ===== PREVIEW DIALOG — Invoice A5 popup ===== */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent
            className="max-w-none w-auto overflow-hidden p-2 pt-10 gap-0 [&_button]:cursor-default"
            style={{
              width: `${576 * previewScale + 16}px`,
              maxHeight: `calc(100dvh - 32px)`,
            }}
            aria-label="Pratinjau Invoice"
          >
            <DialogHeader className="sr-only">
              <DialogTitle>Pratinjau Invoice</DialogTitle>
              <DialogDescription>Preview detail invoice dalam format A5</DialogDescription>
            </DialogHeader>

            {previewData && (
              <div className="flex flex-col items-center gap-3">
                <div style={{
                  width: `${576 * previewScale}px`,
                  height: `${576 * (210 / 148) * previewScale}px`,
                  overflow: 'hidden',
                  flexShrink: 0,
                }}>
                  <div style={{
                    width: 576,
                    height: 576 * (210 / 148),
                    transform: `scale(${previewScale})`,
                    transformOrigin: 'top left',
                  }}>
                    <div className="bg-white" style={{ width: 576, height: 576 * (210 / 148) }}>
                      <div className="a5-preview-scaler">
                        <InvoicePreview
                          data={previewData}
                          showPelunasanLabel={previewIsPelunasan}
                          dpAmountOverride={previewDpOverride}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleSendPdf}
                  disabled={sendingPdf}
                  className="flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 cursor-default text-white text-sm font-semibold transition-colors flex-shrink-0"
                >
                  {sendingPdf ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                  )}
                  Kirim via WhatsApp
                </button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}

function DpEmptyState() {
  return (
    <div className="text-center py-12 px-4">
      <Layers className="h-10 w-10 text-stone-300 mx-auto mb-2 dark:text-zinc-700" />
      <p className="text-sm font-medium">Belum ada invoice DP</p>
      <p className="text-xs text-muted-foreground mt-1">
        Buat invoice dengan uang muka (DP) untuk mencatat pesanan & sisa tagihannya.
      </p>
    </div>
  )
}

function SettlementEmptyState() {
  return (
    <div className="text-center py-12 px-4">
      <Banknote className="h-10 w-10 text-stone-300 mx-auto mb-2 dark:text-zinc-700" />
      <p className="text-sm font-medium">Belum ada transaksi pelunasan</p>
      <p className="text-xs text-muted-foreground mt-1">
        Pelunasan akan muncul setelah ada pembayaran atas invoice DP.
      </p>
    </div>
  )
}
