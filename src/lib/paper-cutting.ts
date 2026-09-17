/**
 * Kalkulasi sederhana Potong Kertas (grid) — Mode Normal & Rotasi 90°.
 * Semua satuan dalam cm, hasil pcs = potongan utuh per lembar.
 * Sengaja dibuat sederhana: cukup coba 2 posisi (normal & rotasi)
 * dan pilih yang paling banyak menghasilkan potongan.
 */

/** Toleransi floating point (cm) agar 21.5 tidak turun jadi 21.4999 */
export const FLOAT_TOLERANCE = 0.0001

export type Rotation = 'normal' | 'rotated'

export interface OrientationResult {
  cols: number
  rows: number
  pieces: number
  /** Persen pemakaian luas kertas (0-100) */
  efficiency: number
  /** Luas terbuang per lembar (cm²) */
  waste: number
}

export interface CutCalcResult {
  valid: boolean
  message?: string
  normal: OrientationResult
  rotated: OrientationResult
  /** Posisi terbaik (potongan terbanyak) */
  bestRotation: Rotation
  piecesPerSheet: number
  sheetsNeeded: number
  efficiency: number
  wastePerSheet: number
  totalWaste: number
  totalCost: number
  /** Sisa kapasitas: piecesPerSheet × sheetsNeeded − quantity */
  leftoverPieces: number
  paperArea: number
  cutArea: number
}

function countGrid(paperW: number, paperH: number, cutW: number, cutH: number): OrientationResult {
  const cols = Math.floor((paperW + FLOAT_TOLERANCE) / cutW)
  const rows = Math.floor((paperH + FLOAT_TOLERANCE) / cutH)
  const pieces = Math.max(0, cols) * Math.max(0, rows)
  const paperArea = paperW * paperH
  const usedArea = pieces * cutW * cutH
  return {
    cols,
    rows,
    pieces,
    efficiency: paperArea > 0 ? (usedArea / paperArea) * 100 : 0,
    waste: paperArea - usedArea,
  }
}

/**
 * Hitung hasil potong untuk satu ukuran kertas.
 * Mencoba posisi Normal (cutW × cutH) dan Rotasi 90° (cutH × cutW),
 * lalu memilih posisi dengan potongan terbanyak.
 */
export function calcCut(
  paperWidth: number,
  paperHeight: number,
  cutWidth: number,
  cutHeight: number,
  quantity: number,
  pricePerSheet: number = 0
): CutCalcResult {
  const paperArea = paperWidth * paperHeight
  const cutArea = cutWidth * cutHeight

  const normal = countGrid(paperWidth, paperHeight, cutWidth, cutHeight)
  const rotated = countGrid(paperWidth, paperHeight, cutHeight, cutWidth)

  // Validasi dasar
  if (!(paperWidth > 0) || !(paperHeight > 0)) {
    return buildInvalid(normal, rotated, 'Ukuran kertas harus lebih dari 0', paperArea, cutArea)
  }
  if (!(cutWidth > 0) || !(cutHeight > 0)) {
    return buildInvalid(normal, rotated, 'Ukuran potong harus lebih dari 0', paperArea, cutArea)
  }
  if (quantity < 0 || pricePerSheet < 0) {
    return buildInvalid(normal, rotated, 'Jumlah dan harga tidak boleh negatif', paperArea, cutArea)
  }
  if (normal.pieces === 0 && rotated.pieces === 0) {
    return buildInvalid(
      normal,
      rotated,
      'Ukuran potong lebih besar dari ukuran kertas. Perbesar ukuran kertas atau perkecil ukuran potong.',
      paperArea,
      cutArea
    )
  }

  // Pilih posisi terbaik: potongan terbanyak → efisiensi tertinggi → normal diprioritaskan
  let bestRotation: Rotation = 'normal'
  if (rotated.pieces > normal.pieces) bestRotation = 'rotated'
  else if (rotated.pieces === normal.pieces && rotated.efficiency > normal.efficiency + 0.0001) bestRotation = 'rotated'

  const best = bestRotation === 'normal' ? normal : rotated
  const piecesPerSheet = best.pieces
  const sheetsNeeded = quantity > 0 ? Math.ceil(quantity / piecesPerSheet) : 0
  const totalCost = sheetsNeeded * pricePerSheet

  return {
    valid: true,
    normal,
    rotated,
    bestRotation,
    piecesPerSheet,
    sheetsNeeded,
    efficiency: best.efficiency,
    wastePerSheet: best.waste,
    totalWaste: best.waste * sheetsNeeded,
    totalCost,
    leftoverPieces: piecesPerSheet * sheetsNeeded - quantity,
    paperArea,
    cutArea,
  }
}

