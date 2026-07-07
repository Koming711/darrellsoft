import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getServerUser, requireAuth, isAdmin } from '@/lib/server-auth'

export async function GET(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    if (!isAdmin(user.role)) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const pembeliId = searchParams.get('pembeliId')

    if (!pembeliId) {
      return NextResponse.json(
        { error: 'Pembeli ID diperlukan' },
        { status: 400 }
      )
    }

    // Find the pembeli to get penggunaId
    const pembeli = await db.pembeli.findUnique({
      where: { id: pembeliId },
      select: { penggunaId: true, nama: true, nomorHP: true }
    })

    if (!pembeli) {
      return NextResponse.json({ error: 'Pembeli tidak ditemukan' }, { status: 404 })
    }

    // If linked via penggunaId, get that account
    if (pembeli.penggunaId) {
      const linkedAccount = await db.pengguna.findUnique({
        where: { id: pembeli.penggunaId },
        select: {
          id: true,
          username: true,
          namaLengkap: true,
          role: true,
          validUntil: true,
          createdAt: true,
        }
      })
      return NextResponse.json(linkedAccount ? [linkedAccount] : [])
    }

    // Fallback: match by nama + nomorHP
    const matchAccounts = await db.pengguna.findMany({
      where: {
        namaLengkap: pembeli.nama,
        nomorHP: pembeli.nomorHP,
      },
      select: {
        id: true,
        username: true,
        namaLengkap: true,
        role: true,
        validUntil: true,
        createdAt: true,
      }
    })

    return NextResponse.json(matchAccounts)
  } catch (error) {
    console.error('Get linked accounts error:', error)
    return NextResponse.json(
      { error: 'Gagal mengambil data akun terhubung' },
      { status: 500 }
    )
  }
}
