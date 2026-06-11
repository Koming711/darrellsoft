import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server-auth'

/**
 * GET /api/grup
 * Returns all groups with their member count and maxAccounts info.
 * Available to any authenticated user.
 */
export async function GET(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr

    const grups = await db.grup.findMany({
      include: {
        pengguna: {
          select: {
            id: true,
            namaLengkap: true,
            username: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const result = grups.map(g => ({
      id: g.id,
      nama: g.nama,
      maxAccounts: g.maxAccounts,
      currentMembers: g.pengguna.length,
      availableSlots: g.maxAccounts - g.pengguna.length,
      members: g.pengguna,
      createdAt: g.createdAt,
    }))

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error) {
    console.error('Get grup error:', error)
    return NextResponse.json(
      { error: 'Gagal mengambil data grup' },
      { status: 500 }
    )
  }
}
