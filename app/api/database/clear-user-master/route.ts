import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * POST /api/database/clear-user-master
 * Delete all master cetak data (papers, printingCosts, finishings, customers, riwayat)
 * for a specific userId OR for all non-admin users.
 * 
 * Body: { userId?: string, allNewAccounts?: boolean }
 * - userId: delete data for this specific user only
 * - allNewAccounts: delete data for ALL users that are NOT admin/superadmin
 */
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAdmin(request)
    if (authErr) return authErr

    const body = await request.json().catch(() => ({}))
    const { userId, allNewAccounts } = body

    // Admin IDs that should NEVER have their data deleted
    const adminIds = ['user-superadmin', 'user-admin']
    // Also find admin pengguna by role
    const adminPengguna = await db.pengguna.findMany({
      where: { role: { in: ['admin', 'superadmin'] } },
      select: { id: true }
    })
    const protectedIds = new Set([...adminIds, ...adminPengguna.map(p => p.id)])

    let targetUserIds: string[] = []

    if (userId) {
      // Delete data for specific user
      if (protectedIds.has(userId)) {
        return NextResponse.json({ error: 'Tidak dapat menghapus data admin' }, { status: 403 })
      }
      targetUserIds = [userId]
    } else if (allNewAccounts) {
      // Find all userIds that are NOT admin
      const allPaperUserIds = await db.paper.findMany({
        where: { userId: { not: null } },
        select: { userId: true },
        distinct: ['userId']
      })
      const allCostUserIds = await db.printingCost.findMany({
        where: { userId: { not: null } },
        select: { userId: true },
        distinct: ['userId']
      })
      const allFinishingUserIds = await db.finishing.findMany({
        where: { userId: { not: null } },
        select: { userId: true },
        distinct: ['userId']
      })
      const allCustomerUserIds = await db.customer.findMany({
        where: { userId: { not: null } },
        select: { userId: true },
        distinct: ['userId']
      })
      
      const allUserIds = new Set([
        ...allPaperUserIds.map(p => p.userId!),
        ...allCostUserIds.map(c => c.userId!),
        ...allFinishingUserIds.map(f => f.userId!),
        ...allCustomerUserIds.map(c => c.userId!),
      ])

      targetUserIds = [...allUserIds].filter(id => !protectedIds.has(id))
    } else {
      return NextResponse.json({ error: 'Parameter userId atau allNewAccounts diperlukan' }, { status: 400 })
    }

    const results: string[] = []

    for (const uid of targetUserIds) {
      // Delete riwayat first (they may reference master data)
      const delRiwayatCetakan = await db.riwayatCetakan.deleteMany({ where: { userId: uid } })
      const delRiwayatFinishing = await db.riwayatFinishing.deleteMany({ where: { userId: uid } })
      const delRiwayatOngkos = await db.riwayatOngkosCetak.deleteMany({ where: { userId: uid } })
      const delRiwayatHarga = await db.riwayatHargaKertas.deleteMany({ where: { userId: uid } })
      const delRiwayatPotong = await db.riwayatPotongKertas.deleteMany({ where: { userId: uid } })
      const delInvoice = await db.invoice.deleteMany({ where: { userId: uid } })
      const delSuratJalan = await db.suratJalan.deleteMany({ where: { userId: uid } })

      // Delete master data
      const delPapers = await db.paper.deleteMany({ where: { userId: uid } })
      const delCosts = await db.printingCost.deleteMany({ where: { userId: uid } })
      const delFinishings = await db.finishing.deleteMany({ where: { userId: uid } })
      const delCustomers = await db.customer.deleteMany({ where: { userId: uid } })

      // Set master_cleared flag to prevent auto-reseed
      await db.setting.upsert({
        where: { key: `master_cleared_${uid}` },
        update: { value: 'true' },
        create: { key: `master_cleared_${uid}`, value: 'true' },
      })

      results.push(
        `User ${uid}: ` +
        `papers=${delPapers.count}, costs=${delCosts.count}, ` +
        `finishings=${delFinishings.count}, customers=${delCustomers.count}, ` +
        `riwayat=${delRiwayatCetakan.count + delRiwayatFinishing.count + delRiwayatOngkos.count + delRiwayatHarga.count + delRiwayatPotong.count}, ` +
        `invoices=${delInvoice.count}, suratJalan=${delSuratJalan.count} ` +
        `[master_cleared flag set]`
      )
    }

    return NextResponse.json({
      success: true,
      deletedUsers: targetUserIds.length,
      results
    })
  } catch (error: any) {
    console.error('Clear user master error:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal menghapus data master') },
      { status: 500 }
    )
  }
}
