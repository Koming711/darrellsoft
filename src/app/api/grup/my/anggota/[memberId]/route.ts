import { randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/server-auth'
import {
  addGroupAudit,
  getGroupContext,
  stringifyMemberPermissions,
  transferMemberData,
} from '@/lib/group'
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
 * Helper /api/grup/my/anggota/[memberId] — kelola satu anggota grup (Owner-only).
 *
 * PATCH body (varian, boleh digabung):
 * - { namaLengkap, nomorHP? }            → perbarui data anggota
 * - { permissions: {fitur: boolean} }    → atur hak akses (map LENGKAP)
 * - { resetPassword: true, newPassword?} → reset sandi (kosong = acak →
 *   dikembalikan sekali via `generatedPassword`)
 * - { status: 'aktif' | 'nonaktif' }     → aktifkan / nonaktifkan anggota
 *
 * DELETE → keluarkan anggota: data perusahaannya dipindahkan ke Owner
 * (transferMemberData), keanggotaan dihapus (kuota bebas), dan akun login
 * anggota dihapus bila aman (fallback: akses dicabut via validUntil).
 */

type RouteCtx = { params: Promise<{ memberId: string }> }

/** Muat konteks grup + pastikan pemanggil Owner & anggota target valid. */
async function resolveOwnerAndMember(request: NextRequest, memberId: string) {
  const user = getServerUser(request)
  if (!user) {
    return { error: NextResponse.json({ error: 'Anda harus login terlebih dahulu' }, { status: 401 }) }
  }
  const ctx = await getGroupContext(user.id)
  if (!ctx) {
    return { error: NextResponse.json({ error: 'BELUM_GRUP' }, { status: 404 }) }
  }
  if (ctx.myRole !== 'owner') {
    return {
      error: NextResponse.json(
        { error: 'Hanya Owner grup yang dapat mengelola anggota' },
        { status: 403 },
      ),
    }
  }

  const member = ctx.members.find((m) => m.id === memberId)
  if (!member) {
    return { error: NextResponse.json({ error: 'Anggota tidak ditemukan' }, { status: 404 }) }
  }

  const actor = ctx.members.find((m) => m.userId === user.id)?.username || user.id
  return { user, ctx, member, actor }
}

export async function PATCH(request: NextRequest, { params }: RouteCtx) {
  try {
    const { memberId } = await params
    const resolved = await resolveOwnerAndMember(request, memberId)
    if ('error' in resolved) return resolved.error
    const { user, ctx, member, actor } = resolved

    if (member.role === 'owner') {
      return NextResponse.json(
        { error: 'Owner grup tidak dapat diubah dari menu anggota' },
        { status: 400 },
      )
    }
    if (ctx.grup.status !== 'aktif') {
      return NextResponse.json(
        { error: 'Grup dinonaktifkan oleh admin Darrellsoft.' },
        { status: 403 },
      )
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Data tidak valid' }, { status: 400 })
    }

    const wantsProfile = 'namaLengkap' in body || 'nomorHP' in body
    const wantsPermissions =
      'permissions' in body &&
      body.permissions &&
      typeof body.permissions === 'object' &&
      !Array.isArray(body.permissions)
    const wantsReset =
      body.resetPassword === true || (typeof body.newPassword === 'string' && body.newPassword.length > 0)
    const wantsStatus = typeof body.status === 'string' && ['aktif', 'nonaktif'].includes(body.status)

    if (!wantsProfile && !wantsPermissions && !wantsReset && !wantsStatus) {
      return NextResponse.json({ error: 'Tidak ada perubahan yang dikirim' }, { status: 400 })
    }

    // ===== Validasi =====
    let newNama = member.nama
    let newHp: string | undefined
    if (wantsProfile) {
      if (typeof body.namaLengkap === 'string') {
        newNama = body.namaLengkap.trim()
        if (!newNama) {
          return NextResponse.json({ error: 'Nama lengkap wajib diisi' }, { status: 400 })
        }
      }
      if (typeof body.nomorHP === 'string') newHp = body.nomorHP.trim()
    }

    let plainPassword: string | null = null
    let generated = false
    if (wantsReset) {
      const supplied = typeof body.newPassword === 'string' ? body.newPassword.trim() : ''
      if (supplied && supplied.length < 6) {
        return NextResponse.json({ error: 'Kata sandi minimal 6 karakter' }, { status: 400 })
      }
      generated = !supplied
      plainPassword = supplied || generatePassword()
    }

    if (wantsStatus && member.status === body.status) {
      // Idempoten — tidak ada yang berubah, tetap sukses.
      return NextResponse.json({ success: true, member })
    }

    // ===== Terapkan =====
    const updated = await db.$transaction(async (tx) => {
      // 1) Profil: snapshot GroupMember + akun login (Pengguna, fallback CalonPembeli)
      if (wantsProfile) {
        await tx.groupMember.update({
          where: { id: member.id },
          data: { nama: newNama },
        })
        const pg = await tx.pengguna.findUnique({ where: { id: member.userId }, select: { id: true } })
        if (pg) {
          await tx.pengguna.update({
            where: { id: member.userId },
            data: { namaLengkap: newNama, ...(newHp !== undefined ? { nomorHP: newHp || '-' } : {}) },
          })
        } else {
          await tx.calonPembeli
            .updateMany({
              where: { id: member.userId },
              data: { nama: newNama, ...(newHp !== undefined ? { nomorHP: newHp } : {}) },
            })
            .catch(() => {})
        }
      }

      // 2) Hak akses (staf saja — map lengkap fitur → boolean)
      if (wantsPermissions) {
        await tx.groupMember.update({
          where: { id: member.id },
          data: { permissions: stringifyMemberPermissions(body.permissions as Record<string, boolean>) },
        })
      }

      // 3) Reset sandi akun login anggota
      if (plainPassword) {
        const pg = await tx.pengguna.findUnique({ where: { id: member.userId }, select: { id: true } })
        if (pg) {
          await tx.pengguna.update({
            where: { id: member.userId },
            data: { password: hashPassword(plainPassword) },
          })
        } else {
          await tx.calonPembeli
            .updateMany({
              where: { id: member.userId },
              data: { password: hashPassword(plainPassword) },
            })
            .catch(() => {})
        }
      }

      // 4) Status keanggotaan
      if (wantsStatus) {
        await tx.groupMember.update({
          where: { id: member.id },
          data: { status: body.status },
        })
      }

      await addGroupAudit(tx, {
        groupId: ctx.grup.id,
        userId: member.userId,
        action: wantsReset
          ? 'member_password_reset'
          : wantsStatus
            ? body.status === 'aktif'
              ? 'member_activated'
              : 'member_deactivated'
            : wantsPermissions
              ? 'member_permissions_updated'
              : 'member_updated',
        oldStatus: member.status,
        newStatus: wantsStatus ? body.status : member.status,
        performedBy: actor,
        notes: wantsReset
          ? `Kata sandi anggota @${member.username} direset oleh Owner`
          : wantsPermissions
            ? `Hak akses anggota @${member.username} diperbarui`
            : wantsProfile
              ? `Data anggota @${member.username} diperbarui`
              : `Status anggota @${member.username} → ${body.status}`,
      })

      return tx.groupMember.findUnique({ where: { id: member.id } })
    })

    return NextResponse.json({
      success: true,
      message: 'Perubahan anggota tersimpan',
      member: updated
        ? {
            id: updated.id,
            userId: updated.userId,
            nama: updated.nama,
            username: updated.username,
            role: updated.role,
            status: updated.status,
          }
        : { id: member.id, username: member.username },
      ...(generated && plainPassword ? { generatedPassword: plainPassword } : {}),
    })
  } catch (error) {
    console.error('Patch anggota error:', error)
    return NextResponse.json({ error: 'Gagal memperbarui anggota' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteCtx) {
  try {
    const { memberId } = await params
    const resolved = await resolveOwnerAndMember(request, memberId)
    if ('error' in resolved) return resolved.error
    const { user, ctx, member, actor } = resolved

    if (member.role === 'owner') {
      return NextResponse.json(
        { error: 'Owner grup tidak dapat dikeluarkan dari grup' },
        { status: 400 },
      )
    }
    if (ctx.grup.status !== 'aktif') {
      return NextResponse.json(
        { error: 'Grup dinonaktifkan oleh admin Darrellsoft.' },
        { status: 403 },
      )
    }

    const ownerUserId = ctx.ownerMember?.userId ?? user.id

    await db.$transaction(async (tx) => {
      // 1) Data perusahaan milik anggota pindah ke Owner agar tidak hilang
      //    dari pandangan grup (kuota ikut bebas setelah keanggotaan dihapus).
      await transferMemberData(tx, member.userId, ownerUserId)

      // 2) Hapus keanggotaan
      await tx.groupMember.delete({ where: { id: member.id } })

      // 3) Akun login anggota: hapus bila aman (tidak direferensikan
      //    CalonPembeli); fallback — cabut akses via validUntil.
      const referenced = await tx.calonPembeli.count({ where: { userId: member.userId } })
      if (referenced === 0) {
        await tx.pengguna.delete({ where: { id: member.userId } }).catch(() => {
          /* FK lain — biarkan akun, akses sudah dicabut lewat keanggotaan */
        })
      } else {
        await tx.pengguna
          .update({ where: { id: member.userId }, data: { validUntil: new Date() } })
          .catch(() => {})
      }

      await addGroupAudit(tx, {
        groupId: ctx.grup.id,
        userId: member.userId,
        action: 'member_removed',
        oldStatus: member.status,
        newStatus: 'dikeluarkan',
        performedBy: actor,
        notes: `Anggota @${member.username} dikeluarkan oleh Owner — data perusahaannya dipindahkan ke Owner.`,
      })

      // 4) Notifikasi pemulangan data (ke Owner) — akun anggota mungkin sudah dihapus
      await tx.notification.create({
        data: {
          userId: ownerUserId,
          title: 'Anggota Dikeluarkan',
          body: `@${member.username} dikeluarkan dari grup "${ctx.grup.nama}". Data perusahaannya dipindahkan ke Anda dan kuota akun bertambah satu.`,
          type: 'system',
          link: '/grup/anggota',
        },
      })
    })

    return NextResponse.json({
      success: true,
      message: `Anggota @${member.username} dikeluarkan dari grup`,
    })
  } catch (error) {
    console.error('Delete anggota error:', error)
    return NextResponse.json({ error: 'Gagal mengeluarkan anggota' }, { status: 500 })
  }
}
