'use client'

// /grup/anggota — "Anggota Grup" (CRUD akun anggota grup, OWNER-only aksi).
// Desktop = tabel (avatar inisial, HP, peran, hak akses, status, bergabung,
// aksi dropdown), Mobile = kartu ringkas dengan aksi yang sama (pola
// kelola-pelanggan). Pagination klien 5/halaman. Dialog: Tambah Anggota
// (dengan Hak Akses Menu LENGKAP — semua menu aplikasi, dikelompokkan per
// bagian), Edit, Atur Akses, Reset Sandi, Keluarkan (destructive). Data dari
// GET /api/grup/my; aksi → POST/PATCH/DELETE /api/grup/my/anggota[/[memberId]].
// Polling ringan 15 detik (useLiveData).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useLanguage } from '@/contexts/language-context'
import { useLiveData } from '@/hooks/use-live-data'
import { getAuthUser } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Building2,
  Copy,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  UserMinus,
  UsersRound,
} from 'lucide-react'

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'

/** Inisial avatar — 2 kata pertama (pola kelola-pelanggan). */
const initials = (name: string) =>
  (name || '?')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

// ===== Daftar fitur untuk Hak Akses Menu anggota staf (LENGKAP, sinkron sidebar) =====
// Dikelompokkan sesuai urutan menu aplikasi agar mudah dibaca. ID fitur harus
// sama dengan featureId di sidebar/permissions agar overlay hak akses efektif.
const GRUP_FITUR_SECTIONS: { judul: string; items: { id: string; label: string }[] }[] = [
  {
    judul: 'Hitung & Kalkulator',
    items: [
      { id: 'potong-kertas', label: 'Potong Kertas' },
      { id: 'hitung-cetakan', label: 'Hitung Cetakan' },
      { id: 'hitung-finishing', label: 'Hitung Finishing' },
      { id: 'hitung-ongkos-cetak', label: 'Hitung Ongkos Cetak' },
      { id: 'hitung-harga-kertas', label: 'Hitung Harga Kertas' },
    ],
  },
  {
    judul: 'Dokumen',
    items: [
      { id: 'invoice', label: 'Invoice' },
      { id: 'surat-jalan', label: 'Surat Jalan' },
      { id: 'purchase-order', label: 'Purchase Order' },
    ],
  },
  {
    judul: 'Master Data',
    items: [
      { id: 'master-customer', label: 'Customer' },
      { id: 'master-barang', label: 'Master Produk' },
      { id: 'stock-bahan', label: 'Stok Bahan' },
      { id: 'master-harga-kertas', label: 'Master Harga Kertas' },
      { id: 'master-ongkos-cetak', label: 'Master Ongkos Cetak' },
      { id: 'master-finishing', label: 'Master Finishing' },
      { id: 'master-toko-pemasok', label: 'Master Suplier' },
    ],
  },
  {
    judul: 'Laporan & Keuangan',
    items: [
      { id: 'laporan', label: 'Laporan (Penjualan & Laba Rugi)' },
      { id: 'hutang-dagang', label: 'Hutang Dagang' },
      { id: 'piutang-dagang', label: 'Piutang Dagang' },
      { id: 'biaya', label: 'Kas/Bank (Biaya Operasional)' },
    ],
  },
]

// Daftar flat semua fitur — dipakai untuk hitung jumlah menu aktif.
const FITUR_AKSES: { id: string; label: string }[] = GRUP_FITUR_SECTIONS.flatMap((s) => s.items)

// Fitur yang aktif secara default untuk staf (mengikuti default role 'user'
// di permission-defaults.ts): semua kalkulator + laporan.
const FITUR_DEFAULT_AKTIF = [
  'potong-kertas',
  'hitung-cetakan',
  'hitung-finishing',
  'hitung-ongkos-cetak',
  'hitung-harga-kertas',
  'laporan',
]

// Default hak akses staf (dipakai bila permissions null / form tambah).
const DEFAULT_STAF_PERMISSIONS: Record<string, boolean> = Object.fromEntries(
  FITUR_AKSES.map((f) => [f.id, FITUR_DEFAULT_AKTIF.includes(f.id)]),
)

