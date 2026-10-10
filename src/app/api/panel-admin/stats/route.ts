import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * GET /api/panel-admin/stats
 * Statistik ringkas untuk Dashboard Panel Admin (superadmin/admin saja).
 */
export async function GET(request: NextRequest) {
  const authErr = requireAdmin(request)
  if (authErr) return authErr

  try {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const [
      totalPengguna,
      totalPembeli,
      totalCalonPembeli,
      demoAktif,
      pembeliAktif,
      invoicesBulanIni,
      paymentsBulanIni,
      paymentsSemua,
      calonExpired7Hari,
      pembeliExpired7Hari,
      recentPayments,
      recentAccounts,
    ] = await Promise.all([
      db.pengguna.count(),
      db.pembeli.count(),
      db.calonPembeli.count(),
      db.calonPembeli.count({ where: { role: 'demo', expiredDate: { gt: now } } }),
      db.pembeli.count({ where: { expiredDate: { gt: now } } }),
      db.invoice.findMany({
        where: { createdAt: { gte: startOfMonth } },
        select: { grandTotal: true },
      }),
      db.payment.findMany({
        where: {
          transactionStatus: { in: ['settlement', 'capture', 'success'] },
          createdAt: { gte: startOfMonth },
        },
        select: { grossAmount: true },
      }),
      // Omset paket ALL-TIME (semua pembayaran paket yang sukses)
      db.payment.findMany({
        where: { transactionStatus: { in: ['settlement', 'capture', 'success'] } },
        select: { grossAmount: true },
      }),
      db.calonPembeli.count({ where: { expiredDate: { gt: now, lte: in7Days } } }),
      db.pembeli.count({ where: { expiredDate: { gt: now, lte: in7Days } } }),
      db.payment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          orderId: true,
          packageName: true,
          grossAmount: true,
          transactionStatus: true,
          customerName: true,
          createdAt: true,
        },
      }),
      // Akun yang baru mendaftar (untuk Beranda)
      db.calonPembeli.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          nama: true,
          username: true,
          nomorHP: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
        },
      }),
    ])

    const invoiceTotalBulanIni = invoicesBulanIni.reduce((s, i) => s + (i.grandTotal || 0), 0)
    const pendapatanPaketBulanIni = paymentsBulanIni.reduce((s, p) => s + (p.grossAmount || 0), 0)
    const totalOmsetPaket = paymentsSemua.reduce((s, p) => s + (p.grossAmount || 0), 0)

    return NextResponse.json({
      // Total user = seluruh akun: pengguna sistem + tenant pembeli + calon pembeli
      totalUser: totalPengguna + totalPembeli + totalCalonPembeli,
      totalOmsetPaket,
      totalPengguna,
      totalPembeli,
      totalCalonPembeli,
      demoAktif,
      pembeliAktif,
      invoiceCountBulanIni: invoicesBulanIni.length,
      invoiceTotalBulanIni,
      pendapatanPaketBulanIni,
      expired7Hari: calonExpired7Hari + pembeliExpired7Hari,
      recentPayments,
      recentAccounts: recentAccounts.map(a => ({
        id: a.id,
        nama: a.nama,
        username: a.username,
        nomorHP: a.nomorHP,
        email: a.email,
        role: a.role,
        status: a.status,
        createdAt: a.createdAt.toISOString(),
      })),
      generatedAt: now.toISOString(),
    })
  } catch (error) {
    console.error('Panel admin stats error:', error)
    return NextResponse.json({ error: sanitizeError(error, 'Gagal memuat statistik panel admin.') }, { status: 500 })
  }
}
