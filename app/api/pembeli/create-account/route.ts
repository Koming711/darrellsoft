import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server-auth'

export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr

    const body = await request.json()
    const { pembeliId, username, password } = body

    if (!pembeliId || !username || !password) {
      return NextResponse.json(
        { error: 'ID pembeli, username, dan password wajib diisi' },
        { status: 400 }
      )
    }

    if (username.trim().length < 3) {
      return NextResponse.json(
        { error: 'Username minimal 3 karakter' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password minimal 6 karakter' },
        { status: 400 }
      )
    }

    // 1. Get the Pembeli
    const pembeli = await db.pembeli.findUnique({
      where: { id: pembeliId }
    })

    if (!pembeli) {
      return NextResponse.json(
        { error: 'Pembeli tidak ditemukan' },
        { status: 404 }
      )
    }

    // 2. Check if username already exists in Pengguna
    const existingPengguna = await db.pengguna.findUnique({
      where: { username: username.trim() }
    })

    if (existingPengguna) {
      return NextResponse.json(
        { error: 'Username sudah digunakan oleh akun lain' },
        { status: 409 }
      )
    }

    // 3. Create Pengguna record
    const newPengguna = await db.pengguna.create({
      data: {
        namaLengkap: pembeli.nama,
        nomorHP: pembeli.nomorHP,
        email: pembeli.email || '',
        username: username.trim(),
        password: password,
        role: pembeli.role || 'user',
        validUntil: pembeli.expiredDate || null,
      }
    })

    // 4. Link the Pengguna to the Pembeli
    await db.pembeli.update({
      where: { id: pembeliId },
      data: { penggunaId: newPengguna.id }
    })

    return NextResponse.json({
      success: true,
      message: `Akun login @${username.trim()} berhasil dibuat untuk "${pembeli.nama}"`,
      penggunaId: newPengguna.id,
      username: newPengguna.username,
    })
  } catch (error) {
    console.error('Create account for pembeli error:', error)
    return NextResponse.json(
      { error: 'Gagal membuat akun login' },
      { status: 500 }
    )
  }
}
