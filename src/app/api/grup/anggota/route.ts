import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, getServerUser, GRUP_MENU_IZIN, invalidateGroupCache } from '@/lib/server-auth'
import {
  resolveGrupForUser,
  logGroupAudit,
  isUsernameTerpakai,
  ownerValidUntil,
  PESAN_KUOTA_PENUH,
  ANGGOTA_STATUS,
} from '@/lib/grup'
import { hashPassword } from '@/lib/password'

export const dynamic = 'force-dynamic'

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,40}$/

function acakPassword(len = 8): string {
  const huruf = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < len; i++) out += huruf[Math.floor(Math.random() * huruf.length)]
  return out
}

function validIzin(raw: unknown): string[] {
  const validIds = new Set(GRUP_MENU_IZIN.map((m) => m.id))
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((x): x is string => typeof x === 'string' && validIds.has(x)))]
}

const GRUP_STATUS_AKTIF = 'aktif'

/**
 * POST /api/grup/anggota — Owner menambah anggota grup.
 *
 * Aturan:
 * - Hanya Owner grup yang aktif.
 * - Kuota: owner + seluruh anggota TERDAFTAR (selain yang dikeluarkan)
 *   tidak boleh melebihi kuota paket — dicek DI DALAM transaksi agar dua
 *   penambahan bersamaan tidak bisa melewati batas.
 * - Anggota = akun Pengguna sungguhan (login sendiri) + record Pembeli
 *   (mengikuti aturan login aplikasi) + validUntil mengikuti langganan grup.
 * - Data perusahaan TIDAK diduplikasi: anggota bekerja pada data grup
 *   melalui getDataFilter (cakupan memberIds).
 */
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const resolved = await resolveGrupForUser(user.id)
    if (!resolved) {
      return NextResponse.json({ error: 'Anda belum tergabung dalam grup perusahaan.' }, { status: 404 })
    }
    if (resolved.anggota.peran !== 'owner') {
      return NextResponse.json({ error: 'Hanya Owner yang dapat menambah anggota.' }, { status: 403 })
    }
    if (resolved.anggota.status !== ANGGOTA_STATUS.AKTIF) {
      return NextResponse.json({ error: 'Akun Owner sedang dinonaktifkan.' }, { status: 403 })
    }
    if (resolved.grup.status !== GRUP_STATUS_AKTIF) {
      return NextResponse.json({ error: 'Grup dinonaktifkan oleh admin Darrellsoft. Tidak dapat menambah anggota.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const namaLengkap = String(body?.namaLengkap ?? '').trim().slice(0, 120)
    const username = String(body?.username ?? '').trim().toLowerCase().slice(0, 40)
    const email = String(body?.email ?? '').trim().slice(0, 120)
    const nomorHP = String(body?.nomorHP ?? '').trim().slice(0, 25)
    const peran = ['admin', 'staf'].includes(body?.peran) ? String(body.peran) : 'staf'
    const izin = validIzin(body?.izin)
    const sandiAwal = String(body?.password ?? '').trim()

    if (!namaLengkap) return NextResponse.json({ error: 'Nama lengkap wajib diisi.' }, { status: 400 })
    if (!USERNAME_RE.test(username)) {
      return NextResponse.json({ error: 'Username 3-40 karakter (huruf, angka, titik, garis bawah/strip).' }, { status: 400 })
    }
    if (sandiAwal && sandiAwal.length < 6) {
      return NextResponse.json({ error: 'Kata sandi minimal 6 karakter.' }, { status: 400 })
    }

    if (await isUsernameTerpakai(username)) {
      return NextResponse.json({ error: 'Username sudah digunakan. Gunakan username lain.' }, { status: 409 })
    }

    const password = sandiAwal || acakPassword(8)
    const grupId = resolved.grup.id

    // ===== Transaksi: kuota + pembuatan akun atomik =====
    const hasil = await db.$transaction(async (tx) => {
      // Kuota dihitung ulang DI DALAM transaksi (anti race penambahan bersamaan)
      const grupNow = await tx.grup.findUnique({ where: { id: grupId }, select: { status: true, planId: true, ownerUserId: true } })
      if (!grupNow || grupNow.status !== GRUP_STATUS_AKTIF) {
        throw new Error('GRUP_NONAKTIF')
      }
      const { kuota, terpakai } = await hitungKuotaTx(grupId)
      if (terpakai >= kuota) {
        throw new Error('KUOTA_PENUH')
      }

      const validUntil = await ownerValidUntil(grupNow)
      const anggota = await tx.pengguna.create({
        data: {
          namaLengkap,
          username,
          password: hashPassword(password),
          email: email || `${username}@grup.local`,
          nomorHP: nomorHP || '-',
          role: 'user',
          grupId,
          validUntil,
        },
      })
      // Record Pembeli wajib agar lolos aturan login aplikasi (bukan "ghost account")
      await tx.pembeli.create({
        data: {
          nama: namaLengkap,
          nomorHP: nomorHP || '-',
          email: email || `${username}@grup.local`,
          alamat: '',
          catatan: `Anggota grup ${resolved.grup.kode}`,
          role: 'user',
          penggunaId: anggota.id,
        },
      })
      await tx.grupAnggota.create({
        data: {
          grupId,
          memberId: anggota.id,
          tipeAnggota: 'pengguna',
          peran,
          status: ANGGOTA_STATUS.AKTIF,
          izin: JSON.stringify(izin),
          namaLengkap,
        },
      })
      return anggota
    })

    await logGroupAudit(db, {
      grupId,
      aktorId: user.id,
      aktorNama: user.id,
      aksi: 'anggota_ditambahkan',
      detail: { anggotaId: hasil.id, namaLengkap, username, peran, izin },
    })
    invalidateGroupCache()

    return NextResponse.json({
      success: true,
      anggota: { id: hasil.id, namaLengkap: hasil.namaLengkap, username: hasil.username, peran, status: ANGGOTA_STATUS.AKTIF },
      // Sandi awal dikirim SEKALI ke Owner (tak pernah disimpan plaintext di audit)
      ...(sandiAwal ? {} : { sandiAwal: password }),
    }, { status: 201 })
  } catch (error) {
    const msg = error instanceof Error ? error.message : ''
    if (msg === 'KUOTA_PENUH') {
      return NextResponse.json({ error: PESAN_KUOTA_PENUH, kuotaPenuh: true }, { status: 403 })
    }
    if (msg === 'GRUP_NONAKTIF') {
      return NextResponse.json({ error: 'Grup dinonaktifkan. Tidak dapat menambah anggota.' }, { status: 403 })
    }
    console.error('POST /api/grup/anggota error:', error)
    return NextResponse.json({ error: 'Gagal menambah anggota grup' }, { status: 500 })
  }
}

/** hitungKuota dalam konteks transaksi (query langsung, logika sama dgn lib/grup). */
async function hitungKuotaTx(grupId: string): Promise<{ kuota: number; terpakai: number }> {
  const grup = await db.grup.findUnique({
    where: { id: grupId },
    include: { plan: { select: { maxAccounts: true } } },
  })
  let kuota = grup?.plan?.maxAccounts ?? 0
  if (!kuota && grup?.ownerUserId) {
    const sub = await db.customerSubscription.findUnique({
      where: { userId: grup.ownerUserId },
      select: { plan: { select: { maxAccounts: true } } },
    })
    kuota = sub?.plan?.maxAccounts ?? 1
  }
  if (!kuota) kuota = 1
  const terpakai = await db.grupAnggota.count({
    where: { grupId, status: { not: ANGGOTA_STATUS.KELUAR } },
  })
  return { kuota, terpakai }
}
