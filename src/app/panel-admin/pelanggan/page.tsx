import { redirect } from 'next/navigation'

// Rute lama (hub multi-halaman) — kini panel admin satu halaman.
// /panel-admin/pelanggan?tab=X  →  /panel-admin?tab=pelanggan&sub=X
const ALLOWED = ['langganan', 'baru', 'aktif', 'expired', 'ditolak']

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const sub = tab && ALLOWED.includes(tab) ? `&sub=${tab}` : ''
  redirect(`/panel-admin?tab=pelanggan${sub}`)
}
