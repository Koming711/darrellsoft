/**
 * Local Cache — penyimpanan lokal (IndexedDB) untuk hasil GET smart-fetch.
 *
 * Isi: SALINAN data API (read-only view) yang dikunci PER-USER. Modul ini
 * TIDAK PERNAH menyimpan data pending/antrian tulis — antrian offline ada
 * di database IDB terpisah (darrell-offline-queue, lib/offline-queue.ts)
 * sehingga pembersihan cache di sini 100% aman terhadap data yang belum
 * tersinkron.
 *
 * Struktur:
 * - DB  : darrell-local-cache
 *   - store "entries" (keyPath "k")  → CacheEntry { k, uid, entity, url, data, at }
 *   - store "meta"    (keyPath "uid") → { uid, lastSyncAt }
 *
 * Aturan penting (multi-akun):
 * - Semua entri membawa uid pemiliknya; invalidate/clear selalu difilter uid
 *   → cache akun lain tidak tersentuh, dan logout menghapus hanya miliknya.
 * - Salinan di memori (Map) dibangun saat startup agar pembacaan instan &
 *   getLastSyncAt() bisa sinkron (dipakai banner offline).
 *
 * Kebersihan otomatis:
 * - Entri lebih tua dari MAX_AGE_MS dibuang saat startup (cache GET basi
 *   aman dibuang — sumber kebenaran tetap database).
 * - Jumlah entri per user dibatasi MAX_ENTRIES_PER_USER; yang tertua dibuang.
 */

export interface CacheEntry {
  /** Kunci lengkap: "<uid>|GET|<path+query>" */
  k: string
  /** Pemilik entri (id user) — dasar isolasi antar akun */
  uid: string
  /** Entity data-change (customers, items, invoice, ...) — dasar invalidasi */
  entity: string | null
  /** URL sumber (informasi/debug) */
  url: string
  /** Body JSON hasil GET */
  data: unknown
  /** Waktu simpan (epoch ms) — dasar TTL di smart-fetch */
  at: number
}

/**
 * Statistik penggunaan cache (dipantau via window.__dsCacheStats untuk
 * pengukuran before/after hemat-request).
 *
 * PENTING: bundler (Turbopack/webpack) bisa membuat beberapa instance modul
 * ini (per bundle halaman). Agar penghitungan tetap akurat satu kesatuan,
 * object stats dijaga SINGLETON lewat window (di-share antar instance).
 */
interface CacheStatsShape {
  memoryHits: number
  idbHits: number
  staleFallback: number
  bgRefresh: number
  deduped: number
  network: number
  writes: number
}

const CACHE_STATS_DEFAULT: CacheStatsShape = {
  memoryHits: 0,
  idbHits: 0,
  staleFallback: 0,
  bgRefresh: 0,
  deduped: 0,
  network: 0,
  writes: 0,
}

export const cacheStats: CacheStatsShape = (() => {
  if (typeof window !== 'undefined') {
    const w = window as unknown as { __dsCacheStatsShared?: CacheStatsShape }
    if (!w.__dsCacheStatsShared) {
      w.__dsCacheStatsShared = { ...CACHE_STATS_DEFAULT }
    }
    return w.__dsCacheStatsShared
  }
  return { ...CACHE_STATS_DEFAULT }
})()

const DB_NAME = 'darrell-local-cache'
const DB_VERSION = 1
const ENTRIES = 'entries'
const META = 'meta'

/** Umur maksimum entri di perangkat (7 hari) — dibuang saat startup */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
/** Batas jumlah entri per user — anti membesar tanpa kendali */
const MAX_ENTRIES_PER_USER = 1000

// ---------------------------------------------------------------------------
// Miror memori + kesiapan IDB
// ---------------------------------------------------------------------------

