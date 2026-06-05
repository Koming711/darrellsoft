import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getServerUser, getDataFilter, isAdmin, requireAuth } from '@/lib/server-auth'

export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    // Admin can see ALL calon pembeli (to manage/approve registrations)
    // Regular users can only see their own
    const whereFilter = user && isAdmin(user.role) ? {} : await getDataFilter(user)
    const list = await db.calonPembeli.findMany({
      where: whereFilter,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        nama: true,
        nomorHP: true,
        email: true,
        alamat: true,
        catatan: true,
        status: true,
        role: true,
        expiredDate: true,
        username: true,
        createdAt: true,
        updatedAt: true,
      }
    })
    return NextResponse.json(list, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    })
  } catch (error) {
    console.error('Get calon pembeli error:', error)
    return NextResponse.json(
      { error: 'Gagal mengambil data calon pembeli' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const { nama, nomorHP, email, alamat, catatan, status, role, expiredDate, username } = body

    if (!nama || !nomorHP) {
      return NextResponse.json(
        { error: 'Nama dan nomor HP wajib diisi' },
        { status: 400 }
      )
    }

    const calon = await db.calonPembeli.create({
      data: {
        nama,
        nomorHP,
        email: email || '',
        alamat: alamat || '',
        catatan: catatan || '',
        status: status || 'baru',
        role: role || 'demo',
        expiredDate: expiredDate ? new Date(expiredDate) : null,
        username: username || null,
        userId: user?.id || null,
      }
    })

    return NextResponse.json(calon, { status: 201 })
  } catch (error) {
    console.error('Create calon pembeli error:', error)
    return NextResponse.json(
      { error: 'Gagal menambahkan calon pembeli' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'ID calon pembeli diperlukan' },
        { status: 400 }
      )
    }

    const existing = await db.calonPembeli.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Calon pembeli tidak ditemukan' },
        { status: 404 }
      )
    }

    // Admin can delete any calon pembeli, regular users only their own
    if (!isAdmin(user.role) && existing.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    // If this CalonPembeli has username/password, also delete linked Pengguna to prevent orphaned accounts
    if (existing.username) {
      try {
        const linkedPengguna = await db.pengguna.findUnique({
          where: { username: existing.username }
        })
        if (linkedPengguna && linkedPengguna.username !== 'admin' && linkedPengguna.username !== 'superadmin') {
          // Unlink CalonPembeli references first
          await db.calonPembeli.updateMany({
            where: { userId: linkedPengguna.id },
            data: { userId: null }
          })
          await db.pengguna.delete({ where: { id: linkedPengguna.id } })
        }
      } catch (err) {
        console.error('Delete linked pengguna from calon error:', err)
      }
    }

    await db.calonPembeli.delete({ where: { id } })

    return NextResponse.json(
      { message: 'Calon pembeli berhasil dihapus' },
      { status: 200 }
    )
  } catch (error) {
    console.error('Delete calon pembeli error:', error)
    return NextResponse.json(
      { error: 'Gagal menghapus calon pembeli' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const { id, nama, nomorHP, email, alamat, catatan, status, role, expiredDate, username } = body

    if (!id) {
      return NextResponse.json(
        { error: 'ID calon pembeli diperlukan' },
        { status: 400 }
      )
    }

    const existing = await db.calonPembeli.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Calon pembeli tidak ditemukan' },
        { status: 404 }
      )
    }

    // Admin can edit any calon pembeli, regular users only their own
    if (!isAdmin(user.role) && existing.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    const updateData: Record<string, any> = {}
    if (nama !== undefined) updateData.nama = nama
    if (nomorHP !== undefined) updateData.nomorHP = nomorHP
    if (email !== undefined) updateData.email = email
    if (alamat !== undefined) updateData.alamat = alamat
    if (catatan !== undefined) updateData.catatan = catatan
    if (status !== undefined) updateData.status = status
    if (role !== undefined) updateData.role = role
    if (expiredDate !== undefined) updateData.expiredDate = expiredDate ? new Date(expiredDate) : null
    if (username !== undefined) updateData.username = username || null

    const updated = await db.calonPembeli.update({
      where: { id },
      data: updateData
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Update calon pembeli error:', error)
    return NextResponse.json(
      { error: 'Gagal mengupdate calon pembeli' },
      { status: 500 }
    )
  }
}
