'use client'

/**
 * Daftar Kategori — kelola kategori bahan kertas yang dipakai di dropdown
 * "Kategori" pada Master Harga Kertas dan dropdown "Kategori" pada
 * Master Toko/Pemasok.
 *
 * CRUD lengkap dgn UI/UX rapi:
 * - Tambah kategori lewat dialog (bukan input baris).
 * - EDIT nama kategori (dialog) — aman utk bahan kertas yg memakainya
 *   (Paper menyimpan kategoriId, nama ikut berubah lewat relasi).
 * - Hapus dgn konfirmasi; kategori yg masih dipakai bahan kertas ditolak.
 * - Pencarian client-side + ringkasan (total kategori, terpakai, pemakaian).
 * - Desktop: tabel; Mobile: kartu.
 * - Halaman TIDAK terdaftar di matriks Hak Akses — tampil untuk semua user login.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ListTree, Plus, Search, Tag, Loader2, Pencil, Trash2, Layers, PackageCheck, BarChart3 } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { getAuthUser } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'
import { useLanguage } from '@/contexts/language-context'
import { notifyDataChange } from '@/lib/data-sync'
import { useDataChange } from '@/hooks/use-data-change'
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

interface Kategori {
  id: string
  nama: string
  userId: string | null
  createdAt: string
  updatedAt: string
}

interface PaperLite {
  id: string
  kategoriId?: string | null
}

export default function DaftarKategoriPage() {
  const { t, language } = useLanguage()

  const [kategoriList, setKategoriList] = useState<Kategori[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Pemakaian kategori oleh bahan kertas (Paper) — untuk guard hapus + badge
  const [usageMap, setUsageMap] = useState<Record<string, number>>({})

  // Dialog tambah/edit
  const [formOpen, setFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Kategori | null>(null)
  const [nama, setNama] = useState('')
  const [saving, setSaving] = useState(false)

  // Konfirmasi hapus
  const [deleteTarget, setDeleteTarget] = useState<Kategori | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchKategori = useCallback(async () => {
    try {
      const response = await authFetch('/api/kategori')
      const data = await response.json()
      setKategoriList(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Error fetching kategori:', error)
      toast.error('Gagal memuat daftar kategori')
    } finally {
      setLoading(false)
    }
  }, [])

  // Muat bahan kertas untuk menghitung pemakaian kategori (guard hapus)
  const fetchPapers = useCallback(async () => {
    try {
      const response = await authFetch('/api/papers')
      const data: PaperLite[] = await response.json()
      const map: Record<string, number> = {}
      if (Array.isArray(data)) {
        for (const p of data) {
          if (p?.kategoriId) map[p.kategoriId] = (map[p.kategoriId] || 0) + 1
        }
      }
      setUsageMap(map)
    } catch {
      // Non-fatal — guard hapus di sisi API tetap berlaku
    }
  }, [])

  useEffect(() => {
    const authUser = getAuthUser()
    if (!authUser) {
      window.location.href = '/login'
      return
    }
    fetchKategori()
    fetchPapers()
  }, [fetchKategori, fetchPapers])

  // Sinkron antar-tab: kategori berubah / bahan kertas berubah (pemakaian)
  useDataChange(['kategori', 'papers'], (entity) => {
    if (entity === 'kategori') fetchKategori()
    if (entity === 'papers') fetchPapers()
  })

  const sortedList = useMemo(
    () => [...kategoriList].sort((a, b) => a.nama.localeCompare(b.nama)),
    [kategoriList]
  )

  const filteredList = useMemo(
    () =>
      sortedList.filter((k) =>
        k.nama.toLowerCase().includes(searchTerm.trim().toLowerCase())
      ),
    [sortedList, searchTerm]
  )

  const usedCount = useMemo(
    () => Object.values(usageMap).filter((n) => n > 0).length,
    [usageMap]
  )
  const totalUsage = useMemo(
    () => Object.values(usageMap).reduce((a, b) => a + b, 0),
    [usageMap]
  )

  const openAdd = () => {
    setEditingItem(null)
    setNama('')
    setFormOpen(true)
  }

  const openEdit = (k: Kategori) => {
    setEditingItem(k)
    setNama(k.nama)
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = nama.trim()
    if (!trimmed) return
    if (saving) return

    // Cegah duplikat di sisi client juga (API tetap menolak dgn 409)
    const duplicate = kategoriList.some(
      (k) => k.nama.toLowerCase() === trimmed.toLowerCase() && k.id !== editingItem?.id
    )
    if (duplicate) {
      toast.error(`Kategori "${trimmed}" sudah ada`)
      return
    }

    setSaving(true)
    try {
      const response = editingItem
        ? await authFetch('/api/kategori', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editingItem.id, nama: trimmed }),
          })
        : await authFetch('/api/kategori', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nama: trimmed }),
          })
      const data = await response.json().catch(() => null)
      if (response.ok) {
        toast.success(
          editingItem
            ? `Kategori "${editingItem.nama}" berhasil diubah menjadi "${trimmed}"`
            : `Kategori "${trimmed}" berhasil ditambahkan`
        )
        setFormOpen(false)
        setEditingItem(null)
        setNama('')
        await fetchKategori()
        notifyDataChange('kategori')
      } else {
        toast.error(data?.error || (editingItem ? 'Gagal mengubah kategori' : 'Gagal menambahkan kategori'))
      }
    } catch (error) {
      console.error('Error saving kategori:', error)
      toast.error(editingItem ? 'Gagal mengubah kategori' : 'Gagal menambahkan kategori')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return
    const target = deleteTarget
    const used = usageMap[target.id] || 0

    // Tolak hapus jika masih dipakai bahan kertas
    if (used > 0) {
      setDeleteTarget(null)
      toast.error(
        `Kategori "${target.nama}" masih dipakai oleh ${used} bahan kertas dan tidak bisa dihapus`
      )
      return
    }

    setDeleting(true)
    try {
      const response = await authFetch(`/api/kategori?id=${encodeURIComponent(target.id)}`, {
        method: 'DELETE',
      })
      const data = await response.json().catch(() => null)
      if (response.ok) {
        toast.success(`Kategori "${target.nama}" berhasil dihapus`)
        setDeleteTarget(null)
        await Promise.all([fetchKategori(), fetchPapers()])
        notifyDataChange('kategori')
      } else {
        toast.error(data?.error || 'Gagal menghapus kategori')
      }
    } catch (error) {
      console.error('Error deleting kategori:', error)
      toast.error('Gagal menghapus kategori')
    } finally {
      setDeleting(false)
    }
  }

  const deleteUsedCount = deleteTarget ? usageMap[deleteTarget.id] || 0 : 0

  const subtitle = `${kategoriList.length} ${language === 'en' ? 'categories' : 'kategori'} · ${t('subtitle_daftar_kategori')}`

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(language === 'en' ? 'en-US' : 'id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return '-'
    }
  }

  const usageBadge = (k: Kategori) => {
    const used = usageMap[k.id] || 0
    if (used > 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-medium text-emerald-700 whitespace-nowrap">
          <PackageCheck className="w-3 h-3" />
          Dipakai {used} bahan
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[11px] text-slate-500 whitespace-nowrap">
        Belum dipakai
      </span>
    )
  }

  return (
    <DashboardLayout title={t('daftar_kategori')} subtitle={subtitle}>
      {/* Ringkasan */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4">
        <div className="bg-card rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4">
          <div className="flex items-center gap-2 text-slate-400">
            <Layers className="w-4 h-4 flex-shrink-0" />
            <span className="text-[11px] sm:text-xs font-medium uppercase tracking-wide">Total</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-slate-800 mt-1">{kategoriList.length}</p>
          <p className="text-[11px] text-slate-400 hidden sm:block">kategori terdaftar</p>
        </div>
        <div className="bg-card rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4">
          <div className="flex items-center gap-2 text-slate-400">
            <PackageCheck className="w-4 h-4 flex-shrink-0" />
            <span className="text-[11px] sm:text-xs font-medium uppercase tracking-wide">Terpakai</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-emerald-600 mt-1">{usedCount}</p>
          <p className="text-[11px] text-slate-400 hidden sm:block">kategori dipakai bahan</p>
        </div>
        <div className="bg-card rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4">
          <div className="flex items-center gap-2 text-slate-400">
            <BarChart3 className="w-4 h-4 flex-shrink-0" />
            <span className="text-[11px] sm:text-xs font-medium uppercase tracking-wide">Pemakaian</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-blue-600 mt-1">{totalUsage}</p>
          <p className="text-[11px] text-slate-400 hidden sm:block">total di semua bahan</p>
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-slate-200">
        {/* Toolbar: pencarian + tambah */}
        <div className="p-3 sm:p-4 border-b border-slate-200 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari kategori..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button onClick={openAdd} className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            {t('tambah')} Kategori
          </Button>
        </div>

        {/* Daftar kategori */}
        <div className="p-3 sm:p-4 lg:p-6 min-h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : filteredList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ListTree className="w-16 h-16 mx-auto text-slate-300" />
              <p className="mt-4 text-sm font-medium text-slate-600">
                {kategoriList.length === 0
                  ? 'Belum ada kategori'
                  : 'Tidak ada kategori ditemukan'}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {kategoriList.length === 0
                  ? 'Tambahkan kategori pertama Anda dengan tombol "Tambah Kategori"'
                  : 'Coba kata kunci pencarian lain'}
              </p>
              {kategoriList.length === 0 && (
                <Button onClick={openAdd} className="mt-4" size="sm">
                  <Plus className="w-4 h-4 mr-1.5" />
                  Tambah Kategori
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Desktop: tabel */}
              <div className="hidden lg:block overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[50px] text-center">#</TableHead>
                      <TableHead className="min-w-[220px]">Nama Kategori</TableHead>
                      <TableHead className="min-w-[150px]">Pemakaian</TableHead>
                      <TableHead className="min-w-[130px]">Dibuat</TableHead>
                      <TableHead className="text-center w-[110px]">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredList.map((k, idx) => (
                      <TableRow key={k.id} className="group">
                        <TableCell className="text-center text-slate-400 text-xs">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                              <Tag className="w-4 h-4 text-blue-600" />
                            </div>
                            <span className="font-medium text-slate-800">{k.nama}</span>
                          </div>
                        </TableCell>
                        <TableCell>{usageBadge(k)}</TableCell>
                        <TableCell className="text-slate-500 text-xs">{formatDate(k.createdAt)}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(k)}
                              aria-label={`Edit kategori ${k.nama}`}
                              className="h-7 w-7 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteTarget(k)}
                              aria-label={`Hapus kategori ${k.nama}`}
                              className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile: kartu */}
              <div className="lg:hidden space-y-2">
                {filteredList.map((k) => (
                  <div key={k.id} className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <Tag className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm text-slate-800 truncate">{k.nama}</h3>
                        <div className="mt-1">{usageBadge(k)}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <span className="text-[11px] text-slate-400">Dibuat {formatDate(k.createdAt)}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(k)}
                          className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors active:scale-95"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteTarget(k)}
                          className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors active:scale-95"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Hapus
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Dialog tambah/edit kategori */}
      <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) setEditingItem(null) }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Kategori' : 'Tambah Kategori Baru'}</DialogTitle>
            <DialogDescription>
              {editingItem
                ? 'Ubah nama kategori — bahan kertas yang memakainya otomatis ikut berubah'
                : 'Beri nama kategori baru, nanti bisa dipilih di Master Harga Kertas & Master Toko/Pemasok'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="nama-kategori" className="text-sm font-medium">
                  Nama Kategori
                </Label>
                <Input
                  id="nama-kategori"
                  type="text"
                  placeholder="Contoh: Art Paper, Ivory, Karton"
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  maxLength={100}
                  autoFocus
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
                Batal
              </Button>
              <Button type="submit" disabled={!nama.trim() || saving}>
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menyimpan...</> : t('simpan')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Konfirmasi hapus */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus kategori?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteUsedCount > 0 ? (
                <>
                  Kategori <span className="font-semibold">{deleteTarget?.nama}</span> masih
                  dipakai oleh {deleteUsedCount} bahan kertas dan tidak bisa dihapus. Lepaskan
                  kategori ini dari bahan kertas terkait terlebih dahulu di Master Harga Kertas.
                </>
              ) : (
                <>
                  Kategori <span className="font-semibold">{deleteTarget?.nama}</span> akan
                  dihapus permanen. Tindakan ini tidak bisa dibatalkan.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleting || deleteUsedCount > 0}
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
            >
              {deleting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  )
}
