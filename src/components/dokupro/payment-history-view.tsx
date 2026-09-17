'use client'

// Riwayat Pembayaran — porting dari workspace referensi (payment-history.tsx).
// Diadaptasi ke sumber data aplikasi ini: documentHistory (/api/history docType
// "invoice" & "invoice-pelunasan") dengan dataJson per dokumen, bukan /api/invoices.
// Struktur UI sama seperti file referensi: strip Total Piutang + bagian
// "Daftar Invoice DP" + bagian "Transaksi Pelunasan" (tabel desktop + kartu mobile).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Banknote, ChevronRight, Layers } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getAuthHeaders } from '@/lib/auth'
import { formatRupiah } from '@/lib/format'

/** Struktur sama dengan HistoryEntry di src/app/invoice/page.tsx (typing struktural). */
export interface PaymentHistoryEntry {
  id: string
  docType: string
  nomor: string
  tanggal: string
  pihakKedua: string
  total: string
  dataJson: string
  dihapus?: boolean
  createdAt: string
}

interface PaymentHistoryViewProps {
  /** Dipanggil saat baris/kartu diklik → buka layar Detail Invoice. */
  onOpenDetail: (entry: PaymentHistoryEntry) => void
  /** Naikkan nilainya untuk memicu reload data. */
  refreshKey?: number
}

type PayStatus = 'BELUM_BAYAR' | 'LUNAS' | 'BATAL'

interface DocInfo {
  totalHarga: number
  originalTotal: number
  dp: number
  lunas: boolean
  dibatalkan: boolean
  tanggalJatuhTempo: string
  referensiInvoiceNomor: string
}

function parseInfo(entry: PaymentHistoryEntry): DocInfo {
  try {
    const parsed = JSON.parse(entry.dataJson)
    const items = parsed.items || []
    const subtotal = items.reduce((sum: number, it: { qty: number; harga: number }) => sum + it.qty * it.harga, 0)
    const ppn = parsed.ppn || 0
    const totalHarga = subtotal + (subtotal * ppn / 100)
    const originalTotal = parsed.originalTotal !== undefined ? parsed.originalTotal : totalHarga
    const dpAmount = originalTotal * ((parsed.dp || 0) / 100)
    return {
      totalHarga,
      originalTotal,
      dp: dpAmount,
      lunas: parsed.lunas === true,
      dibatalkan: parsed.dibatalkan === true,
      tanggalJatuhTempo: parsed.tanggalJatuhTempo || '',
      referensiInvoiceNomor: parsed.referensiInvoiceNomor || '',
    }
  } catch {
    return { totalHarga: 0, originalTotal: 0, dp: 0, lunas: false, dibatalkan: false, tanggalJatuhTempo: '', referensiInvoiceNomor: '' }
  }
}

function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Tanggal "YYYY-MM-DD" → "16 Jul 2026" (gaya file referensi). */
function formatDateShort(tgl?: string): string {
  if (!tgl) return '-'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(tgl)
  if (!m) return tgl
  const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  return `${parseInt(m[3], 10)} ${bulan[parseInt(m[2], 10) - 1]} ${m[1]}`
}

/** Warna teks sisa tagihan: amber bila masih ada, emerald bila lunas (0) */
function sisaClass(sisa: number): string {
  return sisa > 0 ? 'text-amber-700' : 'text-emerald-700'
}

/** Badge status — gaya file referensi: Lunas hijau, Belum Lunas oranye, Jatuh Tempo merah, Dibatalkan abu. */
function StatusBadge({ status, dueDate }: { status: PayStatus; dueDate?: string | null }) {
  if (status === 'BELUM_BAYAR' && dueDate && new Date(`${dueDate}T00:00:00`).getTime() < startOfToday()) {
    return (
      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[11px] shrink-0">
        Jatuh Tempo
      </Badge>
    )
  }
  const map: Record<PayStatus, string> = {
    BELUM_BAYAR: 'bg-amber-50 text-amber-700 border-amber-200',
    LUNAS: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    BATAL: 'bg-stone-100 text-stone-500 border-stone-200',
  }
  const label: Record<PayStatus, string> = {
    BELUM_BAYAR: 'Belum Lunas',
    LUNAS: 'Lunas',
    BATAL: 'Dibatalkan',
  }
  return <Badge variant="outline" className={`${map[status]} text-[11px] shrink-0`}>{label[status]}</Badge>
}

