import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/server-auth'
import { daysLeftUntil, deriveGroupSubStatus, getGroupContext } from '@/lib/group'

/**
 * GET /api/grup/my
 * Konteks grup perusahaan milik akun yang login (Owner maupun Staf).
 * Dipakai halaman /grup ("Grup Saya") & /grup/anggota.
 *
 * - 401  → belum login.
 * - 404 { error: 'BELUM_GRUP' } → belum tergabung dalam grup mana pun
 *   (halaman menampilkan empty state "Belum Tergabung dalam Grup").
 * - 200 → MyGrupData: profil grup, paket, langganan (milik Owner),
 *   kuota akun (terpakai/sisa), daftar anggota + hak akses, dan
 *   ringkasan perusahaan (invoice grup).
 *
 * NAMA GRUP = NAMA PERUSAHAAN: grup selalu mengikuti `company_name`
 * (UserSetting) milik Owner — nama yang diisi Owner di Pengaturan /
 * popup data perusahaan. Jika berbeda, nama grup disinkronkan otomatis.
 */
export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Anda harus login terlebih dahulu' }, { status: 401 })
    }

    const ctx = await getGroupContext(user.id)
    if (!ctx) {
      return NextResponse.json(
        { error: 'BELUM_GRUP', message: 'Anda belum tergabung dalam grup perusahaan' },
        { status: 404 },
      )
    }

    const memberIds = ctx.members.map((m) => m.userId)
    const ownerUserId = ctx.ownerMember?.userId ?? (ctx.myRole === 'owner' ? user.id : null)

    // ===== Nama grup = nama perusahaan yang diisi Owner (UserSetting company_name) =====
    let companyName = ''
    let grupNama = ctx.grup.nama
    if (ownerUserId) {
      const cs = await db.userSetting.findUnique({
        where: { userId_key: { userId: ownerUserId, key: 'company_name' } },
        select: { value: true },
      })
      companyName = (cs?.value ?? '').trim()
      if (companyName && companyName !== grupNama) {
        // Sinkronkan nama grup agar selalu sama dengan nama perusahaan
        const updated = await db.grup
          .update({
            where: { id: ctx.grup.id },
            data: { nama: companyName.slice(0, 100) },
            select: { nama: true },
          })
          .catch(() => null)
        if (updated) grupNama = updated.nama
      }
    }

    // Langganan grup = langganan milik Owner (dibagi ke seluruh anggota).
    const sub = ownerUserId
      ? await db.customerSubscription.findUnique({
          where: { userId: ownerUserId },
          include: {
            plan: { select: { id: true, name: true, monthlyPrice: true, durationDays: true } },
          },
        })
      : null

    // Paket aktif: ikut langganan berjalan; fallback ke paket saat grup dibuat.
    let plan = sub?.plan ?? null
    if (!plan && ctx.grup.paketId) {
      plan = await db.subscriptionPlan.findUnique({
        where: { id: ctx.grup.paketId },
        select: { id: true, name: true, monthlyPrice: true, durationDays: true },
      })
    }

    // Ringkasan perusahaan: invoice milik SELURUH anggota grup (data bersama).
    const [totalInvoice, belumLunasRows] = await Promise.all([
      db.invoice.count({ where: { userId: { in: memberIds } } }),
      db.invoice.findMany({
        where: { userId: { in: memberIds }, status: { notIn: ['lunas', 'batal'] } },
        select: { grandTotal: true },
      }),
    ])
    const totalPiutang = belumLunasRows.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0)

    // Owner fallback defensif (baris owner selalu ada, tapi jaga bentuk kontrak API).
    const owner =
      ctx.ownerMember ??
      (ctx.members[0]
        ? {
            memberId: ctx.members[0].id,
            userId: ctx.members[0].userId,
            nama: ctx.members[0].nama,
            username: ctx.members[0].username,
          }
        : { memberId: '', userId: '', nama: ctx.grup.nama, username: '' })

    const used = ctx.members.length
    const maxAccounts = ctx.grup.maxAccounts

    return NextResponse.json(
      {
        isMember: true,
        myRole: ctx.myRole,
        grup: {
          id: ctx.grup.id,
          kode: ctx.grup.kode ?? '',
          nama: grupNama,
          status: ctx.grup.status,
          maxAccounts,
          paket: plan
            ? { id: plan.id, name: plan.name, monthlyPrice: plan.monthlyPrice, durationDays: plan.durationDays }
            : null,
          subscription: {
            status: deriveGroupSubStatus(sub),
            startDate: sub?.startDate ? sub.startDate.toISOString() : null,
            endDate: sub?.endDate ? sub.endDate.toISOString() : null,
            gracePeriodEnd: sub?.gracePeriodEnd ? sub.gracePeriodEnd.toISOString() : null,
            daysLeft: sub?.endDate ? daysLeftUntil(sub.endDate) : null,
            graceDaysLeft: sub?.gracePeriodEnd ? daysLeftUntil(sub.gracePeriodEnd) : null,
          },
          createdAt: ctx.grup.createdAt.toISOString(),
        },
        used,
        sisa: Math.max(0, maxAccounts - used),
        owner,
        // Nama perusahaan yang diisi Owner (sumber nama grup); kosong jika belum diisi
        companyName,
        members: ctx.members.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() })),
        ringkasan: {
          totalInvoice,
          invoiceBelumLunas: belumLunasRows.length,
          totalPiutang,
        },
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
  } catch (error) {
    console.error('Get my grup error:', error)
    return NextResponse.json({ error: 'Gagal memuat data grup' }, { status: 500 })
  }
}

