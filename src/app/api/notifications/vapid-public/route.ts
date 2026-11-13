// /api/notifications/vapid-public — public key VAPID untuk subscribe push
// di browser. HANYA public key — private key tidak pernah keluar dari server.
import { NextResponse } from 'next/server'
import { getVapidKeys } from '@/lib/push-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const keys = await getVapidKeys()
    return NextResponse.json({ publicKey: keys.publicKey })
  } catch (error) {
    console.error('VAPID public key error:', error)
    return NextResponse.json({ error: 'Kunci push tidak tersedia' }, { status: 500 })
  }
}