/**
 * Miror memori & watermark invalidasi — SINGLETON via window.
 *
 * RACE ANTAR INSTANCE MODUL (bug "hapus/tambah tidak hilang dr daftar"):
 * bundler (Turbopack) bisa memuat beberapa instance modul ini (chunk vendor
 * vs chunk halaman). Dulu tiap instance punya Map memori sendiri — listener
 * invalidasi (data-change-local) mengosongkan Map + IDB milik instance A,
 * sementara refetch berjalan lewat instance B yang masih menyimpan entri
 * lama di memornya → cacheGet membalikkan data basi TANPA panggilan network
 * → baris yang baru dihapus/buat tetap tampil sampai reload manual.
 *
 * Solusi: satu Map bersama di window (pola sama dgn cacheStats di atas) —
 * invalidasi dari instance mana pun langsung terlihat oleh instance lain.
 */
const memoryEntries = ((): Map<string, CacheEntry> => {
  if (typeof window !== 'undefined') {
    const w = window as unknown as { __dsCacheMemory?: Map<string, CacheEntry> }
    if (!w.__dsCacheMemory) w.__dsCacheMemory = new Map<string, CacheEntry>()
    return w.__dsCacheMemory
  }
  return new Map<string, CacheEntry>()
})()
const memoryLastSync = ((): Map<string, number> => {
  if (typeof window !== 'undefined') {
    const w = window as unknown as { __dsCacheLastSync?: Map<string, number> }
    if (!w.__dsCacheLastSync) w.__dsCacheLastSync = new Map<string, number>()
    return w.__dsCacheLastSync
  }
  return new Map<string, number>()
})()
let idbBroken = false
let writeCounter = 0

/**
 * Watermark invalidasi per "<uid>|<entity>" — waktu invalidasi TERAKHIR.
 *
 * RACE YANG DICEGAH: notifyDataChange → (invalidasi async mulai) → view
 * segera load() → cacheGet() masih membaca entri LAMA dari memori/IDB
 * karena penghapusan fisik baru jalan setelah await (microtask/IO IDB).
 * Akibatnya daftar yang di-refresh SESAAT setelah tambah/edit/hapus masih
 * menampilkan data basi.
 *
 * Solusi: invalidateEntity mencatat watermark SINKRON (sebelum await apa
 * pun). cacheGet membandingkan entry.at dgn watermark — entri yang lebih
 * tua dianggap tidak ada meski fisiknya belum sempat dihapus.
 */
const invalidationWatermark = ((): Map<string, number> => {
  if (typeof window !== 'undefined') {
    const w = window as unknown as { __dsCacheWatermark?: Map<string, number> }
    if (!w.__dsCacheWatermark) w.__dsCacheWatermark = new Map<string, number>()
    return w.__dsCacheWatermark
  }
  return new Map<string, number>()
})()

/** Entri stale bila dibuat SEBELUM invalidasi terakhir entity-nya. */
function isInvalidated(e: CacheEntry): boolean {
  const wm = invalidationWatermark.get(`${e.uid}|${e.entity ?? ''}`)
  return wm !== undefined && e.at <= wm
}

/** Selesai saat meta & entri dari sesi sebelumnya sudah dimuat (atau gagal) */
let readyPromise: Promise<void> | null = null

function idbAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof indexedDB !== 'undefined' &&
    !idbBroken
  )
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!idbAvailable()) {
      reject(new Error('IndexedDB tidak tersedia'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(ENTRIES)) {
        const store = db.createObjectStore(ENTRIES, { keyPath: 'k' })
        store.createIndex('uid', 'uid', { unique: false })
        store.createIndex('at', 'at', { unique: false })
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: 'uid' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IDB open gagal'))
  })
}

/** Jalankan fn dalam satu transaksi pada 1..2 store; null = IDB gagal */
async function withStores<T>(
  storeNames: string[],
  mode: IDBTransactionMode,
  fn: (get: (name: string) => IDBObjectStore) => IDBRequest<T> | void
): Promise<T | null> {
  if (!idbAvailable()) return null
  let db: IDBDatabase | null = null
  try {
    db = await openDb()
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db!.transaction(storeNames, mode)
      const request = fn((name: string) => tx.objectStore(name))
      let result: T | null = null
      if (request) {
        request.onsuccess = () => {
          result = request.result
        }
        request.onerror = () => reject(request.error)
      }
      tx.oncomplete = () => {
        db!.close()
        resolve(result)
      }
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } catch {
    idbBroken = true
    if (db) {
      try {
        db.close()
      } catch { /* sudah tertutup */ }
    }
    return null
  }
}

