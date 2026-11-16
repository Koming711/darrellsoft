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
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { emitRealtime } from '@/lib/realtime-notify'

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

// ======================================================================
// PEMULIHAN SKEMA OTOMATIS (PRODUCTION)
// Tabel DeviceSession/DeviceLoginAttempt ditambahkan belakangan; deploy
// Vercel TIDAK menjalankan prisma db push (lihat scripts/deploy.sh), jadi
// database produksi bisa belum memiliki tabel ini → login 500.
// ensureDeviceTables() membuat tabel tsb secara idempotent bila belum ada
// (kompatibel SQLite & PostgreSQL) — dipanggil saat query gagal P2021.
// ======================================================================

let deviceTablesReady = false

// Tipe kolom tanggal per-provider: SQLite engine Prisma HANYA menerima
// DATETIME (TIMESTAMP(3) → P2023 "Conversion failed"), PostgreSQL HANYA
// TIMESTAMP(3) (DATETIME tidak ada di PG).
const isSqliteUrl = (process.env.DATABASE_URL || '').startsWith('file:')
const TS = isSqliteUrl ? 'DATETIME' : 'TIMESTAMP(3)'

const DEVICE_TABLE_DDL = [
  `CREATE TABLE IF NOT EXISTS "DeviceSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL DEFAULT '',
    "userRole" TEXT NOT NULL DEFAULT '',
    "deviceTokenHash" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL DEFAULT '',
    "deviceType" TEXT NOT NULL DEFAULT '',
    "browser" TEXT NOT NULL DEFAULT '',
    "os" TEXT NOT NULL DEFAULT '',
    "loginAt" ${TS} NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" ${TS} NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'active',
    "logoutAt" ${TS},
    "revokedBy" TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS "DeviceSession_userId_status_idx" ON "DeviceSession"("userId", "status")`,
  `CREATE INDEX IF NOT EXISTS "DeviceSession_deviceTokenHash_idx" ON "DeviceSession"("deviceTokenHash")`,
  `CREATE INDEX IF NOT EXISTS "DeviceSession_status_loginAt_idx" ON "DeviceSession"("status", "loginAt")`,
  `CREATE TABLE IF NOT EXISTS "DeviceLoginAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL DEFAULT '',
    "deviceName" TEXT NOT NULL DEFAULT '',
    "deviceType" TEXT NOT NULL DEFAULT '',
    "browser" TEXT NOT NULL DEFAULT '',
    "os" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT 'device_conflict',
    "createdAt" ${TS} NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS "DeviceLoginAttempt_userId_createdAt_idx" ON "DeviceLoginAttempt"("userId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "DeviceLoginAttempt_createdAt_idx" ON "DeviceLoginAttempt"("createdAt")`,
]

/** True bila error = tabel/kolom belum ada di database (Prisma P2021/P2022). */
function isMissingTableError(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code
  if (code === 'P2021' || code === 'P2022') return true
  const msg = String(e ?? '')
  return /no such table|does not exist in the current database|relation .* does not exist|column .* does not exist/i.test(msg)
}

