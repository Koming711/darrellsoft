// push-server — Web Push (VAPID) server-side untuk Darrellsoft.
//
// - Kunci VAPID dibaca dari env (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY /
//   VAPID_SUBJECT); fallback: Setting DB ('vapid_public' / 'vapid_private');
//   fallback terakhir: generate sekali & simpan ke Setting DB (persist).
//   Private key TIDAK PERNAH dikirim ke client — hanya public key lewat
//   /api/notifications/vapid-public.
// - sendWebPushToUser: kirim payload push ke semua perangkat aktif user,
//   tandai device 404/410 tidak aktif, catat riwayat NotificationDelivery.
// - Fire-and-forget friendly: error tidak pernah melempar ke alur utama.

import { db } from '@/lib/db'
import type { webpush as WebPushType } from 'web-push'

type WebPushModule = typeof WebPushType

let webpushPromise: Promise<WebPushModule | null> | null = null

async function getWebPush(): Promise<WebPushModule | null> {
  if (!webpushPromise) {
    webpushPromise = import('web-push')
      .then((m) => (m.default ?? m) as unknown as WebPushModule)
      .catch(() => null)
  }
  return webpushPromise
}

/** Ambil atau buat kunci VAPID (env → Setting DB → generate & simpan). */
export async function getVapidKeys(): Promise<{
  publicKey: string
  privateKey: string
  subject: string
}> {
  let publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || ''
  let privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || ''
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:support@darrellsoft.com'

  if (publicKey && privateKey) return { publicKey, privateKey, subject }

  // Fallback: Setting DB (server-only read — tidak pernah masuk public-settings)
  try {
    const rows = await db.setting.findMany({
      where: { key: { in: ['vapid_public', 'vapid_private'] } },
    })
    const map = new Map(rows.map((r) => [r.key, r.value]))
    publicKey = publicKey || map.get('vapid_public') || ''
    privateKey = privateKey || map.get('vapid_private') || ''
    if (publicKey && privateKey) return { publicKey, privateKey, subject }

    // Fallback terakhir: generate sekali & simpan (get-or-create, toleran race)
    const wp = await getWebPush()
    if (wp) {
      const keys = wp.generateVAPIDKeys()
      await db.setting.upsert({
        where: { key: 'vapid_public' },
        update: { value: keys.publicKey },
        create: { key: 'vapid_public', value: keys.publicKey },
      })
      await db.setting.upsert({
        where: { key: 'vapid_private' },
        update: { value: keys.privateKey },
        create: { key: 'vapid_private', value: keys.privateKey },
      })
      return { publicKey: keys.publicKey, privateKey: keys.privateKey, subject }
    }
  } catch {
    /* DB gagal — biarkan throw di bawah bila benar-benar tak ada kunci */
  }

  throw new Error('VAPID keys tidak tersedia (env kosong & Setting DB gagal)')
}

/** Set VAPID details sekali per proses (cache internal). */
let vapidConfigured = false
async function ensureVapidConfigured(): Promise<WebPushModule | null> {
  const wp = await getWebPush()
  if (!wp) return null
  if (!vapidConfigured) {
    try {
      const keys = await getVapidKeys()
      wp.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey)
      vapidConfigured = true
    } catch {
      return null
    }
  }
  return wp
}

export interface PushPayload {
  id: string
  title: string
  body: string
  link: string
  type: string
}

export interface PushResult {
  sent: number
  failed: number
}

/**
 * Kirim push ke semua perangkat AKTIF milik user.
 * - Endpoint 404/410 → device dimatikan (isActive=false).
 * - Riwayat dicatat di NotificationDelivery (unique per notif+user+channel).
 * - Tidak pernah melempar error ke pemanggil.
 */
export async function sendWebPushToUser(
  userId: string,
  payload: PushPayload
): Promise<PushResult> {
  const out: PushResult = { sent: 0, failed: 0 }
  if (!userId) return out
  try {
    const wp = await ensureVapidConfigured()
    if (!wp) return out

    const devices = await db.pushDevice.findMany({
      where: { userId, isActive: true },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    })
    if (devices.length === 0) return out

    await Promise.all(
      devices.map(async (d) => {
        try {
          await wp.sendNotification(
            { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
            JSON.stringify(payload)
          )
          out.sent++
          await db.pushDevice
            .update({ where: { id: d.id }, data: { lastUsedAt: new Date() } })
            .catch(() => {})
        } catch (err) {
          out.failed++
          const statusCode =
            typeof err === 'object' && err && 'statusCode' in err
              ? Number((err as { statusCode?: number }).statusCode)
              : 0
          const msg = err instanceof Error ? err.message : String(err ?? '')
          if (statusCode === 404 || statusCode === 410) {
            // Subscription kedaluwarsa / tidak ada → matikan device
            await db.pushDevice
              .update({ where: { id: d.id }, data: { isActive: false } })
              .catch(() => {})
          }
          console.warn(`push fail (${statusCode}):`, msg.slice(0, 180))
        }
      })
    )

    // Riwayat pengiriman (1 baris agregat per notif+user) — anti duplikat
    await db.notificationDelivery
      .upsert({
        where: {
          notificationId_userId_channel: {
            notificationId: payload.id,
            userId,
            channel: 'push',
          },
        },
        update: {
          status: out.sent > 0 ? 'sent' : 'failed',
          error: out.failed > 0 ? `${out.failed} device gagal` : '',
          sentAt: new Date(),
        },
        create: {
          notificationId: payload.id,
          userId,
          channel: 'push',
          status: out.sent > 0 ? 'sent' : 'failed',
          error: out.failed > 0 ? `${out.failed} device gagal` : '',
        },
      })
      .catch(() => {})
  } catch (e) {
    console.warn('sendWebPushToUser error (diabaikan):', e)
  }
  return out
}

/** Kirim push ke beberapa penerima sekaligus (paralel per user). */
export async function sendWebPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<PushResult> {
  const total: PushResult = { sent: 0, failed: 0 }
  await Promise.all(
    userIds.map(async (uid) => {
      const r = await sendWebPushToUser(uid, payload)
      total.sent += r.sent
      total.failed += r.failed
    })
  )
  return total
}