/**
 * Muat isi IDB ke memori (sekali per sesi) + bersihkan entri kadaluarsa.
 * Gagal diabaikan senyap — cache tetap berfungsi dari memori.
 */
function initOnce(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (!readyPromise) {
    readyPromise = (async () => {
      if (!idbAvailable()) return
      const cutoff = Date.now() - MAX_AGE_MS

      // Meta lastSync → memori (untuk getLastSyncAt sinkron)
      const metas = await withStores<{ uid: string; lastSyncAt: number }[]>(
        [META], 'readonly',
        get => get(META).getAll() as IDBRequest<{ uid: string; lastSyncAt: number }[]>
      )
      if (metas) {
        ;(metas || []).forEach(m => {
          if (m && m.uid) memoryLastSync.set(m.uid, Number(m.lastSyncAt) || 0)
        })
      }

      // Entri → memori; buang yang terlalu tua dari IDB
      const rows = await withStores<CacheEntry[]>(
        [ENTRIES], 'readonly',
        get => get(ENTRIES).getAll() as IDBRequest<CacheEntry[]>
      )
      if (rows) {
        const staleKeys: string[] = []
        ;(rows || []).forEach(e => {
          if (e && e.k && typeof e.at === 'number') {
            if (e.at < cutoff) {
              staleKeys.push(e.k)
            } else {
              memoryEntries.set(e.k, e)
            }
          }
        })
        if (staleKeys.length > 0) {
          await withStores(
            [ENTRIES], 'readwrite',
            get => {
              const s = get(ENTRIES)
              staleKeys.forEach(k => s.delete(k))
            }
          )
        }
      }
    })().catch(() => {
      idbBroken = true
    })
  }
  return readyPromise
}

// Mulai muat segera di browser (fire-and-forget)
if (typeof window !== 'undefined') void initOnce()

// ---------------------------------------------------------------------------
// Entri cache (GET copies)
// ---------------------------------------------------------------------------

/** Ambil salinan cache. Memori dulu → IDB. Null bila tidak ada. */
export async function cacheGet(key: string): Promise<CacheEntry | null> {
  const mem = memoryEntries.get(key)
  if (mem) {
    // Entri se-invalidasi terakhir dianggap tidak ada (lihat watermark).
    if (isInvalidated(mem)) {
      memoryEntries.delete(key)
    } else {
      return mem
    }
  }
  await initOnce()
  const mem2 = memoryEntries.get(key)
  if (mem2) {
    if (isInvalidated(mem2)) {
      memoryEntries.delete(key)
    } else {
      return mem2
    }
  }
  const row = await withStores<CacheEntry>(
    [ENTRIES], 'readonly',
    get => get(ENTRIES).get(key) as IDBRequest<CacheEntry>
  )
  if (row && row.k) {
    // Salinan IDB bisa saja basi (belum sempat dihapus invalidasi) —
    // buang senyap + jangan tulis balik ke memori.
    if (isInvalidated(row)) {
      memoryEntries.delete(key)
      void withStores(
        [ENTRIES], 'readwrite',
        get => get(ENTRIES).delete(key)
      )
      return null
    }
    cacheStats.idbHits += 1
    memoryEntries.set(row.k, row)
    return row
  }
  return null
}

/** Simpan/perbarui salinan (memori + IDB). Gagal IDB → tetap di memori. */
export async function cacheSet(entry: CacheEntry): Promise<void> {
  if (!entry || !entry.k || !entry.uid) return
  memoryEntries.set(entry.k, entry)
  cacheStats.writes += 1
  await withStores(
    [ENTRIES], 'readwrite',
    get => get(ENTRIES).put(entry)
  )
  // Anti bengkak: tiap 64 tulisan, batasi jumlah entri milik user ini
  writeCounter += 1
  if (writeCounter % 64 === 0) void enforceCap(entry.uid)
}

/** Hapus satu entri berdasarkan kunci lengkap */
export async function cacheDelete(key: string): Promise<void> {
  memoryEntries.delete(key)
  await withStores(
    [ENTRIES], 'readwrite',
    get => get(ENTRIES).delete(key)
  )
}

