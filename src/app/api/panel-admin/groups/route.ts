import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getServerUser } from '@/lib/server-auth'
import { logGroupAudit, GRUP_STATUS, invalidateGroupCache, hapusGrupPermanen } from '@/lib/grup'
import { derivedSubscriptionStatus } from '@/lib/subscription'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * GET /api/panel-admin/groups — Super Admin: Manajemen Grup.
 *
 * KONTRAK halaman /panel-admin (ManajemenGrupContent):
 * - GET                → { groups: GroupRow[], summary }
 * - GET ?grupId=       → GroupDetail { grup, members, payments, audit }
 * - PATCH {grupId,...} → aktifkan / nonaktifkan grup (paritas dgn PATCH /grup/[id])
 * - DELETE {grupId}    → HAPUS PERMANEN grup (tombol Delete):
 *     • seluruh akun login anggota grup (termasuk owner) DIHAPUS
 *       (Pengguna + Pembeli + CustomerSubscription milik akun tsb)
 *     • keanggotaan (GrupAnggota) terhapus ikut grup (cascade)
 *     • AuditLog grup dipertahankan (grupId → null, riwayat tetap terbaca
 *       di Laporan Audit) + entri baru 'grup_dihapus'
 *     • Data dokumen perusahaan (invoice, riwayat hitungan, dst — userId
 *       string biasa tanpa FK) TIDAK dihapus: arsip mati yang tak bisa
 *       diakses siapa pun setelah akun dihapus.
 *     • Riwayat tagihan/pembayaran langganan (SubscriptionInvoice/Payment)
 *       DIPERTAHANKAN sebagai arsip keuangan admin.
 */

// ===== Bentuk respon (kontrak frontend) =====
type GrupRow = Awaited<ReturnType<typeof db.grup.findMany>>[number]

interface GroupPayload {
  id: string
  kode: string
  nama: string
  status: string
  maxAccounts: number
  used: number
  paket: { name: string; monthlyPrice: number } | null
  owner: { userId: string; nama: string; username: string } | null
  subscription: { status: string; endDate: string | null; daysLeft: number } | null
  createdAt: string
}

/** Baris grup siap kirim — dipakai list & detail agar bentuk identik. */
async function buildGroupRow(
  g: GrupRow,
  akunById: Map<string, { nama: string; username: string | null }>,
  subByUserId: Map<string, { status: string; endDate: Date | null; planName: string | null; monthlyPrice: number | null; maxAccounts: number | null }>,
): Promise<GroupPayload> {
  const used = g.anggota.filter((a) => a.status !== 'keluar').length
  const ownerMember = g.anggota.find((a) => a.peran === 'owner') ?? null
  const ownerAkun = ownerMember ? akunById.get(ownerMember.memberId) : null
  const sub = g.ownerUserId ? subByUserId.get(g.ownerUserId) : null

  const planName = sub?.planName ?? g.plan?.name ?? null
  const monthlyPrice = sub?.monthlyPrice ?? g.plan?.monthlyPrice ?? null
  const maxAccounts = sub?.maxAccounts ?? g.plan?.maxAccounts ?? 0

  let subscription: GroupPayload['subscription'] = null
  if (sub) {
    const derived = derivedSubscriptionStatus({ status: sub.status, endDate: sub.endDate })
    const end = sub.endDate ? new Date(sub.endDate) : null
    const daysLeft = end ? Math.max(0, Math.ceil((end.getTime() - Date.now()) / DAY_MS)) : 0
    subscription = {
      status: derived,
      endDate: end ? end.toISOString() : null,
      daysLeft,
    }
  }

  return {
    id: g.id,
    kode: g.kode,
    nama: g.nama,
    status: g.status,
    maxAccounts,
    used,
    paket: planName ? { name: planName, monthlyPrice: monthlyPrice ?? 0 } : null,
    owner: ownerMember
      ? { userId: ownerMember.memberId, nama: ownerAkun?.nama || ownerMember.namaLengkap || '', username: ownerAkun?.username ?? '' }
      : null,
    subscription,
    createdAt: g.createdAt.toISOString(),
  }
}

