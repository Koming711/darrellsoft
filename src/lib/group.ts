/**
 * Sistem Grup Perusahaan & Multi-Akun (paket langganan ber-kuota akun).
 *
 * Konsep:
 * - 1 grup = 1 perusahaan dengan 1 langganan bersama (paket mis. 3 Akun).
 * - Grup dibuat OTOMATIS saat pembayaran paket multi-akun (maxAccounts >= 2)
 *   diverifikasi Admin → lihat `ensureCompanyGroupOnActivation()`.
 * - Keanggotaan disimpan di tabel `GroupMember`; `userId` mengarah ke akun login
 *   (Pengguna ATAU CalonPembeli) sehingga isolasi data aplikasi (kolom `userId`
 *   pada tabel data) otomatis mengikuti keanggotaan grup via `getDataFilter()`.
 * - Kuota = jumlah anggota yang MASIH TERDAFTAR (GroupMember). Menonaktifkan
 *   anggota TIDAK membebaskan kuota; mengeluarkan anggota membebaskan kuota
 *   dan data perusahaannya dipindahkan ke Owner (`transferMemberData`).
 *
 * Catatan arsitektur: file ini TIDAK boleh mengimpor `@/lib/subscription`
 * (menghindari siklus — subscription.ts mengimpor lib ini untuk hook aktivasi).
 */

import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { buildDefaultPermissions } from '@/lib/permission-defaults'
import type { ServerUser } from '@/lib/server-auth'

type Tx = Prisma.TransactionClient

const DAY_MS = 24 * 3600 * 1000

/** Menu yang TIDAK pernah diberikan ke Owner grup (khusus admin Darrellsoft). */
const OWNER_FEATURE_DENY = ['panel-admin', 'hak-akses', 'pengguna']

// ===== HELPER DASAR =====

export function parseMemberPermissions(json: string | null | undefined): Record<string, boolean> | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, boolean>
    }
  } catch {
    /* ignore */
  }
  return null
}

export function stringifyMemberPermissions(map: Record<string, boolean> | null | undefined): string {
  if (!map || typeof map !== 'object') return ''
  return JSON.stringify(map)
}

/**
 * Gabungkan pilihan hak akses anggota dengan default role-nya.
 * - `sent` hanya berisi fitur yang dinyalakan (dari dialog tambah anggota) →
 *   default role tetap berlaku untuk sisanya.
 * - `sent` berisi map lengkap (dari dialog atur akses) → override penuh.
 * Keduanya aman digabung: nilai `sent` selalu menang atas default.
 */
export function mergeMemberPermissions(role: string, sent: Record<string, boolean> | null | undefined): string {
  const base = buildDefaultPermissions(role) as Record<string, boolean>
  if (!sent || typeof sent !== 'object') return JSON.stringify(base)
  const merged: Record<string, boolean> = { ...base }
  for (const [k, v] of Object.entries(sent)) {
    if (typeof v === 'boolean') merged[k] = v
  }
  return JSON.stringify(merged)
}

/** ID grup unik otomatis: GRP-00001, GRP-00002, ... */
export async function generateGroupKode(tx: Tx): Promise<string> {
  const total = await tx.grup.count()
  for (let i = total + 1; i < total + 1000; i++) {
    const kode = `GRP-${String(i).padStart(5, '0')}`
    const exists = await tx.grup.findUnique({ where: { kode }, select: { id: true } })
    if (!exists) return kode
  }
  return `GRP-${String(Date.now()).slice(-8)}`
}

/** Status langganan turunan untuk tampilan grup (ringkas, tanpa impor subscription.ts). */
export function deriveGroupSubStatus(sub: { status: string; endDate: Date | string | null } | null | undefined): string {
  if (!sub) return 'belum_aktif'
  if (sub.status === 'aktif' && sub.endDate) {
    const end = new Date(sub.endDate).getTime()
    if (end < Date.now()) return 'kedaluwarsa'
    if (end - Date.now() < 7 * DAY_MS) return 'akan_berakhir'
  }
  return sub.status
}

export function daysLeftUntil(d: Date | string | null | undefined): number | null {
  if (!d) return null
  const diff = new Date(d).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / DAY_MS))
}

// ===== KEANGGOTAAN & ISOLASI DATA =====

/**
 * Daftar userId seluruh anggota grup yang mengandung `userId` (termasuk dirinya).
 * Mengembalikan null bila user tidak tergabung dalam grup AKTIF — pemanggil
 * harus fallback ke perilaku lama (isolasi per-user murni).
 *
 * Anggota berstatus nonaktif tetap dihitung agar data historis yang pernah
 * ia buat tetap terlihat oleh grup.
 */
