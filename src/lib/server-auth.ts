import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export interface ServerUser {
  id: string
  role: string
}

/** Konteks grup perusahaan milik user yang sedang login. */
export interface GroupContext {
  grupId: string
  grupNama: string
  grupStatus: string // aktif | dinonaktifkan
  peran: string // owner | admin | staf
  status: string // status keanggotaan: aktif | nonaktif
  izin: string[] // daftar featureId menu yang diizinkan (staf/admin)
  memberIds: string[] // SEMUA memberId terdaftar (owner + anggota, tanpa yang keluar) — cakupan data perusahaan
}

/**
 * Extract user identity from request cookies or headers.
 * Returns null if not authenticated.
 *
 * Priority:
 * 1. Cookies (userId, userRole) - set by login API
 * 2. Headers (x-user-id, x-user-role) - fallback for cross-origin/proxy
 */
export function getServerUser(request: NextRequest): ServerUser | null {
  try {
    // Try cookies first
    let userId = request.cookies.get('userId')?.value
    let userRole = request.cookies.get('userRole')?.value

    // Fallback: check headers (for cross-origin/proxy scenarios)
    if (!userId || !userRole) {
      userId = userId || request.headers.get('x-user-id')
      userRole = userRole || request.headers.get('x-user-role')
    }

    if (!userId || !userRole) return null

    return { id: userId, role: userRole }
  } catch {
    return null
  }
}

/**
 * Check if user has admin-level access.
 */
export function isAdmin(role: string): boolean {
  return role === 'superadmin' || role === 'admin'
}

// ============================================================
// GRUP PERUSAHAAN (multi-akun satu langganan)
//
// Semua akun dalam satu grup berbagi data perusahaan yang sama:
// data tidak diduplikasi per anggota — setiap query dilebarkan ke
// seluruh memberId anggota grup melalui getDataFilter. Akun tanpa
// grup tetap berperilaku lama (isolasi per-user penuh).
// ============================================================

/** Cache in-process keanggotaan grup — menghindari query berulang per request. */
const grupCache = new Map<string, { ctx: GroupContext | null; ts: number }>()
const GRUP_CACHE_TTL = 3000 // 3 detik

/** Kosongkan cache keanggotaan (panggil setelah mutasi anggota/grup). */
export function invalidateGroupCache(userId?: string): void {
  if (userId) grupCache.delete(userId)
  else grupCache.clear()
}

/**
 * Ambil konteks grup user (owner atau anggota), atau null bila bukan
 * bagian dari grup mana pun. Hasil di-cache singkat (3s) per user.
 */
export async function getGroupContext(userId: string): Promise<GroupContext | null> {
  if (!userId) return null
  const cached = grupCache.get(userId)
  if (cached && Date.now() - cached.ts < GRUP_CACHE_TTL) return cached.ctx

  let ctx: GroupContext | null = null
  try {
    const anggota = await db.grupAnggota.findFirst({
      where: { memberId: userId, status: { not: 'keluar' } },
      include: { grup: { select: { id: true, nama: true, status: true } } },
    })
    if (anggota) {
      // memberIds = SEMUA yang pernah terdaftar (termasuk yang dinonaktifkan
      // atau dikeluarkan) — data yang pernah dibuat anggota tetap menjadi
      // data perusahaan dan tidak ikut hilang saat keanggotaan berakhir.
      // Kuota dihitung terpisah (hanya status selain "keluar").
      const memberRows = await db.grupAnggota.findMany({
        where: { grupId: anggota.grupId },
        select: { memberId: true },
      })
      let izin: string[] = []
      try {
        const parsed = JSON.parse(anggota.izin || '[]')
        if (Array.isArray(parsed)) izin = parsed.filter((x) => typeof x === 'string')
      } catch {}
      ctx = {
        grupId: anggota.grup.id,
        grupNama: anggota.grup.nama,
        grupStatus: anggota.grup.status,
        peran: anggota.peran,
        status: anggota.status,
        izin,
        memberIds: memberRows.map((m) => m.memberId),
      }
    }
  } catch (e) {
    console.error('getGroupContext error:', e)
  }

  grupCache.set(userId, { ctx, ts: Date.now() })
  return ctx
}

/**
 * Build a Prisma `where` filter for data scoping.
 * - Tanpa grup  : { userId: user.id } (isolasi per-user, perilaku lama)
 * - Dalam grup  : { userId: { in: memberIds } } — semua akun grup berbagi
 *                 data perusahaan yang sama (Owner melihat invoice anggota,
 *                 anggota melihat data yang dibuat Owner, dst).
 * Data grup lain TETAP terisolasi karena memberIds hanya anggota grup sendiri.
 */
export async function getDataFilter(user: ServerUser | null): Promise<Record<string, unknown>> {
  if (!user) return { id: '__unauthenticated__' }

  const ctx = await getGroupContext(user.id)
  if (!ctx || ctx.memberIds.length === 0) {
    // Strict isolation: every user only sees their own data
    return { userId: user.id }
  }
  // Shared company data: cakupan = seluruh akun terdaftar dalam grup
  return { userId: { in: ctx.memberIds } }
}