/** Muat grup + data pendukung (akun & langganan) sekali untuk list/detail. */
async function loadGrupBundle(grupId?: string) {
  const grups = await db.grup.findMany({
    where: grupId ? { id: grupId } : undefined,
    include: {
      plan: { select: { id: true, name: true, monthlyPrice: true, maxAccounts: true } },
      anggota: { where: { status: { not: 'keluar' } }, orderBy: [{ peran: 'asc' }, { tanggalGabung: 'asc' }] },
    },
    orderBy: { createdAt: 'desc' },
  })
  // Semua baris keanggotaan (termasuk keluar) — sumber memberId untuk pembayaran
  const allMemberRows = await db.grupAnggota.findMany({
    where: grupId ? { grupId } : undefined,
    select: { grupId: true, memberId: true },
  })
  const memberIds = [...new Set(allMemberRows.map((m) => m.memberId))]
  const ownerIds = [...new Set(grups.map((g) => g.ownerUserId).filter((x): x is string => !!x))]
  const lookupIds = [...new Set([...memberIds, ...ownerIds])]

  const [penggunaRows, calonRows, subs] = await Promise.all([
    db.pengguna.findMany({
      where: { id: { in: lookupIds } },
      select: { id: true, namaLengkap: true, username: true },
    }),
    db.calonPembeli.findMany({
      where: { id: { in: lookupIds } },
      select: { id: true, nama: true, username: true },
    }),
    db.customerSubscription.findMany({
      where: { userId: { in: ownerIds } },
      select: {
        userId: true,
        status: true,
        endDate: true,
        plan: { select: { name: true, monthlyPrice: true, maxAccounts: true } },
      },
    }),
  ])

  const akunById = new Map<string, { nama: string; username: string | null }>()
  for (const p of penggunaRows) akunById.set(p.id, { nama: p.namaLengkap, username: p.username })
  for (const c of calonRows) {
    if (!akunById.has(c.id)) akunById.set(c.id, { nama: c.nama, username: c.username })
  }
  const subByUserId = new Map(
    subs.map((s) => [
      s.userId,
      {
        status: s.status,
        endDate: s.endDate,
        planName: s.plan?.name ?? null,
        monthlyPrice: s.plan?.monthlyPrice ?? null,
        maxAccounts: s.plan?.maxAccounts ?? null,
      },
    ]),
  )

  return { grups, akunById, subByUserId }
}

