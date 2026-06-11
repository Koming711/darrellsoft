import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Plan config: maps packageType to duration and account count
const PLAN_CONFIG: Record<string, { durationMonths: number; maxAccounts: number }> = {
  'bulanan-ekonomis': { durationMonths: 1, maxAccounts: 1 },
  'bulanan': { durationMonths: 1, maxAccounts: 2 },
  'tahunan': { durationMonths: 12, maxAccounts: 2 },
  'lifetime': { durationMonths: 1200, maxAccounts: 2 },
};

/**
 * POST /api/midtrans/activate
 * Triggers account creation from payment metadata.
 * Used after payment success to ensure accounts are created immediately,
 * especially in mock/sandbox mode where the webhook may not fire.
 */
export async function POST(request: NextRequest) {
  try {
    const { orderId } = await request.json();

    if (!orderId) {
      return NextResponse.json({ success: false, message: 'orderId wajib diisi' }, { status: 400 });
    }

    // Find the payment record
    const payment = await db.payment.findUnique({ where: { orderId } });
    if (!payment) {
      return NextResponse.json({ success: false, message: 'Payment not found' }, { status: 404 });
    }

    // If already processed (userId exists), skip
    if (payment.userId) {
      return NextResponse.json({ success: true, message: 'Already activated', alreadyActive: true });
    }

    // Parse metadata to get username, password
    let metaUsername = '';
    let metaPassword = '';

    if (payment.metadata) {
      try {
        const parsed = JSON.parse(payment.metadata);
        metaUsername = parsed.username || '';
        metaPassword = parsed.password || '';
      } catch {}
    }

    if (!metaUsername || !metaPassword) {
      return NextResponse.json({ success: false, message: 'No username/password in metadata' }, { status: 400 });
    }

    // Update payment status to success
    await db.payment.update({
      where: { orderId },
      data: { transactionStatus: 'success' },
    });

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
      await db.payment.update({ where: { orderId }, data: { userId: existingPengguna.id } });

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

      console.log(`[Activate] Extended subscription for ${existingPengguna.email} until ${extendedExpiry.toISOString()}`);
      return NextResponse.json({ success: true, message: 'Subscription extended', username: existingPengguna.username });
    }

    // Create new accounts
    if (planConfig.maxAccounts >= 2) {
      // Multi-account plan: create Grup + Owner Pengguna + Owner Pembeli
      // Second account can be added later by owner from dashboard
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

      await db.payment.update({ where: { orderId }, data: { userId: owner.id } });
      console.log(`[Activate] Created grup ${grup.id} with owner ${owner.username} (second account to be added later)`);
      return NextResponse.json({ success: true, message: 'Account created', username: owner.username });
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

      await db.payment.update({ where: { orderId }, data: { userId: pengguna.id } });
      console.log(`[Activate] Created pengguna ${pengguna.username} + pembeli until ${validUntil.toISOString()}`);
      return NextResponse.json({ success: true, message: 'Account created', username: pengguna.username });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Activation error';
    console.error('[Activate] Error:', message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
