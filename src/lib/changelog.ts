// Changelog data for "What's New" feature
// Bump CURRENT_VERSION when deploying new features

export const CURRENT_VERSION = '2026-10-03-v8'

export interface ChangelogEntry {
  version: string
  date: { id: string; en: string }
  title: { id: string; en: string }
  items: { id: string; en: string }[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2026-10-03-v8',
    date: { id: '4 Oktober 2026', en: '4 October 2026' },
    title: {
      id: 'Perbaikan Purchase Order & Stok Bahan',
      en: 'Purchase Order & Material Stock Improvements',
    },
    items: [
      {
        id: 'Daftar barang di Buat PO kini mengikuti suplier terpilih — pilih Indojaya → hanya barang Indojaya',
        en: 'Item list in Create PO now follows the selected supplier — pick Indojaya → only Indojaya items',
      },
      {
        id: 'Terima PO kini mencatat nomor SM, tanggal, supplier, no. nota & harga beli lengkap di Riwayat Stok',
        en: 'Receiving a PO now records SM number, date, supplier, receipt no. & purchase price in Stock History',
      },
      {
        id: 'Pengingat setelah simpan PO: barang masuk Stock Bahan setelah klik Terima',
        en: 'Reminder after saving a PO: items enter Stock Bahan once received (Terima)',
      },
    ],
  },
  {
    version: '2026-10-03-v7',
    date: { id: '4 Oktober 2026', en: '4 October 2026' },
    title: {
      id: 'Stock Bahan Lengkap — 8 Menu Transaksi',
      en: 'Complete Material Stock — 8 Menu Module',
    },
    items: [
      {
        id: 'Stok Masuk/Keluar/Penyesuaian dengan nomor otomatis (SM/SK/SP), harga beli, no. nota & supplier',
        en: 'Stock In/Out/Adjustment with auto numbers (SM/SK/SP), purchase price, receipt no. & supplier',
      },
      {
        id: 'Riwayat & Laporan stok dengan filter tanggal/bahan/jenis + Print/PDF',
        en: 'Stock history & report with date/material/type filters + Print/PDF',
      },
      {
        id: 'Opsi "Izinkan stok minus" per pengguna, bahan aktif/nonaktif, lokasi & peringatan stok menipis',
        en: 'Per-user "Allow negative stock" option, active/inactive materials, location & low-stock alerts',
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
