import { redirect } from 'next/navigation'

// Halaman /administrasi/paket (legacy, memakai API paket lama yang sudah tidak
// kompatibel dengan skema DB saat ini) → dialihkan ke Kelola Paket di panel admin.
// CRUD paket live: /panel-admin/kelola-paket (SubscriptionPlan — Create/Read/Update/
// Delete/nonaktifkan) via /api/panel-admin/plans.
export default function AdministrasiPaketLegacyPage() {
  redirect('/panel-admin/kelola-paket')
}
