'use client'

/**
 * RealtimeNotifications — koneksi socket.io ke mini-service notif-ws (port 3004).
 *
 * - Terpasang SEKALI di DashboardLayout (render null — murni side-effect).
 * - Saat ada baris Notification baru (dari manapun: invoice lunas/batal lunas,
 *   pembayaran disetujui, penangguhan, perpanjangan, dll) → toast instan +
 *   bunyi notifikasi + event window 'realtime-notification' (badge bell ikut refresh).
 * - Aman reconnect: socket.io auto-reconnect; subscribe diulang tiap connect.
 */

import { useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getAuthUser } from '@/lib/auth'
import { playNotifSound, unlockAudioOnInteraction } from '@/lib/notif-sound'
import { startNavigation } from '@/components/navigation-progress'

export interface RealtimeNotificationPayload {
  id: string
  userId: string
  title: string
  body: string
  type: string
  link: string
  createdAt: string
}

export function RealtimeNotifications() {
  const router = useRouter()
  const socketRef = useRef<ReturnType<typeof io> | null>(null)

  useEffect(() => {
    const auth = getAuthUser()
    if (!auth?.id) return

    unlockAudioOnInteraction()

    const socket = io('/?XTransformPort=3004', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 10000,
    })
    socketRef.current = socket

    const subscribe = () => {
      socket.emit('subscribe', { userId: auth.id, role: auth.role })
    }
    socket.on('connect', subscribe)
    socket.on('connect_error', () => {
      /* service down — retry otomatis, tanpa spam */
    })

    socket.on('notification', (payload: RealtimeNotificationPayload) => {
      // Event untuk komponen lain (bell, badge, dsb)
      try {
        window.dispatchEvent(new CustomEvent('realtime-notification', { detail: payload }))
      } catch { /* abaikan */ }

      const show = () =>
        toast(payload.title || 'Notifikasi', {
          description: payload.body || undefined,
          duration: 8000,
          action: payload.link
            ? {
                label: 'Buka',
                onClick: () => {
                  startNavigation()
                  window.dispatchEvent(new CustomEvent('navigation-start'))
                  router.push(payload.link)
                },
              }
            : undefined,
        })

      playNotifSound()
      show()
    })

    return () => {
      socket.removeAllListeners()
      socket.disconnect()
      socketRef.current = null
    }
  }, [router])

  return null
}
