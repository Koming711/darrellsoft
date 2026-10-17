// ============================================================================
// TERAPKAN SINKRONISASI PK → HC (server-side, dipakai beberapa route)
// ============================================================================
// Sumber logika: POST /api/potong-cetakan-sync (fitur Sinkronisasi Permanen).
// Diekstrak agar bisa dipakai ulang oleh:
//   1. PUT /api/riwayat-potong-kertas/[id] — AUTO-SYNC: begitu riwayat Potong
//      Kertas diupdate, Hitung Cetakan yang terhubung (pkRiwayatId) langsung
//      diperbarui → data di halaman Hitung Cetakan "turut berubah".
//   2. POST /api/potong-cetakan-sync — tombol "Sinkronkan Sekarang" di HC.
//
// Yang dilakukan (SATU transaksi):
//   1. Update 14 field sumber HC dari PK terkini (lihat potong-sync.ts)
//   2. Hitung ulang nilai turunan dgn engine/rumus yang sama dgn editor:
//      kertas (cutting-engine), ongkos cetak (formula mesin, input mesin
//      TIDAK diubah), finishing (formula master, daftar finishing tetap),
//      subTotal / profit / grandTotal
//   3. Simpan snapshot sumber + waktu sinkron + riwayat perubahan (audit)
//   Input manual yang tidak terdampak DIPERTAHANKAN.
// ============================================================================

import { db } from '@/lib/db'
import type { RiwayatCetakan, RiwayatPotongKertas } from '@prisma/client'
import {
  extractPkSource, extractHcSource, diffSources,
  computeHcPaperFromPk, computeOngkosCetak, computeFinishingTotal, recomputeHcTotals,
  parseSyncHistory, pushSyncEvent,
} from './potong-sync'
import type { SourceFieldChange } from './potong-sync'

export interface PkToHcSyncDerived {
  sheetsNeeded: number
  piecesPerSheet: number
  totalPaperPrice: number
  ongkosCetak: number
  ongkosCetak2: number
  finishingCost: number
  subTotal: number
  profitAmount: number
  grandTotal: number
}

export interface PkToHcSyncResult {
  hcId: string
  hcNomor: string
  changed: SourceFieldChange[]
  derived: PkToHcSyncDerived
  hc: RiwayatCetakan
}

const num = (v: unknown) => Number(v || 0)

/**
 * Terapkan sinkronisasi PK → HC untuk satu pasang record yang sudah ter-link.
 * Melempar exception bila gagal (caller memutuskan perlakuan error).
 */
export async function applyPkToHcSync(
  pk: RiwayatPotongKertas,
  hc: RiwayatCetakan
): Promise<PkToHcSyncResult> {
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

  // --- 4. SATU transaksi: field sumber + turunan + status sinkron
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

  return {
    hcId: updated.id,
    hcNomor: updated.nomorUrut,
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
  }
}

/**
 * Auto-sync semua Hitung Cetakan yang terhubung ke satu riwayat Potong Kertas.
 * Dipakai PUT /api/riwayat-potong-kertas/[id] setelah record PK berhasil diupdate.
 * Tidak melempar exception — hasil berisi ringkasan updated/failed.
 */
export async function autoSyncLinkedHc(pk: RiwayatPotongKertas, ownerId: string): Promise<{
  total: number
  updated: number
  failed: number
  changed: SourceFieldChange[]
} | null> {
  try {
    const linkedHcs = await db.riwayatCetakan.findMany({
      where: { pkRiwayatId: pk.id, userId: ownerId },
    })
    if (linkedHcs.length === 0) return null
    let updatedCount = 0
    let failed = 0
    let changed: SourceFieldChange[] = []
    for (const hc of linkedHcs) {
      try {
        const r = await applyPkToHcSync(pk, hc)
        updatedCount++
        if (r.changed.length > 0) changed = r.changed
      } catch (e) {
        failed++
        console.error('Auto-sync HC gagal (hcId:', hc.id, '):', e)
      }
    }
    return { total: linkedHcs.length, updated: updatedCount, failed, changed }
  } catch (e) {
    console.error('Error auto-sync linked HC:', e)
    return null
  }
}
