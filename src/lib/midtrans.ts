import type { PrismaClient } from '@prisma/client';

const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY || '';
const MIDTRANS_IS_PRODUCTION = process.env.MIDTRANS_IS_PRODUCTION === 'true';

export interface MidtransTransactionParams {
  orderId: string;
  amount: number;
  packageName: string;
  packageType: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  username?: string;
  password?: string;
  secondUsername?: string;
}

export async function createSnapTransaction(params: MidtransTransactionParams) {
  const { Snap } = await import('midtrans-client');
  const snap = new Snap({
    isProduction: MIDTRANS_IS_PRODUCTION,
    serverKey: MIDTRANS_SERVER_KEY,
  });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  const parameter = {
    transaction_details: {
      order_id: params.orderId,
      gross_amount: params.amount,
    },
    item_details: [
      {
        id: params.packageType,
        price: params.amount,
        quantity: 1,
        name: params.packageName,
      },
    ],
    customer_details: {
      first_name: params.customerName,
      email: params.customerEmail,
      phone: params.customerPhone,
    },
    // Store account info in custom_field so webhook can access them
    custom_field1: params.username || '',
    custom_field2: params.password || '',
    custom_field3: params.secondUsername || '',
    callbacks: {
      finish: `${baseUrl}/?payment=finish`,
      error: `${baseUrl}/?payment=error`,
      pending: `${baseUrl}/?payment=pending`,
    },
  };

  const transaction = await snap.createTransaction(parameter);
  return transaction;
}

/**
 * Verify Midtrans signature key.
 *
 * Midtrans signature = SHA512(order_id + status_code + gross_amount + server_key)
 *
 * IMPORTANT: gross_amount must be formatted exactly as Midtrans sends it.
 * Midtrans sends gross_amount as a string like "105000.00" (with decimals).
 * The hash must use the exact same string format.
 */
export async function verifySignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
  signatureKey: string
): Promise<boolean> {
  const crypto = await import('crypto');

  // Midtrans sends gross_amount as string like "105000.00"
  // We need to use it exactly as-is for hash verification
  const hashInput = orderId + statusCode + grossAmount + serverKey;
  const hash = crypto
    .createHash('sha512')
    .update(hashInput)
    .digest('hex');

  if (hash !== signatureKey) {
    // Try alternative: gross_amount without decimal part (some Midtrans configs send integer)
    const grossAmountInt = String(Math.round(parseFloat(grossAmount)));
    const altHashInput = orderId + statusCode + grossAmountInt + serverKey;
    const altHash = crypto
      .createHash('sha512')
      .update(altHashInput)
      .digest('hex');

    if (altHash === signatureKey) {
      console.log('[Midtrans] Signature verified with integer gross_amount format');
      return true;
    }

    console.warn('[Midtrans] Signature mismatch:', {
      expected: signatureKey,
      computed: hash,
      altComputed: altHash,
      hashInput: orderId + statusCode + grossAmount + '***',
    });
    return false;
  }

  return true;
}

export async function savePaymentRecord(
  prisma: PrismaClient,
  data: {
    orderId: string;
    packageName: string;
    packageType: string;
    grossAmount: number;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    userId?: string;
    metadata?: string;
  }
) {
  return prisma.payment.upsert({
    where: { orderId: data.orderId },
    create: data,
    update: {
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      customerPhone: data.customerPhone,
      grossAmount: data.grossAmount,
      ...(data.metadata && { metadata: data.metadata }),
    },
  });
}

export async function updatePaymentStatus(
  prisma: PrismaClient,
  orderId: string,
  status: {
    transactionStatus: string;
    transactionId?: string;
    paymentType?: string;
    fraudStatus?: string;
    transactionTime?: Date;
  }
) {
  return prisma.payment.update({
    where: { orderId },
    data: {
      transactionStatus: status.transactionStatus,
      ...(status.transactionId && { transactionId: status.transactionId }),
      ...(status.paymentType && { paymentType: status.paymentType }),
      ...(status.fraudStatus && { fraudStatus: status.fraudStatus }),
      ...(status.transactionTime && { transactionTime: status.transactionTime }),
    },
  });
}
