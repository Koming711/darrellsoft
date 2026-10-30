// GET /api/panel-admin/stats/detail?type=<kunci> — Perincian kotak statistik
// Beranda Admin. Setiap kotak di Beranda Admin bisa diklik untuk melihat
// daftar rinciannya (permintaan owner).
//
// Response generik: { type, judul, total: number, rows: DetailRow[] }
// DetailRow: { id, akun, keterangan, jumlah, tanggal, status }
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server-auth'
import {
  derivedSubscriptionStatus,
  ensureSubscriptionSeeded,
  INVOICE_STATUS,
  PAYMENT_STATUS,
  SUB_STATUS,
} from '@/lib/subscription'

export const dynamic = 'force-dynamic'

interface DetailRow {
  id: string
  akun: string
  keterangan: string
  jumlah: number | null
  tanggal: string | null
  status: string
}

const VALID_TYPES = new Set([
  'total-akun',
  'pelanggan-aktif',
  'pelanggan-kedaluwarsa',
  'menunggu-verifikasi',
  'total-pendapatan',
  'pendapatan-bulan',
  'belum-aktif',
  'tagihan-terbuka',
])

/** Resolusi kumpulan userId → nama akun (Pengguna ∪ CalonPembeli). */
async function resolveAkun(userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))]
  const map = new Map<string, string>()
  if (ids.length === 0) return map
  const [penggunaRows, calonRows] = await Promise.all([
    db.pengguna.findMany({
      where: { id: { in: ids } },
      select: { id: true, namaLengkap: true, username: true },
    }),
    db.calonPembeli.findMany({
      where: { id: { in: ids } },
      select: { id: true, nama: true, username: true },
    }),
  ])
  for (const u of penggunaRows) map.set(u.id, u.namaLengkap || u.username || 'Akun')
  for (const c of calonRows) map.set(c.id, c.nama || c.username || 'Akun')
  return map
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

