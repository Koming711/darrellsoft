import { redirect } from 'next/navigation'

// Rute lama (hub multi-halaman) — menu "Sistem" sudah DIHAPUS (permintaan user).
// Peta deep-link lama:
//   /panel-admin/sistem?tab=hak-akses → /panel-admin?tab=hak-akses
//   /panel-admin/sistem?tab=akun      → /panel-admin?tab=pengaturan-akun
//   lainnya (incl. pengguna yang dihapus) → Beranda Panel Admin
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  if (tab === 'hak-akses') redirect('/panel-admin?tab=hak-akses')
  if (tab === 'akun') redirect('/panel-admin?tab=pengaturan-akun')
  redirect('/panel-admin')
}
