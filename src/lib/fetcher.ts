// Simple fetcher wrapper for API calls
// Uses relative paths (compatible with Caddy gateway proxy)
// GET requests use cache: 'no-store' to prevent stale data from browser cache
//
// SMART CACHE (GET): GET ke endpoint data aman dilayani lib/smart-fetch
// (memori → IndexedDB → network, TTL per entity, dedupe, invalidasi otomatis).
// Endpoint sensitif tetap network langsung. Escape hatch: `?nocache`.
import { smartGet } from '@/lib/smart-fetch'

export async function fetcher(url: string, options?: RequestInit): Promise<Response> {
  const isGet = !options?.method || options.method === 'GET'
  const cacheOption: RequestCache = isGet ? 'no-store' : 'default'

  if (isGet && typeof window !== 'undefined') {
    const h = options?.headers
    const headerObj: Record<string, string> = h
      ? h instanceof Headers
        ? Object.fromEntries(h.entries())
        : { ...(h as Record<string, string>) }
      : {}
    return smartGet(url, { headers: headerObj })
  }

  const res = await fetch(url, {
    ...options,
    cache: cacheOption,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!res.ok && res.status !== 401) {
    const errorData = await res.json().catch(() => ({ message: res.statusText }))
    console.error(`Fetcher error [${res.status}]:`, errorData.message || res.statusText)
  }

  return res
}
