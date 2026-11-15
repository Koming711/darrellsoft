import { NextRequest, NextResponse } from 'next/server'
import { revokeDeviceSessionByUser } from '@/lib/device-session'

/**
 * POST /api/auth/logout — cabut sesi perangkat saat pengguna logout manual.
 *
 * Bagian dari fitur "Login 1 Perangkat": sesi perangkat aktif dicabut
 * (status → revoked, logoutAt terisi) sehingga akun boleh login kembali di
 * perangkat lain. Hanya sesi milik perangkat ini yang dicabut (identifikasi
 * via device token / cookie dsDevice) — sesi perangkat lain tidak terpengaruh.
 */
export async function POST(request: NextRequest) {
  try {
    let body: { userId?: string; deviceToken?: string } = {}
    try {
      body = await request.json()
    } catch {}

    const userId =
      body.userId ||
      request.cookies.get('userId')?.value ||
      request.headers.get('x-user-id') ||
      ''
    const deviceToken =
      body.deviceToken ||
      request.cookies.get('dsDevice')?.value ||
      ''

    if (userId) {
      await revokeDeviceSessionByUser(userId, deviceToken)
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Logout error:', e)
    // Logout tetap dianggap sukses di sisi klien (fail-open).
    return NextResponse.json({ success: true })
  }
}
