/**
 * Offline Write Queue (outbox) — IndexedDB backed.
 *
 * Saat internet offline (atau request gagal karena jaringan), request tulis
 * (POST/PUT/PATCH/DELETE) ke API data DISIMPAN ke antrian di perangkat.
 * Begitu internet kembali online, antrian di-REPLAY berurutan (FIFO) ke
 * database — data tidak hilang, user tidak perlu input ulang.
 *
 * - Hanya request JSON ke /api/ yang masuk antrian (auth/backup/upload tidak).
 * - Request yang sukses direplay → event 'data-change' di-dispatch supaya
 *   halaman yang terbuka otomatis me-refresh datanya.
 * - 4xx (validasi dsb, kecuali 401/403/429) → dibuang (tidak akan pernah sukses).
 * - 5xx / jaringan masih putus → replay berhenti, dicoba lagi nanti.
 */

import type { DataEntity } from './data-sync'

export interface QueuedRequest {
  id?: number
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
  entity: DataEntity | null
  createdAt: number
}

const DB_NAME = 'darrell-offline-queue'
const DB_VERSION = 1
const STORE = 'requests'

// Route yang TIDAK boleh masuk antrian (auth/session/backup/upload/file besar)
const NEVER_QUEUE_PREFIXES = [
  '/api/auth',
  '/api/register',
  '/api/check-username',
  '/api/seed-admin',
  '/api/notifications',
  '/api/database',
  '/api/backup',
  '/api/import-master-data',
  '/api/midtrans',
  '/api/upload-logo',
  '/api/app-icon',
  '/api/export',
  '/api/analyze-image',
  '/api/whatsapp',
  '/api/debug-db',
  '/api/clear-sample',
]

/** URL → entity data-change (untuk refresh otomatis halaman yang terbuka) */
const ENTITY_MAP: Array<[string, DataEntity]> = [
  ['/api/customers', 'customers'],
  ['/api/customer-items', 'customers'],
  ['/api/customer-barang', 'customers'],
  ['/api/barang-customer', 'customers'],
  ['/api/items', 'items'],
  ['/api/barang', 'items'],
  ['/api/papers', 'papers'],
  ['/api/master-kertas', 'papers'],
  ['/api/printing-costs', 'printing-costs'],
  ['/api/finishings', 'finishings'],
  ['/api/invoices', 'invoice'],
  ['/api/surat-jalan', 'surat-jalan'],
  ['/api/purchase-order', 'invoice'],
  ['/api/biaya', 'biaya'],
  ['/api/expenses', 'biaya'],
  ['/api/settings', 'settings'],
  ['/api/riwayat-cetakan', 'riwayat-cetakan'],
  ['/api/riwayat-potong-kertas', 'riwayat-potong-kertas'],
  ['/api/cutting-records', 'riwayat-potong-kertas'],
  ['/api/pengguna', 'pengguna'],
  ['/api/calon-pembeli', 'calon-pembeli'],
  ['/api/pembeli', 'pembeli'],
]

export function entityForUrl(url: string): DataEntity | null {
  try {
    const path = new URL(url, window.location.origin).pathname
    const found = ENTITY_MAP.find(([prefix]) => path.startsWith(prefix))
    return found ? found[1] : null
  } catch {
    return null
  }
}

// fetch ASLI (sebelum ConnectivityKeeper mem-patch window.fetch) — dipakai
// replay agar request replay TIDAK ikut tertangkap patch antrian (mencegah
// duplikasi antrian saat replay gagal jaringan).
const rawFetch: typeof fetch =
  typeof window !== 'undefined'
    ? window.fetch.bind(window)
    : ((...args: Parameters<typeof fetch>) => fetch(...args)) as typeof fetch

/**
 * Header aman untuk disimpan di antrian (buang header terlarang browser)
 */
function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const forbidden = ['content-length', 'host', 'connection', 'origin', 'referer', 'user-agent', 'cookie']
  const out: Record<string, string> = {}
  Object.entries(headers).forEach(([k, v]) => {
    if (!forbidden.includes(k.toLowerCase())) out[k] = v
  })
  return out
}

/**
 * Simpan request tulis ke antrian offline lalu kembalikan Response sukses
 * sintetis — caller (UI) melihat "tersimpan" walau belum sampai database.
 * Dipakai oleh auth-fetch (offline short-circuit) dan patch window.fetch.
 */
