// GET /api/subscription/plans — PUBLIC: daftar paket aktif untuk halaman Pilih Paket & landing.
// Seed 3 paket default + PaymentSettings bila DB kosong.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSubscriptionSeeded } from '@/lib/subscription'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await ensureSubscriptionSeeded()
    const plans = await db.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    })
    return NextResponse.json({
      plans: plans.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        description: p.description,
        monthlyPrice: p.monthlyPrice,
        originalPrice: p.originalPrice,
        features: JSON.parse(p.features || '[]'),
        maxAccounts: p.maxAccounts,
        maxTransactions: p.maxTransactions,
        maxStorageMb: p.maxStorageMb,
        durationDays: p.durationDays,
        isPopular: p.isPopular,
        isActive: p.isActive,
      })),
    })
  } catch (error) {
    console.error('GET /api/subscription/plans error:', error)
    return NextResponse.json({ plans: [], error: 'Gagal memuat paket' }, { status: 500 })
  }
}

// POST tidak diizinkan di endpoint publik (CRUD paket via /api/panel-admin/plans)
export async function POST(_request: NextRequest) {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
