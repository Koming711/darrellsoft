// GET /api/panel-admin/akun/renewal-payments?id={calonPembeliId}
//
// Bukti transfer PERPANJANGAN milik satu akun pelanggan (Panel Admin →
// Pelanggan → Perpanjang). Dipakai di dialog "Perpanjang Masa Berlaku"
// agar Admin bisa memeriksa bukti transfer/QRIS sebelum memperpanjang
// masa berlaku secara manual.
//
// Identitas pemilik tagihan bisa dua tabel (pola sama dengan
// /api/panel-admin/payments):
// - CalonPembeli.id  → akun hasil pendaftaran mandiri (sesi = calon)
// - CalonPembeli.userId → akun terkonversi ke Pengguna
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const err = requireAdmin(request)
  if (err) return err

  try {
    const id = request.nextUrl.searchParams.get('id') || ''
    if (!id) {
      return NextResponse.json({ error: 'Parameter id wajib diisi.' }, { status: 400 })
    }

    const calon = await db.calonPembeli.findUnique({
      where: { id },
      select: { id: true, userId: true },
    })
    if (!calon) {
      return NextResponse.json({ error: 'Akun tidak ditemukan.' }, { status: 404 })
    }

    // Jangan kirim proofFileUrl (base64 bisa sangat besar) — bukti diambil
    // on-demand via /api/subscription/proof/[paymentId].
    const ownerIds = [calon.id, calon.userId].filter((v): v is string => !!v)
    const invoices = await db.subscriptionInvoice.findMany({
      where: { userId: { in: ownerIds } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        invoiceNumber: true,
        planName: true,
        amount: true,
        status: true,
        createdAt: true,
        payments: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            paymentMethod: true,
            amount: true,
            senderName: true,
            transferDate: true,
            proofFileName: true,
            proofFileUrl: true, // hanya untuk hitung hasProof — TIDAK dikirim ke client
            status: true,
            rejectionReason: true,
            createdAt: true,
          },
        },
      },
    })

    return NextResponse.json({
      invoices: invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        planName: inv.planName,
        amount: inv.amount,
        status: inv.status,
        createdAt: inv.createdAt.toISOString(),
        payments: inv.payments.map((p) => ({
          id: p.id,
          paymentMethod: p.paymentMethod,
          amount: p.amount,
          senderName: p.senderName,
          transferDate: p.transferDate,
          proofFileName: p.proofFileName,
          hasProof: !!p.proofFileUrl,
          status: p.status,
          rejectionReason: p.rejectionReason,
          createdAt: p.createdAt.toISOString(),
        })),
      })),
    })
  } catch (error) {
    console.error('GET /api/panel-admin/akun/renewal-payments error:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Gagal memuat bukti transfer perpanjangan.') },
      { status: 500 },
    )
  }
}
