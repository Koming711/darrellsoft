import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getServerUser, getDataFilter, isAdmin, requireAuth } from '@/lib/server-auth'

export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    // Admin can see ALL pembeli (same as calon pembeli)
    // Regular users can only see their own
    const whereFilter = user && isAdmin(user.role) ? {} : await getDataFilter(user)
    const pembeliList = await db.pembeli.findMany({
      where: whereFilter,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        nama: true,
        nomorHP: true,
        email: true,
        alamat: true,
        catatan: true,
        role: true,
        expiredDate: true,
        userId: true,
        penggunaId: true,
        grupId: true,
        createdAt: true,
        updatedAt: true,
      }
    })

    // Enrich with linked Pengguna username
    const list = await Promise.all(pembeliList.map(async (p) => {
      let penggunaUsername: string | null = null
      if (p.penggunaId) {
        const pengguna = await db.pengguna.findUnique({
          where: { id: p.penggunaId },
          select: { username: true }
        })
        penggunaUsername = pengguna?.username || null
      }
      // Fallback: match by nama + nomorHP in Pengguna table
      if (!penggunaUsername) {
        const match = await db.pengguna.findFirst({
          where: { namaLengkap: p.nama, nomorHP: p.nomorHP },
          select: { username: true, id: true }
        })
        if (match) {
          penggunaUsername = match.username
          // Auto-link the penggunaId if not yet linked
          try {
            await db.pembeli.update({
              where: { id: p.id },
              data: { penggunaId: match.id }
            })
          } catch {}
        }
      }
      return { ...p, penggunaUsername }
    }))

    return NextResponse.json(list, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    })
  } catch (error) {
    console.error('Get pembeli error:', error)
    return NextResponse.json(
      { error: 'Gagal mengambil data pembeli' },
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
    const { nama, nomorHP, email, alamat, catatan, role, expiredDate, username } = body

    if (!nama || !nomorHP) {
      return NextResponse.json(
        { error: 'Nama dan nomor HP wajib diisi' },
        { status: 400 }
      )
    }

    const pembeli = await db.pembeli.create({
      data: {
        nama,
        nomorHP,
        email: email || '',
        alamat: alamat || '',
        catatan: catatan || '',
        role: role || 'demo',
        expiredDate: expiredDate ? new Date(expiredDate) : null,
        userId: user?.id || null,
      }
    })

    // If username provided, create or link a Pengguna account
    if (username && username.trim()) {
      try {
        const existingPengguna = await db.pengguna.findUnique({
          where: { username: username.trim() }
        })
        if (existingPengguna) {
          await db.pembeli.update({
            where: { id: pembeli.id },
            data: { penggunaId: existingPengguna.id }
          })
        } else {
          const newPengguna = await db.pengguna.create({
            data: {
              namaLengkap: nama,
              nomorHP: nomorHP || '',
              email: email || '',
              username: username.trim(),
              password: 'changeme',
              role: role || 'demo',
            }
          })
          await db.pembeli.update({
            where: { id: pembeli.id },
            data: { penggunaId: newPengguna.id }
          })
        }
      } catch (err) {
        console.error('Link username to pembeli error:', err)
      }
    }

    return NextResponse.json(pembeli, { status: 201 })
  } catch (error) {
    console.error('Create pembeli error:', error)
    return NextResponse.json(
      { error: 'Gagal menambahkan pembeli' },
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
        { error: 'ID pembeli diperlukan' },
        { status: 400 }
      )
    }

    const existing = await db.pembeli.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Pembeli tidak ditemukan' },
        { status: 404 }
      )
    }

    // Admin can delete any pembeli, regular users only their own
    if (!isAdmin(user.role) && existing.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    // Also delete linked Pengguna record (if not admin/superadmin) to prevent orphaned accounts
    if (existing.penggunaId) {
      try {
        const linkedPengguna = await db.pengguna.findUnique({ where: { id: existing.penggunaId } })
        if (linkedPengguna && linkedPengguna.username !== 'admin' && linkedPengguna.username !== 'superadmin') {
          // First, unlink any CalonPembeli that reference this Pengguna
          await db.calonPembeli.updateMany({
            where: { userId: linkedPengguna.id },
            data: { userId: null }
          })
          await db.pengguna.delete({ where: { id: existing.penggunaId } })
        }
      } catch (err) {
        console.error('Delete linked pengguna error:', err)
      }
    }

    // Also check by name+phone for unlinked but matching Pengguna
    try {
      const matchPengguna = await db.pengguna.findFirst({
        where: { namaLengkap: existing.nama, nomorHP: existing.nomorHP }
      })
      if (matchPengguna && matchPengguna.username !== 'admin' && matchPengguna.username !== 'superadmin') {
        // Verify this Pengguna has no other Pembeli records
        const otherPembeli = await db.pembeli.findFirst({
          where: { penggunaId: matchPengguna.id, id: { not: id } }
        })
        if (!otherPembeli) {
          await db.calonPembeli.updateMany({
            where: { userId: matchPengguna.id },
            data: { userId: null }
          })
          await db.pengguna.delete({ where: { id: matchPengguna.id } })
        }
      }
    } catch (err) {
      console.error('Delete matching pengguna error:', err)
    }

    await db.pembeli.delete({ where: { id } })

    return NextResponse.json(
      { message: 'Pembeli berhasil dihapus' },
      { status: 200 }
    )
  } catch (error) {
    console.error('Delete pembeli error:', error)
    return NextResponse.json(
      { error: 'Gagal menghapus pembeli' },
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
    const { id, nama, nomorHP, email, alamat, catatan, role, expiredDate, username } = body

    if (!id) {
      return NextResponse.json(
        { error: 'ID pembeli diperlukan' },
        { status: 400 }
      )
    }

    const existing = await db.pembeli.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Pembeli tidak ditemukan' },
        { status: 404 }
      )
    }

    // Admin can edit any pembeli, regular users only their own
    if (!isAdmin(user.role) && existing.userId !== user?.id) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    const updateData: Record<string, any> = {}
    if (nama !== undefined) updateData.nama = nama
    if (nomorHP !== undefined) updateData.nomorHP = nomorHP
    if (email !== undefined) updateData.email = email
    if (alamat !== undefined) updateData.alamat = alamat
    if (catatan !== undefined) updateData.catatan = catatan
    if (role !== undefined) updateData.role = role
    if (expiredDate !== undefined) updateData.expiredDate = expiredDate ? new Date(expiredDate) : null

    // Handle username update - create or link Pengguna
    if (username !== undefined && username) {
      const trimmedUsername = username.trim()
      if (existing.penggunaId) {
        const linkedPengguna = await db.pengguna.findUnique({ where: { id: existing.penggunaId } })
        if (linkedPengguna) {
          await db.pengguna.update({
            where: { id: linkedPengguna.id },
            data: { username: trimmedUsername, namaLengkap: nama || linkedPengguna.namaLengkap }
          })
        } else {
          const newPengguna = await db.pengguna.create({
            data: {
              namaLengkap: nama || existing.nama,
              nomorHP: nomorHP || existing.nomorHP,
              email: email || existing.email,
              username: trimmedUsername,
              password: 'changeme',
              role: role || existing.role,
            }
          })
          updateData.penggunaId = newPengguna.id
        }
      } else {
        const existingPengguna = await db.pengguna.findUnique({ where: { username: trimmedUsername } })
        if (existingPengguna) {
          updateData.penggunaId = existingPengguna.id
        } else {
          const newPengguna = await db.pengguna.create({
            data: {
              namaLengkap: nama || existing.nama,
              nomorHP: nomorHP || existing.nomorHP,
              email: email || existing.email,
              username: trimmedUsername,
              password: 'changeme',
              role: role || existing.role,
            }
          })
          updateData.penggunaId = newPengguna.id
        }
      }
    }

    const updated = await db.pembeli.update({
      where: { id },
      data: updateData
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Update pembeli error:', error)
    return NextResponse.json(
      { error: 'Gagal mengupdate pembeli' },
      { status: 500 }
    )
  }
}
