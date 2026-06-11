import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createSnapTransaction, savePaymentRecord } from '@/lib/midtrans';

/**
 * Test mode: controlled by MIDTRANS_TEST_MODE env variable.
 * When true, simulates Midtrans transactions without calling the real API.
 * This allows full-flow testing (payment → account creation → auto-login)
 * without needing valid Midtrans sandbox credentials.
 */
const isTestMode = process.env.MIDTRANS_TEST_MODE === 'true';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { packageName, packageType, price, customerName, customerEmail, customerPhone, username, password, secondUsername } = body;

    if (!packageName || !packageType || !price || !customerName || !customerEmail || !customerPhone) {
      return NextResponse.json({ success: false, message: 'Semua field wajib diisi' }, { status: 400 });
    }

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const orderId = `PKG-${packageType.toUpperCase()}-${timestamp}-${random}`;

    // Store metadata (username, password, secondUsername) as JSON
    const metadata = JSON.stringify({
      username: username || '',
      password: password || '',
      secondUsername: secondUsername || '',
    });

    // Simpan ke database
    await savePaymentRecord(db, {
      orderId,
      packageName,
      packageType,
      grossAmount: Number(price),
      customerName,
      customerEmail,
      customerPhone,
      metadata,
    });

    // ─── TEST MODE: simulate Midtrans transaction without calling API ───
    if (isTestMode) {
      console.log('[Midtrans Test Mode] Simulating transaction for order:', orderId);

      // In test mode, create accounts immediately so auto-login works
      try {
        const PLAN_CONFIG: Record<string, { durationMonths: number; maxAccounts: number }> = {
          'bulanan-ekonomis': { durationMonths: 1, maxAccounts: 1 },
          'bulanan': { durationMonths: 1, maxAccounts: 2 },
          'tahunan': { durationMonths: 12, maxAccounts: 2 },
          'lifetime': { durationMonths: 1200, maxAccounts: 2 },
        };
        const planConfig = PLAN_CONFIG[packageType] || { durationMonths: 1, maxAccounts: 1 };
        const now = new Date();
        const validUntil = new Date(now);
        validUntil.setMonth(validUntil.getMonth() + planConfig.durationMonths);
        const metaUname = username || '';
        const metaPwd = password || '';
        const metaSecondUname = secondUsername || '';

        // Update payment status to success
        await db.payment.update({ where: { orderId }, data: { transactionStatus: 'success' } });

        // Check if pengguna already exists
        const existingPengguna = await db.pengguna.findFirst({
          where: { OR: [{ email: customerEmail }, { username: metaUname }] },
        });

        if (!existingPengguna && metaUname && metaPwd) {
          if (planConfig.maxAccounts >= 2 && metaSecondUname) {
            const grup = await db.grup.create({ data: { nama: `Grup ${metaUname}` } });
            const owner = await db.pengguna.create({
              data: { namaLengkap: customerName, nomorHP: customerPhone, email: customerEmail, username: metaUname, password: metaPwd, role: 'owner', grupId: grup.id, validUntil },
            });
            const userAcc = await db.pengguna.create({
              data: { namaLengkap: `Anggota ${metaSecondUname}`, nomorHP: customerPhone, email: `${metaSecondUname}@grup.${metaUname}`, username: metaSecondUname, password: metaPwd, role: 'user', grupId: grup.id, validUntil },
            });
            await db.pembeli.create({ data: { nama: customerName, nomorHP: customerPhone, email: customerEmail, alamat: '', catatan: `Pembayaran ${packageName} (Owner)`, role: 'owner', expiredDate: validUntil, penggunaId: owner.id } });
            await db.pembeli.create({ data: { nama: `Anggota ${metaSecondUname}`, nomorHP: customerPhone, email: `${metaSecondUname}@grup.${metaUname}`, alamat: '', catatan: `Pembayaran ${packageName} (User)`, role: 'user', expiredDate: validUntil, penggunaId: userAcc.id } });
            await db.payment.update({ where: { orderId }, data: { userId: owner.id } });
          } else {
            const pengguna = await db.pengguna.create({
              data: { namaLengkap: customerName, nomorHP: customerPhone, email: customerEmail, username: metaUname, password: metaPwd, role: 'owner', validUntil },
            });
            await db.pembeli.create({ data: { nama: customerName, nomorHP: customerPhone, email: customerEmail, alamat: '', catatan: `Pembayaran ${packageName}`, role: 'owner', expiredDate: validUntil, penggunaId: pengguna.id } });
            await db.payment.update({ where: { orderId }, data: { userId: pengguna.id } });
          }
        }
      } catch (activateErr) {
        console.warn('[Test Mode Activate] Error creating accounts:', activateErr);
      }

      const fakeToken = `test_snap_token_${timestamp}_${random}`;
      return NextResponse.json({
        success: true,
        token: fakeToken,
        redirectUrl: '',
        orderId,
        mock: true,
        testMode: true,
      });
    }

    // ─── PRODUCTION MODE: panggil Midtrans API asli ───
    const transaction = await createSnapTransaction({
      orderId,
      amount: Number(price),
      packageName,
      packageType,
      customerName,
      customerEmail,
      customerPhone,
      username: username || '',
      password: password || '',
      secondUsername: secondUsername || '',
    });

    return NextResponse.json({
      success: true,
      token: transaction.token,
      redirectUrl: transaction.redirect_url,
      orderId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal membuat transaksi';
    console.error('Create transaction error:', error);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
