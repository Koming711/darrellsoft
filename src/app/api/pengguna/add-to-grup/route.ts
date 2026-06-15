import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getServerUser, requireAuth } from '@/lib/server-auth'

/**
 * POST /api/pengguna/add-to-grup
 * 
 * Allows an owner to add a second account (role: user) to their group.
 * Also allows admin/superadmin to add accounts to any owner's group.
 * The group must have available slots (current accounts < maxAccounts).
 * 
 * Body: { username: string, password: string, namaLengkap?: string, ownerId?: string }
 *   - If ownerId is provided and user is admin/superadmin, adds to that owner's group
 *   - Otherwise, adds to the requesting user's own group (must be owner)
 */
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr

    const user = getServerUser(request)!
    const body = await request.json()
    const { username, password, namaLengkap, ownerId } = body

    if (!username || !username.trim()) {
      return NextResponse.json({ error: 'Username wajib diisi' }, { status: 400 })
    }
    if (username.trim().length < 3) {
      return NextResponse.json({ error: 'Username minimal 3 karakter' }, { status: 400 })
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Password minimal 6 karakter' }, { status: 400 })
    }

    // Determine which owner's group to add to
    let ownerPengguna
    const isAdmin = user.role === 'superadmin' || user.role === 'admin'

    if (ownerId && isAdmin) {
      // Admin is adding to a specific owner's group
      ownerPengguna = await db.pengguna.findFirst({
        where: { id: ownerId, role: 'owner' },
        include: { grup: true },
      })
      if (!ownerPengguna) {
        return NextResponse.json({ error: 'Owner tidak ditemukan' }, { status: 404 })
      }
    } else {
      // Owner is adding to their own group
      ownerPengguna = await db.pengguna.findFirst({
        where: { username: user.username },
        include: { grup: true },
      })
    }

    if (!ownerPengguna) {
      return NextResponse.json({ error: 'Pengguna tidak ditemukan' }, { status: 404 })
    }

    if (ownerPengguna.role !== 'owner') {
      return NextResponse.json({ error: 'Hanya owner yang bisa menambahkan akun ke grup' }, { status: 403 })
    }

    if (!ownerPengguna.grupId || !ownerPengguna.grup) {
      return NextResponse.json({ error: 'Owner tidak memiliki grup. Tidak bisa menambahkan akun.' }, { status: 400 })
    }

    // Check if group has available slots
    const currentMembers = await db.pengguna.count({
      where: { grupId: ownerPengguna.grupId },
    })

    if (currentMembers >= ownerPengguna.grup.maxAccounts) {
      return NextResponse.json({ 
        error: `Grup sudah penuh (${currentMembers}/${ownerPengguna.grup.maxAccounts} akun). Tidak bisa menambahkan akun lagi.` 
      }, { status: 400 })
    }

    // Check if username is already taken
    const existingUser = await db.pengguna.findUnique({
      where: { username: username.trim() },
    })
    if (existingUser) {
      return NextResponse.json({ error: 'Username sudah digunakan' }, { status: 409 })
    }

    // Create the new user account in the same group
    const newUser = await db.pengguna.create({
      data: {
        namaLengkap: namaLengkap?.trim() || `Anggota ${username.trim()}`,
        nomorHP: ownerPengguna.nomorHP,
        email: `${username.trim()}@grup.${ownerPengguna.username}`,
        username: username.trim(),
        password: password,
        role: 'user',
        grupId: ownerPengguna.grupId,
        validUntil: ownerPengguna.validUntil, // Same expiry as owner
      },
    })

    // Also create a Pembeli record for the new user
    await db.pembeli.create({
      data: {
        nama: newUser.namaLengkap,
        nomorHP: newUser.nomorHP,
        email: newUser.email,
        alamat: '',
        catatan: `Anggota grup ${ownerPengguna.grup.nama} (User)`,
        role: 'user',
        expiredDate: ownerPengguna.validUntil,
        penggunaId: newUser.id,
        grupId: ownerPengguna.grupId,
      },
    })

    // Seed master data for the new user (copy from group members)
    try {
      const groupMembers = await db.pengguna.findMany({
        where: { grupId: ownerPengguna.grupId },
        select: { id: true },
      })
      const memberIds = groupMembers.map(m => m.id)
      if (memberIds.length > 0) {
        // Papers
        const papers = await db.paper.findMany({ where: { userId: { in: memberIds } }, take: 5 })
        for (const p of papers) {
          await db.paper.create({
            data: {
              name: p.name, grammage: p.grammage, width: p.width, height: p.height,
              pricePerRim: p.pricePerRim, userId: newUser.id,
            }
          })
        }
        // Printing costs
        const costs = await db.printingCost.findMany({ where: { userId: { in: memberIds } }, take: 5 })
        for (const c of costs) {
          await db.printingCost.create({
            data: {
              machineName: c.machineName, grammage: c.grammage, printAreaWidth: c.printAreaWidth,
              printAreaHeight: c.printAreaHeight, pricePerColor: c.pricePerColor,
              specialColorPrice: c.specialColorPrice, minimumPrintQuantity: c.minimumPrintQuantity,
              priceAboveMinimumPerSheet: c.priceAboveMinimumPerSheet, platePricePerSheet: c.platePricePerSheet,
              userId: newUser.id,
            }
          })
        }
        // Finishings
        const finishings = await db.finishing.findMany({ where: { userId: { in: memberIds } }, take: 5 })
        for (const f of finishings) {
          await db.finishing.create({
            data: {
              name: f.name, minimumSheets: f.minimumSheets, minimumPrice: f.minimumPrice,
              additionalPrice: f.additionalPrice, pricePerCm: f.pricePerCm, userId: newUser.id,
            }
          })
        }
      }
    } catch (seedErr) {
      console.error('Seed linked account error:', seedErr)
    }

    return NextResponse.json({
      success: true,
      message: `Akun @${username.trim()} berhasil ditambahkan ke grup`,
      pengguna: {
        id: newUser.id,
        namaLengkap: newUser.namaLengkap,
        username: newUser.username,
        role: newUser.role,
        grupId: newUser.grupId,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Add to grup error:', error)
    return NextResponse.json(
      { error: 'Gagal menambahkan akun ke grup' },
      { status: 500 }
    )
  }
}
