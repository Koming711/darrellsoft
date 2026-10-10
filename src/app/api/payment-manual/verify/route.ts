import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, isAdmin, requireAdmin } from '@/lib/server-auth'
import { createPaymentNotification, formatRupiah } from '@/lib/payment-manual'
import { sanitizeError } from '@/lib/api-error'

// POST /api/payment-manual/verify — admin SETUJUI / TOLAK pembayaran
// Body: { id, action: 'approve' | 'reject', reason? }
// approve → status PAID + aktivasi langganan (extend validUntil, buat/perbarui UserSubscription)
// reject  → status REJECTED + alasan wajib (pelanggan bisa unggah ulang bukti)
// Proteksi: hanya admin, transaksi WAITING_VERIFICATION, tidak bisa verifikasi ganda.
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAdmin(request)
    if (authErr) return authErr

    const admin = getServerUser(request)!
    const body = await request.json()
    const { id, action, reason } = body

    if (!id || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Parameter tidak valid' }, { status: 400 })
    }
    if (action === 'reject' && (!reason || String(reason).trim().length < 5)) {
      return NextResponse.json({ error: 'Alasan penolakan wajib diisi (min. 5 karakter)' }, { status: 400 })
    }

    const adminUser = await db.pengguna.findUnique({ where: { id: admin.id } })
    const adminName = adminUser?.namaLengkap || admin.id

    const transaction = await db.paymentTransaction.findUnique({
      where: { id },
      include: { confirmations: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })
    if (!transaction) {
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 })
    }
    if (transaction.paymentStatus === 'PAID') {
      return NextResponse.json({ error: 'Transaksi sudah diverifikasi & lunas (tidak bisa diverifikasi dua kali)' }, { status: 409 })
    }
    if (transaction.paymentStatus === 'REJECTED' && action === 'reject') {
      return NextResponse.json({ error: 'Transaksi sudah ditolak sebelumnya' }, { status: 409 })
    }
    if (transaction.paymentStatus !== 'WAITING_VERIFICATION') {
      return NextResponse.json(
        { error: `Status transaksi ${transaction.paymentStatus} — hanya WAITING_VERIFICATION yang bisa diverifikasi` },
        { status: 409 }
      )
    }

    const latestConfirmation = transaction.confirmations[0]

    // ============ TOLAK ============
    if (action === 'reject') {
      const rejectReason = String(reason).trim()
      await db.$transaction(async (tx) => {
        await tx.paymentTransaction.update({
          where: { id },
          data: {
            paymentStatus: 'REJECTED',
            verifiedBy: admin.id,
            verifiedByName: adminName,
            verifiedAt: new Date(),
          },
        })
        if (latestConfirmation) {
          await tx.paymentConfirmation.update({
            where: { id: latestConfirmation.id },
            data: {
              verificationStatus: 'REJECTED',
              rejectionReason: rejectReason,
              verifiedBy: admin.id,
              verifiedByName: adminName,
              verifiedAt: new Date(),
            },
          })
        }
        await tx.paymentAuditLog.create({
          data: {
            paymentTransactionId: id,
            action: 'REJECTED',
            actorId: admin.id,
            actorName: adminName,
            details: `Ditolak: ${rejectReason}`,
          },
        })
      })

      await createPaymentNotification({
        userId: transaction.userId ?? '',
        title: `Pembayaran ${transaction.transactionNumber} ditolak`,
        message: `Alasan: ${rejectReason}. Silakan unggah ulang bukti pembayaran yang benar.`,
        type: 'error',
        link: '/riwayat-langganan',
        emailTo: transaction.customerEmail,
      })

      return NextResponse.json({ success: true, status: 'REJECTED' })
    }

    // ============ SETUJUI + AKTIVASI LANGGANAN ============
    const now = new Date()
    const plan = await db.subscriptionPlan.findUnique({ where: { id: transaction.subscriptionPlanId } })
    const durationMonths = plan?.durationMonths ?? transaction.durationMonths

    let activatedUserId = transaction.userId || ''
    let activationDetails = ''
    let createdNewAccount = false

    // 1) Tentukan akun pelanggan: userId transaksi → metadata (registrasi baru) → email
    let pengguna = transaction.userId ? await db.pengguna.findUnique({ where: { id: transaction.userId } }) : null

    let metaUsername = ''
    let metaPassword = ''
    try {
      const meta = JSON.parse(transaction.metadata || '{}')
      metaUsername = meta.username || ''
      metaPassword = meta.password || ''
    } catch {}

    if (!pengguna && metaUsername) {
      pengguna = await db.pengguna.findUnique({ where: { username: metaUsername } })
    }
    if (!pengguna) {
      pengguna = await db.pengguna.findFirst({
        where: { OR: [{ email: transaction.customerEmail }, ...(transaction.customerPhone ? [{ nomorHP: transaction.customerPhone }] : [])] },
      })
    }

    // 2) Hitung tanggal: perpanjangan tidak menghilangkan sisa masa aktif
    const baseDate = pengguna?.validUntil && pengguna.validUntil > now ? pengguna.validUntil : now
    const newEndDate = new Date(baseDate)
    newEndDate.setMonth(newEndDate.getMonth() + durationMonths)

    if (!pengguna) {
      // Registrasi baru — buat akun OWNER dari metadata checkout.
      // Paritas dengan flow Midtrans (activate route): Grup + Pengguna role 'owner'
      // + record Pembeli (wajib — tanpa Pembeli, login menganggap akun orphan & menghapusnya).
      if (!metaUsername || !metaPassword) {
        return NextResponse.json(
          { error: 'Tidak ada data akun untuk aktivasi (transaksi tamu tanpa registrasi). Hubungi pelanggan.' },
          { status: 422 }
        )
      }
      const grup = await db.grup.create({ data: { nama: `Grup ${metaUsername}` } })
      pengguna = await db.pengguna.create({
        data: {
          namaLengkap: transaction.customerName,
          nomorHP: transaction.customerPhone || '0000000000',
          email: transaction.customerEmail,
          username: metaUsername,
          password: metaPassword,
          role: 'owner',
          grupId: grup.id,
          validUntil: newEndDate,
        },
      })
      await db.pembeli.create({
        data: {
          nama: transaction.customerName,
          nomorHP: transaction.customerPhone || '0000000000',
          email: transaction.customerEmail,
          alamat: '',
          catatan: `Pembayaran ${transaction.planName} (${transaction.transactionNumber})`,
          role: 'owner',
          expiredDate: newEndDate,
          penggunaId: pengguna.id,
        },
      })
      // Hapus password dari metadata setelah akun dibuat (keamanan)
      await db.paymentTransaction.update({
        where: { id },
        data: { metadata: JSON.stringify({ username: metaUsername }) },
      })
      createdNewAccount = true
      activatedUserId = pengguna.id
      activationDetails = `Akun baru dibuat: ${metaUsername}`
    } else {
      // Perpanjangan — extend dari sisa masa aktif
      await db.pengguna.update({ where: { id: pengguna.id }, data: { validUntil: newEndDate } })
      // Pastikan record Pembeli ada & expiredDate ikut diperpanjang (paritas Midtrans)
      const existingPembeli = await db.pembeli.findFirst({ where: { penggunaId: pengguna.id } })
      if (existingPembeli) {
        await db.pembeli.update({
          where: { id: existingPembeli.id },
          data: { role: 'owner', expiredDate: newEndDate },
        })
      } else {
        await db.pembeli.create({
          data: {
            nama: pengguna.namaLengkap || transaction.customerName,
            nomorHP: pengguna.nomorHP || transaction.customerPhone,
            email: pengguna.email || transaction.customerEmail,
            alamat: '',
            catatan: `Pembayaran ${transaction.planName} (${transaction.transactionNumber})`,
            role: 'owner',
            expiredDate: newEndDate,
            penggunaId: pengguna.id,
          },
        })
      }
      activatedUserId = pengguna.id
      activationDetails = `Langganan diperpanjang s/d ${newEndDate.toISOString().slice(0, 10)} (base ${baseDate.toISOString().slice(0, 10)})`
    }

    // 3) Update transaksi + aktivasi + langganan dalam SATU transaksi database
    await db.$transaction(async (tx) => {
      const updated = await tx.paymentTransaction.update({
        where: { id },
        data: {
          paymentStatus: 'PAID',
          verifiedBy: admin.id,
          verifiedByName: adminName,
          verifiedAt: now,
          activatedAt: transaction.activatedAt ?? now, // cegah aktivasi ganda
          userId: activatedUserId || transaction.userId,
        },
      })

      if (latestConfirmation) {
        await tx.paymentConfirmation.update({
          where: { id: latestConfirmation.id },
          data: {
            verificationStatus: 'APPROVED',
            verifiedBy: admin.id,
            verifiedByName: adminName,
            verifiedAt: now,
          },
        })
      }

      // Buat/perbarui UserSubscription (idempoten per transaksi)
      const existingSub = await tx.userSubscription.findFirst({
        where: { paymentTransactionId: id },
      })
      if (!existingSub) {
        const activeSub = await tx.userSubscription.findFirst({
          where: { userId: activatedUserId, subscriptionStatus: 'ACTIVE' },
          orderBy: { endDate: 'desc' },
        })
        if (activeSub) {
          await tx.userSubscription.update({
            where: { id: activeSub.id },
            data: {
              endDate: newEndDate,
              subscriptionPlanId: transaction.subscriptionPlanId,
              planName: transaction.planName,
              paymentTransactionId: id,
            },
          })
        } else {
          await tx.userSubscription.create({
            data: {
              userId: activatedUserId,
              subscriptionPlanId: transaction.subscriptionPlanId,
              paymentTransactionId: id,
              planName: transaction.planName,
              startDate: baseDate,
              endDate: newEndDate,
              subscriptionStatus: 'ACTIVE',
            },
          })
        }
      }

      await tx.paymentAuditLog.create({
        data: {
          paymentTransactionId: id,
          action: 'APPROVED',
          actorId: admin.id,
          actorName: adminName,
          details: `Disetujui oleh ${adminName} — ${formatRupiah(transaction.totalAmount)}`,
        },
      })
      await tx.paymentAuditLog.create({
        data: {
          paymentTransactionId: id,
          action: 'ACTIVATED',
          actorId: admin.id,
          actorName: adminName,
          details: `${createdNewAccount ? activationDetails : activationDetails} — langganan ${transaction.planName} ${durationMonths} bulan`,
        },
      })

      return updated
    })

    // 4) Notifikasi pelanggan: pembayaran disetujui + langganan aktif
    await createPaymentNotification({
      userId: activatedUserId,
      title: `Pembayaran ${transaction.transactionNumber} disetujui`,
      message: `Paket ${transaction.planName} aktif sampai ${newEndDate.toLocaleDateString('id-ID')}. Terima kasih!`,
      type: 'success',
      link: '/riwayat-langganan',
      emailTo: transaction.customerEmail,
    })
    await createPaymentNotification({
      userId: activatedUserId,
      title: 'Langganan berhasil diaktifkan',
      message: `Langganan ${transaction.planName} (${durationMonths} bulan) berlaku ${baseDate.toLocaleDateString('id-ID')} — ${newEndDate.toLocaleDateString('id-ID')}.`,
      type: 'success',
      link: '/riwayat-langganan',
    })

    return NextResponse.json({ success: true, status: 'PAID', activatedUserId, endDate: newEndDate })
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, 'Gagal memverifikasi pembayaran') }, { status: 500 })
  }
}
