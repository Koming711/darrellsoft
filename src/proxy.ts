import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/server-auth'
import { db } from '@/lib/db'
import { hashDeviceToken, isSingleDeviceEnabled, getSingleDeviceMessage } from '@/lib/device-session'
import { getVerdict, setVerdict } from '@/lib/device-gate-cache'

/**
 * DEVICE GATE — spesifikasi §4 (validasi perangkat di server):
 * "Setiap permintaan API yang membutuhkan autentikasi" divalidasi perangkatnya.
 *
 * Next.js 16: file konvensi middleware.ts diganti proxy.ts (nama fungsi proxy).
 * Alur:
 * - Hanya /api/* yang digate; halaman aplikasi divalidasi client-side via
 *   polling verify-session (dashboard-layout) + /api/auth/me.
 * - Identitas user diambil dari cookie/header yang sama dengan route handler.
 * - Device token dibaca dari cookie `dsDevice` (otomatis terkirim, 10 tahun).
 * - Verdict di-cache 30 detik per (userId, tokenHash) agar DB tidak dipukul
 *   setiap request — pencabutan sesi tetap efektif maksimal 30 detik + kiek
 *   real-time dari polling verify-session (10 detik) di sisi klien.
 *
 * Fail-open (kesediaan desain, sama seperti logika device-session.ts):
 * - Tanpa device token (klien lama/non-browser) → lolos (route handler tetap
 *   menjalankan auth sendiri).
 * - Tidak ada baris DeviceSession sama sekali untuk user (akun lama pra-fitur)
 *   → lolos.
 * - Error DB / toggle "Login 1 Perangkat" mati → lolos.
 *
 * Kunci keamanan yang DITUTUP di sini:
 * - Cookie/headers identitas dicuri/dipalsukan dan dipakai dari perangkat lain
 *   → sesi aktif milik token lain → 403 deviceConflict.
 * - Sesi perangkat sudah dicabut admin/reset → tidak ada sesi aktif + riwayat
 *   token ini revoked → 403 deviceConflict (wajib login ulang).
 */

/** Prefix API yang tidak digate (auth mengelola validasinya sendiri / publik / webhook). */
const SKIP_PREFIXES = [
  '/api/auth/',
  '/api/public-settings',
  '/api/public/',
  '/api/midtrans',
  '/api/payment/webhook',
  '/api/cron',
  '/api/dev',
  '/api/health',
  '/api/versions',
]

/** Verdict per (userId:tokenHash) — TTL 30 detik (lib/device-gate-cache.ts). */

/** Cache toggle "Login 1 Perangkat" (Setting key 'single_device') — 30 detik. */
let singleDeviceCache: { enabled: boolean; ts: number } | null = null
const SINGLE_DEVICE_TTL = 30_000

/*
 * Next.js 16: proxy SELALU berjalan di Node.js runtime (export const config
 * TIDAK diizinkan di file ini — tanpa matcher, proxy berjalan utk SEMUA
 * request; shouldSkip() menyaring non-API dgn overhead minimal).
 */

function shouldSkip(pathname: string): boolean {
  if (!pathname.startsWith('/api/')) return true
  return SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (shouldSkip(pathname)) return NextResponse.next()

  // Belum teridentifikasi → biarkan route handler yang membalas 401.
  const user = getServerUser(request)
  if (!user?.id) return NextResponse.next()

  // Token perangkat dari cookie (auto terkirim semua request same-origin).
  const deviceToken = request.cookies.get('dsDevice')?.value || null
  if (!deviceToken) return NextResponse.next() // klien lama / non-browser → fail-open

  try {
    // Toggle fitur dari Panel Admin (Hak Akses) — cache 30 detik.
    const nowMs = Date.now()
    if (!singleDeviceCache || nowMs - singleDeviceCache.ts > SINGLE_DEVICE_TTL) {
      const enabled = await isSingleDeviceEnabled()
      singleDeviceCache = { enabled, ts: nowMs }
    }
    if (!singleDeviceCache.enabled) return NextResponse.next()

    const tokenHash = hashDeviceToken(deviceToken)
    const cacheKey = `${user.id}:${tokenHash}`
    const cached = getVerdict(cacheKey)
    if (cached === 'ok') {
      return NextResponse.next()
    }

    // Sesi aktif milik siapa?
    const active = await db.deviceSession.findFirst({
      where: { userId: user.id, status: 'active' },
      orderBy: { loginAt: 'desc' },
      select: {
        deviceTokenHash: true,
        deviceName: true,
        deviceType: true,
        browser: true,
        os: true,
        loginAt: true,
        lastActivityAt: true,
      },
    })

    let verdict: 'ok' | 'conflict' = 'ok'
    let kind: 'device_conflict' | 'session_revoked' = 'device_conflict'
    let activeDevice: Record<string, unknown> | null = null

    if (active) {
      if (active.deviceTokenHash === tokenHash) {
        verdict = 'ok'
      } else {
        // Identitas dipakai dari perangkat lain → TOLAK.
        verdict = 'conflict'
        kind = 'device_conflict'
        activeDevice = {
          deviceName: active.deviceName,
          deviceType: active.deviceType,
          browser: active.browser,
          os: active.os,
          loginAt: active.loginAt,
          lastActivityAt: active.lastActivityAt,
        }
      }
    } else {
      // Tidak ada sesi aktif — cek apakah token INI pernah dicabut admin.
      const lastForToken = await db.deviceSession.findFirst({
        where: { userId: user.id, deviceTokenHash: tokenHash },
        orderBy: { loginAt: 'desc' },
        select: { status: true, revokedBy: true },
      })
      if (lastForToken && lastForToken.status === 'revoked' && lastForToken.revokedBy) {
        // Sesi perangkat ini dicabut administrator → wajib login ulang.
        verdict = 'conflict'
        kind = 'session_revoked'
      } else {
        // Akun lama pra-fitur / belum terdaftar → lolos; verify-session
        // polling mendaftarkan perangkat ini secara lazim.
        verdict = 'ok'
      }
    }

    setVerdict(cacheKey, verdict)

    if (verdict === 'ok') return NextResponse.next()

    const customMessage = await getSingleDeviceMessage()
    const baseError =
      kind === 'session_revoked'
        ? 'Sesi perangkat ini telah dicabut oleh administrator atau dipindahkan ke perangkat lain. Silakan login kembali.'
        : 'PERINGATAN KEAMANAN! Akun Darrellsoft ini sedang digunakan pada perangkat lain. Demi keamanan akun, satu akun hanya dapat digunakan pada satu perangkat.'

    return NextResponse.json(
      {
        deviceConflict: true,
        kind,
        error: baseError,
        warningMessage: customMessage || undefined,
        activeDevice,
      },
      { status: 403, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (e) {
    // FAIL-OPEN: kegagalan gate tidak boleh mematikan aplikasi — logika
    // keamanan utama tetap berjalan di login + verify-session polling.
    console.error('device-gate middleware error (fail-open):', e)
    return NextResponse.next()
  }
}
