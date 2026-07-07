import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'

// POST /api/import-master-data - Import master data from local/export
// Clears existing master data AND per-user master_cleared flags, then inserts provided data
// ⛔ NEVER deletes: Pengguna, CalonPembeli, Pembeli, Settings (except master_cleared_*)
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAdmin(request)
    if (authErr) return authErr

    const body = await request.json()
    const { papers = [], printingCosts = [], finishings = [], customers = [], targetUserId } = body

    if (!papers.length && !printingCosts.length && !finishings.length && !customers.length) {
      return NextResponse.json({ error: 'No data provided' }, { status: 400 })
    }

    // Get all users to assign data to
    const allUsers = await db.pengguna.findMany({ select: { id: true } })
    const userId = targetUserId || (allUsers[0]?.id)

    if (!userId) {
      return NextResponse.json({ error: 'No users found in database' }, { status: 400 })
    }

    console.log(`📦 Importing master data: ${papers.length} papers, ${printingCosts.length} costs, ${finishings.length} finishings, ${customers.length} customers`)

    // Step 1: Clear existing master data
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

    // Step 2: Remove per-user master_cleared flags so auto-seed won't conflict
    await db.setting.deleteMany({ where: { key: { startsWith: 'master_cleared_' } } })

    // Step 3: Insert the provided data, assigning to the target user
    const insertOps = []

    for (const p of papers) {
      insertOps.push(db.paper.create({
        data: {
          name: p.name,
          grammage: p.grammage,
          width: p.width,
          height: p.height,
          pricePerRim: p.pricePerRim,
          userId: p.userId || userId,
        }
      }))
    }

    for (const c of printingCosts) {
      insertOps.push(db.printingCost.create({
        data: {
          machineName: c.machineName,
          grammage: c.grammage,
          printAreaWidth: c.printAreaWidth,
          printAreaHeight: c.printAreaHeight,
          pricePerColor: c.pricePerColor,
          specialColorPrice: c.specialColorPrice,
          minimumPrintQuantity: c.minimumPrintQuantity,
          priceAboveMinimumPerSheet: c.priceAboveMinimumPerSheet,
          platePricePerSheet: c.platePricePerSheet,
          userId: c.userId || userId,
        }
      }))
    }

    for (const f of finishings) {
      insertOps.push(db.finishing.create({
        data: {
          name: f.name,
          minimumSheets: f.minimumSheets,
          minimumPrice: f.minimumPrice,
          additionalPrice: f.additionalPrice,
          pricePerCm: f.pricePerCm,
          userId: f.userId || userId,
        }
      }))
    }

    for (const c of customers) {
      insertOps.push(db.customer.create({
        data: {
          name: c.name,
          companyName: c.companyName || null,
          address: c.address || '',
          phone: c.phone || '',
          email: c.email || '',
          userId: c.userId || userId,
        }
      }))
    }

    await Promise.all(insertOps)

    // Return summary
    const [finalPapers, finalCosts, finalFinishings, finalCustomers] = await Promise.all([
      db.paper.count(),
      db.printingCost.count(),
      db.finishing.count(),
      db.customer.count(),
    ])

    console.log(`✅ Import complete: ${finalPapers} papers, ${finalCosts} costs, ${finalFinishings} finishings, ${finalCustomers} customers`)

    return NextResponse.json({
      message: 'Master data imported successfully',
      data: {
        papers: finalPapers,
        printingCosts: finalCosts,
        finishings: finalFinishings,
        customers: finalCustomers,
      }
    }, { status: 200 })
  } catch (error) {
    console.error('Import master data error:', error)
    return NextResponse.json(
      { error: 'Gagal import master data', details: String(error) },
      { status: 500 }
    )
  }
}
