import { redirect } from 'next/navigation'

// Rute lama — sub-tab "Pengguna" di halaman Sistem sudah DIHAPUS (permintaan user),
// jadi rute ini diarahkan ke Beranda Panel Admin.
export default function Page() {
  redirect('/panel-admin')
}
