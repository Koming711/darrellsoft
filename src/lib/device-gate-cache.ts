/**
 * Cache verdict device-gate (dipakai src/proxy.ts) + invalidasi manual.
 *
 * PENTING: proxy & route handler dibundel TERPISAH oleh Next.js — state
 * module-level TIDAK dibagi antar bundle. Cache disimpan di globalThis agar
 * invalidasi dari route handler (revoke/reset/logout) terlihat oleh proxy
 * dalam proses Node yang sama.
 *
 * Invalidasi WAJIB dipanggil setiap kali status sesi perangkat berubah:
 * - admin revoke/reset (POST /api/admin/device-sessions)
 * - logout user (revokeDeviceSessionByUser)
 * agar pencabutan sesi efektif SEKETIKA di lapisan API (tanpa menunggu
 * TTL 30 detik habis).
 */

export const VERDICT_TTL = 30_000
const VERDICT_CACHE_MAX = 10_000

type Entry = { verdict: 'ok' | 'conflict'; ts: number }

/** Simpan Map di globalThis — dibagi antar bundle dalam 1 proses Node. */
const g = globalThis as typeof globalThis & {
  __deviceGateVerdictCache?: Map<string, Entry>
}
const verdictCache: Map<string, Entry> = (g.__deviceGateVerdictCache ??= new Map())

export function getVerdict(key: string): 'ok' | 'conflict' | null {
  const hit = verdictCache.get(key)
  if (!hit) return null
  if (Date.now() - hit.ts > VERDICT_TTL) {
    verdictCache.delete(key)
    return null
  }
  return hit.verdict
}

export function setVerdict(key: string, verdict: 'ok' | 'conflict'): void {
  if (verdictCache.size > VERDICT_CACHE_MAX) verdictCache.clear()
  verdictCache.set(key, { verdict, ts: Date.now() })
}

/** Hapus semua verdict milik user tertentu (sesi perangkat berubah). */
export function invalidateDeviceGateCache(userId?: string): void {
  if (!userId) {
    verdictCache.clear()
    return
  }
  const prefix = `${userId}:`
  for (const k of Array.from(verdictCache.keys())) {
    if (k.startsWith(prefix)) verdictCache.delete(k)
  }
}
