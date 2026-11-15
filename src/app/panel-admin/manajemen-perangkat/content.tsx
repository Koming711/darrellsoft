'use client'

// Konten MANAJEMEN PERANGKAT panel admin — fitur "Login 1 Perangkat".
//
// - Tabel perangkat AKTIF semua akun (nama akun, perangkat, jenis, browser/OS,
//   tanggal & jam login, aktivitas terakhir, status).
// - Cabut Sesi (kick perangkat) & Reset Perangkat (perangkat hilang/rusak) —
//   keduanya mencabut sesi aktif dengan KONFIRMASI; akses login otomatis
//   terbuka kembali. Setiap tindakan tercatat di AuditLog + notifikasi keamanan.
// - Riwayat sesi dicabut & riwayat LOGIN DITOLAK (perangkat kedua).

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
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
import { authFetch } from '@/lib/auth-fetch'
import { toast } from 'sonner'
import {
  Monitor,
  Smartphone,
  Tablet,
  RefreshCcw,
  ShieldOff,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  History,
  Ban,
} from 'lucide-react'

interface DeviceSessionRow {
  id: string
  userId: string
  username: string
  akunNama: string
  userRole: string
  deviceName: string
  deviceType: string
  browser: string
  os: string
  loginAt: string
  lastActivityAt: string
  status: string
  logoutAt: string | null
  revokedBy: string
}

interface AttemptRow {
  id: string
  userId: string
  username: string
  deviceName: string
  deviceType: string
  browser: string
  os: string
  reason: string
  createdAt: string
}

interface Payload {
  active: DeviceSessionRow[]
  history: DeviceSessionRow[]
  attempts: AttemptRow[]
  stats: { activeCount: number; revokedCount: number; attempts24h: number }
}

const fmtDateTime = (d: string | null | undefined) =>
  d
    ? new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '-'

