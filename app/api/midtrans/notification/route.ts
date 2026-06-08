import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySignature, updatePaymentStatus } from '@/lib/midtrans';

// GET handler - for browser/testing access
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Midtrans notification endpoint is active. Only POST requests are processed.',
  });
}

// POST handler - receives Midtrans notifications
// CRITICAL: Always return HTTP 200 to Midtrans, even for invalid payloads.
// Returning non-200 causes Midtrans to retry endlessly and report errors.
export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      // Body is not valid JSON - still return 200
      console.warn('[Midtrans Notification] Invalid JSON body received');
      return NextResponse.json({ status: 'ok', message: 'Notification received (invalid JSON)' });
    }

    const {
      order_id, transaction_status, transaction_id, payment_type,
      fraud_status, status_code, gross_amount, signature_key, transaction_time,
    } = body as Record<string, string>;

    console.log('[Midtrans Notification]', {
      order_id,
      transaction_status,
      status_code,
      gross_amount,
      payment_type,
    });

    if (!order_id || !signature_key) {
      console.warn('[Midtrans Notification] Missing order_id or signature_key - likely a test/subscription notification');
      // ALWAYS return 200 to Midtrans - never reject, even for invalid payloads
      // This prevents Midtrans from endlessly retrying and reporting errors
      return NextResponse.json({ status: 'ok', message: 'Notification received (non-standard payload)' });
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
    console.error('[Midtrans Notification] Error:', message);
    // Return 200 to prevent Midtrans retries even on internal errors
    return NextResponse.json({ status: 'ok', message: 'Processed with warnings' });
  }
}
