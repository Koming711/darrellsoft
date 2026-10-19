import { redirect } from 'next/navigation'

// Halaman /paket (legacy, sistem pembayaran lama yang sudah tidak kompatibel dengan
// skema DB saat ini) → dialihkan ke halaman Pilih Paket yang aktif.
// Data & fitur tidak hilang: katalog paket live ada di /pilih-paket (dari SubscriptionPlan).
export default function PaketLegacyPage() {
  redirect('/pilih-paket')
}
