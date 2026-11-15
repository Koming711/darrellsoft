import { redirect } from 'next/navigation'

// Rute lama (hub multi-halaman) — kini panel admin satu halaman.
// /panel-admin/sistem?tab=X  →  /panel-admin?tab=sistem&sub=X
// PERMINTAAN USER: "hak-akses" kini seksi sidebar tersendiri (bukan sub Sistem).
const ALLOWED = ['pengguna', 'akun']

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  if (tab === 'hak-akses') redirect('/panel-admin?tab=hak-akses')
  const sub = tab && ALLOWED.includes(tab) ? `&sub=${tab}` : ''
  redirect(`/panel-admin?tab=sistem${sub}`)
}
