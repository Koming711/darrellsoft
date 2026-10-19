// /api/panel-admin/subscriptions/customers/[id] — CRUD per pelanggan (admin).
// GET    : detail profil + langganan + tagihan + riwayat aktivitas (Read)
// PUT    : update profil / role / reset password / nama perusahaan (Update)
// DELETE : hapus akun + data langganan terkait (Delete) — dokumen bisnis dipertahankan
// Target bisa Pengguna ATAU CalonPembeli (pendaftaran mandiri) — dideteksi otomatis.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAdmin } from '@/lib/server-auth'
import { hashPassword } from '@/lib/password'
import {
  addAuditLog,
  derivedInvoiceStatus,
  derivedSubscriptionStatus,
  INVOICE_STATUS,
} from '@/lib/subscription'

export const dynamic = 'force-dynamic'

const USERNAME_RE = /^[a-zA-Z0-9._]{3,30}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ALLOWED_ROLES = ['user', 'demo', 'admin']

async function resolveTarget(id: string) {
  const p = await db.pengguna.findUnique({ where: { id } })
  if (p) return { source: 'pengguna' as const, pengguna: p, calon: null }
  const c = await db.calonPembeli.findUnique({ where: { id } })
  if (c) return { source: 'calon' as const, pengguna: null, calon: c }
  return null
}

type Target = NonNullable<Awaited<ReturnType<typeof resolveTarget>>>

function profileOf(t: Target) {
  if (t.source === 'pengguna' && t.pengguna) {
    const u = t.pengguna
    return {
      id: u.id,
      source: 'pengguna',
      username: u.username,
      namaLengkap: u.namaLengkap,
      email: u.email,
      nomorHP: u.nomorHP,
      role: u.role,
      createdAt: u.createdAt,
      hasPassword: !!u.password,
    }
  }
  const c = t.calon!
  return {
    id: c.id,
    source: 'calon',
    username: c.username ?? '',
    namaLengkap: c.nama,
    email: c.email,
    nomorHP: c.nomorHP,
    role: c.role ?? 'demo',
    createdAt: c.createdAt,
    hasPassword: !!c.password,
  }
}