/** Badge tipe dokumen: DP = sky, Pelunasan = emerald (spesifikasi file referensi). */
function TypeBadge({ type }: { type: 'DP' | 'PELUNASAN' }) {
  const map = {
    DP: 'bg-sky-50 text-sky-700 border-sky-200',
    PELUNASAN: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  } as const
  return <Badge variant="outline" className={`${map[type]} text-[11px] shrink-0`}>{type === 'DP' ? 'DP' : 'Pelunasan'}</Badge>
}

interface DpRow {
  id: string
  entry: PaymentHistoryEntry
  number: string
  date: string
  customerName: string
  total: number
  dpAmount: number
  settlementTotal: number
  sisa: number
  status: PayStatus
  dueDate: string
}

interface PelRow {
  id: string
  entry: PaymentHistoryEntry
  number: string
  date: string
  parentNumber: string | null
  paidAmount: number
  status: PayStatus
}

export function PaymentHistoryView({ onOpenDetail, refreshKey = 0 }: PaymentHistoryViewProps) {
  const [invoiceEntries, setInvoiceEntries] = useState<PaymentHistoryEntry[]>([])
  const [pelEntries, setPelEntries] = useState<PaymentHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const headers = getAuthHeaders()
      const [invRes, pelRes] = await Promise.all([
        fetch('/api/history?docType=invoice', { headers, cache: 'no-store' }),
        fetch('/api/history?docType=invoice-pelunasan', { headers, cache: 'no-store' }),
      ])
      setInvoiceEntries(invRes.ok ? (await invRes.json()).data || [] : [])
      setPelEntries(pelRes.ok ? (await pelRes.json()).data || [] : [])
    } catch (err) {
      console.error('Failed to load payment history:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  // Reload otomatis saat ada perubahan data (Tandai Lunas / Batal / Hapus / simpan)
  useEffect(() => {
    const handler = () => { void load() }
    window.addEventListener('dokupro:history-updated', handler)
    return () => window.removeEventListener('dokupro:history-updated', handler)
  }, [load])

  const { dpRows, settlementRows, totalPiutang } = useMemo(() => {
    const lunasByNomor = new Map<string, boolean>()
    const batalByNomor = new Map<string, boolean>()
    for (const e of invoiceEntries) {
      const info = parseInfo(e)
      lunasByNomor.set(e.nomor, info.lunas)
      batalByNomor.set(e.nomor, info.dibatalkan)
    }
    // Σ pembayaran pelunasan aktif per invoice induk (jumlah = originalTotal − DP induk)
    const paidByNomor = new Map<string, number>()
    for (const e of pelEntries) {
      const info = parseInfo(e)
      const jumlah = info.originalTotal > 0 ? Math.max(0, info.originalTotal - info.dp) : info.totalHarga
      const key = info.referensiInvoiceNomor || ''
      paidByNomor.set(key, (paidByNomor.get(key) || 0) + jumlah)
    }

    // Baris invoice DP: invoice aktif dengan DP > 0
    const dpRows: DpRow[] = invoiceEntries
      .map((e) => ({ e, info: parseInfo(e) }))
      .filter(({ info }) => info.dp > 0)
      .map(({ e, info }) => {
        const total = info.originalTotal > 0 ? info.originalTotal : info.totalHarga
        const status: PayStatus = info.dibatalkan ? 'BATAL' : info.lunas ? 'LUNAS' : 'BELUM_BAYAR'
        const settlementTotal = info.lunas
          ? Math.max(0, total - info.dp)
          : (paidByNomor.get(e.nomor) || 0)
        const sisa = info.dibatalkan || info.lunas ? 0 : Math.max(0, total - info.dp - settlementTotal)
        return {
          id: e.id,
          entry: e,
          number: e.nomor,
          date: e.tanggal,
          customerName: e.pihakKedua,
          total,
          dpAmount: info.dp,
          settlementTotal,
          sisa,
          status,
          dueDate: info.tanggalJatuhTempo,
        }
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))

    // Baris pelunasan: dokumen invoice-pelunasan aktif; status mengikuti invoice induk
    const settlementRows: PelRow[] = pelEntries
      .map((e) => {
        const info = parseInfo(e)
        const parentNomor = info.referensiInvoiceNomor || ''
        const lunasInduk = lunasByNomor.get(parentNomor) ?? info.lunas
        const status: PayStatus = batalByNomor.get(parentNomor) === true
          ? 'BATAL'
          : lunasInduk ? 'LUNAS' : 'BELUM_BAYAR'
        return {
          id: e.id,
          entry: e,
          number: e.nomor,
          date: e.tanggal,
          parentNumber: parentNomor || null,
          paidAmount: info.originalTotal > 0 ? Math.max(0, info.originalTotal - info.dp) : info.totalHarga,
          status,
        }
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))

    // Total piutang = Σ sisa invoice DP (non-BATAL; LUNAS otomatis sisa 0)
    const totalPiutang = dpRows
      .filter((r) => r.status !== 'BATAL')
      .reduce((acc, r) => acc + r.sisa, 0)

    return { dpRows, settlementRows, totalPiutang }
  }, [invoiceEntries, pelEntries])

  return (
    <div className="space-y-6">
      {/* Strip ringkasan */}
      {loading ? (
        <Skeleton className="h-20 w-full rounded-xl" />
      ) : (
        <div className="rounded-xl border border-stone-200 bg-white p-4 md:p-5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Total Piutang</p>
            <p className="text-xl md:text-2xl font-bold text-amber-700 mt-1">
              {formatRupiah(totalPiutang)}
            </p>
          </div>
          <p className="text-xs text-muted-foreground text-right shrink-0">
            {dpRows.length} invoice DP · {settlementRows.length} pelunasan
          </p>
        </div>
      )}

      {/* ===== Bagian 1: Daftar Invoice DP ===== */}
      <section aria-label="Daftar Invoice DP" className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Daftar Invoice DP</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Invoice pesanan dengan uang muka (DP) dan sisa tagihannya.
          </p>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : dpRows.length === 0 ? (
            <DpEmptyState />
          ) : (
            <div className="max-h-96 overflow-auto scrollbar-thin">
              <Table className="min-w-[760px]">
                <TableHeader className="sticky top-0 z-10 bg-stone-50">
                  <TableRow className="bg-stone-50 hover:bg-stone-50">
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
                      onClick={() => onOpenDetail(inv.entry)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onOpenDetail(inv.entry)
                        }
                      }}
                      aria-label={`Buka invoice DP ${inv.number}`}
                      className="cursor-pointer"
                    >
                      <TableCell className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          {inv.number} <TypeBadge type="DP" />
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDateShort(inv.date)}</TableCell>
                      <TableCell className="max-w-40 truncate" title={inv.customerName}>{inv.customerName || '-'}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatRupiah(inv.total)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatRupiah(inv.dpAmount)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap text-emerald-700">
                        {formatRupiah(inv.settlementTotal)}
                      </TableCell>
                      <TableCell className={`text-right font-semibold whitespace-nowrap ${sisaClass(inv.sisa)}`}>
                        {formatRupiah(inv.sisa)}
                      </TableCell>
                      <TableCell><StatusBadge status={inv.status} dueDate={inv.dueDate} /></TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-stone-400" aria-hidden="true" />
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
          ) : dpRows.length === 0 ? (
            <div className="rounded-xl border border-stone-200 bg-white"><DpEmptyState /></div>
          ) : (
            dpRows.map((inv) => (
              <button
                key={inv.id}
                onClick={() => onOpenDetail(inv.entry)}
                aria-label={`Buka invoice DP ${inv.number}`}
                className="w-full text-left"
              >
                <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-2.5 transition-colors active:bg-stone-50 hover:border-emerald-300">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm font-semibold truncate">{inv.number}</p>
                      <TypeBadge type="DP" />
                    </div>
                    <StatusBadge status={inv.status} dueDate={inv.dueDate} />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {inv.customerName || '-'} · {formatDateShort(inv.date)}
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-[11px] text-muted-foreground">Total</p>
                      <p className="font-medium whitespace-nowrap">{formatRupiah(inv.total)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">DP</p>
                      <p className="font-medium whitespace-nowrap">{formatRupiah(inv.dpAmount)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Sisa</p>
                      <p className={`font-semibold whitespace-nowrap ${sisaClass(inv.sisa)}`}>
                        {formatRupiah(inv.sisa)}
                      </p>
                    </div>
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
          <h2 className="text-sm font-semibold">Transaksi Pelunasan</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pembayaran pelunasan atas invoice DP.
          </p>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : settlementRows.length === 0 ? (
            <SettlementEmptyState />
          ) : (
            <div className="max-h-96 overflow-auto scrollbar-thin">
              <Table className="min-w-[560px]">
                <TableHeader className="sticky top-0 z-10 bg-stone-50">
                  <TableRow className="bg-stone-50 hover:bg-stone-50">
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
                      onClick={() => onOpenDetail(inv.entry)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onOpenDetail(inv.entry)
                        }
                      }}
                      aria-label={`Buka transaksi pelunasan ${inv.number}`}
                      className="cursor-pointer"
                    >
                      <TableCell className="font-medium whitespace-nowrap">{inv.number}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDateShort(inv.date)}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {inv.parentNumber ?? '-'}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-emerald-700 whitespace-nowrap">
                        {formatRupiah(inv.paidAmount)}
                      </TableCell>
                      <TableCell><StatusBadge status={inv.status} /></TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-stone-400" aria-hidden="true" />
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
            [1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
          ) : settlementRows.length === 0 ? (
            <div className="rounded-xl border border-stone-200 bg-white"><SettlementEmptyState /></div>
          ) : (
            settlementRows.map((inv) => (
              <button
                key={inv.id}
                onClick={() => onOpenDetail(inv.entry)}
                aria-label={`Buka transaksi pelunasan ${inv.number}`}
                className="w-full text-left"
              >
                <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-2 transition-colors active:bg-stone-50 hover:border-emerald-300">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold truncate">{inv.number}</p>
                    <StatusBadge status={inv.status} />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-xs text-muted-foreground truncate">
                      {formatDateShort(inv.date)}
                      {inv.parentNumber ? ` · DP ${inv.parentNumber}` : ''}
                    </span>
                    <span className="font-semibold text-emerald-700 whitespace-nowrap">
                      {formatRupiah(inv.paidAmount)}
                    </span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

function DpEmptyState() {
  return (
    <div className="text-center py-12 px-4">
      <Layers className="h-10 w-10 text-stone-300 mx-auto mb-2" />
      <p className="text-sm font-medium">Belum ada invoice DP</p>
      <p className="text-xs text-muted-foreground mt-1">
        Buat invoice dengan tipe &quot;DP&quot; untuk mencatat uang muka pesanan.
      </p>
    </div>
  )
}

function SettlementEmptyState() {
  return (
    <div className="text-center py-12 px-4">
      <Banknote className="h-10 w-10 text-stone-300 mx-auto mb-2" />
      <p className="text-sm font-medium">Belum ada transaksi pelunasan</p>
      <p className="text-xs text-muted-foreground mt-1">
        Pelunasan akan muncul setelah ada pembayaran atas invoice DP.
      </p>
    </div>
  )
}
