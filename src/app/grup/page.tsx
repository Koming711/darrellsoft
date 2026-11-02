'use client'

/**
 * GRUP SAYA (/grup) — Manajemen Grup & Multi-Akun Darrellsoft.
 *
 * - Owner : dashboard grup, data perusahaan, CRUD anggota (kuota paket),
 *           hak akses anggota (RBAC), reset sandi, status langganan.
 * - Anggota : lihat info grup & status akun sendiri (read-only).
 * - Tanpa grup : upsell paket multi-akun (Pro/Premium).
 *
 * Data grup dibagikan otomatis lewat getDataFilter (server-side) — halaman
 * ini hanya menangani manajemen keanggotaan & informasi.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Building2,
  Users,
  PackageCheck,
  ShieldCheck,
  UserPlus,
  Pencil,
  KeyRound,
  UserMinus,
  Power,
  Copy,
  CalendarDays,
  Hash,
  Crown,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { authFetch } from '@/lib/auth-fetch'
import { useAuth } from '@/contexts/auth-context'
import { startNavigation } from '@/components/navigation-progress'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
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
import { useLiveData } from '@/hooks/use-live-data'

// ===== Tipe =====
interface Anggota {
  id: string
  memberId: string
  namaLengkap: string
  username: string | null
  email: string
  nomorHP: string
  peran: string // owner | admin | staf
  status: string // aktif | nonaktif
  izin: string[]
  tanggalGabung: string
  akunAda: boolean
}

interface GrupInfo {
  id: string
  kode: string
  nama: string
  status: string
  suspendReason: string
  ownerUserId: string | null
  ownerNama: string
  paket: string
  kuotaAkun: number
  terpakai: number
  sisa: number
  langganan: { status: string; statusMentah: string; startDate: string | null; endDate: string | null } | null
  createdAt: string
}

interface ResponsGrup {
  grup: GrupInfo | null
  anggota?: Anggota[]
  saya?: { peran: string; status: string; izin: string[]; adalahOwner: boolean }
  daftarPaketMultiAkun?: { id: string; name: string; monthlyPrice: number; maxAccounts: number; isPopular: boolean; features: string }[]
}

// Daftar LENGKAP hak akses menu (RBAC) yang dapat diatur Owner kepada anggota
// grup — selaras seluruh menu sidebar aplikasi. `grup` = seksi untuk pengelompokan
// tampilan. Harus SINKRON dengan GRUP_MENU_IZIN di src/lib/server-auth.ts.
const MENU_IZIN: { id: string; label: string; grup: string }[] = [
  { id: 'pembukaan', label: 'Dashboard / Beranda', grup: 'Beranda' },
  { id: 'potong-kertas', label: 'Potong Kertas', grup: 'Hitung Produksi' },
  { id: 'hitung-cetakan', label: 'Hitung Cetakan', grup: 'Hitung Produksi' },
  { id: 'hitung-finishing', label: 'Hitung Finishing', grup: 'Hitung Produksi' },
  { id: 'hitung-ongkos-cetak', label: 'Hitung Ongkos Cetak', grup: 'Hitung Produksi' },
  { id: 'hitung-harga-kertas', label: 'Hitung Harga Kertas', grup: 'Hitung Produksi' },
  { id: 'invoice', label: 'Invoice', grup: 'Dokumen' },
  { id: 'surat-jalan', label: 'Surat Jalan', grup: 'Dokumen' },
  { id: 'purchase-order', label: 'Purchase Order', grup: 'Dokumen' },
  { id: 'master-customer', label: 'Master Customer', grup: 'Dokumen' },
  { id: 'master-barang', label: 'Master Produk', grup: 'Dokumen' },
  { id: 'barang', label: 'Barang', grup: 'Dokumen' },
  { id: 'harga-customer', label: 'Harga Customer', grup: 'Dokumen' },
  { id: 'biaya', label: 'Biaya Operasional (Kas / Bank)', grup: 'Keuangan & Laporan' },
  { id: 'laporan', label: 'Laporan Penjualan & Laba Rugi', grup: 'Keuangan & Laporan' },
  { id: 'hutang-dagang', label: 'Hutang Dagang', grup: 'Keuangan & Laporan' },
  { id: 'piutang-dagang', label: 'Piutang Dagang', grup: 'Keuangan & Laporan' },
  { id: 'master-harga-kertas', label: 'Master Bahan', grup: 'Master Cetak' },
  { id: 'daftar-kategori', label: 'Daftar Kategori', grup: 'Master Cetak' },
  { id: 'master-ongkos-cetak', label: 'Master Ongkos Cetak', grup: 'Master Cetak' },
  { id: 'master-finishing', label: 'Master Finishing', grup: 'Master Cetak' },
  { id: 'master-toko-pemasok', label: 'Master Toko Pemasok', grup: 'Master Cetak' },
  { id: 'stock-bahan', label: 'Stock Bahan', grup: 'Master Cetak' },
  { id: 'pengaturan', label: 'Pengaturan', grup: 'Lainnya' },
  // Langganan — bila TIDAK dicentang, menu Langganan disembunyikan dari
  // anggota grup (owner & non-grup tetap selalu melihat).
  { id: 'langganan-saya', label: 'Langganan', grup: 'Lainnya' },
  // Data sensitif — bila TIDAK dicentang, anggota tidak melihat profit
  // (kolom & kotak Total Profit di riwayat invoice, baris Profit di editor,
  // kotak Laba Kotor di beranda). SINKRON dengan GRUP_MENU_IZIN server.
  { id: 'profit', label: 'Profit (Laba Invoice)', grup: 'Data Sensitif' },
]

// Urutan seksi utk pengelompokan tampilan hak akses
const IZIN_GRUP_ORDER = ['Beranda', 'Hitung Produksi', 'Dokumen', 'Keuangan & Laporan', 'Master Cetak', 'Lainnya', 'Data Sensitif']

const PESAN_KUOTA_PENUH =
  'Kuota akun Anda sudah penuh. Hapus atau keluarkan anggota yang tidak digunakan, atau pilih paket dengan kuota lebih besar.'

const rupiah = (n: number) => `Rp ${Math.round(n ?? 0).toLocaleString('id-ID')}`
const fmtTanggal = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'

const STATUS_LANGGANAN: Record<string, { label: string; cls: string }> = {
  aktif: { label: 'Aktif', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  akan_berakhir: { label: 'Akan Berakhir', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  kedaluwarsa: { label: 'Kedaluwarsa', cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  ditangguhkan: { label: 'Ditangguhkan', cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
  belum_aktif: { label: 'Belum Aktif', cls: 'bg-stone-100 text-stone-700 dark:bg-zinc-800 dark:text-zinc-300' },
}

export default function GrupPage() {
  return (
    <DashboardLayout title="Grup Saya">
      <GrupContent />
    </DashboardLayout>
  )
}

function GrupContent() {
  const router = useRouter()
  const { user: authUser, isLoading: authLoading } = useAuth()
  // Admin sistem (admin/superadmin) bukan pemilik grup pelanggan — halaman
  // Grup Saya (termasuk upsell paket multi-akun) hanya untuk akun Owner.
  // Data grup tidak masuk ke pengguna admin: admin memantau via Panel Admin.
  const adminSistem = authUser?.role === 'admin' || authUser?.role === 'superadmin'
  const [data, setData] = useState<ResponsGrup | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'ringkasan' | 'perusahaan' | 'anggota' | 'langganan'>('ringkasan')
  const [dlgTambah, setDlgTambah] = useState(false)
  const [editTarget, setEditTarget] = useState<Anggota | null>(null)
  const [resetTarget, setResetTarget] = useState<Anggota | null>(null)
  const [toggleTarget, setToggleTarget] = useState<Anggota | null>(null)
  const [keluarkanTarget, setKeluarkanTarget] = useState<Anggota | null>(null)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      const res = await authFetch('/api/grup')
      const json = await res.json()
      if (!res.ok) {
        if (!opts?.silent) toast.error(json.error || 'Gagal memuat data grup')
        return
      }
      setData(json)
    } catch {
      if (!opts?.silent) toast.error('Gagal terhubung ke server')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useLiveData({ load, intervalMs: 20000 })

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  // ===== Tanpa grup → upsell =====
  if (!data?.grup) {
    // Admin sistem: tampilkan info (bukan upsell) — grup dikelola Owner,
    // admin hanya memantau via Panel Admin → Manajemen Grup.
    if (!authLoading && adminSistem) return <AdminGrupInfo />
    return <UpsellView paket={data?.daftarPaketMultiAkun ?? []} />
  }

  const grup = data.grup
  const anggota = data.anggota ?? []
  const adalahOwner = !!data.saya?.adalahOwner
  const lang = grup.langganan ? STATUS_LANGGANAN[grup.langganan.status] ?? STATUS_LANGGANAN.belum_aktif : STATUS_LANGGANAN.belum_aktif
  const persenTerpakai = grup.kuotaAkun > 0 ? Math.min(100, Math.round((grup.terpakai / grup.kuotaAkun) * 100)) : 0

  const tabs: { key: typeof tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'ringkasan', label: 'Ringkasan', icon: Building2 },
    { key: 'perusahaan', label: 'Data Perusahaan', icon: ShieldCheck },
    { key: 'anggota', label: 'Anggota Grup', icon: Users },
    { key: 'langganan', label: 'Langganan', icon: PackageCheck },
  ]

  async function doToggle(a: Anggota) {
    try {
      const res = await authFetch(`/api/grup/anggota/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: a.status === 'aktif' ? 'nonaktif' : 'aktif' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal')
      toast.success(a.status === 'aktif' ? 'Anggota dinonaktifkan' : 'Anggota diaktifkan')
      setToggleTarget(null)
      load({ silent: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengubah status anggota')
    }
  }

  async function doKeluarkan(a: Anggota) {
    try {
      const res = await authFetch(`/api/grup/anggota/${a.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal')
      toast.success('Anggota dikeluarkan dari grup')
      setKeluarkanTarget(null)
      load({ silent: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengeluarkan anggota')
    }
  }

  // ===== Halaman penuh "Tambah Anggota" (bukan dialog kecil — permintaan owner):
  // muncul menggantikan isi grup dengan form lengkap + hak akses menu LENGKAP.
  if (dlgTambah) {
    return (
      <HalamanTambahAnggota
        sisa={grup.sisa}
        onBatal={() => setDlgTambah(false)}
        onDone={() => {
          setDlgTambah(false)
          load({ silent: true })
        }}
      />
    )
  }

  // ===== Halaman penuh "Edit Anggota" (bukan popup — permintaan owner):
  // pola sama dgn Tambah Anggota — form lengkap + hak akses menu dikelompokkan.
  if (editTarget) {
    return (
      <HalamanEditAnggota
        key={editTarget.id}
        target={editTarget}
        onBatal={() => setEditTarget(null)}
        onDone={() => {
          setEditTarget(null)
          load({ silent: true })
        }}
      />
    )
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* ===== Header grup ===== */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-extrabold tracking-tight md:text-2xl">{grup.nama}</h1>
            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">
              <Hash className="mr-1 h-3 w-3" />{grup.kode}
            </Badge>
            {grup.status !== 'aktif' && (
              <Badge className="bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-300">Dinonaktifkan</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Owner: <span className="font-medium text-foreground">{grup.ownerNama || '-'}</span>
            {' · '}Anda sebagai <span className="font-medium text-foreground">{data.saya?.peran === 'owner' ? 'Owner' : data.saya?.peran === 'admin' ? 'Admin' : 'Staf'}</span>
          </p>
        </div>
        {adalahOwner && (
          <Button
            onClick={() => (grup.sisa > 0 ? setDlgTambah(true) : toast.warning(PESAN_KUOTA_PENUH))}
            className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700"
            data-testid="tombol-tambah-anggota"
          >
            <UserPlus className="mr-2 h-4 w-4" /> Tambah Anggota
          </Button>
        )}
      </div>

      {/* ===== Kartu ringkas ===== */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatKotak icon={Building2} label="Nama Grup" value={grup.nama} sub={grup.kode} />
        <StatKotak icon={PackageCheck} label="Paket" value={grup.paket} sub={`Kuota ${grup.kuotaAkun} akun`} />
        <StatKotak
          icon={Users}
          label="Akun Terpakai"
          value={`${grup.terpakai} / ${grup.kuotaAkun}`}
          sub={grup.sisa > 0 ? `Sisa ${grup.sisa} akun` : 'Kuota penuh'}
          progress={persenTerpakai}
        />
        <StatKotak
          icon={CalendarDays}
          label="Status Langganan"
          value={lang.label}
          sub={grup.langganan?.endDate ? `Berlaku s/d ${fmtTanggal(grup.langganan.endDate)}` : '-'}
        />
      </div>

      {grup.status !== 'aktif' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          Grup dinonaktifkan oleh admin Darrellsoft{grup.suspendReason ? ` — ${grup.suspendReason}` : ''}. Seluruh anggota tidak dapat login sampai grup diaktifkan kembali.
        </div>
      )}

      {/* ===== Tab pill ===== */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-stone-200 bg-stone-50 p-1 dark:border-zinc-700 dark:bg-zinc-800" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors md:text-sm ${
              tab === t.key
                ? 'bg-white shadow-sm text-stone-900 dark:bg-zinc-900 dark:text-zinc-100'
                : 'text-stone-500 hover:text-stone-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* ===== Konten tab ===== */}
      {tab === 'ringkasan' && (
        <div className="space-y-4">
          <KartuAnggota
            anggota={anggota}
            adalahOwner={adalahOwner}
            ringkas
            onEdit={setEditTarget}
            onReset={setResetTarget}
            onToggle={setToggleTarget}
            onKeluarkan={setKeluarkanTarget}
          />
          {adalahOwner && grup.sisa === 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              {PESAN_KUOTA_PENUH}
            </div>
          )}
        </div>
      )}

      {tab === 'perusahaan' && (
        <FormPerusahaan
          namaAwal={grup.nama}
          bisaEdit={adalahOwner}
          onSaved={() => load({ silent: true })}
        />
      )}

      {tab === 'anggota' && (
        <KartuAnggota
          anggota={anggota}
          adalahOwner={adalahOwner}
          onEdit={setEditTarget}
          onReset={setResetTarget}
          onToggle={setToggleTarget}
          onKeluarkan={setKeluarkanTarget}
        />
      )}

      {tab === 'langganan' && (
        <KartuLangganan grup={grup} lang={lang} />
      )}

      {/* Edit anggota kini HALAMAN PENUH (HalamanEditAnggota) — bukan popup.
          Reset sandi tetap dialog kecil. */}

      {/* ===== Dialog reset sandi ===== */}
      <DialogResetSandi
        target={resetTarget}
        onOpenChange={(o) => !o && setResetTarget(null)}
      />

      {/* ===== Konfirmasi nonaktif/aktif ===== */}
      <AlertDialog open={!!toggleTarget} onOpenChange={(o) => !o && setToggleTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleTarget?.status === 'aktif' ? 'Nonaktifkan anggota?' : 'Aktifkan kembali anggota?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.status === 'aktif'
                ? `${toggleTarget?.namaLengkap} tidak akan bisa login sampai diaktifkan kembali oleh Owner. Data yang pernah dibuat tetap tersimpan sebagai data perusahaan.`
                : `${toggleTarget?.namaLengkap} akan dapat login kembali dengan akses menu yang sama.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              data-testid="konfirmasi-toggle-anggota"
              className={toggleTarget?.status === 'aktif' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}
              onClick={() => toggleTarget && doToggle(toggleTarget)}
            >
              Ya, {toggleTarget?.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== Konfirmasi keluarkan ===== */}
      <AlertDialog open={!!keluarkanTarget} onOpenChange={(o) => !o && setKeluarkanTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Keluarkan anggota dari grup?</AlertDialogTitle>
            <AlertDialogDescription>
              {keluarkanTarget?.namaLengkap} akan dihapus dari grup dan akun loginnya ditutup.
              Data yang pernah dibuat tetap tersimpan sebagai data perusahaan dan kuota langsung tersedia kembali.
              Tindakan ini dicatat pada riwayat aktivitas grup.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              data-testid="konfirmasi-keluarkan-anggota"
              className="bg-red-600 hover:bg-red-700"
              onClick={() => keluarkanTarget && doKeluarkan(keluarkanTarget)}
            >
              Ya, Keluarkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ===== Stat kotak =====
function StatKotak({
  icon: Icon, label, value, sub, progress,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub?: string
  progress?: number
}) {
  return (
    <Card className="rounded-2xl p-0 gap-0">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4 text-emerald-600" />
          <p className="text-xs font-medium">{label}</p>
        </div>
        <p className="mt-1.5 truncate text-lg font-bold md:text-xl">{value}</p>
        {sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>}
        {progress !== undefined && <Progress value={progress} className="mt-2 h-1.5" />}
      </CardContent>
    </Card>
  )
}

// ===== Tabel / kartu anggota =====
function KartuAnggota({
  anggota, adalahOwner, ringkas, onEdit, onReset, onToggle, onKeluarkan,
}: {
  anggota: Anggota[]
  adalahOwner: boolean
  ringkas?: boolean
  onEdit: (a: Anggota) => void
  onReset: (a: Anggota) => void
  onToggle: (a: Anggota) => void
  onKeluarkan: (a: Anggota) => void
}) {
  const [q, setQ] = useState('')
  const [filterStatus, setFilterStatus] = useState<'semua' | 'aktif' | 'nonaktif'>('semua')
  const [halaman, setHalaman] = useState(1)
  const perHalaman = 8

  const terfilter = useMemo(() => {
    let rows = anggota
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      rows = rows.filter((a) =>
        a.namaLengkap.toLowerCase().includes(s) ||
        (a.username ?? '').toLowerCase().includes(s) ||
        a.email.toLowerCase().includes(s))
    }
    if (filterStatus !== 'semua') rows = rows.filter((a) => a.status === filterStatus)
    return rows
  }, [anggota, q, filterStatus])

  const totalHalaman = Math.max(1, Math.ceil(terfilter.length / perHalaman))
  const hal = Math.min(halaman, totalHalaman)
  const rows = ringkas ? terfilter : terfilter.slice((hal - 1) * perHalaman, hal * perHalaman)

  return (
    <Card className="rounded-2xl" data-testid="kartu-anggota-grup">
      <CardHeader className="flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="text-base">Anggota Grup ({terfilter.length})</CardTitle>
        {!ringkas && (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={q}
              onChange={(e) => { setQ(e.target.value); setHalaman(1) }}
              placeholder="Cari nama / username…"
              className="h-9 w-40 sm:w-56"
              aria-label="Cari anggota"
            />
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value as 'semua' | 'aktif' | 'nonaktif'); setHalaman(1) }}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              aria-label="Filter status"
            >
              <option value="semua">Semua status</option>
              <option value="aktif">Aktif</option>
              <option value="nonaktif">Nonaktif</option>
            </select>
          </div>
        )}
      </CardHeader>
      <CardContent className={ringkas ? 'pb-4' : undefined}>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada anggota yang cocok.</p>
        ) : (
          <>
            {/* Desktop: tabel */}
            <div className="hidden overflow-x-auto rounded-xl border border-border sm:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50 text-left text-xs font-semibold text-muted-foreground">
                    <th className="p-2.5">Nama</th>
                    <th className="p-2.5">Username</th>
                    <th className="p-2.5">Peran</th>
                    <th className="p-2.5">Status</th>
                    {!ringkas && <th className="p-2.5">Hak Akses</th>}
                    {!ringkas && <th className="p-2.5">Bergabung</th>}
                    {!ringkas && adalahOwner && <th className="p-2.5 text-right">Aksi</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id} className="border-b border-border align-top hover:bg-accent/30">
                      <td className="p-2.5">
                        <div className="font-medium">{a.namaLengkap}</div>
                        <div className="text-xs text-muted-foreground">{a.email || '-'}</div>
                      </td>
                      <td className="p-2.5 whitespace-nowrap">{a.username ?? '-'}</td>
                      <td className="p-2.5 whitespace-nowrap">
                        {a.peran === 'owner' ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300"><Crown className="mr-1 h-3 w-3" />Owner</Badge>
                        ) : a.peran === 'admin' ? 'Admin' : 'Staf'}
                      </td>
                      <td className="p-2.5 whitespace-nowrap">
                        {a.status === 'aktif' ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">Aktif</Badge>
                        ) : (
                          <Badge className="bg-stone-200 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300">Nonaktif</Badge>
                        )}
                      </td>
                      {!ringkas && (
                        <td className="p-2.5">
                          {a.peran === 'owner' ? 'Semua akses' : a.izin.length === 0 ? <span className="text-muted-foreground">—</span> : (
                            <div className="flex max-w-[220px] flex-wrap gap-1">
                              {a.izin.map((z) => (
                                <Badge key={z} variant="outline" className="text-[10px]">
                                  {MENU_IZIN.find((m) => m.id === z)?.label ?? z}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </td>
                      )}
                      {!ringkas && <td className="p-2.5 whitespace-nowrap text-muted-foreground">{fmtTanggal(a.tanggalGabung)}</td>}
                      {!ringkas && adalahOwner && (
                        <td className="p-2.5">
                          {a.peran !== 'owner' && (
                            <div className="flex items-center justify-end gap-1">
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Edit" onClick={() => onEdit(a)}><Pencil className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Reset sandi" onClick={() => onReset(a)}><KeyRound className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title={a.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'} onClick={() => onToggle(a)}><Power className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-600 hover:text-red-700" title="Keluarkan" onClick={() => onKeluarkan(a)}><UserMinus className="h-4 w-4" /></Button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: kartu */}
            <div className="space-y-2 sm:hidden">
              {rows.map((a) => (
                <div key={a.id} className="rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{a.namaLengkap}</div>
                      <div className="truncate text-xs text-muted-foreground">{a.username ?? '-'} · {a.email || '-'}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {a.peran === 'owner' ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300"><Crown className="mr-1 h-3 w-3" />Owner</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">{a.peran === 'admin' ? 'Admin' : 'Staf'}</Badge>
                        )}
                        <Badge variant="outline" className={`text-[10px] ${a.status === 'aktif' ? 'border-emerald-300 text-emerald-700' : 'border-stone-300 text-stone-500'}`}>{a.status}</Badge>
                        <span className="text-[10px] text-muted-foreground">· gabung {fmtTanggal(a.tanggalGabung)}</span>
                      </div>
                    </div>
                  </div>
                  {!ringkas && a.peran !== 'owner' && a.izin.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {a.izin.map((z) => (
                        <Badge key={z} variant="outline" className="text-[10px]">{MENU_IZIN.find((m) => m.id === z)?.label ?? z}</Badge>
                      ))}
                    </div>
                  )}
                  {!ringkas && adalahOwner && a.peran !== 'owner' && (
                    <div className="mt-2 flex flex-wrap gap-1 border-t pt-2">
                      <Button size="sm" variant="outline" className="h-8" onClick={() => onEdit(a)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
                      <Button size="sm" variant="outline" className="h-8" onClick={() => onReset(a)}><KeyRound className="mr-1 h-3.5 w-3.5" />Sandi</Button>
                      <Button size="sm" variant="outline" className="h-8" onClick={() => onToggle(a)}><Power className="mr-1 h-3.5 w-3.5" />{a.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'}</Button>
                      <Button size="sm" variant="outline" className="h-8 text-red-600" onClick={() => onKeluarkan(a)}><UserMinus className="mr-1 h-3.5 w-3.5" />Keluarkan</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {!ringkas && totalHalaman > 1 && (
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Hal {hal} dari {totalHalaman}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-8" disabled={hal <= 1} onClick={() => setHalaman(hal - 1)}>Sebelumnya</Button>
                  <Button size="sm" variant="outline" className="h-8" disabled={hal >= totalHalaman} onClick={() => setHalaman(hal + 1)}>Berikutnya</Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ===== Form data perusahaan =====
function FormPerusahaan({ namaAwal, bisaEdit, onSaved }: { namaAwal: string; bisaEdit: boolean; onSaved: () => void }) {
  const [nama, setNama] = useState(namaAwal)
  const [saving, setSaving] = useState(false)

  const simpan = async () => {
    if (!nama.trim()) { toast.error('Nama perusahaan wajib diisi.'); return }
    setSaving(true)
    try {
      const res = await authFetch('/api/grup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nama: nama.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal menyimpan')
      toast.success('Data perusahaan tersimpan')
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan data perusahaan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Data Perusahaan</CardTitle>
        <p className="text-xs text-muted-foreground">Nama perusahaan tampil pada dashboard seluruh anggota grup.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="nama-perusahaan">Nama Perusahaan / Grup</Label>
          <Input
            id="nama-perusahaan"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            disabled={!bisaEdit}
            maxLength={120}
            placeholder="cth. PT Contoh Percetakan"
            data-testid="input-nama-perusahaan"
          />
        </div>
        {bisaEdit ? (
          <Button onClick={simpan} disabled={saving} className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700" data-testid="simpan-perusahaan">
            {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Hanya Owner yang dapat mengubah data perusahaan.</p>
        )}
      </CardContent>
    </Card>
  )
}

// ===== Kartu langganan =====
function KartuLangganan({ grup, lang }: { grup: GrupInfo; lang: { label: string; cls: string } }) {
  const router = useRouter()
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Langganan Grup</CardTitle>
        <p className="text-xs text-muted-foreground">Seluruh akun anggota mengikuti masa berlaku langganan grup (pemilik langganan: Owner).</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border p-3">
            <p className="text-xs text-muted-foreground">Paket</p>
            <p className="mt-1 font-semibold">{grup.paket}</p>
            <p className="text-xs text-muted-foreground">{grup.kuotaAkun} akun</p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-xs text-muted-foreground">Status</p>
            <div className="mt-1"><Badge className={lang.cls}>{lang.label}</Badge></div>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-xs text-muted-foreground">Mulai</p>
            <p className="mt-1 font-semibold">{fmtTanggal(grup.langganan?.startDate)}</p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-xs text-muted-foreground">Berakhir</p>
            <p className="mt-1 font-semibold">{fmtTanggal(grup.langganan?.endDate)}</p>
          </div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Pemakaian akun</span>
            <span className="font-semibold">{grup.terpakai} dari {grup.kuotaAkun} akun ({grup.sisa} tersedia)</span>
          </div>
          <Progress className="mt-2 h-2" value={grup.kuotaAkun > 0 ? Math.min(100, (grup.terpakai / grup.kuotaAkun) * 100) : 0} />
        </div>
        <Button
          className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700"
          onClick={() => { startNavigation(); router.push('/pilih-paket') }}
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Perpanjang / Ganti Paket
        </Button>
      </CardContent>
    </Card>
  )
}

// ===== Halaman penuh "Tambah Anggota" =====
// Klik "Tambah Anggota" membuka HALAMAN anggota (bukan dialog kecil — permintaan
// owner) dengan form lengkap dan hak akses menu LENGKAP dikelompokkan per seksi.
function HalamanTambahAnggota({
  sisa, onBatal, onDone,
}: {
  sisa: number
  onBatal: () => void
  onDone: () => void
}) {
  const router = useRouter()
  const [namaLengkap, setNama] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [nomorHP, setNomorHP] = useState('')
  const [peran, setPeran] = useState('staf')
  const [password, setPassword] = useState('')
  const [lihatSandi, setLihatSandi] = useState(false)
  const [izin, setIzin] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const toggleIzin = (id: string) =>
    setIzin((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const pilihSemua = () => setIzin(MENU_IZIN.map((m) => m.id))
  const hapusSemua = () => setIzin([])

  const kembali = () => {
    startNavigation()
    router.push('/grup')
    onBatal()
  }

  const simpan = async () => {
    if (!namaLengkap.trim()) { toast.error('Nama lengkap wajib diisi.'); return }
    if (!username.trim()) { toast.error('Username wajib diisi.'); return }
    if (password && password.length < 6) { toast.error('Kata sandi minimal 6 karakter.'); return }
    setSaving(true)
    try {
      const res = await authFetch('/api/grup/anggota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ namaLengkap, username, email, nomorHP, peran, izin, password }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal menambah anggota')
      onDone()
      if (json.sandiAwal) {
        toast.success(`Anggota ditambahkan. Kata sandi awal: ${json.sandiAwal}`, {
          description: 'Bagikan kata sandi ini ke anggota — hanya ditampilkan sekali.',
          duration: 15000,
        })
      } else if (password) {
        toast.success('Anggota berhasil ditambahkan dengan kata sandi akun yang Anda atur.')
      } else {
        toast.success('Anggota berhasil ditambahkan')
      }
      setNama(''); setUsername(''); setEmail(''); setNomorHP(''); setIzin([]); setPeran('staf'); setPassword(''); setLihatSandi(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menambah anggota')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 md:space-y-6" data-testid="halaman-tambah-anggota">
      {/* Header halaman */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button
            variant="outline"
            size="sm"
            onClick={kembali}
            className="mb-2 min-h-[36px]"
            data-testid="tambah-kembali"
          >
            ← Kembali ke Grup Saya
          </Button>
          <h1 className="text-xl font-extrabold tracking-tight md:text-2xl">Tambah Anggota Grup</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sisa kuota: <span className="font-semibold text-foreground">{sisa}</span> akun.
            Anggota mendapat akun login sendiri dan bekerja pada data perusahaan yang sama.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ===== Kolom kiri: data anggota ===== */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Data Anggota</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-nama">Nama Lengkap *</Label>
              <Input id="t-nama" value={namaLengkap} onChange={(e) => setNama(e.target.value)} maxLength={120} placeholder="cth. Budi Susanto" data-testid="tambah-nama" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="t-username">Username *</Label>
                <Input id="t-username" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={40} placeholder="cth. budi" data-testid="tambah-username" />
                <p className="text-[11px] text-muted-foreground">
                  Unik di dalam grup ini — boleh sama dengan akun di luar grup (pengelola/grup lain).
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-hp">Nomor HP</Label>
                <Input id="t-hp" value={nomorHP} onChange={(e) => setNomorHP(e.target.value)} maxLength={25} placeholder="08…" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-email">Email</Label>
              <Input id="t-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} placeholder="opsional" />
            </div>
            <div className="space-y-1.5">
              <Label>Peran</Label>
              <select
                value={peran}
                onChange={(e) => setPeran(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                aria-label="Peran anggota"
              >
                <option value="staf">Staf</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-password">Kata Sandi Akun</Label>
              <div className="relative">
                <Input
                  id="t-password"
                  type={lihatSandi ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  maxLength={72}
                  autoComplete="new-password"
                  placeholder="Min. 6 karakter — opsional"
                  className="pr-10"
                  data-testid="tambah-password"
                />
                <button
                  type="button"
                  onClick={() => setLihatSandi((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
                  aria-label={lihatSandi ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                  title={lihatSandi ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                  data-testid="tambah-password-lihat"
                >
                  {lihatSandi ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Sandi untuk akun login anggota. Kosongkan agar sistem membuat kata sandi otomatis.
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
              Jika kata sandi tidak diisi, sistem membuat kata sandi otomatis dan
              menampilkannya SEKALI setelah anggota tersimpan. Sandi yang Anda tulis
              sendiri TIDAK ditampilkan kembali — catat di tempat aman.
            </div>
          </CardContent>
        </Card>

        {/* ===== Kolom kanan: hak akses menu LENGKAP ===== */}
        <Card className="rounded-2xl">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-3">
            <div>
              <CardTitle className="text-base">Hak Akses Menu (RBAC)</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Daftar lengkap semua menu aplikasi — centang menu yang boleh dibuka anggota.
              </p>
            </div>
            <div className="flex gap-1.5">
              <Button type="button" size="sm" variant="outline" className="h-8" onClick={pilihSemua} data-testid="izin-pilih-semua">
                Pilih Semua
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-8" onClick={hapusSemua} data-testid="izin-hapus-semua">
                Hapus Semua
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-lg border p-3" data-testid="daftar-hak-akses">
              {IZIN_GRUP_ORDER.map((namaGrup) => {
                const items = MENU_IZIN.filter((m) => m.grup === namaGrup)
                if (items.length === 0) return null
                const semuaTerpilih = items.every((m) => izin.includes(m.id))
                return (
                  <div key={namaGrup}>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{namaGrup}</p>
                      <button
                        type="button"
                        className="text-[10px] font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                        onClick={() => {
                          if (semuaTerpilih) {
                            setIzin((prev) => prev.filter((x) => !items.some((m) => m.id === x)))
                          } else {
                            setIzin((prev) => [...new Set([...prev, ...items.map((m) => m.id)])])
                          }
                        }}
                      >
                        {semuaTerpilih ? 'Kosongkan seksi' : 'Pilih seksi'}
                      </button>
                    </div>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {items.map((m) => (
                        <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-accent/40">
                          <Checkbox checked={izin.includes(m.id)} onCheckedChange={() => toggleIzin(m.id)} data-testid={`izin-${m.id}`} />
                          <span className="min-w-0 truncate">{m.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {izin.length} dari {MENU_IZIN.length} menu dipilih. Tanpa pilihan = anggota belum dapat mengakses menu data sampai Owner mengaturnya.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tombol aksi */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={kembali} disabled={saving} className="min-h-[44px]">
          Batal
        </Button>
        <Button onClick={simpan} disabled={saving} className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700" data-testid="tambah-simpan">
          {saving ? 'Menyimpan…' : 'Simpan Anggota Baru'}
        </Button>
      </div>
    </div>
  )
}

// ===== Halaman penuh "Edit Anggota" (pengganti popup — permintaan owner):
// pola & tampilan sama dgn HalamanTambahAnggota — form lengkap + hak akses
// menu dikelompokkan per seksi. Username & sandi tidak diubah di sini
// (sandi diatur via Reset Kata Sandi).
function HalamanEditAnggota({
  target, onBatal, onDone,
}: {
  target: Anggota
  onBatal: () => void
  onDone: () => void
}) {
  const router = useRouter()
  const [namaLengkap, setNama] = useState(target.namaLengkap)
  const [email, setEmail] = useState(target.email)
  const [nomorHP, setNomorHP] = useState(target.nomorHP)
  const [peran, setPeran] = useState(target.peran === 'admin' ? 'admin' : 'staf')
  const [izin, setIzin] = useState<string[]>(target.izin)
  const [saving, setSaving] = useState(false)

  const toggleIzin = (id: string) =>
    setIzin((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const pilihSemua = () => setIzin(MENU_IZIN.map((m) => m.id))
  const hapusSemua = () => setIzin([])

  const kembali = () => {
    startNavigation()
    router.push('/grup')
    onBatal()
  }

  const simpan = async () => {
    if (!namaLengkap.trim()) { toast.error('Nama lengkap wajib diisi.'); return }
    setSaving(true)
    try {
      const res = await authFetch(`/api/grup/anggota/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ namaLengkap, nomorHP, email, peran, izin }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal menyimpan')
      toast.success('Perubahan anggota tersimpan')
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan anggota')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 md:space-y-6" data-testid="halaman-edit-anggota">
      {/* Header halaman */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button
            variant="outline"
            size="sm"
            onClick={kembali}
            className="mb-2 min-h-[36px]"
            data-testid="edit-kembali"
          >
            ← Kembali ke Grup Saya
          </Button>
          <h1 className="text-xl font-extrabold tracking-tight md:text-2xl">Edit Anggota Grup</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            @{target.username || '-'}{' · '}Status:{' '}
            <span className={target.status === 'aktif' ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'font-semibold text-red-700 dark:text-red-400'}>
              {target.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
            </span>
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ===== Kolom kiri: data anggota ===== */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Data Anggota</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="e-nama">Nama Lengkap *</Label>
              <Input id="e-nama" value={namaLengkap} onChange={(e) => setNama(e.target.value)} maxLength={120} placeholder="cth. Budi Susanto" data-testid="edit-nama" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-username">Username</Label>
              <Input id="e-username" value={target.username || '-'} disabled readOnly className="bg-muted text-muted-foreground" />
              <p className="text-[11px] text-muted-foreground">
                Username tidak dapat diubah — identitas login akun anggota.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="e-hp">Nomor HP</Label>
                <Input id="e-hp" value={nomorHP} onChange={(e) => setNomorHP(e.target.value)} maxLength={25} placeholder="08…" data-testid="edit-hp" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-email">Email</Label>
                <Input id="e-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} placeholder="opsional" data-testid="edit-email" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Peran</Label>
              <select
                value={peran}
                onChange={(e) => setPeran(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                aria-label="Peran anggota"
                data-testid="edit-peran"
              >
                <option value="staf">Staf</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300">
              Untuk mengganti kata sandi anggota, gunakan aksi <span className="font-semibold">Reset Kata Sandi</span> di daftar anggota.
            </div>
          </CardContent>
        </Card>

        {/* ===== Kolom kanan: hak akses menu LENGKAP ===== */}
        <Card className="rounded-2xl">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-3">
            <div>
              <CardTitle className="text-base">Hak Akses Menu (RBAC)</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Daftar lengkap semua menu aplikasi — centang menu yang boleh dibuka anggota.
              </p>
            </div>
            <div className="flex gap-1.5">
              <Button type="button" size="sm" variant="outline" className="h-8" onClick={pilihSemua} data-testid="edit-izin-pilih-semua">
                Pilih Semua
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-8" onClick={hapusSemua} data-testid="edit-izin-hapus-semua">
                Hapus Semua
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-lg border p-3" data-testid="edit-izin">
              {IZIN_GRUP_ORDER.map((namaGrup) => {
                const items = MENU_IZIN.filter((m) => m.grup === namaGrup)
                if (items.length === 0) return null
                const semuaTerpilih = items.every((m) => izin.includes(m.id))
                return (
                  <div key={namaGrup}>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{namaGrup}</p>
                      <button
                        type="button"
                        className="text-[10px] font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                        onClick={() => {
                          if (semuaTerpilih) {
                            setIzin((prev) => prev.filter((x) => !items.some((m) => m.id === x)))
                          } else {
                            setIzin((prev) => [...new Set([...prev, ...items.map((m) => m.id)])])
                          }
                        }}
                      >
                        {semuaTerpilih ? 'Kosongkan seksi' : 'Pilih seksi'}
                      </button>
                    </div>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {items.map((m) => (
                        <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-accent/40">
                          <Checkbox checked={izin.includes(m.id)} onCheckedChange={() => toggleIzin(m.id)} data-testid={`edit-izin-${m.id}`} />
                          <span className="min-w-0 truncate">{m.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {izin.length} dari {MENU_IZIN.length} menu dipilih. Tanpa pilihan = anggota belum dapat mengakses menu data sampai Owner mengaturnya.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tombol aksi */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={kembali} disabled={saving} className="min-h-[44px]">
          Batal
        </Button>
        <Button onClick={simpan} disabled={saving} className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700" data-testid="edit-simpan">
          {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
        </Button>
      </div>
    </div>
  )
}

// ===== Dialog reset sandi =====
function DialogResetSandi({ target, onOpenChange }: { target: Anggota | null; onOpenChange: (o: boolean) => void }) {
  const [hasil, setHasil] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (!target) setHasil(null) }, [target])

  const reset = async () => {
    if (!target) return
    setLoading(true)
    try {
      const res = await authFetch(`/api/grup/anggota/${target.id}/reset-sandi`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal reset sandi')
      setHasil(json.sandibaru)
      toast.success('Kata sandi berhasil direset')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal reset kata sandi')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset Kata Sandi</DialogTitle>
          <DialogDescription>
            Reset sandi untuk {target?.namaLengkap} ({target?.username ? `@${target.username}` : '-'}). Sandi baru dibuat otomatis dan hanya ditampilkan sekali.
          </DialogDescription>
        </DialogHeader>
        {hasil ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
              <span className="font-mono text-lg font-bold tracking-wider" data-testid="hasil-sandi-baru">{hasil}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard?.writeText(hasil).then(() => toast.success('Sandi disalin')).catch(() => toast.error('Gagal menyalin'))
                }}
              >
                <Copy className="mr-1 h-3.5 w-3.5" /> Salin
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Bagikan sandi ini ke anggota melalui jalur aman. Setelah dialog ditutup, sandi tidak dapat dilihat lagi.</p>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Selesai</Button>
            </DialogFooter>
          </div>
        ) : (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button onClick={reset} disabled={loading} className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700">
              {loading ? 'Mereset…' : 'Reset Sekarang'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ===== Info utk admin sistem (bukan Owner grup) =====
// Admin tidak melihat/menambah data grup — tombol "Tambah Anggota" dan upsell
// paket hanya ada di halaman grup milik akun Owner (pelanggan).
function AdminGrupInfo() {
  const router = useRouter()
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Users className="h-5 w-5 text-emerald-600" /> Grup Perusahaan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Halaman <span className="font-medium text-foreground">Grup Saya</span> hanya untuk
            {' '}<span className="font-medium text-foreground">akun Owner grup perusahaan</span> (pelanggan paket multi-akun).
            Penambahan anggota hanya dapat dilakukan oleh Owner grup masing-masing —
            data grup tidak masuk ke pengguna admin.
          </p>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
            Sebagai admin Darrellsoft, Anda dapat memantau seluruh grup perusahaan
            (owner, anggota, kuota, status langganan, riwayat aktivitas) melalui
            Panel Admin → Manajemen Grup.
          </div>
          <Button
            className="w-full min-h-[44px] bg-emerald-600 hover:bg-emerald-700"
            onClick={() => { startNavigation(); router.push('/panel-admin?tab=grup') }}
            data-testid="admin-buka-manajemen-grup"
          >
            Buka Manajemen Grup (Panel Admin)
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ===== Upsell (tanpa grup) =====
function UpsellView({ paket }: { paket: NonNullable<ResponsGrup['daftarPaketMultiAkun']> }) {
  const router = useRouter()
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Users className="h-5 w-5 text-emerald-600" /> Grup Perusahaan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Dengan paket multi-akun, sistem otomatis membuat <span className="font-medium text-foreground">satu grup perusahaan</span> berisi
            1 akun Owner (Anda) + beberapa akun anggota. Semua akun berbagi satu data perusahaan yang sama —
            customer, invoice, pembayaran, stok bahan, dan laporan tersinkronisasi dengan hak akses masing-masing.
          </p>
          {paket.length === 0 ? (
            <p className="rounded-xl border p-3 text-sm text-muted-foreground">Belum ada paket multi-akun yang tersedia. Hubungi admin Darrellsoft.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {paket.map((p) => (
                <div key={p.id} className={`rounded-2xl border p-4 ${p.isPopular ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20' : ''}`}>
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{p.name}</p>
                    {p.isPopular && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">Terpopuler</Badge>}
                  </div>
                  <p className="mt-1 text-xl font-bold">{rupiah(p.monthlyPrice)}<span className="text-xs font-normal text-muted-foreground"> / bulan</span></p>
                  <Badge variant="outline" className="mt-2">{p.maxAccounts} akun dalam satu grup</Badge>
                  <Button
                    className="mt-3 w-full min-h-[44px] bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => { startNavigation(); router.push(`/konfirmasi-paket?planId=${p.id}`) }}
                  >
                    Pilih {p.name}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
