import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeedData } from '@/lib/auto-seed'

// Public endpoint - no auth required for company branding & language
export async function GET() {
  try {
    // Auto-seed if tables are empty
    await ensureSeedData(null)

    const settings = await db.setting.findMany({
      where: {
        key: {
          in: ['company_name', 'company_logo', 'app_language', 'theme_login_color']
        }
      }
    })

    const result: Record<string, string | null> = {
      company_name: null,
      company_logo: null,
      app_language: null,
      theme_login_color: null,
    }

    for (const s of settings) {
      result[s.key] = s.value || null
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching public settings:', error)
    return NextResponse.json({ company_name: null, company_logo: null, app_language: null, theme_login_color: null }, { status: 200 })
  }
}
