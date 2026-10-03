import { NextRequest, NextResponse } from 'next/server'
import { getServerUser, requireAuth } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'
import { getStockPengaturan, setStockPengaturan } from '@/lib/stock-bahan-server'

/**
 * GET /api/stock-bahan/pengaturan — baca pengaturan Stock Bahan.
 * PUT { allowNegativeStock: boolean } — simpan (khusus admin).
 * "Allow Negative Stock": jika aktif, Stok Keluar boleh membuat stok minus.
 */
export async function GET(request: NextRequest) {
  try {
    const pengaturan = await getStockPengaturan()
    return NextResponse.json(pengaturan, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error: any) {
    console.error('Error fetching stock settings:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to fetch settings') },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!

    const role = String((user as { role?: string } | null)?.role ?? '').toLowerCase()
    if (role && role !== 'admin' && role !== 'superadmin') {
      return NextResponse.json({ error: 'Hanya admin yang boleh mengubah pengaturan' }, { status: 403 })
    }

    const body = await request.json()
    await setStockPengaturan(Boolean(body?.allowNegativeStock))
    return NextResponse.json(await getStockPengaturan())
  } catch (error: any) {
    console.error('Error saving stock settings:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to save settings') },
      { status: 500 }
    )
  }
}
