import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/server-auth'
import { ensureSeedData } from '@/lib/auto-seed'

export async function GET(request: NextRequest) {
  try {
    // Authenticated users can read settings
    const authErr = requireAuth(request)
    if (authErr) return authErr

    // NOTE: ensureSeedData() is intentionally NOT called on GET requests.
    // It runs table migrations, seed checks, and is very slow on PostgreSQL.
    // It should only run on POST (write) or via /api/health.
    // This makes the settings API respond instantly for page loads.

    const { searchParams } = new URL(request.url)
    const key = searchParams.get('key')

    if (key) {
      const setting = await db.setting.findUnique({
        where: { key }
      })
      if (!setting) {
        return NextResponse.json({ key, value: null }, { status: 200 })
      }
      return NextResponse.json(setting, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
    }

    const settings = await db.setting.findMany()
    return NextResponse.json(settings, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    console.error('Error fetching settings:', error)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Any authenticated user can modify settings
    const authErr = requireAuth(request)
    if (authErr) return authErr

    // Run seed/migration checks on write operations (less frequent, acceptable delay)
    await ensureSeedData(null)

    const body = await request.json()
    const { key, value } = body

    if (!key) {
      return NextResponse.json({ error: 'Key is required' }, { status: 400 })
    }

    const setting = await db.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value: value || '' }
    })

    return NextResponse.json(setting)
  } catch (error) {
    console.error('Error saving setting:', error)
    return NextResponse.json({ error: 'Failed to save setting' }, { status: 500 })
  }
}
