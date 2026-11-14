// notify-fanout — tulis notifikasi ke DB untuk setiap penerima + sebar ke
// kanal lain (realtime socket + web push) + catat riwayat pengiriman.
//
// ATURAN PENTING:
// - SATU notifikasi per penerima per kejadian (dedupe via [ref:...] di body —
//   pola yang sama dengan subscription-reminders sebelumnya).
// - Kegagalan realtime/push TIDAK PERNAH menggagalkan alur API utama.
// - Penerima dihitung di pemanggil (fanout tidak menentukan hak akses).

import { db } from '@/lib/db'
import { emitRealtime } from '@/lib/realtime-notify'
import { sendWebPushToUsers } from '@/lib/push-server'
import type { PushPayload } from '@/lib/push-server'

export interface FanoutOptions {
  /** id penerima (Pengguna.id / CalonPembeli.id); "" berarti broadcast admin */
  userIds: string[]
  title: string
  /** isi pesan BERSIH yang tampil ke user (tanpa marker ref) */
  body: string
  /** marker dedupe unik per kejadian, mis. [ref:reg:xxx] / [ref:Pro:2026-11-18] */
  refKey?: string
  /** registration | subscription | payment | system | info */
  type: string
  /** href tujuan saat notifikasi diklik */
  link?: string
}

/** Buang marker [ref:...] dari body sebelum ditampilkan / dikirim ke kanal. */
export function stripRef(body: string): string {
  return body.replace(/\s*\[ref:[^\]]+\]\s*$/, '').trim()
}

/**
 * Tulis + sebar notifikasi. Mengembalikan jumlah baris baru yang dibuat.
 * Idempoten: notifikasi dengan (userId, type, title, refKey di body) yang
 * sama TIDAK dibuat dua kali.
 */
export async function fanoutNotification(opts: FanoutOptions): Promise<number> {
  const { userIds, title, body, refKey = '', type, link = '' } = opts
  const storedBody = refKey ? `${body} ${refKey}` : body
  let created = 0
  const pushedIds: string[] = []

  for (const userId of userIds) {
    try {
      // Dedupe per penerima (judul + ref periode/kejadian yang sama → skip)
      if (refKey) {
        const exists = await db.notification.findFirst({
          where: {
            userId,
            type,
            title,
            body: { contains: refKey },
          },
          select: { id: true },
        })
        if (exists) continue
      }

      const notif = await db.notification.create({
        data: {
          userId,
          title,
          body: storedBody,
          type,
          link,
        },
      })
      created++
      pushedIds.push(notif.id)

      // Realtime (socket.io) — popup in-app muncul tanpa menunggu poll
      emitRealtime({
        type,
        title,
        body,
        link,
        userId,
      })
    } catch (e) {
      console.warn('fanoutNotification create error (diabaikan):', e)
    }
  }

  // Web push — sekali per penerima (server menembak semua device user).
  // Dipanggil di luar loop create agar payload.id = id notifikasi pertama.
  if (created > 0 && userIds.length > 0) {
    const payload: PushPayload = {
      id: pushedIds[0] || `ev-${Date.now()}`,
      title,
      body,
      link,
      type,
    }
    await sendWebPushToUsers(userIds, payload).catch(() => {})
  }

  return created
}
