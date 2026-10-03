// Changelog data for "What's New" feature
// Bump CURRENT_VERSION when deploying new features

export const CURRENT_VERSION = '2026-10-03-v6'

export interface ChangelogEntry {
  version: string
  date: { id: string; en: string }
  title: { id: string; en: string }
  items: { id: string; en: string }[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2026-10-03-v6',
    date: { id: '3 Oktober 2026', en: '3 October 2026' },
    title: {
      id: 'Modul Baru: Stock Bahan Lengkap',
      en: 'New Module: Complete Material Stock',
    },
    items: [
      {
        id: 'Menu Stock Bahan kini punya 8 submenu: Dashboard Stock, Data Bahan, Stok Masuk, Stok Keluar, Penyesuaian Stok, Riwayat Stok, Laporan Stok & Data Supplier',
        en: 'Material Stock menu now has 8 submenus: Stock Dashboard, Materials, Stock In, Stock Out, Adjustments, Stock History, Stock Reports & Suppliers',
      },
      {
        id: 'Setiap stok masuk/keluar/penyesuaian tercatat otomatis di Riwayat dengan saldo; edit/hapus transaksi lama menghitung ulang stok secara aman',
        en: 'Every stock in/out/adjustment is auto-recorded in History with running balance; editing/deleting past transactions safely recalculates stock',
      },
      {
        id: 'Pembelian via Purchase Order otomatis masuk Riwayat Stok dengan harga beli & supplier (riwayat harga modal terlihat di detail bahan)',
        en: 'Purchases via Purchase Order automatically appear in Stock History with purchase price & supplier (price history visible in material detail)',
      },
      {
        id: 'Stok tidak boleh minus kecuali admin mengaktifkan Allow Negative Stock; bahan yang sudah dipakai transaksi dinonaktifkan alih-alih dihapus',
        en: 'Stock cannot go negative unless admin enables Allow Negative Stock; materials with transactions are deactivated instead of deleted',
      },
      {
        id: 'Tampilan mobile ala kasir: kartu ringkas + tombol + untuk transaksi cepat, laporan siap cetak/PDF',
        en: 'Cashier-style mobile view: compact cards + quick-transaction + button, print/PDF-ready reports',
      },
    ],
  },
  {
    version: '2026-10-03-v5',
    date: { id: '3 Oktober 2026', en: '3 October 2026' },
    title: {
      id: 'Perbaikan Nama Halaman & Data Contoh',
      en: 'Page Name Fix & Sample Data',
    },
    items: [
      {
        id: 'Halaman "Harga per Customer": judul di dalam halaman kini ikut berubah dari "Master Barang"',
        en: '"Price per Customer" page: in-page heading now changed from "Item Master" as well',
      },
      {
        id: 'Sample Purchase Order kini tersedia juga untuk akun Superadmin (3 PO, barang otomatis masuk Stock Bahan)',
        en: 'Sample Purchase Orders now available for the Superadmin account too (3 POs, items auto-added to Material Stock)',
      },
    ],
  },
  {
    version: '2026-10-03-v4',
    date: { id: '3 Oktober 2026', en: '3 October 2026' },
    title: {
      id: 'Menu Baru & Tampilan Lebih Bersih',
      en: 'New Menu & Cleaner Look',
    },
    items: [
      {
        id: 'Menu sidebar "Master Barang" diganti nama menjadi "Harga per Customer"',
        en: 'Sidebar menu "Item Master" renamed to "Price per Customer"',
      },
      {
        id: 'Keterangan di bawah field Nama Bahan Kertas di halaman Potong Kertas dihapus agar lebih bersih',
        en: 'Notes below the Paper Material field on the Paper Cutting page removed for a cleaner look',
      },
      {
        id: '3 Purchase Order contoh (Bintang Timur, Buana, Indojaya) sudah dibuat — barangnya otomatis masuk Stock Bahan (BHN-001 s/d BHN-006)',
        en: '3 sample Purchase Orders (Bintang Timur, Buana, Indojaya) created — items auto-added to Material Stock (BHN-001 to BHN-006)',
      },
    ],
  },
  {
    version: '2026-10-03-v3',
    date: { id: '3 Oktober 2026', en: '3 October 2026' },
    title: {
      id: 'Dropdown Bahan Hanya Milik Suplier Terpilih',
      en: 'Paper List Filtered by Selected Supplier',
    },
    items: [
      {
        id: 'Potong Kertas: pilih suplier (mis. Bintang Timur) → dropdown Nama Bahan Kertas HANYA menampilkan kertas milik suplier tsb',
        en: 'Paper Cutting: pick a supplier (e.g. Bintang Timur) → the Paper Material dropdown shows ONLY papers belonging to that supplier',
      },
      {
        id: 'Tanpa suplier → semua kertas tampil seperti biasa; kertas yang bukan milik suplier terpilih otomatis dibatalkan pilihannya',
        en: 'No supplier → all papers shown as usual; a paper not owned by the selected supplier is auto-deselected',
      },
      {
        id: 'Bila suplier belum punya kertas di Master Harga Kertas, muncul petunjuk untuk mengisi kolom Suplier',
        en: 'If the supplier has no papers in the Paper Price Master yet, a hint appears to fill the Suplier column',
      },
    ],
  },
  {
    version: '2026-10-03-v2',
    date: { id: '3 Oktober 2026', en: '3 October 2026' },
    title: {
      id: 'Suplier Menentukan Harga Kertas',
      en: 'Supplier Determines Paper Price',
    },
    items: [
      {
        id: 'Potong Kertas: field Nama Suplier kini di ATAS Nama Bahan Kertas',
        en: 'Paper Cutting: Supplier field now sits ABOVE Paper Material',
      },
      {
        id: 'Pilih suplier (mis. Bintang Timur) → harga bahan otomatis mengikuti harga suplier tsb di Master Harga Kertas (harga/lembar, harga/kg, gramatur & ukuran terisi sendiri)',
        en: 'Pick a supplier (e.g. Bintang Timur) → paper price auto-follows that supplier price in Paper Price Master (per-sheet, per-kg, grammage & size auto-filled)',
      },
      {
        id: 'Kertas milik suplier terpilih tampil paling atas di dropdown dengan label nama suplier',
        en: "Papers of the selected supplier appear first in the dropdown, labelled with the supplier name",
      },
      {
        id: 'Panduan: isi Master Suplier (Master Toko Pemasok) lalu isi kolom Suplier di Master Harga Kertas agar harga per suplier aktif',
        en: 'Guide: fill Master Supplier (Toko Pemasok) then set the Suplier column in Paper Price Master to enable per-supplier pricing',
      },
    ],
  },
  {
    version: '2026-10-03-v1',
    date: { id: '3 Oktober 2026', en: '3 October 2026' },
    title: {
      id: 'Field Customer Fleksibel & Margin Rapi',
      en: 'Flexible Customer Field & Clean Margins',
    },
    items: [
      {
        id: 'Nama Customer di Potong Kertas & Hitung Cetakan bisa diketik bebas ATAU dipilih dari daftar',
        en: 'Customer name in Paper Cutting & Print Calculation can be typed freely OR picked from the list',
      },
      {
        id: 'Tombol Tambah Cust di atas field customer — popup lengkap (telepon, alamat, dll), customer baru langsung terpilih',
        en: 'Add Cust button above the customer field — full popup (phone, address, etc.), new customer auto-selected',
      },
      {
        id: 'Margin kiri-kanan desktop 3mm di semua halaman agar area kerja lebih lebar',
        en: '3mm left-right desktop margin on all pages for a wider workspace',
      },
      {
        id: 'Update aplikasi kini otomatis aktif (maks 1 menit) tanpa perlu tutup-buka PWA',
        en: 'App updates now activate automatically (max 1 minute) without closing/reopening the PWA',
      },
    ],
  },
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
