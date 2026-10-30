import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { ensureSeedData, seedUserData, seedKategoriForUser } from '@/lib/auto-seed'
import { buildDefaultPermissions, buildDefaultSubPermissions } from '@/lib/permission-defaults'
import { sanitizeError } from '@/lib/api-error'
import { verifyPassword } from '@/lib/password'

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()

    // Auto-seed global data (users, settings) if not yet seeded
    await ensureSeedData(null)

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username dan password wajib diisi' },
        { status: 400 }
      )
    }

    // 1. Cari SEMUA kandidat Pengguna dengan username tersebut.
    // NAMESPACE TERPISAH: username boleh dipakai akun grup DAN akun pengelola
    // sekaligus (ruang nama berbeda) - sandi yang menentukan akun mana yang login.
    const kandidatPengguna = await db.pengguna.findMany({
      where: { username },
      orderBy: { createdAt: 'asc' },
    })
    let pengguna: (typeof kandidatPengguna)[number] | null = null
    for (const k of kandidatPengguna) {
      // Kompatibel hash bcrypt (akun baru) & plaintext legacy (akun lama)
      if (verifyPassword(password, k.password)) {
        pengguna = k
        break
      }
    }

    if (pengguna) {
      if (pengguna.validUntil) {
        if (new Date(pengguna.validUntil) < new Date()) {
          return NextResponse.json({ error: 'Akun sudah expired. Silahkan diperpanjang lagi akunnya.', expired: true }, { status: 403 })
        }
      }

      // === GRUP PERUSAHAAN: blokir anggota nonaktif / grup dinonaktifkan ===
      const grupMember = await db.grupAnggota.findFirst({
        where: { memberId: pengguna.id, status: { not: 'keluar' } },
        include: { grup: { select: { nama: true, status: true } } },
      })
      if (grupMember) {
        if (grupMember.status === 'nonaktif') {
          return NextResponse.json({ error: 'Akun Anda dinonaktifkan oleh Owner grup. Hubungi Owner untuk mengaktifkan kembali.' }, { status: 403 })
        }
        if (grupMember.grup.status === 'dinonaktifkan') {
          return NextResponse.json({ error: 'Grup perusahaan dinonaktifkan. Hubungi admin Darrellsoft.' }, { status: 403 })
        }
      }

      // For non-admin roles (user, demo, manager), verify they have a Pembeli record
      // This prevents "ghost" accounts that can login but don't appear in any list
      if (pengguna.role !== 'admin' && pengguna.role !== 'superadmin') {
        const pembeli = await db.pembeli.findFirst({
          where: { penggunaId: pengguna.id }
        })
        const calonCheck = await db.calonPembeli.findFirst({
          where: { userId: pengguna.id }
        })
        if (!pembeli && !calonCheck) {
          // Orphaned Pengguna - auto cleanup and deny login
          try {
            await db.calonPembeli.updateMany({
              where: { userId: pengguna.id },
              data: { userId: null }
            })
            await db.pengguna.delete({ where: { id: pengguna.id } })
          } catch {}
          return NextResponse.json({ error: 'Akun tidak terdaftar sebagai pembeli. Silakan daftar ulang.' }, { status: 403 })
        }
        if (!pembeli) {
          return NextResponse.json({ error: 'Akun tidak terdaftar sebagai pembeli. Hubungi administrator.' }, { status: 403 })
        }
      }

      return await buildLoginResponse(pengguna.id, pengguna.username, pengguna.namaLengkap, pengguna.role, pengguna.validUntil, username)
    }

    // 2. Tidak cocok di Pengguna -> cek kandidat CalonPembeli (owner grup /
    //    pendaftar mandiri). Username sama dgn akun grup tetap aman - sandi menentukan.
    const kandidatCalon = await db.calonPembeli.findMany({
      where: { username }
    })
    let calon: (typeof kandidatCalon)[number] | null = null
    for (const k of kandidatCalon) {
      if (verifyPassword(password, k.password)) {
        calon = k
        break
      }
    }

    if (calon) {
      // Status "ditolak" -> blokir
      if (calon.status === 'ditolak') {
        return NextResponse.json({ error: 'Pendaftaran Anda ditolak oleh administrator.', rejected: true }, { status: 403 })
      }

      // Check expiry date for CalonPembeli
      if (calon.expiredDate && new Date(calon.expiredDate) < new Date()) {
        return NextResponse.json({ error: 'Akun sudah expired. Silahkan diperpanjang lagi akunnya.', expired: true }, { status: 403 })
      }

      // === GRUP PERUSAHAAN: blokir bila grup dinonaktifkan (owner CalonPembeli) ===
      const grupCalon = await db.grupAnggota.findFirst({
        where: { memberId: calon.id, status: { not: 'keluar' } },
        include: { grup: { select: { status: true } } },
      })
      if (grupCalon?.grup.status === 'dinonaktifkan') {
        return NextResponse.json({ error: 'Grup perusahaan dinonaktifkan. Hubungi admin Darrellsoft.' }, { status: 403 })
      }

      // Status "baru" atau "aktif" -> langsung izinkan login
      // Pakai CalonPembeli ID sebagai userId, role = demo
      const role = calon.role || 'demo'
      return await buildLoginResponse(calon.id, calon.username || username, calon.nama, role, calon.expiredDate, calon.username || username)
    }

    // 3. Tidak ditemukan di mana pun
    return NextResponse.json({ error: 'Username atau password salah' }, { status: 401 })
  } catch (error) {
    console.error('Login error:', error)
    const message = sanitizeError(error, 'Terjadi kesalahan server')
    return NextResponse.json({ error: 'Terjadi kesalahan server', details: message }, { status: 500 })
  }
}