/**
 * PATCH /api/grup/my — ubah nama grup (Owner-only).
 * Body: { nama: string } → { success: true, grup: { id, nama } }
 * Nama grup = nama perusahaan: perubahan juga disinkronkan ke
 * UserSetting `company_name` Owner agar konsisten di seluruh aplikasi
 * (invoice, pengaturan, dsb).
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = getServerUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Anda harus login terlebih dahulu' }, { status: 401 })
    }

    const ctx = await getGroupContext(user.id)
    if (!ctx) {
      return NextResponse.json({ error: 'BELUM_GRUP' }, { status: 404 })
    }
    if (ctx.myRole !== 'owner') {
      return NextResponse.json(
        { error: 'Hanya Owner grup yang dapat mengubah nama grup' },
        { status: 403 },
      )
    }

    const body = await request.json().catch(() => null)
    const nama = typeof body?.nama === 'string' ? body.nama.trim() : ''
    if (!nama) {
      return NextResponse.json({ error: 'Nama grup tidak boleh kosong' }, { status: 400 })
    }
    if (nama.length > 100) {
      return NextResponse.json({ error: 'Nama grup maksimal 100 karakter' }, { status: 400 })
    }

    const grup = await db.grup.update({
      where: { id: ctx.grup.id },
      data: { nama },
      select: { id: true, nama: true },
    })

    // Sinkronkan nama perusahaan (UserSetting company_name milik Owner)
    // agar "nama grup = nama perusahaan" berlaku dua arah.
    const ownerUserId = ctx.ownerMember?.userId ?? (ctx.myRole === 'owner' ? user.id : null)
    if (ownerUserId) {
      await db.userSetting.upsert({
        where: { userId_key: { userId: ownerUserId, key: 'company_name' } },
        update: { value: nama },
        create: { userId: ownerUserId, key: 'company_name', value: nama },
      })
    }

    const actor = ctx.members.find((m) => m.userId === user.id)?.username || user.id
    await db.subscriptionAuditLog.create({
      data: {
        userId: user.id,
        groupId: ctx.grup.id,
        action: 'group_renamed',
        oldStatus: ctx.grup.status,
        newStatus: ctx.grup.status,
        performedBy: actor,
        notes: `Nama grup diubah menjadi "${nama}"`,
      },
    })

    return NextResponse.json({ success: true, grup: { id: grup.id, nama: grup.nama } })
  } catch (error) {
    console.error('Update my grup error:', error)
    return NextResponse.json({ error: 'Gagal memperbarui nama grup' }, { status: 500 })
  }
}
