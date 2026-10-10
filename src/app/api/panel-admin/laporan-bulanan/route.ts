import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * GET /api/panel-admin/laporan-bulanan?year=2026
 * Laporan bulanan PENDAFTARAN AKUN: jumlah akun yang mendaftar per bulan
 * (CalonPembeli), dipecah per role (demo vs aktif) + kumulatif
 * (superadmin/admin saja).
 */
export async function GET(request: NextRequest) {
  const authErr = requireAdmin(request)
  if (authErr) return authErr

  try {
    const year = parseInt(request.nextUrl.searchParams.get('year') || '', 10)
    const y = Number.isFinite(year) && year >= 2000 && year <= 2200 ? year : new Date().getFullYear()

    const yStart = new Date(y, 0, 1)
    const yEnd = new Date(y + 1, 0, 1)

    const [calons, penggunas] = await Promise.all([
      db.calonPembeli.findMany({
        where: { createdAt: { gte: yStart, lt: yEnd } },
        select: { role: true, createdAt: true },
      }),
      db.pengguna.findMany({
        where: { createdAt: { gte: yStart, lt: yEnd } },
        select: { createdAt: true },
      }),
    ])

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
    const months = monthNames.map((nama, idx) => ({
      bulan: nama,
      bulanKe: idx + 1,
      akunBaru: 0,
      demo: 0,
      aktif: 0,
      penggunaSistem: 0,
      kumulatif: 0,
    }))

    for (const c of calons) {
      const m = new Date(c.createdAt).getMonth()
      months[m].akunBaru += 1
      if (c.role === 'demo') months[m].demo += 1
      else months[m].aktif += 1
    }
    for (const u of penggunas) {
      months[new Date(u.createdAt).getMonth()].penggunaSistem += 1
    }

    // Kumulatif berjalan sepanjang tahun
    let running = 0
    for (const m of months) {
      running += m.akunBaru
      m.kumulatif = running
    }

    const totals = {
      akunBaru: months.reduce((s, m) => s + m.akunBaru, 0),
      demo: months.reduce((s, m) => s + m.demo, 0),
      aktif: months.reduce((s, m) => s + m.aktif, 0),
      penggunaSistem: months.reduce((s, m) => s + m.penggunaSistem, 0),
    }

    // Bulan dengan pendaftaran terbanyak
    const terbanyak = months.reduce((best, m) => (m.akunBaru > best.akunBaru ? m : best), months[0])

    return NextResponse.json({
      year: y,
      months,
      totals,
      bulanTerbanyak: { bulan: terbanyak.bulan, akunBaru: terbanyak.akunBaru },
    })
  } catch (error) {
    console.error('Panel admin laporan bulanan error:', error)
    return NextResponse.json({ error: sanitizeError(error, 'Gagal memuat laporan bulanan.') }, { status: 500 })
  }
}
