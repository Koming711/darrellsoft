/**
 * Data Warm-up — siapkan data lokal (IndexedDB) untuk menu-menu kunci
 * saat aplikasi idle & online.
 *
 * Tujuan (Fast Menu + Offline Ready):
 * - Klik PERTAMA pada menu manapun langsung menampilkan data (dari cache
 *   lokal), bukan skeleton/spinner — tanpa pernah membuka menunya dulu.
 * - Mode offline langsung berguna setelah login: master data inti sudah
 *   tersimpan di perangkat.
 *
 * Aturan hemat-request:
 * - Hanya 6 endpoint master kecil (bukan seluruh data menu).
 * - Hanya saat online, hanya saat tab idle, throttle 30 menit.
 * - Lewat smartGet: bila cache masih berlaku (TTL), NOL request dikirim.
 * - Endpoint yang gagal (mis. anggota grup tanpa akses) diabaikan senyap.
 */

import { smartGet, currentUid } from './smart-fetch'

const WARMUP_INTERVAL_MS = 30 * 60 * 1000 // 30 menit
const LAST_RUN_KEY = 'ds_data_warmup_last_run'
const WARM_DELAY_MS = 4_000 // tunggu aplikasi selesai render

/**
 * Endpoint master yang dibutuhkan hampir semua menu inti.
 * URL harus PERSIS seperti yang dipakai halaman (kunci cache sama).
 */
const WARM_URLS: readonly string[] = [
  '/api/beranda', // dashboard/beranda
  '/api/customers?q=', // master & pilihan customer
  '/api/items?q=&active=all', // master & pilihan barang/produk
  '/api/papers', // master harga kertas (potong kertas & hitung cetakan)
  '/api/printing-costs', // master ongkos cetak (hitung cetakan)
  '/api/finishings', // master finishing (hitung cetakan)
]

function shouldRun(): boolean {
  try {
    const last = Number(localStorage.getItem(LAST_RUN_KEY) || 0)
    return Date.now() - last >= WARMUP_INTERVAL_MS
  } catch {
    return true
  }
}

function markRun(): void {
  try {
    localStorage.setItem(LAST_RUN_KEY, String(Date.now()))
  } catch { /* storage penuh — abaikan */ }
}

async function warmAll(): Promise<void> {
  // Berurutan (bukan paralel) agar tidak berebut bandwidth dengan aktivitas user
  for (const url of WARM_URLS) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    try {
      await smartGet(url)
    } catch { // RBAC tanpa akses / network drop — lanjut berikutnya
    }
  }
}

/**
 * Jadwalkan warm-up. Aman dipanggil berkali-kali (throttle internal).
 * Dipanggil dari ConnectivityKeeper setelah aplikasi mount.
 */
export function scheduleDataWarmup(): void {
  if (typeof window === 'undefined') return
  if (!shouldRun()) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return

  const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }
  const run = () => {
    // WAJIB sudah login: tanpa uid smartGet tidak mau men-cache (salinan
    // harus terikat ke akun). Jangan markRun — biarkan dicoba lagi setelah
    // login (ConnectivityKeeper memanggil ulang saat event auth-change).
    if (!currentUid()) return
    if (!shouldRun()) return
    if (navigator.onLine === false) return
    // Tandai dulu supaya tab lain / render ulang tidak dobel jalan
    markRun()
    void warmAll()
  }
  const schedule = () => {
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(run, { timeout: WARM_DELAY_MS + 15_000 })
    } else {
      setTimeout(run, WARM_DELAY_MS)
    }
  }
  if (document.readyState === 'complete') schedule()
  else window.addEventListener('load', schedule, { once: true })
}
