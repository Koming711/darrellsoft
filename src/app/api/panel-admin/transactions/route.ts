// GET /api/panel-admin/transactions — riwayat transaksi langganan (semua pelanggan).
// Filter: ?from=YYYY-MM-DD&to=YYYY-MM-DD&planId=&status=&method=&export=csv
// Soft delete: default hanya transaksi aktif (deletedAt null); ?trash=1 → hanya yg sudah dihapus.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server-auth'
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS, toCsv } from '@/lib/subscription'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const err = requireAdmin(request)
  if (err) return err
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from') ?? ''
    const to = searchParams.get('to') ?? ''
    const planId = searchParams.get('planId') ?? ''
    const status = searchParams.get('status') ?? ''
    const method = searchParams.get('method') ?? ''
    const exportCsv = searchParams.get('export') === 'csv'
    const trash = searchParams.get('trash') === '1'

    const createdAt: Record<string, Date> = {}
    if (from) createdAt.gte = new Date(`${from}T00:00:00.000Z`)
    if (to) createdAt.lte = new Date(`${to}T23:59:59.999Z`)

    const where: Record<string, unknown> = trash
      ? { deletedAt: { not: null } }
      : { deletedAt: null }
    if (Object.keys(createdAt).length) where.createdAt = createdAt
    if (status && Object.values(PAYMENT_STATUS).includes(status as PAYMENT_STATUS)) where.status = status
    if (method === 'qris' || method === 'transfer_bank') where.paymentMethod = method
    if (planId) where.invoice = { ...(where.invoice as object | undefined), planId }

    const [payments, plans] = await Promise.all([
      db.subscriptionPayment.findMany({
        where,
        include: {
          invoice: { select: { invoiceNumber: true, planName: true, planId: true, amount: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
      db.subscriptionPlan.findMany({ select: { id: true, name: true } }),
    ])

    const userIds = [...new Set(payments.map((p) => p.userId))]
    const users = await db.pengguna.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, namaLengkap: true, email: true },
    })
    const userMap = new Map(users.map((u) => [u.id, u]))
    const planMap = new Map(plans.map((p) => [p.id, p.name]))

    const rows = payments.map((p) => ({
      id: p.id,
      invoiceNumber: p.invoice.invoiceNumber,
      planName: p.invoice.planName,
      planId: p.invoice.planId,
      planNameCurrent: planMap.get(p.invoice.planId) ?? p.invoice.planName,
      customer: userMap.get(p.userId) ?? null,
      method: p.paymentMethod,
      methodLabel: PAYMENT_METHOD_LABEL[p.paymentMethod] ?? p.paymentMethod,
      amount: p.amount,
      status: p.status,
      senderName: p.senderName,
      transferDate: p.transferDate,
      reviewedBy: p.reviewedBy,
      reviewedAt: p.reviewedAt,
      rejectionReason: p.rejectionReason,
      deletedAt: p.deletedAt,
      createdAt: p.createdAt,
    }))

    if (exportCsv) {
      const csv = toCsv([
        ['Nomor Tagihan', 'Pelanggan', 'Username', 'Paket', 'Metode', 'Nominal', 'Status', 'Pengirim', 'Tgl Transfer', 'Diverifikasi Oleh', 'Waktu Verifikasi', 'Alasan Penolakan', 'Waktu Pengajuan'],
        ...rows.map((r) => [
          r.invoiceNumber,
          r.customer?.namaLengkap ?? '',
          r.customer?.username ?? '',
          r.planName,
          r.methodLabel,
          r.amount,
          r.status,
          r.senderName,
          r.transferDate,
          r.reviewedBy ?? '',
          r.reviewedAt ? new Date(r.reviewedAt).toISOString() : '',
          r.rejectionReason,
          new Date(r.createdAt).toISOString(),
        ]),
      ])
      return new NextResponse(`\uFEFF${csv}`, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="riwayat-transaksi-langganan-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      })
    }

    return NextResponse.json({ transactions: rows, total: rows.length })
  } catch (error) {
    console.error('GET /api/panel-admin/transactions error:', error)
    return NextResponse.json({ error: 'Gagal memuat riwayat transaksi' }, { status: 500 })
  }
}
