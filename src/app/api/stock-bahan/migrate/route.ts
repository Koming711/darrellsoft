import { NextRequest, NextResponse } from 'next/server'
import { getServerUser, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'
import { migrateStockLedger } from '@/lib/stock-bahan-server'

/**
 * POST /api/stock-bahan/migrate — migrasi idempoten data lama:
 * bahan yang punya stok tapi belum punya transaksi ledger mendapat satu
 * "Saldo awal" (Stok Masuk) agar saldo terlacak di Riwayat Stok.
 * Aman dipanggil berulang (bahan yang sudah punya ledger dilewati).
 */
export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const migrated = await migrateStockLedger(user?.id || null)
    return NextResponse.json({ success: true, migrated })
  } catch (error: any) {
    console.error('Error migrating stock ledger:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to migrate stock ledger') },
      { status: 500 }
    )
  }
}
