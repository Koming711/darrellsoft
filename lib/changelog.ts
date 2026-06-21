// Changelog data for "What's New" feature
// Bump CURRENT_VERSION when deploying new features

export const CURRENT_VERSION = '2026-06-07-v2'

export interface ChangelogEntry {
  version: string
  date: { id: string; en: string }
  title: { id: string; en: string }
  items: { id: string; en: string }[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2026-06-07-v2',
    date: { id: '7 Juni 2026', en: '7 June 2026' },
    title: {
      id: 'Peningkatan Matrik Hak Akses & Navigasi',
      en: 'Access Rights Matrix & Navigation Improvements',
    },
    items: [
      {
        id: 'Matrik Hak Akses: fitur yang tidak diaktifkan menampilkan badge PRO',
        en: 'Access Rights Matrix: disabled features show PRO badge',
      },
      {
        id: 'Hak Akses & Pengguna disembunyikan dari sidebar jika tidak diaktifkan',
        en: 'Access Rights & Users hidden from sidebar when disabled',
      },
      {
        id: 'Halaman Fitur PRO menampilkan tombol Kembali ke Beranda',
        en: 'PRO Feature page shows Back to Home button',
      },
      {
        id: 'Optimasi performa halaman Hak Akses (tanpa delay saat edit)',
        en: 'Performance optimization on Access Rights page (no delay when editing)',
      },
      {
        id: 'Perbaikan navigasi tombol Kembali ke Beranda di semua halaman dokumen',
        en: 'Fixed Back to Home navigation on all document pages',
      },
    ],
  },
  {
    version: '2026-06-01-v1',
    date: { id: '1 Juni 2026', en: '1 June 2026' },
    title: {
      id: 'Backup & Restore Riwayat',
      en: 'History Backup & Restore',
    },
    items: [
      {
        id: 'Tambah tombol Backup & Restore di tab Riwayat Potong Kertas',
        en: 'Added Backup & Restore button in Paper Cutting History tab',
      },
      {
        id: 'Tambah tombol Backup & Restore di tab Riwayat Hitung Cetakan',
        en: 'Added Backup & Restore button in Print Calculation History tab',
      },
      {
        id: 'Backup data riwayat ke file Excel (.xlsx)',
        en: 'Backup history data to Excel file (.xlsx)',
      },
      {
        id: 'Restore data riwayat dari file Excel backup',
        en: 'Restore history data from Excel backup file',
      },
      {
        id: 'Perbaikan deploy ke production',
        en: 'Production deployment fix',
      },
    ],
  },
  {
    version: '2025-05-18-v1',
    date: { id: '18 Mei 2025', en: '18 May 2025' },
    title: {
      id: 'Peningkatan Sistem Backup',
      en: 'Backup System Improvements',
    },
    items: [
      {
        id: 'Backup Semua dalam format Excel (.xlsx)',
        en: 'Backup All in Excel format (.xlsx)',
      },
      {
        id: 'Backup hanya data user yang sedang login',
        en: 'Backup only currently logged-in user data',
      },
      {
        id: 'Hapus tombol Update Database dari Pengaturan',
        en: 'Removed Update Database button from Settings',
      },
      {
        id: 'Perbaikan restore data dari file backup',
        en: 'Fixed data restore from backup file',
      },
    ],
  },
]