/**
 * Hapus semua entri milik uid.
 * - entity '*' → seluruh entity milik uid
 * - selain itu → hanya entity tertentu
 * Mengembalikan jumlah entri yang dihapus.
 */
export async function invalidateEntity(uid: string, entity: string): Promise<number> {
  if (!uid) return 0
  // Watermark dicatat SINKRON sebelum await apa pun — penanda paling awal
  // agar cacheGet yang berjalan berbarengan langsung menganggap entri lama
  // tidak ada (lihat komentar invalidationWatermark di atas).
  invalidationWatermark.set(`${uid}|${entity}`, Date.now())
  await initOnce()
  const targets: string[] = []
  memoryEntries.forEach((e, k) => {
    if (e.uid === uid && (entity === '*' || e.entity === entity)) targets.push(k)
  })
  targets.forEach(k => memoryEntries.delete(k))

  // Buang juga yang hanya ada di IDB (sesi/tab lain), lalu yang di memori
  const rows = await withStores<CacheEntry[]>(
    [ENTRIES], 'readonly',
    get => get(ENTRIES).getAll() as IDBRequest<CacheEntry[]>
  )
  const idbOnly: string[] = []
  ;(rows || []).forEach(e => {
    if (
      e && e.k &&
      e.uid === uid &&
      (entity === '*' || e.entity === entity) &&
      !targets.includes(e.k)
    ) {
      idbOnly.push(e.k)
    }
  })
  const all = [...targets, ...idbOnly]
  if (all.length > 0) {
    await withStores(
      [ENTRIES], 'readwrite',
      get => {
        const s = get(ENTRIES)
        all.forEach(k => s.delete(k))
      }
    )
  }
  return targets.length + idbOnly.length
}

/**
 * Hapus SELURUH cache milik satu user (logout / ganti akun).
 * Mengembalikan jumlah entri yang dihapus. Data pending di
 * darrell-offline-queue TIDAK disentuh.
 */
export async function clearUserCache(uid: string): Promise<number> {
  if (!uid) return 0
  return invalidateEntity(uid, '*')
}

// ---------------------------------------------------------------------------
// Waktu sinkron terakhir (banner OFFLINE)
// ---------------------------------------------------------------------------

/**
 * Catat waktu sukses mengambil data dari server (epoch ms) untuk uid.
 * Sengaja sinkron di memori + tulis IDB fire-and-forget — tidak boleh
 * memperlambat jalur fetch.
 */
export function touchLastSync(uid: string): void {
  if (!uid || typeof window === 'undefined') return
  const now = Date.now()
  memoryLastSync.set(uid, now)
  void withStores(
    [META], 'readwrite',
    get => get(META).put({ uid, lastSyncAt: now })
  )
}

/**
 * Ambil waktu sinkron terakhir uid (epoch ms; 0 bila belum pernah).
 * SINKRON — dipanggil ConnectivityKeeper saat offline untuk banner.
 * Nilai datang dari miror memori yang dimuat saat startup.
 */
export function getLastSyncAt(uid: string): number {
  if (!uid) return 0
  return memoryLastSync.get(uid) ?? 0
}

// ---------------------------------------------------------------------------
// Batas jumlah entri per user
// ---------------------------------------------------------------------------

async function enforceCap(uid: string): Promise<void> {
  try {
    const rows = await withStores<CacheEntry[]>(
      [ENTRIES], 'readonly',
      get => get(ENTRIES).getAll() as IDBRequest<CacheEntry[]>
    )
    const mine = (rows || []).filter(e => e && e.uid === uid)
    if (mine.length <= MAX_ENTRIES_PER_USER) return
    mine.sort((a, b) => a.at - b.at)
    const excess = mine.slice(0, mine.length - MAX_ENTRIES_PER_USER)
    const keys = excess.map(e => e.k)
    keys.forEach(k => memoryEntries.delete(k))
    await withStores(
      [ENTRIES], 'readwrite',
      get => {
        const s = get(ENTRIES)
        keys.forEach(k => s.delete(k))
      }
    )
  } catch { /* pembersihan gagal — biarkan, dibuang saat startup berikutnya */ }
}
