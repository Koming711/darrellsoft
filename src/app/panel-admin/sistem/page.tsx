import { redirect } from 'next/navigation'

// Rute lama (hub multi-halaman) — kini panel admin satu halaman.
// /panel-admin/sistem?tab=X  →  /panel-admin?tab=sistem&sub=X
const ALLOWED = ['pengguna', 'hak-akses', 'akun']

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const sub = tab && ALLOWED.includes(tab) ? `&sub=${tab}` : ''
  redirect(`/panel-admin?tab=sistem${sub}`)
}
