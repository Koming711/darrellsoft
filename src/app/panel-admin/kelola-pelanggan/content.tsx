'use client'

// /panel-admin/kelola-pelanggan — kelola akun & langganan pelanggan.
// Pencarian (nama/email/username/HP/perusahaan) + tab status akun baru:
// Semua · Perlu Verifikasi · Aktif · Akan Berakhir · Expired · Ditolak · Ditangguhkan · Belum Aktif.
// Aksi: Aktifkan (pilih paket + masa berlaku — untuk akun belum aktif), Tangguhkan (wajib alasan —
// catatan audit) & Aktifkan Kembali & Hapus pelanggan (permanen).

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { authFetch } from '@/lib/auth-fetch'
import { useLiveData } from '@/hooks/use-live-data'
import { LiveIndicator } from '../live-indicator'
import { toast } from 'sonner'
import {
  Ban,
  Building2,
  CheckCircle2,
  Loader2,
  Mail,
  Phone,
  RefreshCcw,
  Search,
  ShieldAlert,
  Trash2,
  UserCog,
} from 'lucide-react'

const rupiah = (n: number) => `Rp ${Math.round(n ?? 0).toLocaleString('id-ID')}`
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'

const STATUS_META: Record<string, { label: string; className: string }> = {
  belum_aktif: { label: 'Belum Aktif', className: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  aktif: { label: 'Aktif', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  akan_berakhir: { label: 'Akan Berakhir', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  kedaluwarsa: { label: 'Expired', className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  ditangguhkan: { label: 'Ditangguhkan', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
  dibatalkan: { label: 'Dibatalkan', className: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
}

const INV_META: Record<string, { label: string; className: string }> = {
  menunggu_pembayaran: { label: 'Belum Bayar', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  menunggu_verifikasi: { label: 'Nunggu Verifikasi', className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300' },
  disetujui: { label: 'Disetujui', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  ditolak: { label: 'Ditolak', className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  kedaluwarsa: { label: 'Kedaluwarsa', className: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
}

interface PlanOption {
  id: string
  name: string
  monthlyPrice: number
  durationDays: number
  isActive: boolean
}

interface Row {
  userId: string
  username: string
  namaLengkap: string
  email: string
  nomorHP: string
  role: string
  companyName: string
  registeredAt: string
  subscription: {
    id: string
    planName: string
    status: string
    startDate: string | null
    endDate: string | null
    suspendReason: string
  } | null
  openInvoices: { id: string; invoiceNumber: string; planName: string; amount: number; status: string; dueDate: string }[]
  hasPendingPayment: boolean
}

const TABS = [
  { key: 'semua', label: 'Semua' },
  { key: 'perlu_verifikasi', label: 'Perlu Verifikasi' },
  { key: 'aktif', label: 'Aktif' },
  { key: 'akan_berakhir', label: 'Akan Berakhir' },
  { key: 'kedaluwarsa', label: 'Expired' },
  { key: 'ditolak', label: 'Ditolak' },
  { key: 'ditangguhkan', label: 'Ditangguhkan' },
  { key: 'belum_aktif', label: 'Belum Aktif' },
]

export function KelolaPelangganContent() {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('semua')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [suspendTarget, setSuspendTarget] = useState<Row | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [activateTarget, setActivateTarget] = useState<Row | null>(null)
  const [plans, setPlans] = useState<PlanOption[] | null>(null)
  const [planId, setPlanId] = useState('')
  const [durationDays, setDurationDays] = useState('30')
  const [activateNotes, setActivateNotes] = useState('')
  const [activateBusy, setActivateBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setRows(null) // silent = segarkan tanpa kedip skeleton
    try {
      const q = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''
      const res = await authFetch(`/api/panel-admin/subscriptions${q}`)
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Gagal memuat pelanggan')
        setRows([])
        return
      }
      setRows(json.subscriptions ?? [])
    } catch {
      toast.error('Gagal terhubung ke server')
      setRows([])
    }
  }, [search])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load, tab])

  // Data masuk real-time: pelanggan & status langganan baru tampil otomatis
  const { lastUpdated } = useLiveData({ load, intervalMs: 12000 })

  const filtered = (rows ?? []).filter((r) => {
    if (tab === 'semua') return true
    if (tab === 'perlu_verifikasi') return r.hasPendingPayment
    if (tab === 'ditolak') return r.openInvoices.some((i) => i.status === 'ditolak')
    return r.subscription?.status === tab || (!r.subscription && tab === 'belum_aktif')
  })

  const suspend = async () => {
    if (!suspendTarget) return
    if (!suspendReason.trim()) {
      toast.error('Alasan penangguhan wajib diisi (catatan audit)')
      return
    }
    setBusy(true)
    try {
      const res = await authFetch('/api/panel-admin/subscriptions/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: suspendTarget.userId, action: 'suspend', notes: suspendReason.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Gagal menangguhkan')
        return
      }
      toast.success('Langganan ditangguhkan — akses akun terkunci')
      setSuspendTarget(null)
      setSuspendReason('')
      await load()
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setBusy(false)
    }
  }

  // Buka dialog aktivasi — muat daftar paket (cache sekali) + isi default durasi sesuai paket terpilih
  const openActivate = async (r: Row) => {
    setActivateTarget(r)
    setActivateNotes('')
    try {
      const res = await authFetch('/api/panel-admin/plans')
      const json = await res.json()
      const list: PlanOption[] = (json?.plans ?? []).filter((p: PlanOption) => p.isActive !== false)
      setPlans(list)
      const current = list.find((p) => p.id === planId) ?? list[0]
      if (current) {
        setPlanId(current.id)
        setDurationDays(String(current.durationDays ?? 30))
      }
    } catch {
      setPlans([])
    }
  }

  // Ganti paket di dialog → ikutkan durasi default paket (admin masih bisa mengubah)
  const selectPlan = (id: string) => {
    setPlanId(id)
    const p = plans?.find((x) => x.id === id)
    if (p?.durationDays) setDurationDays(String(p.durationDays))
  }

  const activate = async () => {
    if (!activateTarget) return
    const dur = Number(durationDays)
    if (!Number.isFinite(dur) || dur <= 0) {
      toast.error('Masa berlaku (hari) harus angka lebih dari 0')
      return
    }
    setActivateBusy(true)
    try {
      const res = await authFetch('/api/panel-admin/subscriptions/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: activateTarget.userId,
          action: 'activate',
          planId: planId || undefined,
          durationDays: Math.floor(dur),
          notes: activateNotes.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Gagal mengaktifkan akun')
        return
      }
      toast.success(json.message || 'Langganan diaktifkan')
      setActivateTarget(null)
      await load()
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setActivateBusy(false)
    }
  }

  const unsuspend = async (r: Row) => {
    setBusy(true)
    try {
      const res = await authFetch('/api/panel-admin/subscriptions/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: r.userId, action: 'unsuspend', notes: '' }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Gagal mengaktifkan kembali')
        return
      }
      toast.success('Langganan diaktifkan kembali')
      await load()
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setBusy(false)
    }
  }

  // Hapus pelanggan permanen — memakai DELETE /api/panel-admin/subscriptions/customers/[id]
  // (server: hapus akun + data langganan terkait, tolak akun sendiri/superadmin, catat audit log)
  const deleteCustomer = async () => {
    if (!deleteTarget) return
    setDeleteBusy(true)
    try {
      const res = await authFetch(`/api/panel-admin/subscriptions/customers/${deleteTarget.userId}`, {
        method: 'DELETE',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Gagal menghapus pelanggan')
        return
      }
      toast.success(`Pelanggan @${deleteTarget.username || deleteTarget.namaLengkap} dihapus`)
      setDeleteTarget(null)
      await load()
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Kelola Pelanggan</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cari pelanggan, lihat paket & status langganan, tangguhkan / aktifkan / hapus akun dengan catatan audit.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()} className="gap-1.5">
          <RefreshCcw className="h-3.5 w-3.5" /> Muat Ulang
        </Button>
        <LiveIndicator lastUpdated={lastUpdated} className="self-center" />
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama, email, username, HP, perusahaan…"
          className="pl-9"
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex w-full flex-wrap justify-start gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="text-xs">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {rows === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <UserCog className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Tidak ada pelanggan pada filter ini.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const subStatus = r.subscription?.status ?? 'belum_aktif'
            const meta = STATUS_META[subStatus] ?? STATUS_META.belum_aktif
            return (
              <Card key={r.userId} className="rounded-2xl">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold">{r.namaLengkap || r.username}</span>
                        {r.username && <span className="text-xs text-muted-foreground">@{r.username}</span>}
                        <Badge className={meta.className}>{meta.label}</Badge>
                        {r.hasPendingPayment && (
                          <Badge className="gap-1 bg-sky-100 text-sky-800 hover:bg-sky-100 dark:bg-sky-900/40 dark:text-sky-300">
                            <ShieldAlert className="h-3 w-3" /> Perlu Verifikasi
                          </Badge>
                        )}
                        <Badge variant="outline">{r.role}</Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {r.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{r.email}</span>}
                        {r.nomorHP && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{r.nomorHP}</span>}
                        {r.companyName && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{r.companyName}</span>}
                      </div>
                      <div className="text-sm">
                        Paket: <b>{r.subscription?.planName ?? '-'}</b>
                        {r.subscription?.endDate && (
                          <span className="text-muted-foreground"> · berlaku s/d {fmtDate(r.subscription.endDate)}</span>
                        )}
                        {subStatus === 'ditangguhkan' && r.subscription?.suspendReason && (
                          <span className="block text-xs text-orange-600">Alasan: {r.subscription.suspendReason}</span>
                        )}
                      </div>
                      {r.openInvoices.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {r.openInvoices.map((i) => {
                            const m = INV_META[i.status] ?? INV_META.menunggu_pembayaran
                            return (
                              <Link
                                key={i.id}
                                href="/panel-admin?tab=pembayaran&sub=verifikasi"
                                className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] hover:bg-muted"
                              >
                                <span className="font-mono">{i.invoiceNumber}</span>
                                <span>{rupiah(i.amount)}</span>
                                <Badge className={`px-1.5 py-0 text-[9px] ${m.className}`}>{m.label}</Badge>
                              </Link>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {subStatus === 'belum_aktif' && (
                        <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => openActivate(r)}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> Aktifkan
                        </Button>
                      )}
                      {(subStatus === 'aktif' || subStatus === 'akan_berakhir' || subStatus === 'kedaluwarsa') && (
                        <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => {
                          setSuspendTarget(r)
                          setSuspendReason('')
                        }}>
                          <Ban className="h-3.5 w-3.5" /> Tangguhkan
                        </Button>
                      )}
                      {subStatus === 'ditangguhkan' && (
                        <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => unsuspend(r)}>
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Aktifkan Kembali
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`Hapus pelanggan ${r.namaLengkap || r.username}`}
                        className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
                        onClick={() => setDeleteTarget(r)}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Hapus
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Dialog aktifkan langganan (akun belum aktif) */}
      <Dialog open={!!activateTarget} onOpenChange={(v) => !v && setActivateTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Aktifkan Langganan
            </DialogTitle>
            <DialogDescription>
              {activateTarget?.namaLengkap || activateTarget?.username} (@{activateTarget?.username}) — pilih paket dan
              masa berlaku. Akses akun langsung dibuka sampai masa berlaku berakhir + masa tenggang.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="paket-aktivasi">Paket</Label>
              <Select value={planId} onValueChange={selectPlan}>
                <SelectTrigger id="paket-aktivasi" aria-label="Pilih paket langganan">
                  <SelectValue placeholder={plans === null ? 'Memuat paket…' : 'Pilih paket'} />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {(plans ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {rupiah(p.monthlyPrice)}/bln ({p.durationDays} hari)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="durasi-aktivasi">Masa berlaku (hari)</Label>
              <Input
                id="durasi-aktivasi"
                type="number"
                min={1}
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                placeholder="30"
              />
              <p className="text-[11px] text-muted-foreground">Kosong/0 = ikut durasi paket. Contoh akun internal: 3650.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="catatan-aktivasi">Catatan (opsional — tercatat di audit log)</Label>
              <Textarea
                id="catatan-aktivasi"
                rows={2}
                value={activateNotes}
                onChange={(e) => setActivateNotes(e.target.value)}
                placeholder="Mis. aktivasi manual oleh admin"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivateTarget(null)}>Batal</Button>
            <Button onClick={activate} disabled={activateBusy || !planId} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
              {activateBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              <CheckCircle2 className="h-4 w-4" /> Aktifkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog hapus pelanggan */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" /> Hapus Pelanggan
            </DialogTitle>
            <DialogDescription>
              {deleteTarget?.namaLengkap || deleteTarget?.username} (@{deleteTarget?.username}) — akun beserta seluruh
              data langganannya (paket, tagihan, riwayat pembayaran) akan dihapus permanen. Tindakan ini tidak dapat
              dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Batal</Button>
            <Button variant="destructive" onClick={deleteCustomer} disabled={deleteBusy} className="gap-1.5">
              {deleteBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              <Trash2 className="h-4 w-4" /> Hapus Permanen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog tangguhkan */}
      <Dialog open={!!suspendTarget} onOpenChange={(v) => !v && setSuspendTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Ban className="h-5 w-5 text-red-500" /> Tangguhkan Langganan</DialogTitle>
            <DialogDescription>
              {suspendTarget?.namaLengkap || suspendTarget?.username} — akses akun langsung terkunci.
              Data pelanggan tidak dihapus.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            placeholder="Alasan penangguhan (wajib) — tercatat di audit log"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendTarget(null)}>Batal</Button>
            <Button variant="destructive" onClick={suspend} disabled={busy} className="gap-1.5">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              <Ban className="h-4 w-4" /> Tangguhkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
