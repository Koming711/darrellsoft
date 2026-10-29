import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, getServerUser, invalidateGroupCache } from '@/lib/server-auth'
import { resolveGrupForUser, logGroupAudit, ANGGOTA_STATUS } from '@/lib/grup'
import { hashPassword } from '@/lib/password'

export const dynamic = 'force-dynamic'

function acakPassword(len = 8): string {
  const huruf = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < len; i++) out += huruf[Math.floor(Math.random() * huruf.length)]
  return out
}

/**
 * POST /api/grup/anggota/[id]/reset-sandi — Owner me-reset kata sandi anggota.
 * Sandi baru dibuat acak (atau dikirim Owner), di-hash di database, dan
 * dikembalikan SEKALI dalam respons untuk dibagikan ke anggota secara aman.
 * Tidak pernah dicatat plaintext pada audit log.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const resolved = await resolveGrupForUser(user.id)
    if (!resolved) {
      return NextResponse.json({ error: 'Anda belum tergabung dalam grup perusahaan.' }, { status: 404 })
    }
    if (resolved.anggota.peran !== 'owner') {
      return NextResponse.json({ error: 'Hanya Owner yang dapat me-reset kata sandi anggota.' }, { status: 403 })
    }

    const { id } = await params
    const anggota = await db.grupAnggota.findFirst({
      where: { id, grupId: resolved.grup.id, status: { not: ANGGOTA_STATUS.KELUAR } },
    })
    if (!anggota) {
      return NextResponse.json({ error: 'Anggota tidak ditemukan.' }, { status: 404 })
    }
    if (anggota.peran === 'owner') {
      return NextResponse.json({ error: 'Gunakan fitur ubah profil untuk mengganti sandi Anda sendiri.' }, { status: 400 })
    }
    if (anggota.tipeAnggota !== 'pengguna') {
      return NextResponse.json({ error: 'Anggota belum memiliki akun login Pengguna.' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const manual = String(body?.sandibaru ?? '').trim()
    if (manual && manual.length < 6) {
      return NextResponse.json({ error: 'Kata sandi minimal 6 karakter.' }, { status: 400 })
    }
    const sandibaru = manual || acakPassword(8)

    const updated = await db.pengguna.updateMany({
      where: { id: anggota.memberId },
      data: { password: hashPassword(sandibaru) },
    })
    if (updated.count === 0) {
      return NextResponse.json({ error: 'Akun login anggota tidak ditemukan.' }, { status: 404 })
    }

    await logGroupAudit(db, {
      grupId: resolved.grup.id,
      aktorId: user.id,
      aktorNama: user.id,
      aksi: 'sandi_anggota_direset',
      detail: { anggotaId: anggota.id, namaLengkap: anggota.namaLengkap },
    })
    invalidateGroupCache(anggota.memberId)

    return NextResponse.json({ success: true, sandibaru })
  } catch (error) {
    console.error('POST /api/grup/anggota/[id]/reset-sandi error:', error)
    return NextResponse.json({ error: 'Gagal reset kata sandi' }, { status: 500 })
  }
}
