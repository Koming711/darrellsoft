'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import ItemsView from '@/components/views/items-view'
import { getAuthUser } from '@/lib/auth'
import { hasSubPermission } from '@/lib/permissions'
import type { Role, SessionUser } from '@/lib/types'

/**
 * Halaman Master Barang (versi lama) — tabel kode/nama/satuan/harga standar/HPP/status.
 * UI asli direstorasi dari versi pertama aplikasi (items-view).
 *
 * Hak akses mengikuti Matriks Hak Akses (sub-permission master-barang-*):
 * superadmin selalu penuh; role lain mengikuti izin Tambah/Edit/Hapus yang
 * diatur admin di Halaman Hak Akses. Tombol "Tambah" muncul setelah
 * pelanggan spesifik dipilih di kotak "Pilih Pelanggan".
 */
export default function MasterBarangPage() {
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
    // Role kosong/tak dikenal → fallback perilaku lama (AKSES PENUH) agar tombol tidak hilang.
    const rawRole = authUser.role ?? ''
    const roleLower = rawRole.toLowerCase()
    const isSuper = roleLower === 'superadmin'
    const unknownRole = rawRole === ''
    setCanAdd(isSuper || unknownRole || hasSubPermission(rawRole, 'master-barang', 'master-barang-tambah'))
    setCanEdit(isSuper || unknownRole || hasSubPermission(rawRole, 'master-barang', 'master-barang-edit'))
    setCanDelete(isSuper || unknownRole || hasSubPermission(rawRole, 'master-barang', 'master-barang-hapus'))
  }, [])

  return (
    <DashboardLayout title="Master Barang" subtitle="Kelola daftar barang">
      {user ? (
        <ItemsView user={user} canAdd={canAdd} canEdit={canEdit} canDelete={canDelete} />
      ) : (
        <div className="py-16 text-center text-sm text-muted-foreground">Memuat…</div>
      )}
    </DashboardLayout>
  )
}

/** Peta role aplikasi saat ini ke role versi lama: user/demo = KASIR, lainnya = ADMIN. */
function mapRole(role: string | undefined): Role {
  if (role === 'user' || role === 'demo' || role === 'KASIR' || role === 'kasir') return 'KASIR'
  return 'ADMIN'
}
