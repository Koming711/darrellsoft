'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import CustomersView from '@/components/views/customers-view'
import { getAuthUser } from '@/lib/auth'
import { hasSubPermission } from '@/lib/permissions'
import type { Role, SessionUser } from '@/lib/types'

/**
 * Halaman Master Customer/Pelanggan (versi lama) — tabel kode/nama/telepon/alamat/invoice/status.
 * UI asli direstorasi dari versi pertama aplikasi (customers-view).
 *
 * Hak akses mengikuti Matriks Hak Akses (sub-permission master-customer-*):
 * superadmin selalu penuh; role lain mengikuti izin Tambah/Edit/Hapus yang
 * diatur admin di Halaman Hak Akses.
 */
export default function MasterCustomerPage() {
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

    // Izin granular sesuai Matriks Hak Akses (superadmin = akses penuh)
    const role = authUser.role ?? ''
    const isSuper = role === 'superadmin'
    setCanAdd(isSuper || hasSubPermission(role, 'master-customer', 'master-customer-tambah'))
    setCanEdit(isSuper || hasSubPermission(role, 'master-customer', 'master-customer-edit'))
    setCanDelete(isSuper || hasSubPermission(role, 'master-customer', 'master-customer-hapus'))
  }, [])

  return (
    <DashboardLayout title="Master Customer" subtitle="Kelola data pelanggan">
      {user ? (
        <CustomersView user={user} canAdd={canAdd} canEdit={canEdit} canDelete={canDelete} />
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
