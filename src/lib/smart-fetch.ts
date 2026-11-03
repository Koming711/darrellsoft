/**
 * Smart Fetch — lapisan GET hemat-request untuk API internal.
 *
 * Urutan solusi (cache-first + stale-while-revalidate):
 *   1. Memori (sesi ini)           → instan, 0 request
 *   2. IndexedDB (antar sesi)      → instan, 0 request, bila TTL masih berlaku
 *   3. Cache basi + online         → tampilkan cache + refresh diam-diam (SWR)
 *   4. Network                     → simpan salinan ke 1 & 2
 *   5. Network gagal + ada cache   → sajikan cache basi (mode offline)
 *
 * Aturan:
 * - Hanya GET same-origin /api/ yang di-cache; tulis TIDAK pernah lewat sini.
 * - Entri dikunci per-user (uid) → tidak ada kebocoran antar akun/grup.
 * - Endpoint sensitif (auth, notifications, doc-number, settings, backup,
 *   payment, dsb — lihat NEVER_CACHE_PREFIXES) TIDAK pernah di-cache.
 * - Invalidasi otomatis: event 'data-change' (lintas tab / pasca-sync /
 *   reconnect) & 'data-change-local' (mutasi tab ini) menghapus cache entity
 *   terkait → request berikutnya pasti ke server.
 * - Supabase tidak dipakai proyek ini (stack: Next API + SQLite/Prisma) —
 *   prinsip hemat request tetap sama: server dihubungi hanya saat perlu.
 */

import { cacheGet, cacheSet, cacheDelete, invalidateEntity, touchLastSync, cacheStats, type CacheEntry } from './local-cache'

// ---------------------------------------------------------------------------
// Konfigurasi
// ---------------------------------------------------------------------------

/** Endpoint yang TIDAK BOLEH di-cache (keputusan bisnis/keamanan) */
const NEVER_CACHE_PREFIXES = [
  '/api/auth',
  '/api/register',
  '/api/check-username',
  '/api/check-phone',
  '/api/seed-admin',
  '/api/notifications',
  '/api/health',
  '/api/doc-number', // nomor dokumen harus selalu segar (counter)
  '/api/midtrans',
  '/api/payment-manual', // uang masuk → selalu validasi server
  '/api/database',
  '/api/backup',
  '/api/import-master-data',
  '/api/export',
  '/api/upload-logo',
  '/api/app-icon',
  '/api/analyze-image',
  '/api/whatsapp',
  '/api/debug-db',
  '/api/clear-sample',
  '/api/potong-cetakan-sync', // state sinkron antar modul — selalu segar
  '/api/settings', // form pengaturan harus segar
  '/api/public-settings',
  '/api/grup', // RBAC/hak akses — keputusan keamanan harus segar
  '/api/panel-admin',
  '/api/plans',
]

/** TTL per entity (ms). Master data jarang berubah → panjang; transaksi singkat. */
const ENTITY_TTL: Record<string, number> = {
  // Master data — 10 menit
  customers: 10 * 60_000,
  items: 10 * 60_000,
  papers: 10 * 60_000,
  'master-kertas': 10 * 60_000,
  'printing-costs': 10 * 60_000,
  finishings: 10 * 60_000,
  kategori: 10 * 60_000,
  'toko-pemasok': 10 * 60_000,
  pembeli: 10 * 60_000,
  pengguna: 5 * 60_000,
  // Data transaksi — 45 detik (UI instan, tetap sering segar)
  invoice: 45_000,
  'surat-jalan': 45_000,
  biaya: 45_000,
  'riwayat-cetakan': 45_000,
  'riwayat-potong-kertas': 45_000,
  // Lainnya
  beranda: 30_000,
  'stock-bahan': 30_000,
  'harga-customer': 60_000,
  laporan: 5 * 60_000, // hasil laporan di-cache per parameter periode/filter
}

const DEFAULT_TTL = 60_000

export interface SmartFetchOptions {
  /** Paksa network, lewati pembacaan cache (tetap menyimpan salinan) */
  force?: boolean
  /** Nonaktifkan cache untuk panggilan ini */
  noCache?: boolean
  /** Entity eksplisit (bila inferensi URL kurang tepat) */
  entity?: string | null
  /** Header pemanggil (digabung ke network fetch; tak relevan saat cache hit) */
  headers?: Record<string, string>
  /** TTL override (ms) — bila tidak diisi, dipakai TTL entity */
  ttl?: number
}

// ---------------------------------------------------------------------------
// Identitas & kunci
// ---------------------------------------------------------------------------

interface AuthBlob { id?: string; role?: string }

function readAuth(): AuthBlob | null {
  try {
    const raw = localStorage.getItem('auth')
    return raw ? (JSON.parse(raw) as AuthBlob) : null
  } catch {
    return null
  }
}

