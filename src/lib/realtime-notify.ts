// realtime-notify — kirim notifikasi realtime dari API Next.js ke
// mini-service socket.io (mini-services/notif-service, port 3003).
//
// Fire-and-forget: KESALAHAN TIDAK PERNAH melempar — alur API utama
// tidak boleh gagal hanya karena notifikasi realtime tidak terkirim.
// (Kalau service mati, client masih punya polling fallback.)

const NOTIF_WS_URL = process.env.NOTIF_WS_URL || 'http://127.0.0.1:3004'
const NOTIF_WS_SECRET = process.env.NOTIF_WS_SECRET || 'ds-notif-internal-v1'

export interface RealtimeNotification {
  /** tipe notifikasi: registration | payment | subscription | info */
  type: string
  title: string
  body?: string
  /** href tujuan saat notifikasi diklik */
  link?: string
  /** kosong = broadcast ke semua admin */
  userId?: string
}

export function emitRealtime(notif: RealtimeNotification): void {
  try {
    // fetch dengan timeout pendek — jangan blok response API utama
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2000)
    fetch(`${NOTIF_WS_URL}/emit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-notif-secret': NOTIF_WS_SECRET,
      },
      body: JSON.stringify(notif),
      signal: controller.signal,
    })
      .catch(() => {
        /* service mati / timeout — abaikan, polling fallback tetap jalan */
      })
      .finally(() => clearTimeout(timer))
  } catch {
    /* jangan pernah throw */
  }
}
