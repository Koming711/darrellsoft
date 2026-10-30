import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, getServerUser, GRUP_MENU_IZIN, invalidateGroupCache, isAdmin } from '@/lib/server-auth'
import {
  resolveGrupForUser,
  logGroupAudit,
  ANGGOTA_STATUS,
} from '@/lib/grup'
import { hashPassword } from '@/lib/password'

export const dynamic = 'force-dynamic'

function validIzin(raw: unknown): string[] {
  const validIds = new Set(GRUP_MENU_IZIN.map((m) => m.id))
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((x): x is string => typeof x === 'string' && validIds.has(x)))]
}

async function requireOwner(request: NextRequest) {
  const authErr = requireAuth(request)
  if (authErr) return { err: authErr } as const
  const user = getServerUser(request)!
  // Admin sistem bukan Owner grup — pengelolaan anggota hanya oleh Owner
  // grup perusahaan (masing-masing grup dikelola owner-nya sendiri).
  if (isAdmin(user.role)) {
    return { err: NextResponse.json({ error: 'Admin sistem tidak dapat mengelola anggota grup. Pengelolaan hanya oleh Owner grup perusahaan.' }, { status: 403 }) } as const
  }
  const resolved = await resolveGrupForUser(user.id)
  if (!resolved) {
    return { err: NextResponse.json({ error: 'Anda belum tergabung dalam grup perusahaan.' }, { status: 404 }) } as const
  }
  if (resolved.anggota.peran !== 'owner') {
    return { err: NextResponse.json({ error: 'Hanya Owner yang dapat mengelola anggota.' }, { status: 403 }) } as const
  }
  return { user, resolved } as const
}