/** uid user login — kunci isolasi cache antar akun */
export function currentUid(): string {
  return readAuth()?.id || ''
}

function authHeaders(): Record<string, string> {
  const a = readAuth()
  const h: Record<string, string> = {}
  if (a?.id) h['x-user-id'] = a.id
  if (a?.role) h['x-user-role'] = a.role
  return h
}

// ---------------------------------------------------------------------------
// Entity & URL helpers
// ---------------------------------------------------------------------------

/**
 * Peta URL → entity. Duplikat ringan dari ENTITY_MAP offline-queue (sengaja
 * tidak di-import agar tidak ada siklus modul; offline-queue adalah modul
 * tulis, modul ini modul baca).
 */
const ENTITY_MAP: Array<[string, string]> = [
  ['/api/customers', 'customers'],
  ['/api/customer-items', 'customers'],
  ['/api/customer-barang', 'customers'],
  ['/api/barang-customer', 'customers'],
  ['/api/items', 'items'],
  ['/api/barang', 'items'],
  ['/api/papers', 'papers'],
  ['/api/master-kertas', 'master-kertas'],
  ['/api/printing-costs', 'printing-costs'],
  ['/api/finishings', 'finishings'],
  ['/api/invoices', 'invoice'],
  ['/api/surat-jalan', 'surat-jalan'],
  ['/api/purchase-order', 'invoice'],
  ['/api/biaya', 'biaya'],
  ['/api/expenses', 'biaya'],
  ['/api/riwayat-cetakan', 'riwayat-cetakan'],
  ['/api/riwayat-potong-kertas', 'riwayat-potong-kertas'],
  ['/api/cutting-records', 'riwayat-potong-kertas'],
  ['/api/pengguna', 'pengguna'],
  ['/api/calon-pembeli', 'pembeli'],
  ['/api/pembeli', 'pembeli'],
  ['/api/kategori', 'kategori'],
  ['/api/toko-pemasok', 'toko-pemasok'],
  ['/api/stock-bahan', 'stock-bahan'],
  ['/api/harga-customer', 'harga-customer'],
  ['/api/beranda', 'beranda'],
  ['/api/laporan', 'laporan'],
  ['/api/rekap-penjualan', 'invoice'],
]

export function entityForUrl(url: string): string | null {
  try {
    const path = new URL(url, window.location.origin).pathname
    const found = ENTITY_MAP.find(([prefix]) => path.startsWith(prefix))
    return found ? found[1] : null
  } catch {
    return null
  }
}

export function ttlForEntity(entity: string | null): number {
  if (!entity) return DEFAULT_TTL
  return ENTITY_TTL[entity] ?? DEFAULT_TTL
}

function isCacheable(url: string): boolean {
  try {
    const u = new URL(url, window.location.origin)
    if (u.origin !== window.location.origin) return false
    if (!u.pathname.startsWith('/api/')) return false
    if (u.searchParams.has('nocache')) return false
    if (NEVER_CACHE_PREFIXES.some(p => u.pathname.startsWith(p))) return false
    return true
  } catch {
    return false
  }
}

function cacheKey(uid: string, url: string): string {
  let normalized = url
  try {
    const u = new URL(url, window.location.origin)
    normalized = u.pathname + u.search
  } catch { /* pakai apa adanya */ }
  return `${uid}|GET|${normalized}`
}

// ---------------------------------------------------------------------------
// Statistik window.__dsCacheStats (untuk pengukuran before/after)
// ---------------------------------------------------------------------------

