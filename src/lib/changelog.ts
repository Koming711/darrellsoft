// Changelog data for "What's New" feature
// Bump CURRENT_VERSION when deploying new features
// Catatan versi: mulai rilis ini, nomor versi changelog mengikuti nomor rilis
// aplikasi (SW) — mis. "2026-10-03-v145" = rilis v145 — supaya versi yang
// dilihat user (popup What's New & footer) sama dengan versi deploy.
// Khusus v148: label user-facing TETAP "v148" sesuai permintaan user walau ada
// fitur baru (pk→hc); yang berubah hanya tanggal prefix CURRENT_VERSION
// ("2026-10-08-v148") supaya popup What's New muncul lagi, sementara CACHE_NAME
// SW naik sendiri (v150) agar perangkat ber-cache menerima bundle terbaru.

export const CURRENT_VERSION = '2026-11-12-v232'

/** Label versi rilis yang tampil ke user (diambil dari segmen terakhir CURRENT_VERSION, mis. "v145"). */
export function releaseVersionLabel(): string {
  return CURRENT_VERSION.split('-').pop() || CURRENT_VERSION
}

export interface ChangelogEntry {
  version: string
  date: { id: string; en: string }
  title: { id: string; en: string }
  items: { id: string; en: string }[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2026-11-12-v232',
    date: { id: '12 November 2026', en: '12 November 2026' },
    title: {
      id: 'Pusat Notifikasi: Notif Sudah Dibaca Hilang Otomatis',
      en: 'Notification Center: Read Notifications Disappear Automatically',
    },
    items: [
      {
        id: 'Daftar di Pusat Notifikasi kini hanya menampilkan notifikasi belum dibaca — begitu dibaca (diklik atau Tandai Semua Dibaca), notif hilang otomatis dari daftar',
        en: 'The Notification Center list now only shows unread notifications — once read (clicked or Mark All as Read), the notification disappears automatically from the list',
      },
      {
        id: 'Berlaku untuk admin dan pelanggan; data notifikasi tetap tersimpan aman di server (tidak dihapus permanen)',
        en: 'Applies to both admin and customer views; notification data remains safely stored on the server (not permanently deleted)',
      },
    ],
  },
  {
    version: '2026-11-12-v231',
    date: { id: '12 November 2026', en: '12 November 2026' },
    title: {
      id: 'Panel Admin: Badge Pendaftar Baru Hilang Otomatis Setelah Dilihat',
      en: 'Admin Panel: New Registrant Badge Clears Automatically After Viewing',
    },
    items: [
      {
        id: 'Angka badge di menu sidebar Pendaftar Baru langsung hilang begitu halaman verifikasi dibuka — tidak perlu dihapus manual',
        en: 'The badge number on the New Registrants sidebar menu disappears as soon as the verification page is opened — no manual clearing needed',
      },
      {
        id: 'Badge muncul kembali otomatis hanya saat ada pendaftar BARU yang belum dilihat, di semua perangkat admin',
        en: 'The badge reappears automatically only when a NEW unseen registrant arrives, across all admin devices',
      },
    ],
  },
  {
    version: '2026-11-12-v230',
    date: { id: '12 November 2026', en: '12 November 2026' },
    title: {
      id: 'Panel Admin: Hapus Semua di Tab Disetujui',
      en: 'Admin Panel: Delete All in Approved Tab',
    },
    items: [
      {
        id: 'Tombol Hapus Semua di tab Disetujui halaman Verifikasi Pembayaran — bersihkan seluruh daftar sekaligus setelah konfirmasi',
        en: 'Delete All button in the Approved tab of Payment Verification — clear the entire list at once after confirmation',
      },
      {
        id: 'Item terhapus pindah ke Sampah (Riwayat Transaksi) dan masih bisa dipulihkan; langganan pelanggan yang sudah aktif tidak terpengaruh',
        en: 'Deleted items move to Trash (Transaction History) and remain recoverable; active customer subscriptions are unaffected',
      },
    ],
  },
  {
    version: '2026-11-12-v229',
    date: { id: '12 November 2026', en: '12 November 2026' },
    title: {
      id: 'Panel Admin: Angka di Menu Pengguna Dihapus',
      en: 'Admin Panel: Number on Users Menu Removed',
    },
    items: [
      {
        id: 'Sidebar panel admin tidak lagi menampilkan angka hitungan di samping menu Pengguna — tampilan lebih bersih',
        en: 'Admin panel sidebar no longer shows a count number next to the Users menu — cleaner look',
      },
      {
        id: 'Badge hitungan tetap ada di menu Pendaftar Baru sebagai penanda antrean verifikasi',
        en: 'Count badge remains on the New Registrations menu as a verification queue indicator',
      },
    ],
  },
  {
    version: '2026-11-12-v228',
    date: { id: '12 November 2026', en: '12 November 2026' },
    title: {
      id: 'Panel Admin: Tombol Hapus Grup di Manajemen Grup',
      en: 'Admin Panel: Delete Group Button in Group Management',
    },
    items: [
      {
        id: 'Tombol Hapus di setiap grup (tabel desktop & kartu mobile) — menghapus grup perusahaan permanen setelah konfirmasi',
        en: 'Delete button on every group (desktop table & mobile cards) — permanently removes a company group after confirmation',
      },
      {
        id: 'Menghapus grup menghapus seluruh akun login anggota (owner + staf); riwayat tagihan & pembayaran tetap tersimpan sebagai arsip keuangan',
        en: 'Deleting a group removes all member login accounts (owner + staff); billing & payment history remain stored as financial archive',
      },
      {
        id: 'Halaman Manajemen Grup kini memuat data dengan benar (endpoint API diperbaiki — sebelumnya gagal 404)',
        en: 'Group Management page now loads data correctly (API endpoint fixed — previously failed with 404)',
      },
    ],
  },
  {
    version: '2026-11-12-v227',
    date: { id: '12 November 2026', en: '12 November 2026' },
    title: {
      id: 'Menu Pengaturan Notifikasi Kini Tampil di Desktop',
      en: 'Notification Settings Menu Now Visible on Desktop',
    },
    items: [
      {
        id: 'Menu Pengaturan Notifikasi yang sebelumnya hanya ada di tampilan mobile kini juga tampil di sidebar desktop (seksi Pengaturan, ikon lonceng)',
        en: 'The Notification Settings menu, previously mobile-only, now also appears in the desktop sidebar (Settings section, bell icon)',
      },
      {
        id: 'Anggota grup tetap dapat membuka menu ini mengikuti aturan yang sama seperti di mobile',
        en: 'Group members can still open this menu under the same rules as on mobile',
      },
    ],
  },
  {
    version: '2026-11-12-v226',
    date: { id: '12 November 2026', en: '12 November 2026' },
    title: {
      id: 'Hak Akses: Seluruh Menu Kini Bisa Diatur per Role',
      en: 'Access Rights: All Menus Now Manageable per Role',
    },
    items: [
      {
        id: 'Menu Harga Customer, Kategori, Paket Saya, Grup Saya, Pilih Paket & Pengaturan Notifikasi kini punya baris di Matriks Hak Akses dan dapat diatur per role',
        en: 'Harga Customer, Category, My Package, My Group, Choose Plan & Notification Settings now have rows in the Access Rights matrix and can be managed per role',
      },
      {
        id: 'Perilaku akses tidak berubah — keenam menu baru default aktif untuk semua role; cukup matikan lewat Matriks bila perlu',
        en: 'Access behavior unchanged — all six new menus default to enabled for every role; simply turn them off via the Matrix when needed',
      },
      {
        id: 'Halaman Barang, Rekap Tagihan Cust, Riwayat Hitung Cetakan & Riwayat Potong Kertas kini mengikuti hak akses menu masing-masing',
        en: 'Barang, Customer Billing Recap, Print Calculation History & Paper Cutting History pages now follow their respective menu access rights',
      },
    ],
  },
  {
    version: '2026-11-12-v225',
    date: { id: '12 November 2026', en: '12 November 2026' },
    title: {
      id: 'Sistem Notifikasi Otomatis: Popup, Suara & Push',
      en: 'Automatic Notification System: Popup, Sound & Push',
    },
    items: [
      {
        id: 'Notifikasi pendaftaran akun baru otomatis untuk Admin & Super Admin: popup in-app + suara khusus + push notification',
        en: 'New account registration notifications for Admin & Super Admin: in-app popup + dedicated sound + push notification',
      },
      {
        id: 'Pengingat masa berlangganan otomatis (7/3/1 hari, hari terakhir & habis) untuk Owner dan seluruh anggota grupnya',
        en: 'Automatic subscription reminders (7/3/1 days, last day & expired) for the Owner and all group members',
      },
      {
        id: 'Pusat Notifikasi baru: ikon lonceng semua role dengan jumlah belum dibaca, kategori, riwayat & Tandai Semua Dibaca',
        en: 'New Notification Center: bell icon for all roles with unread count, categories, history & Mark All Read',
      },
      {
        id: 'Push notification PWA saat aplikasi di background + prompt izin pertama kali + menu Pengaturan → Notifikasi (popup, suara, push, tes, daftar perangkat)',
        en: 'PWA push notifications in background + first-use permission prompt + Settings → Notifications menu (popup, sound, push, test, device list)',
      },
    ],
  },
  {
    version: '2026-11-12-v224',
    date: { id: '12 November 2026', en: '12 November 2026' },
    title: {
      id: 'Rekap Tagihan Cust: Tanda Tangan Gaya Invoice',
      en: 'Customer Billing Recap: Invoice-Style Signature',
    },
    items: [
      {
        id: 'Tanda tangan "Yang Membuat" kini bergaya sama dengan preview invoice: label tebal + ruang tanda tangan ±12 mm + garis bawah hitam (tanpa kotak)',
        en: 'The "Prepared by" signature now matches the invoice preview style: bold label + ±12 mm signature space + black bottom line (no box)',
      },
      {
        id: 'Berlaku di preview, cetak & Export PDF — format A5 portrait tetap dipertahankan',
        en: 'Applies to preview, print & PDF export — A5 portrait format is kept',
      },
    ],
  },
  {
    version: '2026-11-12-v223',
    date: { id: '12 November 2026', en: '12 November 2026' },
    title: {
      id: 'Rekap Tagihan Cust: Kotak Tanda Tangan Kembali',
      en: 'Customer Billing Recap: Signature Box Restored',
    },
    items: [
      {
        id: 'Kotak tanda tangan "Yang Membuat" ditambahkan kembali di bawah laporan — lengkap dengan kotak ttd & garis nama',
        en: 'The "Prepared by" signature box is back below the report — complete with a signature box & name line',
      },
      {
        id: 'Tetap berformat A5 portrait dan ikut tercetak / tersertakan di Export PDF',
        en: 'Still in A5 portrait format and included when printing / in PDF export',
      },
    ],
  },
  {
    version: '2026-11-12-v222',
    date: { id: '12 November 2026', en: '12 November 2026' },
    title: {
      id: 'Rekap Tagihan Cust: Kotak Tanda Tangan Dihapus',
      en: 'Customer Billing Recap: Signature Box Removed',
    },
    items: [
      {
        id: 'Kotak tanda tangan "Yang Membuat" di bawah laporan dihapus — preview kini berakhir di tabel TOTAL + catatan kaki',
        en: 'The "Prepared by" signature box below the report has been removed — the preview now ends at the TOTAL row + footnote',
      },
      {
        id: 'Format A5 portrait tetap dipertahankan untuk preview, cetak & Export PDF',
        en: 'The A5 portrait format remains for preview, print & PDF export',
      },
    ],
  },
  {
    version: '2026-11-12-v221',
    date: { id: '12 November 2026', en: '12 November 2026' },
    title: {
      id: 'Rekap Tagihan Cust: Format A5 & Kotak Tanda Tangan',
      en: 'Customer Billing Recap: A5 Format & Signature Box',
    },
    items: [
      {
        id: 'Preview & cetak Rekap Tagihan kini berformat A5 portrait (148×210 mm) — lebih ringkas dan hemat kertas',
        en: 'The billing recap preview & print are now A5 portrait (148×210 mm) — more compact and paper-saving',
      },
      {
        id: 'Kotak tanda tangan "Yang Membuat" ditambahkan di bagian bawah laporan',
        en: 'A "Prepared by" signature box has been added at the bottom of the report',
      },
      {
        id: 'Kotak tanda tangan ikut tercetak & tersertakan di Export PDF (kini juga A5 portrait)',
        en: 'The signature box is included when printing & in PDF export (now also A5 portrait)',
      },
    ],
  },
  {
    version: '2026-11-12-v220',
    date: { id: '12 November 2026', en: '12 November 2026' },
    title: {
      id: 'Rekap Tagihan Cust: Perbaikan Nama Cetakan & Cetak',
      en: 'Customer Billing Recap: Print Name & Print Fix',
    },
    items: [
      {
        id: 'Perbaikan: kolom Nama Cetakan pada rekap kembali menampilkan daftar item invoice (mis. "paperbowl, ongkir, paperbowl + tutup") — sebelumnya sempat tampil "-"',
        en: 'Fix: the Print Name(s) column in the recap again lists the invoice items (e.g. "paperbowl, ongkir, paperbowl + tutup") — it previously showed "-"',
      },
      {
        id: 'Nominal Total Harga & TOTAL kini tidak terpotong jadi dua baris saat dicetak / Export PDF',
        en: 'Total Amount & TOTAL figures no longer wrap onto two lines when printed / exported to PDF',
      },
      {
        id: 'Perbaikan ikut berlaku di Export PDF & Export Excel',
        en: 'The fixes also apply to PDF & Excel export',
      },
    ],
  },
  {
    version: '2026-11-12-v218',
    date: { id: '12 November 2026', en: '12 November 2026' },
    title: {
      id: 'Rekap Tagihan Cust: Halaman Dipulihkan & Stabil',
      en: 'Customer Billing Recap: Page Restored & Stable',
    },
    items: [
      {
        id: 'Halaman "Rekap Tagihan Cust" dipulihkan sepenuhnya — menu Laporan, preview laporan, cetak A4, Export PDF & Excel kembali berfungsi normal',
        en: 'The "Customer Billing Recap" page has been fully restored — Reports menu, report preview, A4 print, PDF & Excel export are working normally again',
      },
      {
        id: 'Semua fitur terakhir tetap ada: opsi "Semua Customer", kolom Status, kolom Total Harga (invoice lunas tampil harga penuh namun tidak masuk TOTAL), dan tanggal berformat dd/mm/yy',
        en: 'All recent features remain: the "All Customers" option, Status column, Total Amount column (paid invoices show full price but are excluded from TOTAL), and dd/mm/yy date format',
      },
    ],
  },
  {
    version: '2026-11-12-v217',
    date: { id: '12 November 2026', en: '12 November 2026' },
    title: {
      id: 'Rekap Tagihan Cust: Opsi Semua Customer',
      en: 'Customer Billing Recap: All Customers Option',
    },
    items: [
      {
        id: 'Dropdown "Pilih Customer" kini punya opsi "Semua Customer" di urutan pertama — rekap tagihan seluruh customer sekaligus dalam satu laporan',
        en: 'The "Select Customer" dropdown now has an "All Customers" option at the top — recap billing for all customers in a single report',
      },
      {
        id: 'Pada mode "Semua Customer", tabel rekap menampilkan kolom Customer tambahan agar tiap baris invoice tetap teridentifikasi',
        en: 'In "All Customers" mode, the recap table shows an extra Customer column so each invoice row stays identifiable',
      },
    ],
  },
  {
    version: '2026-11-12-v216',
    date: { id: '12 November 2026', en: '12 November 2026' },
    title: {
      id: 'Rekap Tagihan Cust: Harga Penuh saat Lunas',
      en: 'Customer Billing Recap: Full Price When Paid',
    },
    items: [
      {
        id: 'Kolom Total Harga kini tetap menampilkan harga penuh invoice yang SUDAH lunas (sebagai riwayat), tidak lagi Rp 0',
        en: 'The Total Amount column now keeps showing the full price of PAID invoices (as history), no longer Rp 0',
      },
      {
        id: 'Baris TOTAL tidak berubah: hanya menjumlahkan sisa tagihan invoice yang belum lunas — invoice lunas tetap tidak dihitung',
        en: 'The TOTAL row is unchanged: it only sums the outstanding balance of unpaid invoices — paid invoices are still excluded',
      },
    ],
  },
  {
    version: '2026-11-12-v215',
    date: { id: '12 November 2026', en: '12 November 2026' },
    title: {
      id: 'Rekap Tagihan Cust: Kolom Total Harga & Tanggal dd/mm/yy',
      en: 'Customer Billing Recap: Total Amount Column & dd/mm/yy Dates',
    },
    items: [
      {
        id: 'Kolom "Jml Hg" pada preview rekap diganti menjadi "Total Harga" agar lebih jelas',
        en: 'The "Jml Hg" column in the recap preview is renamed to "Total Amount" for clarity',
      },
      {
        id: 'Kolom Tgl kini berformat dd/mm/yy (contoh: 01/10/26) — konsisten di preview, cetak, Export PDF & Excel',
        en: 'The Date column now uses dd/mm/yy format (e.g. 01/10/26) — consistent in preview, print, PDF & Excel export',
      },
    ],
  },
  {
    version: '2026-11-11-v208',
    date: { id: '11 November 2026', en: '11 November 2026' },
    title: {
      id: 'Permintaan Dibatalkan: Halaman Rekap Tagihan per Customer Dihapus',
      en: 'Request Cancelled: Receivables Recap per Customer Page Removed',
    },
    items: [
      {
        id: 'Halaman "Rekap Tagihan per Customer" di menu Laporan dihapus kembali sesuai permintaan (perintah dibatalkan) — menu Laporan kembali seperti semula',
        en: 'The "Receivables Recap per Customer" page in the Reports menu has been removed as requested (order cancelled) — the Reports menu is back as before',
      },
      {
        id: 'Kartu "Rekap Tagihan per Customer" di menu Lainnya TETAP ADA dan kembali membuka halaman Piutang Dagang saat "Lihat semua"',
        en: 'The "Receivables Recap per Customer" card in the More menu REMAINS and opens the Trade Receivables page again on "View all"',
      },
    ],
  },
  {
    version: '2026-11-11-v207',
    date: { id: '11 November 2026', en: '11 November 2026' },
    title: {
      id: 'Laporan: Halaman Baru "Rekap Tagihan per Customer"',
      en: 'Reports: New "Receivables Recap per Customer" Page',
    },
    items: [
      {
        id: 'Menu Laporan kini punya halaman baru "Rekap Tagihan per Customer" — total tagihan, daftar customer dengan jumlah invoice & nominal, kartu bisa dibuka untuk melihat invoice di dalamnya (nomor, tanggal, jatuh tempo, badge terlambat)',
        en: 'The Reports menu now has a new "Receivables Recap per Customer" page — total outstanding, a list of customers with invoice count & amount, expandable cards showing each invoice (number, date, due date, overdue badge)',
      },
      {
        id: 'Angka dihitung sama dengan halaman Piutang Dagang (sisa = total − DP, invoice lunas/batal tidak dihitung) — menu baru ada di bawah Piutang Dagang dan ikut izin aksesnya; halaman Laporan juga diberi tautan langsung',
        en: 'Figures are computed the same way as the Trade Receivables page (balance = total − DP, paid/cancelled invoices excluded) — the new menu sits below Trade Receivables and follows its access permission; the Reports page also got a direct link',
      },
    ],
  },
  {
    version: '2026-11-11-v206',
    date: { id: '11 November 2026', en: '11 November 2026' },
    title: {
      id: 'Menu Lainnya: Rekap Tagihan per Customer',
      en: 'More Menu: Receivables Recap per Customer',
    },
    items: [
      {
        id: 'Di menu Lainnya ada kartu baru "Rekap Tagihan per Customer" di bawah daftar menu — total tagihan + daftar customer yang masih punya invoice belum lunas (jumlah invoice & nominal), angka sama dengan halaman Piutang Dagang',
        en: 'The More menu now has a new "Receivables Recap per Customer" card below the menu list — total outstanding + a list of customers with unpaid invoices (count & amount), figures match the Trade Receivables page',
      },
      {
        id: 'Tap baris customer atau "Lihat semua" langsung membuka halaman Piutang Dagang; kartu hanya tampil bagi user yang berhak melihat Piutang Dagang',
        en: 'Tap a customer row or "View all" to open the Trade Receivables page; the card only appears for users allowed to see Trade Receivables',
      },
    ],
  },
  {
    version: '2026-11-11-v205',
    date: { id: '11 November 2026', en: '11 November 2026' },
    title: {
      id: 'Riwayat Invoice: Kotak Rekap per Pelanggan Dihapus',
      en: 'Invoice History: Per-Customer Recap Box Removed',
    },
    items: [
      {
        id: 'Kotak "Rekap per Pelanggan" di tab Riwayat Invoice dihapus sesuai permintaan — halaman kini lebih ringkas (kotak Total & daftar invoice tidak berubah)',
        en: 'The "Rekap per Pelanggan" box on the Invoice History tab has been removed as requested — the page is now more compact (Total boxes & invoice list unchanged)',
      },
    ],
  },
  {
    version: '2026-11-10-v204',
    date: { id: '10 November 2026', en: '10 November 2026' },
    title: {
      id: 'Tombol Back HP Menutup Layar Dulu (Detail/Buat Invoice, Menu)',
      en: 'Phone Back Button Closes Screens First (Detail/Create Invoice, Menu)',
    },
    items: [
      {
        id: 'Saat layar Detail Invoice, Buat Invoice, Detail Surat Jalan/PO, atau menu Lainnya terbuka — tombol back fisik di HP kini MENUTUP layar itu dulu (tetap di halaman), tidak lagi langsung meninggalkan halaman',
        en: 'When the Invoice Detail, Create Invoice, Surat Jalan/PO Detail screen, or the More menu is open — the phone back button now CLOSES that screen first (stays on the page) instead of leaving the page right away',
      },
      {
        id: 'Setelah layar tertutup, back berikutnya kembali ke halaman sebelumnya seperti biasa',
        en: 'After the screen is closed, the next back press returns to the previous page as usual',
      },
      {
        id: 'Perbaikan internal: pembersihan URL tidak lagi merusak riwayat navigasi (tombol back header tetap akurat setelah buka dokumen via tautan)',
        en: 'Internal fix: URL cleanup no longer breaks navigation history (header back button stays accurate after opening documents via links)',
      },
    ],
  },
  {
    version: '2026-11-09-v203',
    date: { id: '9 November 2026', en: '9 November 2026' },
    title: {
      id: 'Mobile: Tombol Back Kembali ke Halaman Sebelumnya',
      en: 'Mobile: Back Button Returns to Previous Page',
    },
    items: [
      {
        id: 'Perbaikan tombol back (panah kiri) di header mobile — sekarang kembali ke halaman sebelumnya, tidak lagi selalu melompat ke Beranda',
        en: 'Fixed the back button (left arrow) in the mobile header — it now returns to the previous page instead of always jumping to Home',
      },
      {
        id: 'Saat baru membuka aplikasi (PWA/refresh), tombol back tetap membawa ke Beranda agar aplikasi tidak tertutup',
        en: 'When freshly opening the app (PWA/refresh), the back button still goes to Home so the app does not close',
      },
    ],
  },
  {
    version: '2026-11-09-v202',
    date: { id: '9 November 2026', en: '9 November 2026' },
    title: {
      id: 'Riwayat Invoice: Semua Item di Kolom Nama Barang',
      en: 'Invoice History: All Items in Name Column',
    },
    items: [
      {
        id: 'Kolom Nama Barang kini menampilkan SEMUA item — invoice dengan 3 item menampilkan 3 baris nama (sebelumnya hanya item pertama + "+N lainnya")',
        en: 'The Item Name column now shows ALL items — an invoice with 3 items displays 3 name rows (previously only the first item + "+N more")',
      },
      {
        id: 'Baris pelunasan (PEL) & kartu mobile ikut menampilkan semua item; pencarian riwayat kini mencakup nama semua item',
        en: 'Settlement (PEL) rows & mobile cards also show all items; history search now covers every item name',
      },
    ],
  },
  {
    version: '2026-11-09-v201',
    date: { id: '9 November 2026', en: '9 November 2026' },
    title: {
      id: 'Riwayat Invoice: Kolom Nama Barang',
      en: 'Invoice History: Item Name Column',
    },
    items: [
      {
        id: 'Tabel Riwayat Invoice (tab Invoice) kini punya kolom Nama Barang setelah Pelanggan — menampilkan nama barang pertama; invoice multi-item ditandai "+N lainnya" (arahkan kursor untuk lihat semuanya)',
        en: 'The Invoice History table (Invoice tab) now has an Item Name column after Customer — shows the first item name; multi-item invoices get a "+N more" mark (hover to see all)',
      },
      {
        id: 'Baris pelunasan (PEL) & kartu mobile juga menampilkan nama barang; kolom tabel kini: Nomor, Tanggal, Pelanggan, Nama Barang, Status, Jumlah Item, Total',
        en: 'Settlement (PEL) rows & mobile cards also show the item name; table columns are now: Number, Date, Customer, Item Name, Status, Item Count, Total',
      },
    ],
  },
  {
    version: '2026-11-09-v200',
    date: { id: '9 November 2026', en: '9 November 2026' },
    title: {
      id: 'Riwayat Invoice: Rekap per Pelanggan',
      en: 'Invoice History: Per-Customer Recap',
    },
    items: [
      {
        id: 'Di halaman Riwayat Invoice (tab Invoice) ada kartu baru "Rekap per Pelanggan" di bawah kotak Total — daftar pelanggan dengan jumlah invoice, total nilai, belum lunas, dan profit (sesuai izin)',
        en: 'On the Invoice History page (Invoice tab) there is a new "Rekap per Pelanggan" card below the Total boxes — a per-customer list with invoice count, total value, outstanding amount, and profit (per permission)',
      },
      {
        id: 'Rekap mengikuti filter aktif (periode, status, pelanggan, pencarian), diurutkan dari total terbesar, ada baris Total di bawah, bisa dilipat/buka, dan daftar panjang otomatis bisa digulir',
        en: 'The recap follows active filters (period, status, customer, search), sorted by largest total, with a Total row at the bottom, can be collapsed/expanded, and long lists scroll automatically',
      },
    ],
  },
  {
    version: '2026-11-09-v199',
    date: { id: '9 November 2026', en: '9 November 2026' },
    title: {
      id: 'Riwayat Invoice: Dropdown Cari Pelanggan',
      en: 'Invoice History: Customer Search Dropdown',
    },
    items: [
      {
        id: 'Di halaman Riwayat Invoice (tab Invoice) ada kotak dropdown baru "Semua Pelanggan" di samping filter status — ketik nama untuk mencari, klik pelanggan untuk memfilter tabelnya',
        en: 'On the Invoice History page (Invoice tab) there is a new "Semua Pelanggan" dropdown box next to the status filter — type a name to search, click a customer to filter the table',
      },
      {
        id: 'Daftar pelanggan diisi otomatis dari seluruh riwayat invoice & pelunasan (urut abjad), bisa diketik untuk mencari, tombol × untuk hapus filter, dan Export Excel ikut mengikuti pelanggan terpilih',
        en: 'The customer list is auto-filled from all invoice & settlement history (alphabetical), type-to-search supported, × button clears the filter, and Export Excel follows the selected customer',
      },
    ],
  },
  {
    version: '2026-11-08-v198',
    date: { id: '8 November 2026', en: '8 November 2026' },
    title: {
      id: 'Riwayat Invoice: Kolom Profit Dihapus',
      en: 'Invoice History: Profit Column Removed',
    },
    items: [
      {
        id: 'Di halaman Riwayat Invoice (tab Invoice), kolom Profit dihapus dari tabel — kolom kini: Nomor, Tanggal, Pelanggan, Status, Jumlah Item, Total',
        en: 'On the Invoice History page (Invoice tab), the Profit column was removed from the table — columns are now: Number, Date, Customer, Status, Item Count, Total',
      },
      {
        id: 'Baris pelunasan & kartu mobile ikut rapi tanpa kolom Profit; kotak ringkasan Total Profit di atas tetap ada',
        en: 'Settlement rows & mobile cards are tidied up without the Profit column; the Total Profit summary box above remains',
      },
    ],
  },
  {
    version: '2026-11-08-v197',
    date: { id: '8 November 2026', en: '8 November 2026' },
    title: {
      id: 'Tab Riwayat Potong Kertas: Tanggal Kiri No. PK + Tanda Diedit',
      en: 'Paper Cutting History Tab: Date Left of PK No. + Edited Mark',
    },
    items: [
      {
        id: 'Di halaman Potong Kertas → tab Riwayat, kolom Tanggal dipindah ke SEBELAH KIRI kolom No. PK dengan format singkat dd/mm/yy (mis. 08/11/26)',
        en: 'In Paper Cutting → History tab, the Date column moved to the LEFT of the PK Number column with a short dd/mm/yy format (e.g. 08/11/26)',
      },
      {
        id: 'Riwayat yang diedit lalu disimpan naik ke paling atas tabel — nomor PK tetap, tanggalnya berubah jadi tanggal edit, dan diberi tanda "Diedit" (badge kuning ikon pensil)',
        en: 'Histories that are edited and saved move to the very top of the table — the PK number stays, the date becomes the edit date, and they get an "Diedit" (Edited) mark (yellow badge with a pencil icon)',
      },
      {
        id: 'Filter periode (Hari ini dst) ikut memakai tanggal terakhir disimpan',
        en: 'Period filters (Today etc.) now use the last-saved date',
      },
    ],
  },
  {
    version: '2026-11-08-v196',
    date: { id: '8 November 2026', en: '8 November 2026' },
    title: {
      id: 'Tab Riwayat di Hitung Cetakan: Tanggal Kiri No. HC + Tanda Diedit',
      en: 'History Tab in Hitung Cetakan: Date Left of HC No. + Edited Mark',
    },
    items: [
      {
        id: 'Di halaman Hitung Cetakan → tab Riwayat, kolom Tanggal dipindah ke SEBELAH KIRI kolom No. HC dengan format singkat dd/mm/yy (mis. 08/11/26)',
        en: 'In Hitung Cetakan → History tab, the Date column moved to the LEFT of the HC Number column with a short dd/mm/yy format (e.g. 08/11/26)',
      },
      {
        id: 'Riwayat yang pernah diedit & disimpan diberi tanda "Diedit" (badge kuning ikon pensil) — tanggalnya juga berubah jadi tanggal edit & barisnya naik ke paling atas',
        en: 'Histories that were edited & saved get an "Diedit" (Edited) mark — a yellow badge with a pencil icon; their date becomes the edit date and the row moves to the very top',
      },
      {
        id: 'Filter periode (Hari ini dst) & tanggal di detail rincian ikut memakai tanggal terakhir disimpan',
        en: 'Period filters (Today etc.) & the date in the detail preview now use the last-saved date',
      },
    ],
  },
  {
    version: '2026-11-08-v195',
    date: { id: '8 November 2026', en: '8 November 2026' },
    title: {
      id: 'Kolom Nomor Kini Diberi Label Jelas: No HC & No PK',
      en: 'Number Columns Now Clearly Labeled: HC No. & PK No.',
    },
    items: [
      {
        id: 'Di tabel Riwayat Hitung Cetakan, kolom nomor kini berlabel "No HC" (bukan "Nomor") — di sebelah kanan kolom Tanggal dd/mm/yy',
        en: 'In the Hitung Cetakan history table, the number column is now labeled "No HC" (instead of "Nomor") — right next to the dd/mm/yy Date column',
      },
      {
        id: 'Tanda "Diedit" (badge kuning ikon pensil) tampil di kolom Tanggal utk riwayat yang pernah diedit & disimpan — barisnya juga naik ke paling atas',
        en: 'The "Edited" mark (yellow badge with pencil icon) shows in the Date column for histories that were edited & saved — their row also moves to the very top',
      },
      {
        id: 'Halaman Riwayat Potong Kertas ikut konsisten: kolom nomornya berlabel "No PK"',
        en: 'The Paper Cutting history page stays consistent: its number column is labeled "No PK"',
      },
    ],
  },
  {
    version: '2026-11-08-v194',
    date: { id: '8 November 2026', en: '8 November 2026' },
    title: {
      id: 'Riwayat Diedit Naik ke Atas, Tanggal Jadi Tanggal Edit',
      en: 'Edited History Moves to Top, Date Becomes Edit Date',
    },
    items: [
      {
        id: 'Di halaman Riwayat Hitung Cetakan, data yang diedit lalu disimpan kini NAIK ke baris paling atas tabel — nomor HC tetap (tidak buat nomor baru), tapi tanggalnya berubah jadi tanggal edit',
        en: 'On the Hitung Cetakan History page, data that is edited and saved now MOVES to the very top of the table — the HC number stays the same (no new number), but the date changes to the edit date',
      },
      {
        id: 'Baris yang pernah diedit diberi keterangan "Diedit" (badge kuning dgn ikon pensil) di tabel & kartu — supaya kelihatan mana riwayat yang sudah diubah',
        en: 'Edited rows get an "Diedit" (Edited) note — a yellow badge with a pencil icon in the table & cards — so changed histories are easy to spot',
      },
      {
        id: 'Kolom Tanggal dipindah ke SEBELAH KIRI kolom Nomor HC dengan format singkat dd/mm/yy (mis. 08/11/26)',
        en: 'The Date column moved to the LEFT of the HC Number column with a short dd/mm/yy format (e.g. 08/11/26)',
      },
    ],
  },
  {
    version: '2026-11-08-v193',
    date: { id: '8 November 2026', en: '8 November 2026' },
    title: {
      id: 'Klik "Hitung Cetakan Lengkap" Kini Langsung Terbuka Tanpa Menunggu',
      en: '"Hitung Cetakan Lengkap" Button Now Opens Instantly Without Waiting',
    },
    items: [
      {
        id: 'Di halaman Potong Kertas, klik "Hitung Cetakan Lengkap" langsung membuka halaman Hitung Cetakan seketika — hitung otomatis potongan, simpan riwayat & cek relasi berjalan di belakang layar (dulu menunggu semuanya selesai dulu)',
        en: 'On the Paper Cutting page, tapping "Hitung Cetakan Lengkap" now opens the Hitung Cetakan page instantly — auto cutting calculation, history saving & relation checks run in the background (previously everything was awaited first)',
      },
      {
        id: 'Hasil potongan tetap otomatis terisi di form Hitung Cetakan beberapa saat kemudian (ukuran kertas terpilih, harga/lembar, dst.), termasuk nomor Potong Kertas agar riwayat tetap ter-link (kolom No. PK)',
        en: 'Cutting results still auto-fill the Hitung Cetakan form moments later (selected paper size, price per sheet, etc.), including the Potong Kertas number so histories stay linked (No. PK column)',
      },
    ],
  },
  {
    version: '2026-11-08-v192',
    date: { id: '8 November 2026', en: '8 November 2026' },
    title: {
      id: 'Tombol Hitung Cetakan Lengkap Kini Jelas Saat Nonaktif',
      en: 'Hitung Cetakan Lengkap Button Now Clear When Inactive',
    },
    items: [
      {
        id: 'Di halaman Potong Kertas, tombol "Hitung Cetakan Lengkap" yang belum siap (hasil hitung belum ada / data berubah) kini tampil abu-abu redup persis seperti tombol Preview nonaktif — sebelumnya transparan dengan teks putih yang nyaris tak terlihat',
        en: 'On the Paper Cutting page, the "Hitung Cetakan Lengkap" button when not ready (no results / inputs changed) now appears dimmed gray exactly like the disabled Preview button — previously it was transparent with nearly invisible white text',
      },
    ],
  },
  {
    version: '2026-11-08-v191',
    date: { id: '8 November 2026', en: '8 November 2026' },
    title: {
      id: '4 Kartu Paket Harga di Landing Kini Sebaris',
      en: '4 Pricing Cards on the Landing Page Now in One Row',
    },
    items: [
      {
        id: 'Di layar lebar (laptop/desktop), 4 kartu paket (Trial, Basic, Pro, Premium) tampil rapi dalam SATU baris — tidak lagi 3+1; di HP tetap tersusun ke bawah dan di tablet 2×2',
        en: 'On wide screens (laptop/desktop), the 4 plan cards (Trial, Basic, Pro, Premium) now display neatly in ONE row — no more 3+1; on phones they still stack and tablets show 2×2',
      },
    ],
  },
  {
    version: '2026-11-08-v190',
    date: { id: '8 November 2026', en: '8 November 2026' },
    title: {
      id: 'Harga di Landing Selalu Sama dengan Panel Admin',
      en: 'Landing Page Prices Always Match the Admin Panel',
    },
    items: [
      {
        id: 'Sebutan harga "Cuma Rp …/bulan" di landing (bagian Kenapa Bayar? & CTA akhir) kini otomatis mengikuti paket termurah yang aktif di Panel Admin → Kelola Paket — tidak ada lagi harga lama Rp 128.000',
        en: 'The "Only Rp …/month" price mentions on the landing (Why Pay? & final CTA) now automatically follow the cheapest active plan from the Admin Panel — no more stale Rp 128,000',
      },
      {
        id: 'Saat daftar paket dimuat, tampil skeleton alih-alih kartu harga default — harga di landing tidak pernah tampak berbeda dari panel admin walau sesaat',
        en: 'While the plan list loads, a skeleton is shown instead of default price cards — landing prices never even briefly differ from the admin panel',
      },
    ],
  },
  {
    version: '2026-11-08-v189',
    date: { id: '8 November 2026', en: '8 November 2026' },
    title: {
      id: 'Headline Baru di Halaman Utama: Hitung Potong Kertas & Hitung Cetakan Akurat',
      en: 'New Homepage Headline: Paper Cutting & Accurate Printing Calculation',
    },
    items: [
      {
        id: 'Headline halaman utama kini diawali "Hitung Potong Kertas, Hitung Cetakan Akurat" berwarna biru sebelum "Buat Invoice" — kalkulator andalan bisnis cetak makin menonjol',
        en: 'The homepage headline now opens with a blue "Calculate Paper Cutting, Accurate Printing" before "Create Invoices" — the printing calculators are now front and center',
      },
    ],
  },
  {
    version: '2026-11-05-v188',
    date: { id: '5 November 2026', en: '5 November 2026' },
    title: {
      id: 'Tombol Cetak Daftar Barang & Harga Customer + Backup/Restore Master Customer',
      en: 'Print Buttons for Product List & Customer Prices + Customer Master Backup/Restore',
    },
    items: [
      {
        id: 'Halaman Daftar Barang & Harga Customer kini punya tombol Cetak — hasil cetak mengikuti kata kunci pencarian/filter yang sedang aktif',
        en: 'The Product List & Customer Prices pages now have a Print button — the printout follows the currently active search keyword/filters',
      },
      {
        id: 'Halaman Master Customer kini punya tombol Backup (unduh .xlsx) & Restore (pulihkan dari file backup, dengan konfirmasi dulu) untuk keamanan data pelanggan',
        en: 'The Customer Master page now has Backup (download .xlsx) & Restore (recover from a backup file, with confirmation first) buttons for customer data safety',
      },
    ],
  },
  {
    version: '2026-11-05-v187',
    date: { id: '5 November 2026', en: '5 November 2026' },
    title: {
      id: 'Purchase Order: Posisi Subtotal, Total & Terbilang Sejajar dengan Invoice',
      en: 'Purchase Order: Subtotal, Total & Amount-in-Words Aligned with Invoice',
    },
    items: [
      {
        id: 'Preview Purchase Order kini menurunkan blok Subtotal/PPN/Total + Terbilang 4cm dari daftar barang — posisinya persis sama (sejajar) dengan Preview Invoice, dan tetap otomatis menyesuaikan bila barang/catatan banyak agar tetap 1 halaman A5',
        en: 'The Purchase Order preview now lowers the Subtotal/PPN/Total + amount-in-words block 4cm below the item list — positioned exactly level with the Invoice preview, while still auto-adjusting when there are many items/notes to keep it on one A5 page',
      },
      {
        id: 'Hasil cetak dan JPG PO ikut berubah otomatis karena dibuat dari isi preview yang sama',
        en: 'PO print and JPG output follow automatically because they are generated from the same preview content',
      },
    ],
  },
  {
    version: '2026-11-05-v186',
    date: { id: '5 November 2026', en: '5 November 2026' },
    title: {
      id: 'Preview Potong Kertas Kini Menampilkan Perbandingan Ukuran Kertas',
      en: 'Paper Cutting Preview Now Shows Paper Size Comparison',
    },
    items: [
      {
        id: 'Dokumen Preview Potong Kertas kini menyertakan tabel "Perbandingan Ukuran Kertas" (alternatif ukuran dari Master Kertas, lengkap badge TERBAIK & DIPILIH) — tabel ikut tercetak dan ter-JPG karena hasil cetak identik dengan isi preview',
        en: 'The Paper Cutting preview document now includes a "Paper Size Comparison" table (alternatives from the Paper Master, with BEST & SELECTED badges) — it is included in print and JPG output because the print matches the preview exactly',
      },
      {
        id: 'Saat membuka preview dari Riwayat, perbandingan dihitung ulang dari Master Kertas sesuai data baris (bahan, gramatur, ukuran potong, jumlah) sehingga selalu relevan',
        en: 'When opening the preview from History, the comparison is recalculated from the Paper Master based on that row (material, grammage, cut size, quantity) so it always stays relevant',
      },
    ],
  },
  {
    version: '2026-11-05-v185',
    date: { id: '5 November 2026', en: '5 November 2026' },
    title: {
      id: 'Menu Daftar Barang + Popup Nama Harga Khusus',
      en: 'Product List Menu + Special Price Names Popup',
    },
    items: [
      {
        id: 'Menu "Barang" di sidebar kini bernama "Daftar Barang"',
        en: 'The "Products" menu in the sidebar is now named "Product List"',
      },
      {
        id: 'Di halaman Daftar Barang, klik angka di kolom "Harga Khusus" (di tabel maupun kartu) untuk membuka popup daftar nama pemilik harga khusus barang tersebut',
        en: 'On the Product List page, tap the number in the "Special Price" column (table or card) to open a popup listing the names behind that item\'s special prices',
      },
    ],
  },
  {
    version: '2026-11-05-v184',
    date: { id: '5 November 2026', en: '5 November 2026' },
    title: {
      id: 'Perbaikan Dropdown: Pilihan Nama Ganda Disederhanakan',
      en: 'Dropdown Fix: Duplicate Name Options Deduplicated',
    },
    items: [
      {
        id: 'Dropdown pilihan (mis. Nama Customer & Nama Suplier di Hitung Cetakan) kini otomatis menyaring pilihan dengan nama sama yang muncul dua kali — daftar dropdown bersih dan pesan error konsol "Encountered two children with the same key" hilang',
        en: 'Selection dropdowns (e.g. Customer Name & Supplier Name in Print Calculation) now automatically filter out options with the same name appearing twice — the dropdown list is clean and the console error "Encountered two children with the same key" is gone',
      },
    ],
  },
  {
    version: '2026-11-05-v183',
    date: { id: '5 November 2026', en: '5 November 2026' },
    title: {
      id: 'Perbaikan Nomor Potong Kertas — 4 Digit Berlanjut',
      en: 'Paper Cutting Number Fix — Continuing 4-Digit Sequence',
    },
    items: [
      {
        id: 'Nomor Potong Kertas kembali normal: nomor berikutnya PK/11/26/0130 lalu terus bertambah (0131, 0132, …) walau bulan berganti — tidak lagi memakai angka 6 digit gaya PK/11/26/359384',
        en: 'Paper Cutting numbers are back to normal: the next number is PK/11/26/0130 then keeps incrementing (0131, 0132, …) even across months — no more 6-digit numbers like PK/11/26/359384',
      },
    ],
  },
  {
    version: '2026-11-05-v182',
    date: { id: '5 November 2026', en: '5 November 2026' },
    title: {
      id: 'Detail Invoice: Upload Bukti Pembayaran Invoice Pelunasan',
      en: 'Invoice Detail: Upload Payment Proof for the Settlement Invoice',
    },
    items: [
      {
        id: 'Di Detail Invoice DP kini tersedia baris "Bukti Pembayaran Pelunasan" — upload/ganti/hapus foto bukti pembayaran sisa langsung dari detail invoice; foto tersimpan di invoice pelunasan tertaut & bisa diperbesar lewat popup transparan',
        en: 'The DP Invoice Detail page now has a "Bukti Pembayaran Pelunasan" row — upload/replace/delete the remaining-payment proof photo directly from the detail page; the photo is stored on the linked settlement invoice and can be zoomed via the transparent popup',
      },
    ],
  },
  {
    version: '2026-11-04-v181',
    date: { id: '4 November 2026', en: '4 November 2026' },
    title: {
      id: 'Detail Invoice: Kotak Pembayaran 2 Kolom',
      en: 'Invoice Detail: Two-Column Payment Box',
    },
    items: [
      {
        id: 'Kotak Pembayaran di Detail Invoice kini tersusun 2 kolom — Cara Pembayaran di kiri, Tanggal Pembayaran di kanan (garis pemisah vertikal), Bukti Pembayaran full-width di bawahnya; di layar kecil tetap menumpuk 1 kolom',
        en: 'The Payment box on Invoice Detail is now laid out in 2 columns — Payment Method on the left, Payment Date on the right (with a vertical divider), Payment Proof full-width below; on small screens it still stacks in 1 column',
      },
    ],
  },
  {
    version: '2026-11-04-v180',
    date: { id: '4 November 2026', en: '4 November 2026' },
    title: {
      id: 'Halaman Detail Invoice: Font Diperbesar 1pt',
      en: 'Invoice Detail Page: Font Enlarged by 1pt',
    },
    items: [
      {
        id: 'Seluruh teks di halaman Detail Invoice kini tampil +1pt lebih besar (label, badge, tombol, kartu info & pembayaran) — pola sama dengan halaman Panel Admin; dokumen invoice A5 (pratinjau & cetak) tidak berubah',
        en: 'All text on the Invoice Detail page now renders +1pt larger (labels, badges, buttons, info & payment cards) — same approach as the Admin Panel page; the A5 invoice document (preview & print) is unchanged',
      },
    ],
  },
  {
    version: '2026-11-04-v179',
    date: { id: '4 November 2026', en: '4 November 2026' },
    title: {
      id: 'Detail Invoice: Tanggal Pembayaran & Foto Bukti Tampil di Atas Halaman',
      en: 'Invoice Detail: Payment Date & Proof Photo Displayed Over the Page',
    },
    items: [
      {
        id: 'Kartu Pembayaran kini punya Tanggal Pembayaran: pilih lewat input tanggal atau tombol "Hari ini" — ikut tercetak di dokumen invoice (baris "Tgl Bayar:")',
        en: 'The Pembayaran card now has a Payment Date: pick it via the date input or the "Hari ini" (today) button — it is printed on the invoice document ("Tgl Bayar:" line)',
      },
      {
        id: 'Klik gambar bukti pembayaran → foto besar tampil sebagai popup DENGAN latar belakang halaman Detail Invoice tetap terlihat (overlay transparan, bukan layar gelap pekal)',
        en: 'Clicking the payment proof photo now shows the large image as a popup WITH the Invoice Detail page still visible as the backdrop (transparent overlay instead of a solid dark screen)',
      },
    ],
  },
  {
    version: '2026-11-04-v178',
    date: { id: '4 November 2026', en: '4 November 2026' },
    title: {
      id: 'Detail Invoice: Cara Pembayaran, Bukti Pembayaran & Pratinjau Pelunasan Berdampingan',
      en: 'Invoice Detail: Payment Method, Payment Proof & Side-by-Side Settlement Preview',
    },
    items: [
      {
        id: 'Kartu "Pembayaran" baru di Detail Invoice: pilih Cara Pembayaran (Cash / Transfer / Giro — ikut tercetak di dokumen) dan unggah foto Bukti Pembayaran (otomatis dikompres, bisa diperbesar, diganti & dihapus)',
        en: 'New "Pembayaran" card on Invoice Detail: pick the payment method (Cash / Transfer / Giro — printed on the document) and upload a payment proof photo (auto-compressed, zoomable, replaceable & removable)',
      },
      {
        id: 'Invoice DP: pratinjau Invoice Pelunasan tertaut kini tampil DI SAMPING pratinjau invoice (dua kolom di desktop, menumpuk di mobile); bila pelunasan belum dibuat, muncul kotak "Belum ada Invoice Pelunasan" dengan tombol buat cepat',
        en: 'DP invoice: the linked settlement invoice preview now appears BESIDE the invoice preview (two columns on desktop, stacked on mobile); if not created yet, a "Belum ada Invoice Pelunasan" box with a quick-create button is shown',
      },
    ],
  },
  {
    version: '2026-11-04-v177',
    date: { id: '4 November 2026', en: '4 November 2026' },
    title: {
      id: 'Popup Daftar Barang Kini Muncul di Bawah Tombol Tambah',
      en: 'Item List Popup Now Appears Right Below the Add Button',
    },
    items: [
      {
        id: 'Buat Invoice: klik "Tambah" → popup Daftar Barang langsung muncul tepat di bawah tombol Tambah — tidak lagi menempel di baris baru yang posisinya jauh di bawah saat baris sudah banyak',
        en: 'Create Invoice: clicking "Tambah" now opens the item list popup right below the Tambah button — no longer attached to the new row far below when there are many rows',
      },
      {
        id: 'Barang yang dipilih di popup tetap mengisi baris yang baru ditambahkan (baris paling akhir); dropdown chevron di tiap baris tetap berfungsi seperti biasa',
        en: 'Picking an item from the popup still fills the newly added row (the last row); the per-row chevron dropdown still works as before',
      },
    ],
  },
  {
    version: '2026-11-04-v176',
    date: { id: '4 November 2026', en: '4 November 2026' },
    title: {
      id: 'Nama Barang di Invoice Bisa Dipakai Berkali-Kali',
      en: 'Item Names on Invoices Can Now Be Reused',
    },
    items: [
      {
        id: 'Buat Invoice & Pelunasan: tulisan "Sudah dipakai" di Daftar Barang dihapus — nama barang yang sama kini bisa dipilih lagi di beberapa baris (mis. barang sama dijual dengan qty/harga berbeda)',
        en: 'Create Invoice & Pelunasan: the "Sudah dipakai" label is removed from the item list — the same item name can now be picked again on multiple rows (e.g. the same item sold with different qty/price)',
      },
      {
        id: 'Tidak ada lagi pembatasan barang sama — baik saat memilih dari daftar, mengetik manual, maupun saat menyimpan invoice; halaman lain (PO, Surat Jalan, Master Barang) tidak berubah',
        en: 'No more duplicate-item restriction — whether picking from the list, typing manually, or saving the invoice; other pages (PO, Surat Jalan, Master Barang) are unchanged',
      },
    ],
  },
  {
    version: '2026-11-04-v175',
    date: { id: '4 November 2026', en: '4 November 2026' },
    title: {
      id: 'Popup Tambah Barang di Invoice Kini Sama dengan Popup Harga Customer',
      en: 'Add Barang Popup on Invoice Is Now the Same as the Harga Customer Popup',
    },
    items: [
      {
        id: 'Halaman Invoice (Buat Invoice & Pelunasan): popup "Tambah Barang" kini sama dengan popup di halaman Harga Customer — "Untuk Pelanggan" tampil di atas, lalu "Nama Barang" berupa dropdown semua barang dari Master Barang dengan opsi "+ Barang baru (ketik manual)"',
        en: 'Invoice page (regular & pelunasan): the "Tambah Barang" popup is now the same as the one on the Harga Customer page — "Untuk Pelanggan" on top, then "Nama Barang" as a dropdown of all items from Master Barang with a "+ Barang baru (type manually)" option',
      },
      {
        id: 'Pilih barang yang sudah ada → simpan = daftarkan harga khusus untuk customer invoice ini; pilih "+ Barang baru" → barang baru dibuat dan otomatis terdaftar; popup di halaman lain (Purchase Order, Surat Jalan, Master Barang) tidak berubah',
        en: 'Pick an existing item → saving registers a special price for the invoice customer; pick "+ Barang baru" → a new item is created and auto-registered; popups on other pages (Purchase Order, Surat Jalan, Master Barang) are unchanged',
      },
    ],
  },
  {
    version: '2026-11-04-v174',
    date: { id: '4 November 2026', en: '4 November 2026' },
    title: {
      id: 'Kolom Qty di Popup Tambah Harga Customer Tampil Lagi & Ikut Tersimpan',
      en: 'Qty Field Is Back in the Add Harga Customer Popup and Saves Too',
    },
    items: [
      {
        id: 'Popup Tambah Harga Customer: kolom Qty tetap tampil saat barang yang sudah ada dipilih dari dropdown — tidak hilang lagi, dan otomatis terisi stok barang dari Master Barang',
        en: 'Add Harga Customer popup: the Qty field stays visible when an existing item is picked from the dropdown — it no longer disappears and is auto-filled with the item stock from Master Barang',
      },
      {
        id: 'Qty yang diubah lalu disimpan ikut memperbarui stok barang di Master Barang; harga standar & harga modal barang tidak berubah — yang terdaftar tetap harga khusus customer',
        en: 'A changed Qty is saved back to the item stock in Master Barang; the standard & cost price stay untouched — what gets registered is still the customer special price',
      },
    ],
  },
  {
    version: '2026-11-04-v173',
    date: { id: '4 November 2026', en: '4 November 2026' },
    title: {
      id: 'Untuk Pelanggan Kini di Atas Nama Barang di Popup Tambah Harga Customer',
      en: 'Untuk Pelanggan Now Above Nama Barang in the Add Harga Customer Popup',
    },
    items: [
      {
        id: 'Popup Tambah Harga Customer: kolom "Untuk Pelanggan" dipindah ke atas kolom "Nama Barang" — pilih pelanggan lebih dulu, lalu pilih/ketik barang; urutan kolom di popup lain (Master Barang, Buat Invoice) tidak berubah',
        en: 'Add Harga Customer popup: the "Untuk Pelanggan" field moved above "Nama Barang" — pick the customer first, then choose/type the item; field order in other popups (Master Barang, Buat Invoice) is unchanged',
      },
    ],
  },
  {
    version: '2026-11-04-v172',
    date: { id: '4 November 2026', en: '4 November 2026' },
    title: {
      id: 'Judul Popup di Harga Customer Menjadi "Tambah Harga Customer"',
      en: 'Harga Customer Popup Title Is Now "Tambah Harga Customer"',
    },
    items: [
      {
        id: 'Halaman Harga Customer: judul popup penambahan data diganti dari "Tambah Barang" menjadi "Tambah Harga Customer" — isi & perilaku popup tetap sama',
        en: 'Harga Customer page: the add-popup title changed from "Tambah Barang" to "Tambah Harga Customer" — the popup contents and behavior stay the same',
      },
    ],
  },
  {
    version: '2026-11-04-v171',
    date: { id: '4 November 2026', en: '4 November 2026' },
    title: {
      id: 'Popup Tambah Barang Langsung Muncul di Buat Invoice',
      en: 'Add Item Popup Opens Instantly on Buat Invoice',
    },
    items: [
      {
        id: 'Halaman Buat Invoice: tombol "Tambah Barang" kini SELALU bisa diklik — popup form langsung muncul seperti di halaman Harga Customer, tanpa perlu memilih customer lebih dulu',
        en: 'Buat Invoice page: the "Tambah Barang" button is now ALWAYS clickable — the form popup opens instantly like on the Harga Customer page, without having to pick a customer first',
      },
      {
        id: 'Bila customer invoice belum dikenali, select "Untuk Pelanggan" di popup bebas dipilih (termasuk barang umum); bila sudah dikenali, select otomatis mengikuti customer pada invoice',
        en: 'When the invoice customer is not recognized yet, the "Untuk Pelanggan" select in the popup is free to choose (including general items); once recognized, it automatically follows the invoice customer',
      },
    ],
  },
  {
    version: '2026-11-04-v170',
    date: { id: '4 November 2026', en: '4 November 2026' },
    title: {
      id: 'Popup Tambah Barang Kembali di Daftar Barang',
      en: 'Add Item Popup Is Back on the Daftar Barang Page',
    },
    items: [
      {
        id: 'Halaman Daftar Barang: klik "Tambah Barang" kembali memunculkan popup form (nama, satuan, qty awal, harga modal, harga jual, keterangan) di desktop maupun HP — baris isian inline di tabel diganti popup',
        en: 'Daftar Barang page: clicking "Tambah Barang" opens the form popup again (name, unit, initial qty, cost, price, notes) on desktop and mobile — the inline table row is replaced by the popup',
      },
      {
        id: 'Edit barang tetap memakai popup yang sama; kode barang tetap dibuat otomatis oleh sistem',
        en: 'Editing an item still uses the same popup; the item code is still generated automatically by the system',
      },
    ],
  },
  {
    version: '2026-11-04-v169',
    date: { id: '4 November 2026', en: '4 November 2026' },
    title: {
      id: 'Pastikan Versi Terbaru Terpakai di Perangkat Anda',
      en: 'Make Sure the Latest Version Is Used on Your Device',
    },
    items: [
      {
        id: 'Popup "Tambah Barang" di halaman Daftar Barang memang sudah dihapus — barang baru kini diisi langsung di baris pertama tabel. Bila popup masih muncul di perangkat Anda, berarti aplikasi masih memakai versi lama: ketuk tombol "Muat Ulang" pada pemberitahuan "Versi baru aplikasi siap dipakai" di layar',
        en: 'The "Tambah Barang" popup on the Daftar Barang page has been removed — new items are filled directly in the first table row. If the popup still appears on your device, the app is running an old version: tap "Muat Ulang" (Reload) on the "Versi baru aplikasi siap dipakai" notice on screen',
      },
      {
        id: 'Kotak tabel Master Customer kini mengisi penuh sisa tinggi layar desktop (fit to desktop), tabel scroll di dalam kotak saat data banyak',
        en: 'The Master Customer table box now fills the remaining desktop screen height (fit to desktop), with the table scrolling inside the box when there is a lot of data',
      },
    ],
  },
  {
    version: '2026-11-04-v168',
    date: { id: '4 November 2026', en: '4 November 2026' },
    title: {
      id: 'Pemberitahuan Versi Baru dengan Tombol Muat Ulang',
      en: 'New Version Notice with Reload Button',
    },
    items: [
      {
        id: 'Saat ada pembaruan baru, muncul pemberitahuan kecil dengan tombol "Muat Ulang" — ketuk sekali untuk langsung memakai versi terbaru tanpa menunggu buka-tutup aplikasi; tidak ada refresh mendadak tanpa izin',
        en: 'When an update is available, a small notice with a "Muat Ulang" (Reload) button appears — tap once to use the latest version immediately without closing and reopening the app; no unrequested refresh',
      },
      {
        id: 'Memastikan semua perbaikan terbaru (termasuk tambah customer langsung tampil di Master Customer & refresh daftar otomatis) benar-benar terpakai di perangkat yang aplikasinya dibiarkan terbuka lama',
        en: 'Ensures all latest fixes (including added customers appearing right away in Master Customer & automatic list refresh) truly take effect on devices whose app has been left open for a long time',
      },
    ],
  },
  {
    version: '2026-11-04-v167',
    date: { id: '4 November 2026', en: '4 November 2026' },
    title: {
      id: 'Tambah Barang Langsung di Tabel & Pembaruan Paksa Aplikasi',
      en: 'Add Items Directly in the Table & Forced App Update',
    },
    items: [
      {
        id: 'Halaman Daftar Barang: popup tambah barang dihapus — barang baru kini diisi langsung di baris pertama tabel (nama, satuan, qty awal, harga modal, harga jual, keterangan) di desktop maupun HP',
        en: 'Daftar Barang page: the add-item popup is removed — new items are now filled directly in the first table row (name, unit, initial qty, cost, price, notes) on desktop and mobile',
      },
      {
        id: 'Popup Tambah Customer di Buat Invoice: bila koneksi terputus saat menyimpan, muncul pemberitahuan bahwa data tersimpan di perangkat dan akan otomatis tersinkron ke Master Customer saat online — tidak lagi tampak seperti sudah tersimpan padahal belum',
        en: 'Add Customer popup on Create Invoice: if the connection drops while saving, a notice now shows that data is stored on the device and will auto-sync to Master Customer when online — no longer appears saved when it is not',
      },
      {
        id: 'Pembaruan v167 dipaksa ke semua perangkat ber-cache (service worker baru) supaya semua perbaikan terbaru — termasuk refresh otomatis daftar setelah tambah/hapus — langsung terpakai',
        en: 'v167 is forced onto all cached devices (new service worker) so all latest fixes — including auto list refresh after add/delete — take effect immediately',
      },
    ],
  },
  {
    version: '2026-11-04-v166',
    date: { id: '4 November 2026', en: '4 November 2026' },
    title: {
      id: 'Perbaikan: Semua Dropdown Halaman Hitung Cetakan Konsisten di HP',
      en: 'Fix: All Dropdowns on Hitung Cetakan Page Consistent on Mobile',
    },
    items: [
      {
        id: 'Semua tombol dropdown di halaman Hitung Cetakan (customer, suplier, bahan, mesin, mesin 2, finishing, metode profit gabungan) kini membuka panel pilihan dalam aplikasi — tampilannya sama rapi seperti versi desktop, di HP online maupun offline',
        en: 'All dropdown buttons on the Hitung Cetakan page (customer, supplier, material, machine, machine 2, finishing, combined profit method) now open an in-app selection panel — looks as neat as the desktop version, on mobile online or offline',
      },
      {
        id: 'Tidak lagi membuka picker bawaan HP yang membuat tampilan halaman berubah/ter-zoom setelah memilih (khususnya di iPhone)',
        en: 'No longer opens the phone native picker that made the page look changed/zoomed after selecting (especially on iPhone)',
      },
    ],
  },
  {
    version: '2026-11-03-v165',
    date: { id: '3 November 2026', en: '3 November 2026' },
    title: {
      id: 'Perbaikan: Hapus/Tambah Data Langsung Ter-Refresh',
      en: 'Fix: Delete/Add Data Now Refreshes Instantly',
    },
    items: [
      {
        id: 'Perbaikan bug cache: setelah hapus barang/harga customer (atau tambah data baru), daftar kini langsung memperlihatkan perubahan tanpa perlu reload halaman',
        en: 'Cache bug fix: after deleting an item/customer price (or adding new data), the list now reflects the change immediately without needing a page reload',
      },
    ],
  },
  {
    version: '2026-11-03-v164',
    date: { id: '3 November 2026', en: '3 November 2026' },
    title: {
      id: 'Mode Offline & Cache Cerdas — Makin Cepat, Tahan Internet Mati',
      en: 'Offline Mode & Smart Cache — Faster, Survives Internet Outage',
    },
    items: [
      {
        id: 'Menu terbuka instan: data yang pernah dibuka (customer, barang, kertas, ongkos cetak, invoice, dll) tersimpan aman di perangkat per-akun — klik pertama tidak lagi menunggu server, hemat kuota',
        en: 'Menus open instantly: previously opened data (customers, items, papers, print costs, invoices, etc.) is safely cached on your device per account — the first click no longer waits for the server and saves quota',
      },
      {
        id: 'Tahan internet mati: tambah/edit/hapus saat offline otomatis masuk antrian perangkat & tersinkron ke database begitu online (dengan proteksi anti duplikat)',
        en: 'Survives internet outage: add/edit/delete while offline is queued on your device and synced to the database once back online (with duplicate protection)',
      },
      {
        id: 'Seluruh halaman aplikasi tersimpan untuk offline (PWA) + banner status offline dengan waktu sinkron terakhir; data sensitif (login, notifikasi, pembayaran) tetap selalu segar & tidak pernah di-cache',
        en: 'All app pages are stored for offline use (PWA) + offline banner with last-sync time; sensitive data (login, notifications, payments) always stays fresh and is never cached',
      },
    ],
  },
  {
    version: '2026-10-10-v151',
    date: { id: '10 Oktober 2026', en: '10 October 2026' },
    title: {
      id: 'Sistem Langganan SaaS — Pilih Paket, Bayar Manual, Verifikasi Admin',
      en: 'SaaS Subscription System — Choose Plan, Manual Payment, Admin Verification',
    },
    items: [
      {
        id: 'Sistem langganan bulanan lengkap: 3 paket (Basic/Pro/Premium) yang bisa diatur Admin — harga, perincian fitur, harga coret/diskon, batas akun/transaksi/penyimpanan, masa berlaku, dan status aktif',
        en: 'Complete monthly subscription system: 3 plans (Basic/Pro/Premium) fully managed by Admin — price, feature details, strike-through discount price, account/transaction/storage limits, validity period, and active status',
      },
      {
        id: 'Menu baru LANGGANAN: Pilih Paket (halaman pemilihan paket), Langganan Saya (status, tanggal, sisa hari, tagihan, riwayat pembayaran, kuitansi digital), dan Panel Admin khusus admin',
        en: 'New SUBSCRIPTION menu: Choose Plan, My Subscription (status, dates, days left, invoices, payment history, digital receipt), and Admin-only Admin Panel',
      },
      {
        id: 'Pembayaran manual QRIS & Transfer Bank: tagihan bernomor unik dengan nominal beku, unggah bukti pembayaran (file JPG/PNG), status Menunggu Verifikasi — langganan TIDAK aktif sebelum Admin menyetujui',
        en: 'Manual QRIS & Bank Transfer payment: unique invoice number with frozen amount, upload payment proof (JPG/PNG files), Waiting Verification status — subscription NOT active until Admin approves',
      },
      {
        id: 'Panel Admin Langganan: Ringkasan pendapatan, Verifikasi Pembayaran (lihat bukti, Setujui/Tolak dengan alasan — idempoten anti klik ganda), Kelola Pelanggan (cari, tangguhkan/aktifkan dengan catatan audit), Riwayat Transaksi (filter + ekspor CSV), Pengaturan Pembayaran (QRIS, rekening, instruksi, masa tenggang)',
        en: 'Subscription Admin Panel: revenue summary, Payment Verification (view proof, Approve/Reject with reason — idempotent), Customer Management (search, suspend/unsuspend with audit notes), Transaction History (filters + CSV export), Payment Settings (QRIS, bank account, instructions, grace period)',
      },
      {
        id: 'Aktivasi & perpanjangan otomatis setelah persetujuan: perpanjang sebelum berakhir ditambah dari tanggal tercatat; ganti paket mulai dari tanggal persetujuan; akun kedaluwarsa dibatasi aksesnya tapi data tetap aman',
        en: 'Automatic activation & renewal after approval: renewal before expiry extends from the recorded end date; plan change starts from approval date; expired accounts have restricted access but data stays safe',
      },
      {
        id: 'Notifikasi in-app langganan (tagihan baru, bukti terkirim, disetujui, ditolak) + harga landing kini LIVE dari database mengikuti paket yang diatur Admin',
        en: 'In-app subscription notifications (new invoice, proof sent, approved, rejected) + landing page prices now LIVE from the database following Admin-managed plans',
      },
    ],
  },
  {
    version: '2026-10-08-v148',
    date: { id: '8 Oktober 2026', en: '8 October 2026' },
    title: {
      id: 'Riwayat Hitung Cetakan Terhubung dengan Potong Kertas',
      en: 'Print Calculation History Linked to Paper Cutting',
    },
    items: [
      {
        id: 'Edit riwayat Potong Kertas lalu klik "Hitung Cetakan Lengkap" → data hitung cetakan yang sudah tersimpan otomatis terbuka kembali untuk diedit (tombol berubah jadi "Update Riwayat") — tidak dibuat duplikat baru lagi',
        en: 'Edit a Paper Cutting history entry, then click "Hitung Cetakan Lengkap" → its saved print calculation automatically reopens for editing (the button becomes "Update Riwayat") — no more duplicate entries',
      },
      {
        id: 'Nomor Hitung Cetakan yang tampil saat lanjut edit adalah nomor riwayat yang terhubung dengan potong kertas tersebut (mis. HC/10/26/0013) — bukan nomor baru',
        en: 'When continuing an edit, the Print Calculation number shown is the connected history number (e.g. HC/10/26/0013) — not a new number',
      },
      {
        id: 'Hubungan keduanya tersimpan permanen di database — riwayat lama pun otomatis terhubung saat pertama kali disimpan ulang',
        en: 'The link between them is stored permanently in the database — older entries get linked automatically the first time they are re-saved',
      },
      {
        id: 'Halaman Harga per Customer kini menampilkan kolom Tanggal (tanggal dibuat) di tabel versi desktop & kartu di HP',
        en: 'The Price per Customer page now shows a Date column (creation date) in the desktop table & on phone cards',
      },
      {
        id: 'Tabel Riwayat Hitung Cetakan kini menampilkan kolom No PK — nomor Potong Kertas yang terhubung (mis. PK/10/26/0017), juga bisa dicari lewat kotak pencarian',
        en: 'The Print Calculation history table now shows a No PK column — the linked Paper Cutting number (e.g. PK/10/26/0017), also searchable via the search box',
      },
      {
        id: 'Editor Hitung Cetakan kini selalu menampilkan kotak No. Potong Kertas (Referensi) — nomor Potong Kertas asal data informasi cetakan & harga bahan (tampil "—" bila belum terhubung)',
        en: 'The Print Calculation editor now always shows a Paper Cutting No. (Reference) box — the Paper Cutting number the print info & paper prices came from (shows "—" when not linked)',
      },
    ],
  },
  {
    version: '2026-10-03-v147',
    date: { id: '7 Oktober 2026', en: '7 October 2026' },
    title: {
      id: 'Nama Suplier Tersinkron Antar Halaman + Profit Bisa Lebih dari 100%',
      en: 'Supplier Name Synced Across Pages + Profit Can Exceed 100%',
    },
    items: [
      {
        id: 'Pilihan Nama Suplier kini tersinkron antar halaman Hitung Cetakan, Potong Kertas & Hitung Harga Kertas — pilih sekali di halaman mana pun (mis. Bintang Timur di Potong Kertas), halaman lain otomatis mengikuti',
        en: 'The Supplier Name choice now syncs across the Print Calculation, Paper Cutting & Paper Price Calculator pages — pick it once on any page (e.g. Bintang Timur on Paper Cutting) and the other pages follow automatically',
      },
      {
        id: 'Profit (%) kini bisa diisi lebih dari 100% di Hitung Cetakan & Potong Kertas (sebelumnya dibatasi maksimal 100%)',
        en: 'Profit (%) can now be set above 100% in Print Calculation & Paper Cutting (previously capped at 100%)',
      },
    ],
  },
  {
    version: '2026-10-03-v146',
    date: { id: '6 Oktober 2026', en: '6 October 2026' },
    title: {
      id: 'Nama Suplier di Kalkulator + Harga Kertas /kg Dibulatkan',
      en: 'Supplier Name in Calculators + Rounded Paper Price per Kg',
    },
    items: [
      {
        id: 'Hitung Harga Kertas & Hitung Cetakan kini punya pilihan Nama Suplier (dari Master Toko Pemasok) — pilih suplier untuk memfilter bahan & harga mengikuti Master Harga Kertas milik suplier tsb, tersimpan di riwayat',
        en: 'Paper Price Calculator & Print Calculation now have a Supplier Name picker (from the Supplier Master) — picking a supplier filters materials & prices follow that supplier\'s Paper Price Master, saved in history',
      },
      {
        id: 'Harga Kertas /kg di Hitung Cetakan & Potong Kertas dibulatkan ke rupiah penuh — konsisten dengan kolom Harga/kg di Master Harga Kertas (tidak ada desimal lagi)',
        en: 'Paper Price per Kg in Print Calculation & Paper Cutting is now rounded to whole rupiah — consistent with the Price/Kg column in the Paper Price Master (no more decimals)',
      },
    ],
  },
  {
    version: '2026-10-03-v145',
    date: { id: '5 Oktober 2026', en: '5 October 2026' },
    title: {
      id: 'Harga Kertas /kg di Rincian Harga Cetakan',
      en: 'Paper Price per Kg in Print Calculation Details',
    },
    items: [
      {
        id: 'Detail Rincian Cetakan di Hitung Cetakan kini menampilkan Harga Kertas /kg (sesuai harga di form, atau dihitung otomatis dari harga per lembar, ukuran kertas & gramatur) — ikut tampil di hasil cetak & gambar JPG',
        en: 'The print calculation details page now shows Paper Price per Kg (as entered in the form, or auto-calculated from price per sheet, paper size & grammage) — included in print & JPG output too',
      },
    ],
  },
  {
    version: '2026-10-03-v19',
    date: { id: '5 Oktober 2026', en: '5 October 2026' },
    title: {
      id: 'Harga Kertas /kg di Preview Potong Kertas',
      en: 'Paper Price per Kg in Cutting Preview',
    },
    items: [
      {
        id: 'Preview Potong Kertas kini menampilkan Harga Kertas /kg (otomatis dari harga per lembar, atau sesuai input manual) — ikut tampil di hasil cetak & gambar JPG',
        en: 'The paper cutting preview now shows Paper Price per Kg (auto-converted from price per sheet, or as entered manually) — included in print & JPG output too',
      },
      {
        id: 'Perbaikan: Harga/Lembar di preview riwayat kini menampilkan harga sesuai data riwayat (bukan harga yang sedang ada di form)',
        en: 'Fix: Price/Sheet in history preview now shows the price recorded in that history entry (not the form\'s current price)',
      },
    ],
  },
  {
    version: '2026-10-03-v18',
    date: { id: '5 Oktober 2026', en: '5 October 2026' },
    title: {
      id: 'Semua Tabel Bisa Di-Resize Kolomnya',
      en: 'All Tables Have Resizable Columns',
    },
    items: [
      {
        id: 'Tarik tepi kanan judul kolom di semua tabel untuk membesarkan/mengecilkan kolom secara manual — lebar tersimpan otomatis per halaman; dobel-klik handle untuk mengembalikan ke lebar awal',
        en: 'Drag the right edge of any column header in all tables to manually widen/narrow it — widths are saved automatically per page; double-click the handle to reset',
      },
    ],
  },
  {
    version: '2026-10-03-v17',
    date: { id: '5 Oktober 2026', en: '5 October 2026' },
    title: {
      id: 'Aplikasi Selalu Standby — Tanpa Auto-Refresh',
      en: 'App Always Standby — No Auto-Refresh',
    },
    items: [
      {
        id: 'Aplikasi tidak lagi me-refresh dirinya sendiri walau tidak dipakai berhari-hari — selalu langsung siap pakai dari cache, versi baru otomatis aktif saat dibuka ulang',
        en: 'The app no longer refreshes itself even after days of inactivity — always instantly ready from cache; new versions apply automatically on next open',
      },
    ],
  },
  {
    version: '2026-10-03-v16',
    date: { id: '5 Oktober 2026', en: '5 October 2026' },
    title: {
      id: 'Hitungan Ongkos Cetak Konsisten (Online = Offline)',
      en: 'Print Cost Calculation Consistent (Online = Offline)',
    },
    items: [
      {
        id: 'Perbaikan hasil hitungan ongkos cetak di Hitung Cetakan yang berbeda antara mode offline & online: data master (mesin, kertas, dll) di mode offline kini tersimpan per-akun, jadi selalu sama dengan yang terlihat saat online',
        en: 'Fixed print cost results in Hitung Cetakan differing between offline & online modes: master data (machines, papers, etc.) is now cached per-account offline, always matching what online shows',
      },
      {
        id: 'Harga plat kini otomatis mengikuti mesin yang dipilih saat ganti mesin — tidak lagi memakai sisa harga plat dari mesin sebelumnya',
        en: 'Plate price now automatically follows the selected machine when switching machines — no longer reusing the previous machine\'s plate price',
      },
    ],
  },
  {
    version: '2026-10-03-v15',
    date: { id: '5 Oktober 2026', en: '5 October 2026' },
    title: {
      id: 'Kolom Harga/Kg di Master Harga Kertas',
      en: 'Price/Kg Column in Paper Price Master',
    },
    items: [
      {
        id: 'Tabel Master Harga Kertas kini menampilkan kolom Harga/Kg (otomatis dihitung dari Harga/Rim & ukuran kertas) — tampil di desktop, HP, dan hasil cetak tabel',
        en: 'The Paper Price Master table now shows a Price/Kg column (auto-calculated from Price/Rim & paper size) — on desktop, mobile, and printed table',
      },
    ],
  },
  {
    version: '2026-10-03-v14',
    date: { id: '4 Oktober 2026', en: '4 October 2026' },
    title: {
      id: 'Telepon & Email Jadi 2 Baris di HP',
      en: 'Phone & Email on 2 Rows on Phones',
    },
    items: [
      {
        id: 'Di popup Tambah Pelanggan pada layar HP, kolom Telepon dan Email kini tersusun 2 baris (penuh lebar) agar lebih lega diisi — di desktop tetap berdampingan',
        en: 'In the Add Customer popup on phone screens, the Phone and Email fields are now stacked in 2 full-width rows for easier typing — side by side on desktop unchanged',
      },
    ],
  },
  {
    version: '2026-10-03-v13',
    date: { id: '4 Oktober 2026', en: '4 October 2026' },
    title: {
      id: 'Popup Pelanggan Kecil & Pas di Layar HP',
      en: 'Customer Popup Compact & Fits Phone Screens',
    },
    items: [
      {
        id: 'Popup Tambah Pelanggan dibuat lebih kecil & rapat — muat di layar HP tanpa digulir: kode otomatis di baris atas, Telepon & Email sejajar, tombol Batal & Simpan berdampingan',
        en: 'The Add Customer popup is smaller & tighter — fits phone screens without scrolling: auto code on the top line, Phone & Email side by side, Cancel & Save buttons in one row',
      },
      {
        id: 'Tombol phone book lebih ringkas ("Isi dari Phone Book") dan petunjuk browser tak didukung lebih pendek',
        en: 'Shorter phone book button ("Isi dari Phone Book") and a more concise hint on unsupported browsers',
      },
    ],
  },
  {
    version: '2026-10-03-v12',
    date: { id: '4 Oktober 2026', en: '4 October 2026' },
    title: {
      id: 'Popup Tambah Pelanggan Rapi di HP',
      en: 'Neat Add Customer Popup on Phones',
    },
    items: [
      {
        id: 'Popup Tambah/Edit Pelanggan kini pas di layar HP — bisa digulir, tombol Simpan selalu terjangkau, kolom tidak lagi terpotong',
        en: 'The Add/Edit Customer popup now fits phone screens — scrollable, Save always reachable, no more cut-off fields',
      },
      {
        id: 'Isi dari phone book: petunjuk jelas bila browser tidak mendukung, dukungan saran kontak lebih baik di iPhone, huruf kolom lebih besar agar tidak zoom sendiri',
        en: 'Phone book fill: clear hint on unsupported browsers, better contact suggestions on iPhone, larger field text to prevent auto-zoom',
      },
    ],
  },
  {
    version: '2026-10-03-v11',
    date: { id: '4 Oktober 2026', en: '4 October 2026' },
    title: {
      id: 'Isi Pelanggan dari Phone Book & Menu Lebih Ringkas',
      en: 'Fill Customers from Phone Book & Leaner Menu',
    },
    items: [
      {
        id: 'Popup Tambah Pelanggan kini bisa mengisi Nama & Telepon langsung dari phone book HP (Android/Chrome); tetap bisa diketik manual',
        en: 'The Add Customer popup can now fill Name & Phone straight from the phone book (Android/Chrome); manual typing still works',
      },
      {
        id: 'Menu Riwayat Pembayaran dihapus dari sidebar — halaman masih bisa dibuka dari kartu Jatuh Tempo di Beranda',
        en: 'Payment History removed from the sidebar — the page is still reachable from the Due card on Home',
      },
    ],
  },
  {
    version: '2026-10-03-v10',
    date: { id: '4 Oktober 2026', en: '4 October 2026' },
    title: {
      id: 'Kategori di Master Suplier & Daftar Kategori Baru',
      en: 'Category in Supplier Master & New Category List',
    },
    items: [
      {
        id: 'Jenis Barang di Master Toko/Pemasok diganti jadi Kategori — kini dropdown pilihan dari Daftar Kategori',
        en: 'Item Type in Supplier Master is now Category — a dropdown fed from the Category List',
      },
      {
        id: 'Halaman Daftar Kategori tampilan baru: ringkasan, tabel/kartu, tambah, edit nama, dan hapus dengan konfirmasi',
        en: 'Category List page redesigned: summary stats, table/cards, add, rename, and delete with confirmation',
      },
    ],
  },
  {
    version: '2026-10-03-v9',
    date: { id: '4 Oktober 2026', en: '4 October 2026' },
    title: {
      id: 'Dropdown Suplier di Tambah Kertas Baru',
      en: 'Supplier Dropdown in Add New Paper',
    },
    items: [
      {
        id: 'Kolom Suplier di popup Tambah Kertas Baru kini punya dropdown daftar Master Suplier yang selalu muncul saat diklik',
        en: 'The Supplier field in the Add New Paper popup now has a Master Supplier dropdown that always appears on click',
      },
      {
        id: 'Daftar suplier = Master Toko Pemasok + suplier yang pernah dipakai; ketik untuk mencari, ada pilihan hapus nama suplier',
        en: 'Supplier list = Supplier Store master + previously used suppliers; type to search, with a clear-field option',
      },
    ],
  },
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
