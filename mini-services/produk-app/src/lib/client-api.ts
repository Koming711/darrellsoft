'use client'

import { useAppStore } from '@/store/app-store'

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  params?: Record<string, string | number | boolean | undefined | null>
}

/** Wrapper fetch dengan header sesi (perusahaan & pengguna aktif). */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { companyId, userId } = useAppStore.getState()
  const url = new URL(path, 'http://local') // base dummy, hanya untuk build query
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    }
  }
  // basePath mini-service: app utama mem-proxy /produk-app/* ke server ini,
  // jadi fetch internal harus memakai prefiks yang sama.
  const BASE = '/produk-app'
  const relative = `${BASE}${url.pathname}${url.search}`

  const res = await fetch(relative, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-company-id': companyId ?? '',
      'x-user-id': userId ?? '',
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  })

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string')
      ? data.error
      : `Terjadi kesalahan (HTTP ${res.status}).`
    throw new Error(message)
  }
  return data as T
}
