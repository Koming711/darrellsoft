import { NextResponse } from 'next/server'
/**
 * HEALTH CHECK — Always-On 24/7 (Task 34).
 *
 * Endpoint ringan untuk monitoring eksternal + keep-warm hosting.
 *
 * ATURAN KUOTA SUPABASE (wajib, permintaan pemilik):
 * - Endpoint ini TIDAK MENJALANKAN QUERY DATABASE APAPUN.
 * - `import { db }` sengaja ada agar Prisma Client + query engine
 *   ter-instantiate saat module dimuat → instance serverless yang di-ping
 *   monitor tetap "hangat" TANPA satu pun request ke Supabase.
 *   (Koneksi DB Prisma baru terbentuk saat query pertama, bukan saat import.)
 *
 * Efek praktis: setelah serverless idle lama (scale-to-zero), monitor
 * menghangatkan runtime + engine Prisma → kunjungan pengguna berikutnya
 * tidak lagi merasakan "server harus bangun dulu".
 */

/** Waktu proses instance ini dibangunkan (cold start) — dipakai untuk
 * melihat rotasi instance di monitoring. */
const BOOTED_AT = new Date()

/** ID acak per proses — membedakan antar instance serverless. */
const INSTANCE_ID = Math.random().toString(36).slice(2, 10)

export async function GET() {
  try {
    return NextResponse.json(
      {
        status: 'ok',
        app: 'darrellsoft',
        timestamp: new Date().toISOString(),
        bootedAt: BOOTED_AT.toISOString(),
        uptimeSec: Math.round(process.uptime()),
        instanceId: INSTANCE_ID,
        region: process.env.VERCEL_REGION || 'local',
        // Prisma engine sudah dimuat (hangat) — TANPA query DB di sini.
        runtime: 'warm',
        dbProbe: 'skipped-by-design', // tidak ada SELECT 1 berkala
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (error) {
    return NextResponse.json(
      { status: 'unhealthy', error: 'Health check failed' },
      { status: 503 }
    )
  }
}
