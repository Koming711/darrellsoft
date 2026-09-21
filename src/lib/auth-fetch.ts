/**
 * Auth-aware fetch wrapper.
 * Automatically adds X-User-Id and X-User-Role headers from localStorage
 * so the server can authenticate the user even when cookies aren't sent
 * (e.g., through cross-origin proxies).
 *
 * GET requests use cache: 'no-store' to prevent stale data from browser cache.
 *
 * OFFLINE MODE: request tulis (POST/PUT/PATCH/DELETE) ke API data saat
 * internet putus TIDAK dibuang — masuk antrian offline (IndexedDB,
 * lib/offline-queue.ts) dan otomatis direplay ke database begitu online.
 * Caller menerima Response sukses sintetis (offlineQueued: true) sehingga
 * UI tetap mengalir. Patch global window.fetch (ConnectivityKeeper) juga
 * mengantri tulisan dari fetch() mentah — tidak ada duplikasi karena
 * keduanya eksklusif per panggilan.
 */

import { isQueueableWrite, queueAndSynthesize } from './offline-queue'

export function getAuthHeaders(): Record<string, string> {
  try {
    const authData = localStorage.getItem('auth')
    if (authData) {
      const parsed = JSON.parse(authData)
      const headers: Record<string, string> = {}
      if (parsed.id) headers['x-user-id'] = parsed.id
      if (parsed.role) headers['x-user-role'] = parsed.role
      return headers
    }
  } catch {}
  return {}
}

/**
 * Wrapper around native fetch that adds auth headers.
 * GET requests use cache: 'no-store' to always get fresh data from server.
 * Write requests saat offline otomatis masuk antrian sinkronisasi.
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const authHeaders = getAuthHeaders()
  const mergedHeaders = {
    ...authHeaders,
    ...(options.headers instanceof Headers
      ? Object.fromEntries(options.headers.entries())
      : typeof options.headers === 'object'
        ? options.headers
        : {}
    ),
  }

  // For GET requests, force no-cache to prevent stale data
  const isGet = !options.method || options.method === 'GET'
  const cacheOption: RequestCache = isGet ? 'no-store' : 'default'

  const method = (options.method ?? 'GET').toUpperCase()
  const canQueue = isQueueableWrite(url, method, options.body)

  // Sudah offline sejak awal → langsung antrikan (tanpa menunggu timeout)
  if (canQueue && typeof navigator !== 'undefined' && navigator.onLine === false) {
    return queueAndSynthesize(url, method, mergedHeaders as Record<string, string>, options.body)
  }

  try {
    return await fetch(url, {
      ...options,
      headers: mergedHeaders,
      cache: cacheOption,
    })
  } catch (err) {
    // Jaringan gagal saat mengirim tulisan → simpan ke antrian, bukan error.
    if (canQueue) {
      return queueAndSynthesize(url, method, mergedHeaders as Record<string, string>, options.body)
    }
    throw err
  }
}
