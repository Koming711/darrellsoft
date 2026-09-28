'use client'

/**
 * Daftar Kategori — kelola kategori bahan kertas yang dipakai di dropdown
 * "Kategori" pada Master Harga Kertas (pola produksi v123).
 *
 * - Tambah kategori (input + tombol Tambah, Enter untuk submit).
 * - Pencarian client-side.
 * - Daftar chip urut nama; tiap chip punya tombol hapus dengan konfirmasi.
 * - Kategori yang masih dipakai bahan kertas TIDAK bisa dihapus (toast error).
 * - Halaman TIDAK terdaftar di matriks Hak Akses — tampil untuk semua user login.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ListTree, Plus, Search, Tag, Loader2, X } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { getAuthUser } from '@/lib/auth'
import { authFetch } from '@/lib/auth-fetch'
import { useLanguage } from '@/contexts/language-context'
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
  const [nama, setNama] = useState('')
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  // Pemakaian kategori oleh bahan kertas (Paper) — untuk guard hapus
  const [usageMap, setUsageMap] = useState<Record<string, number>>({})

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

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = nama.trim()
    if (!trimmed) return
    if (saving) return
    setSaving(true)
    try {
      const response = await authFetch('/api/kategori', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nama: trimmed }),
      })
      const data = await response.json().catch(() => null)
      if (response.ok) {
        toast.success(`Kategori "${trimmed}" berhasil ditambahkan`)
        setNama('')
        await fetchKategori()
      } else {
        toast.error(data?.error || 'Gagal menambahkan kategori')
      }
    } catch (error) {
      console.error('Error adding kategori:', error)
      toast.error('Gagal menambahkan kategori')
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

  return (
    <DashboardLayout title={t('daftar_kategori')} subtitle={subtitle}>
      <div className="bg-card rounded-xl shadow-sm border border-slate-200">
        {/* Form tambah + pencarian */}
        <div className="p-4 lg:p-6 border-b border-slate-200 space-y-3 lg:space-y-0 lg:flex lg:items-center lg:gap-4">
          <form onSubmit={handleAdd} className="flex gap-2 w-full lg:flex-1">
            <Input
              type="text"
              placeholder="Nama kategori baru"
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              maxLength={100}
              className="flex-1"
            />
            <Button type="submit" disabled={!nama.trim() || saving}>
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              {t('tambah')}
            </Button>
          </form>
          <div className="relative w-full lg:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari kategori"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Daftar kategori (chip/badge urut nama) */}
        <div className="p-4 lg:p-6 min-h-[300px]">
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
                  ? 'Tambahkan kategori pertama Anda menggunakan form di atas'
                  : 'Coba kata kunci pencarian lain'}
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2.5">
              {filteredList.map((k) => (
                <span
                  key={k.id}
                  className="inline-flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-sm text-slate-700"
                >
                  <Tag className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                  <span className="max-w-[200px] truncate font-medium">{k.nama}</span>
                  <button
                    type="button"
                    aria-label={`Hapus kategori ${k.nama}`}
                    title={`Hapus kategori ${k.nama}`}
                    onClick={() => setDeleteTarget(k)}
                    className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-slate-400 hover:bg-red-100 hover:text-red-600 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

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
