import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * API DAFTAR AKUN Panel Admin.
 *
 * Kategori akun (sumber: CalonPembeli — seluruh akun hasil pendaftaran):
 * - baru    → status 'baru' (menunggu verifikasi admin)
 * - aktif   → status 'aktif' & belum melewati masa berlaku
 * - expired → masa berlaku sudah lewat (belum ditolak)
 * - ditolak → status 'ditolak' (login diblokir otomatis)
 *
 * GET  /api/panel-admin/akun?status=baru|aktif|expired|ditolak
 * POST /api/panel-admin/akun { id, action: verifikasi|tolak|aktifkan|perpanjang, months? }
 */

type Kategori = 'baru' | 'aktif' | 'expired' | 'ditolak'

function nowDate() {
  return new Date()
}

function addMonths(base: Date, months: number) {
  const d = new Date(base)
  d.setMonth(d.getMonth() + Math.max(1, Math.round(months || 1)))
  return d
}

async function defaultActiveMonths(): Promise<number> {
  const s = await db.setting.findUnique({ where: { key: 'account_active_months' } })
  const n = parseInt(s?.value || '1', 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

export async function GET(request: NextRequest) {
  const authErr = requireAdmin(request)
  if (authErr) return authErr

  try {
    const kategori = (request.nextUrl.searchParams.get('status') || 'baru') as Kategori
    const now = nowDate()

    const [rows, cBaru, cAktif, cExpired, cDitolak] = await Promise.all([
      db.calonPembeli.findMany({
        where:
          kategori === 'baru'
            ? { status: 'baru' }
            : kategori === 'aktif'
              ? { status: 'aktif', OR: [{ expiredDate: null }, { expiredDate: { gt: now } }] }
              : kategori === 'expired'
                ? { status: { not: 'ditolak' }, expiredDate: { lte: now } }
                : { status: 'ditolak' },
        orderBy: { createdAt: 'desc' },
        take: 300,
        select: {
          id: true, nama: true, username: true, nomorHP: true, email: true,
          role: true, status: true, expiredDate: true, catatan: true, createdAt: true,
        },
      }),
      db.calonPembeli.count({ where: { status: 'baru' } }),
      db.calonPembeli.count({ where: { status: 'aktif', OR: [{ expiredDate: null }, { expiredDate: { gt: now } }] } }),
      db.calonPembeli.count({ where: { status: { not: 'ditolak' }, expiredDate: { lte: now } } }),
      db.calonPembeli.count({ where: { status: 'ditolak' } }),
    ])

    return NextResponse.json({
      kategori,
      counts: { baru: cBaru, aktif: cAktif, expired: cExpired, ditolak: cDitolak },
      items: rows.map(r => ({
        id: r.id,
        nama: r.nama,
        username: r.username,
        nomorHP: r.nomorHP,
        email: r.email,
        role: r.role,
        status: r.status,
        expiredDate: r.expiredDate ? r.expiredDate.toISOString() : null,
        catatan: r.catatan,
        createdAt: r.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('Panel admin akun error:', error)
    return NextResponse.json({ error: sanitizeError(error, 'Gagal memuat daftar akun.') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authErr = requireAdmin(request)
  if (authErr) return authErr

  try {
    const body = await request.json()
    const id = String(body?.id || '')
    const action = String(body?.action || '')
    const months =
      body?.months !== undefined && body?.months !== null && body?.months !== ''
        ? Math.max(1, Math.round(Number(body.months) || 1))
        : await defaultActiveMonths()

    if (!id || !action) {
      return NextResponse.json({ error: 'id dan action wajib diisi.' }, { status: 400 })
    }

    const calon = await db.calonPembeli.findUnique({ where: { id } })
    if (!calon) {
      return NextResponse.json({ error: 'Akun tidak ditemukan.' }, { status: 404 })
    }

    const now = nowDate()
    let newStatus = calon.status
    let newExpired: Date | null = calon.expiredDate
    let message = ''

    if (action === 'verifikasi') {
      // Akun baru disetujui → aktif. Bila masa berlaku kosong/lewat, perpanjang.
      newStatus = 'aktif'
      if (!newExpired || newExpired <= now) newExpired = addMonths(now, months)
      message = `Akun ${calon.nama} berhasil diverifikasi (aktif).`
    } else if (action === 'tolak') {
      newStatus = 'ditolak'
      message = `Akun ${calon.nama} ditolak. Login akun ini otomatis diblokir.`
    } else if (action === 'aktifkan') {
      // Pulihkan dari ditolak / aktifkan lagi akun expired
      newStatus = 'aktif'
      newExpired = addMonths(now, months)
      message = `Akun ${calon.nama} diaktifkan kembali hingga ${newExpired.toLocaleDateString('id-ID')}.`
    } else if (action === 'perpanjang') {
      const base = calon.expiredDate && calon.expiredDate > now ? calon.expiredDate : now
      newExpired = addMonths(base, months)
      if (calon.status === 'ditolak') newStatus = 'aktif'
      message = `Masa berlaku ${calon.nama} diperpanjang ${months} bulan.`
    } else {
      return NextResponse.json({ error: 'Action tidak dikenal.' }, { status: 400 })
    }

    const updated = await db.calonPembeli.update({
      where: { id },
      data: { status: newStatus, expiredDate: newExpired },
    })

    // Akun yang sudah dikonversi (punya Pengguna terkait) → ikutkan masa aktifnya
    if (calon.userId && newExpired) {
      try {
        await db.pengguna.update({ where: { id: calon.userId }, data: { validUntil: newExpired } })
      } catch { /* pengguna mungkin sudah dihapus — abaikan */ }
    }

    return NextResponse.json({
      success: true,
      message,
      item: {
        id: updated.id,
        status: updated.status,
        expiredDate: updated.expiredDate ? updated.expiredDate.toISOString() : null,
      },
    })
  } catch (error) {
    console.error('Panel admin akun action error:', error)
    return NextResponse.json({ error: sanitizeError(error, 'Gagal memproses aksi akun.') }, { status: 500 })
  }
}
