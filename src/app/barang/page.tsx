'use client'

import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/dashboard-layout'
import BarangView from '@/components/views/barang-view'
import { getAuthUser } from '@/lib/auth'
import { hasSubPermission } from '@/lib/permissions'
import type { Role, SessionUser } from '@/lib/types'

/**
 * Halaman Barang — menu barang hasil porting dr workspace upload
 * "Aplikasi Invoice & Pembukuan" (workspace-d2498c56): daftar barang
 * dgn harga modal, harga jual, margin, stok & jumlah harga khusus.
 * Data memakai tabel Barang yang sama (via /api/items) — satu sumber
 * kebenaran bersama Master Produk, Invoice & Harga Customer.
 *
 * Hak akses mengikuti Matriks Hak Akses (sub-permission barang-*):
 * superadmin selalu penuh; role lain mengikuti izin Tambah/Edit/Hapus.
 */
export default function BarangPage() {
  // QueryClient lokal khusus halaman ini (app utama belum memasang provider global)
  const [queryClient] = useState(() => new QueryClient())
  const [user, setUser] = useState<SessionUser | null>(null)
  const [canAdd, setCanAdd] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [canDelete, setCanDelete] = useState(false)

  useEffect(() => {
    const authUser = getAuthUser()
    if (!authUser) {
      window.location.href = '/login'
      return
    }
    setUser({
      id: authUser.id ?? '',
      name: authUser.name ?? authUser.username,
      username: authUser.username,
      role: mapRole(authUser.role),
    })

    // Izin granular sesuai Matriks Hak Akses (superadmin = akses penuh).
    // Role kosong/tak dikenal → fallback akses penuh agar tombol tidak hilang.
    const rawRole = authUser.role ?? ''
    const roleLower = rawRole.toLowerCase()
    const isSuper = roleLower === 'superadmin'
    const unknownRole = rawRole === ''
    setCanAdd(isSuper || unknownRole || hasSubPermission(rawRole, 'barang', 'barang-tambah'))
    setCanEdit(isSuper || unknownRole || hasSubPermission(rawRole, 'barang', 'barang-edit'))
    setCanDelete(isSuper || unknownRole || hasSubPermission(rawRole, 'barang', 'barang-hapus'))
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <DashboardLayout title="Daftar Barang" subtitle="Kelola daftar barang, harga modal & harga jual">
        {user ? (
          <BarangView canAdd={canAdd} canEdit={canEdit} canDelete={canDelete} />
        ) : (
          <div className="py-16 text-center text-sm text-muted-foreground">Memuat…</div>
        )}
      </DashboardLayout>
    </QueryClientProvider>
  )
}

/** Peta role aplikasi saat ini ke role versi lama: user/demo = KASIR, lainnya = ADMIN. */
function mapRole(role: string | undefined): Role {
  if (role === 'user' || role === 'demo' || role === 'KASIR' || role === 'kasir') return 'KASIR'
  return 'ADMIN'
}