// ===== GET — Detail pelanggan =====
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = requireAdmin(request)
  if (err) return err
  try {
    const { id } = await params
    const t = await resolveTarget(id)
    if (!t) return NextResponse.json({ error: 'Pelanggan tidak ditemukan' }, { status: 404 })

    const profile = profileOf(t)

    const [companySetting, sub, invoices, logs] = await Promise.all([
      db.userSetting.findUnique({ where: { userId_key: { userId: id, key: 'company_name' } } }),
      db.customerSubscription.findUnique({ where: { userId: id }, include: { plan: true } }),
      db.subscriptionInvoice.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 10 }),
      db.subscriptionAuditLog.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 8 }),
    ])

    return NextResponse.json({
      customer: profile,
      companyName: companySetting?.value ?? '',
      subscription: sub
        ? {
            id: sub.id,
            planName: sub.plan?.name ?? '-',
            planId: sub.planId,
            status: derivedSubscriptionStatus(sub),
            rawStatus: sub.status,
            startDate: sub.startDate,
            endDate: sub.endDate,
            suspendReason: sub.suspendReason,
          }
        : null,
      invoices: invoices.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        planName: i.planName,
        amount: i.amount,
        status: derivedInvoiceStatus(i),
        createdAt: i.createdAt,
        dueDate: i.dueDate,
      })),
      activities: logs.map((l) => ({
        id: l.id,
        action: l.action,
        notes: l.notes,
        performedBy: l.performedBy,
        createdAt: l.createdAt,
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Gagal memuat detail' }, { status: 500 })
  }
}

// ===== PUT — Update pelanggan =====
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = requireAdmin(request)
  if (err) return err
  try {
    const { id } = await params
    const admin = getServerUser(request)!
    const adminRow = await db.pengguna.findUnique({ where: { id: admin.id }, select: { username: true, role: true } })
    const adminUsername = adminRow?.username || admin.id
    const adminIsSuper = adminRow?.role === 'superadmin'

    const t = await resolveTarget(id)
    if (!t) return NextResponse.json({ error: 'Pelanggan tidak ditemukan' }, { status: 404 })
    const profile = profileOf(t)

    const body = await request.json().catch(() => ({}))
    const namaLengkap = body?.namaLengkap !== undefined ? String(body.namaLengkap).trim() : undefined
    const email = body?.email !== undefined ? String(body.email).trim() : undefined
    const nomorHP = body?.nomorHP !== undefined ? String(body.nomorHP).trim() : undefined
    const role = body?.role !== undefined ? String(body.role).trim() : undefined
    const password = body?.password !== undefined ? String(body.password) : undefined
    const username = body?.username !== undefined ? String(body.username).trim() : undefined
    const companyName = body?.companyName !== undefined ? String(body.companyName).trim().slice(0, 120) : undefined

    // ===== Guard role =====
    if (role !== undefined) {
      if (!ALLOWED_ROLES.includes(role)) {
        return NextResponse.json({ error: "Role harus 'user', 'demo', atau 'admin'" }, { status: 400 })
      }
      if (role !== profile.role) {
        if (id === admin.id) {
          return NextResponse.json({ error: 'Tidak bisa mengubah role akun sendiri' }, { status: 400 })
        }
        if (profile.role === 'superadmin') {
          return NextResponse.json({ error: 'Role akun superadmin tidak dapat diubah' }, { status: 403 })
        }
      }
    }

    // ===== Validasi field opsional =====
    if (namaLengkap !== undefined && !namaLengkap) {
      return NextResponse.json({ error: 'Nama lengkap tidak boleh kosong' }, { status: 400 })
    }
    if (email !== undefined && !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Format email tidak valid' }, { status: 400 })
    }
    if (nomorHP !== undefined && !nomorHP) {
      return NextResponse.json({ error: 'Nomor HP tidak boleh kosong' }, { status: 400 })
    }
    if (password !== undefined && password !== '' && password.length < 6) {
      return NextResponse.json({ error: 'Password baru minimal 6 karakter' }, { status: 400 })
    }
    if (username !== undefined && username !== profile.username) {
      if (!USERNAME_RE.test(username)) {
        return NextResponse.json(
          { error: 'Username 3-30 karakter, hanya huruf/angka/titik/underscore' },
          { status: 400 }
        )
      }
      const [pengUsernames, calonUsernames] = await Promise.all([
        db.pengguna.findMany({ select: { id: true, username: true } }),
        db.calonPembeli.findMany({ where: { username: { not: null } }, select: { id: true, username: true } }),
      ])
      const lowerName = username.toLowerCase()
      const isDup =
        pengUsernames.some((u) => u.id !== id && u.username.toLowerCase() === lowerName) ||
        calonUsernames.some((c) => c.id !== id && (c.username ?? '').toLowerCase() === lowerName)
      if (isDup) {
        return NextResponse.json({ error: `Username "${username}" sudah dipakai akun lain` }, { status: 409 })
      }
    }

    const changed: string[] = []

    if (t.source === 'pengguna' && t.pengguna) {
      const data: Record<string, string> = {}
      if (namaLengkap !== undefined && namaLengkap !== t.pengguna.namaLengkap) {
        data.namaLengkap = namaLengkap
        changed.push('nama')
      }
      if (email !== undefined && email !== t.pengguna.email) {
        data.email = email
        changed.push('email')
      }
      if (nomorHP !== undefined && nomorHP !== t.pengguna.nomorHP) {
        data.nomorHP = nomorHP
        changed.push('no. HP')
      }
      if (username !== undefined && username !== t.pengguna.username) {
        data.username = username
        changed.push('username')
      }
      if (role !== undefined && role !== t.pengguna.role) {
        data.role = role
        changed.push(`role (${t.pengguna.role} → ${role})`)
      }
      if (password !== undefined && password !== '') {
        data.password = hashPassword(password) // bcrypt
        changed.push('password (reset)')
      }
      if (Object.keys(data).length > 0) {
        await db.pengguna.update({ where: { id }, data })
      }
    } else if (t.calon) {
      const data: Record<string, string> = {}
      if (namaLengkap !== undefined && namaLengkap !== t.calon.nama) {
        data.nama = namaLengkap
        changed.push('nama')
      }
      if (email !== undefined && email !== t.calon.email) {
        data.email = email
        changed.push('email')
      }
      if (nomorHP !== undefined && nomorHP !== t.calon.nomorHP) {
        data.nomorHP = nomorHP
        changed.push('no. HP')
      }
      if (username !== undefined && username !== (t.calon.username ?? '')) {
        data.username = username
        changed.push('username')
      }
      if (role !== undefined && role !== (t.calon.role ?? 'demo')) {
        data.role = role
        changed.push(`role (${t.calon.role ?? 'demo'} → ${role})`)
      }
      if (password !== undefined && password !== '') {
        data.password = hashPassword(password) // bcrypt
        changed.push('password (reset)')
      }
      if (Object.keys(data).length > 0) {
        await db.calonPembeli.update({ where: { id }, data })
      }
    }

    // companyName — UserSetting upsert (berlaku utk kedua sumber)
    if (companyName !== undefined) {
      const existing = await db.userSetting.findUnique({
        where: { userId_key: { userId: id, key: 'company_name' } },
      })
      if (existing && existing.value !== companyName) {
        await db.userSetting.update({ where: { id: existing.id }, data: { value: companyName } })
        changed.push('nama perusahaan')
      } else if (!existing && companyName) {
        await db.userSetting.create({ data: { userId: id, key: 'company_name', value: companyName } })
        changed.push('nama perusahaan')
      }
    }

    if (changed.length > 0) {
      await addAuditLog({
        userId: id,
        action: 'customer_updated',
        performedBy: adminUsername,
        notes: `Admin ubah data @${profile.username}: ${changed.join(', ')}`,
      })
    }

    return NextResponse.json({ ok: true, changed })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Gagal memperbarui pelanggan'
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Username sudah dipakai akun lain' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ===== DELETE — Hapus pelanggan =====
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = requireAdmin(request)
  if (err) return err
  try {
    const { id } = await params
    const admin = getServerUser(request)!
    const adminRow = await db.pengguna.findUnique({ where: { id: admin.id }, select: { username: true } })
    const adminUsername = adminRow?.username || admin.id

    const t = await resolveTarget(id)
    if (!t) return NextResponse.json({ error: 'Pelanggan tidak ditemukan' }, { status: 404 })
    const profile = profileOf(t)

    if (id === admin.id) {
      return NextResponse.json({ error: 'Tidak bisa menghapus akun sendiri' }, { status: 400 })
    }
    if (profile.role === 'superadmin') {
      return NextResponse.json({ error: 'Akun superadmin tidak dapat dihapus' }, { status: 403 })
    }

    const usernameSnapshot = profile.username || profile.namaLengkap

    await db.$transaction(async (tx) => {
      // Data sistem langganan milik akun ini
      await tx.customerSubscription.deleteMany({ where: { userId: id } })
      await tx.subscriptionPayment.deleteMany({ where: { userId: id } })
      await tx.subscriptionInvoice.deleteMany({ where: { userId: id } })
      await tx.userSetting.deleteMany({ where: { userId: id } })
      await tx.notification.deleteMany({ where: { userId: id } })
      // Lepas tautan lead (CalonPembeli) yang menunjuk akun Pengguna ini — riwayat lead dipertahankan
      await tx.calonPembeli.updateMany({ where: { userId: id }, data: { userId: null } })
      // Hapus akun
      if (t.source === 'pengguna') {
        await tx.pengguna.delete({ where: { id } })
      } else {
        await tx.calonPembeli.delete({ where: { id } })
      }
      // Catatan audit (userId lama dipertahankan sebagai jejak historis)
      await tx.subscriptionAuditLog.create({
        data: {
          userId: null,
          action: 'customer_deleted',
          performedBy: adminUsername,
          notes: `Admin hapus akun @${usernameSnapshot} beserta data langganannya`,
        },
      })
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Gagal menghapus pelanggan' }, { status: 500 })
  }
}
