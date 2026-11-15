/**
 * Device token — identitas unik perangkat untuk fitur "Login 1 Perangkat".
 *
 * Token acak kriptografis dibuat sekali per browser dan disimpan di
 * localStorage + cookie (10 tahun). Cookie membuat identitas perangkat
 * bertahan meski localStorage dibersihkan (pemulihan sesi), dan ikut
 * terkirim otomatis pada setiap request (server membaca cookie dsDevice).
 *
 * Token asli hanya dikirim ke server untuk DI-HASH — server tidak pernah
 * menyimpan token mentah. IP address / User-Agent tidak dipakai sebagai
 * identitas.
 */

const DEVICE_TOKEN_KEY = 'ds_device_token'
const DEVICE_COOKIE = 'dsDevice'
// 10 tahun — identitas perangkat bertahan selama browser tidak direset.
const TEN_YEARS_S = 60 * 60 * 24 * 365 * 10

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  try {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
    return match ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}

function generateToken(): string {
  let rand = ''
  try {
    if (typeof crypto !== 'undefined') {
      // 32 byte acak kriptografis (hex) — aman sebagai identitas perangkat.
      const bytes = new Uint8Array(32)
      crypto.getRandomValues(bytes)
      rand = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    }
  } catch {}
  if (!rand) {
    rand = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  }
  return `ds-${rand}`
}

/** Sinkronkan cookie dsDevice agar server bisa membaca token tiap request. */
function syncCookie(token: string): void {
  if (typeof document === 'undefined') return
  try {
    document.cookie = `${DEVICE_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${TEN_YEARS_S}; samesite=lax`
  } catch {
    // cookie diblokir — token tetap dikirim via body request
  }
}

/**
 * Ambil (atau buat baru bila belum ada) device token perangkat ini.
 * Aman dipanggil berulang — hanya menulis bila belum ada.
 */
export function getOrCreateDeviceToken(): string {
  if (typeof window === 'undefined') return ''
  try {
    let token = localStorage.getItem(DEVICE_TOKEN_KEY) || readCookie(DEVICE_COOKIE)
    if (!token) {
      token = generateToken()
      try {
        localStorage.setItem(DEVICE_TOKEN_KEY, token)
      } catch {}
    }
    syncCookie(token)
    return token
  } catch {
    return ''
  }
}
