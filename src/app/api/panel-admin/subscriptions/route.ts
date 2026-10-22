// GET /api/panel-admin/subscriptions — daftar langganan pelanggan untuk admin.
// ?search=  : cari nama / email / username / HP / nama perusahaan
// ?status=  : semua|belum_aktif|aktif|akan_berakhir|kedaluwarsa|ditangguhkan (status TURUNAN)
// ?withOpenPayments=1 : hanya yang punya pembayaran menunggu verifikasi
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server-auth'
import {
  derivedInvoiceStatus,
  derivedSubscriptionStatus,
  ensureSubscriptionSeeded,
  INVOICE_STATUS,
  SUB_STATUS,
} from '@/lib/subscription'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const err = requireAdmin(request)
  if (err) return err
  try {
    await ensureSubscriptionSeeded()
    const { searchParams } = new URL(request.url)
    const search = (searchParams.get('search') ?? '').trim().toLowerCase()
    const statusFilter = searchParams.get('status') ?? 'semua'

    // Semua pelanggan — Pengguna + CalonPembeli (pendaftaran mandiri). Isolasi tidak berlaku utk admin panel.
    const [penggunas, calons, subs] = await Promise.all([
      db.pengguna.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, username: true, namaLengkap: true, email: true, nomorHP: true, role: true, validUntil: true, createdAt: true },
      }),
      db.calonPembeli.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, username: true, nama: true, email: true, nomorHP: true, role: true, expiredDate: true, createdAt: true },
      }),
      db.customerSubscription.findMany({ include: { plan: true } }),
    ])

    const subMap = new Map(subs.map((s) => [s.userId, s]))

    // Nama perusahaan (UserSetting key=company_name)
    const companySettings = await db.userSetting.findMany({ where: { key: 'company_name' } })
    const companyMap = new Map(companySettings.map((c) => [c.userId, c.value]))

    // Tagihan & pembayaran terbuka per user
    const [openInvoices, pendingPayments] = await Promise.all([
      db.subscriptionInvoice.findMany({ where: { status: { in: [INVOICE_STATUS.MENUNGGU_PEMBAYARAN, INVOICE_STATUS.MENUNGGU_VERIFIKASI, INVOICE_STATUS.DITOLAK] } }, orderBy: { createdAt: 'desc' } }),
      db.subscriptionPayment.findMany({ where: { status: 'menunggu_verifikasi', deletedAt: null }, orderBy: { createdAt: 'desc' } }),
    ])

    interface SubsRow {
      userId: string
      username: string
      namaLengkap: string
      email: string
      nomorHP: string
      role: string
      companyName: string
      registeredAt: Date
      subscription: {
        id: string
        planId: string | null
        planName: string
        status: string
        rawStatus: string
        startDate: Date | null
        endDate: Date | null
        suspendReason: string
      } | null
      openInvoices: {
        id: string
        invoiceNumber: string
        planName: string
        amount: number
        status: string
        dueDate: Date
        createdAt: Date
      }[]
      hasPendingPayment: boolean
    }

    const buildRow = (
      u: { id: string; username: string | null; namaLengkap: string; email: string; nomorHP: string; role: string; createdAt: Date },
    ): SubsRow => {
      const sub = subMap.get(u.id) ?? null
      const derived = sub ? derivedSubscriptionStatus(sub) : SUB_STATUS.BELUM_AKTIF
      const userOpenInvoices = openInvoices.filter((i) => i.userId === u.id)
      const hasPendingPayment = pendingPayments.some((p) => p.userId === u.id)
      return {
        userId: u.id,
        username: u.username ?? '',
        namaLengkap: u.namaLengkap,
        email: u.email,
        nomorHP: u.nomorHP,
        role: u.role,
        companyName: companyMap.get(u.id) ?? '',
        registeredAt: u.createdAt,
        subscription: sub
          ? {
              id: sub.id,
              planId: sub.planId,
              planName: sub.plan?.name ?? '-',
              status: derived,
              rawStatus: sub.status,
              startDate: sub.startDate,
              endDate: sub.endDate,
              suspendReason: sub.suspendReason,
            }
          : null,
        openInvoices: userOpenInvoices.map((i) => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          planName: i.planName,
          amount: i.amount,
          status: derivedInvoiceStatus(i),
          dueDate: i.dueDate,
          createdAt: i.createdAt,
        })),
        hasPendingPayment,
      }
    }

    // Gabungkan: Pengguna dulu, lalu CalonPembeli yang ID-nya belum ada (hindari duplikat)
    const penggunaIds = new Set(penggunas.map((u) => u.id))
    const calonRows = calons
      .filter((c) => !penggunaIds.has(c.id))
      .map((c) =>
        buildRow({
          id: c.id,
          username: c.username,
          namaLengkap: c.nama,
          email: c.email,
          nomorHP: c.nomorHP,
          role: c.role,
          createdAt: c.createdAt,
        }),
      )

    let rows: SubsRow[] = [...penggunas.map(buildRow), ...calonRows]

    if (search) {
      rows = rows.filter(
        (r) =>
          (r.namaLengkap ?? '').toLowerCase().includes(search) ||
          (r.email ?? '').toLowerCase().includes(search) ||
          (r.username ?? '').toLowerCase().includes(search) ||
          (r.nomorHP ?? '').toLowerCase().includes(search) ||
          (r.companyName ?? '').toLowerCase().includes(search),
      )
    }
    if (statusFilter && statusFilter !== 'semua') {
      rows = rows.filter((r) => (r.subscription?.status ?? SUB_STATUS.BELUM_AKTIF) === statusFilter)
    }

    return NextResponse.json({ subscriptions: rows, total: rows.length })
  } catch (error) {
    console.error('GET /api/panel-admin/subscriptions error:', error)
    return NextResponse.json({ error: 'Gagal memuat daftar pelanggan' }, { status: 500 })
  }
}
