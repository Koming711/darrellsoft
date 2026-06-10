// Changelog data for "What's New" feature
// Bump CURRENT_VERSION when deploying new features

export const CURRENT_VERSION = '2026-06-07-v2'

export interface ChangelogEntry {
  version: string
  date: string
  title: string
  items: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2026-06-07-v2',
    date: '7 Juni 2026',
    title: 'Peningkatan Matrik Hak Akses & Navigasi',
    items: [
      'Matrik Hak Akses: fitur yang tidak diaktifkan menampilkan badge PRO',
      'Hak Akses & Pengguna disembunyikan dari sidebar jika tidak diaktifkan',
      'Halaman Fitur PRO menampilkan tombol Kembali ke Beranda',
      'Optimasi performa halaman Hak Akses (tanpa delay saat edit)',
      'Perbaikan navigasi tombol Kembali ke Beranda di semua halaman dokumen',
    ],
  },
  {
    version: '2026-06-01-v1',
    date: '1 Juni 2026',
    title: 'Backup & Restore Riwayat',
    items: [
      'Tambah tombol Backup & Restore di tab Riwayat Potong Kertas',
      'Tambah tombol Backup & Restore di tab Riwayat Hitung Cetakan',
      'Backup data riwayat ke file Excel (.xlsx)',
      'Restore data riwayat dari file Excel backup',
      'Perbaikan deploy ke production',
    ],
  },
  {
    version: '2025-05-18-v1',
    date: '18 Mei 2025',
    title: 'Peningkatan Sistem Backup',
    items: [
      'Backup Semua dalam format Excel (.xlsx)',
      'Backup hanya data user yang sedang login',
      'Hapus tombol Update Database dari Pengaturan',
      'Perbaikan restore data dari file backup',
    ],
  },
]
