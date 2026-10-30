/**
 * Motivasi usaha harian — ditampilkan di Beranda (/pembukaan).
 * Berganti OTOMATIS setiap hari secara deterministik (indeks = hari ke-n tahun),
 * jadi semua pengguna melihat motivasi yang sama pada hari yang sama
 * dan berubah tepat saat berganti hari — tanpa perlu API/setting.
 */

export const MOTIVASI_USAHA: string[] = [
  'Kualitas adalah cara terbaik untuk membuat pelanggan kembali lagi.',
  'Usaha kecil hari ini adalah perusahaan besar hari esok — terus bertumbuh.',
  'Pelanggan yang puas adalah iklan yang tidak pernah berhenti bekerja.',
  'Disiplin lebih penting daripada motivasi; motivasi membuat Anda mulai, disiplin membuat Anda terus berjalan.',
  'Setiap order yang selesai tepat waktu adalah investasi nama baik usaha Anda.',
  'Keuntungan kecil yang konsisten lebih baik daripada keuntungan besar yang sekali saja.',
  'Catat setiap rupiah — usaha yang tercatat adalah usaha yang terkendali.',
  'Jangan takut bersaing; takutlah jika kualitas Anda tidak membaik setiap hari.',
  'Mesin cetak menghasilkan kertas, layanan menghasilkan pelanggan setia.',
  'Pekerjaan yang sulit membawa kita ke tempat yang baik — satu order demi satu order.',
  'Reputasi dibangun bertahun-tahun, rusak dalam satu order yang buruk. Jaga kualitas.',
  'Hari yang lambat bukan hari yang gagal — teruslah memperbaiki proses.',
  'Sukses adalah jumlah dari usaha kecil yang dilakukan berulang setiap hari.',
  'Naikkan standar Anda, dan pelanggan akan mengikuti.',
  'Waktu yang dihabiskan untuk merapikan tempat kerja adalah investasi efisiensi.',
  'Belajar dari keluhan pelanggan — itu peta menuju usaha yang lebih baik.',
  'Jangan menunggu kesempatan; buatlah — seperti mencetak peluang di atas kertas.',
  'Harga boleh ditandingi, tapi kualitas dan kejujuran sulit digantikan.',
  'Tumbuh bersama pelanggan: dengarkan kebutuhan mereka sebelum mereka meminta.',
  'Setiap rupiah piutang yang tertagih adalah napas baru bagi arus kas usaha.',
  'Kerja rapi hari ini menghemat perbaikan mahal di esok hari.',
  'Bersaing dengan diri Anda kemarin — itulah tolok ukur pertumbuhan.',
  'Usaha yang jujur dengan catatan rapi akan selalu menemukan jalannya.',
  'Layanan cepat + hasil rapi = rekomendasi tanpa henti.',
  'Bersyukur atas order kecil — order besar lahir dari kepercayaan.',
  'Investasi terbaik di usaha percetakan adalah ketelitian dan ketepatan waktu.',
  'Yang membedakan usaha biasa dan luar biasa adalah konsistensi.',
  'Setiap hari adalah halaman baru — cetaklah dengan karya terbaik Anda.',
  'Tim yang hebat menghasilkan karya yang hebat; apresiasi mereka hari ini.',
  'Ulasan baik pelanggan adalah laba yang tidak tercatat di pembukuan.',
  'Jangan hitung jam kerja; hitung nilai yang Anda berikan kepada pelanggan.',
]

/** Indeks hari dalam tahun (1..366) — deterministik per tanggal. */
function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1)
  return Math.floor((date.getTime() - start.getTime()) / 86400000) + 1
}

/** Motivasi untuk hari ini — berganti otomatis setiap hari. */
export function motivasiHariIni(date: Date = new Date()): string {
  const list = MOTIVASI_USAHA
  if (!list.length) return ''
  return list[(dayOfYear(date) - 1) % list.length]
}
