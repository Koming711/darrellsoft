'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import ItemsView from '@/components/views/items-view'
import { getAuthUser } from '@/lib/auth'
import type { Role, SessionUser } from '@/lib/types'

/**
 * Halaman Master Barang (versi lama) — tabel kode/nama/satuan/harga standar/HPP/status.
 * UI asli direstorasi dari versi pertama aplikasi (items-view).
 */
export default function MasterBarangPage() {
  const [user, setUser] = useState<SessionUser | null>(null)

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
  }, [])

  return (
    <DashboardLayout title="Master Barang" subtitle="Kelola daftar barang">
      {user ? (
        <ItemsView user={user} />
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
