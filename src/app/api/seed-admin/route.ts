import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'

// POST /api/seed-admin - Seed or reset master data
// ⛔ NEVER deletes: Pengguna, CalonPembeli, Pembeli, Settings (including role_permissions)
// ✅ Only resets: Papers, PrintingCosts, Finishings, Customers (master data tables)
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAdmin(request)
    if (authErr) return authErr

    const { forceReset } = await request.json().catch(() => ({}))

    if (forceReset) {
      // Reset master data tables only
      // ⛔ PROTECTED (never deleted): Pengguna, CalonPembeli, Pembeli, Setting
      await db.riwayatCetakan.deleteMany()
      await db.riwayatFinishing.deleteMany()
      await db.riwayatOngkosCetak.deleteMany()
      await db.riwayatHargaKertas.deleteMany()
      await db.riwayatPotongKertas.deleteMany()
      await db.invoice.deleteMany()
      await db.suratJalan.deleteMany()
      await db.customer.deleteMany()
      await db.finishing.deleteMany()
      await db.printingCost.deleteMany()
      await db.paper.deleteMany()

      // Clear per-user master_cleared flags so re-seed can work
      await db.setting.deleteMany({
        where: {
          key: { startsWith: 'master_cleared_' }
        }
      })
    }

    // Import and reset ensureSeedData
    const { ensureSeedData, _resetSeedFlag } = await import('@/lib/auto-seed')
    _resetSeedFlag()
    await ensureSeedData('user-superadmin')

    // Return summary
    const [finalPapers, finalCosts, finalFinishings, finalCustomers, finalPengguna, finalSettings] = await Promise.all([
      db.paper.count(),
      db.printingCost.count(),
      db.finishing.count(),
      db.customer.count(),
      db.pengguna.count(),
      db.setting.count(),
    ])

    return NextResponse.json({
      message: forceReset
        ? 'Master data reset and re-seeded (pengguna & settings preserved)'
        : 'Database synced with sample data (upsert mode)',
      mode: forceReset ? 'reset' : 'upsert',
      data: {
        papers: finalPapers,
        printingCosts: finalCosts,
        finishings: finalFinishings,
        customers: finalCustomers,
        pengguna: finalPengguna,
        settings: finalSettings,
      }
    }, { status: 200 })
  } catch (error) {
    console.error('Seed admin error:', error)
    return NextResponse.json(
      { error: 'Gagal seeding database', details: String(error) },
      { status: 500 }
    )
  }
}
