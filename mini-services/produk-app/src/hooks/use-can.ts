'use client'

import { useCurrentUser } from '@/store/app-store'
import { can, type Permission } from '@/lib/permissions'

/** Hook cek izin berdasarkan pengguna aktif. */
export function useCan(): (perm: Permission) => boolean {
  const user = useCurrentUser()
  return (perm: Permission) => can(user?.role, perm)
}
