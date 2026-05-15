import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createSnapTransaction, savePaymentRecord } from '@/lib/midtrans';

const FAKE_KEY = 'SB-Mid-server-FAKE_TEST_KEY_12345';
const isFakeKey = process.env.MIDTRANS_SERVER_KEY === FAKE_KEY;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { packageName, packageType, price, customerName, customerEmail, customerPhone } = body;

    if (!packageName || !packageType || !price || !customerName || !customerEmail || !customerPhone) {
      return NextResponse.json({ success: false, message: 'Semua field wajib diisi' }, { status: 400 });
    }

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const orderId = `PKG-${packageType.toUpperCase()}-${timestamp}-${random}`;

    // Simpan ke database
    await savePaymentRecord(db, {
      orderId,
      packageName,
      packageType,
      grossAmount: Number(price),
      customerName,
      customerEmail,
      customerPhone,
    });

    // ─── MOCK MODE: tidak memanggil Midtrans API asli ───
    if (isFakeKey) {
      const fakeToken = `fake_snap_token_${timestamp}_${random}`;
      return NextResponse.json({
        success: true,
        token: fakeToken,
        redirectUrl: '',
        orderId,
        mock: true,
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