/**
 * Build ownership check for single-record operations (GET/PUT/DELETE by ID).
 * Returns true if the user can access a record owned by `recordUserId`.
 * - Record milik sendiri → selalu boleh.
 * - Record milik anggota grup lain (data perusahaan sama) → boleh.
 * - Record milik grup/akun lain → ditolak.
 */
export async function canAccessRecord(user: ServerUser | null, recordUserId: string | null): Promise<boolean> {
  if (!user) return false
  if (!recordUserId) return false
  if (recordUserId === user.id) return true

  const ctx = await getGroupContext(user.id)
  if (!ctx) return false
  return ctx.memberIds.includes(recordUserId)
}

/** Daftar menu yang boleh diatur Owner kepada anggota grup (RBAC). */
export const GRUP_MENU_IZIN: { id: string; label: string }[] = [
  // Beranda
  { id: 'pembukaan', label: 'Dashboard / Beranda' },
  // Hitung (produksi)
  { id: 'potong-kertas', label: 'Potong Kertas' },
  { id: 'hitung-cetakan', label: 'Hitung Cetakan' },
  { id: 'hitung-finishing', label: 'Hitung Finishing' },
  { id: 'hitung-ongkos-cetak', label: 'Hitung Ongkos Cetak' },
  { id: 'hitung-harga-kertas', label: 'Hitung Harga Kertas' },
  // Dokumen
  { id: 'invoice', label: 'Invoice' },
  { id: 'surat-jalan', label: 'Surat Jalan' },
  { id: 'purchase-order', label: 'Purchase Order' },
  { id: 'master-customer', label: 'Master Customer' },
  { id: 'master-barang', label: 'Master Barang' },
  // Keuangan & laporan
  { id: 'biaya', label: 'Biaya Operasional (Kas / Bank)' },
  { id: 'laporan', label: 'Laporan Penjualan & Laba Rugi' },
  { id: 'hutang-dagang', label: 'Hutang Dagang' },
  { id: 'piutang-dagang', label: 'Piutang Dagang' },
  // Master cetak
  { id: 'master-harga-kertas', label: 'Master Harga Kertas' },
  { id: 'daftar-kategori', label: 'Daftar Kategori' },
  { id: 'master-ongkos-cetak', label: 'Master Ongkos Cetak' },
  { id: 'master-finishing', label: 'Master Finishing' },
  { id: 'master-toko-pemasok', label: 'Master Toko Pemasok' },
  { id: 'stock-bahan', label: 'Stock Bahan' },
  // Lainnya
  { id: 'pengaturan', label: 'Pengaturan' },
  // Data sensitif — bila TIDAK dicentang, anggota tidak melihat profit
  // (kolom & kotak Total Profit di riwayat invoice, baris Profit di editor,
  // kotak Laba Kotor di beranda).
  { id: 'profit', label: 'Profit (Laba Invoice)' },
]

/**
 * Guard RBAC menu utuk anggota grup (peran admin/staf) pada API data.
 * - Bukan anggota grup / Owner / admin sistem → lolos (perilaku lama).
 * - Anggota nonaktif → 403.
 * - Menu tidak diizinkan Owner → 403.
 * Usage: const err = await requireGroupMenu(request, 'invoice'); if (err) return err;
 */
export async function requireGroupMenu(
  request: NextRequest,
  menuId: string
): Promise<NextResponse | null> {
  const user = getServerUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Anda harus login terlebih dahulu' }, { status: 401 })
  }
  if (isAdmin(user.role)) return null

  const ctx = await getGroupContext(user.id)
  if (!ctx || ctx.peran === 'owner') return null

  if (ctx.status !== 'aktif') {
    return NextResponse.json(
      { error: 'Akun Anda dinonaktifkan oleh Owner grup.' },
      { status: 403 }
    )
  }
  if (!ctx.izin.includes(menuId)) {
    return NextResponse.json(
      { error: 'Akses ditolak: menu ini tidak diizinkan oleh Owner grup.' },
      { status: 403 }
    )
  }
  return null
}

/**
 * Require authentication — returns 401 if not logged in, null otherwise.
 * Usage: const err = requireAuth(request); if (err) return err;
 */
export function requireAuth(request: NextRequest): NextResponse | null {
  const user = getServerUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Anda harus login terlebih dahulu' }, { status: 401 })
  }
  return null
}

/**
 * Require admin role — returns 401/403 if not admin, null otherwise.
 * Usage: const err = requireAdmin(request); if (err) return err;
 */
export function requireAdmin(request: NextRequest): NextResponse | null {
  const authErr = requireAuth(request)
  if (authErr) return authErr

  const user = getServerUser(request)!
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: 'Akses ditolak. Hanya admin yang dapat mengakses.' }, { status: 403 })
  }
  return null
}
