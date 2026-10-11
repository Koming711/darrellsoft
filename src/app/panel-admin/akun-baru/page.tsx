import { redirect } from 'next/navigation'

// Rute lama — diarahkan ke hub baru (menu panel admin disederhanakan).
export default function Page() {
  redirect('/panel-admin/pelanggan?tab=baru')
}
