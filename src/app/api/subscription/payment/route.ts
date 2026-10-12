// POST /api/subscription/payment — pelanggan kirim bukti pembayaran untuk tagihan miliknya.
// KEAMANAN:
// - Tagihan harus milik user (isolasi ketat).
// - Nominal dibayar = nominal tagihan (validasi server).
// - Tipe file bukti dibatasi: JPG/PNG/PDF, maks ±500KB.
// - Status langganan TIDAK pernah diaktifkan dari sini — hanya menunggu verifikasi admin.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser } from '@/lib/server-auth'
import { emitRealtime } from '@/lib/realtime-notify'
import {
  addAuditLog,
  addNotification,
  getPaymentSettings,
  INVOICE_STATUS,
  PAYMENT_METHODS,
  rupiah,
} from '@/lib/subscription'

export const dynamic = 'force-dynamic'

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'application/pdf']
const MAX_PROOF_BYTES = 350 * 1024 // 350 KB — sinkron dgn kompresi otomatis di client

export async function POST(request: NextRequest) {
  try {
    const user = getServerUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Anda harus login terlebih dahulu' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const invoiceId = typeof body?.invoiceId === 'string' ? body.invoiceId : ''
    const method = typeof body?.paymentMethod === 'string' ? body.paymentMethod : ''
    const senderName = typeof body?.senderName === 'string' ? body.senderName.trim().slice(0, 120) : ''
    const transferDate = typeof body?.transferDate === 'string' ? body.transferDate.slice(0, 10) : ''
    const proofDataUrl = typeof body?.proofDataUrl === 'string' ? body.proofDataUrl : ''
    const proofFileName = typeof body?.proofFileName === 'string' ? body.proofFileName.slice(0, 160) : ''

    if (!invoiceId) return NextResponse.json({ error: 'Tagihan tidak valid' }, { status: 400 })
    if (method !== PAYMENT_METHODS.QRIS && method !== PAYMENT_METHODS.TRANSFER_BANK) {
      return NextResponse.json({ error: 'Metode pembayaran tidak valid' }, { status: 400 })
    }
    if (method === PAYMENT_METHODS.TRANSFER_BANK && (!senderName || !transferDate)) {
      return NextResponse.json({ error: 'Nama pengirim dan tanggal transfer wajib diisi' }, { status: 400 })
    }
    if (!proofDataUrl.startsWith('data:')) {
      return NextResponse.json({ error: 'Bukti pembayaran wajib diunggah (JPG, PNG, atau PDF)' }, { status: 400 })
    }
    const mime = proofDataUrl.slice(5, proofDataUrl.indexOf(';'))
    if (!ALLOWED_MIME.includes(mime)) {
      return NextResponse.json({ error: 'Tipe file bukti harus JPG, PNG, atau PDF' }, { status: 400 })
    }
    const b64 = proofDataUrl.slice(proofDataUrl.indexOf(',') + 1)
    const bytes = Math.floor((b64.length * 3) / 4)
    if (bytes > MAX_PROOF_BYTES) {
      return NextResponse.json(
        { error: `Ukuran file bukti maksimal 350KB (file Anda ±${Math.round(bytes / 1024)}KB)` },
        { status: 400 },
      )
    }

    const invoice = await db.subscriptionInvoice.findUnique({ where: { id: invoiceId } })
    if (!invoice) return NextResponse.json({ error: 'Tagihan tidak ditemukan' }, { status: 404 })
    if (invoice.userId !== user.id) {
      return NextResponse.json({ error: 'Akses ditolak — tagihan bukan milik Anda' }, { status: 403 })
    }
    if (invoice.status === INVOICE_STATUS.MENUNGGU_VERIFIKASI) {
      return NextResponse.json(
        { error: 'Tagihan ini sudah menunggu verifikasi admin. Mohon tunggu.' },
        { status: 409 },
      )
    }
    if ([INVOICE_STATUS.DISETUJUI].includes(invoice.status as INVOICE_STATUS.DISETUJUI)) {
      return NextResponse.json({ error: 'Tagihan ini sudah disetujui' }, { status: 409 })
    }
    if (invoice.status === INVOICE_STATUS.KEDALUWARSA) {
      return NextResponse.json(
        { error: 'Tagihan sudah kedaluwarsa. Silakan buat tagihan baru dari halaman Pilih Paket.' },
        { status: 409 },
      )
    }
    if (invoice.status === INVOICE_STATUS.DIBATALKAN) {
      return NextResponse.json({ error: 'Tagihan sudah dibatalkan' }, { status: 409 })
    }
    // menunggu_pembayaran / ditolak → boleh kirim bukti

    const settings = await getPaymentSettings()
    if (method === PAYMENT_METHODS.QRIS && !settings.qrisImageUrl) {
      return NextResponse.json(
        { error: 'QRIS belum diatur oleh admin. Silakan gunakan Transfer Bank.' },
        { status: 400 },
      )
    }
    if (method === PAYMENT_METHODS.TRANSFER_BANK && !settings.bankAccountNumber) {
      return NextResponse.json(
        { error: 'Rekening transfer belum diatur oleh admin. Silakan gunakan QRIS.' },
        { status: 400 },
      )
    }

    const payment = await db.subscriptionPayment.create({
      data: {
        invoiceId: invoice.id,
        userId: user.id,
        paymentMethod: method,
        amount: invoice.amount, // server-side — selalu sesuai tagihan
        senderName,
        transferDate,
        proofFileUrl: proofDataUrl,
        proofFileName: proofFileName || 'bukti-pembayaran',
        status: 'menunggu_verifikasi',
      },
    })

    await db.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: { status: INVOICE_STATUS.MENUNGGU_VERIFIKASI },
    })

    await addAuditLog({
      userId: user.id,
      invoiceId: invoice.id,
      action: 'payment_submitted',
      newStatus: 'menunggu_verifikasi',
      performedBy: user.id,
      notes: `${method === 'qris' ? 'QRIS' : 'Transfer Bank'} — ${rupiah(invoice.amount)} — ${invoice.invoiceNumber}`,
    })
    await addNotification({
      userId: user.id,
      title: 'Bukti Pembayaran Terkirim',
      body: `Bukti pembayaran untuk tagihan ${invoice.invoiceNumber} berhasil dikirim dan sedang menunggu verifikasi admin.`,
      type: 'payment',
      link: '/langganan-saya',
    })
    await addNotification({
      userId: '',
      title: 'Pembayaran Menunggu Verifikasi',
      body: `Tagihan ${invoice.invoiceNumber} (${rupiah(invoice.amount)}) menunggu verifikasi.`,
      type: 'payment',
      link: '/panel-admin/pembayaran?tab=verifikasi',
    })
    // Realtime → semua admin: bukti pembayaran baru masuk
    emitRealtime({
      type: 'payment',
      title: 'Pembayaran Menunggu Verifikasi',
      body: `Tagihan ${invoice.invoiceNumber} (${rupiah(invoice.amount)}) menunggu verifikasi.`,
      link: '/panel-admin/pembayaran?tab=verifikasi',
    })

    return NextResponse.json({
      success: true,
      payment: { id: payment.id, status: payment.status },
      invoice: { id: invoice.id, status: INVOICE_STATUS.MENUNGGU_VERIFIKASI },
    })
  } catch (error) {
    console.error('POST /api/subscription/payment error:', error)
    return NextResponse.json({ error: 'Gagal mengirim bukti pembayaran' }, { status: 500 })
  }
}
