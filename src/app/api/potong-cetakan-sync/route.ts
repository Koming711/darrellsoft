// ============================================================================
// API SINKRONISASI PERMANEN POTONG KERTAS ↔ HITUNG CETAKAN
// ============================================================================
// GET  ?pkId=... [&hcId=...]
//   → Status relasi + ringkasan sumber + daftar field yang akan diperbarui:
//     status: 'unlinked' (belum ada HC) | 'synced' | 'stale' (sumber berubah)
//     Dipakai panel status di kedua halaman + polling perubahan sumber.
//
// POST { pkId, hcId? }
//   → Terapkan sinkronisasi PK → HC (SATU transaksi):
//     1. Update field sumber HC dari PK terkini (14 field — lihat potong-sync.ts)
//     2. Hitung ulang nilai turunan dgn engine/rumus yang sama dgn editor:
//        kertas (cutting-engine), ongkos cetak (formula mesin, input mesin
//        TIDAK diubah), finishing (formula master, daftar finishing tetap),
//        subTotal/profit/grandTotal
//     3. Simpan snapshot sumber + waktu sinkron + riwayat perubahan (audit §11)
//     Input manual yang tidak terdampak DIPERTAHANKAN (Wajib Audit §6C).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'
import {
  extractPkSource, extractHcSource, diffSources,
  computeHcPaperFromPk, computeOngkosCetak, computeFinishingTotal, recomputeHcTotals,
  parseSnapshot, parseSyncHistory, pushSyncEvent, buildPkSummary,
} from '@/lib/potong-sync'
import type { SourceFieldChange } from '@/lib/potong-sync'

// Ambil HC terhubung: by hcId (harus ter-link ke pk ini) atau HC terbaru utk pkId.
async function findLinkedHc(pkId: string, hcId: string | null, dataFilter: Record<string, unknown>) {
  if (hcId) {
    const hc = await db.riwayatCetakan.findFirst({ where: { id: hcId, ...dataFilter } })
    if (hc && hc.pkRiwayatId !== pkId) return null // hcId bukan milik relasi ini
    return hc
  }
  return db.riwayatCetakan.findFirst({
    where: { pkRiwayatId: pkId, ...dataFilter },
    orderBy: { createdAt: 'desc' },
  })
}

