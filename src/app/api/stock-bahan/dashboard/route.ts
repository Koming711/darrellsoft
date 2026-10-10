import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * API Dashboard Stock — kartu ringkasan + daftar bahan yang perlu dibeli.
 * GET /api/stock-bahan/dashboard
 */
export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const materials = await db.stockMaterial.findMany({
      where: { ...(await getDataFilter(user)), aktif: true },
      orderBy: { nama: 'asc' },
    })

    const totalJenis = materials.length
    const totalStok = materials.reduce((a, b) => a + b.stok, 0)
    const stokMenipis = materials.filter(
      b => b.stok > 0 && b.stokMin > 0 && b.stok <= b.stokMin
    ).length
    const stokHabis = materials.filter(b => b.stok <= 0).length

    // Bahan yang perlu dibeli: stok ≤ minimum (termasuk habis), bahan aktif.
    const perluBeli = materials
      .filter(b => b.stok <= 0 || (b.stokMin > 0 && b.stok <= b.stokMin))
      .map(b => ({
        id: b.id,
        kode: b.kode,
        nama: b.nama,
        stok: b.stok,
        stokMin: b.stokMin,
        satuan: b.satuan,
        hargaModal: b.hargaModal,
        status: b.stok <= 0 ? 'habis' : 'menipis',
      }))

    const nilaiPersediaan = materials.reduce((a, b) => a + b.stok * b.hargaModal, 0)

    return NextResponse.json(
      { data: { totalJenis, totalStok, stokMenipis, stokHabis, perluBeli, nilaiPersediaan } },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (error: any) {
    console.error('Error fetching stock dashboard:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to fetch stock dashboard') },
      { status: 500 }
    )
  }
}
