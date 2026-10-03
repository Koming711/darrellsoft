import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'
import { statusStok } from '@/lib/stock-bahan-types'
import type { LaporanItem, LaporanResponse } from '@/lib/stock-bahan-types'

/**
 * GET /api/stock-bahan/laporan — laporan stok per periode.
 * Query: dari, sampai (YYYY-MM-DD, opsional), bahanId, kategori, suplier (nama mengandung)
 *
 * Per bahan dihitung: stok awal periode, masuk, keluar, penyesuaian (net),
 * stok akhir, nilai persediaan (stok akhir × harga modal terakhir).
 * Sumber: ledger BahanMutasi yang selalu sinkron dengan transaksi.
 */
export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const sp = request.nextUrl.searchParams
    const dari = sp.get('dari') || ''
    const sampai = sp.get('sampai') || ''
    const bahanId = sp.get('bahanId') || ''
    const kategori = (sp.get('kategori') || '').trim()
    const suplier = (sp.get('suplier') || '').trim().toLowerCase()

    const bahans = await db.bahan.findMany({
      where: await getDataFilter(user),
      orderBy: { nama: 'asc' },
    })

    const filtered = bahans.filter((b) => {
      if (bahanId && b.id !== bahanId) return false
      if (kategori && b.kategori !== kategori) return false
      if (suplier && !b.suplierNama.toLowerCase().includes(suplier)) return false
      return true
    })

    const mutasi = await db.bahanMutasi.findMany({
      where: { ...(await getDataFilter(user)) },
      orderBy: [{ tanggal: 'asc' }, { createdAt: 'asc' }],
    })

    const items: LaporanItem[] = []

    for (const b of filtered) {
      const rows = mutasi.filter((m) => m.bahanId === b.id)
      let stokAwal = 0
      let masuk = 0
      let keluar = 0
      let penyesuaian = 0
      let stokAkhir: number | null = null

      for (const m of rows) {
        const inRange = (!dari || m.tanggal >= dari) && (!sampai || m.tanggal <= sampai)
        if (!inRange) {
          if (dari && m.tanggal < dari) {
            stokAwal = m.stokSetelah // saldo terakhir sebelum periode
          }
          continue
        }
        masuk += m.masuk
        keluar += m.keluar
        if (m.jenis === 'penyesuaian') penyesuaian += m.masuk - m.keluar
        stokAkhir = m.stokSetelah
      }

      // Bahan tanpa mutasi → pakai stok master (aman utk data baru sebelum transaksi pertama)
      const stokAkhirFinal = stokAkhir !== null ? stokAkhir : b.stok

      items.push({
        bahanId: b.id,
        kode: b.kode,
        nama: b.nama,
        kategori: b.kategori,
        satuan: b.satuan,
        suplierNama: b.suplierNama,
        aktif: b.aktif,
        stokAwal: Math.round(stokAwal * 100) / 100,
        masuk: Math.round(masuk * 100) / 100,
        keluar: Math.round(keluar * 100) / 100,
        penyesuaian: Math.round(penyesuaian * 100) / 100,
        stokAkhir: Math.round(stokAkhirFinal * 100) / 100,
        hargaSatuan: b.hargaSatuan,
        nilai: Math.round(stokAkhirFinal * b.hargaSatuan),
        status: statusStok(stokAkhirFinal, b.stokMin),
      })
    }

    const ringkasan = {
      totalBahan: items.length,
      totalNilai: items.reduce((s, i) => s + i.nilai, 0),
      totalMasuk: Math.round(items.reduce((s, i) => s + i.masuk, 0) * 100) / 100,
      totalKeluar: Math.round(items.reduce((s, i) => s + i.keluar, 0) * 100) / 100,
      menipis: items.filter((i) => i.status === 'menipis').length,
      habis: items.filter((i) => i.status === 'habis').length,
    }

    const response: LaporanResponse = {
      periode: { dari, sampai },
      items,
      ringkasan,
    }

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error: any) {
    console.error('Error generating laporan stok:', error)
    return NextResponse.json(
      { error: sanitizeError(error, 'Failed to generate laporan stok') },
      { status: 500 }
    )
  }
}
