// ============================================================================
// SINKRONISASI PERMANEN POTONG KERTAS ↔ HITUNG CETAKAN (Darrellsoft)
// ============================================================================
// Single source of truth untuk:
//  1. Pemetaan FIELD SUMBER dari RiwayatPotongKertas (PK) ke RiwayatCetakan (HC)
//  2. Deteksi perubahan (diff) antara sumber PK terkini vs data HC / snapshot
//  3. Hitung ulang NILAI TURUNAN yang terdampak — memakai RUMUS & ENGINE YANG
//     SAMA dengan yang dipakai halaman (cutting-engine utk kertas, formula mesin
//     utk ongkos cetak, formula master Finishing utk finishing) sehingga hasil
//     server == hasil editor klien.
//
// Kepemilikan field (Wajib Audit §6):
//   A. SUMBER  (ikut PK terbaru)   → 14 field di SOURCE_FIELD_LABELS
//   B. TURUNAN (dihitung ulang)    → totalPaperPrice, ongkosCetak(1/2, nilai
//      quantity-dependent; input mesin/warna/plat TIDAK diubah),
//      finishingCost (daftar finishing tetap; nilai dihitung ulang),
//      subTotal, profitAmount, grandTotal
//   C. MANUAL   (dipertahankan)    → machine, warna, hargaPlat, daftar finishing,
//      packing, shipping, biaya lain, lem, profitPercent, photoUrl, simulasi
//
// Server-safe: pure TypeScript, tanpa dependensi React.
// ============================================================================

import { calculateCuts } from './cutting-engine'

// ---------------------------------------------------------------------------
// A. PEMETAAN FIELD SUMBER (RiwayatPotongKertas → RiwayatCetakan)
// ---------------------------------------------------------------------------
// Catatan orientasi (pola yang sudah dipakai aplikasi):
//   HC.paperLength ← PK.paperWidth  dan  HC.paperWidth ← PK.paperHeight
//   (di HC "paperLength" = panjang kertas horizontal, di PK "paperWidth")

export interface PkSourceValues {
  customerName: string
  printName: string
  paperName: string
  paperGrammage: string
  paperLength: string
  paperWidth: string
  cutWidth: string
  cutHeight: string
  quantity: string
  jumlahPesanan: string
  berapaMata: string
  setelanKertas: string
  namaSuplier: string
  pricePerSheet: string
}

export const SOURCE_FIELD_LABELS: Record<keyof PkSourceValues, string> = {
  customerName: 'Nama Customer',
  printName: 'Nama Cetakan',
  paperName: 'Nama Bahan',
  paperGrammage: 'Gramatur',
  paperLength: 'Uk. Kertas (P)',
  paperWidth: 'Uk. Kertas (L)',
  cutWidth: 'Uk. Potongan (P)',
  cutHeight: 'Uk. Potongan (L)',
  quantity: 'Jumlah Kebutuhan',
  jumlahPesanan: 'Jumlah Pesanan',
  berapaMata: 'Berapa Mata',
  setelanKertas: 'Setelan Kertas',
  namaSuplier: 'Nama Suplier',
  pricePerSheet: 'Harga/Lembar',
}

type PkRow = {
  namaCustomer?: string | null
  namaCetakan?: string | null
  paperName?: string | null
  grammage?: string | null
  paperWidth?: string | null
  paperHeight?: string | null
  cutWidth?: string | null
  cutHeight?: string | null
  quantity?: string | null
  jumlahPesanan?: string | null
  berapaMata?: string | null
  setelanKertas?: string | null
  namaSuplier?: string | null
  pricePerSheet?: string | number | null
}

type HcRow = {
  customerName?: string | null
  printName?: string | null
  paperName?: string | null
  paperGrammage?: string | number | null
  paperLength?: string | null
  paperWidth?: string | null
  cutWidth?: string | null
  cutHeight?: string | null
  quantity?: string | null
  jumlahPesanan?: string | null
  berapaMata?: string | null
  setelanKertas?: string | null
  namaSuplier?: string | null
  pricePerSheet?: string | number | null
}

