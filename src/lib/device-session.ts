/**
 * LOGIN 1 PERANGKAT — library sesi perangkat (server-side).
 *
 * Aturan: 1 akun Darrellsoft hanya boleh aktif pada 1 perangkat dalam satu
 * waktu (berlaku untuk SEMUA role: superadmin, admin, owner, anggota grup,
 * user, demo).
 *
 * Identitas perangkat = device token acak (kriptografis) yang dibuat browser
 * dan dikirim pada login + dipantau via polling. Token asli TIDAK pernah
 * disimpan di database — hanya hash SHA-256-nya (deviceTokenHash).
 * IP address dan User-Agent TIDAK dipakai sebagai identitas (hanya metadata
 * tampilan: jenis perangkat, browser, OS).
 *
 * Penguncian: pendaftaran/cabut sesi memakai transaksi interaktif Prisma —
 * SQLite menserialisasi tulisan, sehingga dua perangkat yang login hampir
 * bersamaan tidak mungkin sama-sama mendapat status 'active'.
 */

import { createHash } from 'crypto'
import { db } from '@/lib/db'

export type DeviceInfo = {
  deviceType: string // desktop | mobile | tablet
  browser: string
  os: string
  deviceName: string
}

export type DeviceConflictInfo = {
  deviceName: string
  deviceType: string
  browser: string
  os: string
  loginAt: Date
  lastActivityAt: Date
}

export type RegisterResult =
  | { ok: true; sessionId: string; isNewDevice: boolean; conflict: null }
  | { ok: false; sessionId: ''; isNewDevice: false; conflict: DeviceConflictInfo }

/** Hash device token — token asli tidak pernah tersimpan. */
export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(`ds_device_v1:${token}`).digest('hex')
}

/**
 * Setting 'single_device' di Halaman Hak Akses (Panel Admin):
 * aktif kecuali eksplisit 'false'. Default AKTIF.
 */
export async function isSingleDeviceEnabled(): Promise<boolean> {
  try {
    const setting = await db.setting.findUnique({ where: { key: 'single_device' } })
    return setting?.value !== 'false'
  } catch {
    return true // fail-safe: bila setting gagal dibaca, tetap batasi
  }
}

/** Pesan kustom admin (textarea "Pesan Peringatan Multi-Perangkat"). */
export async function getSingleDeviceMessage(): Promise<string> {
  try {
    const setting = await db.setting.findUnique({ where: { key: 'single_device_message' } })
    return (setting?.value || '').trim()
  } catch {
    return ''
  }
}

