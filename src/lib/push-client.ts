'use client'

// push-client — Web Push subscription di sisi browser (client-only).
// - requestNotificationPermission(): minta izin Notification API
// - subscribePush(): daftar service worker + PushManager.subscribe + POST device
// - unsubscribePush(): hapus subscription & hapus device di server
// - detectDeviceType(): android | ios | desktop | browser

export interface PushSubscribeResult {
  ok: boolean
  reason?: string
  permission?: NotificationPermission | 'unsupported'
}

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    window.isSecureContext
  )
}

export function currentPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export function detectDeviceType(): string {
  if (typeof navigator === 'undefined') return 'browser'
  const s = navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(s)) return 'ios'
  if (/android/.test(s)) return 'android'
  if (/electron|windows|mac os|linux/.test(s) || !/mobile/.test(s)) return 'desktop'
  return 'browser'
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/** Minta izin notifikasi (harus dipanggil dari klik user). */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

/** Ambil public key VAPID dari server. */
async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch('/api/notifications/vapid-public')
    if (!res.ok) return null
    const json = await res.json()
    return json.publicKey || null
  } catch {
    return null
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { getAuthHeaders: h } = await import('@/lib/auth-fetch')
    return h()
  } catch {
    return { 'Content-Type': 'application/json' }
  }
}

/**
 * Subscribe push + daftarkan perangkat ke server.
 * Asumsi: izin sudah 'granted' (cek permission sebelum memanggil).
 */
export async function subscribePush(): Promise<PushSubscribeResult> {
  if (!isPushSupported()) {
    return { ok: false, reason: 'unsupported', permission: 'unsupported' }
  }
  if (Notification.permission !== 'granted') {
    return { ok: false, reason: 'permission', permission: Notification.permission }
  }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    const publicKey = await fetchVapidPublicKey()
    if (!publicKey) return { ok: false, reason: 'no-key', permission: 'granted' }

    const existing = await reg.pushManager.getSubscription()
    const sub =
      existing ||
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      }))

    const subJson = sub.toJSON()
    const headers = await getAuthHeaders()
    const res = await fetch('/api/notifications/devices', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        subscription: subJson,
        deviceType: detectDeviceType(),
        userAgent: navigator.userAgent,
      }),
    })
    if (!res.ok) return { ok: false, reason: 'server', permission: 'granted' }
    return { ok: true, permission: 'granted' }
  } catch (e) {
    console.warn('subscribePush error:', e)
    return { ok: false, reason: 'error', permission: Notification.permission }
  }
}

/** Hapus subscription push di browser + hapus device di server. */
export async function unsubscribePush(): Promise<boolean> {
  if (!isPushSupported()) return false
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) return false
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return true
    const endpoint = sub.endpoint
    const ok = await sub.unsubscribe()
    const headers = await getAuthHeaders()
    await fetch(
      `/api/notifications/devices?endpoint=${encodeURIComponent(endpoint)}`,
      { method: 'DELETE', headers }
    ).catch(() => {})
    return ok
  } catch {
    return false
  }
}

/** Cek apakah device ini sudah ter-subscribe push (subscription aktif). */
export async function isPushSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) return false
    const sub = await reg.pushManager.getSubscription()
    return !!sub
  } catch {
    return false
  }
}
