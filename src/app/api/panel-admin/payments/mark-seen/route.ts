// POST /api/panel-admin/payments/mark-seen — TANDAI antrean Pendaftar Baru sudah DILIHAT admin.
// Dipanggil otomatis saat admin membuka halaman Verifikasi Pembayaran (tab Menunggu Verifikasi):
// semua pembayaran menunggu_verifikasi yang belum dilihat → adminSeenAt terisi, sehingga
// badge angka di sidebar menu "Pendaftar Baru" otomatis hilang. Pendaftar BARU yang masuk
// setelahnya (adminSeenAt masih null) dihitung lagi — badge muncul kembali.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/server-auth'
import { PAYMENT_STATUS } from '@/lib/subscription'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const err = requireAdmin(request)
  if (err) return err
  try {
    const res = await db.subscriptionPayment.updateMany({
      where: {
        status: PAYMENT_STATUS.MENUNGGU_VERIFIKASI,
        deletedAt: null,
        adminSeenAt: null,
      },
      data: { adminSeenAt: new Date() },
    })

    // Hitung ulang sisa yang belum dilihat (0 setelah penandaan di atas) —
    // dipakai konten untuk memperbarui badge sidebar LANGSUNG tanpa fetch stats penuh.
    const belumDilihat = await db.subscriptionPayment.count({
      where: {
        status: PAYMENT_STATUS.MENUNGGU_VERIFIKASI,
        deletedAt: null,
        adminSeenAt: null,
      },
    })

    return NextResponse.json({
      ok: true,
      marked: res.count,
      pembayaranBelumDilihat: belumDilihat,
      message: res.count > 0 ? `${res.count} pendaftar baru ditandai sudah dilihat` : undefined,
    })
  } catch (error) {
    console.error('POST /api/panel-admin/payments/mark-seen error:', error)
    return NextResponse.json({ error: 'Gagal menandai pendaftar sudah dilihat' }, { status: 500 })
  }
}