const s = (v: unknown) => String(v ?? '').trim()

export function extractPkSource(pk: PkRow): PkSourceValues {
  return {
    customerName: s(pk.namaCustomer),
    printName: s(pk.namaCetakan),
    // Kertas custom: PK menyimpan 'Custom' saat bukan master — label ekuivalen
    // dgn HC yang menyimpan '' → dinormalisasi agar tidak dianggap berubah.
    paperName: s(pk.paperName) || 'Custom',
    paperGrammage: s(pk.grammage),
    paperLength: s(pk.paperWidth), // PK.paperWidth → HC.paperLength (pola existing)
    paperWidth: s(pk.paperHeight), // PK.paperHeight → HC.paperWidth
    cutWidth: s(pk.cutWidth),
    cutHeight: s(pk.cutHeight),
    quantity: s(pk.quantity),
    jumlahPesanan: s(pk.jumlahPesanan),
    berapaMata: s(pk.berapaMata),
    setelanKertas: s(pk.setelanKertas),
    namaSuplier: s(pk.namaSuplier),
    pricePerSheet: s(pk.pricePerSheet),
  }
}

export function extractHcSource(hc: HcRow): PkSourceValues {
  return {
    customerName: s(hc.customerName),
    printName: s(hc.printName),
    // Normalisasi kertas custom (lihat extractPkSource)
    paperName: s(hc.paperName) || 'Custom',
    paperGrammage: s(hc.paperGrammage),
    paperLength: s(hc.paperLength),
    paperWidth: s(hc.paperWidth),
    cutWidth: s(hc.cutWidth),
    cutHeight: s(hc.cutHeight),
    quantity: s(hc.quantity),
    jumlahPesanan: s(hc.jumlahPesanan),
    berapaMata: s(hc.berapaMata),
    setelanKertas: s(hc.setelanKertas),
    namaSuplier: s(hc.namaSuplier),
    pricePerSheet: s(hc.pricePerSheet),
  }
}

// ---------------------------------------------------------------------------
// B. DIFF — daftar field sumber yang berubah (utk UI & riwayat audit)
// ---------------------------------------------------------------------------

export interface SourceFieldChange {
  field: keyof PkSourceValues
  label: string
  before: string
  after: string
}

export function diffSources(
  before: Partial<PkSourceValues> | null,
  after: PkSourceValues
): SourceFieldChange[] {
  if (!before) return []
  const changes: SourceFieldChange[] = []
  for (const key of Object.keys(SOURCE_FIELD_LABELS) as (keyof PkSourceValues)[]) {
    const a = s((before as unknown as Record<string, unknown>)[key])
    const b = s((after as unknown as Record<string, unknown>)[key])
    if (a !== b) {
      changes.push({ field: key, label: SOURCE_FIELD_LABELS[key], before: a || '-', after: b || '-' })
    }
  }
  return changes
}

// ---------------------------------------------------------------------------
// C. HITUNG ULANG NILAI TURUNAN — RUMUS SAMA DENGAN EDITOR (klien)
// ---------------------------------------------------------------------------

