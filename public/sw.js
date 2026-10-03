const CACHE_NAME = 'darrell-soft-v126';
// Cache data API TIDAK ikut versi deploy → data yang pernah dibuka
// tetap tersedia offline meskipun aplikasi baru di-deploy.
const API_CACHE_NAME = 'darrell-api-runtime';
const MAX_API_CACHE_ENTRIES = 80;
const OFFLINE_URL = '/offline.html';
const START_URL = '/?source=pwa';
const STATIC_ASSETS = [
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/icon-maskable-192x192.png',
  '/icon-maskable-512x512.png',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
  '/logo-ds.png',
  '/manifest.json',
  OFFLINE_URL,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Handle SKIP_WAITING message from the registration page
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  // PRECACHE_URLS: halaman mengirim daftar URL (semua route aplikasi +
  // asset JS/CSS/font yang terlihat di dokumen) untuk di-cache SEKARANG,
  // selama online. Setelah aplikasi dibuka sekali saat online, SELURUH
  // asset aplikasi tersimpan → aplikasi tetap bisa dibuka saat offline.
  if (event.data && event.data.type === 'PRECACHE_URLS' && Array.isArray(event.data.urls)) {
    event.waitUntil(precacheUrls(event.data.urls));
  }
});

// Background Sync: browser membangunkan SW saat koneksi kembali (walau app
// ditutup). SW meneruskan ke halaman terbuka untuk menjalankan replay antrian
// offline (logika replay ada di halaman: lib/offline-queue.ts).
self.addEventListener('sync', (event) => {
  if (event.tag === 'darrell-offline-sync') {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'OFFLINE_SYNC' }));
      })
    );
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          // Hapus cache statis versi lama; cache data API dipertahankan
          .filter((k) => k.startsWith('darrell-soft-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// ---------------------------------------------------------------------------
// PRECACHE — simpan seluruh asset aplikasi saat online (background, senyap)
// ---------------------------------------------------------------------------

const PRECACHE_CONCURRENCY = 3;

/** Ambil semua URL /_next/static/... & aset lokal lain dari isi HTML */
function extractAssetUrls(htmlText) {
  const found = new Set();
  const re = /\/_next\/static\/[A-Za-z0-9_\-./@%]+/g;
  let m;
  while ((m = re.exec(htmlText)) !== null) {
    // Buang trailing escape/quote yang bisa ikut tertangkap
    found.add(m[0].replace(/[.,;)\]]+$/, ''));
  }
  return Array.from(found);
}

async function precacheOne(cache, url) {
  try {
    const resp = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
    if (!resp.ok || resp.type === 'opaque') return { url, ok: false, assets: [] };
    const contentType = resp.headers.get('content-type') || '';
    const clone = resp.clone();
    await cache.put(url, clone);
    let assets = [];
    // HTML halaman → parse referensi chunk JS/CSS Next.js lalu ikutkan,
    // supaya halaman yang BELUM PERNAH dikunjungi juga punya asset lengkap offline.
    if (contentType.includes('text/html')) {
      const text = await resp.text();
      assets = extractAssetUrls(text);
    }
    return { url, ok: true, assets };
  } catch (e) {
    return { url, ok: false, assets: [] };
  }
}

async function precacheUrls(urls) {
  try {
    const cache = await caches.open(CACHE_NAME);
    // Dedupe + hanya same-origin / path relatif
    const base = self.location.origin;
    const seen = new Set();
    const queue = [];
    urls.forEach((raw) => {
      try {
        const abs = new URL(raw, base);
        if (abs.origin !== base) return;
        if (abs.pathname.startsWith('/api/')) return; // data API lewat strategi tersendiri
        const key = abs.pathname + abs.search;
        if (seen.has(key)) return;
        seen.add(key);
        queue.push(abs.href);
      } catch (e) { /* skip url rusak */ }
    });

    let index = 0;
    async function worker() {
      while (index < queue.length) {
        const url = queue[index++];
        const res = await precacheOne(cache, url);
        // Asset chunk yang ditemukan di HTML → tambahkan ke antrian
        res.assets.forEach((a) => {
          try {
            const abs = new URL(a, base);
            const key = abs.pathname;
            if (!seen.has(key)) {
              seen.add(key);
              queue.push(abs.href);
            }
          } catch (e) { /* skip */ }
        });
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(PRECACHE_CONCURRENCY, queue.length || 1) }, () => worker())
    );
  } catch (e) {
    // Precache gagal → tidak fatal; SWR tetap mengcache asset yang dipakai
  }
}

// ---------------------------------------------------------------------------
// Fetch strategies
// ---------------------------------------------------------------------------

// Jaga ukuran cache data API agar tidak memenuhi storage perangkat
async function trimApiCache() {
  try {
    const cache = await caches.open(API_CACHE_NAME);
    const keys = await cache.keys();
    if (keys.length > MAX_API_CACHE_ENTRIES) {
      await cache.delete(keys[0]);
    }
  } catch (e) {
    // ignore
  }
}

/**
 * Strategi data API (GET): network-first.
 * - Online  → selalu ambil data terbaru dari server (data tetap fresh),
 *   lalu simpan salinan.
 * - Offline → sajikan salinan terakhir yang pernah dibuka (cached copy),
 *   sehingga aplikasi tetap bisa dipakai tanpa internet — TANPA
 *   "Network Error" / "Failed to fetch" di halaman utama.
 */
async function apiFetchHandler(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      // Hanya cache respons JSON (data) — file export/pdf/gambar tidak
      if (contentType.includes('application/json')) {
        const cache = await caches.open(API_CACHE_NAME);
        await cache.put(request, response.clone());
        trimApiCache();
      }
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    return new Response(
      JSON.stringify({ error: 'Anda sedang offline dan data belum pernah dibuka.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Data API: network-first + cache fallback offline
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(apiFetchHandler(event.request));
    return;
  }

  // Navigasi (HTML): network first → cache (exact → start_url → root) → offline.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          const exact = await caches.match(event.request);
          if (exact) return exact;
          // Variants of start_url (mis. '/?source=pwa' saat dibuka dari icon PWA)
          const withStartUrl = await caches.match(START_URL, { ignoreSearch: true });
          if (withStartUrl) return withStartUrl;
          // Root '/' selalu di-cache oleh precache → aplikasi tetap terbuka normal
          const root = await caches.match('/');
          if (root) return root;
          const offlinePage = await caches.match(OFFLINE_URL);
          return offlinePage || Response.error();
        })
    );
    return;
  }

  // Static assets (images, CSS, JS): stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