function buildInvalid(
  normal: OrientationResult,
  rotated: OrientationResult,
  message: string,
  paperArea: number,
  cutArea: number
): CutCalcResult {
  return {
    valid: false,
    message,
    normal,
    rotated,
    bestRotation: 'normal',
    piecesPerSheet: 0,
    sheetsNeeded: 0,
    efficiency: 0,
    wastePerSheet: 0,
    totalWaste: 0,
    totalCost: 0,
    leftoverPieces: 0,
    paperArea,
    cutArea,
  }
}

// ==================== DATA MASTER KERTAS ====================

export interface PaperSize {
  id: string
  name: string
  width: number
  height: number
  price: number
  unit: string
  status: string
}

export interface PaperRecommendation {
  paper: PaperSize
  calc: CutCalcResult
  rank: number
}

/**
 * Rekomendasi ukuran kertas: cukup coba semua ukuran di Master Kertas,
 * lalu urutkan dari hasil terbaik.
 * Ranking: potongan terbanyak → efisiensi tertinggi → waste terkecil → luas kertas terkecil → harga termurah.
 */
export function recommendPapers(
  papers: PaperSize[],
  cutWidth: number,
  cutHeight: number,
  quantity: number = 0
): PaperRecommendation[] {
  const results: PaperRecommendation[] = []

  for (const paper of papers) {
    if (paper.status && paper.status !== 'aktif') continue
    const calc = calcCut(paper.width, paper.height, cutWidth, cutHeight, quantity, paper.price)
    if (!calc.valid || calc.piecesPerSheet <= 0) continue
    results.push({ paper, calc, rank: 0 })
  }

  results.sort((a, b) => {
    if (b.calc.piecesPerSheet !== a.calc.piecesPerSheet) return b.calc.piecesPerSheet - a.calc.piecesPerSheet
    if (b.calc.efficiency !== a.calc.efficiency) return b.calc.efficiency - a.calc.efficiency
    if (a.calc.wastePerSheet !== b.calc.wastePerSheet) return a.calc.wastePerSheet - b.calc.wastePerSheet
    const areaA = a.paper.width * a.paper.height
    const areaB = b.paper.width * b.paper.height
    if (areaA !== areaB) return areaA - areaB
    if (a.paper.price !== b.paper.price) return a.paper.price - b.paper.price
    return a.paper.name.localeCompare(b.paper.name)
  })

  results.forEach((r, i) => { r.rank = i + 1 })
  return results
}

// ==================== FORMAT ANGKA (Indonesia) ====================

/** Format angka gaya Indonesia: 1.234,5 */
export function formatNumberID(value: number, maxFractionDigits: number = 1): string {
  if (!isFinite(value)) return '0'
  return value.toLocaleString('id-ID', { maximumFractionDigits: maxFractionDigits })
}

/** Format rupiah: Rp 1.234.567 */
export function formatRupiah(value: number): string {
  if (!isFinite(value)) return 'Rp 0'
  return 'Rp ' + Math.round(value).toLocaleString('id-ID')
}

/** Format tanggal gaya Indonesia: 13/09/2026 */
export function formatTanggalID(value?: string | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