// ===== GET — list semua grup / detail satu grup =====
export async function GET(request: NextRequest) {
  try {
    const err = requireAdmin(request)
    if (err) return err

    const grupId = request.nextUrl.searchParams.get('grupId')?.trim() || undefined
    const { grups, akunById, subByUserId } = await loadGrupBundle(grupId)

    if (grupId) {
      const g = grups.find((x) => x.id === grupId)
      if (!g) {
        return NextResponse.json({ error: 'Grup tidak ditemukan.' }, { status: 404 })
      }

      const grup = await buildGroupRow(g, akunById, subByUserId)

      // Anggota (bukan "keluar") — snapshot nama + info akun terkini
      const members = g.anggota.map((a) => {
        const akun = akunById.get(a.memberId)
        return {
          id: a.id,
          userId: a.memberId,
          nama: akun?.nama || a.namaLengkap || '',
          username: akun?.username ?? null,
          role: a.peran === 'owner' ? 'owner' : 'staf',
          status: a.status === 'aktif' ? 'aktif' : 'nonaktif',
          joinedAt: a.tanggalGabung.toISOString(),
        }
      })

      // Riwayat pembayaran langganan grup — dibayar oleh owner/anggota
      const memberIds = g.anggota.map((a) => a.memberId)
      const paymentRows = memberIds.length
        ? await db.subscriptionPayment.findMany({
            where: { userId: { in: memberIds }, deletedAt: null },
            include: { invoice: { select: { invoiceNumber: true, planName: true } } },
            orderBy: { createdAt: 'desc' },
            take: 30,
          })
        : []
      const payments = paymentRows.map((p) => ({
        id: p.id,
        invoiceNumber: p.invoice?.invoiceNumber || '-',
        planName: p.invoice?.planName || '-',
        amount: p.amount,
        paymentMethod: p.paymentMethod,
        status: p.status,
        reviewedAt: p.reviewedAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
      }))

      // Riwayat aktivitas (audit) grup
      const logs = await db.auditLog.findMany({
        where: { grupId: g.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      const audit = logs.map((l) => {
        let notes: string | null = null
        try {
          const d = JSON.parse(l.detail || '{}') as Record<string, unknown>
          notes = (d.alasan as string) || (d.namaLengkap as string) || null
        } catch {
          notes = null
        }
        return {
          id: l.id,
          action: l.aksi,
          notes,
          performedBy: l.aktorNama || l.aktorId,
          createdAt: l.createdAt.toISOString(),
        }
      })

      return NextResponse.json(
        { grup, members, payments, audit },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } },
      )
    }

    // List semua grup + ringkasan
    const groups: GroupPayload[] = []
    for (const g of grups) {
      groups.push(await buildGroupRow(g, akunById, subByUserId))
    }
    const summary = {
      totalGrup: groups.length,
      grupAktif: groups.filter((g) => g.status === GRUP_STATUS.AKTIF).length,
      grupDinonaktifkan: groups.filter((g) => g.status === GRUP_STATUS.DINONAKTIFKAN).length,
      totalAkunTerpakai: groups.reduce((acc, g) => acc + g.used, 0),
    }

    return NextResponse.json(
      { groups, summary },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
  } catch (error) {
    console.error('GET /api/panel-admin/groups error:', error)
    return NextResponse.json({ error: 'Gagal memuat grup' }, { status: 500 })
  }
}

// ===== PATCH — aktifkan / nonaktifkan grup (paritas dgn /grup/[id]) =====
export async function PATCH(request: NextRequest) {
  try {
    const err = requireAdmin(request)
    if (err) return err
    const adminUser = getServerUser(request)!
    const admin = await db.pengguna.findUnique({
      where: { id: adminUser.id },
      select: { username: true },
    })
    const adminUsername = admin?.username || adminUser.id

    const body = await request.json().catch(() => ({}))
    const grupId = String(body?.grupId ?? '')
    const action = String(body?.action ?? '')
    const catatan = String(body?.catatan ?? '').slice(0, 300)

    if (action !== 'aktifkan' && action !== 'nonaktifkan') {
      return NextResponse.json({ error: 'Aksi tidak valid (aktifkan | nonaktifkan).' }, { status: 400 })
    }
    const grup = await db.grup.findUnique({ where: { id: grupId } })
    if (!grup) {
      return NextResponse.json({ error: 'Grup tidak ditemukan.' }, { status: 404 })
    }

    const targetStatus = action === 'aktifkan' ? GRUP_STATUS.AKTIF : GRUP_STATUS.DINONAKTIFKAN
    const alasan = catatan.trim() || (action === 'nonaktifkan' ? 'Dinonaktifkan via Manajemen Grup' : '')

    if (grup.status === targetStatus) {
      return NextResponse.json({ success: true, idempotent: true })
    }

    await db.grup.update({
      where: { id: grupId },
      data: {
        status: targetStatus,
        suspendReason: targetStatus === GRUP_STATUS.DINONAKTIFKAN ? alasan : '',
      },
    })

    await logGroupAudit(db, {
      grupId,
      aktorId: adminUser.id,
      aktorNama: adminUsername,
      aksi: action === 'aktifkan' ? 'grup_diaktifkan' : 'grup_dinonaktifkan',
      detail: { oleh: adminUsername, ...(action === 'nonaktifkan' ? { alasan } : {}) },
    })

    if (grup.ownerUserId) {
      await db.notification
        .create({
          data: {
            userId: grup.ownerUserId,
            title: action === 'aktifkan' ? 'Grup Diaktifkan' : 'Grup Dinonaktifkan',
            body:
              action === 'aktifkan'
                ? `Grup "${grup.nama}" (${grup.kode}) telah diaktifkan kembali oleh admin.`
                : `Grup "${grup.nama}" (${grup.kode}) dinonaktifkan oleh admin. Alasan: ${alasan}`,
            type: 'subscription',
            link: '/grup',
          },
        })
        .catch(() => {})
    }

    invalidateGroupCache()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('PATCH /api/panel-admin/groups error:', error)
    return NextResponse.json({ error: 'Gagal mengubah status grup' }, { status: 500 })
  }
}

// ===== DELETE — HAPUS PERMANEN grup (tombol Delete Manajemen Grup) =====
// Semantik lengkap di hapusGrupPermanen() (lib/grup.ts) — dipakai bersama
// DELETE /api/panel-admin/grup/[id].
export async function DELETE(request: NextRequest) {
  try {
    const err = requireAdmin(request)
    if (err) return err
    const adminUser = getServerUser(request)!
    const admin = await db.pengguna.findUnique({
      where: { id: adminUser.id },
      select: { username: true },
    })
    const adminUsername = admin?.username || adminUser.id

    const body = await request.json().catch(() => ({}))
    const grupId = String(body?.grupId ?? '')
    const catatan = String(body?.catatan ?? '')

    if (!grupId) {
      return NextResponse.json({ error: 'grupId wajib diisi.' }, { status: 400 })
    }

    const hasil = await hapusGrupPermanen(
      grupId,
      { id: adminUser.id, nama: adminUsername },
      catatan,
    )

    return NextResponse.json({
      success: true,
      deletedAccounts: hasil.deletedAccounts,
      deletedMembers: hasil.deletedMembers,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Grup tidak ditemukan.') {
      return NextResponse.json({ error: 'Grup tidak ditemukan.' }, { status: 404 })
    }
    console.error('DELETE /api/panel-admin/groups error:', error)
    return NextResponse.json({ error: 'Gagal menghapus grup' }, { status: 500 })
  }
}