export async function queueAndSynthesize(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: unknown
): Promise<Response> {
  try {
    let serialized: string | null = null
    if (typeof body === 'string') serialized = body
    else if (body != null) serialized = JSON.stringify(body)
    await enqueueWrite({
      url,
      method,
      headers: sanitizeHeaders(headers),
      body: serialized,
      entity: entityForUrl(url),
      createdAt: Date.now(),
    })
    registerBackgroundSync()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('offline-queued'))
    }
  } catch (e) {
    console.warn('[offline-queue] gagal menyimpan ke antrian offline:', e)
  }
  // Respons sukses sintetis — caller (UI) melihat "tersimpan".
  // Body menyatakan offlineQueued agar kode yang memerlukan id dari server
  // bisa mengabaikannya (id muncul setelah sinkron).
  return new Response(JSON.stringify({ ok: true, offlineQueued: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Apakah request tulis ini layak masuk antrian offline?
 * Hanya request same-origin ke /api/ data (bukan auth/backup/upload),
 * dengan body string/objek JSON (FormData/file tidak didukung v1).
 */
export function isQueueableWrite(url: string, method: string, body: unknown): boolean {
  try {
    if (typeof window === 'undefined') return false
    const m = method.toUpperCase()
    if (m !== 'POST' && m !== 'PUT' && m !== 'PATCH' && m !== 'DELETE') return false
    if (body instanceof FormData || body instanceof Blob || body instanceof ArrayBuffer) return false
    const path = new URL(url, window.location.origin).pathname
    if (!path.startsWith('/api/')) return false
    if (NEVER_QUEUE_PREFIXES.some(p => path.startsWith(p))) return false
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// IndexedDB helpers (dengan fallback memori agar UI tetap jalan di env tanpa IDB)
// ---------------------------------------------------------------------------

let memoryQueue: QueuedRequest[] = []
let memoryId = 1
let idbBroken = false

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (idbBroken || typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB tidak tersedia'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
        store.createIndex('createdAt', 'createdAt')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IDB open gagal'))
  })
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
  try {
    const db = await openDb()
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const store = tx.objectStore(STORE)
      const request = fn(store)
      let result: T | null = null
      if (request) {
        request.onsuccess = () => {
          result = request.result
        }
        request.onerror = () => reject(request.error)
      }
      tx.oncomplete = () => {
        db.close()
        resolve(result)
      }
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } catch {
    idbBroken = true
    return null
  }
}

export async function enqueueWrite(entry: Omit<QueuedRequest, 'id'>): Promise<void> {
  const stored = await withStore('readwrite', store => {
    store.add(entry as QueuedRequest)
  })
  if (stored === null) {
    // fallback memori
    memoryQueue.push({ ...entry, id: memoryId++ })
  }
  await emitCount()
}

async function getAllEntries(): Promise<QueuedRequest[]> {
  const rows = await withStore<QueuedRequest[]>('readonly', store => store.getAll() as IDBRequest<QueuedRequest[]>)
  if (rows === null) return [...memoryQueue]
  return (rows || []).sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
}

async function deleteEntry(id: number): Promise<void> {
  const done = await withStore('readwrite', store => {
    store.delete(id)
  })
  if (done === null) {
    memoryQueue = memoryQueue.filter(e => e.id !== id)
  }
}

export async function getQueueCount(): Promise<number> {
  const all = await getAllEntries()
  return all.length
}

// ---------------------------------------------------------------------------
// Listener perubahan antrian (untuk UI badge/banner)
// ---------------------------------------------------------------------------

const countListeners = new Set<(n: number) => void>()

export function onQueueChange(cb: (n: number) => void): () => void {
  countListeners.add(cb)
  return () => countListeners.delete(cb)
}

async function emitCount(): Promise<void> {
  const n = await getQueueCount()
  countListeners.forEach(cb => {
    try {
      cb(n)
    } catch {}
  })
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

let syncing = false
let lastReplayAt = 0
const REPLAY_THROTTLE_MS = 5_000

export function isSyncing(): boolean {
  return syncing
}

/**
 * Kirim seluruh antrian ke database (berurutan, FIFO).
 * Aman dipanggil berkali-kali — kalau sedang sync, panggilan baru diabaikan.
 */
export async function replayQueue(force = false): Promise<{ synced: number; failed: number; remaining: number }> {
  if (syncing) {
    return { synced: 0, failed: 0, remaining: await getQueueCount() }
  }
  if (!force && typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { synced: 0, failed: 0, remaining: await getQueueCount() }
  }
  const now = Date.now()
  if (!force && now - lastReplayAt < REPLAY_THROTTLE_MS) {
    return { synced: 0, failed: 0, remaining: await getQueueCount() }
  }
  lastReplayAt = now
  syncing = true

  let synced = 0
  let failed = 0

  try {
    for (;;) {
      const all = await getAllEntries()
      if (all.length === 0) break
      const entry = all[0]

      let ok = false
      let permanentFail = false
      try {
        // rawFetch (bukan window.fetch yang sudah di-patch) — mencegah
        // request replay ikut diantrikan ulang oleh patch global.
        const res = await rawFetch(entry.url, {
          method: entry.method,
          headers: entry.headers,
          body: entry.body,
          cache: 'no-store',
        })
        if (res.ok) {
          ok = true
        } else if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 403 && res.status !== 429) {
          // Data tidak valid / konflik — tidak akan pernah sukses → buang
          permanentFail = true
        }
      } catch {
        // Jaringan masih putus → berhenti, sisanya dicoba lagi nanti
        break
      }

      if (ok || permanentFail) {
        if (entry.id != null) await deleteEntry(entry.id)
        if (ok) {
          synced++
          if (entry.entity && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('data-change', { detail: { entity: entry.entity, source: 'sync' } }))
          }
        } else {
          failed++
          console.warn('[offline-queue] buang request gagal permanen:', entry.method, entry.url)
        }
        continue
      }
      // 5xx/401/403/429 → berhenti (dicoba lagi pada trigger berikutnya)
      break
    }
  } finally {
    syncing = false
    await emitCount()
  }

  return { synced, failed, remaining: await getQueueCount() }
}

/** Background Sync tidak ada di lib TS standar — tipe minimal lokal */
interface SyncManagerLike {
  register(tag: string): Promise<void>
}

/**
 * Daftarkan Background Sync (kalau browser mendukung) — browser akan
 * membangunkan SW saat koneksi kembali meski aplikasi sedang ditutup.
 */
export function registerBackgroundSync(): void {
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready
        .then(reg => (reg as unknown as { sync?: SyncManagerLike }).sync?.register('darrell-offline-sync'))
        .catch(() => {})
    }
  } catch {}
}
