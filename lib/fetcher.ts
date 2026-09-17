// Simple fetcher wrapper for API calls
// Uses relative paths (compatible with Caddy gateway proxy)
// GET requests use cache: 'no-store' to prevent stale data from browser cache

export async function fetcher(url: string, options?: RequestInit): Promise<Response> {
  const isGet = !options?.method || options.method === 'GET'
  const cacheOption: RequestCache = isGet ? 'no-store' : 'default'

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