export async function getGroupMemberUserIds(userId: string): Promise<string[] | null> {
  try {
    const me = await db.groupMember.findFirst({
      where: { userId },
      orderBy: { joinedAt: 'asc' },
      select: { grupId: true },
    })
    if (!me) return null
    const grup = await db.grup.findUnique({ where: { id: me.grupId }, select: { status: true } })
    if (!grup || grup.status !== 'aktif') return null
    const rows = await db.groupMember.findMany({ where: { grupId: me.grupId }, select: { userId: true } })
    const ids = Array.from(new Set(rows.map((r) => r.userId).filter(Boolean)))
    return ids.length > 0 ? ids : null
  } catch {
    return null
  }
}

/**
 * Versi grup-sadari dari `canAccessRecord` (server-auth).
 * True bila record milik user sendiri ATAU milik sesama anggota grup aktifnya.
 */
export async function canAccessRecordAsync(
  user: ServerUser | null,
  recordUserId: string | null | undefined,
): Promise<boolean> {
  if (!user) return false
  if (!recordUserId) return false
  if (recordUserId === user.id) return true
  const ids = await getGroupMemberUserIds(user.id)
  return !!ids && ids.includes(recordUserId)
}

/**
 * Konteks grup lengkap untuk akun yang login (dipakai /api/grup/my & verifikasi).
 */
export interface GroupContext {
  grup: {
    id: string
    kode: string | null
    nama: string
    status: string
    maxAccounts: number
    paketId: string | null
    createdAt: Date
  }
  myRole: 'owner' | 'staf'
  myStatus: string
  ownerMember: {
    memberId: string
    userId: string
    nama: string
    username: string
  } | null
  members: Array<{
    id: string
    userId: string
    nama: string
    username: string
    nomorHP: string
    role: string
    status: string
    permissions: Record<string, boolean> | null
    joinedAt: Date
  }>
}

export async function getGroupContext(userId: string): Promise<GroupContext | null> {
  const my = await db.groupMember.findFirst({
    where: { userId },
    orderBy: { joinedAt: 'asc' },
  })
  if (!my) return null
  const grup = await db.grup.findUnique({ where: { id: my.grupId } })
  if (!grup) return null

  const rows = await db.groupMember.findMany({
    where: { grupId: grup.id },
    orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }], // owner dulu
  })

  const owner = rows.find((r) => r.role === 'owner') ?? null

  // Lengkapi snapshot nama/username/HP dari tabel akun (Pengguna dulu, lalu CalonPembeli)
  const userIds = Array.from(new Set(rows.map((r) => r.userId)))
  const [penggunas, calons] = await Promise.all([
    db.pengguna.findMany({ where: { id: { in: userIds } }, select: { id: true, namaLengkap: true, username: true, nomorHP: true } }),
    db.calonPembeli.findMany({ where: { id: { in: userIds } }, select: { id: true, nama: true, username: true, nomorHP: true } }),
  ])
  const pgMap = new Map(penggunas.map((p) => [p.id, p]))
  const clMap = new Map(calons.map((c) => [c.id, c]))

  const members = rows.map((r) => {
    const pg = pgMap.get(r.userId)
    const cl = pg ? undefined : clMap.get(r.userId)
    return {
      id: r.id,
      userId: r.userId,
      nama: pg?.namaLengkap || cl?.nama || r.nama,
      username: pg?.username || cl?.username || r.username,
      nomorHP: pg?.nomorHP || cl?.nomorHP || '',
      role: r.role,
      status: r.status,
      permissions: parseMemberPermissions(r.permissions),
      joinedAt: r.joinedAt,
    }
  })

  return {
    grup: {
      id: grup.id,
      kode: grup.kode,
      nama: grup.nama,
      status: grup.status,
      maxAccounts: grup.maxAccounts,
      paketId: grup.paketId,
      createdAt: grup.createdAt,
    },
    myRole: my.role === 'owner' ? 'owner' : 'staf',
    myStatus: my.status,
    ownerMember: owner
      ? { memberId: owner.id, userId: owner.userId, nama: owner.nama, username: owner.username }
      : null,
    members,
  }
}

/** userId Owner dari grup yang memuat `userId` (untuk evaluasi langganan anggota). */
export async function getGroupOwnerUserId(userId: string): Promise<string | null> {
  const my = await db.groupMember.findFirst({ where: { userId }, select: { grupId: true, role: true } })
  if (!my) return null
  const owner = await db.groupMember.findFirst({
    where: { grupId: my.grupId, role: 'owner' },
    select: { userId: true },
  })
  return owner?.userId ?? null
}

