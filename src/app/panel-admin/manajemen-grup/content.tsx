'use client'

// /panel-admin/manajemen-grup — Manajemen Grup (Super Admin).
// Pantau & kelola seluruh grup perusahaan hasil sistem langganan multi-akun:
// 4 kartu ringkasan, pencarian + pill filter status grup, tabel desktop /
// kartu mobile, dialog detail grup (Info · Anggota · Riwayat Pembayaran ·
// Aktivitas), serta aksi Nonaktifkan/Aktifkan via AlertDialog konfirmasi
// (catatan opsional → catatan audit).
// Data dimuat ulang otomatis tiap 12 detik (useLiveData) — detail grup yang
// sedang terbuka ikut disegarkan senyap tanpa menutup dialog.
// Semua request lewat panelFetch (auto-logout 401, pesan 403 sopan).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { panelFetch } from '../panel-fetch'
import { useLiveData } from '@/hooks/use-live-data'
import { LiveIndicator } from '../live-indicator'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Ban,
  Building2,
  CheckCircle2,
  Crown,
  Eye,
  Landmark,
  Loader2,
  QrCode,
  RefreshCcw,
  Search,
  ShieldAlert,
  Users,
} from 'lucide-react'

// ===== Helper format (pola halaman panel lain) =====
const rupiah = (n: number) => `Rp ${Math.round(n ?? 0).toLocaleString('id-ID')}`
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'
const fmtDateTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'

/** Inisial avatar — 2 kata pertama (pola halaman Pengguna). */
const initials = (name: string) =>
  (name || '?')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

