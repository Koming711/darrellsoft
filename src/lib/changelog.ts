// Changelog data for "What's New" feature
// Bump CURRENT_VERSION when deploying new features
// Catatan versi: mulai rilis ini, nomor versi changelog mengikuti nomor rilis
// aplikasi (SW) — mis. "2026-10-03-v145" = rilis v145 — supaya versi yang
// dilihat user (popup What's New & footer) sama dengan versi deploy.
// Khusus v148: label user-facing TETAP "v148" sesuai permintaan user walau ada
// fitur baru (pk→hc); yang berubah hanya tanggal prefix CURRENT_VERSION
// ("2026-10-08-v148") supaya popup What's New muncul lagi, sementara CACHE_NAME
// SW naik sendiri (v150) agar perangkat ber-cache menerima bundle terbaru.

export const CURRENT_VERSION = '2026-11-05-v187'

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
