import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, isAdmin } from '@/lib/server-auth'
import {
  ALLOWED_PROOF_TYPES,
  MAX_PROOF_FILE_BYTES,
  createPaymentNotification,
  effectivePaymentStatus,
} from '@/lib/payment-manual'
import { sanitizeError } from '@/lib/api-error'

// POST /api/payment-manual/confirm — pelanggan kirim konfirmasi + bukti transfer (multipart)
// Body: transactionNumber, senderName, senderBank, transferAmount, transferDate, proof (File), customerNote
// Status transaksi → WAITING_VERIFICATION. TIDAK mengaktifkan paket — tunggu verifikasi admin.
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const transactionNumber = String(formData.get('transactionNumber') || '').trim()
    const senderName = String(formData.get('senderName') || '').trim()
    const senderBank = String(formData.get('senderBank') || '').trim()
    const transferAmount = Number(formData.get('transferAmount') || 0)
    const transferDateStr = String(formData.get('transferDate') || '').trim()
    const customerNote = String(formData.get('customerNote') || '').trim()
    const proof = formData.get('proof') as File | null

    if (!transactionNumber) {
      return NextResponse.json({ error: 'Nomor transaksi wajib ada' }, { status: 400 })
    }
    if (!senderName) return NextResponse.json({ error: 'Nama pengirim wajib diisi' }, { status: 400 })
    if (!senderBank) return NextResponse.json({ error: 'Bank asal wajib diisi' }, { status: 400 })
    if (!transferAmount || transferAmount <= 0) {
      return NextResponse.json({ error: 'Nominal transfer tidak valid' }, { status: 400 })
    }
    if (!transferDateStr) return NextResponse.json({ error: 'Tanggal transfer wajib diisi' }, { status: 400 })
    if (!proof) return NextResponse.json({ error: 'Bukti transfer wajib diunggah' }, { status: 400 })

    // Validasi file: JPG/JPEG/PNG/PDF, maks 2MB (server-side)
    if (!ALLOWED_PROOF_TYPES.includes(proof.type)) {
      return NextResponse.json({ error: 'Format file harus JPG, JPEG, PNG, atau PDF' }, { status: 400 })
    }
    if (proof.size > MAX_PROOF_FILE_BYTES) {
      return NextResponse.json({ error: 'Ukuran file maksimal 2MB' }, { status: 400 })
    }

    const transaction = await db.paymentTransaction.findUnique({
      where: { transactionNumber },
      include: { confirmations: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })
    if (!transaction) {
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 })
    }

    const status = effectivePaymentStatus(transaction)
    if (status === 'PAID') {
      return NextResponse.json({ error: 'Transaksi ini sudah lunas' }, { status: 409 })
    }
    if (status === 'CANCELLED' || status === 'EXPIRED') {
      return NextResponse.json({ error: `Transaksi sudah ${status === 'EXPIRED' ? 'kedaluwarsa' : 'dibatalkan'}. Silakan buat transaksi baru.` }, { status: 409 })
    }

    // Validasi nominal: harus sama dengan total tagihan (kesalahan transfer umum)
    if (Math.abs(transferAmount - transaction.totalAmount) > 1) {
      return NextResponse.json(
        {
          error: `Nominal transfer (${transferAmount}) harus sama dengan total pembayaran (${transaction.totalAmount}).`,
        },
        { status: 400 }
      )
    }

    // Jika transaksi milik user login, pastikan pemiliknya
    const authUser = getServerUser(request)
    if (authUser && !isAdmin(authUser.role)) {
      const pengguna = await db.pengguna.findUnique({ where: { id: authUser.id } })
      const isOwner =
        transaction.userId === authUser.id || (pengguna && pengguna.email === transaction.customerEmail)
      if (!isOwner) {
        return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
      }
    }

    // Simpan bukti sebagai data URL (base64) — diakses via API ber-otorisasi
    const bytes = await proof.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const proofFileUrl = `data:${proof.type};base64,${buffer.toString('base64')}`

    const transferDate = new Date(transferDateStr)
    if (isNaN(transferDate.getTime())) {
      return NextResponse.json({ error: 'Tanggal transfer tidak valid' }, { status: 400 })
    }

    const confirmation = await db.paymentConfirmation.create({
      data: {
        paymentTransactionId: transaction.id,
        senderName,
        senderBank,
        transferAmount,
        transferDate,
        proofFileUrl,
        proofFileName: proof.name || 'bukti-transfer',
        customerNote,
        verificationStatus: 'PENDING',
      },
    })

    // Bila transaksi sebelumnya REJECTED, kirim ulang bukti → kembali WAITING_VERIFICATION
    const updated = await db.paymentTransaction.update({
      where: { id: transaction.id },
      data: { paymentStatus: 'WAITING_VERIFICATION' },
    })

    await db.paymentAuditLog.create({
      data: {
        paymentTransactionId: transaction.id,
        action: 'PROOF_SUBMITTED',
        actorId: authUser?.id ?? '',
        actorName: senderName,
        details: `Bukti pembayaran dikirim (${senderBank}, ${transferAmount})`,
      },
    })

    // Notifikasi ke admin: bukti menunggu verifikasi
    await createPaymentNotification({
      userId: '',
      title: `Bukti pembayaran ${transaction.transactionNumber} menunggu verifikasi`,
      message: `${senderName} mengirim bukti untuk paket ${transaction.planName} (${transferAmount}).`,
      type: 'warning',
      link: '/administrasi/pembayaran-manual',
    })

    return NextResponse.json({
      success: true,
      message: 'Bukti pembayaran berhasil dikirim. Pembayaran Anda sedang diperiksa oleh admin Darrellsoft.',
      confirmation: { ...confirmation, proofFileUrl: undefined },
      transaction: { ...updated, metadata: undefined },
    })
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, 'Gagal mengirim konfirmasi pembayaran') }, { status: 500 })
  }
}