/** Parse User-Agent → metadata tampilan (BUKAN identitas). */
export function parseUserAgent(ua: string): DeviceInfo {
  const s = ua || ''
  const lower = s.toLowerCase()

  // --- Jenis perangkat ---
  let deviceType = 'desktop'
  if (/ipad|tablet|playbook|silk|kindle/.test(lower)) deviceType = 'tablet'
  else if (/mobi|iphone|ipod|android.*mobile|windows phone/.test(lower)) deviceType = 'mobile'
  else if (/android/.test(lower)) deviceType = 'tablet'

  // --- Browser ---
  let browser = 'Browser Tidak Dikenal'
  if (/edg\//.test(lower)) browser = 'Microsoft Edge'
  else if (/opr\/|opera/.test(lower)) browser = 'Opera'
  else if (/samsungbrowser/.test(lower)) browser = 'Samsung Internet'
  else if (/firefox\//.test(lower)) browser = 'Firefox'
  else if (/chrome\//.test(lower)) browser = 'Chrome'
  else if (/safari/.test(lower) && /version\//.test(lower)) browser = 'Safari'
  else if (/msie|trident/.test(lower)) browser = 'Internet Explorer'

  // --- OS ---
  let os = 'OS Tidak Dikenal'
  if (/windows/.test(lower)) os = 'Windows'
  else if (/android/.test(lower)) {
    const m = s.match(/Android\s+([\d.]+)/i)
    os = m ? `Android ${m[1]}` : 'Android'
  } else if (/iphone|ipad|ipod/.test(lower)) {
    const m = s.match(/OS\s+([\d_]+)/i)
    os = m ? `iOS ${m[1].replace(/_/g, '.')}` : 'iOS'
  } else if (/mac os x|macintosh/.test(lower)) os = 'macOS'
  else if (/cros/.test(lower)) os = 'Chrome OS'
  else if (/linux/.test(lower)) os = 'Linux'

  const typeLabel = deviceType === 'desktop' ? 'Komputer' : deviceType === 'mobile' ? 'HP' : 'Tablet'
  const deviceName = `${browser} di ${os} (${typeLabel})`

  return { deviceType, browser, os, deviceName }
}

/**
 * Daftarkan / segarkan sesi perangkat saat LOGIN.
 * - enforce=true (toggle "Login 1 Perangkat" aktif): akun sudah aktif di
 *   perangkat LAIN → DITOLAK (conflict) + catat percobaan + notifikasi.
 * - enforce=false (toggle mati): multi perangkat diizinkan — perangkat
 *   terakhir menjadi sesi aktif (tanpa penolakan), invarian "maksimal 1
 *   sesi aktif per akun" tetap dipelihara.
 * Bila token perangkat kosong (klien lama) → fail-open (diterima tanpa guard).
 */
export async function registerDeviceSession(params: {
  userId: string
  username: string
  role: string
  deviceToken: string | null | undefined
  userAgent: string
  enforce: boolean
}): Promise<RegisterResult> {
  const { userId, username, role, deviceToken, userAgent, enforce } = params
  const info = parseUserAgent(userAgent)
  const now = new Date()

  // Tanpa device token (klien lama / non-browser) → fail-open agar tidak
  // mengunci pengguna sah; sesi perangkat tidak didaftarkan.
  if (!deviceToken) return { ok: true, sessionId: '', isNewDevice: false, conflict: null }

  const tokenHash = hashDeviceToken(deviceToken)

  const result = await db.$transaction(async (tx) => {
    const active = await tx.deviceSession.findFirst({
      where: { userId, status: 'active' },
      orderBy: { loginAt: 'desc' },
    })

    // 1) Akun sudah aktif di perangkat lain.
    if (active && active.deviceTokenHash !== tokenHash) {
      if (enforce) {
        // Toggle "Login 1 Perangkat" AKTIF → TOLAK perangkat kedua.
        return { rejected: true, isNew: false, activeId: active.id, conflict: {
          deviceName: active.deviceName,
          deviceType: active.deviceType,
          browser: active.browser,
          os: active.os,
          loginAt: active.loginAt,
          lastActivityAt: active.lastActivityAt,
        } }
      }
      // Toggle MATI (multi perangkat diizinkan) → perangkat ini mengambil
      // alih status aktif (perilaku lama), sesi lama dicabut.
      await tx.deviceSession.update({
        where: { id: active.id },
        data: { status: 'revoked', logoutAt: now, revokedBy: '' },
      })
    }

    // 2) Re-login dari perangkat yang sama → segarkan sesi.
    if (active && active.deviceTokenHash === tokenHash) {
      await tx.deviceSession.update({
        where: { id: active.id },
        data: { loginAt: now, lastActivityAt: now, status: 'active', logoutAt: null, userRole: role },
      })
      return { rejected: false, isNew: false, activeId: active.id, conflict: null }
    }

    // 3) Belum ada sesi aktif → daftarkan perangkat ini sebagai perangkat aktif.
    const existingHashRow = await tx.deviceSession.findFirst({
      where: { userId, deviceTokenHash: tokenHash },
      orderBy: { loginAt: 'desc' },
    })
    let sessionId: string
    if (existingHashRow) {
      await tx.deviceSession.update({
        where: { id: existingHashRow.id },
        data: {
          status: 'active', logoutAt: null, loginAt: now, lastActivityAt: now,
          username, userRole: role, deviceName: info.deviceName,
          deviceType: info.deviceType, browser: info.browser, os: info.os,
        },
      })
      sessionId = existingHashRow.id
    } else {
      const created = await tx.deviceSession.create({
        data: {
          userId, username, userRole: role, deviceTokenHash: tokenHash,
          deviceName: info.deviceName, deviceType: info.deviceType,
          browser: info.browser, os: info.os, loginAt: now, lastActivityAt: now,
          status: 'active',
        },
      })
      sessionId = created.id
    }
    return { rejected: false, isNew: !existingHashRow, activeId: sessionId, conflict: null }
  })

  if (result.rejected) {
    // Catat riwayat login ditolak (fire-and-forget, tidak memblokir respons).
    try {
      await db.deviceLoginAttempt.create({
        data: {
          userId, username, reason: 'device_conflict',
          deviceName: info.deviceName, deviceType: info.deviceType,
          browser: info.browser, os: info.os,
        },
      })
    } catch (e) {
      console.error('deviceLoginAttempt create error:', e)
    }
    // Notifikasi keamanan ke pemilik akun + broadcast admin.
    await sendSecurityNotifications({
      userId,
      type: 'login_attempt_other_device',
      title: 'Percobaan Login dari Perangkat Lain',
      body:
        `Ada percobaan login ke akun "${username}" dari perangkat lain dan DITOLAK sistem.\n\n` +
        `Perangkat: ${info.deviceName}\nWaktu: ${formatTanggal(now)}\n\n` +
        `Demi keamanan akun, satu akun hanya dapat digunakan pada satu perangkat. ` +
        `Jika ini bukan Anda, segera ganti password dan hubungi administrator.`,
    })
    return { ok: false, sessionId: '', isNewDevice: false, conflict: result.conflict }
  }

  // Perangkat baru berhasil didaftarkan → notifikasi (kecuali re-login device sama).
  if (result.isNew) {
    await sendSecurityNotifications({
      userId,
      type: 'device_registered',
      title: 'Perangkat Baru Terdaftar',
      body:
        `Akun "${username}" kini aktif pada perangkat baru.\n\n` +
        `Perangkat: ${info.deviceName}\nWaktu: ${formatTanggal(now)}\n\n` +
        `Jika bukan Anda yang login, segera hubungi administrator untuk mencabut sesi perangkat ini.`,
    })
  }

  return { ok: true, sessionId: result.activeId, isNewDevice: result.isNew, conflict: null }
}

/**
 * Validasi sesi perangkat untuk request yang sudah login (verify-session,
 * /api/auth/me). Mengembalikan:
 * - 'skip'    : guard tidak berjalan (toggle mati / tanpa token) → fail-open
 * - 'ok'      : perangkat ini adalah sesi aktif → sesi valid
 * - 'conflict': tolak — kind 'device_conflict' (sesi aktif milik perangkat
 *               lain) atau 'session_revoked' (sesi perangkat ini dicabut
 *               administrator → jangan hidupkan otomatis, wajib login ulang)
 */
export async function validateDeviceSession(params: {
  userId: string
  username: string
  role: string
  deviceToken: string | null | undefined
  userAgent: string
}): Promise<{
  status: 'skip' | 'ok' | 'conflict'
  kind?: 'device_conflict' | 'session_revoked'
  conflict?: DeviceConflictInfo
}> {
  const { userId, username, role, deviceToken, userAgent } = params

  if (!(await isSingleDeviceEnabled())) return { status: 'skip' }
  if (!deviceToken) return { status: 'skip' } // klien lama → fail-open

  const tokenHash = hashDeviceToken(deviceToken)
  const now = new Date()

  const active = await db.deviceSession.findFirst({
    where: { userId, status: 'active' },
    orderBy: { loginAt: 'desc' },
  })

  if (!active) {
    // Tidak ada sesi aktif. Pemeriksaan dulu: apakah sesi terakhir perangkat
    // ini DICABUT ADMINISTRATOR? Bila ya, JANGAN hidupkan kembali otomatis
    // via polling (batal-membatalkan cabut sesi) — wajib login ulang.
    const lastForToken = await db.deviceSession.findFirst({
      where: { userId, deviceTokenHash: tokenHash },
      orderBy: { loginAt: 'desc' },
    })
    if (lastForToken && lastForToken.status === 'revoked' && lastForToken.revokedBy) {
      return { status: 'conflict', kind: 'session_revoked' }
    }
    // Belum pernah terdaftar / logout normal / expired → daftarkan perangkat
    // ini secara lazim (pemulihan sesi setelah browser dibuka kembali).
    const reg = await registerDeviceSession({ userId, username, role, deviceToken, userAgent, enforce: true })
    return reg.ok ? { status: 'ok' } : { status: 'conflict', kind: 'device_conflict', conflict: reg.conflict || undefined }
  }

  if (active.deviceTokenHash === tokenHash) {
    // Perangkat aktif — perbarui aktivitas terakhir (polling 10 detik).
    await db.deviceSession.update({
      where: { id: active.id },
      data: { lastActivityAt: now, userRole: role },
    }).catch(() => {})
    return { status: 'ok' }
  }

  // Sesi aktif milik perangkat lain → tolak perangkat ini.
  return {
    status: 'conflict',
    kind: 'device_conflict',
    conflict: {
      deviceName: active.deviceName,
      deviceType: active.deviceType,
      browser: active.browser,
      os: active.os,
      loginAt: active.loginAt,
      lastActivityAt: active.lastActivityAt,
    },
  }
}

/** Cabut sesi aktif akun (logout manual oleh user) — hanya sesi perangkat INI. */
export async function revokeDeviceSessionByUser(userId: string, deviceToken: string | null | undefined): Promise<void> {
  try {
    if (!userId || !deviceToken) return // tanpa token (klien lama) → tidak ada yang bisa dicabut aman
    const tokenHash = hashDeviceToken(deviceToken)
    await db.deviceSession.updateMany({
      where: { userId, deviceTokenHash: tokenHash, status: 'active' },
      data: { status: 'revoked', logoutAt: new Date(), revokedBy: '' },
    })
  } catch (e) {
    console.error('revokeDeviceSessionByUser error:', e)
  }
}

/** Kirim notifikasi keamanan: pemilik akun + broadcast admin (popup in-app + riwayat). */
export async function sendSecurityNotifications(params: {
  userId: string
  type: string
  title: string
  body: string
}): Promise<void> {
  const { userId, title, body } = params
  try {
    await db.$transaction([
      db.notification.create({
        data: { userId, title, body, type: 'security', link: '' },
      }),
      db.notification.create({
        data: { userId: '', title, body, type: 'security', link: '' },
      }),
    ])
  } catch (e) {
    console.error('sendSecurityNotifications error:', e)
  }
}

/** Format tanggal Indonesia utk isi notifikasi. */
function formatTanggal(d: Date): string {
  try {
    return d.toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return d.toISOString()
  }
}
