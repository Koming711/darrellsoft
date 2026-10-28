'use client'

// /panel-admin/kelola-pelanggan — halaman PENGGUNA panel admin.
// Desain mengikuti workspace referensi (gomesin admin.tsx › PenggunaTab):
// judul "{n} pengguna terdaftar", MOBILE = daftar kartu ringkas (nama + HP,
// klik → popup detail), DESKTOP = tabel (avatar inisial, email, HP, perusahaan,
// role, tanggal bergabung, aksi hapus), popup detail pengguna, konfirmasi hapus.
// Tab filter status (permintaan user): Semua · Aktif · Perlu Verifikasi ·
// Akan Berakhir · Expired · Belum Aktif — difilter di klien (API sudah
// mengirim status TURUNAN + hasPendingPayment, tanpa refetch per tab).
// Aksi langganan (Aktifkan / Tangguhkan / Aktifkan Kembali) tetap ada —
// dipindah ke dalam popup detail agar daftar tetap bersih seperti referensi.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Ban,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Mail,
  Phone,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  XCircle,
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

/** Inisial avatar — 2 kata pertama (pola referensi PenggunaTab). */
const initials = (name: string) =>
  (name || '?')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

// ===== TAB FILTER STATUS (permintaan user) =====
// 'perlu_verifikasi' = punya pembayaran menunggu verifikasi (hasPendingPayment);
// selain itu = status turunan langganan — API sudah menghitungnya
// (subscription.status = derivedSubscriptionStatus, label sama dgn STATUS_META).
type StatusFilterKey = 'semua' | 'aktif' | 'perlu_verifikasi' | 'akan_berakhir' | 'kedaluwarsa' | 'belum_aktif'

const STATUS_FILTERS: { key: StatusFilterKey; label: string }[] = [
  { key: 'semua', label: 'Semua' },
  { key: 'aktif', label: 'Aktif' },
  { key: 'perlu_verifikasi', label: 'Perlu Verifikasi' },
  { key: 'akan_berakhir', label: 'Akan Berakhir' },
  { key: 'kedaluwarsa', label: 'Expired' },
  { key: 'belum_aktif', label: 'Belum Aktif' },
]

function matchesStatusFilter(r: Row, f: StatusFilterKey): boolean {
  if (f === 'semua') return true
  if (f === 'perlu_verifikasi') return r.hasPendingPayment
  return (r.subscription?.status ?? 'belum_aktif') === f
}

