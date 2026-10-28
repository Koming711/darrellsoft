import { redirect } from 'next/navigation'

// Rute lama — diarahkan ke menu sidebar Pengaturan (sub-tab dipindah ke sidebar).
export default function Page() {
  redirect('/panel-admin?tab=pengaturan')
}
