import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'
import { statusStok } from '@/lib/stock-bahan-types'
import type { LaporanItem, LaporanResponse } from '@/lib/stock-bahan-types'

/**
 * GET /api/stock-bahan/laporan — laporan stok per periode.
 * Query: dari, sampai (YYYY-MM-DD, opsional), bahanId, q (nama/kode),
 *        kategori, suplier (nama mengandung)
 *
 * Rumus (sumber: ledger BahanMutasi = seluruh perubahan stok):
 *   Saldo awal  = Σ transaksi SEBELUM periode (masuk − keluar + penyesuaian)
 *   Total masuk = Σ qty jenis 'masuk' dalam periode
 *   Total keluar= Σ qty jenis 'keluar' dalam periode
 *   Penyesuaian = Σ delta jenis 'penyesuaian' dalam periode
 *   Saldo akhir = saldo awal + masuk − keluar + penyesuaian
 * Saldo awal TIDAK memakai stok master saat ini — murni dari histori.
 * Bahan tanpa mutasi sama sekali (data lama) memakai stok master sebagai saldo.
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
    const q = (sp.get('q') || '').trim().toLowerCase()

    const bahans = await db.bahan.findMany({
      where: await getDataFilter(user),
      orderBy: { nama: 'asc' },
    })

    const filtered = bahans.filter((b) => {
      if (bahanId && b.id !== bahanId) return false
      if (kategori && b.kategori !== kategori) return false
      if (suplier && !b.suplierNama.toLowerCase().includes(suplier)) return false
      if (q && !`${b.nama} ${b.kode}`.toLowerCase().includes(q)) return false
      return true
    })

    const mutasi = await db.bahanMutasi.findMany({
      where: { ...(await getDataFilter(user)) },
      orderBy: [{ tanggal: 'asc' }, { createdAt: 'asc' }],
    })

    const r2 = (n: number) => Math.round(n * 100) / 100

    const items: LaporanItem[] = []

    for (const b of filtered) {
      const rows = mutasi.filter((m) => m.bahanId === b.id)

      let stokAwal = 0
      let masuk = 0
      let keluar = 0
      let penyesuaian = 0
      let adaMutasi = false

      for (const m of rows) {
        adaMutasi = true
        const qty = Number(m.qty) || 0
        const inRange = (!dari || m.tanggal >= dari) && (!sampai || m.tanggal <= sampai)
        if (!inRange) {
          if (dari && m.tanggal < dari) {
            // Seluruh transaksi sebelum periode → saldo awal
            if (m.jenis === 'keluar') stokAwal -= qty
            else stokAwal += qty // masuk & penyesuaian (delta penyesuaian boleh negatif)
          }
          continue
        }
        if (m.jenis === 'masuk') masuk += qty
        else if (m.jenis === 'keluar') keluar += qty
        else penyesuaian += qty
      }

      // Bahan tanpa mutasi sama sekali (data lama sebelum ledger) → pakai stok master.
      const stokAwalFinal = adaMutasi ? stokAwal : b.stok
      const stokAkhir = stokAwalFinal + masuk - keluar + penyesuaian

      items.push({
        bahanId: b.id,
        kode: b.kode,
        nama: b.nama,
        kategori: b.kategori,
        satuan: b.satuan,
        suplierNama: b.suplierNama,
        aktif: b.aktif,
        stokMin: b.stokMin,
        stokAwal: r2(stokAwalFinal),
        masuk: r2(masuk),
        keluar: r2(keluar),
        penyesuaian: r2(penyesuaian),
        stokAkhir: r2(stokAkhir),
        hargaSatuan: b.hargaSatuan,
        nilai: Math.round(stokAkhir * b.hargaSatuan),
        status: statusStok(stokAkhir, b.stokMin),
      })
    }

    const ringkasan = {
      totalBahan: items.length,
      totalNilai: items.reduce((s, i) => s + i.nilai, 0),
      totalMasuk: r2(items.reduce((s, i) => s + i.masuk, 0)),
      totalKeluar: r2(items.reduce((s, i) => s + i.keluar, 0)),
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
