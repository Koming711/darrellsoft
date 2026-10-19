import { redirect } from 'next/navigation'

// Halaman /riwayat-langganan (legacy, memakai API pembayaran lama yang sudah tidak
// kompatibel dengan skema DB saat ini) → dialihkan ke "Langganan Saya".
// Semua riwayat tagihan & pembayaran (termasuk unggah ulang bukti saat ditolak)
// tersedia di /langganan-saya dengan sistem langganan yang aktif.
export default function RiwayatLanggananLegacyPage() {
  redirect('/langganan-saya')
}
