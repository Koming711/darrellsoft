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
import { smartGet } from './smart-fetch'
import { clearAuthUser } from './auth'

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
 *
 * SMART CACHE (GET): GET ke endpoint data yang aman di-cache dilayani lewat
 * lib/smart-fetch (memori → IndexedDB → network, TTL per entity, dedupe,
 * SWR, invalidasi otomatis). Endpoint sensitif (auth/backup/payment/dll)
 * tidak pernah di-cache — tetap network langsung. Pakai `?nocache` di URL
 * untuk melewati cache.
 */
/**
 * DEVICE GATE CLIENT (spesifikasi §4): respons 403 deviceConflict dr
 * middleware perangkat → bersihkan sesi lokal & paksa kembali ke /login.
 * Anti-loop: redirect dilewati bila sudah di /login atau kick baru saja
 * terjadi (< 5 detik). Sesi server tetap sumber kebenaran — ini hanya
 * sinkronisasi UI agar pengguna langsung melihat keadaan dicabutnya sesi.
 */
async function handleDeviceConflict(res: Response): Promise<void> {
  if (res.status !== 403 || typeof window === 'undefined') return
  let conflict = false
  try {
    const data = await res.clone().json()
    conflict = !!(data as { deviceConflict?: boolean })?.deviceConflict
  } catch {
    conflict = false
  }
  if (!conflict) return
  try {
    sessionStorage.setItem('deviceConflictKickAt', String(Date.now()))
  } catch {}
  try {
    clearAuthUser()
  } catch {}
  try {
    const last = Number(sessionStorage.getItem('deviceConflictKickAt') || 0)
    const onLogin = window.location.pathname.startsWith('/login')
    if (!onLogin && Date.now() - last >= 0 && last > 0 && Date.now() - last < 5000) return
    if (!onLogin) window.location.replace('/login')
  } catch {}
}

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

  // ---- SMART CACHE: GET data aman → lapisan cache pintar ----
  // (melempar error network bila benar-benar gagal & tak ada cache offline —
  // perilaku error sama seperti jalur lama, tanpa fetch dobel)
  if (isGet) {
    const res = await smartGet(url, { headers: mergedHeaders as Record<string, string> })
    await handleDeviceConflict(res)
    return res
  }

  const method = (options.method ?? 'GET').toUpperCase()
  const canQueue = isQueueableWrite(url, method, options.body)

  // Sudah offline sejak awal → langsung antrikan (tanpa menunggu timeout)
  if (canQueue && typeof navigator !== 'undefined' && navigator.onLine === false) {
    return queueAndSynthesize(url, method, mergedHeaders as Record<string, string>, options.body)
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers: mergedHeaders,
      cache: cacheOption,
    })
    await handleDeviceConflict(res)
    return res
  } catch (err) {
    // Jaringan gagal saat mengirim tulisan → simpan ke antrian, bukan error.
    if (canQueue) {
      return queueAndSynthesize(url, method, mergedHeaders as Record<string, string>, options.body)
    }
    throw err
  }
}