// C.1 Kertas: engine potong yang SAMA dgn computedPaper di halaman HC & PK.
//     totalQty = quantity + setelanKertas; sheets = ceil(totalQty / pcs/lembar);
//     totalPaperPrice = sheets × harga/lembar. Fallback: harga × quantity.
export function computeHcPaperFromPk(pk: PkRow): {
  sheetsNeeded: number
  totalPaperPrice: number
  piecesPerSheet: number
} {
  const pw = parseFloat(s(pk.paperWidth)) || 0
  const ph = parseFloat(s(pk.paperHeight)) || 0
  const cw = parseFloat(s(pk.cutWidth)) || 0
  const ch = parseFloat(s(pk.cutHeight)) || 0
  const qty = parseInt(s(pk.quantity)) || 0
  const setelan = parseInt(s(pk.setelanKertas)) || 0
  const price = parseFloat(s(pk.pricePerSheet)) || 0
  const totalQty = qty + setelan
  if (pw > 0 && ph > 0 && cw > 0 && ch > 0 && totalQty > 0 && price > 0) {
    try {
      const result = calculateCuts({
        paperWidth: pw, paperHeight: ph, cutWidth: cw, cutHeight: ch,
        quantity: totalQty, pricePerSheet: price, optimizationMode: 'maximal',
        customerName: '', paperMaterial: '', grammage: 0,
      })
      return {
        sheetsNeeded: result.sheetsNeeded || 0,
        totalPaperPrice: result.totalPrice || 0,
        piecesPerSheet: result.totalPieces || 0,
      }
    } catch { /* fall through */ }
  }
  return { sheetsNeeded: 0, totalPaperPrice: price * qty, piecesPerSheet: 0 }
}

// C.2 Ongkos cetak — formula IDENTIK dgn useEffect ongkos di halaman HC:
//     (hargaWarna × warna + hargaKhusus × warnaKhusus)
//     + bila qty > minimum: (qty - minimum) × hargaLebihDariMinimum
//     + hargaPlat × (warna + warnaKhusus)
//     Input MANUAL (mesin, warna, plat) TIDAK diubah — hanya nilai yang
//     bergantung quantity ikut menyesuaikan (aturan bisnis aplikasi).
export function computeOngkosCetak(
  machine: {
    pricePerColor: number
    specialColorPrice: number
    minimumPrintQuantity: number
    priceAboveMinimumPerSheet: number
  } | null | undefined,
  qty: number,
  warna: number,
  warnaKhusus: number,
  hargaPlat: number
): number | null {
  if (!machine || qty <= 0 || warna <= 0) return null
  let ongkos = (machine.pricePerColor * warna) + (machine.specialColorPrice * warnaKhusus)
  if (qty > machine.minimumPrintQuantity) {
    ongkos += (qty - machine.minimumPrintQuantity) * machine.priceAboveMinimumPerSheet
  }
  ongkos += hargaPlat * (warna + warnaKhusus)
  return ongkos
}

// C.3 Finishing — formula IDENTIK dgn getFinishingCost di halaman HC.
export interface FinishingMasterLike {
  name: string
  minimumSheets: number
  minimumPrice: number
  additionalPrice: number
  pricePerCm: number
}

export function computeFinishingItemCost(
  fin: FinishingMasterLike,
  qty: number,
  cutWidth: number,
  cutHeight: number
): number {
  const minSheets = fin.minimumSheets
  const minPrice = fin.minimumPrice
  const hargaLebih = fin.additionalPrice
  const hargaPerCm = fin.pricePerCm
  const isPond = fin.name.toLowerCase().includes('pond')

  if (qty <= 0) return minPrice
  if (isPond) {
    if (qty <= minSheets) return minPrice
    return minPrice + (qty - minSheets) * hargaLebih
  }

  let part1 = 0
  if (qty > minSheets && hargaLebih > 0) part1 = (qty - minSheets) * hargaLebih
  let part2 = 0
  if (cutWidth > 0 && cutHeight > 0 && hargaPerCm > 0) part2 = cutWidth * cutHeight * hargaPerCm * qty
  const total = part1 + part2
  return total <= minPrice ? minPrice : total
}

// Daftar finishing HC = finishingNames (dipisah koma) — dipetakan ke master.
// Bila ada nama yang tidak ketemu di master → return null (pertahankan nilai lama).
export function computeFinishingTotal(
  finishingNamesCsv: string | null | undefined,
  masters: FinishingMasterLike[],
  qty: number,
  cutWidth: number,
  cutHeight: number
): number | null {
  const names = s(finishingNamesCsv).split(',').map(n => n.trim()).filter(Boolean)
  if (names.length === 0) return null
  let total = 0
  const seen = new Set<string>()
  for (const name of names) {
    if (seen.has(name)) continue
    seen.add(name)
    const fin = masters.find(m => m.name === name)
    if (!fin) return null // master hilang → pertahankan nilai tersimpan
    total += computeFinishingItemCost(fin, qty, cutWidth, cutHeight)
  }
  return total
}

