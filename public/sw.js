const CACHE_NAME = 'darrell-soft-v103';
// Cache data API TIDAK ikut versi deploy → data yang pernah dibuka
// tetap tersedia offline meskipun aplikasi baru di-deploy.
const API_CACHE_NAME = 'darrell-api-runtime';
const MAX_API_CACHE_ENTRIES = 80;
const OFFLINE_URL = '/offline.html';
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
 * - Online  → selalu ambil data terbaru dari server (data tetap fresh,
 *   tidak ada kuota tambahan dibanding perilaku lama), lalu simpan salinan.
 * - Offline → sajikan salinan terakhir yang pernah dibuka (cached copy),
 *   sehingga aplikasi tetap bisa dipakai tanpa internet.
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

  // For navigation requests (HTML pages), network first → cache → offline page
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
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const offlinePage = await caches.match(OFFLINE_URL);
          return offlinePage || Response.error();
        })
    );
    return;
  }

  // For static assets only (images, CSS, JS), use stale-while-revalidate
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
