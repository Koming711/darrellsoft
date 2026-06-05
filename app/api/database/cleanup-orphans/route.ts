import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'

/**
 * POST /api/database/cleanup-orphans
 * Finds and removes orphaned records:
 * - Pengguna records that have no linked Pembeli AND no linked CalonPembeli (except admin/superadmin)
 * - Pembeli records that have a penggunaId pointing to a non-existent Pengguna
 * - CalonPembeli records that have a userId pointing to a non-existent Pengguna
 * 
 * Also supports targeted cleanup by passing { username: "aming" }
 */
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAdmin(request)
    if (authErr) return authErr

    const body = await request.json().catch(() => ({}))
    const { username } = body

    const results: string[] = []

    // 1. If username specified, clean up that specific user across all tables
    if (username) {
      // Delete from CalonPembeli
      const calon = await db.calonPembeli.findFirst({ where: { username } })
      if (calon) {
        // Unlink from Pengguna
        await db.calonPembeli.updateMany({
          where: { username },
          data: { userId: null }
        })
        await db.calonPembeli.delete({ where: { id: calon.id } })
        results.push(`Deleted CalonPembeli: ${calon.nama} (@${username})`)
      }

      // Find and delete from Pengguna
      const pengguna = await db.pengguna.findUnique({ where: { username } })
      if (pengguna && pengguna.username !== 'admin' && pengguna.username !== 'superadmin') {
        // Unlink CalonPembeli
        await db.calonPembeli.updateMany({
          where: { userId: pengguna.id },
          data: { userId: null }
        })

        // Delete linked Pembeli
        const linkedPembeli = await db.pembeli.findMany({
          where: { penggunaId: pengguna.id }
        })
        for (const p of linkedPembeli) {
          await db.pembeli.delete({ where: { id: p.id } })
          results.push(`Deleted linked Pembeli: ${p.nama}`)
        }

        await db.pengguna.delete({ where: { id: pengguna.id } })
        results.push(`Deleted Pengguna: ${pengguna.namaLengkap} (@${username})`)
      }

      // Find and delete from Pembeli by matching name
      const pembeliByName = await db.pembeli.findMany({
        where: { nama: { contains: username, mode: 'insensitive' } }
      })
      for (const p of pembeliByName) {
        // Check if this pembeli has a linked pengguna that still exists
        if (p.penggunaId) {
          const linkedPengguna = await db.pengguna.findUnique({ where: { id: p.penggunaId } })
          if (!linkedPengguna) {
            await db.pembeli.delete({ where: { id: p.id } })
            results.push(`Deleted orphaned Pembeli: ${p.nama} (penggunaId pointing to deleted record)`)
          }
        }
      }

      // Clean up session settings
      try {
        await db.setting.deleteMany({
          where: { key: `session_${username}` }
        })
        results.push(`Cleaned up session for @${username}`)
      } catch {}

      if (results.length === 0) {
        results.push(`No records found for username "${username}"`)
      }

      return NextResponse.json({ success: true, results })
    }

    // 2. General cleanup - find all orphaned Pengguna records
    const allPengguna = await db.pengguna.findMany()
    
    for (const p of allPengguna) {
      // Skip admin/superadmin
      if (p.username === 'admin' || p.username === 'superadmin') continue

      // Check if this Pengguna has a linked Pembeli
      const linkedPembeli = await db.pembeli.findFirst({
        where: { penggunaId: p.id }
      })

      // Check if this Pengguna has a linked CalonPembeli
      const linkedCalon = await db.calonPembeli.findFirst({
        where: { userId: p.id }
      })

      // If no linked records, it's orphaned
      if (!linkedPembeli && !linkedCalon) {
        // Also check by username in CalonPembeli
        const calonByUsername = p.username ? await db.calonPembeli.findFirst({
          where: { username: p.username }
        }) : null

        if (!calonByUsername) {
          // This is truly orphaned - delete it
          // Unlink any remaining CalonPembeli references
          await db.calonPembeli.updateMany({
            where: { userId: p.id },
            data: { userId: null }
          })
          await db.pengguna.delete({ where: { id: p.id } })
          results.push(`Deleted orphaned Pengguna: ${p.namaLengkap} (@${p.username})`)
        }
      }
    }

    // 3. Fix Pembeli records with invalid penggunaId
    const allPembeli = await db.pembeli.findMany({
      where: { penggunaId: { not: null } }
    })

    for (const p of allPembeli) {
      if (p.penggunaId) {
        const linkedPengguna = await db.pengguna.findUnique({
          where: { id: p.penggunaId }
        })
        if (!linkedPengguna) {
          await db.pembeli.update({
            where: { id: p.id },
            data: { penggunaId: null }
          })
          results.push(`Fixed Pembeli "${p.nama}" - removed invalid penggunaId`)
        }
      }
    }

    // 4. Fix CalonPembeli records with invalid userId
    const allCalon = await db.calonPembeli.findMany({
      where: { userId: { not: null } }
    })

    for (const c of allCalon) {
      if (c.userId) {
        const linkedPengguna = await db.pengguna.findUnique({
          where: { id: c.userId }
        })
        if (!linkedPengguna) {
          await db.calonPembeli.update({
            where: { id: c.id },
            data: { userId: null }
          })
          results.push(`Fixed CalonPembeli "${c.nama}" - removed invalid userId`)
        }
      }
    }

    if (results.length === 0) {
      results.push('No orphaned records found - database is clean!')
    }

    return NextResponse.json({ success: true, results })
  } catch (error: any) {
    console.error('Cleanup orphans error:', error)
    return NextResponse.json(
      { error: error?.message || 'Gagal membersihkan data orphaned' },
      { status: 500 }
    )
  }
}
