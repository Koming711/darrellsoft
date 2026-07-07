import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getServerUser, requireAuth } from '@/lib/server-auth'

// GET /api/pengguna/linked-accounts?userId=xxx — Get all linked accounts for a user
export async function GET(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    if (user.role !== 'superadmin' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    if (!userId) {
      return NextResponse.json({ error: 'userId diperlukan' }, { status: 400 })
    }

    const pengguna = await db.pengguna.findUnique({
      where: { id: userId },
      select: { id: true, grupId: true, namaLengkap: true, username: true },
    })
    if (!pengguna) {
      return NextResponse.json({ error: 'Pengguna tidak ditemukan' }, { status: 404 })
    }

    if (!pengguna.grupId) {
      return NextResponse.json({ grupId: null, members: [pengguna] })
    }

    const members = await db.pengguna.findMany({
      where: { grupId: pengguna.grupId },
      select: {
        id: true,
        namaLengkap: true,
        nomorHP: true,
        email: true,
        username: true,
        role: true,
        grupId: true,
        validUntil: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    // Also get the Grup info
    const grup = await db.grup.findUnique({
      where: { id: pengguna.grupId },
      select: { id: true, nama: true },
    })

    return NextResponse.json({ grupId: pengguna.grupId, grup, members })
  } catch (error) {
    console.error('Get linked accounts error:', error)
    return NextResponse.json({ error: 'Gagal mengambil data' }, { status: 500 })
  }
}

// POST /api/pengguna/linked-accounts — Add a linked account to a user's group
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    if (user.role !== 'superadmin' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    const body = await request.json()
    const { parentUserId, namaLengkap, nomorHP, email, username, password, role, validUntil } = body

    if (!parentUserId || !namaLengkap || !username || !password) {
      return NextResponse.json({ error: 'Data wajib: parentUserId, nama, username, password' }, { status: 400 })
    }

    // Check parent exists
    const parent = await db.pengguna.findUnique({
      where: { id: parentUserId },
      select: { id: true, grupId: true },
    })
    if (!parent) {
      return NextResponse.json({ error: 'Pengguna induk tidak ditemukan' }, { status: 404 })
    }

    // Check username not taken
    const existing = await db.pengguna.findUnique({ where: { username } })
    if (existing) {
      return NextResponse.json({ error: 'Username sudah digunakan' }, { status: 409 })
    }

    // Get or create Grup
    let grupId = parent.grupId
    if (!grupId) {
      // Create a new grup for this parent
      const grup = await db.grup.create({
        data: { nama: `Grup ${username}` },
      })
      grupId = grup.id
      // Assign grupId to parent
      await db.pengguna.update({
        where: { id: parentUserId },
        data: { grupId },
      })
    }

    // Create new linked account
    const linked = await db.pengguna.create({
      data: {
        namaLengkap,
        nomorHP: nomorHP || '',
        email: email || '',
        username,
        password,
        role: role || 'user',
        grupId,
        validUntil: validUntil ? new Date(validUntil) : null,
      },
    })

    // Seed master data for the new user (copy from parent's group)
    try {
      const groupMembers = await db.pengguna.findMany({
        where: { grupId },
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
              pricePerRim: p.pricePerRim, userId: linked.id,
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
              userId: linked.id,
            }
          })
        }
        // Finishings
        const finishings = await db.finishing.findMany({ where: { userId: { in: memberIds } }, take: 5 })
        for (const f of finishings) {
          await db.finishing.create({
            data: {
              name: f.name, minimumSheets: f.minimumSheets, minimumPrice: f.minimumPrice,
              additionalPrice: f.additionalPrice, pricePerCm: f.pricePerCm, userId: linked.id,
            }
          })
        }
      }
    } catch (seedErr) {
      console.error('Seed linked account error:', seedErr)
    }

    return NextResponse.json(linked, { status: 201 })
  } catch (error) {
    console.error('Add linked account error:', error)
    return NextResponse.json({ error: 'Gagal menambahkan akun terhubung' }, { status: 500 })
  }
}

// DELETE /api/pengguna/linked-accounts?userId=xxx&unlinkUserId=xxx — Remove a linked account from group
export async function DELETE(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    if (user.role !== 'superadmin' && user.role !== 'admin') {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('unlinkUserId')
    if (!userId) {
      return NextResponse.json({ error: 'unlinkUserId diperlukan' }, { status: 400 })
    }

    const pengguna = await db.pengguna.findUnique({
      where: { id: userId },
      select: { id: true, grupId: true, username: true },
    })
    if (!pengguna) {
      return NextResponse.json({ error: 'Pengguna tidak ditemukan' }, { status: 404 })
    }

    if (!pengguna.grupId) {
      return NextResponse.json({ error: 'Akun ini tidak terhubung dengan grup manapun' }, { status: 400 })
    }

    // Remove grupId from the user (unlink from group)
    await db.pengguna.update({
      where: { id: userId },
      data: { grupId: null },
    })

    return NextResponse.json({ message: `Akun "${pengguna.username}" berhasil diputus dari grup` })
  } catch (error) {
    console.error('Unlink account error:', error)
    return NextResponse.json({ error: 'Gagal memutus akun terhubung' }, { status: 500 })
  }
}
