import { redirect } from 'next/navigation'

// Rute lama (hub multi-halaman) — kini panel admin satu halaman.
// /panel-admin/laporan?tab=X  →  /panel-admin?tab=laporan&sub=X
const ALLOWED = ['bulanan', 'penjualan', 'audit']

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const sub = tab && ALLOWED.includes(tab) ? `&sub=${tab}` : ''
  redirect(`/panel-admin?tab=laporan${sub}`)
}
