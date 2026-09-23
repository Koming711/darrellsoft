import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { phoneVariants } from '@/lib/phone'

const PHONE_REGEX = /^(\+62|62|0)[0-9]{8,13}$/

// GET /api/check-phone?phone=081234567890
// Returns { available: boolean, reason?: string, code?: string }
// Mirrors the phone-availability logic in /api/register so the UI and the
// final submission always agree.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const phone = (searchParams.get('phone') || '').trim()

  if (!phone) {
    return NextResponse.json(
      { available: false, reason: 'empty', code: 'PHONE_EMPTY' },
      { status: 400 }
    )
  }

  if (!PHONE_REGEX.test(phone.replace(/[\s\-]/g, ''))) {
    return NextResponse.json(
      { available: false, reason: 'invalid_format', code: 'PHONE_INVALID' },
      { status: 200 }
    )
  }

  try {
    const variants = phoneVariants(phone)

    const [existingCalon, existingPembeli, existingPengguna] = await Promise.all([
      db.calonPembeli.findFirst({ where: { nomorHP: { in: variants } } }),
      db.pembeli.findFirst({ where: { nomorHP: { in: variants } } }),
      db.pengguna.findFirst({ where: { nomorHP: { in: variants } } }),
    ])

    if (existingCalon || existingPembeli) {
      return NextResponse.json(
        { available: false, reason: 'phone_exists', code: 'PHONE_EXISTS' },
        { status: 200 }
      )
    }

    if (existingPengguna) {
      // Orphaned Pengguna (no linked Pembeli/CalonPembeli, non-admin)
      // doesn't block registration — same rule as /api/register.
      if (existingPengguna.role !== 'admin' && existingPengguna.role !== 'superadmin') {
        const [linkedPembeli, linkedCalon] = await Promise.all([
          db.pembeli.findFirst({ where: { penggunaId: existingPengguna.id } }),
          db.calonPembeli.findFirst({ where: { userId: existingPengguna.id } }),
        ])
        if (!linkedPembeli && !linkedCalon) {
          return NextResponse.json({ available: true }, { status: 200 })
        }
      }
      return NextResponse.json(
        { available: false, reason: 'phone_exists', code: 'PHONE_EXISTS' },
        { status: 200 }
      )
    }

    return NextResponse.json({ available: true }, { status: 200 })
  } catch (error) {
    console.error('check-phone error:', error)
    return NextResponse.json(
      { available: false, reason: 'server_error', code: 'SERVER_ERROR' },
      { status: 500 }
    )
  }
}
