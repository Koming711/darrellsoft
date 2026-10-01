/**
 * Offline Warm-up — simpan SELURUH asset aplikasi ke Cache Storage.
 *
 * Setelah aplikasi dibuka sekali saat ONLINE, modul ini mengirim semua URL
 * aplikasi (semua route halaman + chunk JS/CSS/font di dokumen) ke service
 * worker (public/sw.js → handler PRECACHE_URLS). SW mengambil & menyimpan
 * semuanya di Cache Storage di latar belakang — SENYAP, tanpa mengganggu
 * pekerjaan user.
 *
 * Hasilnya: saat internet terputus, aplikasi tetap dapat dibuka dari icon
 * PWA maupun browser — semua halaman, chunk, dan halaman fallback offline
 * tersedia dari cache. Tidak ada "Network Error" / "Failed to fetch".
 *
 * Aturan jalan:
 * - Hanya production (di dev SW sengaja di-unregister).
 * - Hanya saat online.
 * - Throttle: maksimal 1x per 12 jam, ATAU langsung saat versi app berubah
 *   (deploy baru → cache lama sudah dihapus SW pada activate).
 */

const WARMUP_INTERVAL_MS = 12 * 60 * 60 * 1000 // 12 jam
const WARMUP_DELAY_MS = 6_000 // tunggu aplikasi selesai render dulu
const LAST_RUN_KEY = 'offline_warmup_last_run'
const LAST_VERSION_KEY = 'offline_warmup_last_version'

/**
 * Semua route halaman aplikasi (folder page.tsx di src/app, tanpa dynamic
 * segment). Kalau menambah halaman baru, daftarkan di sini supaya ikut
 * tersedia offline.
 */
export const ALL_APP_ROUTES: readonly string[] = [
  '/',
  '/login',
  '/reset-password',
  '/pembukaan',
  '/dashboard',
  '/administrasi',
  '/biaya',
  '/biaya-operasional',
  '/checkout',
  '/daftar-barang-customer',
  '/daftar-kategori',
  '/harga-khusus',
  '/hitung-cetakan',
  '/hitung-finishing',
  '/hitung-harga-kertas',
  '/hitung-ongkos-cetak',
  '/hutang-dagang',
  '/invoice',
  '/laporan',
  '/master-barang',
  '/master-barang-customer',
  '/master-customer',
  '/master-finishing',
  '/master-harga-kertas',
  '/master-kertas',
  '/master-ongkos-cetak',
  '/master-toko-pemasok',
  '/pembelian',
  '/piutang-dagang',
  '/potong-kertas',
  '/purchase-order',
  '/rekap-penjualan',
  '/riwayat',
  '/riwayat-hitung-cetakan',
  '/riwayat-pembayaran',
  '/riwayat-pembelian',
  '/riwayat-penjualan',
  '/riwayat-potong-kertas',
  '/stock-bahan',
  '/surat-jalan',
]

/** Kumpulkan asset JS/CSS/font ikon yang sedang dimuat dokumen ini */
function collectDocumentAssetUrls(): string[] {
  const urls = new Set<string>()
  try {
    if (typeof document === 'undefined') return []
    document.querySelectorAll('script[src]').forEach(el => {
      const src = el.getAttribute('src')
      if (src) urls.add(src)
    })
    document.querySelectorAll('link[href]').forEach(el => {
      const rel = el.getAttribute('rel') || ''
      const href = el.getAttribute('href')
      if (!href) return
      if (/stylesheet|preload|prefetch|preinit|icon|apple-touch-icon|manifest/i.test(rel)) {
        urls.add(href)
      }
    })
  } catch { /* DOM tidak siap — abaikan */ }
  return Array.from(urls)
}

async function postPrecacheToSw(urls: string[]): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false
    const reg = await navigator.serviceWorker.ready
    if (!reg.active) return false
    reg.active.postMessage({ type: 'PRECACHE_URLS', urls })
    return true
  } catch {
    return false
  }
}

function shouldRun(versionChanged: boolean): boolean {
  try {
    const now = Date.now()
    const last = Number(localStorage.getItem(LAST_RUN_KEY) || 0)
    const lastVersion = localStorage.getItem(LAST_VERSION_KEY) || ''
    if (versionChanged && lastVersion !== versionChangedKey()) return true
    if (now - last < WARMUP_INTERVAL_MS) return false
    return true
  } catch {
    return true
  }
}

function versionChangedKey(): string {
  try { return localStorage.getItem('app_version') || '' } catch { return '' }
}

function markRun(): void {
  try {
    localStorage.setItem(LAST_RUN_KEY, String(Date.now()))
    localStorage.setItem(LAST_VERSION_KEY, versionChangedKey())
  } catch { /* storage penuh — abaikan */ }
}

/**
 * Jadwalkan warm-up (panggil setelah SW berhasil diregistrasi).
 * Aman dipanggil berkali-kali — throttle mencegah kerja berulang.
 */
export function scheduleOfflineWarmup(versionChanged = false): void {
  if (typeof window === 'undefined') return
  if (process.env.NODE_ENV !== 'production') return // dev: SW tidak aktif
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return

  const run = () => {
    if (!shouldRun(versionChanged)) return
    // Tunggu jaringan benar-benar siap; kalau offline di detik terakhir, skip
    if (navigator.onLine === false) return
    const urls = [
      ...ALL_APP_ROUTES,
      '/?source=pwa', // start_url PWA — supaya buka dari icon offline pun hidup
      '/offline.html',
      ...collectDocumentAssetUrls(),
    ]
    void postPrecacheToSw(urls).then(sent => {
      if (sent) markRun()
    })
  }

  // Tunggu aplikasi idle — jangan rebut bandwidth saat load
  const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }
  const delay = WARMUP_DELAY_MS
  const schedule = () => {
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(run, { timeout: delay + 10_000 })
    } else {
      setTimeout(run, delay)
    }
  }
  if (document.readyState === 'complete') schedule()
  else window.addEventListener('load', schedule, { once: true })
}
