import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, requireAuth, getDataFilter } from '@/lib/server-auth'
import { sanitizeError } from '@/lib/api-error'

/**
 * GET /api/laporan/rugi-laba — Laporan rugi laba sederhana (sumber: DocumentHistory + Biaya).
 *
 * Rumus:
 *   Penjualan     = total nilai barang terjual (subtotal + PPN) per invoice
 *   Harga Pokok   = Σ (qty × harga modal) — modal di-SNAPSHOT saat invoice dibuat,
 *                   sehingga perubahan harga modal master barang TIDAK mengubah
 *                   laporan lama.
 *   Laba Kotor    = Penjualan − Harga Pokok
 *   Biaya Operas. = Σ Biaya.jumlah pada periode
 *   Laba Bersih   = Laba Kotor − Biaya Operasional
 *
 * DP & pelunasan TIDAK dihitung ganda: satu invoice = satu transaksi penjualan.
 *
 * Fallback invoice lama (tanpa snapshot modal):
 *   - punya uangCapek (profit) → Harga Pokok = Penjualan − uangCapek (didistribusikan proporsional per item, ditandai estimated)
 *   - tidak ada data           → Harga Pokok 0
 *
 * Query: start, end (YYYY-MM-DD pada tanggal dokumen / biaya)
 */

interface ParsedItem { deskripsi?: string; qty?: number; harga?: number; modal?: number }

export async function GET(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const dataFilter = await getDataFilter(user)

    const { searchParams } = new URL(request.url)
    const start = (searchParams.get('start') || '').trim()
    const end = (searchParams.get('end') || '').trim()

    const rows = await db.documentHistory.findMany({
      where: { docType: 'invoice', ...dataFilter },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    })

    let penjualan = 0
    let hargaPokok = 0
    const detailRows: Array<Record<string, unknown>> = []

    for (const r of rows) {
      let parsed: Record<string, unknown> = {}
      try { parsed = JSON.parse(r.dataJson || '{}') } catch { parsed = {} }

      const items = Array.isArray(parsed.items) ? (parsed.items as ParsedItem[]) : []
      if (items.length === 0) continue

      const docTanggal = (typeof parsed.tanggal === 'string' && parsed.tanggal) ? parsed.tanggal : r.createdAt.toISOString().slice(0, 10)
      if (start && docTanggal < start) continue
      if (end && docTanggal > end) continue

      const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.harga) || 0), 0)
      const ppnAmount = subtotal * ((Number(parsed.ppn) || 0) / 100)
      const total = subtotal + ppnAmount

      const custName = r.pihakKedua || (typeof parsed.client === 'object' && parsed.client ? String((parsed.client as { nama?: string }).nama || '') : '')

      const hasSnapshot = items.some((it) => Number(it.modal) > 0)
      const uangCapek = Number(parsed.uangCapek) || 0
      let invoiceHpp = 0
      let estimated = false

      if (hasSnapshot) {
        invoiceHpp = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.modal) || 0), 0)
      } else if (uangCapek > 0 && subtotal > 0) {
        // Fallback: profit tersimpan → HPP = Penjualan − profit, didistribusikan proporsional
        invoiceHpp = Math.max(total - uangCapek, 0)
        estimated = true
      }

      penjualan += total
      hargaPokok += invoiceHpp

      for (const it of items) {
        const qty = Number(it.qty) || 0
        const harga = Number(it.harga) || 0
        const totalJual = qty * harga
        let modalPerUnit = Number(it.modal) || 0
        let totalModal = qty * modalPerUnit
        if (estimated && totalJual > 0 && subtotal > 0) {
          const labaItem = uangCapek * (totalJual / subtotal)
          totalModal = Math.max(totalJual - labaItem, 0)
          modalPerUnit = qty > 0 ? totalModal / qty : 0
        } else if (!hasSnapshot) {
          modalPerUnit = 0
          totalModal = 0
        }
        detailRows.push({
          invoiceId: r.id,
          nomor: r.nomor,
          tanggal: docTanggal,
          customer: custName,
          barang: String(it.deskripsi || '').split('\n')[0],
          qty,
          harga,
          totalJual,
          modal: modalPerUnit,
          totalModal,
          laba: totalJual - totalModal,
          estimated,
        })
      }
    }

    // Biaya operasional pada periode yang sama
    const biayaRows = await db.biaya.findMany({
      where: {
        ...dataFilter,
        ...(start || end
          ? { tanggal: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } }
          : {}),
      },
      select: { jumlah: true, kategori: true, tanggal: true },
    })
    const biayaOperasional = biayaRows.reduce((s, b) => s + (Number(b.jumlah) || 0), 0)

    const labaKotor = penjualan - hargaPokok
    const labaBersih = labaKotor - biayaOperasional

    return NextResponse.json({
      summary: {
        penjualan,
        hargaPokok,
        labaKotor,
        biayaOperasional,
        labaBersih,
        jumlahInvoice: new Set(detailRows.map((d) => d.invoiceId)).size,
      },
      rows: detailRows,
      biayaCount: biayaRows.length,
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    console.error('Error laporan rugi laba:', error)
    return NextResponse.json({ error: sanitizeError(error, 'Gagal memuat laporan rugi laba') }, { status: 500 })
  }
}
