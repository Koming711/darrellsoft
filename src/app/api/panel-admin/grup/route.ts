import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getServerUser } from '@/lib/server-auth'
import { hitungKuota, ANGGOTA_STATUS } from '@/lib/grup'
import { derivedSubscriptionStatus } from '@/lib/subscription'

export const dynamic = 'force-dynamic'

/**
 * GET /api/panel-admin/grup — Super admin: daftar seluruh grup perusahaan.
 * Termasuk owner, anggota, paket, kuota/terpakai, status langganan owner,
 * dan status grup (aktif/dinonaktifkan).
 */
export async function GET(request: NextRequest) {
  try {
    const err = requireAdmin(request)
    if (err) return err

    const grups = await db.grup.findMany({
      include: {
        plan: { select: { id: true, name: true, maxAccounts: true } },
        anggota: { where: { status: { not: ANGGOTA_STATUS.KELUAR } }, orderBy: [{ peran: 'asc' }, { tanggalGabung: 'asc' }] },
      },
      orderBy: { createdAt: 'desc' },
    })

    const memberIds = [...new Set(grups.flatMap((g) => g.anggota.map((a) => a.memberId)))]
    const [penggunaRows, calonRows, subs] = await Promise.all([
      db.pengguna.findMany({
        where: { id: { in: memberIds } },
        select: { id: true, namaLengkap: true, username: true, email: true, role: true },
      }),
      db.calonPembeli.findMany({
        where: { id: { in: memberIds } },
        select: { id: true, nama: true, username: true, email: true },
      }),
      db.customerSubscription.findMany({
        where: { userId: { in: grups.map((g) => g.ownerUserId).filter((x): x is string => !!x) } },
        select: { userId: true, status: true, endDate: true, plan: { select: { name: true, maxAccounts: true } } },
      }),
    ])
    const akunById = new Map<string, { namaLengkap: string; username: string | null; email: string; role: string }>()
    for (const p of penggunaRows) akunById.set(p.id, { namaLengkap: p.namaLengkap, username: p.username, email: p.email, role: p.role })
    for (const c of calonRows) {
      if (!akunById.has(c.id)) akunById.set(c.id, { namaLengkap: c.nama, username: c.username, email: c.email, role: 'user' })
    }
    const subByUserId = new Map(subs.map((s) => [s.userId, s]))

    const result: {
      id: string
      kode: string
      nama: string
      status: string
      suspendReason: string
      paket: string
      kuotaAkun: number
      terpakai: number
      sisa: number
      anggotaAktif: number
      langganan: { status: string; endDate: string | null } | null
      owner: { namaLengkap: string; username: string | null; email: string } | null
      createdAt: string
      anggota: {
        id: string
        namaLengkap: string
        username: string | null
        email: string
        peran: string
        status: string
        izin: string[]
        tanggalGabung: string
      }[]
    }[] = []
    for (const g of grups) {
      const { kuota, terpakai, sisa } = await hitungKuota(g.id)
      const owner = g.ownerUserId ? akunById.get(g.ownerUserId) : null
      const sub = g.ownerUserId ? subByUserId.get(g.ownerUserId) : null
      result.push({
        id: g.id,
        kode: g.kode,
        nama: g.nama,
        status: g.status,
        suspendReason: g.suspendReason,
        paket: sub?.plan?.name || g.plan?.name || '-',
        kuotaAkun: sub?.plan?.maxAccounts ?? kuota,
        terpakai,
        sisa,
        anggotaAktif: g.anggota.filter((a) => a.status === ANGGOTA_STATUS.AKTIF).length,
        langganan: sub
          ? {
              status: derivedSubscriptionStatus({ status: sub.status, endDate: sub.endDate }),
              endDate: sub.endDate?.toISOString() ?? null,
            }
          : null,
        owner: owner ? { namaLengkap: owner.namaLengkap, username: owner.username, email: owner.email } : null,
        createdAt: g.createdAt.toISOString(),
        anggota: g.anggota.map((a) => {
          const akun = akunById.get(a.memberId)
          let izin: string[] = []
          try {
            const parsed = JSON.parse(a.izin || '[]')
            if (Array.isArray(parsed)) izin = parsed.filter((x: unknown) => typeof x === 'string')
          } catch {}
          return {
            id: a.id,
            namaLengkap: akun?.namaLengkap || a.namaLengkap,
            username: akun?.username ?? null,
            email: akun?.email ?? '',
            peran: a.peran,
            status: a.status,
            izin,
            tanggalGabung: a.tanggalGabung.toISOString(),
          }
        }),
      })
    }

    return NextResponse.json(
      { grup: result },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (error) {
    console.error('GET /api/panel-admin/grup error:', error)
    return NextResponse.json({ error: 'Gagal memuat daftar grup' }, { status: 500 })
  }
}

// Catatan: identitas admin untuk audit diambil oleh route [id] (PATCH).
void getServerUser
