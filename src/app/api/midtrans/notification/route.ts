import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySignature, updatePaymentStatus } from '@/lib/midtrans';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      order_id, transaction_status, transaction_id, payment_type,
      fraud_status, status_code, gross_amount, signature_key, transaction_time,
    } = body;

    if (!order_id || !signature_key) {
      return NextResponse.json({ status: 'error', message: 'Invalid payload' }, { status: 400 });
    }

    const isValid = await verifySignature(order_id, status_code, gross_amount, process.env.MIDTRANS_SERVER_KEY || '', signature_key);
    if (!isValid) {
      return NextResponse.json({ status: 'error', message: 'Invalid signature' }, { status: 403 });
    }

    let finalStatus = transaction_status;
    if (transaction_status === 'capture') {
      finalStatus = fraud_status === 'accept' ? 'success' : 'challenge';
    } else if (transaction_status === 'settlement') {
      finalStatus = 'success';
    } else if (transaction_status === 'cancel' || transaction_status === 'deny' || transaction_status === 'expire') {
      finalStatus = 'failed';
    } else if (transaction_status === 'pending') {
      finalStatus = 'pending';
    }

    await updatePaymentStatus(db, order_id, {
      transactionStatus: finalStatus,
      transactionId: transaction_id,
      paymentType: payment_type,
      fraudStatus: fraud_status,
      transactionTime: transaction_time ? new Date(transaction_time) : undefined,
    });

    if (finalStatus === 'success') {
      const payment = await db.payment.findUnique({ where: { orderId: order_id } });
      if (payment) {
        const pengguna = await db.pengguna.findFirst({
          where: { OR: [{ email: payment.customerEmail }, { nomorHP: payment.customerPhone }] },
        });
        if (pengguna) {
          const now = new Date();
          const baseDate = pengguna.validUntil && pengguna.validUntil > now ? pengguna.validUntil : now;
          let extendedExpiry: Date;
          if (payment.packageType === 'bulanan') {
            extendedExpiry = new Date(baseDate);
            extendedExpiry.setMonth(extendedExpiry.getMonth() + 1);
          } else if (payment.packageType === 'tahunan') {
            extendedExpiry = new Date(baseDate);
            extendedExpiry.setFullYear(extendedExpiry.getFullYear() + 1);
          } else {
            extendedExpiry = new Date(baseDate);
            extendedExpiry.setFullYear(extendedExpiry.getFullYear() + 100);
          }
          await db.pengguna.update({ where: { id: pengguna.id }, data: { validUntil: extendedExpiry } });
          await db.payment.update({ where: { orderId: order_id }, data: { userId: pengguna.id } });
          console.log(`Extended subscription for ${pengguna.email} until ${extendedExpiry.toISOString()}`);
        }
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Notification handler error';
    console.error('Notification error:', error);
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
}
