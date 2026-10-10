import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'
import { getPlans, savePlans } from '@/lib/plans'

/**
 * GET /api/panel-admin/paket
 * Data halaman Paket Premium: katalog paket (dari Setting premium_plans_v1 —
 * bisa diedit admin), daftar pembayaran (Midtrans), dan daftar tenant
 * pelanggan beserta masa aktifnya (superadmin/admin saja).
 *
 * PUT /api/panel-admin/paket — simpan katalog paket (harga, harga coret
 * diskon, masa berlaku, perincian, jumlah akun, aktif/nonaktif).
 *
 * Aktivasi pembayaran memakai endpoint bawaan POST /api/midtrans/activate
 * (body: { orderId }) — tidak diduplikasi di sini.
 */
export async function GET(request: NextRequest) {
  const authErr = requireAdmin(request)
  if (authErr) return authErr

  try {
    const now = new Date()

    const [payments, pembelis, penggunas, plans] = await Promise.all([
      db.payment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          orderId: true,
          packageName: true,
          packageType: true,
          grossAmount: true,
          customerName: true,
          customerEmail: true,
          customerPhone: true,
          transactionStatus: true,
          userId: true,
          createdAt: true,
        },
      }),
      db.pembeli.findMany({
        where: { role: { in: ['owner', 'user', 'admin'] } },
        orderBy: { expiredDate: 'desc' },
        take: 100,
        select: { id: true, nama: true, nomorHP: true, email: true, role: true, expiredDate: true, penggunaId: true },
      }),
      db.pengguna.findMany({
        select: { id: true, namaLengkap: true, username: true, role: true, validUntil: true },
      }),
      getPlans(),
    ])

    const penggunaById = new Map(penggunas.map(u => [u.id, u]))

    const revenueSettled = payments
      .filter(p => ['settlement', 'capture', 'success'].includes(p.transactionStatus))
      .reduce((s, p) => s + (p.grossAmount || 0), 0)

    const tenants = pembelis.map(p => {
      const u = p.penggunaId ? penggunaById.get(p.penggunaId) : undefined
      const expired = p.expiredDate ? new Date(p.expiredDate) : null
      return {
        id: p.id,
        nama: p.nama,
        kontak: p.nomorHP || p.email || '-',
        role: p.role,
        username: u?.username || '-',
        expiredDate: expired ? expired.toISOString() : null,
        status: expired && expired > now ? 'aktif' : 'expired',
      }
    })

    return NextResponse.json({
      plans,
      payments: payments.map(p => ({ ...p, createdAt: p.createdAt.toISOString() })),
      tenants,
      summary: {
        totalRevenue: revenueSettled,
        paymentCount: payments.length,
        tenantAktif: tenants.filter(t => t.status === 'aktif').length,
        tenantExpired: tenants.filter(t => t.status === 'expired').length,
      },
    })
  } catch (error) {
    console.error('Panel admin paket error:', error)
    return NextResponse.json({ error: sanitizeError(error, 'Gagal memuat data paket premium.') }, { status: 500 })
  }
}

/**
 * PUT /api/panel-admin/paket
 * Body: { plans: PremiumPlan[] } — simpan seluruh katalog.
 */
export async function PUT(request: NextRequest) {
  const authErr = requireAdmin(request)
  if (authErr) return authErr

  try {
    const body = await request.json()
    const plans = await savePlans(body?.plans)
    return NextResponse.json({ success: true, plans })
  } catch (error) {
    console.error('Panel admin paket save error:', error)
    const message = error instanceof Error ? error.message : 'Gagal menyimpan katalog paket.'
    return NextResponse.json({ error: sanitizeError(error, message) }, { status: 400 })
  }
}