export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const dataFilter = await getDataFilter(user)
    const { searchParams } = new URL(request.url)
    const pkId = searchParams.get('pkId') || ''
    const hcId = searchParams.get('hcId') || ''
    if (!pkId) return NextResponse.json({ error: 'pkId wajib diisi' }, { status: 400 })

    const pk = await db.riwayatPotongKertas.findFirst({ where: { id: pkId, ...dataFilter } })
    if (!pk) return NextResponse.json({ error: 'Riwayat Potong Kertas tidak ditemukan' }, { status: 404 })

    const hc = await findLinkedHc(pkId, hcId || null, dataFilter)
    const source = extractPkSource(pk)
    const willUpdate: SourceFieldChange[] = hc ? diffSources(extractHcSource(hc), source) : []
    const snapshot = hc ? parseSnapshot(hc.pkSourceSnapshot) : null
    const changedSinceSync = hc ? diffSources(snapshot, source) : []
    const status = !hc ? 'unlinked' : (willUpdate.length > 0 ? 'stale' : 'synced')

    return NextResponse.json({
      status,
      pk: buildPkSummary(pk),
      linkedHc: hc ? {
        id: hc.id,
        nomor: hc.nomorUrut,
        pkSyncStatus: hc.pkSyncStatus || '',
        pkLastSyncedAt: hc.pkLastSyncedAt ? hc.pkLastSyncedAt.toISOString() : null,
        subTotal: hc.subTotal,
        grandTotal: hc.grandTotal,
        totalPaperPrice: hc.totalPaperPrice,
        quantity: hc.quantity,
        updatedAt: hc.updatedAt.toISOString(),
      } : null,
      willUpdate,
      changedSinceSync,
      snapshotExists: !!snapshot,
      history: hc ? parseSyncHistory(hc.pkSyncHistory).slice(0, 5) : [],
    })
  } catch (error) {
    console.error('Error potong-cetakan-sync GET:', error)
    return NextResponse.json({ error: 'Gagal memeriksa status sinkronisasi' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const dataFilter = await getDataFilter(user)
    const body = await request.json().catch(() => ({}))
    const pkId: string = typeof body.pkId === 'string' ? body.pkId : ''
    const hcId: string = typeof body.hcId === 'string' ? body.hcId : ''
    if (!pkId) return NextResponse.json({ error: 'pkId wajib diisi' }, { status: 400 })

    const pk = await db.riwayatPotongKertas.findFirst({ where: { id: pkId, ...dataFilter } })
    if (!pk) return NextResponse.json({ error: 'Riwayat Potong Kertas tidak ditemukan' }, { status: 404 })

    const hc = await findLinkedHc(pkId, hcId || null, dataFilter)
    if (!hc) {
      return NextResponse.json(
        { error: 'Belum ada Hitung Cetakan yang terhubung dengan riwayat Potong Kertas ini' },
        { status: 404 }
      )
    }

    // --- 1. Field sumber: before → after
    const source = extractPkSource(pk)
    const changed = diffSources(extractHcSource(hc), source)

    // --- 2. Hitung ulang nilai turunan (rumus == editor klien)
    const paper = computeHcPaperFromPk(pk)
    const qty = parseInt(source.quantity) || 0
    const cw = parseFloat(source.cutWidth) || 0
    const ch = parseFloat(source.cutHeight) || 0

    // Ongkos cetak: input mesin/warna/plat manual DIPERTAHANKAN, hanya nilai
    // quantity-dependent dihitung ulang bila master mesin ditemukan.
    const num = (v: unknown) => Number(v || 0)
    let ongkosCetak = num(hc.ongkosCetak)
    let ongkosCetak2 = num(hc.ongkosCetak2)
    const warna1 = parseInt(hc.warna || '0') || 0
    const warnaKhusus1 = parseInt(hc.warnaKhusus || '0') || 0
    if (hc.machineName) {
      const machine = await db.printingCost.findFirst({
        where: { machineName: hc.machineName, userId: hc.userId },
      })
      const recalc = computeOngkosCetak(machine, qty, warna1, warnaKhusus1, num(hc.hargaPlat))
      if (recalc !== null) ongkosCetak = recalc
    }
    if (hc.machineName2) {
      const machine2 = await db.printingCost.findFirst({
        where: { machineName: hc.machineName2, userId: hc.userId },
      })
      const recalc2 = computeOngkosCetak(machine2, qty, parseInt(hc.warna2 || '0') || 0, parseInt(hc.warnaKhusus2 || '0') || 0, num(hc.hargaPlat2))
      if (recalc2 !== null) ongkosCetak2 = recalc2
    }

    // Finishing: daftar finishing manual DIPERTAHANKAN, nilai dihitung ulang
    // dari master Finishing (bila master ditemukan; bila tidak → nilai lama).
    const finishingMasters = await db.finishing.findMany({ where: { userId: hc.userId } })
    const finishingRecalc = computeFinishingTotal(hc.finishingNames, finishingMasters, qty, cw, ch)
    const finishingCost = finishingRecalc !== null ? finishingRecalc : num(hc.finishingCost)

    const totals = recomputeHcTotals({
      totalPaperPrice: paper.totalPaperPrice,
      ongkosCetak, ongkosCetak2, finishingCost,
      packingCost: num(hc.packingCost),
      shippingCost: num(hc.shippingCost),
      otherCost: num(hc.otherCost),
      otherCost2: num(hc.otherCost2),
      glueCost: num(hc.glueCost),
      glueBorongan: num(hc.glueBorongan),
      profitPercent: num(hc.profitPercent),
    })

    // --- 3. Snapshot + riwayat sinkronisasi (audit)
    const now = new Date()
    const snapshotJson = JSON.stringify({ ...source, syncedAt: now.toISOString() })
    const event = {
      at: now.toISOString(),
      direction: 'pk→hc' as const,
      result: 'ok' as const,
      changed,
      totalPaperPrice: paper.totalPaperPrice,
      subTotal: totals.subTotal,
      grandTotal: totals.grandTotal,
    }
    const historyJson = JSON.stringify(pushSyncEvent(parseSyncHistory(hc.pkSyncHistory), event))

    // --- 4. SATU transaksi: field sumber + turunan + status sinkron (§9)
    const updated = await db.$transaction(async (tx) => {
      return tx.riwayatCetakan.update({
        where: { id: hc.id },
        data: {
          // A. Field sumber (ikut PK terbaru)
          customerName: source.customerName,
          printName: source.printName,
          paperName: source.paperName,
          paperGrammage: source.paperGrammage || '0',
          paperLength: source.paperLength,
          paperWidth: source.paperWidth,
          cutWidth: source.cutWidth,
          cutHeight: source.cutHeight,
          quantity: source.quantity,
          jumlahPesanan: source.jumlahPesanan,
          berapaMata: source.berapaMata,
          setelanKertas: source.setelanKertas,
          namaSuplier: source.namaSuplier,
          pricePerSheet: parseFloat(source.pricePerSheet) || 0,
          // B. Nilai turunan
          totalPaperPrice: paper.totalPaperPrice,
          ongkosCetak, ongkosCetak2, finishingCost,
          subTotal: totals.subTotal,
          profitAmount: totals.profitAmount,
          grandTotal: totals.grandTotal,
          // D. Status sinkronisasi + audit
          pkSyncStatus: 'synced',
          pkLastSyncedAt: now,
          pkSourceSnapshot: snapshotJson,
          pkSyncHistory: historyJson,
        },
      })
    })

    return NextResponse.json({
      status: 'synced',
      changed,
      derived: {
        sheetsNeeded: paper.sheetsNeeded,
        piecesPerSheet: paper.piecesPerSheet,
        totalPaperPrice: paper.totalPaperPrice,
        ongkosCetak, ongkosCetak2, finishingCost,
        subTotal: totals.subTotal,
        profitAmount: totals.profitAmount,
        grandTotal: totals.grandTotal,
      },
      hc: updated,
    })
  } catch (error) {
    console.error('Error potong-cetakan-sync POST:', error)
    return NextResponse.json({ error: 'Sinkronisasi gagal — data tidak diubah' }, { status: 500 })
  }
}
