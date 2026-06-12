import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySignature, updatePaymentStatus } from '@/lib/midtrans';

// Plan config: maps packageType to duration and account count
const PLAN_CONFIG: Record<string, { durationMonths: number; maxAccounts: number }> = {
  'bulanan-ekonomis': { durationMonths: 1, maxAccounts: 1 },
  'bulanan': { durationMonths: 1, maxAccounts: 2 },
  'tahunan': { durationMonths: 12, maxAccounts: 2 },
  'lifetime': { durationMonths: 1200, maxAccounts: 2 }, // 100 years
};

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
      custom_field1, custom_field2, custom_field3,
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
      return NextResponse.json({ status: 'ok', message: 'Notification received (non-standard payload)' });
    }

    // Verify signature
    const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
    if (!serverKey) {
      console.error('[Midtrans Notification] MIDTRANS_SERVER_KEY is not set! Cannot verify signature.');
      return NextResponse.json({ status: 'ok', message: 'Server key not configured' });
    }

    const isValid = await verifySignature(order_id, status_code, gross_amount, serverKey, signature_key);
    if (!isValid) {
      console.error('[Midtrans Notification] Invalid signature for order:', order_id);
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

      // Handle successful payment - create accounts + pembeli records
      if (finalStatus === 'success') {
        const payment = await db.payment.findUnique({ where: { orderId: order_id } });
        if (payment) {
          // Parse metadata to get username, password, secondUsername
          let metaUsername = custom_field1 || '';
          let metaPassword = custom_field2 || '';
          let metaSecondUsername = custom_field3 || '';

          // Also try to read from payment.metadata (stored during create-transaction)
          if ((!metaUsername || !metaPassword) && payment.metadata) {
            try {
              const parsed = JSON.parse(payment.metadata);
              if (!metaUsername && parsed.username) metaUsername = parsed.username;
              if (!metaPassword && parsed.password) metaPassword = parsed.password;
              if (!metaSecondUsername && parsed.secondUsername) metaSecondUsername = parsed.secondUsername;
            } catch {}
          }

          const planConfig = PLAN_CONFIG[payment.packageType] || { durationMonths: 1, maxAccounts: 1 };
          const now = new Date();
          const validUntil = new Date(now);
          validUntil.setMonth(validUntil.getMonth() + planConfig.durationMonths);

          // Check if pengguna already exists for this payment
          const existingPengguna = await db.pengguna.findFirst({
            where: { OR: [{ email: payment.customerEmail }, { nomorHP: payment.customerPhone }] },
          });

          if (existingPengguna) {
            // Update existing pengguna's validUntil
            const baseDate = existingPengguna.validUntil && existingPengguna.validUntil > now ? existingPengguna.validUntil : now;
            const extendedExpiry = new Date(baseDate);
            extendedExpiry.setMonth(extendedExpiry.getMonth() + planConfig.durationMonths);
            await db.pengguna.update({ where: { id: existingPengguna.id }, data: { validUntil: extendedExpiry } });
            await db.payment.update({ where: { orderId: order_id }, data: { userId: existingPengguna.id } });

            // Update or create Pembeli for existing pengguna
            const existingPembeli = await db.pembeli.findFirst({
              where: { penggunaId: existingPengguna.id },
            });
            if (existingPembeli) {
              await db.pembeli.update({
                where: { id: existingPembeli.id },
                data: { role: 'owner', expiredDate: extendedExpiry },
              });
            } else {
              await db.pembeli.create({
                data: {
                  nama: existingPengguna.namaLengkap,
                  nomorHP: existingPengguna.nomorHP,
                  email: existingPengguna.email,
                  alamat: '',
                  catatan: `Pembayaran ${payment.packageName}`,
                  role: 'owner',
                  expiredDate: extendedExpiry,
                  penggunaId: existingPengguna.id,
                },
              });
            }

            console.log(`[Midtrans] Extended subscription for ${existingPengguna.email} until ${extendedExpiry.toISOString()}`);
          } else if (metaUsername && metaPassword) {
            // Create new accounts for new payment
            if (planConfig.maxAccounts >= 2 && metaSecondUsername) {
              // Multi-account plan: create Grup + 2 Pengguna (owner + user) + 2 Pembeli
              const grup = await db.grup.create({
                data: { nama: `Grup ${metaUsername}` },
              });

              // Create Owner account
              const owner = await db.pengguna.create({
                data: {
                  namaLengkap: payment.customerName,
                  nomorHP: payment.customerPhone,
                  email: payment.customerEmail,
                  username: metaUsername,
                  password: metaPassword,
                  role: 'owner',
                  grupId: grup.id,
                  validUntil,
                },
              });

              // Create User account (same password, second username)
              const userAccount = await db.pengguna.create({
                data: {
                  namaLengkap: `Anggota ${metaSecondUsername}`,
                  nomorHP: payment.customerPhone,
                  email: `${metaSecondUsername}@grup.${metaUsername}`,
                  username: metaSecondUsername,
                  password: metaPassword,
                  role: 'user',
                  grupId: grup.id,
                  validUntil,
                },
              });

              // Create Pembeli record for Owner
              await db.pembeli.create({
                data: {
                  nama: payment.customerName,
                  nomorHP: payment.customerPhone,
                  email: payment.customerEmail,
                  alamat: '',
                  catatan: `Pembayaran ${payment.packageName} (Owner)`,
                  role: 'owner',
                  expiredDate: validUntil,
                  penggunaId: owner.id,
                },
              });

              // Create Pembeli record for User
              await db.pembeli.create({
                data: {
                  nama: `Anggota ${metaSecondUsername}`,
                  nomorHP: payment.customerPhone,
                  email: `${metaSecondUsername}@grup.${metaUsername}`,
                  alamat: '',
                  catatan: `Pembayaran ${payment.packageName} (User)`,
                  role: 'user',
                  expiredDate: validUntil,
                  penggunaId: userAccount.id,
                },
              });

              await db.payment.update({ where: { orderId: order_id }, data: { userId: owner.id } });
              console.log(`[Midtrans] Created grup ${grup.id} with owner ${owner.username} and user ${userAccount.username}, + 2 pembeli records`);
            } else {
              // Single account plan: create just 1 Pengguna + 1 Pembeli
              const pengguna = await db.pengguna.create({
                data: {
                  namaLengkap: payment.customerName,
                  nomorHP: payment.customerPhone,
                  email: payment.customerEmail,
                  username: metaUsername,
                  password: metaPassword,
                  role: 'owner',
                  validUntil,
                },
              });

              // Create Pembeli record
              await db.pembeli.create({
                data: {
                  nama: payment.customerName,
                  nomorHP: payment.customerPhone,
                  email: payment.customerEmail,
                  alamat: '',
                  catatan: `Pembayaran ${payment.packageName}`,
                  role: 'owner',
                  expiredDate: validUntil,
                  penggunaId: pengguna.id,
                },
              });

              await db.payment.update({ where: { orderId: order_id }, data: { userId: pengguna.id } });
              console.log(`[Midtrans] Created pengguna ${pengguna.username} + pembeli until ${validUntil.toISOString()}`);
            }

            // Also update CalonPembeli if exists
            const calonPembeli = await db.calonPembeli.findFirst({
              where: { OR: [{ email: payment.customerEmail }, { nomorHP: payment.customerPhone }] },
            });
            if (calonPembeli) {
              await db.calonPembeli.update({
                where: { id: calonPembeli.id },
                data: {
                  status: 'aktif',
                  role: 'owner',
                  expiredDate: validUntil,
                },
              });
            }
          } else {
            console.warn(`[Midtrans] No username/password found in metadata for payment ${order_id}. Cannot auto-create accounts.`);
          }
        }
      }
    } else {
      console.warn(`[Midtrans Notification] Payment record not found for order: ${order_id}. This may be a test notification.`);
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Notification handler error';
    console.error('[Midtrans Notification] Error:', message);
    return NextResponse.json({ status: 'ok', message: 'Processed with warnings' });
  }
}
