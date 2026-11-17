/**
 * Tipe notifikasi keamanan (fitur Login 1 Perangkat).
 *
 * File ini AMAN dipakai di server maupun client — tanpa import db.
 * Dipakai oleh: notification-popup-host, notification-bell,
 * customer-notification-bell, dan device-session (server).
 *
 * Tipe di DB dipakai spesifik (mis. 'login_attempt_other_device') agar
 * riwayat lebih informatif; 'security' dipertahankan untuk kompatibilitas
 * baris lama.
 */
export const SECURITY_NOTIF_TYPES = [
  'security',
  'login_attempt_other_device',
  'device_registered',
  'device_revoked',
  'device_reset',
  'device_takeover',
] as const

export function isSecurityNotifType(type: string): boolean {
  return (SECURITY_NOTIF_TYPES as readonly string[]).includes(type)
}