// ===== Badge status langganan grup =====
const SUB_META: Record<string, { label: string; className: string }> = {
  aktif: {
    label: 'Aktif',
    className: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  akan_berakhir: {
    label: 'Akan Berakhir',
    className: 'bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300',
  },
  kedaluwarsa: {
    label: 'Kedaluwarsa',
    className: 'bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-300',
  },
  belum_aktif: {
    label: 'Belum Aktif',
    className: 'bg-slate-200 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300',
  },
  ditangguhkan: {
    label: 'Ditangguhkan',
    className:
      'border border-amber-500 bg-transparent text-amber-700 hover:bg-amber-50 dark:border-amber-400/60 dark:text-amber-300 dark:hover:bg-amber-950/30',
  },
  dibatalkan: {
    label: 'Dibatalkan',
    className: 'bg-slate-200 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300',
  },
}

const GROUP_STATUS_META: Record<string, { label: string; className: string }> = {
  aktif: {
    label: 'Aktif',
    className: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  dinonaktifkan: {
    label: 'Dinonaktifkan',
    className: 'bg-slate-200 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300',
  },
}

const PAY_STATUS_META: Record<string, { label: string; className: string }> = {
  menunggu_verifikasi: {
    label: 'Menunggu Verifikasi',
    className: 'bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300',
  },
  disetujui: {
    label: 'Disetujui',
    className: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  ditolak: {
    label: 'Ditolak',
    className: 'bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-300',
  },
}

/** Label aksi audit id-ID (fallback: action apa adanya). */
const AUDIT_LABEL: Record<string, string> = {
  group_created: 'Grup dibuat',
  group_renamed: 'Nama grup diubah',
  member_added: 'Anggota ditambahkan',
  member_updated: 'Data anggota diubah',
  member_status_changed: 'Status anggota diubah',
  member_permissions_updated: 'Hak akses diubah',
  member_password_reset: 'Kata sandi direset',
  member_removed: 'Anggota dikeluarkan',
  group_activated: 'Grup diaktifkan',
  group_deactivated: 'Grup dinonaktifkan',
  payment_approved: 'Pembayaran disetujui',
  payment_rejected: 'Pembayaran ditolak',
  subscription_activated: 'Langganan aktif',
}

// ===== Tipe sesuai kontrak API /api/panel-admin/groups =====
interface GroupRow {
  id: string
  kode: string
  nama: string
  status: 'aktif' | 'dinonaktifkan'
  maxAccounts: number
  used: number
  paket: { name: string; monthlyPrice: number } | null
  owner: { userId: string; nama: string; username: string } | null
  subscription: { status: string; endDate: string | null; daysLeft: number } | null
  createdAt: string
}

interface GroupsSummary {
  totalGrup: number
  grupAktif: number
  grupDinonaktifkan: number
  totalAkunTerpakai: number
}

interface MemberRow {
  id: string
  userId: string
  nama: string
  username: string
  role: 'owner' | 'staf'
  status: 'aktif' | 'nonaktif'
  joinedAt: string
}

interface GroupPaymentRow {
  id: string
  invoiceNumber: string
  planName: string
  amount: number
  paymentMethod: 'qris' | 'transfer_bank'
  status: 'menunggu_verifikasi' | 'disetujui' | 'ditolak'
  reviewedAt: string | null
  createdAt: string
}

interface AuditRow {
  id: string
  action: string
  notes: string | null
  performedBy: string
  createdAt: string
}

interface GroupDetail {
  grup: GroupRow
  members: MemberRow[]
  payments: GroupPaymentRow[]
  audit: AuditRow[]
}

// ===== Filter status grup (pola pill + count halaman Pengguna) =====
type StatusFilterKey = 'semua' | 'aktif' | 'dinonaktifkan'

const STATUS_FILTERS: { key: StatusFilterKey; label: string }[] = [
  { key: 'semua', label: 'Semua' },
  { key: 'aktif', label: 'Aktif' },
  { key: 'dinonaktifkan', label: 'Dinonaktifkan' },
]

/** Progress bar mini kuota akun — emerald; merah bila penuh. */
function QuotaBar({ used, max }: { used: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0
  const full = max > 0 && used >= max
  return (
    <div
      className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={used}
      aria-label={`Kuota akun: ${used} dari ${max} terpakai`}
    >
      <div
        className={cn('h-full rounded-full transition-all', full ? 'bg-red-500' : 'bg-emerald-500')}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function ManajemenGrupContent() {
  const [rows, setRows] = useState<GroupRow[] | null>(null)
  const [summary, setSummary] = useState<GroupsSummary | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('semua')
  const [loadError, setLoadError] = useState('')

  // Dialog detail grup
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<GroupDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Aksi Nonaktifkan / Aktifkan (AlertDialog + catatan opsional)
  const [actionTarget, setActionTarget] = useState<{ grup: GroupRow; action: 'aktifkan' | 'nonaktifkan' } | null>(null)
  const [actionNote, setActionNote] = useState('')
  const [actionBusy, setActionBusy] = useState(false)

  // Ref id detail yang terbuka — polling 12s memakai ini utk segarkan dialog senyap
  const detailIdRef = useRef<string | null>(null)
  useEffect(() => {
    detailIdRef.current = detailId
  }, [detailId])

  const loadDetail = useCallback(async (grupId: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setDetail(null)
      setDetailLoading(true)
    }
    const { data, authError, error } = await panelFetch<GroupDetail>(
      `/api/panel-admin/groups?grupId=${encodeURIComponent(grupId)}`,
    )
    if (authError) {
      if (!opts?.silent) setDetailLoading(false)
      return
    }
    if (!data) {
      if (!opts?.silent) {
        toast.error(error || 'Gagal memuat detail grup')
        setDetailLoading(false)
      }
      return
    }
    setDetail(data)
    setDetailLoading(false)
  }, [])

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) {
        setRows(null) // silent = segarkan tanpa kedip skeleton
        setLoadError('')
      }
      const { data, authError, error } = await panelFetch<{
        groups: GroupRow[]
        summary: GroupsSummary
      }>('/api/panel-admin/groups')
      if (authError) {
        if (!opts?.silent) {
          setLoadError(error || 'Akses ditolak. Hanya admin yang dapat membuka halaman ini.')
          setRows([])
        }
        return
      }
      if (!data) {
        if (!opts?.silent) {
          toast.error(error || 'Gagal memuat grup')
          setLoadError(error || 'Gagal memuat grup')
        }
        setRows([])
        return
      }
      setRows(data.groups ?? [])
      setSummary(data.summary ?? null)
      setLoadError('')
      // Dialog detail sedang terbuka → segarkan juga datanya (senyap)
      if (detailIdRef.current) void loadDetail(detailIdRef.current, { silent: true })
    },
    [loadDetail],
  )

  useEffect(() => {
    load()
  }, [load])

  // Data masuk real-time: grup baru & perubahan status tampil otomatis
  const { lastUpdated } = useLiveData({ load, intervalMs: 12000 })

  const openDetail = (g: GroupRow) => {
    setDetailId(g.id)
    setDetail(null)
    void loadDetail(g.id)
  }

  const closeDetail = () => {
    setDetailId(null)
    setDetail(null)
  }

  // ---- PATCH Nonaktifkan / Aktifkan grup ----
  const applyAction = async () => {
    if (!actionTarget) return
    setActionBusy(true)
    const { grup, action } = actionTarget
    const { data, authError, error } = await panelFetch<{ ok: boolean }>('/api/panel-admin/groups', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grupId: grup.id, action, catatan: actionNote.trim() || undefined }),
    })
    setActionBusy(false)
    if (authError) return
    if (!data) {
      toast.error(error || 'Gagal memperbarui status grup')
      return
    }
    toast.success(
      action === 'nonaktifkan'
        ? `Grup ${grup.nama} dinonaktifkan — tidak bisa dipakai seluruh anggotanya`
        : `Grup ${grup.nama} diaktifkan — anggota dapat memakai grup kembali`,
    )
    setActionTarget(null)
    setActionNote('')
    await load({ silent: true })
  }

  // Filter pencarian (nama grup / kode / nama owner) + pill status — di klien
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (rows ?? []).filter((g) => {
      if (statusFilter !== 'semua' && g.status !== statusFilter) return false
      if (!q) return true
      return (
        g.nama.toLowerCase().includes(q) ||
        g.kode.toLowerCase().includes(q) ||
        (g.owner?.nama ?? '').toLowerCase().includes(q) ||
        (g.owner?.username ?? '').toLowerCase().includes(q)
      )
    })
  }, [rows, statusFilter, search])

  const filterTabs = useMemo(
    () =>
      STATUS_FILTERS.map((t) => ({
        ...t,
        count: (rows ?? []).filter((g) => (t.key === 'semua' ? true : g.status === t.key)).length,
      })),
    [rows],
  )
  const activeFilterLabel = STATUS_FILTERS.find((t) => t.key === statusFilter)?.label ?? 'Semua'

  const summaryCards: { label: string; value: number; icon: typeof Building2; tone: string }[] = [
    {
      label: 'Total Grup',
      value: summary?.totalGrup ?? 0,
      icon: Building2,
      tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    },
    {
      label: 'Grup Aktif',
      value: summary?.grupAktif ?? 0,
      icon: CheckCircle2,
      tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    },
    {
      label: 'Grup Dinonaktifkan',
      value: summary?.grupDinonaktifkan ?? 0,
      icon: Ban,
      tone: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    },
    {
      label: 'Total Akun Terpakai',
      value: summary?.totalAkunTerpakai ?? 0,
      icon: Users,
      tone: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    },
  ]

  const renderOwnerLine = (g: GroupRow) =>
    g.owner ? `Owner: ${g.owner.nama} (@${g.owner.username})` : 'Owner: -'

  return (
    <div className="space-y-6">
      {/* ===== Header (pola heading panel lain) ===== */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Manajemen Grup</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pantau seluruh grup perusahaan &amp; penggunaan kuota akun.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()} className="gap-1.5">
          <RefreshCcw className="h-3.5 w-3.5" /> Muat Ulang
        </Button>
        <LiveIndicator lastUpdated={lastUpdated} className="self-center" />
      </div>

      {rows === null ? (
        <>
          {/* Skeleton ringkasan + baris tabel */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[76px] rounded-2xl" />
            ))}
          </div>
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        </>
      ) : loadError ? (
        <Card className="rounded-2xl border-red-200 dark:border-red-900/60">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <ShieldAlert className="h-8 w-8 text-red-500" />
            <p className="text-sm font-semibold text-red-600">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => load()} className="gap-1.5">
              <RefreshCcw className="h-3.5 w-3.5" /> Coba Lagi
            </Button>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground/50" />
            <p className="max-w-md text-sm text-muted-foreground">
              Belum ada grup. Grup perusahaan dibuat otomatis saat pembayaran paket multi-akun
              (mis. paket 3 Akun) diverifikasi.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <h2 className="text-base font-bold">
            {statusFilter === 'semua' && !search.trim()
              ? `${rows.length} grup terdaftar`
              : `${filteredRows.length} grup — ${activeFilterLabel}${search.trim() ? ' · pencarian' : ''}`}
          </h2>

          {/* ===== Toolbar: pencarian + pill filter status grup ===== */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama grup, kode, atau owner…"
                className="pl-9"
                aria-label="Cari grup berdasarkan nama, kode, atau owner"
              />
            </div>
            <div role="tablist" aria-label="Filter status grup" className="flex flex-wrap items-center gap-2">
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
          </div>

          {/* ===== MOBILE: kartu ringkas + aksi eksplisit (pola kelola-pelanggan) ===== */}
          <div className="space-y-3 sm:hidden">
            {filteredRows.map((g) => (
              <Card key={g.id} className="rounded-2xl">
                <CardContent className="space-y-2.5 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold">{g.kode}</span>
                    <Badge className={(GROUP_STATUS_META[g.status] ?? GROUP_STATUS_META.aktif).className}>
                      {(GROUP_STATUS_META[g.status] ?? GROUP_STATUS_META.aktif).label}
                    </Badge>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{g.nama}</p>
                    <p className="truncate text-xs text-muted-foreground">{renderOwnerLine(g)}</p>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Crown className="size-3 shrink-0 text-muted-foreground" />
                      {g.paket ? (
                        <span className="truncate">
                          <b>{g.paket.name}</b> · {rupiah(g.paket.monthlyPrice)}/bln
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Tanpa paket</span>
                      )}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      Akun <b className="text-foreground">{g.used}/{g.maxAccounts}</b>
                    </span>
                  </div>
                  <QuotaBar used={g.used} max={g.maxAccounts} />
                  {(() => {
                    const st = g.subscription?.status ?? 'belum_aktif'
                    const meta = SUB_META[st] ?? SUB_META.belum_aktif
                    return (
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={meta.className}>{meta.label}</Badge>
                        {g.subscription?.endDate && (
                          <span className="text-[11px] text-muted-foreground">
                            Berakhir {fmtDate(g.subscription.endDate)} ({g.subscription.daysLeft} hari)
                          </span>
                        )}
                      </div>
                    )
                  })()}
                  <Separator className="bg-border" />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openDetail(g)}>
                      <Eye className="h-3.5 w-3.5" /> Detail
                    </Button>
                    {g.status === 'aktif' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-red-200 bg-transparent text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
                        onClick={() => {
                          setActionTarget({ grup: g, action: 'nonaktifkan' })
                          setActionNote('')
                        }}
                      >
                        <Ban className="h-3.5 w-3.5" /> Nonaktifkan
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-emerald-600 bg-transparent text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-500/60 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                        onClick={() => {
                          setActionTarget({ grup: g, action: 'aktifkan' })
                          setActionNote('')
                        }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Aktifkan
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredRows.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Tidak ada grup yang cocok dengan filter/pencarian.
              </p>
            )}
          </div>

          {/* ===== DESKTOP: tabel ringkas (pola halaman Pengguna) ===== */}
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card sm:block">
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50 text-left text-xs font-semibold text-muted-foreground">
                  <th className="p-2">Kode</th>
                  <th className="p-2">Nama Grup</th>
                  <th className="p-2">Paket</th>
                  <th className="p-2">Akun</th>
                  <th className="p-2">Langganan</th>
                  <th className="p-2">Status Grup</th>
                  <th className="p-2 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((g) => {
                  const st = g.subscription?.status ?? 'belum_aktif'
                  const subMeta = SUB_META[st] ?? SUB_META.belum_aktif
                  const gsMeta = GROUP_STATUS_META[g.status] ?? GROUP_STATUS_META.aktif
                  return (
                    <tr key={g.id} className="border-b border-border align-top hover:bg-accent/30">
                      {/* Kode */}
                      <td className="p-2">
                        <span className="font-mono text-xs font-bold">{g.kode}</span>
                      </td>
                      {/* Nama Grup + owner */}
                      <td className="p-2">
                        <p className="max-w-[220px] truncate text-xs font-bold" title={g.nama}>
                          {g.nama}
                        </p>
                        <p className="max-w-[220px] truncate text-[11px] text-muted-foreground" title={renderOwnerLine(g)}>
                          {renderOwnerLine(g)}
                        </p>
                      </td>
                      {/* Paket */}
                      <td className="p-2">
                        {g.paket ? (
                          <>
                            <p className="text-xs font-semibold">{g.paket.name}</p>
                            <p className="text-[11px] text-muted-foreground">{rupiah(g.paket.monthlyPrice)}/bln</p>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      {/* Akun used/max + progress mini */}
                      <td className="p-2">
                        <p className="text-xs font-semibold">
                          {g.used}/{g.maxAccounts}
                          {g.maxAccounts > 0 && g.used >= g.maxAccounts && (
                            <span className="ml-1.5 text-[11px] font-semibold text-red-600">penuh</span>
                          )}
                        </p>
                        <div className="mt-1.5">
                          <QuotaBar used={g.used} max={g.maxAccounts} />
                        </div>
                      </td>
                      {/* Langganan */}
                      <td className="p-2">
                        <Badge className={subMeta.className}>{subMeta.label}</Badge>
                        {g.subscription?.endDate && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Berakhir {fmtDate(g.subscription.endDate)} ({g.subscription.daysLeft} hari)
                          </p>
                        )}
                      </td>
                      {/* Status Grup */}
                      <td className="p-2">
                        <Badge className={gsMeta.className}>{gsMeta.label}</Badge>
                      </td>
                      {/* Aksi */}
                      <td className="p-2">
                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openDetail(g)}>
                            <Eye className="h-3.5 w-3.5" /> Detail
                          </Button>
                          {g.status === 'aktif' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 border-red-200 bg-transparent text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
                              onClick={() => {
                                setActionTarget({ grup: g, action: 'nonaktifkan' })
                                setActionNote('')
                              }}
                            >
                              <Ban className="h-3.5 w-3.5" /> Nonaktifkan
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 border-emerald-600 bg-transparent text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-500/60 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                              onClick={() => {
                                setActionTarget({ grup: g, action: 'aktifkan' })
                                setActionNote('')
                              }}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> Aktifkan
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filteredRows.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Tidak ada grup yang cocok dengan filter/pencarian.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ===== Dialog Detail Grup ===== */}
      <Dialog open={!!detailId} onOpenChange={(v) => !v && closeDetail()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detail Grup — {detail?.grup.kode ?? '…'}</DialogTitle>
            <DialogDescription>
              {detail ? `${detail.grup.nama} · ${renderOwnerLine(detail.grup)}` : 'Memuat detail grup…'}
            </DialogDescription>
          </DialogHeader>

          {detailLoading && !detail ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 rounded-xl" />
              ))}
            </div>
          ) : detail ? (
            <div className="space-y-4">
              {/* Bagian Info */}
              <div className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="shrink-0 text-muted-foreground">Kode</span>
                  <span className="font-mono text-xs font-bold">{detail.grup.kode}</span>
                </div>
                <Separator className="bg-border" />
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="shrink-0 text-muted-foreground">Nama Grup</span>
                  <span className="truncate font-medium">{detail.grup.nama}</span>
                </div>
                <Separator className="bg-border" />
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="shrink-0 text-muted-foreground">Owner</span>
                  <span className="truncate text-right font-medium">
                    {detail.grup.owner
                      ? `${detail.grup.owner.nama} (@${detail.grup.owner.username})`
                      : '-'}
                  </span>
                </div>
                <Separator className="bg-border" />
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="shrink-0 text-muted-foreground">Paket</span>
                  <span className="truncate font-medium">
                    {detail.grup.paket
                      ? `${detail.grup.paket.name} · ${rupiah(detail.grup.paket.monthlyPrice)}/bln`
                      : '-'}
                  </span>
                </div>
                <Separator className="bg-border" />
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="shrink-0 text-muted-foreground">Kuota Akun</span>
                  <span className="flex items-center gap-2">
                    <b>
                      {detail.grup.used}/{detail.grup.maxAccounts}
                    </b>
                    <QuotaBar used={detail.grup.used} max={detail.grup.maxAccounts} />
                  </span>
                </div>
                <Separator className="bg-border" />
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="shrink-0 text-muted-foreground">Status Langganan</span>
                  <span className="flex flex-wrap items-center justify-end gap-2">
                    <Badge
                      className={
                        (SUB_META[detail.grup.subscription?.status ?? 'belum_aktif'] ?? SUB_META.belum_aktif).className
                      }
                    >
                      {(SUB_META[detail.grup.subscription?.status ?? 'belum_aktif'] ?? SUB_META.belum_aktif).label}
                    </Badge>
                    {detail.grup.subscription?.endDate && (
                      <span className="text-xs text-muted-foreground">
                        Berakhir {fmtDate(detail.grup.subscription.endDate)} ({detail.grup.subscription.daysLeft} hari)
                      </span>
                    )}
                  </span>
                </div>
                <Separator className="bg-border" />
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="shrink-0 text-muted-foreground">Status Grup</span>
                  <Badge className={(GROUP_STATUS_META[detail.grup.status] ?? GROUP_STATUS_META.aktif).className}>
                    {(GROUP_STATUS_META[detail.grup.status] ?? GROUP_STATUS_META.aktif).label}
                  </Badge>
                </div>
                <Separator className="bg-border" />
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="shrink-0 text-muted-foreground">Dibuat</span>
                  <span className="font-medium">{fmtDateTime(detail.grup.createdAt)}</span>
                </div>
              </div>

              {/* Tab: Anggota · Riwayat Pembayaran · Aktivitas */}
              <Tabs defaultValue="anggota">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="anggota">Anggota ({detail.members.length})</TabsTrigger>
                  <TabsTrigger value="pembayaran">Pembayaran ({detail.payments.length})</TabsTrigger>
                  <TabsTrigger value="aktivitas">Aktivitas ({detail.audit.length})</TabsTrigger>
                </TabsList>

                {/* Anggota */}
                <TabsContent value="anggota" className="mt-3">
                  <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                    {detail.members.length === 0 && (
                      <p className="py-6 text-center text-sm text-muted-foreground">Belum ada anggota di grup ini.</p>
                    )}
                    {detail.members.map((m) => (
                      <div key={m.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {initials(m.nama || m.username || m.userId)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{m.nama || m.userId}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            @{m.username} · Bergabung {fmtDate(m.joinedAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-1.5">
                          <Badge
                            className={
                              m.role === 'owner'
                                ? 'bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300'
                                : 'bg-muted text-muted-foreground'
                            }
                          >
                            {m.role === 'owner' ? 'Owner' : 'Staf'}
                          </Badge>
                          <Badge
                            className={
                              m.status === 'aktif'
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300'
                                : 'bg-slate-200 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                            }
                          >
                            {m.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                {/* Riwayat Pembayaran */}
                <TabsContent value="pembayaran" className="mt-3">
                  <div className="max-h-96 overflow-y-auto rounded-xl border border-border">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead>
                        <tr className="border-b border-border bg-secondary/50 text-left text-xs font-semibold text-muted-foreground">
                          <th className="p-2">Invoice</th>
                          <th className="p-2">Paket</th>
                          <th className="p-2">Nominal</th>
                          <th className="p-2">Metode</th>
                          <th className="p-2">Status</th>
                          <th className="p-2">Tanggal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.payments.map((p) => (
                          <tr key={p.id} className="border-b border-border last:border-b-0">
                            <td className="p-2 font-mono text-xs font-bold">{p.invoiceNumber}</td>
                            <td className="p-2 text-xs">{p.planName}</td>
                            <td className="p-2 text-xs font-semibold">{rupiah(p.amount)}</td>
                            <td className="p-2">
                              <Badge variant="outline" className="gap-1">
                                {p.paymentMethod === 'qris' ? <QrCode className="h-3 w-3" /> : <Landmark className="h-3 w-3" />}
                                {p.paymentMethod === 'qris' ? 'QRIS' : 'Transfer Bank'}
                              </Badge>
                            </td>
                            <td className="p-2">
                              <Badge className={(PAY_STATUS_META[p.status] ?? PAY_STATUS_META.menunggu_verifikasi).className}>
                                {(PAY_STATUS_META[p.status] ?? PAY_STATUS_META.menunggu_verifikasi).label}
                              </Badge>
                            </td>
                            <td className="p-2 text-xs text-muted-foreground">{fmtDateTime(p.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {detail.payments.length === 0 && (
                      <p className="py-6 text-center text-sm text-muted-foreground">Belum ada pembayaran tercatat.</p>
                    )}
                  </div>
                </TabsContent>

                {/* Aktivitas (audit) */}
                <TabsContent value="aktivitas" className="mt-3">
                  <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                    {detail.audit.length === 0 && (
                      <p className="py-6 text-center text-sm text-muted-foreground">Belum ada aktivitas tercatat.</p>
                    )}
                    {detail.audit.map((a) => (
                      <div key={a.id} className="rounded-xl border border-border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-bold">{AUDIT_LABEL[a.action] ?? a.action}</p>
                          <span className="text-xs text-muted-foreground">{fmtDateTime(a.createdAt)}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">Oleh {a.performedBy}</p>
                        {a.notes && <p className="mt-1 text-xs text-muted-foreground">Catatan: {a.notes}</p>}
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Detail grup tidak tersedia. Tutup dialog lalu coba lagi.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== AlertDialog konfirmasi Nonaktifkan / Aktifkan ===== */}
      <AlertDialog open={!!actionTarget} onOpenChange={(v) => !v && setActionTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert
                className={cn('h-5 w-5', actionTarget?.action === 'nonaktifkan' ? 'text-red-500' : 'text-emerald-600')}
              />
              {actionTarget?.action === 'nonaktifkan' ? 'Nonaktifkan Grup?' : 'Aktifkan Grup?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionTarget ? `${actionTarget.grup.nama} (${actionTarget.grup.kode}) — ` : ''}
              {actionTarget?.action === 'nonaktifkan'
                ? 'grup tidak bisa dipakai seluruh anggotanya sampai diaktifkan kembali.'
                : 'seluruh anggota dapat kembali memakai grup.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            rows={3}
            value={actionNote}
            onChange={(e) => setActionNote(e.target.value)}
            placeholder="Catatan (opsional) — tersimpan sebagai catatan audit"
            aria-label="Catatan aksi grup"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionBusy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                'gap-1.5',
                actionTarget?.action === 'nonaktifkan' && 'bg-red-600 text-white hover:bg-red-700',
              )}
              disabled={actionBusy}
              onClick={(e) => {
                e.preventDefault()
                void applyAction()
              }}
            >
              {actionBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              {actionTarget?.action === 'nonaktifkan' ? 'Ya, Nonaktifkan' : 'Ya, Aktifkan'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