// Shared helper: build login response with session, cookies, permissions
async function buildLoginResponse(
  userId: string,
  username: string,
  name: string,
  role: string,
  validUntil: Date | null,
  usernameForSession: string
): Promise<NextResponse> {
  const sessionId = randomUUID()

  // Check single device setting
  const singleDeviceSetting = await db.setting.findUnique({ where: { key: 'single_device' } })
  const singleDevice = singleDeviceSetting?.value !== 'false'

  if (singleDevice || role === 'admin' || role === 'superadmin') {
    await db.setting.upsert({
      where: { key: `session_${usernameForSession}` },
      update: { value: sessionId },
      create: { key: `session_${usernameForSession}`, value: sessionId },
    })
  }

  // Get demo popup message and remaining days for demo users
  let demoPopupMessage: string | null = null
  let demoRemainingDays: number | null = null
  if (role === 'demo') {
    const defaultDemoMsg = `Selamat datang! Anda sedang menggunakan akun demo.\n\nFitur yang tersedia:\n✅ Potong Kertas\n✅ Hitung Cetakan\n\nUntuk akses penuh ke semua fitur (Master Data, Riwayat, Pengaturan, dll), silakan hubungi administrator.`
    const demoMsgSetting = await db.setting.findUnique({ where: { key: 'demo_message' } })
    demoPopupMessage = demoMsgSetting?.value || defaultDemoMsg
    if (validUntil) {
      const remaining = Math.ceil((new Date(validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      demoRemainingDays = Math.max(0, remaining)
    }
  }

  // Seed sample master data in background - don't block login response
  // This handles the case where existing accounts were created before auto-seed was added.
  // GRUP PERUSAHAAN: anggota grup TIDAK di-seed data personal agar tidak menduplikasi
  // data perusahaan yang dibagikan (mereka bekerja pada data milik grup).
  const isGroupMember = await db.grupAnggota.findFirst({
    where: { memberId: userId, status: { not: 'keluar' }, peran: { not: 'owner' } },
    select: { id: true },
  }).catch(() => null)

  if (!isGroupMember) {
    seedUserData(userId).catch(seedErr => {
      console.warn('⚠️ Seed data error during login (non-fatal):', seedErr)
    })

    // Seed 10 kategori default (Daftar Kategori v123) — independen dari master data,
    // user lama yang sudah punya master data tetap mendapat kategori bawaan.
    seedKategoriForUser(userId).catch(seedErr => {
      console.warn('⚠️ Seed kategori error during login (non-fatal):', seedErr)
    })
  }

  // ===== Arah lanjut sesuai status langganan (alur pendaftaran → pilih paket → bayar) =====
  // - Tagihan menunggu_pembayaran → arahkan ke halaman pembayaran (belum kirim bukti).
  // - Tagihan menunggu_verifikasi (konfirmasi pembayaran sudah terkirim) → masuk ke
  //   beranda aplikasi (/pembukaan); popup "Aplikasi Belum Dapat Digunakan" tampil di sana.
  // - Belum pernah memilih paket (tanpa langganan aktif) → /pilih-paket.
  // - Admin/superadmin/manager & akun berbayar aktif → tidak diarahkan (null = default).
  // - Role 'user' (aktivasi manual admin tanpa record langganan) tidak dipaksa ke
  //   /pilih-paket agar alur lama tetap berfungsi — cukup tagihan terbuka yang dicek.
  let subscriptionRedirect: string | null = null
  if (role !== 'admin' && role !== 'superadmin' && role !== 'manager') {
    try {
      const [openInv, sub] = await Promise.all([
        db.subscriptionInvoice.findFirst({
          where: { userId, status: { in: ['menunggu_pembayaran', 'menunggu_verifikasi'] } },
          orderBy: { createdAt: 'desc' },
          select: { id: true, status: true },
        }),
        db.customerSubscription.findUnique({ where: { userId }, select: { status: true } }),
      ])
      if (openInv) {
        subscriptionRedirect =
          openInv.status === 'menunggu_verifikasi'
            ? '/pembukaan'
            : `/langganan/pembayaran/${openInv.id}`
      } else if (role === 'demo' && (!sub || ['belum_aktif', 'kedaluwarsa', 'dibatalkan'].includes(sub.status))) {
        // Pelanggan funnel pendaftaran mandiri yang belum punya langganan aktif
        subscriptionRedirect = '/pilih-paket'
      }
    } catch { /* non-fatal — jangan blokir login */ }
  }

  // Load custom permissions from database
  // Start with defaults so new features are always included
  const defaultFeatures = buildDefaultPermissions(role)
  const defaultSubPermissions = buildDefaultSubPermissions(role)
  let features = { ...defaultFeatures }
  let subPermissions = JSON.parse(JSON.stringify(defaultSubPermissions))

  try {
    const customPermsSetting = await db.setting.findUnique({ where: { key: 'role_permissions' } })
    if (customPermsSetting?.value) {
      const allPerms = JSON.parse(customPermsSetting.value)
      if (allPerms[role]) {
        // Merge: custom overrides defaults, but new features from defaults are kept
        if (allPerms[role].features) {
          for (const [key, val] of Object.entries(allPerms[role].features)) {
            features[key] = val as boolean
          }
        }
        if (allPerms[role].subPermissions) {
          for (const [group, subs] of Object.entries(allPerms[role].subPermissions)) {
            if (typeof subs === 'object' && subs !== null && !Array.isArray(subs)) {
              subPermissions[group] = { ...(subPermissions[group] || {}), ...(subs as Record<string, boolean>) }
            }
          }
        }
      }
    }
  } catch {}

  // ===== Info grup perusahaan (untuk RBAC menu di sisi klien) =====
  // Owner: mengelola grup; anggota: hak akses dari izin yang diatur Owner.
  let grupInfo: { grupId: string; peran: string; status: string; izin: string[] } | null = null
  try {
    const gm = await db.grupAnggota.findFirst({
      where: { memberId: userId, status: { not: 'keluar' } },
      select: { grupId: true, peran: true, status: true, izin: true },
    })
    if (gm) {
      let izin: string[] = []
      try {
        const parsed = JSON.parse(gm.izin || '[]')
        if (Array.isArray(parsed)) izin = parsed.filter((x: unknown) => typeof x === 'string')
      } catch {}
      grupInfo = { grupId: gm.grupId, peran: gm.peran, status: gm.status, izin }
    }
  } catch {}

  const response = NextResponse.json({
    id: userId,
    username,
    name,
    role,
    sessionId,
    singleDevice,
    permissions: { features, subPermissions },
    subscriptionRedirect,
    grup: grupInfo,
    ...(demoPopupMessage ? { demoPopupMessage, demoRemainingDays } : {}),
  })

  // Sesi praktis permanen (10 tahun) — sesi hanya berakhir lewat logout
  // manual oleh user itu sendiri, sesuai kebijakan "selalu login".
  response.cookies.set('userId', userId, { path: '/', maxAge: 60 * 60 * 24 * 365 * 10, sameSite: 'lax' })
  response.cookies.set('userRole', role, { path: '/', maxAge: 60 * 60 * 24 * 365 * 10, sameSite: 'lax' })

  return response
}