// ===== RBAC HAK AKSES FITUR (server-side) =====

/**
 * Gerbang hak akses fitur untuk API data utama.
 * - superadmin/admin/manager → selalu boleh (perilaku lama).
 * - Bukan anggota grup → boleh (perilaku lama; batasan role ditangani klien).
 * - Owner grup → boleh seluruh menu perusahaan.
 * - Staf → wajib fitur tercantum pada overlay hak aksesnya (atau default role).
 *
 * Pemakaian: const denied = await requireFeatureAccess(getServerUser(request), 'invoice');
 *            if (denied) return denied;
 */
export async function requireFeatureAccess(
  user: ServerUser | null,
  featureId: string,
): Promise<NextResponse | null> {
  if (!user) {
    return NextResponse.json({ error: 'Anda harus login terlebih dahulu' }, { status: 401 })
  }
  if (user.role === 'superadmin' || user.role === 'admin' || user.role === 'manager') return null

  const my = await db.groupMember.findFirst({
    where: { userId: user.id },
    select: { role: true, status: true, permissions: true, grup: { select: { status: true } } },
  })
  if (!my) return null // bukan anggota grup — perilaku lama
  if (my.grup.status !== 'aktif' || my.status === 'nonaktif') {
    return NextResponse.json(
      { error: 'Akses grup dinonaktifkan. Hubungi Owner grup atau admin Darrellsoft.' },
      { status: 403 },
    )
  }
  if (my.role === 'owner') return null

  const overlay = parseMemberPermissions(my.permissions)
  const effective = overlay ?? (buildDefaultPermissions(user.role) as Record<string, boolean>)
  if (effective[featureId]) return null
  return NextResponse.json(
    { error: 'Akses ditolak. Menu ini belum diizinkan oleh Owner grup.' },
    { status: 403 },
  )
}

// ===== AKTIVASI OTOMATIS (hook dari reviewPayment) =====

/**
 * Buat grup perusahaan otomatis ketika pembayaran paket multi-akun disetujui.
 * Idempoten: bila user sudah menjadi anggota grup, cukup sinkronkan akses anggota.
 * WAJIB dipanggil di dalam transaksi aktivasi langganan agar atomik.
 */
export async function ensureCompanyGroupOnActivation(
  tx: Tx,
  userId: string,
  plan: { id: string; name: string; maxAccounts: number },
  graceEnd: Date,
  performedBy: string,
): Promise<string | null> {
  if (plan.maxAccounts < 2) return null

  const existing = await tx.groupMember.findFirst({ where: { userId }, select: { grupId: true } })
  if (existing) return existing.grupId

  // Nama tampil pemilik: Pengguna dulu, lalu CalonPembeli (pendaftaran mandiri)
  const [pg, calon] = await Promise.all([
    tx.pengguna.findUnique({ where: { id: userId }, select: { namaLengkap: true, username: true } }),
    tx.calonPembeli.findUnique({ where: { id: userId }, select: { nama: true, username: true } }),
  ])
  const nama = pg?.namaLengkap || calon?.nama || pg?.username || calon?.username || 'Perusahaan Baru'
  const username = pg?.username || calon?.username || ''

  const kode = await generateGroupKode(tx)
  const grup = await tx.grup.create({
    data: {
      kode,
      nama,
      ownerId: userId,
      maxAccounts: plan.maxAccounts,
      paketId: plan.id,
      status: 'aktif',
    },
  })

  await tx.groupMember.create({
    data: { grupId: grup.id, userId, nama, username, role: 'owner', status: 'aktif', permissions: '' },
  })

  // Seluruh akun anggota mengikuti masa berlaku langganan grup
  await syncMemberAccess(tx, grup.id, graceEnd)

  await tx.subscriptionAuditLog.create({
    data: {
      userId,
      groupId: grup.id,
      action: 'group_created',
      newStatus: 'aktif',
      performedBy,
      notes: `Grup ${kode} dibuat otomatis — paket ${plan.name} (kuota ${plan.maxAccounts} akun). Pendaftar menjadi Owner.`,
    },
  })

  await tx.notification.create({
    data: {
      userId,
      title: 'Grup Perusahaan Dibuat',
      body: `Grup "${nama}" (${kode}) aktif dengan paket ${plan.name} — kuota ${plan.maxAccounts} akun. Tambahkan anggota dari menu Grup Saya.`,
      type: 'subscription',
      link: '/grup',
    },
  })

  return grup.id
}

