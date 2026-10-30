import { randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/server-auth'
import { getGroupContext, mergeMemberPermissions } from '@/lib/group'
import { hashPassword } from '@/lib/password'

/** Kata sandi acak yang mudah dibaca (tanpa karakter ambigu l/1/I/0/O). */
function generatePassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(10)
  let out = ''
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

/**
 * POST /api/grup/my/anggota — tambah akun anggota grup (Owner-only).
 *
 * Body: { namaLengkap, username, password?, nomorHP?, permissions? }
 * - `permissions` = map fitur yang DINYALAKAN saja → digabung dengan default
 *   role staf via mergeMemberPermissions().
 * - `password` kosong → server menghasilkan kata sandi acak dan mengembalikannya
 *   sekali via `generatedPassword` (dialog kredensial sekali-tampil).
 *
 * Response 201: { success, member: { id, username, nama }, generatedPassword? }
 */
export async function POST(request: NextRequest) {
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
        { error: 'Hanya Owner grup yang dapat menambahkan anggota' },
        { status: 403 },
      )
    }
    if (ctx.grup.status !== 'aktif') {
      return NextResponse.json(
        { error: 'Grup dinonaktifkan oleh admin Darrellsoft. Hubungi admin untuk mengaktifkan kembali.' },
        { status: 403 },
      )
    }

    const body = await request.json().catch(() => null)
    const namaLengkap = typeof body?.namaLengkap === 'string' ? body.namaLengkap.trim() : ''
    const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : ''
    const password = typeof body?.password === 'string' ? body.password.trim() : ''
    const nomorHP = typeof body?.nomorHP === 'string' ? body.nomorHP.trim() : ''
    const permissions =
      body?.permissions && typeof body.permissions === 'object' && !Array.isArray(body.permissions)
        ? (body.permissions as Record<string, boolean>)
        : null

    if (!namaLengkap) {
      return NextResponse.json({ error: 'Nama lengkap wajib diisi' }, { status: 400 })
    }
    if (!username) {
      return NextResponse.json({ error: 'Username wajib diisi' }, { status: 400 })
    }
    if (username.length < 3) {
      return NextResponse.json({ error: 'Username minimal 3 karakter' }, { status: 400 })
    }
    if (!/^[a-z0-9._-]+$/.test(username)) {
      return NextResponse.json(
        { error: 'Username hanya boleh huruf, angka, titik, garis bawah, dan strip' },
        { status: 400 },
      )
    }
    if (password && password.length < 6) {
      return NextResponse.json({ error: 'Kata sandi minimal 6 karakter' }, { status: 400 })
    }

    // Kuota = jumlah anggota MASIH TERDAFTAR (GroupMember), termasuk yang nonaktif.
    const grup = await db.grup.findUnique({ where: { id: ctx.grup.id } })
    if (!grup) {
      return NextResponse.json({ error: 'Grup tidak ditemukan' }, { status: 404 })
    }
    const used = await db.groupMember.count({ where: { grupId: grup.id } })
    if (used >= grup.maxAccounts) {
      return NextResponse.json(
        {
          error: `Kuota akun penuh (${used}/${grup.maxAccounts}). Keluarkan anggota yang tidak digunakan untuk membebaskan kuota.`,
        },
        { status: 400 },
      )
    }

    // Username harus unik di seluruh sistem (Pengguna + CalonPembeli).
    const [existPg, existCalon] = await Promise.all([
      db.pengguna.findUnique({ where: { username }, select: { id: true } }),
      db.calonPembeli.findFirst({ where: { username }, select: { id: true } }),
    ])
    if (existPg || existCalon) {
      return NextResponse.json({ error: 'Username sudah digunakan' }, { status: 409 })
    }

    const generate = !password
    const plainPassword = password || generatePassword()

    // Akses akun anggota mengikuti masa berlaku langganan grup (endDate + tenggang).
    const ownerUserId = ctx.ownerMember?.userId ?? user.id
    const sub = await db.customerSubscription.findUnique({
      where: { userId: ownerUserId },
      select: { gracePeriodEnd: true, endDate: true },
    })
    const validUntil = sub?.gracePeriodEnd ?? sub?.endDate ?? null

    // Nomor HP default: milik Owner (kolom required pada Pengguna).
    const ownerHp = ctx.members.find((m) => m.userId === ownerUserId)?.nomorHP || ''
    const actor = ctx.members.find((m) => m.userId === user.id)?.username || user.id
    const ownerUsername = ctx.members.find((m) => m.userId === ownerUserId)?.username || 'darrellsoft'

    const created = await db.$transaction(async (tx) => {
      const newUser = await tx.pengguna.create({
        data: {
          namaLengkap,
          nomorHP: nomorHP || ownerHp || '-',
          email: `${username}@grup.${ownerUsername}`,
          username,
          password: hashPassword(plainPassword),
          role: 'user',
          grupId: grup.id,
          validUntil,
        },
      })

      const gm = await tx.groupMember.create({
        data: {
          grupId: grup.id,
          userId: newUser.id,
          nama: namaLengkap,
          username,
          role: 'staf',
          status: 'aktif',
          permissions: mergeMemberPermissions('user', permissions),
        },
      })

      await tx.subscriptionAuditLog.create({
        data: {
          userId: newUser.id,
          groupId: grup.id,
          action: 'member_added',
          newStatus: 'aktif',
          performedBy: actor,
          notes: `Anggota @${username} ditambahkan oleh Owner (kuota ${used + 1}/${grup.maxAccounts}).`,
        },
      })

      await tx.notification.create({
        data: {
          userId: newUser.id,
          title: 'Ditambahkan ke Grup Perusahaan',
          body: `Akun Anda menjadi anggota grup "${grup.nama}" (${grup.kode ?? '-'}) sebagai Staf. Hubungi Owner untuk hak akses menu.`,
          type: 'system',
          link: '/beranda',
        },
      })

      return { newUser, gm }
    })

    return NextResponse.json(
      {
        success: true,
        message: `Anggota @${username} berhasil ditambahkan`,
        member: {
          id: created.gm.id,
          userId: created.newUser.id,
          username: created.newUser.username,
          nama: created.newUser.namaLengkap,
        },
        ...(generate ? { generatedPassword: plainPassword } : {}),
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('Add anggota error:', error)
    return NextResponse.json({ error: 'Gagal menambahkan anggota' }, { status: 500 })
  }
}
