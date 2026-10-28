import { redirect } from 'next/navigation'
// Rute lama — kini panel admin satu halaman: /panel-admin?tab=transaksi
export default function Page() {
  redirect('/panel-admin?tab=transaksi')
}