const fmtRelative = (d: string | null | undefined) => {
  if (!d) return '-'
  const diff = Date.now() - new Date(d).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m} menit lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} jam lalu`
  const days = Math.floor(h / 24)
  return `${days} hari lalu`
}

function DeviceIcon({ type, className }: { type: string; className?: string }) {
  if (type === 'mobile') return <Smartphone className={className} />
  if (type === 'tablet') return <Tablet className={className} />
  return <Monitor className={className} />
}

function RoleBadge({ role }: { role: string }) {
  const label =
    role === 'superadmin'
      ? 'Super Admin'
      : role === 'admin'
        ? 'Admin'
        : role === 'user'
          ? 'User'
          : role === 'demo'
            ? 'Demo'
            : role || 'Anggota'
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
      {label}
    </Badge>
  )
}

export function ManajemenPerangkatContent() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'aktif' | 'riwayat' | 'ditolak'>('aktif')

  // Konfirmasi aksi admin
  const [confirmTarget, setConfirmTarget] = useState<{ session: DeviceSessionRow; action: 'revoke' | 'reset' } | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    try {
      const res = await authFetch('/api/admin/device-sessions')
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Gagal memuat data perangkat')
        setData((prev) => prev ?? { active: [], history: [], attempts: [], stats: { activeCount: 0, revokedCount: 0, attempts24h: 0 } })
        return
      }
      setData(json as Payload)
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    // Segarkan otomatis tiap 30 detik (aktivitas terakhir berjalan via polling klien)
    const iv = setInterval(() => void load({ silent: true }), 30_000)
    return () => clearInterval(iv)
  }, [load])

  const handleConfirm = async () => {
    if (!confirmTarget) return
    setConfirmBusy(true)
    try {
      const res = await authFetch('/api/admin/device-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: confirmTarget.session.id, action: confirmTarget.action }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Gagal mencabut sesi perangkat')
        return
      }
      toast.success(
        confirmTarget.action === 'reset'
          ? 'Reset perangkat berhasil — akun dapat login di perangkat baru.'
          : 'Sesi perangkat berhasil dicabut — akses login kembali terbuka.'
      )
      setConfirmTarget(null)
      await load({ silent: true })
    } catch {
      toast.error('Gagal terhubung ke server')
    } finally {
      setConfirmBusy(false)
    }
  }

  const stats = data?.stats ?? { activeCount: 0, revokedCount: 0, attempts24h: 0 }

  return (
    <div className="space-y-5">
      {/* Header info */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40 p-4 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Login 1 Perangkat — Manajemen Perangkat</p>
          <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
            Satu akun hanya aktif pada satu perangkat. Cabut sesi bila perangkat hilang/rusak atau untuk membuka akses login kembali — setiap tindakan tercatat di audit log dan menotifikasi pemilik akun.
          </p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto shrink-0 gap-1.5" onClick={() => void load({ silent: true })}>
          <RefreshCcw className="h-3.5 w-3.5" /> Segarkan
        </Button>
      </div>

      {/* Kartu statistik */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
            <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none">{stats.activeCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Perangkat Aktif</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 dark:bg-slate-800">
            <ShieldOff className="h-5 w-5 text-slate-500" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none">{stats.revokedCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Sesi Dicabut (100 terakhir)</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-red-100 dark:bg-red-900/40">
            <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none">{stats.attempts24h}</p>
            <p className="text-xs text-muted-foreground mt-1">Login Ditolak (24 jam)</p>
          </div>
        </div>
      </div>

      {/* Tab tampilan */}
      <div className="flex flex-wrap gap-2">
        {([
          { key: 'aktif', label: 'Perangkat Aktif', icon: ShieldCheck },
          { key: 'riwayat', label: 'Riwayat Sesi', icon: History },
          { key: 'ditolak', label: 'Login Ditolak', icon: Ban },
        ] as const).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setView(t.key)}
            aria-pressed={view === t.key}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
              view === t.key
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'border bg-card text-muted-foreground hover:bg-slate-50 hover:text-foreground dark:hover:bg-slate-800/60'
            }`}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Konten tab */}
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : view === 'aktif' ? (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Akun</TableHead>
                  <TableHead>Perangkat Aktif</TableHead>
                  <TableHead className="hidden md:table-cell">Jenis</TableHead>
                  <TableHead className="hidden lg:table-cell">Browser / OS</TableHead>
                  <TableHead className="hidden sm:table-cell">Login</TableHead>
                  <TableHead>Aktivitas Terakhir</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.active ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                      Belum ada perangkat aktif. Perangkat terdaftar otomatis saat akun login.
                    </TableCell>
                  </TableRow>
                ) : (
                  (data?.active ?? []).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <p className="text-sm font-medium">{s.akunNama || s.username}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-muted-foreground">{s.username}</span>
                          <RoleBadge role={s.userRole} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <DeviceIcon type={s.deviceType} className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm">{s.deviceName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline" className="capitalize text-[10px] px-1.5 py-0">
                          {s.deviceType === 'mobile' ? 'HP' : s.deviceType === 'tablet' ? 'Tablet' : 'Komputer'}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <p className="text-xs">{s.browser}</p>
                        <p className="text-xs text-muted-foreground">{s.os}</p>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs">{fmtDateTime(s.loginAt)}</TableCell>
                      <TableCell>
                        <p className="text-xs">{fmtRelative(s.lastActivityAt)}</p>
                        <p className="text-[10px] text-muted-foreground">{fmtDateTime(s.lastActivityAt)}</p>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => setConfirmTarget({ session: s, action: 'revoke' })}
                          >
                            <ShieldOff className="h-3.5 w-3.5" /> Cabut Sesi
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 text-xs text-amber-700 border-amber-200 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-900 dark:hover:bg-amber-950"
                            onClick={() => setConfirmTarget({ session: s, action: 'reset' })}
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Reset
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : view === 'riwayat' ? (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Akun</TableHead>
                  <TableHead>Perangkat</TableHead>
                  <TableHead className="hidden md:table-cell">Browser / OS</TableHead>
                  <TableHead className="hidden sm:table-cell">Login</TableHead>
                  <TableHead>Berakhir</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.history ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                      Belum ada riwayat sesi yang berakhir.
                    </TableCell>
                  </TableRow>
                ) : (
                  (data?.history ?? []).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <p className="text-sm font-medium">{s.akunNama || s.username}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-muted-foreground">{s.username}</span>
                          <RoleBadge role={s.userRole} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <DeviceIcon type={s.deviceType} className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm">{s.deviceName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <p className="text-xs">{s.browser}</p>
                        <p className="text-xs text-muted-foreground">{s.os}</p>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs">{fmtDateTime(s.loginAt)}</TableCell>
                      <TableCell className="text-xs">{fmtDateTime(s.logoutAt)}</TableCell>
                      <TableCell>
                        {s.status === 'revoked' ? (
                          <Badge className="bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-[10px]">
                            {s.revokedBy ? 'Dicabut Admin' : 'Logout'}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] capitalize">{s.status}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Akun</TableHead>
                  <TableHead>Perangkat Pencoba</TableHead>
                  <TableHead className="hidden md:table-cell">Browser / OS</TableHead>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Alasan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.attempts ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                      Belum ada percobaan login yang ditolak.
                    </TableCell>
                  </TableRow>
                ) : (
                  (data?.attempts ?? []).map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-sm font-medium">{a.username || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <DeviceIcon type={a.deviceType} className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm">{a.deviceName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <p className="text-xs">{a.browser}</p>
                        <p className="text-xs text-muted-foreground">{a.os}</p>
                      </TableCell>
                      <TableCell className="text-xs">{fmtDateTime(a.createdAt)}</TableCell>
                      <TableCell>
                        <Badge className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 text-[10px]">
                          {a.reason === 'device_conflict' ? 'Perangkat Lain Aktif' : a.reason}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Konfirmasi Cabut Sesi / Reset Perangkat */}
      <AlertDialog open={!!confirmTarget} onOpenChange={(open) => { if (!open && !confirmBusy) setConfirmTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTarget?.action === 'reset' ? 'Reset Perangkat?' : 'Cabut Sesi Perangkat?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Akun <strong>{confirmTarget?.session.akunNama || confirmTarget?.session.username}</strong>{' '}
                  ({confirmTarget?.session.username}) sedang aktif di:
                </p>
                <p className="rounded-lg border bg-muted/40 p-2 text-xs">
                  {confirmTarget?.session.deviceName} — login {fmtDateTime(confirmTarget?.session.loginAt)}
                </p>
                <p>
                  {confirmTarget?.action === 'reset'
                    ? 'Sesi perangkat lama akan dicabut sehingga akun dapat login pada perangkat baru. Gunakan bila perangkat pengguna hilang atau rusak.'
                    : 'Sesi perangkat akan dicabut dan pengguna di perangkat itu otomatis keluar. Akses login kembali terbuka.'}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmBusy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleConfirm() }}
              disabled={confirmBusy}
              className="bg-red-600 hover:bg-red-700"
            >
              {confirmBusy ? 'Memproses…' : confirmTarget?.action === 'reset' ? 'Ya, Reset Perangkat' : 'Ya, Cabut Sesi'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
