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
    callbacks: {
      finish: `${baseUrl}/?payment=finish`,
      error: `${baseUrl}/?payment=error`,
      pending: `${baseUrl}/?payment=pending`,
    },
  };

  const transaction = await snap.createTransaction(parameter);
  return transaction;
}

export async function verifySignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
  signatureKey: string
): Promise<boolean> {
  const crypto = await import('crypto');
  const hash = crypto
    .createHash('sha512')
    .update(orderId + statusCode + grossAmount + serverKey)
    .digest('hex');
  return hash === signatureKey;
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
