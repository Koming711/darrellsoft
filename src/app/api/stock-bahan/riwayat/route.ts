import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'
import type { RiwayatItem, JenisMutasi } from '@/lib/stock-bahan-types'

/**
 * GET /api/stock-bahan/riwayat — ledger gabungan (masuk/keluar/penyesuaian)
 * dengan kolom Tanggal | No. Transaksi | Bahan | Jenis | Masuk | Keluar | Saldo.
 * Query: bahanId, jenis (masuk|keluar|penyesuaian), dari, sampai, q, limit (default 300)
 */
export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const sp = request.nextUrl.searchParams
    const bahanId = sp.get('bahanId') || undefined
    const jenis = sp.get('jenis') || ''
    const dari = sp.get('dari') || ''
    const sampai = sp.get('sampai') || ''
    const q = (sp.get('q') || '').trim().toLowerCase()
    const limitParam = parseInt(sp.get('limit') || '300', 10)
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 1000) : 300

    let rows = await db.bahanMutasi.findMany({
      where: { ...(await getDataFilter(user)), ...(bahanId ? { bahanId } : {}) },
      include: { bahan: { select: { kode: true, nama: true, satuan: true } } },
      orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }],
      take: 2000,
    })

    if (jenis && ['masuk', 'keluar', 'penyesuaian'].includes(jenis)) {
      rows = rows.filter((r) => r.jenis === jenis)
    }
    if (dari) rows = rows.filter((r) => r.tanggal >= dari)
    if (sampai) rows = rows.filter((r) => r.tanggal <= sampai)
    if (q) {
      rows = rows.filter(
        (r) =>
          r.nomor.toLowerCase().includes(q) ||
          r.keterangan.toLowerCase().includes(q) ||
          r.bahan.nama.toLowerCase().includes(q) ||
          r.bahan.kode.toLowerCase().includes(q)
      )
    }

    const items: RiwayatItem[] = rows.slice(0, limit).map((r) => ({
      id: r.id,
      tanggal: r.tanggal,
      nomor: r.nomor,
      bahanId: r.bahanId,
      kode: r.bahan.kode,
      bahanNama: r.bahan.nama,
      satuan: r.bahan.satuan,
      jenis: r.jenis as JenisMutasi,
      masuk: r.masuk,
      keluar: r.keluar,
      saldo: r.stokSetelah,
      keterangan: r.keterangan,
    }))

    return NextResponse.json({ items, total: rows.length }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error: any) {
    console.error('Error fetching riwayat stok:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to fetch riwayat stok') },
      { status: 500 }
    )
  }
}
