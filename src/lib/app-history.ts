// Penanda urutan navigasi in-app (client-only).
//
// Tombol back di header mobile perlu tahu "apakah ada halaman sebelumnya
// DI DALAM aplikasi". Dulu dicek via `window.history.state.idx` — key itu
// hanya ada di Next.js versi lama; sejak Next 15/16 history.state hanya
// berisi { __NA, __PRIVATE_NEXTJS_INTERNALS_TREE } sehingga pengecekan
// selalu gagal dan tombol back selalu fallback ke Beranda (tidak pernah
// kembali ke halaman sebelumnya).
//
// Solusi: tandai setiap entry history dengan `dsAppIdx` (nomor urut entry
// in-app) via history.replaceState SETELAH route berubah — dipanggil
// DashboardLayout (shell semua halaman app). Saat user traverse
// back/forward, entry lama masih membawa tag-nya, sehingga tombol back
// bisa membedakan:
//   dsAppIdx > 1  → ada halaman sebelumnya di dalam app → router.back()
//   dsAppIdx <= 1 → entry pertama (cold start PWA / refresh / langsung
//                   buka URL) → fallback Beranda, mencegah tombol back
//                   menutup PWA atau melompat keluar aplikasi.
//
// Catatan: state Next.js (__NA & __PRIVATE_NEXTJS_INTERNALS_TREE) selalu
// dipertahankan (spread) agar navigasi/restore Next tetap berfungsi.

let dsCounter = 0

/** Tandai entry history AKTIF dengan nomor urut in-app (idempoten per entry). */
export function tagCurrentHistoryEntry(): void {
  if (typeof window === 'undefined') return
  try {
    const st = (window.history.state || {}) as Record<string, unknown>
    if (typeof st.dsAppIdx === 'number') {
      // Entry sudah bertanda = hasil traversal back/forward, pemanggilan
      // ganda (StrictMode), atau entry lama pasca-refresh halaman.
      // Jangan hitung ulang — tapi lanjutkan counter dari tag entry agar
      // push berikutnya tetap naik (tag baru selalu > tag halaman aktif).
      if ((st.dsAppIdx as number) > dsCounter) dsCounter = st.dsAppIdx as number
      return
    }
    dsCounter += 1
    window.history.replaceState({ ...st, dsAppIdx: dsCounter }, '')
  } catch {
    // Storage/state diblokir (mis. Safari private mode) — tombol back
    // akan fallback ke Beranda, tetap aman.
  }
}

/** true bila entry history aktif BUKAN halaman pertama sejak app dimuat → boleh router.back(). */
export function canGoBackInApp(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const st = window.history.state as Record<string, unknown> | null
    const idx = typeof st?.dsAppIdx === 'number' ? st.dsAppIdx : 0
    return idx > 1
  } catch {
    return false
  }
}
