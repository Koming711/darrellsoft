'use client'

import { authFetch } from '@/lib/auth-fetch'
import { clearAuthUser } from '@/lib/auth'

/**
 * Fetch khusus halaman Panel Admin.
 *
 * Bila server menjawab 401 (sesi tidak valid / belum login), JANGAN
 * tampilkan teks mentah "Anda harus login terlebih dahulu" — bersihkan
 * sesi lama dan arahkan pengguna ke halaman login secara otomatis.
 * Bila 403 (bukan admin), kembalikan authError agar pemanggil menampilkan
 * pesan yang sopan.
 */
export async function panelFetch<T = Record<string, unknown>>(
  url: string,
  options: RequestInit = {}
): Promise<{ data: T | null; authError: boolean; error: string }> {
  try {
    const res = await authFetch(url, options)
    let d: Record<string, unknown> = {}
    try {
      d = await res.json()
    } catch {
      return { data: null, authError: false, error: 'Respon server tidak valid.' }
    }

    if (res.status === 401 || d.code === 'UNAUTHENTICATED') {
      // Sesi kadaluarsa / tidak valid → bersihkan & login ulang
      try { clearAuthUser() } catch { /* ignore */ }
      if (typeof window !== 'undefined') {
        window.location.href = '/login'
      }
      return { data: null, authError: true, error: 'Sesi berakhir. Mengalihkan ke halaman login…' }
    }

    if (res.status === 403 || d.code === 'FORBIDDEN') {
      return { data: null, authError: true, error: d.error as string || 'Akses ditolak. Hanya admin yang dapat membuka halaman ini.' }
    }

    if (d.error) {
      return { data: null, authError: false, error: d.error as string }
    }

    return { data: d as T, authError: false, error: '' }
  } catch {
    return { data: null, authError: false, error: 'Gagal terhubung ke server. Periksa koneksi internet Anda.' }
  }
}