export function KelolaPelangganContent() {
  const [rows, setRows] = useState<Row[] | null>(null)
  // Tab status aktif (default: Semua)
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('semua')
  const [previewUser, setPreviewUser] = useState<Row | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  // Dialog tangguhkan
  const [suspendTarget, setSuspendTarget] = useState<Row | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [busy, setBusy] = useState(false)

  // Dialog aktivasi
  const [activateTarget, setActivateTarget] = useState<Row | null>(null)
  const [plans, setPlans] = useState<PlanOption[] | null>(null)
  const [planId, setPlanId] = useState('')
  const [durationDays, setDurationDays] = useState('30')
  const [activateNotes, setActivateNotes] = useState('')
  const [activateBusy, setActivateBusy] = useState(false)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setRows(null) // silent = segarkan tanpa kedip skeleton
    try {
      const res = await authFetch('/api/panel-admin/subscriptions')
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Gagal memuat pengguna')
        setRows([])
        return
      }
      setRows(json.subscriptions ?? [])
    } catch {
      toast.error('Gagal terhubung ke server')
      setRows([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Data masuk real-time: pengguna & status langganan baru tampil otomatis
  const { lastUpdated } = useLiveData({ load, intervalMs: 12000 })

  // Filter tab status di klien — ganti tab instan tanpa refetch;
  // polling live 12s tetap menyegarkan hitungan & isi tab otomatis
  const filteredRows = useMemo(
    () => (rows ?? []).filter((r) => matchesStatusFilter(r, statusFilter)),
    [rows, statusFilter],
  )
  const filterTabs = useMemo(
    () =>
      STATUS_FILTERS.map((t) => ({
        ...t,
        count: (rows ?? []).filter((r) => matchesStatusFilter(r, t.key)).length,
      })),
    [rows],
  )
  const activeFilterLabel = STATUS_FILTERS.find((t) => t.key === statusFilter)?.label ?? 'Semua'

  const isAdminRow = (r: Row) => r.role === 'admin' || r.role === 'superadmin'
  const subStatusOf = (r: Row) => r.subscription?.status ?? 'belum_aktif'

  // ---- HAPUS pengguna permanen (pola referensi: AlertDialog konfirmasi) ----
  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleteBusy(true)
    try {
      const res = await authFetch(`/api/panel-admin/subscriptions/customers/${deleteTarget.userId}`, {
        method: 'DELETE',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Gagal menghapus pengguna')
        return
      }
      toast.success(`Pengguna ${deleteTarget.namaLengkap || deleteTarget.username} dihapus`)
      setDeleteTarget(null)
      setPreviewUser(null)
      await load()
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setDeleteBusy(false)
    }
  }

  // ---- TANGGUHKAN (wajib alasan — catatan audit) ----
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
      setPreviewUser(null)
      await load()
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setBusy(false)
    }
  }

  // ---- AKTIFKAN KEMBALI (dari ditangguhkan) ----
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
      setPreviewUser(null)
      await load()
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setBusy(false)
    }
  }

  // ---- AKTIFKAN (akun belum aktif: pilih paket + durasi) ----
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
      setPreviewUser(null)
      await load()
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setActivateBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Kelola Pengguna</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Klik pengguna untuk melihat detail lengkap, langganan, dan aksi.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()} className="gap-1.5">
          <RefreshCcw className="h-3.5 w-3.5" /> Muat Ulang
        </Button>
        <LiveIndicator lastUpdated={lastUpdated} className="self-center" />
      </div>

      {rows === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-base font-bold">
            {statusFilter === 'semua'
              ? `${rows.length} pengguna terdaftar`
              : `${filteredRows.length} pengguna — ${activeFilterLabel}`}
          </h2>

          {/* Tab status (permintaan user) — pill + hitungan per status */}
          <div role="tablist" aria-label="Filter status pengguna" className="flex flex-wrap items-center gap-2">
            {filterTabs.map((t) => {
              const active = statusFilter === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStatusFilter(t.key)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                    active
                      ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                      : 'border-border bg-card text-muted-foreground hover:bg-accent/40 hover:text-foreground',
                  )}
                >
                  {t.label}
                  <span
                    className={cn(
                      'min-w-5 rounded-full px-1.5 text-center text-[10px] font-bold leading-4',
                      active ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {t.count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* ===== MOBILE: daftar kartu — hanya nama + HP, klik utk detail (pola referensi) ===== */}
          <div className="space-y-2 sm:hidden">
            {filteredRows.map((u) => (
              <div
                key={u.userId}
                onClick={() => setPreviewUser(u)}
                className="cursor-pointer rounded-xl border border-border bg-card p-3 transition hover:bg-accent/30 active:bg-accent/50"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{u.namaLengkap || u.username}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="size-3 shrink-0" /> {u.nomorHP || '-'}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </div>
              </div>
            ))}
            {filteredRows.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {statusFilter === 'semua'
                  ? 'Belum ada pengguna terdaftar.'
                  : `Tidak ada pengguna berstatus "${activeFilterLabel}".`}
              </p>
            )}
          </div>

          {/* ===== DESKTOP: tabel (pola referensi PenggunaTab) ===== */}
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card sm:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50 text-left text-xs font-semibold text-muted-foreground">
                  <th className="p-2">Nama</th>
                  <th className="p-2">Email</th>
                  <th className="p-2">No. HP</th>
                  <th className="p-2">Perusahaan</th>
                  <th className="p-2">Role</th>
                  <th className="p-2">Bergabung</th>
                  <th className="p-2 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((u) => (
                  <tr
                    key={u.userId}
                    onClick={() => setPreviewUser(u)}
                    className="cursor-pointer border-b border-border hover:bg-accent/30"
                  >
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {initials(u.namaLengkap || u.username)}
                        </span>
                        <span className="text-xs font-medium">{u.namaLengkap || u.username}</span>
                      </div>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{u.email || '-'}</td>
                    <td className="p-2 text-xs">{u.nomorHP || '-'}</td>
                    <td className="p-2 text-xs">{u.companyName || '-'}</td>
                    <td className="p-2">
                      <Badge className={isAdminRow(u) ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-muted text-muted-foreground'}>
                        {u.role}
                      </Badge>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{fmtDate(u.registeredAt)}</td>
                    <td className="p-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-center">
                        <button
                          onClick={() => !isAdminRow(u) && setDeleteTarget(u)}
                          disabled={isAdminRow(u) || deleteBusy}
                          className={cn(
                            'grid size-7 place-items-center rounded transition',
                            isAdminRow(u)
                              ? 'cursor-not-allowed bg-muted text-muted-foreground/40'
                              : 'bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/70',
                          )}
                          title={isAdminRow(u) ? 'Akun admin tidak dapat dihapus' : 'Hapus pengguna'}
                          aria-label={`Hapus pengguna ${u.namaLengkap || u.username}`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredRows.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {statusFilter === 'semua'
                  ? 'Belum ada pengguna terdaftar.'
                  : `Tidak ada pengguna berstatus "${activeFilterLabel}".`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ===== POPUP DETAIL PENGGUNA (pola referensi: overlay manual z-[60]) ===== */}
      {previewUser && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPreviewUser(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Detail pengguna ${previewUser.namaLengkap || previewUser.username}`}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* header */}
            <div className="flex items-center justify-between border-b border-border p-4">
              <h3 className="text-base font-bold">Detail Pengguna</h3>
              <button
                onClick={() => setPreviewUser(null)}
                className="grid size-8 place-items-center rounded-lg hover:bg-accent"
                aria-label="Tutup detail pengguna"
              >
                <XCircle className="size-5" />
              </button>
            </div>

            {/* content */}
            <div className="space-y-4 p-4">
              {/* avatar + nama + role */}
              <div className="flex items-center gap-3">
                <span className="grid size-16 shrink-0 place-items-center rounded-full bg-primary/10 text-xl font-bold text-primary">
                  {initials(previewUser.namaLengkap || previewUser.username)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold">{previewUser.namaLengkap || previewUser.username}</p>
                  <Badge
                    className={
                      isAdminRow(previewUser)
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                        : 'bg-muted text-muted-foreground'
                    }
                  >
                    {previewUser.role}
                  </Badge>
                </div>
              </div>

              {/* data lengkap */}
              <div className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground"><Mail className="size-3.5" /> Email</span>
                  <span className="truncate font-medium">{previewUser.email || '-'}</span>
                </div>
                <Separator className="bg-border" />
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground"><Phone className="size-3.5" /> No. HP</span>
                  <span className="font-medium">{previewUser.nomorHP || '-'}</span>
                </div>
                <Separator className="bg-border" />
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground"><Building2 className="size-3.5" /> Perusahaan</span>
                  <span className="truncate font-medium">{previewUser.companyName || '-'}</span>
                </div>
                <Separator className="bg-border" />
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground"><Calendar className="size-3.5" /> Bergabung</span>
                  <span className="font-medium">{fmtDate(previewUser.registeredAt)}</span>
                </div>
                <Separator className="bg-border" />
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground"><ShieldCheck className="size-3.5" /> Role</span>
                  <Badge
                    className={
                      isAdminRow(previewUser)
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                        : 'bg-muted text-muted-foreground'
                    }
                  >
                    {previewUser.role}
                  </Badge>
                </div>
              </div>

              {/* langganan — konteks khusus aplikasi ini (status turunan real dari DB) */}
              {(() => {
                const st = subStatusOf(previewUser)
                const meta = STATUS_META[st] ?? STATUS_META.belum_aktif
                return (
                  <div className="space-y-2 rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">Paket</span>
                      <span className="font-medium">{previewUser.subscription?.planName ?? '-'}</span>
                    </div>
                    <Separator className="bg-border" />
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">Status langganan</span>
                      <Badge className={meta.className}>{meta.label}</Badge>
                    </div>
                    {previewUser.subscription?.endDate && (
                      <>
                        <Separator className="bg-border" />
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-muted-foreground">Berlaku s/d</span>
                          <span className="font-medium">{fmtDate(previewUser.subscription.endDate)}</span>
                        </div>
                      </>
                    )}
                    {st === 'ditangguhkan' && previewUser.subscription?.suspendReason && (
                      <>
                        <Separator className="bg-border" />
                        <p className="text-xs text-orange-600">Alasan: {previewUser.subscription.suspendReason}</p>
                      </>
                    )}
                  </div>
                )
              })()}

              {/* aksi langganan */}
              {(() => {
                const st = subStatusOf(previewUser)
                if (st === 'belum_aktif') {
                  return (
                    <Button
                      className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => {
                        setPreviewUser(null)
                        openActivate(previewUser)
                      }}
                    >
                      <CheckCircle2 className="size-4" /> Aktifkan Langganan
                    </Button>
                  )
                }
                if (st === 'ditangguhkan') {
                  return (
                    <Button
                      className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
                      disabled={busy}
                      onClick={() => unsuspend(previewUser)}
                    >
                      {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                      Aktifkan Kembali
                    </Button>
                  )
                }
                return (
                  <Button
                    variant="outline"
                    className="w-full gap-2 border-orange-200 text-orange-600 hover:bg-orange-50 hover:text-orange-700 dark:border-orange-900/60 dark:text-orange-400 dark:hover:bg-orange-950/40"
                    onClick={() => {
                      setPreviewUser(null)
                      setSuspendTarget(previewUser)
                      setSuspendReason('')
                    }}
                  >
                    <Ban className="size-4" /> Tangguhkan Langganan
                  </Button>
                )
              })()}

              {/* aksi hapus / catatan admin */}
              {!isAdminRow(previewUser) ? (
                <Button
                  variant="destructive"
                  className="w-full gap-2"
                  onClick={() => {
                    setPreviewUser(null)
                    setDeleteTarget(previewUser)
                  }}
                  disabled={deleteBusy}
                >
                  <Trash2 className="size-4" /> Hapus Pengguna
                </Button>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                  <ShieldCheck className="mx-auto mb-1 size-5" />
                  Akun admin tidak dapat dihapus.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Konfirmasi hapus (pola referensi: AlertDialog) */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Pengguna?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `${deleteTarget.namaLengkap || deleteTarget.username} (${deleteTarget.email || 'tanpa email'}) beserta seluruh data langganannya (paket, tagihan, riwayat pembayaran) akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteBusy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {deleteBusy ? 'Menghapus…' : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* Dialog tangguhkan */}
      <Dialog open={!!suspendTarget} onOpenChange={(v) => !v && setSuspendTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Ban className="h-5 w-5 text-red-500" /> Tangguhkan Langganan</DialogTitle>
            <DialogDescription>
              {suspendTarget?.namaLengkap || suspendTarget?.username} — akses akun langsung terkunci.
              Data pengguna tidak dihapus.
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
