import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, isAdmin, requireAuth } from '@/lib/server-auth'
import { effectivePaymentStatus } from '@/lib/payment-manual'
import { sanitizeError } from '@/lib/api-error'

// GET /api/payment-manual/transactions/[id] — detail transaksi (pemilik atau admin)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr

    const user = getServerUser(request)!
    const { id } = await params

    const transaction = await db.paymentTransaction.findUnique({
      where: { id },
      include: { confirmations: { orderBy: { createdAt: 'desc' } } },
    })
    if (!transaction) {
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 })
    }

    const isOwner = transaction.userId === user.id
    if (!isOwner && !isAdmin(user.role)) {
      // Cek juga berdasarkan email akun (transaksi tamu yang kemudian jadi akun)
      const pengguna = await db.pengguna.findUnique({ where: { id: user.id } })
      if (!pengguna || pengguna.email !== transaction.customerEmail) {
        return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
      }
    }

    return NextResponse.json({
      transaction: { ...transaction, metadata: undefined, paymentStatus: effectivePaymentStatus(transaction) },
    })
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, 'Gagal memuat detail transaksi') }, { status: 500 })
  }
}
