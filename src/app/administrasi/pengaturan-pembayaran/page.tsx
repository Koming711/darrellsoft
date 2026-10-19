import { redirect } from 'next/navigation'

// Halaman /administrasi/pengaturan-pembayaran (legacy, memakai API pengaturan lama
// yang sudah tidak kompatibel dengan skema DB saat ini) → dialihkan ke hub Pembayaran
// panel admin (tab Pengaturan) yang aktif: QRIS, rekening bank, instruksi, batas waktu.
export default function PengaturanPembayaranLegacyPage() {
  redirect('/panel-admin/pembayaran?tab=pengaturan')
}