const TEKS_KUOTA_PENUH =
  'Kuota akun Anda sudah penuh. Hapus atau keluarkan anggota yang tidak digunakan, atau pilih paket dengan kuota lebih besar.'

interface MemberInfo {
  id: string
  userId: string
  nama: string
  username: string
  role: 'owner' | 'staf'
  status: 'aktif' | 'nonaktif'
  permissions: Record<string, boolean> | null
  joinedAt: string
  nomorHP?: string | null
}

interface MyGrupData {
  isMember: boolean
  myRole: 'owner' | 'staf'
  grup: {
    id: string
    kode: string
    nama: string
    status: 'aktif' | 'dinonaktifkan'
    maxAccounts: number
    paket: { id: string; name: string; monthlyPrice: number; durationDays: number }
    subscription: { status: string; startDate: string | null; endDate: string | null; daysLeft: number }
    createdAt: string
  }
  used: number
  sisa: number
  owner: { memberId: string; userId: string; nama: string; username: string }
  members: MemberInfo[]
  ringkasan: { totalInvoice: number; invoiceBelumLunas: number; totalPiutang: number }
}

type StatusFilterKey = 'semua' | 'aktif' | 'nonaktif'

const PER_PAGE = 5

export default function AnggotaGrupPage() {
  const { t } = useLanguage()
  const router = useRouter()

  const [data, setData] = useState<MyGrupData | null>(null)
  const [loading, setLoading] = useState(true)

  // Toolbar
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('semua')
  const [page, setPage] = useState(1)

  // Dialog Tambah Anggota
  const [addOpen, setAddOpen] = useState(false)
  const [addNama, setAddNama] = useState('')
  const [addUsername, setAddUsername] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [addNomorHP, setAddNomorHP] = useState('')
  const [addPerms, setAddPerms] = useState<Record<string, boolean>>({ ...DEFAULT_STAF_PERMISSIONS })
  const [addBusy, setAddBusy] = useState(false)

  // Dialog Edit
  const [editTarget, setEditTarget] = useState<MemberInfo | null>(null)
  const [editNama, setEditNama] = useState('')
  const [editNomorHP, setEditNomorHP] = useState('')
  const [editBusy, setEditBusy] = useState(false)

  // Dialog Atur Akses
  const [aksesTarget, setAksesTarget] = useState<MemberInfo | null>(null)
  const [aksesPerms, setAksesPerms] = useState<Record<string, boolean>>({})
  const [aksesBusy, setAksesBusy] = useState(false)

  // AlertDialog Reset Sandi / Keluarkan / Nonaktifkan
  const [resetTarget, setResetTarget] = useState<MemberInfo | null>(null)
  const [resetBusy, setResetBusy] = useState(false)
  const [kickTarget, setKickTarget] = useState<MemberInfo | null>(null)
  const [kickBusy, setKickBusy] = useState(false)
  const [toggleTarget, setToggleTarget] = useState<MemberInfo | null>(null)
  const [toggleBusy, setToggleBusy] = useState(false)

  // Dialog kredensial sekali-tampil (hasil tambah anggota / reset sandi)
  const [credential, setCredential] = useState<{ title: string; username: string; password: string } | null>(null)

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!getAuthUser()) {
        router.replace('/login?next=/grup/anggota')
        return
      }
      if (!opts?.silent) setLoading(true)
      try {
        const res = await authFetch('/api/grup/my')
        if (res.status === 401) {
          router.replace('/login?next=/grup/anggota')
          return
        }
        const json = await res.json().catch(() => ({}))
        if (res.status === 404 && json?.error === 'BELUM_GRUP') {
          router.replace('/grup')
          return
        }
        if (!res.ok) {
          if (!opts?.silent) toast.error(json?.error || 'Gagal memuat data grup')
          return
        }
        setData(json as MyGrupData)
      } catch {
        if (!opts?.silent) toast.error('Gagal terhubung ke server')
      } finally {
        setLoading(false)
      }
    },
    [router],
  )

  useEffect(() => {
    load()
  }, [load])

  // Polling ringan 15 detik — kuota & status anggota selalu segar
  useLiveData({ load, intervalMs: 15000 })

  const isOwner = data?.myRole === 'owner'
  const grup = data?.grup
  const members = data?.members ?? []
  const kuotaPenuh = data ? data.sisa === 0 : false

  // ===== Filter + pencarian (klien) =====
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return members.filter((m) => {
      const okSearch =
        !q || m.nama.toLowerCase().includes(q) || m.username.toLowerCase().includes(q)
      const okStatus =
        statusFilter === 'semua' || (statusFilter === 'aktif' ? m.status === 'aktif' : m.status === 'nonaktif')
      return okSearch && okStatus
    })
  }, [members, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter])

  const statusCounts = useMemo(
    () => ({
      semua: members.length,
      aktif: members.filter((m) => m.status === 'aktif').length,
      nonaktif: members.filter((m) => m.status === 'nonaktif').length,
    }),
    [members],
  )

  // ===== Helpers =====
  const copyText = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(message)
    } catch {
      toast.error('Gagal menyalin')
    }
  }

  const copyKode = () => {
    if (grup) void copyText(grup.kode, 'ID grup disalin')
  }

  /** Jumlah menu yang dinyalakan dari daftar lengkap (permissions null → default staf). */
  const menuCount = (m: MemberInfo) => {
    const map = { ...DEFAULT_STAF_PERMISSIONS, ...(m.permissions ?? {}) }
    return FITUR_AKSES.filter((f) => !!map[f.id]).length
  }

  const openAdd = () => {
    if (kuotaPenuh) {
      toast.warning(TEKS_KUOTA_PENUH)
      return
    }
    setAddNama('')
    setAddUsername('')
    setAddPassword('')
    setAddNomorHP('')
    setAddPerms({ ...DEFAULT_STAF_PERMISSIONS })
    setAddOpen(true)
  }

  const openEdit = (m: MemberInfo) => {
    setEditTarget(m)
    setEditNama(m.nama)
    setEditNomorHP(m.nomorHP ?? '')
  }

  const openAkses = (m: MemberInfo) => {
    setAksesTarget(m)
    // null = default role → isi switch dengan default; simpan kirim map lengkap
    setAksesPerms({ ...DEFAULT_STAF_PERMISSIONS, ...(m.permissions ?? {}) })
  }

  // ===== AKSI API =====
  const submitAdd = async () => {
    const namaLengkap = addNama.trim()
    const username = addUsername.trim()
    const password = addPassword.trim()
    const nomorHP = addNomorHP.trim()
    if (!namaLengkap) {
      toast.error('Nama lengkap wajib diisi')
      return
    }
    if (!username) {
      toast.error('Username wajib diisi')
      return
    }
    if (password && password.length < 6) {
      toast.error('Kata sandi minimal 6 karakter')
      return
    }
    setAddBusy(true)
    try {
      // Kirim hanya fitur yang DINYALAKAN — server menggabungkan dengan default
      const permissions = Object.fromEntries(Object.entries(addPerms).filter(([, v]) => v))
      const res = await authFetch('/api/grup/my/anggota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          namaLengkap,
          username,
          password: password || undefined,
          nomorHP: nomorHP || undefined,
          permissions,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error || 'Gagal menambahkan anggota')
        return
      }
      toast.success('Anggota berhasil ditambahkan')
      setAddOpen(false)
      if (json?.generatedPassword && json?.member?.username) {
        setCredential({ title: 'Akun Berhasil Dibuat', username: json.member.username, password: json.generatedPassword })
      }
      await load({ silent: true })
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setAddBusy(false)
    }
  }

  const submitEdit = async () => {
    if (!editTarget) return
    const namaLengkap = editNama.trim()
    if (!namaLengkap) {
      toast.error('Nama lengkap wajib diisi')
      return
    }
    setEditBusy(true)
    try {
      const res = await authFetch(`/api/grup/my/anggota/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ namaLengkap, nomorHP: editNomorHP.trim() || undefined }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error || 'Gagal memperbarui anggota')
        return
      }
      toast.success('Data anggota berhasil diperbarui')
      setEditTarget(null)
      await load({ silent: true })
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setEditBusy(false)
    }
  }

  const submitAkses = async () => {
    if (!aksesTarget) return
    setAksesBusy(true)
    try {
      // Kirim map LENGKAP hasil toggle
      const res = await authFetch(`/api/grup/my/anggota/${aksesTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: { ...aksesPerms } }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error || 'Gagal menyimpan hak akses')
        return
      }
      toast.success('Hak akses berhasil disimpan')
      setAksesTarget(null)
      await load({ silent: true })
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setAksesBusy(false)
    }
  }

  const submitReset = async () => {
    if (!resetTarget) return
    setResetBusy(true)
    try {
      const res = await authFetch(`/api/grup/my/anggota/${resetTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: '', resetPassword: true }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error || 'Gagal mereset kata sandi')
        return
      }
      setResetTarget(null)
      if (json?.generatedPassword && json?.member?.username) {
        setCredential({ title: 'Kata Sandi Baru Dibuat', username: json.member.username, password: json.generatedPassword })
      } else {
        toast.success('Kata sandi berhasil direset')
      }
      await load({ silent: true })
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setResetBusy(false)
    }
  }

  const submitToggle = async () => {
    if (!toggleTarget) return
    setToggleBusy(true)
    try {
      const res = await authFetch(`/api/grup/my/anggota/${toggleTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'nonaktif' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error || 'Gagal mengubah status anggota')
        return
      }
      toast.success('Anggota dinonaktifkan')
      setToggleTarget(null)
      await load({ silent: true })
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setToggleBusy(false)
    }
  }

  const activateMember = async (m: MemberInfo) => {
    try {
      const res = await authFetch(`/api/grup/my/anggota/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'aktif' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error || 'Gagal mengubah status anggota')
        return
      }
      toast.success('Anggota diaktifkan')
      await load({ silent: true })
    } catch {
      toast.error('Gagal terhubung ke server')
    }
  }

  const submitKick = async () => {
    if (!kickTarget) return
    setKickBusy(true)
    try {
      const res = await authFetch(`/api/grup/my/anggota/${kickTarget.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error || 'Gagal mengeluarkan anggota')
        return
      }
      toast.success(json?.message || 'Anggota dikeluarkan dari grup')
      setKickTarget(null)
      await load({ silent: true })
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setKickBusy(false)
    }
  }

  const onStatusSwitch = (m: MemberInfo, checked: boolean) => {
    if (checked) {
      void activateMember(m)
    } else {
      setToggleTarget(m)
    }
  }

  const STATUS_FILTERS: { key: StatusFilterKey; label: string }[] = [
    { key: 'semua', label: 'Semua' },
    { key: 'aktif', label: 'Aktif' },
    { key: 'nonaktif', label: 'Nonaktif' },
  ]

  // ===== Dialog Hak Akses (dipakai Tambah Anggota & Atur Akses) =====
  // Daftar LENGKAP dikelompokkan per bagian menu aplikasi (sinkron sidebar).
  const renderAksesSwitches = (
    perms: Record<string, boolean>,
    onChange: (id: string, v: boolean) => void,
  ) => (
    <div className="max-h-96 space-y-3 overflow-y-auto rounded-xl border border-border p-3">
      {GRUP_FITUR_SECTIONS.map((section) => (
        <div key={section.judul}>
          <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {section.judul}
          </p>
          {section.items.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-accent/40">
              <Label htmlFor={`akses-${f.id}`} className="cursor-pointer text-sm font-normal">
                {f.label}
              </Label>
              <Switch
                id={`akses-${f.id}`}
                checked={!!perms[f.id]}
                onCheckedChange={(v) => onChange(f.id, v)}
                aria-label={`Hak akses ${f.label}`}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )

  return (
    <DashboardLayout title={t('anggota_grup')} subtitle={t('subtitle_anggota_grup')}>
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-12 rounded-xl" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : !data || !grup ? (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-3 p-6 py-12 text-center">
            <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Gagal memuat data grup. Coba lagi.</p>
            <Button variant="outline" size="sm" onClick={() => load()} className="gap-1.5">
              <RefreshCcw className="h-3.5 w-3.5" /> Muat Ulang
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {/* ===== Header grup ===== */}
          <Card className="rounded-2xl">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">{grup.nama}</h1>
                  <button
                    type="button"
                    onClick={copyKode}
                    aria-label="Salin ID grup"
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 font-mono text-xs font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  >
                    {grup.kode}
                    <Copy className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <UsersRound className="h-3.5 w-3.5" aria-hidden="true" /> Kuota:{' '}
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 font-bold',
                      kuotaPenuh
                        ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
                    )}
                  >
                    Terpakai {data.used}/{grup.maxAccounts}
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Banner non-owner: semua aksi disembunyikan (read-only) */}
          {!isOwner && (
            <Alert className="rounded-2xl border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Hanya Owner yang dapat mengelola anggota grup.</AlertTitle>
              <AlertDescription>Anda dapat melihat daftar anggota, namun tidak dapat mengubahnya.</AlertDescription>
            </Alert>
          )}

          {/* ===== Toolbar ===== */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama atau username…"
                  aria-label="Cari anggota"
                  className="pl-9"
                />
              </div>
              <div role="group" aria-label="Filter status anggota" className="flex flex-wrap items-center gap-2">
                {STATUS_FILTERS.map((f) => {
                  const active = statusFilter === f.key
                  return (
                    <button
                      key={f.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setStatusFilter(f.key)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                        active
                          ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                          : 'border-border bg-card text-muted-foreground hover:bg-accent/40 hover:text-foreground',
                      )}
                    >
                      {f.label}
                      <span
                        className={cn(
                          'min-w-5 rounded-full px-1.5 text-center text-[10px] font-bold leading-4',
                          active ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {statusCounts[f.key]}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
            {isOwner && (
              <Button
                onClick={openAdd}
                className={cn(
                  'gap-1.5',
                  kuotaPenuh ? 'bg-muted text-muted-foreground hover:bg-muted' : 'bg-emerald-600 text-white hover:bg-emerald-700',
                )}
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Tambah Anggota
              </Button>
            )}
          </div>

          {/* ===== MOBILE: kartu anggota ===== */}
          <div className="space-y-2 sm:hidden">
            {pageRows.map((m) => (
              <div key={m.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    {initials(m.nama)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {m.nama} <span className="font-normal text-muted-foreground">@{m.username}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">Bergabung {fmtDate(m.joinedAt)}</p>
                  </div>
                  {isOwner && m.role === 'staf' && (
                    <Switch
                      checked={m.status === 'aktif'}
                      onCheckedChange={(v) => onStatusSwitch(m, v)}
                      aria-label={`Status ${m.nama}`}
                    />
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {m.role === 'owner' ? (
                    <Badge className="rounded-full border-transparent bg-emerald-600 text-white">Owner</Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="rounded-full border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"
                    >
                      Staf
                    </Badge>
                  )}
                  <Badge
                    className={cn(
                      'rounded-full border-transparent',
                      m.status === 'aktif'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                    )}
                  >
                    {m.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {m.role === 'owner' ? 'Semua akses' : `${menuCount(m)} menu`}
                  </span>
                </div>
                {isOwner && m.role === 'staf' && (
                  <>
                    <Separator className="my-2" />
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${m.nama}`} onClick={() => openEdit(m)}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Atur akses ${m.nama}`}
                        onClick={() => openAkses(m)}
                      >
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Reset sandi ${m.nama}`}
                        onClick={() => setResetTarget(m)}
                      >
                        <KeyRound className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
                        aria-label={`Keluarkan ${m.nama}`}
                        onClick={() => setKickTarget(m)}
                      >
                        <UserMinus className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {pageRows.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {search.trim() ? `Tidak ada anggota yang cocok dengan "${search.trim()}".` : 'Belum ada anggota.'}
              </p>
            )}
          </div>

          {/* ===== DESKTOP: tabel anggota ===== */}
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card sm:block">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50 text-left text-xs font-semibold text-muted-foreground">
                  <th className="p-3">Anggota</th>
                  <th className="p-3">No. HP</th>
                  <th className="p-3">Peran</th>
                  <th className="p-3">Hak Akses</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Bergabung</th>
                  {isOwner && <th className="p-3 text-center">Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((m) => (
                  <tr key={m.id} className="border-b border-border/60 transition hover:bg-accent/30">
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                          {initials(m.nama)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">{m.nama}</p>
                          <p className="truncate text-xs text-muted-foreground">@{m.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{m.nomorHP || '-'}</td>
                    <td className="p-3">
                      {m.role === 'owner' ? (
                        <Badge className="rounded-full border-transparent bg-emerald-600 text-white">Owner</Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="rounded-full border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"
                        >
                          Staf
                        </Badge>
                      )}
                    </td>
                    <td className="p-3">
                      {m.role === 'owner' ? (
                        <span className="text-sm font-medium">Semua akses</span>
                      ) : (
                        <span className="flex items-center gap-2 text-sm text-muted-foreground">
                          {menuCount(m)} menu
                          {isOwner && (
                            <button
                              type="button"
                              onClick={() => openAkses(m)}
                              className="font-semibold text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
                            >
                              Atur
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Badge
                          className={cn(
                            'rounded-full border-transparent',
                            m.status === 'aktif'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                          )}
                        >
                          {m.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                        {isOwner && m.role === 'staf' && (
                          <Switch
                            checked={m.status === 'aktif'}
                            onCheckedChange={(v) => onStatusSwitch(m, v)}
                            aria-label={`Status ${m.nama}`}
                          />
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{fmtDate(m.joinedAt)}</td>
                    {isOwner && (
                      <td className="p-3 text-center">
                        {m.role === 'owner' ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label={`Aksi untuk ${m.nama}`}
                              >
                                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => openEdit(m)}>
                                <Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openAkses(m)}>
                                <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" /> Atur Akses
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setResetTarget(m)}>
                                <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" /> Reset Sandi
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setKickTarget(m)}
                                className="text-red-600 focus:text-red-700 dark:text-red-400"
                              >
                                <UserMinus className="mr-2 h-4 w-4" aria-hidden="true" /> Keluarkan
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={isOwner ? 7 : 6} className="p-8 text-center text-sm text-muted-foreground">
                      {search.trim() ? `Tidak ada anggota yang cocok dengan "${search.trim()}".` : 'Belum ada anggota.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ===== Pagination klien ===== */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Halaman {Math.min(page, totalPages)} dari {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Halaman sebelumnya"
              >
                Sebelumnya
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Halaman berikutnya"
              >
                Berikutnya
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Dialog Tambah Anggota ===== */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Tambah Anggota</DialogTitle>
            <DialogDescription>
              Buat akun anggota baru untuk grup Anda. Akun otomatis bergabung ke grup.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-nama">
                Nama Lengkap <span className="text-red-500">*</span>
              </Label>
              <Input
                id="add-nama"
                value={addNama}
                onChange={(e) => setAddNama(e.target.value)}
                placeholder="cth. Budi Santoso"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="add-username">
                  Username <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="add-username"
                  value={addUsername}
                  onChange={(e) => setAddUsername(e.target.value)}
                  placeholder="cth. budi"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-password">Kata Sandi</Label>
                <Input
                  id="add-password"
                  type="text"
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  placeholder="Kosongkan untuk dibuat otomatis"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-hp">No. HP</Label>
              <Input
                id="add-hp"
                value={addNomorHP}
                onChange={(e) => setAddNomorHP(e.target.value)}
                placeholder="cth. 0812xxxxxxx"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Hak Akses Menu</p>
                <span className="text-xs text-muted-foreground">
                  {FITUR_AKSES.filter((f) => !!addPerms[f.id]).length}/{FITUR_AKSES.length} menu aktif
                </span>
              </div>
              {renderAksesSwitches(addPerms, (id, v) => setAddPerms((prev) => ({ ...prev, [id]: v })))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={addBusy}>
              Batal
            </Button>
            <Button
              onClick={submitAdd}
              disabled={addBusy || !addNama.trim() || !addUsername.trim()}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {addBusy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
              Tambah Anggota
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Dialog Edit Anggota ===== */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null)
        }}
      >
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Anggota</DialogTitle>
            <DialogDescription>Perbarui data akun @{editTarget?.username ?? ''}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-nama">Nama Lengkap</Label>
              <Input id="edit-nama" value={editNama} onChange={(e) => setEditNama(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-hp">No. HP</Label>
              <Input id="edit-hp" value={editNomorHP} onChange={(e) => setEditNomorHP(e.target.value)} placeholder="cth. 0812xxxxxxx" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={editBusy}>
              Batal
            </Button>
            <Button
              onClick={submitEdit}
              disabled={editBusy || !editNama.trim()}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {editBusy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Dialog Atur Akses ===== */}
      <Dialog
        open={!!aksesTarget}
        onOpenChange={(o) => {
          if (!o) setAksesTarget(null)
        }}
      >
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Atur Akses</DialogTitle>
            <DialogDescription>
              Pilih menu yang dapat diakses @{aksesTarget?.username ?? ''} dari daftar lengkap menu aplikasi.
              Menu yang tidak dipilih disembunyikan.
            </DialogDescription>
          </DialogHeader>
          {renderAksesSwitches(aksesPerms, (id, v) => setAksesPerms((prev) => ({ ...prev, [id]: v })))}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAksesTarget(null)} disabled={aksesBusy}>
              Batal
            </Button>
            <Button
              onClick={submitAkses}
              disabled={aksesBusy}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {aksesBusy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
              Simpan Hak Akses
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== AlertDialog Reset Sandi ===== */}
      <AlertDialog
        open={!!resetTarget}
        onOpenChange={(o) => {
          if (!o) setResetTarget(null)
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Reset kata sandi @{resetTarget?.username ?? ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              Kata sandi baru akan dibuat otomatis dan hanya ditampilkan sekali. Berikan kata sandi baru tersebut kepada
              anggota.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetBusy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void submitReset()
              }}
              disabled={resetBusy}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {resetBusy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
              Reset Sandi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== AlertDialog Nonaktifkan anggota ===== */}
      <AlertDialog
        open={!!toggleTarget}
        onOpenChange={(o) => {
          if (!o) setToggleTarget(null)
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Nonaktifkan @{toggleTarget?.username ?? ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              Anggota tidak akan bisa login hingga diaktifkan kembali.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggleBusy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void submitToggle()
              }}
              disabled={toggleBusy}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {toggleBusy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
              Nonaktifkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== AlertDialog Keluarkan anggota (destructive) ===== */}
      <AlertDialog
        open={!!kickTarget}
        onOpenChange={(o) => {
          if (!o) setKickTarget(null)
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Keluarkan {kickTarget?.nama ?? ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              Seluruh data perusahaan yang dibuat anggota ini (customer, invoice, stok, riwayat) akan dipindahkan ke
              Owner. Akun login anggota akan dihapus permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={kickBusy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void submitKick()
              }}
              disabled={kickBusy}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {kickBusy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
              Keluarkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== Dialog kredensial sekali-tampil ===== */}
      <Dialog
        open={!!credential}
        onOpenChange={(o) => {
          if (!o) setCredential(null)
        }}
      >
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{credential?.title ?? 'Akun Berhasil Dibuat'}</DialogTitle>
            <DialogDescription>Berikan kredensial berikut kepada anggota Anda.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Username</p>
                <p className="truncate font-mono text-sm font-bold">{credential?.username}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => credential && void copyText(credential.username, 'Username disalin')}
                aria-label="Salin nama pengguna"
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Salin
              </Button>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Kata Sandi</p>
                <p className="truncate font-mono text-sm font-bold">{credential?.password}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => credential && void copyText(credential.password, 'Kata sandi disalin')}
                aria-label="Salin kata sandi"
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Salin
              </Button>
            </div>
            <Alert className="rounded-xl border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>Simpan kata sandi sekarang — hanya ditampilkan sekali.</AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button onClick={() => setCredential(null)} className="bg-emerald-600 text-white hover:bg-emerald-700">
              Selesai
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Chip kuota penuh — pengingat di bawah daftar */}
      {!loading && data && kuotaPenuh && isOwner && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <p>Kuota akun Anda sudah penuh. Hapus atau keluarkan anggota yang tidak digunakan, atau pilih paket dengan kuota lebih besar.</p>
        </div>
      )}
    </DashboardLayout>
  )
}
