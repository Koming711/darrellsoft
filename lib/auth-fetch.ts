/**
 * Auth-aware fetch wrapper.
 * Automatically adds X-User-Id and X-User-Role headers from localStorage
 * so the server can authenticate the user even when cookies aren't sent
 * (e.g., through cross-origin proxies).
 * 
 * GET requests use cache: 'no-store' to prevent stale data from browser cache.
 */
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
 */
export function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
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

  return fetch(url, {
    ...options,
    headers: mergedHeaders,
    cache: cacheOption,
  })
}
