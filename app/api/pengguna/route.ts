// v2 - CRUD pengguna (admin-only)
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { ensureSeedData } from '@/lib/auto-seed'

export async function GET(request: NextRequest) {
  try {
    // Only admin can list all users
    const authErr = requireAdmin(request)
    if (authErr) return authErr

    // Auto-seed global data only (settings, pengguna — no per-user master data seed)
    await ensureSeedData(null)

    const pengguna = await db.pengguna.findMany({
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json(pengguna, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    })
  } catch (error) {
    console.error('Get pengguna error:', error)
    return NextResponse.json(
      { error: 'Gagal mengambil data pengguna' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // Only admin can create users
    const authErr = requireAdmin(request)
    if (authErr) return authErr

    const body = await request.json()
    const { namaLengkap, nomorHP, email, username, password, role, validUntil: passedValidUntil } = body

    if (!namaLengkap || !username || !password || !role) {
      return NextResponse.json(
        { error: 'Nama lengkap, username, password dan role wajib diisi' },
        { status: 400 }
      )
    }

    // Cek duplikat username
    const existing = await db.pengguna.findUnique({
      where: { username }
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Username sudah digunakan' },
        { status: 409 }
      )
    }

    // Gunakan validUntil yang dikirim, atau default 1 tahun
    const validUntil = passedValidUntil ? new Date(passedValidUntil) : (() => {
      const d = new Date()
      d.setFullYear(d.getFullYear() + 1)
      return d
    })()

    const pengguna = await db.pengguna.create({
      data: {
        namaLengkap,
        nomorHP: nomorHP || '',
        email: email || '',
        username,
        password,
        role,
        validUntil,
      }
    })

    return NextResponse.json(pengguna, { status: 201 })
  } catch (error) {
    console.error('Create pengguna error:', error)
    return NextResponse.json(
      { error: 'Gagal menambahkan pengguna' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Only admin can delete users
    const authErr = requireAdmin(request)
    if (authErr) return authErr

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'ID pengguna diperlukan' },
        { status: 400 }
      )
    }

    // Cek apakah username admin
    const pengguna = await db.pengguna.findUnique({
      where: { id }
    })

    if (!pengguna) {
      return NextResponse.json(
        { error: 'Pengguna tidak ditemukan' },
        { status: 404 }
      )
    }

    if (pengguna.username === 'admin' || pengguna.username === 'superadmin') {
      return NextResponse.json(
        { error: 'Tidak dapat menghapus user ini' },
        { status: 403 }
      )
    }

    // Clean up linked records before deleting Pengguna
    // 1. Unlink any CalonPembeli that reference this Pengguna
    await db.calonPembeli.updateMany({
      where: { userId: id },
      data: { userId: null }
    })

    // 2. Delete any Pembeli records linked to this Pengguna (for non-admin users)
    if (pengguna.role !== 'admin' && pengguna.role !== 'superadmin') {
      const linkedPembeli = await db.pembeli.findMany({
        where: { penggunaId: id }
      })
      for (const p of linkedPembeli) {
        await db.pembeli.delete({ where: { id: p.id } })
      }
    } else {
      // For admin users, just unlink the pembeli
      await db.pembeli.updateMany({
        where: { penggunaId: id },
        data: { penggunaId: null }
      })
    }

    await db.pengguna.delete({
      where: { id }
    })

    return NextResponse.json(
      { message: 'Pengguna berhasil dihapus' },
      { status: 200 }
    )
  } catch (error) {
    console.error('Delete pengguna error:', error)
    return NextResponse.json(
      { error: 'Gagal menghapus pengguna' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Only admin can edit users
    const authErr = requireAdmin(request)
    if (authErr) return authErr

    const body = await request.json()
    const { id, namaLengkap, nomorHP, email, username, password, role, validUntil } = body

    if (!id) {
      return NextResponse.json(
        { error: 'ID pengguna diperlukan' },
        { status: 400 }
      )
    }

    const existing = await db.pengguna.findUnique({
      where: { id }
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Pengguna tidak ditemukan' },
        { status: 404 }
      )
    }

    // Cek duplikat username jika diubah
    if (username && username !== existing.username) {
      const duplicate = await db.pengguna.findUnique({
        where: { username }
      })
      if (duplicate) {
        return NextResponse.json(
          { error: 'Username sudah digunakan' },
          { status: 409 }
        )
      }
    }

    const updateData: Record<string, any> = {}
    if (namaLengkap) updateData.namaLengkap = namaLengkap
    if (nomorHP !== undefined) updateData.nomorHP = nomorHP
    if (email !== undefined) updateData.email = email
    if (username) updateData.username = username
    if (password) updateData.password = password
    if (role) updateData.role = role
    if (validUntil !== undefined) updateData.validUntil = validUntil ? new Date(validUntil) : null

    const updated = await db.pengguna.update({
      where: { id },
      data: updateData
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Update pengguna error:', error)
    return NextResponse.json(
      { error: 'Gagal mengupdate pengguna' },
      { status: 500 }
    )
  }
}
