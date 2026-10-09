import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, isAdmin, requireAdmin } from '@/lib/server-auth'
import { ensurePaymentDefaults } from '@/lib/payment-manual'
import { sanitizeError } from '@/lib/api-error'

// GET /api/payment-manual/plans            → paket aktif (publik, untuk checkout & halaman paket)
// GET /api/payment-manual/plans?all=1      → semua paket (admin, untuk pengaturan paket)
export async function GET(request: NextRequest) {
  try {
    await ensurePaymentDefaults()

    const user = getServerUser(request)
    const wantAll = request.nextUrl.searchParams.get('all') === '1' && user && isAdmin(user.role)

    const plans = await db.subscriptionPlan.findMany({
      where: wantAll ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }],
    })

    return NextResponse.json({ plans })
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, 'Gagal memuat paket') }, { status: 500 })
  }
}

// POST /api/payment-manual/plans — admin buat paket baru
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAdmin(request)
    if (authErr) return authErr

    const body = await request.json()
    const { planName, price, durationMonths, maxAccounts, discountPercent, features, isActive, sortOrder } = body

    if (!planName?.trim() || !price || !durationMonths) {
      return NextResponse.json({ error: 'Nama paket, harga, dan durasi wajib diisi' }, { status: 400 })
    }
    if (Number(price) <= 0 || Number(durationMonths) <= 0) {
      return NextResponse.json({ error: 'Harga dan durasi harus lebih dari 0' }, { status: 400 })
    }

    const plan = await db.subscriptionPlan.create({
      data: {
        planName: String(planName).trim(),
        price: Number(price),
        durationMonths: Number(durationMonths),
        maxAccounts: Number(maxAccounts) || 2,
        discountPercent: Number(discountPercent) || 0,
        features: JSON.stringify(Array.isArray(features) ? features : []),
        isActive: isActive !== false,
        sortOrder: Number(sortOrder) || 99,
      },
    })

    return NextResponse.json({ plan })
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, 'Gagal membuat paket') }, { status: 500 })
  }
}
