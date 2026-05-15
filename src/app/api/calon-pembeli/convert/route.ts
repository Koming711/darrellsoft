import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getServerUser, requireAuth } from '@/lib/server-auth'

export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const body = await request.json()
    const { calonId } = body

    if (!calonId) {
      return NextResponse.json(
        { error: 'ID calon pembeli diperlukan' },
        { status: 400 }
      )
    }

    // 1. Get the CalonPembeli data
    const calon = await db.calonPembeli.findUnique({
      where: { id: calonId }
    })

    if (!calon) {
      return NextResponse.json(
        { error: 'Calon pembeli tidak ditemukan' },
        { status: 404 }
      )
    }

    // 2. Set role = "user" dan expiredDate = 1 tahun dari sekarang
    const newRole = 'user'
    const newExpiredDate = new Date()
    newExpiredDate.setFullYear(newExpiredDate.getFullYear() + 1)

    // 3. Create Pembeli record
    const pembeli = await db.pembeli.create({
      data: {
        nama: calon.nama,
        nomorHP: calon.nomorHP,
        email: calon.email || '',
        alamat: calon.alamat || '',
        catatan: `Dikonversi dari calon pembeli. ${calon.catatan || ''}`,
        role: newRole,
        expiredDate: newExpiredDate,
        userId: user?.id || null,
      }
    })

    // 4. If CalonPembeli has username & password, create a Pengguna (login account)
    let penggunaId: string | null = null
    if (calon.username && calon.password) {
      // Check if username already exists in Pengguna
      const existingPengguna = await db.pengguna.findUnique({
        where: { username: calon.username }
      })

      if (!existingPengguna) {
        // Ensure email is unique for Pengguna (email has @unique constraint)
        let penggunaEmail = (calon.email && calon.email.trim()) ? calon.email.trim() : `${calon.username}@local`
        try {
          const emailExists = await db.pengguna.findUnique({
            where: { email: penggunaEmail }
          })
          if (emailExists) {
            // Append timestamp to make email unique
            penggunaEmail = `${calon.username}_${Date.now()}@local`
          }
        } catch {
          // findUnique may fail on empty email in some edge cases
          penggunaEmail = `${calon.username}_${Date.now()}@local`
        }

        const newPengguna = await db.pengguna.create({
          data: {
            namaLengkap: calon.nama,
            nomorHP: calon.nomorHP,
            email: penggunaEmail,
            username: calon.username,
            password: calon.password,
            role: newRole,
            validUntil: newExpiredDate,
          }
        })
        penggunaId = newPengguna.id

        // Link the Pengguna to the Pembeli
        await db.pembeli.update({
          where: { id: pembeli.id },
          data: { penggunaId }
        })
      } else {
        penggunaId = existingPengguna.id
        // Update existing pengguna role and validUntil
        await db.pengguna.update({
          where: { id: existingPengguna.id },
          data: { role: newRole, validUntil: newExpiredDate }
        })
        await db.pembeli.update({
          where: { id: pembeli.id },
          data: { penggunaId }
        })
      }
    }

    // 5. Disconnect CalonPembeli from Pengguna (clear userId) before deleting
    try {
      await db.calonPembeli.update({
        where: { id: calonId },
        data: { userId: null }
      })
    } catch {}

    // 6. Delete the CalonPembeli
    await db.calonPembeli.delete({
      where: { id: calonId }
    })

    return NextResponse.json({
      pembeli,
      penggunaId,
      hasLoginAccount: !!penggunaId,
    }, { status: 200 })
  } catch (error: any) {
    console.error('Convert calon pembeli error:', error)
    const message = error?.message || 'Gagal mengkonversi calon pembeli'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
