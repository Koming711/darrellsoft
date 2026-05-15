import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getServerUser } from '@/lib/server-auth'

// POST /api/clear-sample - Delete all sample master data (papers, printingCosts, finishings, customers)
// Keeps users (pengguna) and settings intact
// Sets per-user flags to prevent auto-reseed for EXISTING accounts only (new accounts still get sample data)
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAdmin(request)
    if (authErr) return authErr

    // Delete all master data
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

    // Set per-user flags for all existing users to prevent re-seeding
    // New accounts will still get sample data automatically
    const allUsers = await db.pengguna.findMany({ select: { id: true } })
    for (const user of allUsers) {
      await db.setting.upsert({
        where: { key: `master_cleared_${user.id}` },
        update: { value: 'true' },
        create: { key: `master_cleared_${user.id}`, value: 'true' },
      })
    }

    // Return summary
    const [papers, printingCosts, finishings, customers] = await Promise.all([
      db.paper.count(),
      db.printingCost.count(),
      db.finishing.count(),
      db.customer.count(),
    ])

    return NextResponse.json({
      message: 'Sample data deleted successfully. Auto-reseed disabled for existing accounts only (new accounts will still get sample data).',
      data: { papers, printingCosts, finishings, customers }
    }, { status: 200 })
  } catch (error) {
    console.error('Clear sample error:', error)
    return NextResponse.json(
      { error: 'Gagal menghapus sample data', details: String(error) },
      { status: 500 }
    )
  }
}
