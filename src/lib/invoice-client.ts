/**
 * Client API helpers untuk modul Invoice.
 * Memakai authFetch (header x-user-id/x-user-role) sesuai konvensi aplikasi.
 */
import { authFetch } from '@/lib/auth-fetch'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** Fetch JSON ke API internal. Lempar ApiError jika gagal. */
export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
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

/** Unduh file (mis. Excel) dari API internal dengan auth headers. */
export async function downloadFile(url: string, fallbackName: string): Promise<void> {
  const res = await authFetch(url)
  if (!res.ok) {
    let msg = 'Gagal mengunduh file'
    try {
      const j = await res.json()
      msg = j?.error || msg
    } catch {
      /* ignore */
    }
    throw new ApiError(msg, res.status)
  }
  const blob = await res.blob()
  const cd = res.headers.get('content-disposition') || ''
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd)
  const name = m ? decodeURIComponent(m[1]) : fallbackName
  const a = document.createElement('a')
  const objectUrl = URL.createObjectURL(blob)
  a.href = objectUrl
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
