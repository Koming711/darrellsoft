'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronRight, DatabaseBackup, Loader2, MapPin, Pencil, Phone, Plus, Power, PowerOff, Search, Trash2, Upload, Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/client'
import { authFetch } from '@/lib/auth-fetch'
import { onDataChange, notifyDataChange } from '@/lib/data-sync'
import { cn } from '@/lib/utils'
import type { Customer, SessionUser } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CustomerFormDialog } from '@/components/views/customer-form-dialog'

function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'Terjadi kesalahan'
}

function ActiveBadge({ active }: { active: boolean }) {
  return active
    ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px] shrink-0">Aktif</Badge>
    : <Badge variant="outline" className="bg-stone-100 text-stone-500 border-stone-200 text-[11px] shrink-0">Nonaktif</Badge>
}

export default function CustomersView({
  user,
  canAdd = false,
  canEdit = false,
  canDelete = false,
}: {
  user: SessionUser
  /** Izin Tambah (Matriks Hak Akses: master-customer-tambah; superadmin selalu boleh) */
  canAdd?: boolean
  /** Izin Edit + Aktifkan/Nonaktifkan (master-customer-edit) */
  canEdit?: boolean
  /** Izin Hapus (master-customer-hapus) */
  canDelete?: boolean
}) {

  const router = useRouter()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Backup & restore master customer (.xlsx) — endpoint backup-master/restore-master
  // table=customer (satu sumber dgn backup master halaman lain).
  const [backupBusy, setBackupBusy] = useState<'backup' | 'restore' | null>(null)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const restoreFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setQuery(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // API saat ini mengembalikan array customer langsung
      const data = await apiFetch<Customer[]>(
        `/api/customers?q=${encodeURIComponent(query)}`
      )
      setCustomers(data)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    void load()
  }, [load])

  // Sinkron antar-tab & pasca offline-sync: muat ulang daftar saat entity
  // 'customers' berubah (mis. antrian offline baru saja direplay).
  useEffect(() => {
    return onDataChange(['customers'], () => {
      void load()
    })
  }, [load])

  // Popup tambah/edit memakai komponen bersama CustomerFormDialog (isi &
  // perilaku SAMA PERSIS — kode otomatis, nama*, telepon, email, alamat,
  // catatan, status aktif edit). Setelah simpan → muat ulang daftar.
  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (c: Customer) => {
    setEditing(c)
    setDialogOpen(true)
  }

  const handleToggleActive = async (c: Customer) => {
    try {
      await apiFetch<{ customer: Customer }>(`/api/customers/${c.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !c.isActive }),
      })
      toast.success(c.isActive ? `${c.name} dinonaktifkan` : `${c.name} diaktifkan`)
      // Invalidasi smart-cache 'customers' (tab ini + tab lain) agar halaman
      // lain yang memakai cache (mis. dropdown invoice) memuat data segar.
      notifyDataChange('customers')
      void load()
    } catch (e) {
      toast.error(errText(e))
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiFetch<{ ok: boolean }>(`/api/customers/${deleteTarget.id}`, { method: 'DELETE' })
      toast.success('Pelanggan berhasil dihapus')
      setDeleteTarget(null)
      // Invalidasi smart-cache 'customers' — daftar berikutnya selalu segar.
      notifyDataChange('customers')
      void load()
    } catch (e) {
      // 409 → pelanggan punya invoice, tampilkan pesan server
      toast.error(errText(e))
    } finally {
      setDeleting(false)
    }
  }

  const hasResults = customers.length > 0
  const countLabel = loading ? 'Memuat data…' : `${customers.length} pelanggan`

  /** Backup master customer → unduh .xlsx (sheet Laporan + Data) via
   *  /api/database/backup-master?table=customer — pola sama dgn master lain. */
  const handleBackup = async () => {
    setBackupBusy('backup')
    try {
      const res = await authFetch('/api/database/backup-master?table=customer')
      if (!res.ok) {
        let errMsg = 'Gagal backup data pelanggan'
        try {
          const errData = await res.json()
          errMsg = errData?.error || errMsg
        } catch {}
        toast.error(errMsg)
        return
      }
      const blob = await res.blob()
      if (blob.size === 0) {
        toast.error('Backup kosong — tidak ada data')
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = res.headers.get('Content-Disposition')
      const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
      a.download = match ? decodeURIComponent(match[1]) : `backup-customer-${Date.now()}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Backup pelanggan berhasil diunduh')
    } catch (e) {
      console.error('Backup customer error:', e)
      toast.error('Gagal backup data pelanggan')
    } finally {
      setBackupBusy(null)
    }
  }

  /** Restore: unggah file backup → GANTI semua data pelanggan milik user
   *  (mode REPLACE via /api/database/restore-master, konfirmasi AlertDialog). */
  const doRestore = async () => {
    if (!restoreFile) return
    setBackupBusy('restore')
    try {
      const fd = new FormData()
      fd.append('file', restoreFile)
      fd.append('table', 'customer')
      const res = await authFetch('/api/database/restore-master', {
        method: 'POST',
        body: fd,
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.success) {
        toast.success(`Restore pelanggan berhasil (${data.count} data)`)
        setRestoreFile(null)
        // Invalidasi smart-cache 'customers' (dropdown invoice di halaman lain ikut segar)
        notifyDataChange('customers')
        void load()
      } else {
        toast.error(data?.error || 'Gagal restore data pelanggan')
      }
    } catch {
      toast.error('File backup tidak valid')
    } finally {
      setBackupBusy(null)
    }
  }

  /** Klik baris pelanggan → halaman daftar invoice pelanggan tsb. */
  const openCustomerInvoices = (c: Customer) => {
    router.push(`/master-customer/${c.id}`)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Master Customer</h1>
          <p className="text-sm text-muted-foreground mt-1">{countLabel}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari nama / kode / telepon…"
              aria-label="Cari pelanggan"
              className="pl-9 min-h-[44px]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Backup: unduh .xlsx master customer (read-only, tanpa syarat izin) */}
            <Button
              variant="outline"
              onClick={handleBackup}
              disabled={backupBusy !== null}
              title="Unduh backup data pelanggan (.xlsx)"
              className="min-h-[44px] flex-1 sm:flex-none px-3 text-xs sm:text-sm"
            >
              {backupBusy === 'backup' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <DatabaseBackup className="h-4 w-4" aria-hidden />
              )}
              Backup
            </Button>
            {/* Restore: ganti semua pelanggan dr file backup — butuh izin edit */}
            <Button
              variant="outline"
              onClick={() => restoreFileRef.current?.click()}
              disabled={backupBusy !== null || !canEdit}
              title={canEdit ? 'Pulihkan data pelanggan dari file backup (.xlsx) — ganti semua data' : 'Anda tidak memiliki izin mengubah pelanggan'}
              className="min-h-[44px] flex-1 sm:flex-none px-3 text-xs sm:text-sm"
            >
              {backupBusy === 'restore' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Upload className="h-4 w-4" aria-hidden />
              )}
              Restore
            </Button>
            <Button
              onClick={openCreate}
              disabled={!canAdd}
              title={canAdd ? 'Tambah pelanggan' : 'Anda tidak memiliki izin menambah pelanggan'}
              className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px] flex-1 sm:flex-none"
            >
              <Plus className="h-4 w-4" /> Tambah
            </Button>
          </div>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border border-stone-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : !hasResults ? (
          <EmptyState filtered={query !== ''} />
        ) : (
          // Kotak tabel "fit to desktop": kotak SELALU mengisi sisa tinggi layar
          // desktop (bukan hanya setinggi isi baris), tabel scroll di dalam kotak
          // saat data banyak. Offset = topbar 65 + padding main + blok judul + gap + pb.
          <div className="max-h-96 overflow-y-auto scrollbar-thin md:max-h-none md:h-[calc(100vh-240px)] lg:h-[calc(100vh-208px)]">
            {/* Tinggi baris presisi 10mm + zebra (baris ganjil abu slate-100, hover seragam
                lebih gelap) — konvensi sama dgn tabel /barang & /harga-customer */}
            <Table className="[&_td]:py-[2px] [&_tbody_tr:last-child]:border-b [&_tbody_tr:hover]:bg-slate-200/70 dark:[&_tbody_tr:hover]:bg-zinc-700/50">
              <TableHeader className="sticky top-0 z-10 bg-stone-50">
                <TableRow className="bg-stone-50 hover:bg-stone-50">
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Telepon</TableHead>
                  <TableHead>Alamat</TableHead>
                  <TableHead className="text-center">Invoice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c, idx) => (
                  <TableRow
                    key={c.id}
                    tabIndex={0}
                    onClick={() => openCustomerInvoices(c)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        // Jangan navigasi bila yang difokuskan tombol aksi di dalam baris.
                        const t = e.target as HTMLElement
                        if (t.closest('button')) return
                        e.preventDefault()
                        openCustomerInvoices(c)
                      }
                    }}
                    aria-label={`Lihat daftar invoice ${c.name}`}
                    title="Klik baris untuk melihat daftar invoice pelanggan ini"
                    className={cn(
                      'cursor-pointer h-[10mm]',
                      idx % 2 === 1 && 'bg-slate-100 dark:bg-zinc-800/60'
                    )}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{c.code}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="whitespace-nowrap">{c.phone || '-'}</TableCell>
                    <TableCell className="max-w-52 truncate text-muted-foreground">{c.address || '-'}</TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex items-center justify-center gap-0.5 tabular-nums text-emerald-700 font-medium">
                        {c.invoiceCount ?? 0}
                        <ChevronRight className="h-3.5 w-3.5 text-stone-400" aria-hidden="true" />
                      </span>
                    </TableCell>
                    <TableCell><ActiveBadge active={c.isActive} /></TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 p-0"
                          disabled={!canEdit}
                          onClick={() => openEdit(c)}
                          aria-label={`Edit ${c.name}`}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                        </Button>
                        {(c.invoiceCount ?? 0) > 0 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 p-0"
                            disabled={!canEdit}
                            onClick={() => void handleToggleActive(c)}
                            aria-label={c.isActive ? `Nonaktifkan ${c.name}` : `Aktifkan ${c.name}`}
                            title={c.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                          >
                            {c.isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                          disabled={!canDelete}
                          onClick={() => setDeleteTarget(c)}
                          aria-label={`Hapus ${c.name}`}
                          title="Hapus"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
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
          [1, 2, 3].map((i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)
        ) : !hasResults ? (
          <EmptyState filtered={query !== ''} />
        ) : (
          customers.map((c) => (
            <Card
              key={c.id}
              className="p-0 gap-0 cursor-pointer transition-colors hover:border-emerald-300"
              onClick={() => openCustomerInvoices(c)}
              role="button"
              tabIndex={0}
              aria-label={`Lihat daftar invoice ${c.name}`}
              title="Ketuk kartu untuk melihat daftar invoice pelanggan ini"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  const t = e.target as HTMLElement
                  if (t.closest('button')) return
                  e.preventDefault()
                  openCustomerInvoices(c)
                }
              }}
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{c.code}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <ActiveBadge active={c.isActive} />
                    <ChevronRight className="h-4 w-4 text-stone-400" aria-hidden="true" />
                  </div>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p className="flex items-center gap-1.5 min-h-[20px]">
                    <Phone className="h-3.5 w-3.5 shrink-0" /> {c.phone || '-'}
                  </p>
                  <p className="flex items-start gap-1.5">
                    <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span className="line-clamp-2">{c.address || '-'}</span>
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <p className="text-xs text-muted-foreground">{c.invoiceCount ?? 0} invoice dibuat</p>
                  <span className="text-xs font-medium text-emerald-700 inline-flex items-center gap-0.5">
                    Lihat Invoice <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 min-h-[44px]"
                    disabled={!canEdit}
                    onClick={(e) => { e.stopPropagation(); openEdit(c) }}
                  >
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  {(c.invoiceCount ?? 0) > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 min-h-[44px]"
                      disabled={!canEdit}
                      onClick={(e) => { e.stopPropagation(); void handleToggleActive(c) }}
                    >
                      {c.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                      {c.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 min-h-[44px] text-destructive border-stone-200 hover:bg-destructive/10 hover:text-destructive"
                    disabled={!canDelete}
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(c) }}
                  >
                    <Trash2 className="h-4 w-4" /> Hapus
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Dialog create / edit — komponen bersama CustomerFormDialog */}
      <CustomerFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={() => { void load() }}
      />

      {/* Restore pelanggan: pilih file .xlsx → konfirmasi → GANTI semua data */}
      <input
        ref={restoreFileRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null
          e.target.value = '' // izinkan memilih file yang sama lagi nanti
          if (f) setRestoreFile(f)
        }}
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Konfirmasi restore — mode REPLACE, tidak bisa dibatalkan */}
      <AlertDialog
        open={!!restoreFile}
        onOpenChange={(o) => {
          if (!o && backupBusy !== 'restore') setRestoreFile(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pulihkan data pelanggan dari file backup?</AlertDialogTitle>
            <AlertDialogDescription>
              Semua data pelanggan yang ada sekarang akan DIGANTI dengan isi file
              &quot;{restoreFile?.name}&quot;. File backup master customer TIDAK memuat
              registrasi Harga Khusus — registrasi harga khusus yang terhubung ke
              pelanggan lama akan ikut terhapus (pulihkan lewat halaman Harga
              Customer → Restore). Tindakan tidak bisa dibatalkan — pastikan file
              adalah backup terbaru.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={backupBusy === 'restore'}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={backupBusy === 'restore'}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={(e) => {
                e.preventDefault()
                void doRestore()
              }}
            >
              {backupBusy === 'restore' ? 'Memulihkan…' : 'Ya, Restore'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog hapus */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus pelanggan?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (deleteTarget.invoiceCount ?? 0) > 0
                ? `${deleteTarget.name} punya ${deleteTarget.invoiceCount} invoice. Invoice lama tetap tersimpan, tetapi pelanggan ini akan dihapus permanen dari daftar.`
                : `${deleteTarget?.name} akan dihapus permanen dari daftar pelanggan.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); void handleDelete() }}
            >
              {deleting ? 'Menghapus…' : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="text-center py-12 px-4">
      <Users className="h-10 w-10 text-stone-300 mx-auto mb-2" />
      <p className="text-sm font-medium">{filtered ? 'Tidak ditemukan' : 'Belum ada pelanggan'}</p>
      <p className="text-xs text-muted-foreground mt-1">
        {filtered ? 'Coba kata kunci lain.' : 'Tambahkan pelanggan pertama Anda dengan tombol "+ Tambah".'}
      </p>
    </div>
  )
}
