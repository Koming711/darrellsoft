'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import StockBahanView from '@/components/views/stock-bahan-view'
import { getAuthUser } from '@/lib/auth'
import { hasSubPermission } from '@/lib/permissions'
import type { SessionUser } from '@/lib/types'

/**
 * Halaman Stock Bahan — kelola stok bahan baku cetak.
 *
 * Hak akses mengikuti Matriks Hak Akses (sub-permission stock-bahan-*):
 * superadmin selalu penuh; role lain mengikuti izin Lihat/Tambah/Edit/Hapus
 * yang diatur admin di Halaman Hak Akses.
 */
export default function StockBahanPage() {
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
    setCanAdd(isSuper || unknownRole || hasSubPermission(rawRole, 'stock-bahan', 'stock-bahan-tambah'))
    setCanEdit(isSuper || unknownRole || hasSubPermission(rawRole, 'stock-bahan', 'stock-bahan-edit'))
    setCanDelete(isSuper || unknownRole || hasSubPermission(rawRole, 'stock-bahan', 'stock-bahan-hapus'))
  }, [])

  return (
    <DashboardLayout title="Stock Bahan" subtitle="Kelola stok bahan baku cetak">
      {user ? (
        <StockBahanView user={user} canAdd={canAdd} canEdit={canEdit} canDelete={canDelete} />
      ) : (
        <div className="py-16 text-center text-sm text-muted-foreground">Memuat…</div>
      )}
    </DashboardLayout>
  )
}

/** Peta role aplikasi saat ini ke role view: user/demo = KASIR, lainnya = ADMIN. */
function mapRole(role: string | undefined): SessionUser['role'] {
  if (role === 'user' || role === 'demo' || role === 'KASIR' || role === 'kasir') return 'KASIR'
  return 'ADMIN'
}