// C.4 Sub total / profit / grand total — formula IDENTIK dgn buildRiwayatPayload:
//     subTotal = kertas + ongkos1 + ongkos2 + finishing + packing + kirim
//                + biayaLain1 + biayaLain2 + lem + lemBorongan  (TANPA profit)
//     profitAmount = subTotal × profitPercent/100 ; grandTotal = subTotal + profit
export function recomputeHcTotals(
  parts: {
    totalPaperPrice: number
    ongkosCetak: number
    ongkosCetak2: number
    finishingCost: number
    packingCost: number
    shippingCost: number
    otherCost: number
    otherCost2: number
    glueCost: number
    glueBorongan: number
    profitPercent: number
  }
): { subTotal: number; profitAmount: number; grandTotal: number } {
  const subTotal =
    parts.totalPaperPrice + parts.ongkosCetak + parts.ongkosCetak2 + parts.finishingCost +
    parts.packingCost + parts.shippingCost + parts.otherCost + parts.otherCost2 +
    parts.glueCost + parts.glueBorongan
  const profitAmount = subTotal * ((parts.profitPercent || 0) / 100)
  const grandTotal = subTotal + profitAmount
  return { subTotal, profitAmount, grandTotal }
}

// ---------------------------------------------------------------------------
// D. SNAPSHOT & RIWAYAT SINKRONISASI (audit §11)
// ---------------------------------------------------------------------------

export interface SyncEvent {
  at: string // ISO timestamp
  direction: 'pk→hc'
  result: 'ok' | 'failed'
  changed: SourceFieldChange[]
  totalPaperPrice?: number
  subTotal?: number
  grandTotal?: number
}

export function parseSnapshot(json: string | null | undefined): Partial<PkSourceValues> | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json)
    if (parsed && typeof parsed === 'object') return parsed as Partial<PkSourceValues>
  } catch {}
  return null
}

export function parseSyncHistory(json: string | null | undefined): SyncEvent[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    if (Array.isArray(parsed)) return parsed as SyncEvent[]
  } catch {}
  return []
}

export const SYNC_HISTORY_CAP = 20

export function pushSyncEvent(history: SyncEvent[], event: SyncEvent): SyncEvent[] {
  return [event, ...history].slice(0, SYNC_HISTORY_CAP)
}

// ---------------------------------------------------------------------------
// E. RINGKASAN SUMBER (utk panel status di kedua halaman)
// ---------------------------------------------------------------------------

export function buildPkSummary(pk: PkRow & {
  id?: string
  nomorUrut?: string
  efficiency?: number
  totalPrice?: number
  sheetsNeeded?: string | null
  updatedAt?: Date | string
}) {
  return {
    id: pk.id || '',
    nomor: s(pk.nomorUrut),
    bahan: s(pk.paperName) || 'Custom',
    grammage: s(pk.grammage),
    ukuranKertas: `${s(pk.paperWidth)} × ${s(pk.paperHeight)} cm`,
    ukuranPotongan: `${s(pk.cutWidth)} × ${s(pk.cutHeight)} cm`,
    quantity: s(pk.quantity),
    jumlahPesanan: s(pk.jumlahPesanan),
    sheetsNeeded: parseInt(s(pk.sheetsNeeded)) || 0,
    efficiency: Number(pk.efficiency || 0),
    totalBiayaKertas: Number(pk.totalPrice || 0),
    updatedAt: pk.updatedAt ? new Date(pk.updatedAt).toISOString() : '',
  }
}
