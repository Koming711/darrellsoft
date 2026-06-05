import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('order_id');

    if (!orderId) {
      return NextResponse.json({ success: false, message: 'order_id wajib diisi' }, { status: 400 });
    }

    const payment = await db.payment.findUnique({ where: { orderId } });
    if (!payment) {
      return NextResponse.json({ success: false, message: 'Pembayaran tidak ditemukan' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        orderId: payment.orderId,
        packageName: payment.packageName,
        packageType: payment.packageType,
        grossAmount: payment.grossAmount,
        transactionStatus: payment.transactionStatus,
        paymentType: payment.paymentType,
        transactionId: payment.transactionId,
        transactionTime: payment.transactionTime,
        createdAt: payment.createdAt,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal cek status';
    console.error('Check status error:', error);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
