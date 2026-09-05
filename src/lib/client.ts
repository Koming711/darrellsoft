/**
 * Auth-aware JSON fetch helper for the restored master views
 * (Master Barang / Master Pelanggan / Harga Khusus).
 *
 * Mirrors the original app's `apiFetch` contract: returns parsed JSON,
 * throws ApiError with the server's `error` message when the response
 * is not ok. Auth headers follow the CURRENT app convention
 * (x-user-id / x-user-role from localStorage 'auth').
 */
import { getAuthHeaders } from '@/lib/auth-fetch'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** Fetch JSON ke API internal. Lempar ApiError jika gagal. */
export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
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
