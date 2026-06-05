import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getServerUser, requireAuth, isAdmin } from '@/lib/server-auth'

export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    if (!isAdmin(user.role)) {
      return NextResponse.json({ error: 'Hanya admin yang dapat menambahkan akun' }, { status: 403 })
    }

    const body = await request.json()
    const { pembeliId, username, password, role, expiredDate } = body

    if (!pembeliId || !username || !password) {
      return NextResponse.json(
        { error: 'Pembeli ID, username, dan password wajib diisi' },
        { status: 400 }
      )
    }

    // Check if pembeli exists
    const pembeli = await db.pembeli.findUnique({
      where: { id: pembeliId }
    })

    if (!pembeli) {
      return NextResponse.json(
        { error: 'Pembeli tidak ditemukan' },
        { status: 404 }
      )
    }

    // Check duplicate username
    const existingPengguna = await db.pengguna.findUnique({
      where: { username }
    })

    if (existingPengguna) {
      return NextResponse.json(
        { error: 'Username sudah digunakan' },
        { status: 409 }
      )
    }

    // Create Pengguna (login account)
    const newPengguna = await db.pengguna.create({
      data: {
        namaLengkap: pembeli.nama,
        nomorHP: pembeli.nomorHP,
        email: pembeli.email,
        username: username.trim(),
        password,
        role: role || pembeli.role || 'demo',
        validUntil: expiredDate ? new Date(expiredDate) : null,
      }
    })

    // Link the Pengguna to the Pembeli
    await db.pembeli.update({
      where: { id: pembeliId },
      data: { penggunaId: newPengguna.id }
    })

    return NextResponse.json({
      pengguna: newPengguna,
      message: 'Akun berhasil ditambahkan',
    }, { status: 201 })
  } catch (error) {
    console.error('Add account to pembeli error:', error)
    return NextResponse.json(
      { error: 'Gagal menambahkan akun' },
      { status: 500 }
    )
  }
}