/**
 * PATCH /api/grup/anggota/[id] — Owner mengedit anggota:
 * nama lengkap, nomor HP, email, peran, status (aktif/nonaktif),
 * hak akses menu (izin), dan reset kata sandi (sandibaru).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const o = await requireOwner(request)
    if ('err' in o) return o.err
    const { user, resolved } = o
    const { id } = await params

    const anggota = await db.grupAnggota.findFirst({
      where: { id, grupId: resolved.grup.id, status: { not: ANGGOTA_STATUS.KELUAR } },
    })
    if (!anggota) {
      return NextResponse.json({ error: 'Anggota tidak ditemukan.' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const data: Record<string, unknown> = {}

    // Owner row tidak boleh diubah peran/status-nya
    const isOwnerRow = anggota.peran === 'owner'
    const namaLengkap = body?.namaLengkap !== undefined ? String(body.namaLengkap).trim().slice(0, 120) : undefined
    const peran = body?.peran !== undefined ? String(body.peran) : undefined
    const status = body?.status !== undefined ? String(body.status) : undefined
    const izin = body?.izin !== undefined ? validIzin(body.izin) : undefined
    const nomorHP = body?.nomorHP !== undefined ? String(body.nomorHP).trim().slice(0, 25) : undefined
    const email = body?.email !== undefined ? String(body.email).trim().slice(0, 120) : undefined
    const sandibaru = body?.sandibaru !== undefined ? String(body.sandibaru).trim() : undefined

    if (namaLengkap !== undefined && !namaLengkap) {
      return NextResponse.json({ error: 'Nama lengkap tidak boleh kosong.' }, { status: 400 })
    }
    if (peran !== undefined && !isOwnerRow && !['admin', 'staf'].includes(peran)) {
      return NextResponse.json({ error: 'Peran tidak valid.' }, { status: 400 })
    }
    if (status !== undefined && !isOwnerRow && ![ANGGOTA_STATUS.AKTIF, ANGGOTA_STATUS.NONAKTIF].includes(status as never)) {
      return NextResponse.json({ error: 'Status tidak valid.' }, { status: 400 })
    }
    if (sandibaru !== undefined && sandibaru && sandibaru.length < 6) {
      return NextResponse.json({ error: 'Kata sandi minimal 6 karakter.' }, { status: 400 })
    }

    await db.$transaction(async (tx) => {
      // ===== Baris GrupAnggota =====
      const gaData: Record<string, unknown> = {}
      if (namaLengkap !== undefined) gaData.namaLengkap = namaLengkap
      if (peran !== undefined && !isOwnerRow) gaData.peran = peran
      if (status !== undefined && !isOwnerRow) gaData.status = status
      if (izin !== undefined && !isOwnerRow) gaData.izin = JSON.stringify(izin)
      if (Object.keys(gaData).length > 0) {
        await tx.grupAnggota.update({ where: { id: anggota.id }, data: gaData })
      }

      // ===== Akun Pengguna terkait (bukan owner CalonPembeli) =====
      if (anggota.tipeAnggota === 'pengguna') {
        const puData: Record<string, unknown> = {}
        if (namaLengkap !== undefined) puData.namaLengkap = namaLengkap
        if (nomorHP !== undefined) puData.nomorHP = nomorHP
        if (email !== undefined) puData.email = email
        if (sandibaru !== undefined && sandibaru) puData.password = hashPassword(sandibaru)
        if (Object.keys(puData).length > 0) {
          // Guard: memberId bisa menggantung (akun sudah terhapus, baris
          // GrupAnggota tersisa) — jangan biarkan update P2025 menggagalkan
          // seluruh simpanan; data GrupAnggota (nama/peran/izin) tetap disimpan.
          const akunAda = await tx.pengguna.findUnique({ where: { id: anggota.memberId }, select: { id: true } })
          if (akunAda) {
            await tx.pengguna.update({ where: { id: anggota.memberId }, data: puData })
          }
        }
        // Sinkronkan record Pembeli (nama tampil di daftar pembeli)
        if (namaLengkap !== undefined || nomorHP !== undefined || email !== undefined) {
          await tx.pembeli.updateMany({
            where: { penggunaId: anggota.memberId },
            data: {
              ...(namaLengkap !== undefined ? { nama: namaLengkap } : {}),
              ...(nomorHP !== undefined ? { nomorHP: nomorHP || '-' } : {}),
              ...(email !== undefined ? { email } : {}),
            },
          })
        }
      }
    })

    await logGroupAudit(db, {
      grupId: resolved.grup.id,
      aktorId: user.id,
      aktorNama: user.id,
      aksi: 'anggota_diedit',
      detail: {
        anggotaId: anggota.id,
        ...(namaLengkap !== undefined ? { namaLengkap } : {}),
        ...(peran !== undefined && !isOwnerRow ? { peran } : {}),
        ...(status !== undefined && !isOwnerRow ? { status } : {}),
        ...(izin !== undefined && !isOwnerRow ? { izin } : {}),
        ...(sandibaru !== undefined && sandibaru ? { sandiDireset: true } : {}),
      },
    })
    invalidateGroupCache()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('PATCH /api/grup/anggota/[id] error:', error)
    return NextResponse.json({ error: 'Gagal menyimpan anggota' }, { status: 500 })
  }
}

/**
 * DELETE /api/grup/anggota/[id] — Owner mengeluarkan anggota dari grup.
 * - Baris keanggotaan ditandai "keluar" (riwayat & audit tetap ada).
 * - Akun login anggota (Pengguna + Pembeli) dihapus — kuota langsung bebas.
 * - Data yang pernah dibuat anggota TETAP ADA sebagai data perusahaan
 *   (userId-nya tetap ikut cakupan grup melalui anggota lain yang melihat
 *   riwayat; tidak ada data perusahaan yang terhapus otomatis).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const o = await requireOwner(request)
    if ('err' in o) return o.err
    const { user, resolved } = o
    const { id } = await params

    const anggota = await db.grupAnggota.findFirst({
      where: { id, grupId: resolved.grup.id, status: { not: ANGGOTA_STATUS.KELUAR } },
    })
    if (!anggota) {
      return NextResponse.json({ error: 'Anggota tidak ditemukan.' }, { status: 404 })
    }
    if (anggota.peran === 'owner') {
      return NextResponse.json({ error: 'Owner tidak dapat dikeluarkan dari grupnya sendiri.' }, { status: 400 })
    }

    await db.$transaction(async (tx) => {
      await tx.grupAnggota.update({
        where: { id: anggota.id },
        data: { status: ANGGOTA_STATUS.KELUAR, izin: '[]' },
      })
      if (anggota.tipeAnggota === 'pengguna') {
        await tx.pembeli.deleteMany({ where: { penggunaId: anggota.memberId } })
        await tx.pengguna.deleteMany({ where: { id: anggota.memberId, role: { notIn: ['admin', 'superadmin'] } } })
      }
    })

    await logGroupAudit(db, {
      grupId: resolved.grup.id,
      aktorId: user.id,
      aktorNama: user.id,
      aksi: 'anggota_dikeluarkan',
      detail: { anggotaId: anggota.id, namaLengkap: anggota.namaLengkap, memberId: anggota.memberId },
    })
    invalidateGroupCache()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/grup/anggota/[id] error:', error)
    return NextResponse.json({ error: 'Gagal mengeluarkan anggota' }, { status: 500 })
  }
}
