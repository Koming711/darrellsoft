'use client'

// /panel-admin — Panel Admin Langganan (SATU HALAMAN, pola Rajamesin AdminView).
// Seluruh seksi (Beranda · Pengguna · Paket · Pelanggan Baru · Transaksi · Laporan · Sistem)
// hidup di route ini dengan navigasi sidebar + state URL ?tab=&sub=.
// Konten tiap seksi = komponen lama yang sudah ada.
// Akses tetap dijaga layout (admin/superadmin) & requireAdmin() di /api/panel-admin/*.

import { AdminPanel } from './admin-panel'

export default function PanelAdminPage() {
  return <AdminPanel />
}
