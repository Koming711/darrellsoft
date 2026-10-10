import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

interface AuditItem {
  id: string
  type: 'registrasi' | 'otp'
  message: string
  detail: string
  timestamp: string
}

/**
 * GET /api/panel-admin/audit?limit=150
 * LAPORAN & AUDIT PENDAFTARAN AKUN: jejak aktivitas pendaftaran akun —
 * akun yang terdaftar (CalonPembeli) dan OTP WhatsApp yang dikirim sebagai
 * bagian dari alur daftar akun (superadmin/admin saja).
 */
export async function GET(request: NextRequest) {
  const authErr = requireAdmin(request)
  if (authErr) return authErr

  try {
    const limitParam = parseInt(request.nextUrl.searchParams.get('limit') || '', 10)
    const limit = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 500 ? limitParam : 150

    const [calons, otps] = await Promise.all([
      db.calonPembeli.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
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
      db.registerOtp.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    ])

    const items: AuditItem[] = []

    for (const c of calons) {
      items.push({
        id: `calon-${c.id}`,
        type: 'registrasi',
        message: `Akun baru terdaftar: ${c.nama}${c.username ? ` (${c.username})` : ''}`,
        detail: `Role: ${c.role === 'demo' ? 'Demo' : c.role.charAt(0).toUpperCase() + c.role.slice(1)} • HP: ${c.nomorHP}${c.email ? ` • Email: ${c.email}` : ''} • Status: ${c.status}`,
        timestamp: c.createdAt.toISOString(),
      })
    }
    for (const o of otps) {
      items.push({
        id: `otp-${o.id}`,
        type: 'otp',
        message: `Kode OTP daftar akun dikirim ke ${o.nomorHP}`,
        detail: o.consumed ? 'OTP sudah dipakai — pendaftaran dilanjutkan' : o.expiresAt.getTime() < Date.now() ? 'OTP kedaluwarsa — pendaftaran tidak selesai' : 'OTP aktif — menunggu verifikasi',
        timestamp: o.createdAt.toISOString(),
      })
    }

    items.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    const data = items.slice(0, limit)

    const counts = {
      registrasi: items.filter(i => i.type === 'registrasi').length,
      otp: items.filter(i => i.type === 'otp').length,
    }

    return NextResponse.json({ items: data, counts, total: items.length })
  } catch (error) {
    console.error('Panel admin audit error:', error)
    return NextResponse.json({ error: sanitizeError(error, 'Gagal memuat data audit.') }, { status: 500 })
  }
}
