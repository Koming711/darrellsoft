'use client'

// /panel-admin/riwayat-transaksi — riwayat pembayaran langganan semua pelanggan.
// Filter: tanggal (dari–sampai), paket, status, metode. Ekspor CSV.
// Tab "Sampah": transaksi yang dihapus (soft delete) — bisa dipulihkan atau dihapus permanen.

import { useCallback, useEffect, useState } from 'react'
import { useLiveData } from '@/hooks/use-live-data'
import { LiveIndicator } from '../live-indicator'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { authFetch, getAuthHeaders } from '@/lib/auth-fetch'
import { toast } from 'sonner'
import { ArchiveRestore, Download, History, RefreshCcw, Trash2 } from 'lucide-react'

const rupiah = (n: number) => `Rp ${Math.round(n ?? 0).toLocaleString('id-ID')}`
const fmtDateTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'

interface TxRow {
  id: string
  invoiceNumber: string
  planName: string
  customer: { username: string; namaLengkap: string; email: string } | null
  methodLabel: string
  amount: number
  status: string
  senderName: string
  transferDate: string
  reviewedBy: string | null
  reviewedAt: string | null
  rejectionReason: string
  deletedAt: string | null
  createdAt: string
}

const PAY_STATUS_LABEL: Record<string, string> = {
  menunggu_verifikasi: 'Menunggu Verifikasi',
  disetujui: 'Disetujui',
  ditolak: 'Ditolak',
}