function bump<K extends keyof typeof cacheStats>(k: K): void {
  cacheStats[k] = (cacheStats[k] as number) + 1
  try {
    ;(window as unknown as { __dsCacheStats?: typeof cacheStats }).__dsCacheStats = cacheStats
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Dedupe request berjalan (cegah fetch duplikat dari banyak komponen)
// ---------------------------------------------------------------------------

const inFlight = new Map<string, Promise<Response>>()
const bgRefresh = new Set<string>()

function synthesizeResponse(entry: CacheEntry, stale: boolean): Response {
  return new Response(JSON.stringify(entry.data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'x-cache': stale ? 'stale-idb' : 'hit',
      'x-cache-age': String(Math.max(0, Date.now() - entry.at)),
    },
  })
}

// ---------------------------------------------------------------------------
// Inti
// ---------------------------------------------------------------------------

/**
 * GET cerdas: cache → SWR → network → fallback cache offline.
 * Kontrak sama dengan authFetch untuk GET: mengembalikan Response.
 */
export async function smartGet(url: string, opts: SmartFetchOptions = {}): Promise<Response> {
  if (typeof window === 'undefined') return fetch(url)

  const uid = currentUid()
  const cacheable = !!uid && !opts.noCache && isCacheable(url)
  const entity = opts.entity !== undefined ? opts.entity : entityForUrl(url)
  const key = cacheable ? cacheKey(uid, url) : ''

  // ---- 1 & 2: cache segar → selesai tanpa network ----
  if (cacheable && !opts.force && key) {
    const entry = await cacheGet(key)
    if (entry) {
      const age = Date.now() - entry.at
      const ttl = opts.ttl ?? ttlForEntity(entity)
      if (age < ttl) {
        bump('memoryHits')
        return synthesizeResponse(entry, false)
      }
      // ---- 3: basi → sajikan + refresh diam-diam bila online ----
      if (navigator.onLine !== false && !bgRefresh.has(key)) {
        bgRefresh.add(key)
        bump('bgRefresh')
        void fetchAndStore(url, key, uid, entity)
          .catch(() => {})
          .finally(() => bgRefresh.delete(key))
      }
      bump('staleFallback')
      return synthesizeResponse(entry, true)
    }
  }

  // ---- 4: network (dedupe) ----
  if (cacheable && key) {
    const running = inFlight.get(key)
    if (running) {
      bump('deduped')
      return running
    }
    const p = fetchAndStore(url, key, uid, entity, opts).finally(() => inFlight.delete(key))
    inFlight.set(key, p)
    return p
  }

  // Tidak cacheable → lempar network biasa dengan header pemanggil + auth
  return fetch(url, {
    headers: { ...authHeaders(), ...(opts.headers || {}) },
    cache: 'no-store',
  })
}

/** Network + simpan salinan. Dipakai smartGet & background refresh. */
async function fetchAndStore(
  url: string,
  key: string,
  uid: string,
  entity: string | null,
  opts: SmartFetchOptions = {}
): Promise<Response> {
  try {
    const res = await fetch(url, {
      headers: { ...authHeaders(), ...(opts.headers || {}) },
      cache: 'no-store',
    })
    if (res.ok) {
      touchLastSync(uid)
      bump('network')
      const ct = res.headers.get('content-type') || ''
      if (ct.includes('application/json') && entity) {
        try {
          const data = await res.clone().json()
          await cacheSet({ k: key, uid, entity, url, data, at: Date.now() })
        } catch { /* body bukan JSON valid — lewati penyimpanan */ }
      }
    }
    return res
  } catch (err) {
    // ---- 5: network gagal (offline) → fallback cache basi bila ada ----
    if (key) {
      const entry = await cacheGet(key)
      if (entry) {
        bump('staleFallback')
        return synthesizeResponse(entry, true)
      }
    }
    throw err
  }
}

/**
 * Varian JSON (kontrak seperti apiFetch): parse + lempar Error berisi
 * pesan server bila !ok.
 */
export async function smartGetJSON<T>(url: string, opts: SmartFetchOptions = {}): Promise<T> {
  const res = await smartGet(url, opts)
  let data: unknown = {}
  try {
    data = await res.json()
  } catch {
    data = {}
  }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error || 'Terjadi kesalahan pada server'
    throw new Error(msg)
  }
  return data as T
}

// ---------------------------------------------------------------------------
// Invalidasi otomatis via event data-change
// ---------------------------------------------------------------------------

let listenersInstalled = false

/**
 * Install listener invalidasi. Dipanggil otomatis saat modul dimuat (client).
 * - 'data-change'        : lintas tab (BroadcastChannel), pasca replay antrian
 *                          offline, dan reconnect (ConnectivityKeeper)
 * - 'data-change-local'  : mutasi di tab ini (dikirim notifyDataChange)
 */
export function installSmartCacheListeners(): void {
  if (typeof window === 'undefined' || listenersInstalled) return
  listenersInstalled = true
  const handler = (event: Event) => {
    try {
      const { entity } = ((event as CustomEvent).detail || {}) as { entity?: string }
      const uid = currentUid()
      if (!uid) return
      if (entity) void invalidateEntity(uid, entity)
      else void invalidateEntity(uid, '*')
    } catch { /* jangan pernah ganggu UI */ }
  }
  window.addEventListener('data-change', handler)
  window.addEventListener('data-change-local', handler)
}

if (typeof window !== 'undefined') installSmartCacheListeners()

// ---------------------------------------------------------------------------
// Utilitas hapus cache (logout / ganti akun)
// ---------------------------------------------------------------------------

export async function clearCurrentUserCache(): Promise<number> {
  const uid = currentUid()
  if (!uid) return 0
  const { clearUserCache } = await import('./local-cache')
  return clearUserCache(uid)
}

/** Hapus satu entity dari cache user aktif (dipakai modul lain bila perlu). */
export async function evictEntity(entity: string): Promise<void> {
  const uid = currentUid()
  if (!uid) return
  await invalidateEntity(uid, entity)
}

export { cacheDelete }
