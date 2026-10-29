'use client'

/**
 * MANAJEMEN GRUP (Panel Admin → Manajemen Grup)
 *
 * Super admin dapat:
 * - Melihat seluruh grup perusahaan (owner, anggota, paket, kuota/terpakai).
 * - Melihat status langganan & tanggal berakhir tiap grup.
 * - Menonaktifkan / mengaktifkan grup sesuai kebijakan sistem (dengan alasan).
 * - Melihat riwayat aktivitas penting grup (audit log).
 *
 * Super admin TIDAK mengubah data transaksi pelanggan di sini — hanya
 * pemantauan & tindakan status grup, semuanya tercatat di AuditLog.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Building2,
  Users,
  Eye,
  ShieldOff,
  ShieldCheck,
  History,
  Search,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import { authFetch } from '@/lib/auth-fetch'
import { useLiveData } from '@/hooks/use-live-data'

interface AnggotaPanel {
  id: string
  namaLengkap: string
  username: string | null
  email: string
  peran: string
  status: string
  izin: string[]
  tanggalGabung: string
}

interface GrupPanel {
  id: string
  kode: string
  nama: string
  status: string
  suspendReason: string
  paket: string
  kuotaAkun: number
  terpakai: number
  sisa: number
  anggotaAktif: number
  langganan: { status: string; endDate: string | null } | null
  owner: { namaLengkap: string; username: string | null; email: string } | null
  createdAt: string
  anggota: AnggotaPanel[]
}

interface AuditLogPanel {
  id: string
  aktorNama: string
  aksi: string
  detail: string
  createdAt: string
}

const fmtTanggal = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'
const fmtWaktu = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const STATUS_SUB: Record<string, { label: string; cls: string }> = {
  aktif: { label: 'Aktif', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  akan_berakhir: { label: 'Akan Berakhir', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  kedaluwarsa: { label: 'Kedaluwarsa', cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  ditangguhkan: { label: 'Ditangguhkan', cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
  belum_aktif: { label: 'Belum Aktif', cls: 'bg-stone-100 text-stone-700 dark:bg-zinc-800 dark:text-zinc-300' },
}

const AKSI_LABEL: Record<string, string> = {
  grup_dibuat: 'Grup dibuat otomatis (pembayaran disetujui)',
  grup_langganan_diperbarui: 'Langganan grup diperbarui',
  grup_data_perusahaan_diubah: 'Data perusahaan diubah',
  anggota_ditambahkan: 'Anggota ditambahkan',
  anggota_diedit: 'Anggota diedit',
  anggota_dikeluarkan: 'Anggota dikeluarkan',
  sandi_anggota_direset: 'Kata sandi anggota direset',
  grup_dinonaktifkan: 'Grup dinonaktifkan (superadmin)',
  grup_diaktifkan: 'Grup diaktifkan (superadmin)',
  grup_owner_dikonversi: 'Owner dikonversi ke akun Pengguna',
}

export function ManajemenGrupContent() {
  const [rows, setRows] = useState<GrupPanel[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [detail, setDetail] = useState<GrupPanel | null>(null)
  const [audit, setAudit] = useState<AuditLogPanel[] | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)
  const [nonaktifTarget, setNonaktifTarget] = useState<GrupPanel | null>(null)
  const [alasan, setAlasan] = useState('')
  const [acting, setActing] = useState(false)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      const res = await authFetch('/api/panel-admin/grup')
      const json = await res.json()
      if (!res.ok) {
        if (!opts?.silent) toast.error(json.error || 'Gagal memuat daftar grup')
        return
      }
      setRows(json.grup ?? [])
    } catch {
      if (!opts?.silent) toast.error('Gagal terhubung ke server')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useLiveData({ load, intervalMs: 20000 })

  const terfilter = useMemo(() => {
    let list = rows ?? []
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      list = list.filter((g) =>
        g.nama.toLowerCase().includes(s) ||
        g.kode.toLowerCase().includes(s) ||
        (g.owner?.namaLengkap ?? '').toLowerCase().includes(s) ||
        (g.owner?.username ?? '').toLowerCase().includes(s))
    }
    return list
  }, [rows, q])

  const bukaDetail = async (g: GrupPanel) => {
    setDetail(g)
    setAudit(null)
    setAuditLoading(true)
    try {
      const res = await authFetch(`/api/panel-admin/grup/${g.id}/audit`)
      const json = await res.json()
      setAudit(res.ok ? (json.logs ?? []) : [])
    } catch {
      setAudit([])
    } finally {
      setAuditLoading(false)
    }
  }

  const setStatus = async (g: GrupPanel, status: 'aktif' | 'dinonaktifkan') => {
    setActing(true)
    try {
      const res = await authFetch(`/api/panel-admin/grup/${g.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, alasan }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal mengubah status')
      toast.success(status === 'aktif' ? 'Grup diaktifkan' : 'Grup dinonaktifkan')
      setNonaktifTarget(null)
      setAlasan('')
      setDetail(null)
      load({ silent: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengubah status grup')
    } finally {
      setActing(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight md:text-2xl">Manajemen Grup</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {(rows ?? []).length} grup perusahaan terdaftar — owner, anggota, kuota, dan status langganan.
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari grup / owner…"
            className="h-9 w-56 pl-8"
            aria-label="Cari grup"
          />
        </div>
      </div>

      {terfilter.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Belum ada grup perusahaan. Grup dibuat otomatis saat pembayaran paket multi-akun (Pro/Premium) disetujui.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop: tabel */}
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card sm:block">
            <table className="w-full min-w-[960px] text-sm" data-testid="tabel-grup-admin">
              <thead>
                <tr className="border-b border-border bg-secondary/50 text-left text-xs font-semibold text-muted-foreground">
                  <th className="p-2.5">Grup</th>
                  <th className="p-2.5">Owner</th>
                  <th className="p-2.5">Paket</th>
                  <th className="p-2.5">Akun</th>
                  <th className="p-2.5">Langganan</th>
                  <th className="p-2.5">Status Grup</th>
                  <th className="p-2.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {terfilter.map((g) => {
                  const sub = g.langganan ? STATUS_SUB[g.langganan.status] ?? STATUS_SUB.belum_aktif : STATUS_SUB.belum_aktif
                  return (
                    <tr key={g.id} className="border-b border-border align-middle hover:bg-accent/30">
                      <td className="p-2.5">
                        <div className="font-semibold">{g.nama}</div>
                        <div className="text-xs text-muted-foreground">{g.kode}</div>
                      </td>
                      <td className="p-2.5">
                        <div>{g.owner?.namaLengkap || '-'}</div>
                        <div className="text-xs text-muted-foreground">{g.owner?.username ? `@${g.owner.username}` : ''}</div>
                      </td>
                      <td className="p-2.5 whitespace-nowrap">
                        <div>{g.paket}</div>
                        <div className="text-xs text-muted-foreground">{g.kuotaAkun} akun</div>
                      </td>
                      <td className="p-2.5 whitespace-nowrap">
                        <span className="font-semibold">{g.terpakai}</span>
                        <span className="text-muted-foreground"> / {g.kuotaAkun}</span>
                        <div className="text-xs text-muted-foreground">{g.anggotaAktif} aktif</div>
                      </td>
                      <td className="p-2.5 whitespace-nowrap">
                        <Badge className={sub.cls}>{sub.label}</Badge>
                        <div className="mt-1 text-xs text-muted-foreground">s/d {fmtTanggal(g.langganan?.endDate)}</div>
                      </td>
                      <td className="p-2.5 whitespace-nowrap">
                        {g.status === 'aktif' ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">Aktif</Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-300">Nonaktif</Badge>
                        )}
                      </td>
                      <td className="p-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="outline" className="h-8" onClick={() => bukaDetail(g)}>
                            <Eye className="mr-1 h-3.5 w-3.5" /> Detail
                          </Button>
                          {g.status === 'aktif' ? (
                            <Button size="sm" variant="outline" className="h-8 text-red-600" onClick={() => { setNonaktifTarget(g); setAlasan('') }}>
                              <ShieldOff className="mr-1 h-3.5 w-3.5" /> Nonaktifkan
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" className="h-8 text-emerald-700" onClick={() => setStatus(g, 'aktif')}>
                              <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Aktifkan
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: kartu */}
          <div className="space-y-2 sm:hidden" data-testid="kartu-grup-admin">
            {terfilter.map((g) => {
              const sub = g.langganan ? STATUS_SUB[g.langganan.status] ?? STATUS_SUB.belum_aktif : STATUS_SUB.belum_aktif
              return (
                <div key={g.id} className="rounded-xl border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{g.nama}</div>
                      <div className="text-xs text-muted-foreground">{g.kode} · {g.owner?.namaLengkap || '-'}</div>
                    </div>
                    {g.status === 'aktif' ? (
                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">Aktif</Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-300">Nonaktif</Badge>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">{g.paket}</Badge>
                    <span>{g.terpakai}/{g.kuotaAkun} akun</span>
                    <span>·</span>
                    <Badge className={`${sub.cls} text-[10px]`}>{sub.label}</Badge>
                    <span>s/d {fmtTanggal(g.langganan?.endDate)}</span>
                  </div>
                  <div className="mt-2 flex gap-1 border-t pt-2">
                    <Button size="sm" variant="outline" className="h-8 flex-1" onClick={() => bukaDetail(g)}>
                      <Eye className="mr-1 h-3.5 w-3.5" /> Detail
                    </Button>
                    {g.status === 'aktif' ? (
                      <Button size="sm" variant="outline" className="h-8 flex-1 text-red-600" onClick={() => { setNonaktifTarget(g); setAlasan('') }}>
                        <ShieldOff className="mr-1 h-3.5 w-3.5" /> Nonaktifkan
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="h-8 flex-1 text-emerald-700" onClick={() => setStatus(g, 'aktif')}>
                        <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Aktifkan
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ===== Dialog detail grup ===== */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <Building2 className="h-5 w-5 text-emerald-600" />
              {detail?.nama}
              <Badge variant="outline">{detail?.kode}</Badge>
            </DialogTitle>
            <DialogDescription>
              Owner: {detail?.owner?.namaLengkap || '-'} ({detail?.owner?.username ? `@${detail.owner.username}` : '-'}) ·
              Paket {detail?.paket} · {detail?.terpakai}/{detail?.kuotaAkun} akun
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Anggota */}
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Users className="h-4 w-4" /> Anggota ({detail?.anggota.length ?? 0})</p>
              <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {(detail?.anggota ?? []).map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{a.namaLengkap}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {a.username ? `@${a.username}` : '-'} · {a.peran === 'owner' ? 'Owner' : a.peran === 'admin' ? 'Admin' : 'Staf'} · gabung {fmtTanggal(a.tanggalGabung)}
                      </div>
                    </div>
                    {a.status === 'aktif' ? (
                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">Aktif</Badge>
                    ) : (
                      <Badge className="bg-stone-200 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300">{a.status}</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Audit */}
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><History className="h-4 w-4" /> Riwayat Aktivitas</p>
              {auditLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (audit ?? []).length === 0 ? (
                <p className="rounded-lg border p-3 text-sm text-muted-foreground">Belum ada aktivitas tercatat.</p>
              ) : (
                <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                  {audit!.map((l) => (
                    <div key={l.id} className="rounded-lg border p-2.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{AKSI_LABEL[l.aksi] ?? l.aksi}</span>
                        <span className="whitespace-nowrap text-[11px] text-muted-foreground">{fmtWaktu(l.createdAt)}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">oleh {l.aktorNama || 'system'}{l.detail && l.detail !== '{}' ? ` · ${ringkasDetail(l.detail)}` : ''}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Konfirmasi nonaktifkan grup ===== */}
      <AlertDialog open={!!nonaktifTarget} onOpenChange={(o) => !o && setNonaktifTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nonaktifkan grup {nonaktifTarget?.nama}?</AlertDialogTitle>
            <AlertDialogDescription>
              Seluruh anggota grup tidak dapat login sampai grup diaktifkan kembali.
              Data perusahaan tidak dihapus dan akses dipulihkan otomatis setelah diaktifkan.
              Tindakan ini dicatat pada riwayat aktivitas grup.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Alasan (wajib)</label>
            <Textarea
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              placeholder="cth. Pelanggaran ketentuan layanan"
              rows={3}
              maxLength={300}
              data-testid="alasan-nonaktif-grup"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={acting || !alasan.trim()}
              data-testid="konfirmasi-nonaktif-grup"
              onClick={() => nonaktifTarget && setStatus(nonaktifTarget, 'dinonaktifkan')}
            >
              {acting ? 'Memproses…' : 'Ya, Nonaktifkan'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ringkasDetail(raw: string): string {
  try {
    const d = JSON.parse(raw)
    const parts: string[] = []
    if (d.namaLengkap) parts.push(d.namaLengkap)
    if (d.username) parts.push(`@${d.username}`)
    if (d.planName) parts.push(d.planName)
    if (d.alasan) parts.push(`alasan: ${d.alasan}`)
    if (d.ke) parts.push(`→ ${String(d.ke).slice(0, 10)}…`)
    return parts.join(' · ')
  } catch {
    return raw.slice(0, 80)
  }
}
