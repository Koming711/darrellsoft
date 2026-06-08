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

    console.log('[Midtrans Notification]', {
      order_id,
      transaction_status,
      status_code,
      gross_amount,
      payment_type,
    });

    if (!order_id || !signature_key) {
      console.warn('[Midtrans Notification] Missing order_id or signature_key');
      return NextResponse.json({ status: 'error', message: 'Invalid payload' }, { status: 400 });
    }

    // Verify signature - always return 200 to Midtrans to prevent retries,
    // but log the issue for debugging
    const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
    if (!serverKey) {
      console.error('[Midtrans Notification] MIDTRANS_SERVER_KEY is not set! Cannot verify signature.');
      // Return 200 anyway so Midtrans stops retrying, but don't process the payment
      return NextResponse.json({ status: 'ok', message: 'Server key not configured' });
    }

    const isValid = await verifySignature(order_id, status_code, gross_amount, serverKey, signature_key);
    if (!isValid) {
      console.error('[Midtrans Notification] Invalid signature for order:', order_id);
      // Return 200 to stop Midtrans retries, but don't process
      return NextResponse.json({ status: 'ok', message: 'Signature verification skipped' });
    }

    // Map Midtrans transaction status to internal status
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

    // Check if payment record exists
    const existingPayment = await db.payment.findUnique({ where: { orderId: order_id } });

    if (existingPayment) {
      await updatePaymentStatus(db, order_id, {
        transactionStatus: finalStatus,
        transactionId: transaction_id,
        paymentType: payment_type,
        fraudStatus: fraud_status,
        transactionTime: transaction_time ? new Date(transaction_time) : undefined,
      });

      // Handle successful payment - extend subscription
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
            console.log(`[Midtrans] Extended subscription for ${pengguna.email} until ${extendedExpiry.toISOString()}`);
          } else {
            console.warn(`[Midtrans] No matching pengguna found for payment ${order_id}`);
          }
        }
      }
    } else {
      console.warn(`[Midtrans Notification] Payment record not found for order: ${order_id}. This may be a test notification.`);
      // Still return 200 so Midtrans doesn't keep retrying
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Notification handler error';
    console.error('[Midtrans Notification] Error:', error);
    // Return 200 to prevent Midtrans retries even on internal errors
    return NextResponse.json({ status: 'ok', message: 'Processed with warnings' });
  }
}
