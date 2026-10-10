import { NextResponse } from 'next/server'
import { getPlans } from '@/lib/plans'

/**
 * GET /api/plans — katalog paket premium (PUBLIK).
 * Dipakai halaman checkout & landing page agar harga/masa berlaku/perincian
 * selalu mengikuti yang diatur admin di Panel Admin → Paket Premium.
 */
export async function GET() {
  try {
    const plans = await getPlans()
    return NextResponse.json({ plans })
  } catch {
    return NextResponse.json({ error: 'Gagal memuat katalog paket.' }, { status: 500 })
  }
}