/** Buat tabel sesi perangkat bila belum ada (sekali per proses). */
export async function ensureDeviceTables(): Promise<void> {
  if (deviceTablesReady) return
  for (const stmt of DEVICE_TABLE_DDL) {
    await db.$executeRawUnsafe(stmt)
  }
  deviceTablesReady = true
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
/**
 * Hasil transaksi pendaftaran sesi perangkat. Union eksplisit agar narrowing
 * `result.rejected` memastikan `conflict` terdefinisi pada cabang ditolak.
 */
type RegisterTxResult =
  | { rejected: true; isNew: false; tookOver: false; tookOverFrom: ''; activeId: string; conflict: DeviceConflictInfo }
  | { rejected: false; isNew: boolean; tookOver: boolean; tookOverFrom: string; activeId: string; conflict: null }

/** Logika inti pendaftaran sesi — dipakai transaksi interaktif DAN jalur
 * fallback tanpa transaksi. `client` = tx Prisma ATAU PrismaClient biasa.
 * `force` = takeover eksplisit ("Gunakan Perangkat Ini"): kredensial sudah
 * diverifikasi valid di endpoint login, sesi perangkat lain dicabut dan
 * perangkat ini menjadi perangkat aktif (pemulihan diri tanpa admin). */
async function registerLogic(
  client: Prisma.TransactionClient,
  ctx: { userId: string; username: string; role: string; tokenHash: string; info: DeviceInfo; now: Date; enforce: boolean; force: boolean },
): Promise<RegisterTxResult> {
  const { userId, username, role, tokenHash, info, now, enforce, force } = ctx
  let tookOver = false
  let tookOverFrom = ''
  const active = await client.deviceSession.findFirst({
    where: { userId, status: 'active' },
    orderBy: { loginAt: 'desc' },
  })

  // 1) Akun sudah aktif di perangkat lain.
  if (active && active.deviceTokenHash !== tokenHash) {
    if (enforce && !force) {
      // Toggle "Login 1 Perangkat" AKTIF → TOLAK perangkat kedua.
      return { rejected: true, isNew: false, tookOver: false, tookOverFrom: '', activeId: active.id, conflict: {
        deviceName: active.deviceName,
        deviceType: active.deviceType,
        browser: active.browser,
        os: active.os,
        loginAt: active.loginAt,
        lastActivityAt: active.lastActivityAt,
      } }
    }
    // Toggle MATI (multi perangkat diizinkan) atau TAKEOVER eksplisit →
    // perangkat ini mengambil alih status aktif, sesi lama dicabut.
    await client.deviceSession.update({
      where: { id: active.id },
      data: { status: 'revoked', logoutAt: now, revokedBy: force ? 'takeover' : '' },
    })
    if (force) {
      tookOver = true
      tookOverFrom = active.deviceName
    }
  }

  // 2) Re-login dari perangkat yang sama → segarkan sesi.
  if (active && active.deviceTokenHash === tokenHash) {
    await client.deviceSession.update({
      where: { id: active.id },
      data: { loginAt: now, lastActivityAt: now, status: 'active', logoutAt: null, userRole: role },
    })
    return { rejected: false, isNew: false, tookOver: false, tookOverFrom: '', activeId: active.id, conflict: null }
  }

  // 3) Belum ada sesi aktif (atau sesi lama baru saja dicabut via takeover)
  //    → daftarkan perangkat ini sebagai perangkat aktif.
  const existingHashRow = await client.deviceSession.findFirst({
    where: { userId, deviceTokenHash: tokenHash },
    orderBy: { loginAt: 'desc' },
  })
  let sessionId: string
  if (existingHashRow) {
    await client.deviceSession.update({
      where: { id: existingHashRow.id },
      data: {
        status: 'active', logoutAt: null, loginAt: now, lastActivityAt: now,
        username, userRole: role, deviceName: info.deviceName,
        deviceType: info.deviceType, browser: info.browser, os: info.os,
      },
    })
    sessionId = existingHashRow.id
  } else {
    const created = await client.deviceSession.create({
      data: {
        userId, username, userRole: role, deviceTokenHash: tokenHash,
        deviceName: info.deviceName, deviceType: info.deviceType,
        browser: info.browser, os: info.os, loginAt: now, lastActivityAt: now,
        status: 'active',
      },
    })
    sessionId = created.id
  }
  return { rejected: false, isNew: !existingHashRow, tookOver, tookOverFrom, activeId: sessionId, conflict: null }
}

export async function registerDeviceSession(params: {
  userId: string
  username: string
  role: string
  deviceToken: string | null | undefined
  userAgent: string
  enforce: boolean
  /** Takeover eksplisit: cabut sesi perangkat lain & jadikan perangkat ini
   * aktif (hanya dipanggil setelah kredensial terverifikasi di login). */
  force?: boolean
}): Promise<RegisterResult> {
  const { userId, username, role, deviceToken, userAgent, enforce, force = false } = params
  const info = parseUserAgent(userAgent)
  const now = new Date()

  // Tanpa device token (klien lama / non-browser) → fail-open agar tidak
  // mengunci pengguna sah; sesi perangkat tidak didaftarkan.
  if (!deviceToken) return { ok: true, sessionId: '', isNewDevice: false, conflict: null }

  const tokenHash = hashDeviceToken(deviceToken)
  const ctx = { userId, username, role, tokenHash, info, now, enforce, force }
  const runTx = () => db.$transaction((tx) => registerLogic(tx, ctx))

  let result: RegisterTxResult
  try {
    result = await runTx()
  } catch (primaryErr) {
    // PEMULIHAN PRODUKSI: bila tabel sesi perangkat belum ada di database
    // (deploy tanpa prisma db push) → buat tabelnya lalu coba lagi.
    if (isMissingTableError(primaryErr)) {
      await ensureDeviceTables().catch((e) => console.error('ensureDeviceTables error:', e))
    }
    try {
      result = await runTx()
    } catch {
      // Transaksi interaktif dapat gagal di connection pool tertentu
      // (mis. PgBouncer transaction mode Supabase) → jalankan TANPA
      // transaksi. Risiko race sangat kecil dan invarian "maksimal 1 sesi
      // aktif" tetap terjaga pada login/polling berikutnya.
      result = await registerLogic(db as unknown as Prisma.TransactionClient, ctx)
    }
  }

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

  // TAKEOVER ("Gunakan Perangkat Ini"): sesi perangkat lama dicabut otomatis.
  // Notifikasi keamanan dikirim agar pemilik akun selalu tahu perangkat mana
  // yang kini aktif.
  if (result.tookOver) {
    await sendSecurityNotifications({
      userId,
      type: 'device_takeover',
      title: 'Sesi Dipindahkan ke Perangkat Baru',
      body:
        `Akun "${username}" diaktifkan pada perangkat baru lewat opsi "Gunakan Perangkat Ini" ` +
        `di halaman login (password terverifikasi benar).\n\n` +
        `Perangkat baru: ${info.deviceName}\n` +
        (result.tookOverFrom ? `Sesi sebelumnya (${result.tookOverFrom}) otomatis keluar (logout).\n\n` : '\n') +
        `Waktu: ${formatTanggal(now)}\n\n` +
        `Jika ini bukan Anda, segera ganti password dan hubungi administrator.`,
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

  const runCheck = async (): Promise<{
    status: 'ok' | 'conflict'
    kind?: 'device_conflict' | 'session_revoked'
    conflict?: DeviceConflictInfo
  }> => {
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

  // PEMULIHAN PRODUKSI: tabel sesi perangkat belum ada → buat sekali, lalu
  // ulangi pemeriksaan (verify-session upstream sudah fail-open bila tetap gagal).
  try {
    return await runCheck()
  } catch (e) {
    if (!isMissingTableError(e)) throw e
    await ensureDeviceTables().catch((healErr) => console.error('ensureDeviceTables error:', healErr))
    return await runCheck()
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

/**
 * Kirim notifikasi keamanan: pemilik akun + broadcast admin.
 *
 * Riwayat: baris Notification di DB (tipe spesifik, mis. 'login_attempt_other_device').
 * Realtime: popup in-app muncul SEKETIKA di perangkat aktif pemilik akun
 * (room user:<id>) dan semua admin (room 'admins') via socket.io notif-service
 * — tanpa menunggu polling. Fire-and-forget: kegagalan service realtime
 * TIDAK PERNAH menggagalkan alur utama (fallback polling tetap ada).
 */
export async function sendSecurityNotifications(params: {
  userId: string
  type: string
  title: string
  body: string
  /** href tujuan saat notifikasi pemilik diklik (opsional) */
  link?: string
}): Promise<void> {
  const { userId, type, title, body } = params
  const ownerLink = params.link || ''
  const adminLink = '/panel-admin'
  try {
    await db.$transaction([
      db.notification.create({
        data: { userId, title, body, type, link: ownerLink },
      }),
      db.notification.create({
        data: { userId: '', title, body, type, link: adminLink },
      }),
    ])
  } catch (e) {
    console.error('sendSecurityNotifications error:', e)
  }
  // Realtime — popup + badge lonceng di perangkat aktif seketika.
  emitRealtime({ type, title, body, link: ownerLink, userId })
  emitRealtime({ type, title, body, link: adminLink, userId: '' })
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
