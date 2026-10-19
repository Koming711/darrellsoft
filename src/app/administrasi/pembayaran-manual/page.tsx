import { redirect } from 'next/navigation'

// Halaman /administrasi/pembayaran-manual (legacy, memakai API verifikasi lama yang
// sudah tidak kompatibel dengan skema DB saat ini) → dialihkan ke hub Pembayaran
// panel admin (tab Verifikasi) yang aktif.
export default function PembayaranManualLegacyPage() {
  redirect('/panel-admin/pembayaran?tab=verifikasi')
}
