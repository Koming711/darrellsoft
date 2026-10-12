// POST /api/panel-admin/subscriptions/customers — Admin membuat akun pelanggan baru (CRUD: Create).
// Body: { username, password, namaLengkap, email, nomorHP, role? }
// role opsional: user (default) | demo | admin. superadmin tidak bisa dibuat lewat sini.
// Username divalidasi unik lintas Pengguna + CalonPembeli (case-insensitive).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAdmin } from '@/lib/server-auth'
import { addAuditLog } from '@/lib/subscription'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['user', 'demo', 'admin']
const USERNAME_RE = /^[a-zA-Z0-9._]{3,30}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest) {
  const err = requireAdmin(request)
  if (err) return err
  try {
    const admin = getServerUser(request)!
    const adminRow = await db.pengguna.findUnique({ where: { id: admin.id }, select: { username: true } })
    const adminUsername = adminRow?.username || admin.id

    const body = await request.json().catch(() => ({}))
    const username = String(body?.username ?? '').trim()
    const password = String(body?.password ?? '')
    const namaLengkap = String(body?.namaLengkap ?? '').trim()
    const email = String(body?.email ?? '').trim()
    const nomorHP = String(body?.nomorHP ?? '').trim()
    const role = String(body?.role ?? 'user').trim() || 'user'

    // ===== Validasi =====
    if (!USERNAME_RE.test(username)) {
      return NextResponse.json(
        { error: 'Username 3-30 karakter, hanya huruf/angka/titik/underscore' },
        { status: 400 }
      )
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password minimal 6 karakter' }, { status: 400 })
    }
    if (!namaLengkap) return NextResponse.json({ error: 'Nama lengkap wajib diisi' }, { status: 400 })
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Format email tidak valid' }, { status: 400 })
    if (!nomorHP) return NextResponse.json({ error: 'Nomor HP wajib diisi' }, { status: 400 })
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: "Role harus 'user', 'demo', atau 'admin'" }, { status: 400 })
    }

    // ===== Unik lintas sumber (case-insensitive — SQLite tak dukung mode:insensitive, cek via JS) =====
    const [pengUsernames, calonUsernames] = await Promise.all([
      db.pengguna.findMany({ select: { username: true } }),
      db.calonPembeli.findMany({ where: { username: { not: null } }, select: { username: true } }),
    ])
    const lowerName = username.toLowerCase()
    const isDup =
      pengUsernames.some((u) => u.username.toLowerCase() === lowerName) ||
      calonUsernames.some((c) => (c.username ?? '').toLowerCase() === lowerName)
    if (isDup) {
      return NextResponse.json({ error: `Username "${username}" sudah dipakai akun lain` }, { status: 409 })
    }

    const created = await db.pengguna.create({
      data: { username, password, namaLengkap, email, nomorHP, role },
      select: { id: true, username: true, namaLengkap: true, email: true, nomorHP: true, role: true, createdAt: true },
    })

    await addAuditLog({
      userId: created.id,
      action: 'customer_created',
      performedBy: adminUsername,
      notes: `Admin buat akun @${created.username} (role: ${created.role})`,
    })

    return NextResponse.json({ customer: created }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Gagal membuat pelanggan'
    // Prisma unique constraint fallback
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Username sudah dipakai akun lain' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