/**
 * Sinkronkan `validUntil` seluruh akun anggota grup (Pengguna) agar mengikuti
 * masa berlaku langganan grup (endDate + masa tenggang).
 */
export async function syncMemberAccess(tx: Tx, grupId: string, validUntil: Date): Promise<number> {
  const members = await tx.groupMember.findMany({ where: { grupId }, select: { userId: true } })
  const ids = members.map((m) => m.userId)
  if (ids.length === 0) return 0
  const res = await tx.pengguna.updateMany({ where: { id: { in: ids } }, data: { validUntil } })
  return res.count
}

// ===== KELUAR ANGGOTA: PINDAHKAN DATA PERUSAHAAN KE OWNER =====

/**
 * Pindahkan seluruh data perusahaan yang dibuat `fromUserId` ke `toUserId`
 * (Owner) — dipakai saat anggota dikeluarkan dari grup, agar data perusahaan
 * tidak hilang dari pandangan grup.
 *
 * Tabel dengan constraint unik per-user (Barang: [userId,kode], StockKategori:
 * [userId,nama]) ditangani per-baris dengan penggantian nama bila bentrok.
 */
export async function transferMemberData(tx: Tx, fromUserId: string, toUserId: string): Promise<void> {
  if (!fromUserId || fromUserId === toUserId) return

  const bulkTables = [
    'customer',
    'barangCustomer',
    'paper',
    'kategori',
    'printingCost',
    'finishing',
    'riwayatCetakan',
    'riwayatFinishing',
    'riwayatOngkosCetak',
    'riwayatHargaKertas',
    'riwayatPotongKertas',
    'gabunganHitungCetakan',
    'invoice',
    'suratJalan',
    'purchaseOrder',
    'documentHistory',
    'biaya',
    'bahan',
    'bahanMutasi',
    'bahanMasuk',
    'bahanKeluar',
    'bahanPenyesuaian',
    'stockSupplier',
    'stockMaterial',
    'tokoPemasok',
  ] as const

  for (const table of bulkTables) {
    await (tx as unknown as Record<string, { updateMany: (args: unknown) => Promise<unknown> }>)[table].updateMany({
      where: { userId: fromUserId },
      data: { userId: toUserId },
    })
  }

  // Barang — unik [userId, kode]: ganti kode bila bentrok dengan milik Owner
  const barangList = await tx.barang.findMany({ where: { userId: fromUserId }, select: { id: true, kode: true } })
  const ownerKodes = new Set(
    (await tx.barang.findMany({ where: { userId: toUserId }, select: { kode: true } })).map((b) => b.kode),
  )
  for (const b of barangList) {
    let kode = b.kode
    if (ownerKodes.has(kode)) {
      let n = 1
      while (ownerKodes.has(`${b.kode}-${n}`)) n++
      kode = `${b.kode}-${n}`
    }
    await tx.barang.update({ where: { id: b.id }, data: { userId: toUserId, kode } })
    ownerKodes.add(kode)
  }

  // StockKategori — unik [userId, nama]: pola sama
  const katList = await tx.stockKategori.findMany({ where: { userId: fromUserId }, select: { id: true, nama: true } })
  const ownerKats = new Set(
    (await tx.stockKategori.findMany({ where: { userId: toUserId }, select: { nama: true } })).map((k) => k.nama),
  )
  for (const k of katList) {
    let nama = k.nama
    if (ownerKats.has(nama)) {
      let n = 1
      while (ownerKats.has(`${k.nama} (${n})`)) n++
      nama = `${k.nama} (${n})`
    }
    await tx.stockKategori.update({ where: { id: k.id }, data: { userId: toUserId, nama } })
    ownerKats.add(nama)
  }
}

/** Tulis audit log aktivitas grup (dipakai API grup & panel admin). */
export async function addGroupAudit(
  tx: Tx,
  data: {
    groupId: string
    userId?: string | null
    action: string
    oldStatus?: string
    newStatus?: string
    performedBy: string
    notes?: string
  },
): Promise<void> {
  await tx.subscriptionAuditLog.create({
    data: {
      groupId: data.groupId,
      userId: data.userId ?? null,
      action: data.action,
      oldStatus: data.oldStatus ?? '',
      newStatus: data.newStatus ?? '',
      performedBy: data.performedBy,
      notes: data.notes ?? '',
    },
  })
}

export { OWNER_FEATURE_DENY }
