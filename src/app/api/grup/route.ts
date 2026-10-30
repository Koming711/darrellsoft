import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, getServerUser, isAdmin } from '@/lib/server-auth'
import {
  resolveGrupForUser,
  hitungKuota,
  logGroupAudit,
} from '@/lib/grup'
import { derivedSubscriptionStatus } from '@/lib/subscription'

export const dynamic = 'force-dynamic'

/**
 * GET /api/grup — informasi grup perusahaan milik user yang login.
 * Dipakai halaman /grup (dashboard grup, data perusahaan, anggota, langganan).
 * User tanpa grup → { grup: null, daftarPaketMultiAkun } (upsell di UI).
 */
export async function GET(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    // Admin sistem bukan pelanggan — tidak punya grup & jangan ditawari paket.
    // Data grup hanya milik akun Owner; admin memantau via Panel Admin.
    if (isAdmin(user.role)) {
      return NextResponse.json(
        { grup: null, daftarPaketMultiAkun: [] },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      )
    }
    const resolved = await resolveGrupForUser(user.id)

    if (!resolved) {
      // Bukan anggota grup — kirim daftar paket multi-akun untuk upsell
      const plans = await db.subscriptionPlan.findMany({
        where: { isActive: true, maxAccounts: { gte: 2 } },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true, name: true, monthlyPrice: true, originalPrice: true,
          maxAccounts: true, durationDays: true, features: true, isPopular: true,
        },
      })
      return NextResponse.json(
        { grup: null, daftarPaketMultiAkun: plans },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      )
    }

    const { grup, anggota: anggotaSaya } = resolved

    // Anggota (tanpa yang keluar) + data akun login-nya
    const anggotaRows = await db.grupAnggota.findMany({
      where: { grupId: grup.id, status: { not: 'keluar' } },
      orderBy: [{ peran: 'asc' }, { tanggalGabung: 'asc' }],
    })
    const memberIds = anggotaRows.map((a) => a.memberId)
    const [penggunaRows, calonRows] = await Promise.all([
      db.pengguna.findMany({
        where: { id: { in: memberIds } },
        select: { id: true, namaLengkap: true, username: true, email: true, nomorHP: true, role: true, validUntil: true },
      }),
      db.calonPembeli.findMany({
        where: { id: { in: memberIds } },
        select: { id: true, nama: true, username: true, email: true, nomorHP: true },
      }),
    ])
    const akunById = new Map<string, { namaLengkap: string; username: string | null; email: string; nomorHP: string; role: string; validUntil: Date | null }>()
    for (const p of penggunaRows) {
      akunById.set(p.id, { namaLengkap: p.namaLengkap, username: p.username, email: p.email, nomorHP: p.nomorHP, role: p.role, validUntil: p.validUntil })
    }
    for (const c of calonRows) {
      if (!akunById.has(c.id)) {
        akunById.set(c.id, { namaLengkap: c.nama, username: c.username, email: c.email, nomorHP: c.nomorHP, role: 'user', validUntil: null })
      }
    }

    const { kuota, terpakai, sisa } = await hitungKuota(grup.id)

    // Status langganan grup = langganan milik Owner (anggota mengikutinya)
    const ownerSub = grup.ownerUserId
      ? await db.customerSubscription.findUnique({
          where: { userId: grup.ownerUserId },
          select: { status: true, startDate: true, endDate: true, plan: { select: { name: true, maxAccounts: true } } },
        })
      : null

    const ownerRow = grup.ownerUserId ? akunById.get(grup.ownerUserId) : null

    const anggota = anggotaRows.map((a) => {
      const akun = akunById.get(a.memberId)
      let izin: string[] = []
      try {
        const parsed = JSON.parse(a.izin || '[]')
        if (Array.isArray(parsed)) izin = parsed.filter((x: unknown) => typeof x === 'string')
      } catch {}
      return {
        id: a.id,
        memberId: a.memberId,
        namaLengkap: akun?.namaLengkap || a.namaLengkap,
        username: akun?.username ?? null,
        email: akun?.email ?? '',
        nomorHP: akun?.nomorHP ?? '',
        peran: a.peran,
        status: a.status,
        izin,
        tanggalGabung: a.tanggalGabung.toISOString(),
        akunAda: !!akun,
      }
    })

    return NextResponse.json(
      {
        grup: {
          id: grup.id,
          kode: grup.kode,
          nama: grup.nama,
          status: grup.status,
          suspendReason: grup.suspendReason,
          ownerUserId: grup.ownerUserId,
          ownerNama: ownerRow?.namaLengkap || '',
          paket: ownerSub?.plan?.name || grup.plan?.name || '-',
          kuotaAkun: ownerSub?.plan?.maxAccounts ?? kuota,
          terpakai,
          sisa,
          langganan: ownerSub
            ? {
                status: derivedSubscriptionStatus({ status: ownerSub.status, endDate: ownerSub.endDate }),
                statusMentah: ownerSub.status,
                startDate: ownerSub.startDate?.toISOString() ?? null,
                endDate: ownerSub.endDate?.toISOString() ?? null,
              }
            : null,
          createdAt: grup.createdAt.toISOString(),
        },
        anggota,
        saya: {
          peran: anggotaSaya.peran,
          status: anggotaSaya.status,
          izin: (() => {
            try {
              const parsed = JSON.parse(anggotaSaya.izin || '[]')
              return Array.isArray(parsed) ? parsed.filter((x: unknown) => typeof x === 'string') : []
            } catch { return [] }
          })(),
          adalahOwner: anggotaSaya.peran === 'owner',
        },
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (error) {
    console.error('GET /api/grup error:', error)
    return NextResponse.json({ error: 'Gagal mengambil data grup' }, { status: 500 })
  }
}

/**
 * PATCH /api/grup — Owner memperbarui nama perusahaan/grup.
 */
export async function PATCH(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    if (isAdmin(user.role)) {
      return NextResponse.json({ error: 'Admin sistem tidak dapat mengubah data perusahaan grup. Pengelolaan hanya oleh Owner grup perusahaan.' }, { status: 403 })
    }
    const resolved = await resolveGrupForUser(user.id)
    if (!resolved) {
      return NextResponse.json({ error: 'Anda belum tergabung dalam grup perusahaan.' }, { status: 404 })
    }
    if (resolved.anggota.peran !== 'owner') {
      return NextResponse.json({ error: 'Hanya Owner yang dapat mengubah data perusahaan.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const nama = String(body?.nama ?? '').trim().slice(0, 120)
    if (!nama) {
      return NextResponse.json({ error: 'Nama perusahaan/grup wajib diisi.' }, { status: 400 })
    }

    const lama = resolved.grup.nama
    const updated = await db.grup.update({
      where: { id: resolved.grup.id },
      data: { nama },
    })

    await logGroupAudit(db, {
      grupId: updated.id,
      aktorId: user.id,
      aktorNama: user.id,
      aksi: 'grup_data_perusahaan_diubah',
      detail: { dari: lama, ke: nama },
    })

    return NextResponse.json({ success: true, nama: updated.nama })
  } catch (error) {
    console.error('PATCH /api/grup error:', error)
    return NextResponse.json({ error: 'Gagal menyimpan data perusahaan' }, { status: 500 })
  }
}
