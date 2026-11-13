// /api/cron/subscription-reminders — cron harian Vercel (01:00 UTC = 08:00 WIB).
// Memeriksa SEMUA langganan & mengirim pengingat sesuai jadwal
// (7 / 3 / 1 hari, hari terakhir, setelah berakhir) ke Owner + anggota grup.
//
// Proteksi:
//  - Vercel Cron mengirim header `Authorization: Bearer ${CRON_SECRET}`
//  - Manual/test: header x-cron-secret ATAU ?secret=
// Tanpa secret valid → 403.
import { NextRequest, NextResponse } from 'next/server'
import { runExpiryReminderSweep } from '@/lib/subscription-reminders'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET || ''
    const authHeader = request.headers.get('authorization') || ''
    const cronHeader = request.headers.get('x-cron-secret') || ''
    const { searchParams } = new URL(request.url)
    const querySecret = searchParams.get('secret') || ''

    const provided = authHeader.replace(/^Bearer\s+/i, '').trim() || cronHeader || querySecret
    if (!secret || provided !== secret) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const created = await runExpiryReminderSweep(true)
    return NextResponse.json({ success: true, created, ranAt: new Date().toISOString() })
  } catch (error) {
    console.error('Cron subscription-reminders error:', error)
    return NextResponse.json({ success: false, error: 'Cron gagal' }, { status: 500 })
  }
}
