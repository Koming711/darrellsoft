import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, getServerUser } from '@/lib/server-auth'
import { ensureSeedData } from '@/lib/auto-seed'
import { isSystemSettingKey } from '@/lib/settings-shared'

/**
 * Multi-tenant settings API.
 *
 * Two storage tiers:
 *  - `Setting`    → global defaults & system-wide keys (key @unique)
 *  - `UserSetting` → per-user overrides (userId + key composite unique)
 *
 * READ  : UserSetting(userId, key) takes precedence; falls back to Setting(key) default.
 *          System keys (role_permissions, custom_roles, demo_*, etc.) are ALWAYS global.
 * WRITE : System keys → Setting (global);  all other keys → UserSetting (per-user).
 *
 * This isolates each user's company data, theme, and business config so that
 * changing one user's data never affects other users.
 */

export async function GET(request: NextRequest) {
  try {
    // Authenticated users can read settings
    const authErr = requireAuth(request)
    if (authErr) return authErr

    const user = getServerUser(request)
    const userId = user?.id

    // NOTE: ensureSeedData() is intentionally NOT called on GET requests.
    // It runs table migrations, seed checks, and is very slow on PostgreSQL.
    // It should only run on POST (write) or via /api/health.

    const { searchParams } = new URL(request.url)
    const key = searchParams.get('key')

    if (key) {
      // Single-key read.
      // System keys: always read from global Setting.
      // Per-user keys: read UserSetting first; fall back to global Setting default.
      if (isSystemSettingKey(key) || !userId) {
        const setting = await db.setting.findUnique({ where: { key } })
        if (!setting) {
          return NextResponse.json({ key, value: null }, { status: 200 })
        }
        return NextResponse.json(setting, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
      }

      // Per-user: try user override first
      const userSetting = await db.userSetting.findUnique({
        where: { userId_key: { userId, key } },
      })
      if (userSetting) {
        return NextResponse.json(userSetting, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
      }

      // Fall back to global default (Setting)
      const globalSetting = await db.setting.findUnique({ where: { key } })
      if (globalSetting) {
        // Return as if it's the user's setting (same shape) so client code works unchanged
        return NextResponse.json(
          { key, value: globalSetting.value },
          { headers: { 'Cache-Control': 'no-store, max-age=0' } }
        )
      }
      return NextResponse.json({ key, value: null }, { status: 200 })
    }

    // Bulk read: merge global defaults + user overrides.
    // System keys come only from Setting; per-user keys: user override wins over global default.
    const [globalSettings, userSettings] = await Promise.all([
      db.setting.findMany(),
      userId ? db.userSetting.findMany({ where: { userId } }) : Promise.resolve([]),
    ])

    const merged: Record<string, { key: string; value: string }> = {}
    // 1) Start with global defaults (includes system keys)
    for (const s of globalSettings) {
      merged[s.key] = { key: s.key, value: s.value }
    }
    // 2) Override with user-specific settings (non-system keys only — system keys never have user overrides)
    for (const s of userSettings) {
      merged[s.key] = { key: s.key, value: s.value }
    }

    const result = Object.values(merged)
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
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

    const user = getServerUser(request)
    const userId = user?.id

    if (!userId) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 })
    }

    // Run seed/migration checks on write operations (less frequent, acceptable delay)
    await ensureSeedData(null)

    const body = await request.json()
    const { key, value } = body

    if (!key) {
      return NextResponse.json({ error: 'Key is required' }, { status: 400 })
    }

    // System keys: write to GLOBAL Setting (shared across all users)
    if (isSystemSettingKey(key)) {
      const setting = await db.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value: value || '' },
      })
      return NextResponse.json(setting)
    }

    // Per-user keys: write to UserSetting (isolated per user)
    const userSetting = await db.userSetting.upsert({
      where: { userId_key: { userId, key } },
      update: { value },
      create: { userId, key, value: value || '' },
    })

    // Return same shape as Setting (id, key, value, createdAt, updatedAt) for client compatibility
    return NextResponse.json({
      id: userSetting.id,
      key: userSetting.key,
      value: userSetting.value,
      createdAt: userSetting.createdAt,
      updatedAt: userSetting.updatedAt,
    })
  } catch (error) {
    console.error('Error saving setting:', error)
    return NextResponse.json({ error: 'Failed to save setting' }, { status: 500 })
  }
}
