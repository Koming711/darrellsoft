import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/check-username?username=xxx
// Returns { available: boolean, reason?: string, code?: string }
// Mirrors the username-availability logic in /api/register (incl. orphan cleanup).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const username = (searchParams.get('username') || '').trim()

  if (!username) {
    return NextResponse.json(
      { available: false, reason: 'empty', code: 'USERNAME_EMPTY' },
      { status: 400 }
    )
  }

  if (username.length < 3) {
    return NextResponse.json(
      { available: false, reason: 'too_short', code: 'USERNAME_TOO_SHORT' },
      { status: 400 }
    )
  }

  try {
    // 1. CalonPembeli
    const existingCalon = await db.calonPembeli.findFirst({ where: { username } })
    if (existingCalon) {
      return NextResponse.json(
        { available: false, reason: 'calon_exists', code: 'USERNAME_EXISTS' },
        { status: 200 }
      )
    }

    // 2. Pengguna (namespace pengelola — akun tanpa grup; anggota grup punya
    // ruang nama sendiri, tidak menghalangi pendaftaran pengelola)
    const existingUser = await db.pengguna.findFirst({ where: { username, grupId: null } })
    if (existingUser) {
      // READ-ONLY: endpoint publik tidak boleh punya efek samping menghapus data.
      // Pembersihan orphan Pengguna hanya dilakukan saat register (server, tervalidasi).
      return NextResponse.json(
        { available: false, reason: 'pengguna_exists', code: 'USERNAME_EXISTS' },
        { status: 200 }
      )
    }

    return NextResponse.json({ available: true }, { status: 200 })
  } catch (error) {
    console.error('check-username error:', error)
    return NextResponse.json(
      { available: false, reason: 'server_error', code: 'SERVER_ERROR' },
      { status: 500 }
    )
  }
}
