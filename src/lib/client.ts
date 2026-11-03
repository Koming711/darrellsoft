/**
 * Auth-aware JSON fetch helper for the restored master views
 * (Master Barang / Master Pelanggan).
 *
 * Mirrors the original app's `apiFetch` contract: returns parsed JSON,
 * throws ApiError with the server's `error` message when the response
 * is not ok. Auth headers follow the CURRENT app convention
 * (x-user-id / x-user-role from localStorage 'auth').
 */
import { getAuthHeaders } from '@/lib/auth-fetch'
import { smartGetJSON } from '@/lib/smart-fetch'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/**
 * Fetch JSON ke API internal. Lempar ApiError jika gagal.
 *
 * SMART CACHE (GET): request GET menuju endpoint data yang aman di-cache
 * dilayani lewat lib/smart-fetch (memori → IndexedDB → network, TTL per
 * entity, dedupe, invalidasi otomatis via data-change). Menu terasa instan
 * dan request server jauh berkurang. Endpoint sensitif tidak pernah
 * di-cache. Pakai `?nocache` di URL untuk memaksa network.
 */
export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase()

  // GET data → lapisan cache pintar (kontrak & pesan error tetap sama)
  if (method === 'GET') {
    try {
      return await smartGetJSON<T>(url)
    } catch (e) {
      if (e instanceof ApiError) throw e
      // Network gagal total & tanpa cache offline → samakan dengan perilaku lama
      throw new ApiError(e instanceof Error ? e.message : 'Terjadi kesalahan pada server', 0)
    }
  }

  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(init?.headers as Record<string, string> | undefined),
    },
    cache: 'no-store',
  })
  let data: unknown = {}
  try {
    data = await res.json()
  } catch {
    data = {}
  }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error || 'Terjadi kesalahan pada server'
    throw new ApiError(msg, res.status)
  }
  return data as T
}