export function RiwayatTransaksiContent() {
  const [rows, setRows] = useState<TxRow[] | null>(null)
  const [view, setView] = useState<'riwayat' | 'sampah'>('riwayat')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [planId, setPlanId] = useState('semua')
  const [status, setStatus] = useState('semua')
  const [method, setMethod] = useState('semua')
  const [plans, setPlans] = useState<{ id: string; name: string }[]>([])
  const [deleteTarget, setDeleteTarget] = useState<TxRow | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [purgeTarget, setPurgeTarget] = useState<TxRow | null>(null)
  const [purgeBusy, setPurgeBusy] = useState(false)
  const [restoreBusyId, setRestoreBusyId] = useState<string | null>(null)

  const query = useCallback(() => {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (planId && planId !== 'semua') params.set('planId', planId)
    if (status && status !== 'semua') params.set('status', status)
    if (method && method !== 'semua') params.set('method', method)
    if (view === 'sampah') params.set('trash', '1')
    return params.toString()
  }, [from, to, planId, status, method, view])

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setRows(null) // silent = segarkan tanpa kedip skeleton
    try {
      const res = await authFetch(`/api/panel-admin/transactions?${query()}`)
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Gagal memuat riwayat')
        setRows([])
        return
      }
      setRows(json.transactions ?? [])
    } catch {
      toast.error('Gagal terhubung ke server')
      setRows([])
    }
  }, [query])

  useEffect(() => {
    load()
  }, [load])

  // Data masuk real-time: transaksi baru/hapus tampil otomatis
  const { lastUpdated } = useLiveData({ load, intervalMs: 12000 })

  useEffect(() => {
    const loadPlans = async () => {
      try {
        const res = await authFetch('/api/panel-admin/plans')
        if (res.ok) {
          const json = await res.json()
          setPlans((json.plans ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })))
        }
      } catch { /* abaikan */ }
    }
    loadPlans()
  }, [])

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleteBusy(true)
    try {
      const res = await authFetch(`/api/panel-admin/transactions/${deleteTarget.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        if (json.idempotent) toast.info(json.error)
        else toast.error(json.error || 'Gagal menghapus transaksi')
        return
      }
      toast.success(json.message || 'Transaksi dipindahkan ke Sampah')
      setDeleteTarget(null)
      await load()
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setDeleteBusy(false)
    }
  }

  // Hapus permanen dari tab Sampah — record benar-benar dihapus dari database (tak bisa dipulihkan)
  const confirmPurge = async () => {
    if (!purgeTarget) return
    setPurgeBusy(true)
    try {
      const res = await authFetch(`/api/panel-admin/transactions/${purgeTarget.id}?permanent=1`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        if (json.idempotent) toast.info(json.error)
        else toast.error(json.error || 'Gagal menghapus permanen transaksi')
        return
      }
      toast.success(json.message || 'Transaksi dihapus permanen')
      setPurgeTarget(null)
      await load()
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setPurgeBusy(false)
    }
  }

  const restore = async (r: TxRow) => {
    setRestoreBusyId(r.id)
    try {
      const res = await authFetch(`/api/panel-admin/transactions/${r.id}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        if (json.idempotent) toast.info(json.error)
        else toast.error(json.error || 'Gagal memulihkan transaksi')
        return
      }
      toast.success(json.message || 'Transaksi dipulihkan ke riwayat')
      await load()
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setRestoreBusyId(null)
    }
  }

  const exportCsv = () => {
    const headers = getAuthHeaders()
    const qs = new URLSearchParams(query())
    qs.set('export', 'csv')
    // gunakan fetch + blob agar header auth ikut
    fetch(`/api/panel-admin/transactions?${qs.toString()}`, { headers, cache: 'no-store' })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `riwayat-transaksi-langganan-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
        toast.success('CSV diunduh')
      })
      .catch(() => toast.error('Gagal mengunduh CSV'))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Riwayat Transaksi</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {view === 'riwayat'
              ? 'Semua pembayaran langganan — filter tanggal, paket, status, metode; ekspor CSV.'
              : 'Transaksi yang dihapus — tidak tampil di riwayat, verifikasi, dan data pelanggan; bisa dipulihkan atau dihapus permanen.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => load()} className="gap-1.5">
            <RefreshCcw className="h-3.5 w-3.5" /> Muat Ulang
          </Button>
          <LiveIndicator lastUpdated={lastUpdated} className="self-center" />
          {view === 'riwayat' && (
            <Button size="sm" onClick={exportCsv} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
              <Download className="h-3.5 w-3.5" /> Ekspor CSV
            </Button>
          )}
        </div>
      </div>

      {/* Tab: Riwayat | Sampah */}
      <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="riwayat" className="gap-1.5">
            <History className="h-3.5 w-3.5" /> Riwayat
          </TabsTrigger>
          <TabsTrigger value="sampah" className="gap-1.5">
            <Trash2 className="h-3.5 w-3.5" /> Sampah
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filter */}
      <Card className="rounded-2xl">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label>Dari Tanggal</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Sampai Tanggal</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Paket</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger><SelectValue placeholder="Semua paket" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="semua">Semua Paket</SelectItem>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="Semua status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="semua">Semua Status</SelectItem>
                <SelectItem value="menunggu_verifikasi">Menunggu Verifikasi</SelectItem>
                <SelectItem value="disetujui">Disetujui</SelectItem>
                <SelectItem value="ditolak">Ditolak</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Metode</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue placeholder="Semua metode" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="semua">Semua Metode</SelectItem>
                <SelectItem value="qris">QRIS</SelectItem>
                <SelectItem value="transfer_bank">Transfer Bank</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {rows === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            {view === 'sampah' ? (
              <Trash2 className="h-10 w-10 text-muted-foreground/50" />
            ) : (
              <History className="h-10 w-10 text-muted-foreground/50" />
            )}
            <p className="text-sm text-muted-foreground">
              {view === 'sampah' ? 'Sampah kosong — belum ada transaksi yang dihapus.' : 'Tidak ada transaksi pada filter ini.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl">
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Tagihan</th>
                  <th className="px-4 py-3">Pelanggan</th>
                  <th className="px-4 py-3">Paket</th>
                  <th className="px-4 py-3">Metode</th>
                  <th className="px-4 py-3">Nominal</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Waktu</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-mono text-xs">{r.invoiceNumber}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.customer?.namaLengkap ?? r.reviewedBy ?? '-'}</div>
                      <div className="text-xs text-muted-foreground">{r.customer?.username ? `@${r.customer.username}` : ''}</div>
                    </td>
                    <td className="px-4 py-3">{r.planName}</td>
                    <td className="px-4 py-3 text-xs">{r.methodLabel}</td>
                    <td className="px-4 py-3 font-semibold">{rupiah(r.amount)}</td>
                    <td className="px-4 py-3">
                      <Badge
                        className={
                          r.status === 'disetujui'
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300'
                            : r.status === 'ditolak'
                              ? 'bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-300'
                              : 'bg-sky-100 text-sky-800 hover:bg-sky-100 dark:bg-sky-900/40 dark:text-sky-300'
                        }
                      >
                        {PAY_STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                      {r.status === 'ditolak' && r.rejectionReason && (
                        <div className="mt-1 max-w-48 text-[10px] text-red-600">{r.rejectionReason}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div>Diajukan {fmtDateTime(r.createdAt)}</div>
                      {view === 'sampah' ? (
                        <div className="text-red-600">Dihapus {fmtDateTime(r.deletedAt)}</div>
                      ) : (
                        r.reviewedAt && <div className="text-muted-foreground">Diverifikasi {fmtDateTime(r.reviewedAt)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        {view === 'riwayat' ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
                            aria-label={`Hapus transaksi ${r.invoiceNumber}`}
                            title="Hapus — pindahkan ke Sampah"
                            onClick={() => setDeleteTarget(r)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              disabled={restoreBusyId === r.id}
                              onClick={() => restore(r)}
                            >
                              <ArchiveRestore className="h-3.5 w-3.5" /> Pulihkan
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
                              aria-label={`Hapus permanen transaksi ${r.invoiceNumber}`}
                              title="Hapus permanen — tidak bisa dipulihkan lagi"
                              onClick={() => setPurgeTarget(r)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Dialog konfirmasi hapus permanen (dari tab Sampah) */}
      <Dialog open={!!purgeTarget} onOpenChange={(v) => !v && setPurgeTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" /> Hapus Permanen?
            </DialogTitle>
            <DialogDescription>
              {purgeTarget?.invoiceNumber} · {purgeTarget?.customer?.namaLengkap ?? '-'} · {rupiah(purgeTarget?.amount ?? 0)}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
            Transaksi akan dihapus <b>permanen</b> dari database dan <b>tidak bisa dipulihkan</b> lagi.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurgeTarget(null)}>Batal</Button>
            <Button variant="destructive" onClick={confirmPurge} disabled={purgeBusy} className="gap-1.5">
              {purgeBusy && <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
              <Trash2 className="h-4 w-4" /> Hapus Permanen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog konfirmasi hapus */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" /> Hapus Transaksi?
            </DialogTitle>
            <DialogDescription>
              {deleteTarget?.invoiceNumber} · {deleteTarget?.customer?.namaLengkap ?? '-'} · {rupiah(deleteTarget?.amount ?? 0)}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
            Transaksi dipindahkan ke tab <b>Sampah</b> — tidak lagi tampil di riwayat, halaman verifikasi,
            statistik, dan tampilan pelanggan. Bisa <b>dipulihkan</b> kapan saja dari tab Sampah.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Batal</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteBusy} className="gap-1.5">
              {deleteBusy && <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
              <Trash2 className="h-4 w-4" /> Ya, Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * Halaman lama (rute direct) — kini diarahkan ke hub.
 * Konten dipakai ulang di hub terkait (mis. /panel-admin/pelanggan).
 */
export default function RiwayatTransaksiPage() {
  return <RiwayatTransaksiContent />
}