export async function GET(request: NextRequest) {
  const err = requireAdmin(request)
  if (err) return err
  try {
    await ensureSubscriptionSeeded()

    const type = new URL(request.url).searchParams.get('type') ?? ''
    if (!VALID_TYPES.has(type)) {
      return NextResponse.json({ error: 'Parameter type tidak valid' }, { status: 400 })
    }

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    // ===== Total Akun Terdaftar =====
    if (type === 'total-akun') {
      const [penggunaRows, calonRows] = await Promise.all([
        db.pengguna.findMany({
          orderBy: { createdAt: 'desc' },
          select: { id: true, namaLengkap: true, username: true, email: true, role: true, createdAt: true },
        }),
        db.calonPembeli.findMany({
          orderBy: { createdAt: 'desc' },
          select: { id: true, nama: true, username: true, email: true, status: true, createdAt: true },
        }),
      ])
      const rows: DetailRow[] = [
        ...penggunaRows.map((u) => ({
          id: u.id,
          akun: u.namaLengkap || u.username || 'Akun',
          keterangan: `@${u.username || '-'} · ${u.email || 'tanpa email'}`,
          jumlah: null,
          tanggal: iso(u.createdAt),
          status: u.role,
        })),
        ...calonRows.map((c) => ({
          id: c.id,
          akun: c.nama || c.username || 'Akun',
          keterangan: `@${c.username || '-'} · ${c.email || 'tanpa email'}`,
          jumlah: null,
          tanggal: iso(c.createdAt),
          status: c.status === 'aktif' ? 'terdaftar' : c.status,
        })),
      ]
      return NextResponse.json({ type, judul: 'Total Akun Terdaftar', total: rows.length, rows })
    }

    // ===== Status langganan: aktif / kedaluwarsa / belum aktif =====
    if (type === 'pelanggan-aktif' || type === 'pelanggan-kedaluwarsa' || type === 'belum-aktif') {
      const subs = await db.customerSubscription.findMany({
        include: { plan: { select: { name: true } } },
      })
      const target =
        type === 'pelanggan-aktif'
          ? [SUB_STATUS.AKTIF]
          : type === 'pelanggan-kedaluwarsa'
            ? [SUB_STATUS.KEDALUWARSA, SUB_STATUS.DITANGGUHKAN]
            : [SUB_STATUS.BELUM_AKTIF]
      const filtered = subs.filter((s) => target.includes(derivedSubscriptionStatus(s)))
      const akunMap = await resolveAkun(filtered.map((s) => s.userId))
      const rows: DetailRow[] = filtered
        .map((s) => ({
          s,
          st: derivedSubscriptionStatus(s),
        }))
        .sort((a, b) => (b.s.endDate?.getTime() ?? 0) - (a.s.endDate?.getTime() ?? 0))
        .map(({ s, st }) => ({
          id: s.id,
          akun: akunMap.get(s.userId) ?? '—',
          keterangan: s.plan?.name ? `Paket ${s.plan.name}` : 'Tanpa paket',
          jumlah: null,
          tanggal: iso(s.endDate),
          status: st === SUB_STATUS.AKTIF ? 'Aktif' : st === SUB_STATUS.KEDALUWARSA ? 'Kedaluwarsa' : st === SUB_STATUS.DITANGGUHKAN ? 'Ditangguhkan' : 'Belum Aktif',
        }))
      const judul =
        type === 'pelanggan-aktif'
          ? 'Pelanggan Aktif'
          : type === 'pelanggan-kedaluwarsa'
            ? 'Pelanggan Kedaluwarsa'
            : 'Belum Aktif'
      return NextResponse.json({ type, judul, total: rows.length, rows })
    }

    // ===== Pembayaran menunggu verifikasi =====
    if (type === 'menunggu-verifikasi') {
      const payments = await db.subscriptionPayment.findMany({
        where: { status: PAYMENT_STATUS.MENUNGGU_VERIFIKASI, deletedAt: null },
        include: { invoice: { select: { invoiceNumber: true, planName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      const akunMap = await resolveAkun(payments.map((p) => p.userId))
      const rows: DetailRow[] = payments.map((p) => ({
        id: p.id,
        akun: akunMap.get(p.userId) ?? '—',
        keterangan: `${p.invoice.invoiceNumber} · ${p.invoice.planName}`,
        jumlah: p.amount,
        tanggal: iso(p.createdAt),
        status: p.paymentMethod === 'qris' ? 'QRIS' : 'Transfer Bank',
      }))
      const total = rows.reduce((sum, r) => sum + (r.jumlah ?? 0), 0)
      return NextResponse.json({ type, judul: 'Menunggu Verifikasi', total, rows })
    }

    // ===== Pendapatan (total / bulan ini) =====
    if (type === 'total-pendapatan' || type === 'pendapatan-bulan') {
      const payments = await db.subscriptionPayment.findMany({
        where: { status: PAYMENT_STATUS.DISETUJUI, deletedAt: null },
        include: { invoice: { select: { invoiceNumber: true, planName: true } } },
        orderBy: { reviewedAt: 'desc' },
        take: 200,
      })
      const filtered = type === 'pendapatan-bulan' ? payments.filter((p) => p.createdAt >= startOfMonth) : payments
      const akunMap = await resolveAkun(filtered.map((p) => p.userId))
      const rows: DetailRow[] = filtered.map((p) => ({
        id: p.id,
        akun: akunMap.get(p.userId) ?? '—',
        keterangan: `${p.invoice.invoiceNumber} · ${p.invoice.planName}`,
        jumlah: p.amount,
        tanggal: iso(p.reviewedAt ?? p.createdAt),
        status: 'Disetujui',
      }))
      const total = filtered.reduce((sum, p) => sum + p.amount, 0)
      const judul = type === 'total-pendapatan' ? 'Total Pendapatan Disetujui' : 'Pendapatan Bulan Ini'
      return NextResponse.json({ type, judul, total, rows })
    }

    // ===== Tagihan terbuka =====
    const invoices = await db.subscriptionInvoice.findMany({
      where: { status: INVOICE_STATUS.MENUNGGU_PEMBAYARAN },
      include: { plan: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    const terbuka = invoices.filter((i) => new Date(i.dueDate).getTime() > now.getTime())
    const akunMap = await resolveAkun(terbuka.map((i) => i.userId))
    const rows: DetailRow[] = terbuka.map((i) => ({
      id: i.id,
      akun: akunMap.get(i.userId) ?? '—',
      keterangan: `${i.invoiceNumber} · ${i.planName || i.plan?.name || '-'}`,
      jumlah: i.amount,
      tanggal: iso(i.dueDate),
      status: 'Menunggu Pembayaran',
    }))
    const total = rows.reduce((sum, r) => sum + (r.jumlah ?? 0), 0)
    return NextResponse.json({ type: 'tagihan-terbuka', judul: 'Tagihan Terbuka', total, rows })
  } catch (error) {
    console.error('GET /api/panel-admin/stats/detail error:', error)
    return NextResponse.json({ error: 'Gagal memuat perincian' }, { status: 500 })
  }
}
