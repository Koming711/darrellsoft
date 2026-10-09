import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, isAdmin, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

// GET /api/payment-manual/proof/[id] — layani file bukti transfer (base64 → binary)
// Otorisasi: admin ATAU pemilik transaksi. Bukti TIDAK bisa diakses publik.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr

    const user = getServerUser(request)!
    const { id } = await params

    const confirmation = await db.paymentConfirmation.findUnique({
      where: { id },
      include: { paymentTransaction: { select: { userId: true, customerEmail: true } } },
    })
    if (!confirmation) {
      return NextResponse.json({ error: 'Bukti tidak ditemukan' }, { status: 404 })
    }

    if (!isAdmin(user.role)) {
      const isOwner = confirmation.paymentTransaction.userId === user.id
      let ownsByEmail = false
      if (!isOwner) {
        const pengguna = await db.pengguna.findUnique({ where: { id: user.id } })
        ownsByEmail = !!pengguna && pengguna.email === confirmation.paymentTransaction.customerEmail
      }
      if (!isOwner && !ownsByEmail) {
        return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
      }
    }

    const dataUrl = confirmation.proofFileUrl
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) {
      return NextResponse.json({ error: 'Format bukti tidak valid' }, { status: 422 })
    }

    const buffer = Buffer.from(match[2], 'base64')
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': match[1],
        'Content-Disposition': `inline; filename="${confirmation.proofFileName || 'bukti-transfer'}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, 'Gagal memuat bukti') }, { status: 500 })
  }
}
