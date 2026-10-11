'use client'

// realtime-client — koneksi socket.io singleton untuk notifikasi realtime.
// Selalu connect via gateway: io('/?XTransformPort=3003') dengan path '/'.
// JANGAN pernah menulis port langsung di URL.

import { io, Socket } from 'socket.io-client'

export interface RealtimeNotification {
  id: string
  type: string
  title: string
  body: string
  link: string
  userId: string
  createdAt: string
}

let socket: Socket | null = null

export function getRealtimeSocket(): Socket {
  if (!socket) {
    socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      forceNew: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 8000,
      timeout: 10000,
    })
  }
  return socket
}

/**
 * subscribeRealtime — daftarkan handler untuk event 'notif:new'.
 * Mengembalikan fungsi unsubscribe. Auth room dikirim setiap connect
 * agar reconnection otomatis join ulang ke room yang benar.
 */
export function subscribeRealtime(
  handler: (notif: RealtimeNotification) => void,
  auth: { userId?: string; role?: string } = {},
): () => void {
  const s = getRealtimeSocket()

  const joinAuth = () => {
    try {
      s.emit('auth', { userId: auth.userId || '', role: auth.role || 'user' })
    } catch {
      /* ignore */
    }
  }

  s.on('connect', joinAuth)
  if (s.connected) joinAuth()

  s.on('notif:new', handler)

  return () => {
    s.off('connect', joinAuth)
    s.off('notif:new', handler)
  }
}
