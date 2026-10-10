import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, isAdmin, requireAuth } from '@/lib/server-auth'
import {
  ensurePaymentDefaults,
  expireStaleTransactions,
  effectivePaymentStatus,
  generateTransactionNumber,
  createPaymentNotification,
} from '@/lib/payment-manual'
import { sanitizeError } from '@/lib/api-error'

// GET /api/payment-manual/transactions
// - Customer  : hanya transaksi miliknya (match userId cookie ATAU email Pengguna)
// - Admin     : semua transaksi + filter ?status= & ?q= (nama/email/nomor transaksi)
export async function GET(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr

    const user = getServerUser(request)!
    await expireStaleTransactions()

    const { searchParams } = request.nextUrl
    const status = searchParams.get('status') || ''
    const q = (searchParams.get('q') || '').trim()

    if (isAdmin(user.role)) {
      const where: Record<string, unknown> = {}
      if (status && status !== 'SEMUA') where.paymentStatus = status
      if (q) {
        where.OR = [
          { customerName: { contains: q } },
          { customerEmail: { contains: q } },
          { transactionNumber: { contains: q } },
        ]
      }
      const transactions = await db.paymentTransaction.findMany({
        where,
        include: {
          confirmations: { orderBy: { createdAt: 'desc' } },
        },
        orderBy: { createdAt: 'desc' },
        take: 300,
      })
      return NextResponse.json({
        transactions: transactions.map((t) => ({
          ...t,
          metadata: undefined, // jangan bocorkan metadata (username/password) ke klien
          paymentStatus: effectivePaymentStatus(t),
        })),
      })
    }

    // Customer: transaksi miliknya berdasarkan userId ATAU email akun
    const pengguna = await db.pengguna.findUnique({ where: { id: user.id } })
    const where: Record<string, unknown> = {
      OR: [{ userId: user.id }, ...(pengguna?.email ? [{ customerEmail: pengguna.email }] : [])],
    }
    if (status && status !== 'SEMUA') where.paymentStatus = status
    if (q) {
      where.AND = [
        { OR: where.OR },
        {
          OR: [
            { transactionNumber: { contains: q } },
            { planName: { contains: q } },
          ],
        },
      ]
    }
    delete where.OR

    const transactions = await db.paymentTransaction.findMany({
      where,
      include: { confirmations: { orderBy: { createdAt: 'desc' } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return NextResponse.json({
      transactions: transactions.map((t) => ({ ...t, metadata: undefined, paymentStatus: effectivePaymentStatus(t) })),
    })
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, 'Gagal memuat transaksi') }, { status: 500 })
  }
}

// POST /api/payment-manual/transactions — buat transaksi (dipakai checkout, boleh tamu)
// Body: { planId, customerName, customerEmail, customerPhone, username?, password? }
// Harga di-snapshot dari paket saat transaksi dibuat. Akun TIDAK dibuat sekarang —
// aktivasi hanya terjadi setelah admin menyetujui pembayaran.
export async function POST(request: NextRequest) {
  try {
    await ensurePaymentDefaults()
    const body = await request.json()
    const { planId, customerName, customerEmail, customerPhone, username, password } = body

    if (!planId) return NextResponse.json({ error: 'Paket wajib dipilih' }, { status: 400 })
    if (!customerName?.trim()) return NextResponse.json({ error: 'Nama wajib diisi' }, { status: 400 })
    if (!customerEmail?.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail.trim())) {
      return NextResponse.json({ error: 'Email valid wajib diisi' }, { status: 400 })
    }

    // Untuk checkout tamu (registrasi baru): username & password wajib untuk aktivasi akun nanti
    let metadata: Record<string, string> = {}
    if (username && password) {
      if (String(username).trim().length < 3) {
        return NextResponse.json({ error: 'Username minimal 3 karakter' }, { status: 400 })
      }
      if (String(password).length < 6) {
        return NextResponse.json({ error: 'Password minimal 6 karakter' }, { status: 400 })
      }
      const existingUser = await db.pengguna.findFirst({
        where: { OR: [{ username: String(username).trim() }, { email: String(customerEmail).trim() }] },
      })
      if (existingUser) {
        return NextResponse.json(
          { error: 'Username atau email sudah terdaftar. Gunakan data lain, atau login lalu perpanjang paket.' },
          { status: 409 }
        )
      }
      metadata = { username: String(username).trim(), password: String(password) }
    }

    const plan = await db.subscriptionPlan.findUnique({ where: { id: planId } })
    if (!plan || !plan.isActive) {
      return NextResponse.json({ error: 'Paket tidak tersedia' }, { status: 404 })
    }

    const setting = await db.paymentSetting.findFirst({ orderBy: { updatedAt: 'desc' } })
    const deadlineHours = setting?.paymentDeadlineHours ?? 24
    const expiresAt = new Date(Date.now() + deadlineHours * 60 * 60 * 1000)

    const discountAmount = Math.round((plan.price * (plan.discountPercent || 0)) / 100)
    const totalAmount = plan.price - discountAmount

    // Attach userId jika yang membuat transaksi sudah login
    const authUser = getServerUser(request)
    let userId: string | null = null
    if (authUser) {
      const pengguna = await db.pengguna.findUnique({ where: { id: authUser.id } })
      if (pengguna) userId = pengguna.id
    }

    const transaction = await db.paymentTransaction.create({
      data: {
        transactionNumber: generateTransactionNumber(),
        userId,
        customerName: String(customerName).trim(),
        customerEmail: String(customerEmail).trim(),
        customerPhone: customerPhone ? String(customerPhone).trim() : '',
        subscriptionPlanId: plan.id,
        planName: plan.planName,
        durationMonths: plan.durationMonths,
        amount: plan.price,
        discountAmount,
        totalAmount,
        paymentMethod: 'bank_transfer',
        paymentStatus: 'UNPAID',
        expiresAt,
        metadata: JSON.stringify(metadata),
      },
    })

    await db.paymentAuditLog.create({
      data: {
        paymentTransactionId: transaction.id,
        action: 'CREATED',
        actorId: userId ?? '',
        actorName: transaction.customerName,
        details: `Transaksi dibuat untuk paket ${plan.planName} (${transaction.totalAmount})`,
      },
    })

    await createPaymentNotification({
      userId: userId ?? undefined,
      title: `Transaksi ${transaction.transactionNumber} berhasil dibuat`,
      message: `Paket ${plan.planName} — total ${transaction.totalAmount}. Batas waktu pembayaran ${deadlineHours} jam.`,
      type: 'info',
      link: userId ? '/riwayat-langganan' : '/checkout',
    })

    return NextResponse.json({
      transaction: {
        ...transaction,
        metadata: undefined, // jangan kirim balik ke klien
      },
    })
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, 'Gagal membuat transaksi') }, { status: 500 })
  }
}
