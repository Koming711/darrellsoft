// ============================================================================
// Cutting Optimizer — mesin pencari pola potong paling efisien
// ============================================================================
// Murni TypeScript (tanpa React) — aman dipakai di API route (server).
//
// Kemampuan:
// 1. Menguji SEMUA ukuran kertas kandidat (dari Master Kertas / Paper) untuk
//    ukuran potongan tertentu.
// 2. Untuk tiap ukuran kertas, menguji banyak pola:
//    - Grid orientasi normal            (kolom × baris)
//    - Grid rotasi 90°                  (kolom × baris, potongan diputar)
//    - Guillotine campuran              (normal + rotasi dalam 1 lembar)
//    - Belah bertahap / bertingkat      (strip-strip dgn orientasi berbeda)
//    - Seluruh pola lama cutting-engine (Belah 2, Belah 4, Guillotine 1 potong,
//      2-Stage, Hybrid) — tetap diuji agar hasil lama tidak pernah memburuk.
// 3. Menghitung area sisa SECARA GEOMETRI (rectangle subtraction): setiap area
//    sisa punya posisi, lebar, tinggi, luas, label (Sisa A/B/C...) dan status
//    pemanfaatan — tanpa tumpang tindih, tanpa dihitung dua kali.
// 4. Neraca luas selalu konsisten:
//    Luas kertas = luas potongan + sisa bisa dipakai + sisa kecil + limbah.
// 5. Peringkat kandidat: total biaya termurah → lembar tersedikit → efisiensi
//    tertinggi → sisa paling mudah dipakai ulang (persegi panjang terbesar).
//
// Kerf/margin pisau: aplikasi belum memiliki parameter kerf, jadi kehilangan
// material = 0 dan ditampilkan apa adanya (tidak dikarang).
// ============================================================================

import {
  normalGridLayout,
  splitInHalf,
  splitInFour,
  guillotineSingleCut,
  twoStageGuillotine,
  hybridLayout,
  calculatePiecesInRect,
  type Block,
  type Scenario,
  type CuttingResult,
  type CalculateCutsParams,
} from './cutting-engine'

const EPS = 1e-4 // toleransi floating point (cm) — konsisten dgn paper-cutting.ts

// ---------------------------------------------------------------------------
// Tipe publik
// ---------------------------------------------------------------------------

/** Satu area sisa hasil dekomposisi geometri lembar kertas. */
export interface WasteArea {
  id: string // 'sisa-a', 'sisa-b', ...
  label: string // 'Sisa A'
  x: number // posisi kiri (cm, dari kiri-atas lembar)
  y: number // posisi atas (cm)
  width: number // cm
  height: number // cm
  area: number // cm²
  status: 'reusable' | 'small' | 'waste'
  statusLabel: string // 'Dapat digunakan kembali' | 'Sisa kecil' | 'Limbah'
  note: string
}

/** Hasil optimasi untuk SATU ukuran kertas (bentuk lama + pelengkap sisa). */
export interface CuttingResultPlus extends CuttingResult {
  wasteAreas?: WasteArea[]
  paperArea?: number // luas 1 lembar (cm²)
  piecesArea?: number // luas potongan terpakai per lembar (cm²)
  wasteReusableArea?: number // cm² per lembar
  wasteSmallArea?: number // cm² per lembar
  wasteWasteArea?: number // limbah murni (cm²) per lembar
  wasteLossArea?: number // kerf/margin (cm²) — 0 karena aplikasi tanpa parameter kerf
  leftoverPieces?: number // kelebihan potongan (total produksi − kebutuhan)
}

export interface CandidateResult {
  paperId: string
  paperName: string
  suplier: string | null
  grammage: number
  paperWidth: number
  paperHeight: number
  pricePerRim: number
  pricePerSheet: number
  piecesPerSheet: number
  sheetsNeeded: number
  leftoverPieces: number
  totalPrice: number
  efficiency: number // % per lembar
  wasteSummary: {
    reusableArea: number
    smallArea: number
    wasteArea: number
    lossArea: number
    totalWasteArea: number
  }
  strategy: string
  result: CuttingResultPlus
}

export interface OptimizeInput {
  bahan: string // nama bahan persis seperti Master Kertas
  grammage: number
  cutWidth: number
  cutHeight: number
  quantity: number // jumlah potongan yang dibutuhkan
  setelanKertas?: number // insit kertas (lembar cadangan) — ikut dihitung
  optimizationMode?: 'fast' | 'maximal'
}

// ---------------------------------------------------------------------------
// Geometri: potong (subtract) & gabung (merge) persegi panjang
// ---------------------------------------------------------------------------

interface Rect { x: number; y: number; w: number; h: number }

function overlaps(r: Rect, s: Rect): boolean {
  return (
    s.x < r.x + r.w - EPS && s.x + s.w > r.x + EPS &&
    s.y < r.y + r.h - EPS && s.y + s.h > r.y + EPS
  )
}

/** Kembalikan bagian-bagian `rect` yang TIDAK tertutup `hole` (≤4 bagian). */
function subtract(rect: Rect, hole: Rect): Rect[] {
  if (!overlaps(rect, hole)) return [rect]
  const parts: Rect[] = []
  // kiri / kanan (tinggi penuh rect)
  if (hole.x > rect.x + EPS) parts.push({ x: rect.x, y: rect.y, w: hole.x - rect.x, h: rect.h })
  const holeRight = hole.x + hole.w
  if (holeRight < rect.x + rect.w - EPS) parts.push({ x: holeRight, y: rect.y, w: rect.x + rect.w - holeRight, h: rect.h })
  // atas / bawah (hanya pada pita horizontal yang tumpang tindih)
  const ox1 = Math.max(rect.x, hole.x)
  const ox2 = Math.min(rect.x + rect.w, holeRight)
  if (hole.y > rect.y + EPS) parts.push({ x: ox1, y: rect.y, w: ox2 - ox1, h: hole.y - rect.y })
  const holeBottom = hole.y + hole.h
  if (holeBottom < rect.y + rect.h - EPS) parts.push({ x: ox1, y: holeBottom, w: ox2 - ox1, h: rect.y + rect.h - holeBottom })
  return parts
}

function nearly(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.02 // 0.2 mm — toleransi penyatuan
}

/** Gabungkan persegi panjang yang bersebelahan (satu pass horizontal + vertikal). */
function mergeRects(rects: Rect[]): Rect[] {
  let cur = rects.filter(r => r.w > 0.01 && r.h > 0.01)
  let changed = true
  let guard = 0
  while (changed && guard < 50) {
    changed = false
    guard++
    // horizontal: r1 kanan menempel r2 kiri, y & tinggi sama
    outer1:
    for (let i = 0; i < cur.length; i++) {
      for (let j = 0; j < cur.length; j++) {
        if (i === j) continue
        const a = cur[i], b = cur[j]
        if (nearly(a.y, b.y) && nearly(a.h, b.h) && nearly(a.x + a.w, b.x)) {
          const merged: Rect = { x: a.x, y: a.y, w: a.w + b.w, h: a.h }
          cur = cur.filter((_, k) => k !== i && k !== j)
          cur.push(merged)
          changed = true
          break outer1
        }
      }
    }
    if (changed) continue
    // vertikal: a bawah menempel b atas, x & lebar sama
    outer2:
    for (let i = 0; i < cur.length; i++) {
      for (let j = 0; j < cur.length; j++) {
        if (i === j) continue
        const a = cur[i], b = cur[j]
        if (nearly(a.x, b.x) && nearly(a.w, b.w) && nearly(a.y + a.h, b.y)) {
          const merged: Rect = { x: a.x, y: a.y, w: a.w, h: a.h + b.h }
          cur = cur.filter((_, k) => k !== i && k !== j)
          cur.push(merged)
          changed = true
          break outer2
        }
      }
    }
  }
  return cur
}

/**
 * Dekomposisi sisa kertas dari pola potong aktual.
 * Setiap area sisa unik & tidak tumpang tindih (rectangle subtraction + merge).
 */
export function computeWasteAreas(
  paperWidth: number,
  paperHeight: number,
  blocks: Block[],
  cutWidth: number,
  cutHeight: number
): WasteArea[] {
  let rects: Rect[] = [{ x: 0, y: 0, w: paperWidth, h: paperHeight }]
  for (const b of blocks) {
    const hole: Rect = { x: b.x, y: b.y, w: b.width, h: b.height }
    const next: Rect[] = []
    for (const r of rects) next.push(...subtract(r, hole))
    rects = next
  }
  rects = mergeRects(rects)
  // buang serpihan numerik < 0,05 cm²
  rects = rects.filter(r => r.w * r.h >= 0.05)

  // urutkan: luas terbesar dulu → Sisa A = sisa paling besar/bernilai
  rects.sort((a, b) => (b.w * b.h) - (a.w * a.h))

  const minDim = Math.min(cutWidth, cutHeight)
  const maxDim = Math.max(cutWidth, cutHeight)
  const areas: WasteArea[] = []
  rects.forEach((r, idx) => {
    const area = r.w * r.h
    const letter = String.fromCharCode(65 + (idx % 26)) + (idx >= 26 ? String(Math.floor(idx / 26)) : '')
    const label = `Sisa ${letter}`
    const fitsCutPiece =
      (r.w >= cutWidth - EPS && r.h >= cutHeight - EPS) ||
      (r.w >= cutHeight - EPS && r.h >= cutWidth - EPS)
    let status: WasteArea['status']
    let statusLabel: string
    let note: string
    if (fitsCutPiece) {
      status = 'reusable'
      statusLabel = 'Dapat digunakan kembali'
      note = `Masih bisa memuat potongan ${cutWidth} × ${cutHeight} cm`
    } else if (Math.min(r.w, r.h) >= 10 - EPS) {
      status = 'reusable'
      statusLabel = 'Dapat digunakan kembali'
      note = 'Cukup besar (sisi terpendek ≥ 10 cm) untuk produk lain'
    } else if (Math.min(r.w, r.h) >= minDim - EPS && area >= 0.25 * minDim * maxDim) {
      // strip sepanjang sisi potongan tapi terlalu sempit utk potongan utuh
      status = 'small'
      statusLabel = 'Sisa kecil'
      note = 'Strip sempit — belum tentu dapat digunakan'
    } else if (area >= 100) {
      status = 'small'
      statusLabel = 'Sisa kecil'
      note = 'Luas ≥ 100 cm² tapi tidak muat potongan utuh'
    } else {
      status = 'waste'
      statusLabel = 'Limbah'
      note = 'Terlalu kecil untuk dimanfaatkan'
    }
    areas.push({
      id: `sisa-${letter.toLowerCase()}-${idx}`,
      label,
      x: Math.round(r.x * 100) / 100,
      y: Math.round(r.y * 100) / 100,
      width: Math.round(r.w * 100) / 100,
      height: Math.round(r.h * 100) / 100,
      area: Math.round(area * 100) / 100,
      status,
      statusLabel,
      note,
    })
  })
  return areas
}

// ---------------------------------------------------------------------------
// Guillotine optimal (memoized): pola campuran normal + rotasi + belah bertahap
// ---------------------------------------------------------------------------

interface PackNode {
  pieces: number
  leaf?: { rotated: boolean; horizontal: number; vertical: number }
  cut?: { dir: 'v' | 'h'; pos: number; a: PackNode; b: PackNode }
}

const gridPieceCount = (w: number, h: number, pw: number, ph: number) => {
  const cols = Math.floor((w + EPS) / pw)
  const rows = Math.floor((h + EPS) / ph)
  return cols > 0 && rows > 0 ? cols * rows : 0
}

interface PackCtx {
  cw: number
  ch: number
  memo: Map<string, PackNode>
  positionsV: number[] // kandidat posisi potong vertikal (utk lebar w)
  positionsH: number[]
  vKey: number // pembagi kuantisasi memo utk lebar
  hKey: number
}

/** Kandidat posisi potong: kelipatan cw, ch, dan langkah halus — menjamin pola klasik tercapai. */
function buildPositions(D: number, cw: number, ch: number, step: number): number[] {
  const minDim = Math.min(cw, ch)
  const maxD = D - minDim
  if (maxD < minDim - EPS) return []
  const set = new Set<number>()
  const push = (v: number) => {
    if (v >= minDim - EPS && v <= maxD + EPS) set.add(Math.round(v * 1000) / 1000)
  }
  for (let v = minDim; v <= maxD + EPS; v += cw) push(v)
  for (let v = minDim; v <= maxD + EPS; v += ch) push(v)
  for (let v = step; v <= maxD + EPS; v += step) push(v)
  return Array.from(set).sort((a, b) => a - b)
}

function bestPack(w: number, h: number, ctx: PackCtx): PackNode {
  const key = `${Math.round(w * ctx.vKey)}_${Math.round(h * ctx.hKey)}`
  const hit = ctx.memo.get(key)
  if (hit) return hit

  // Basis: grid seragam (normal / rotasi) pada rect ini
  const nNormal = gridPieceCount(w, h, ctx.cw, ctx.ch)
  const nRotated = gridPieceCount(w, h, ctx.ch, ctx.cw)
  let best: PackNode
  if (nRotated > nNormal) {
    best = { pieces: nRotated, leaf: { rotated: true, horizontal: Math.floor((w + EPS) / ctx.ch), vertical: Math.floor((h + EPS) / ctx.cw) } }
  } else {
    best = { pieces: nNormal, leaf: { rotated: false, horizontal: Math.floor((w + EPS) / ctx.cw), vertical: Math.floor((h + EPS) / ctx.ch) } }
  }

  // Guillotine: potong vertikal → dua rect
  if (w >= 2 * Math.min(ctx.cw, ctx.ch) - EPS) {
    for (const x of ctx.positionsV) {
      if (x > w - Math.min(ctx.cw, ctx.ch) + EPS) break
      const a = bestPack(x, h, ctx)
      const b = bestPack(w - x, h, ctx)
      const total = a.pieces + b.pieces
      if (total > best.pieces) best = { pieces: total, cut: { dir: 'v', pos: x, a, b } }
    }
  }
  // Guillotine: potong horizontal → dua rect
  if (h >= 2 * Math.min(ctx.cw, ctx.ch) - EPS) {
    for (const y of ctx.positionsH) {
      if (y > h - Math.min(ctx.cw, ctx.ch) + EPS) break
      const a = bestPack(w, y, ctx)
      const b = bestPack(w, h - y, ctx)
      const total = a.pieces + b.pieces
      if (total > best.pieces) best = { pieces: total, cut: { dir: 'h', pos: y, a, b } }
    }
  }

  ctx.memo.set(key, best)
  return best
}

const q1 = (n: number) => Math.round(n * 10) / 10 // 1 desimal utk tampilan

/** Bangun daftar Blok + langkah potong dari PackNode (rekonstruksi layout). */
function materializePack(
  node: PackNode,
  ox: number,
  oy: number,
  w: number,
  h: number,
  ctx: PackCtx,
  pw: number,
  ph: number,
  blocks: Block[],
  steps: string[]
): void {
  if (node.leaf) {
    const { rotated, horizontal, vertical } = node.leaf
    if (horizontal <= 0 || vertical <= 0 || horizontal * vertical <= 0) return
    const pwPiece = rotated ? ctx.ch : ctx.cw
    const phPiece = rotated ? ctx.cw : ctx.ch
    const usedW = horizontal * pwPiece
    const usedH = vertical * phPiece
    const name = `Blok ${String.fromCharCode(65 + blocks.length)}`
    blocks.push({
      name, x: ox, y: oy,
      width: usedW, height: usedH,
      horizontal, vertical,
      pieces: horizontal * vertical,
      pieceWidth: pwPiece, pieceHeight: phPiece,
      rotated,
      usedWidth: usedW, usedHeight: usedH,
      wasteWidth: Math.max(0, w - usedW),
      wasteHeight: Math.max(0, h - usedH),
    })
    steps.push(`${name}: grid ${horizontal} × ${vertical}${rotated ? ' (rotasi 90°)' : ''} → ${horizontal * vertical} potongan (${q1(usedW)} × ${q1(usedH)} cm)`)
    return
  }
  if (node.cut) {
    const { dir, pos, a, b } = node.cut
    if (dir === 'v') {
      steps.push(`Potong vertikal pada ${q1(pos)} cm dari kiri (lembar ${q1(w)} × ${q1(h)} cm)`)
      materializePack(a, ox, oy, pos, h, ctx, pw, ph, blocks, steps)
      materializePack(b, ox + pos, oy, w - pos, h, ctx, pw, ph, blocks, steps)
    } else {
      steps.push(`Potong horizontal pada ${q1(pos)} cm dari bawah (lembar ${q1(w)} × ${q1(h)} cm)`)
      materializePack(a, ox, oy, w, pos, ctx, pw, ph, blocks, steps)
      materializePack(b, ox, oy + pos, w, h - pos, ctx, pw, ph, blocks, steps)
    }
  }
}

/** Pola guillotine optimal utk satu lembar — mencakup normal, rotasi, campuran & bertahap. */
function bestGuillotineScenario(
  pw: number, ph: number, cw: number, ch: number,
  optimizationMode: 'fast' | 'maximal'
): Scenario | null {
  const minDim = Math.min(cw, ch)
  if (pw < minDim - EPS || ph < minDim - EPS) return null
  // langkah halus: maximal → 0,5 cm; fast → 1 cm. Batasi jumlah posisi agar cepat.
  let step = optimizationMode === 'maximal' ? 0.5 : 1
  const maxSide = Math.max(pw, ph)
  while (maxSide / step > 260) step *= 2

  const ctx: PackCtx = {
    cw, ch,
    memo: new Map(),
    positionsV: buildPositions(pw, cw, ch, step),
    positionsH: buildPositions(ph, cw, ch, step),
    vKey: 100, // kuantisasi memo 0,01 cm
    hKey: 100,
  }
  const root = bestPack(pw, ph, ctx)
  if (root.pieces <= 0) return null

  const blocks: Block[] = []
  const steps: string[] = []
  materializePack(root, 0, 0, pw, ph, ctx, pw, ph, blocks, steps)

  if (blocks.length === 0) return null

  const rotatedLeaves = blocks.filter(b => b.rotated).length
  const normalLeaves = blocks.length - rotatedLeaves
  let strategy: string
  if (blocks.length === 1) {
    strategy = blocks[0].rotated ? 'Grid Rotasi 90° Optimal' : 'Grid Normal Optimal'
  } else if (rotatedLeaves === 0) {
    strategy = `Guillotine Optimal ${blocks.length} Blok (normal)`
  } else if (normalLeaves === 0) {
    strategy = `Guillotine Optimal ${blocks.length} Blok (rotasi)`
  } else {
    strategy = `Guillotine Campuran Optimal (${normalLeaves} normal + ${rotatedLeaves} rotasi)`
  }

  return {
    strategy,
    type: 'block-cut',
    cutPosition: blocks.length > 1 ? blocks[1]?.x : undefined,
    cutPositionY: undefined,
    blocks,
    total: root.pieces,
    steps: [`Pola guillotine optimal untuk ${pw} × ${ph} cm → ${root.pieces} potongan ${cw} × ${ch} cm`, ...steps],
  }
}

// ---------------------------------------------------------------------------
// Optimasi satu ukuran kertas
// ---------------------------------------------------------------------------

function scenarioWasteArea(pw: number, ph: number, blocks: Block[]): number {
  const used = blocks.reduce((s, b) => s + b.usedWidth * b.usedHeight, 0)
  return pw * ph - used
}

/**
 * Hitung pola potong terbaik untuk SATU ukuran kertas (pw × ph) dan potongan
 * cw × ch. Menggabungkan seluruh pola lama + guillotine optimal, lalu memilih
 * yang terbaik (potongan terbanyak → sisa paling berguna → blok paling sedikit).
 */
export function optimizeOnePaper(params: {
  paperWidth: number
  paperHeight: number
  cutWidth: number
  cutHeight: number
  quantity: number // total potongan dibutuhkan (kebutuhan + insit)
  pricePerSheet: number
  optimizationMode: 'fast' | 'maximal'
  customerName: string
  paperMaterial: string
  grammage: number
}): CuttingResultPlus | null {
  const { paperWidth: pw, paperHeight: ph, cutWidth: cw, cutHeight: ch, quantity: qty, pricePerSheet: price, optimizationMode, customerName, paperMaterial, grammage } = params

  if (!(pw > 0) || !(ph > 0) || !(cw > 0) || !(ch > 0)) return null

  // --- Kumpulkan kandidat pola ---
  const scenarios: Scenario[] = []

  // 1) Pola lama (dipertahankan penuh — kompatibilitas & familiar)
  scenarios.push(normalGridLayout(pw, ph, cw, ch))
  scenarios.push(...splitInHalf(pw, ph, cw, ch))
  scenarios.push(...splitInFour(pw, ph, cw, ch))
  const gSingle = guillotineSingleCut(pw, ph, cw, ch, optimizationMode)
  scenarios.push(...(optimizationMode === 'maximal' ? gSingle : gSingle.slice(0, 20)))
  scenarios.push(...hybridLayout(pw, ph, cw, ch))
  const twoStage = twoStageGuillotine(pw, ph, cw, ch, optimizationMode)
  scenarios.push(...(optimizationMode === 'maximal' ? twoStage : twoStage.slice(0, 15)))

  // 2) Guillotine optimal (campuran orientasi + belah bertahap apa adanya)
  const best = bestGuillotineScenario(pw, ph, cw, ch, optimizationMode)
  if (best) scenarios.push(best)

  // --- Pilih pola terbaik ---
  let bestScenario: Scenario | null = null
  let bestWasteAreas: WasteArea[] = []
  for (const sc of scenarios) {
    if (sc.total <= 0 || sc.blocks.length === 0) continue
    if (!bestScenario) {
      bestScenario = sc
      bestWasteAreas = computeWasteAreas(pw, ph, sc.blocks, cw, ch)
      continue
    }
    const curWaste = scenarioWasteArea(pw, ph, sc.blocks)
    const bestWaste = scenarioWasteArea(pw, ph, bestScenario.blocks)
    if (sc.total > bestScenario.total || (sc.total === bestScenario.total && curWaste < bestWaste - EPS)) {
      bestScenario = sc
      bestWasteAreas = computeWasteAreas(pw, ph, sc.blocks, cw, ch)
    } else if (sc.total === bestScenario.total && Math.abs(curWaste - bestWaste) <= EPS) {
      // tie-break: sisa terbesar lebih berguna (persegi panjang besar mudah dipakai ulang),
      // lalu jumlah area sisa lebih sedikit
      const curMax = bestWasteAreas.length ? Math.max(...bestWasteAreas.map(a => a.area)) : 0
      const curN = bestWasteAreas.length
      const candAreas = computeWasteAreas(pw, ph, sc.blocks, cw, ch)
      const candMax = candAreas.length ? Math.max(...candAreas.map(a => a.area)) : 0
      const candN = candAreas.length
      if (candMax > curMax + EPS || (Math.abs(candMax - curMax) <= EPS && candN < curN)) {
        bestScenario = sc
        bestWasteAreas = candAreas
      }
    }
  }
  if (!bestScenario) return null

  // --- Neraca luas & statistik ---
  const paperArea = pw * ph
  const piecesArea = bestScenario.total * cw * ch
  const reusableArea = bestWasteAreas.filter(a => a.status === 'reusable').reduce((s, a) => s + a.area, 0)
  const smallArea = bestWasteAreas.filter(a => a.status === 'small').reduce((s, a) => s + a.area, 0)
  const wasteAreaPure = bestWasteAreas.filter(a => a.status === 'waste').reduce((s, a) => s + a.area, 0)
  const totalWasteArea = paperArea - piecesArea
  const efficiency = paperArea > 0 ? (piecesArea / paperArea) * 100 : 0
  const sheetsNeeded = qty > 0 ? Math.ceil(qty / bestScenario.total) : 1
  const leftoverPieces = qty > 0 ? sheetsNeeded * bestScenario.total - qty : 0
  const totalPrice = sheetsNeeded * price

  return {
    totalPieces: bestScenario.total,
    quantity: qty,
    sheetsNeeded,
    totalPrice,
    pricePerSheet: price,
    cutPosition: bestScenario.cutPosition,
    cutPositionY: bestScenario.cutPositionY,
    blocks: bestScenario.blocks,
    paperWidth: pw,
    paperHeight: ph,
    cutWidth: cw,
    cutHeight: ch,
    customerName,
    paperMaterial,
    grammage,
    scenarioType: bestScenario.type,
    totalWasteArea: Math.round(totalWasteArea * 100) / 100,
    efficiency: Math.round(efficiency * 100) / 100,
    steps: bestScenario.steps,
    strategy: bestScenario.strategy,
    wasteAreas: bestWasteAreas,
    paperArea: Math.round(paperArea * 100) / 100,
    piecesArea: Math.round(piecesArea * 100) / 100,
    wasteReusableArea: Math.round(reusableArea * 100) / 100,
    wasteSmallArea: Math.round(smallArea * 100) / 100,
    wasteWasteArea: Math.round(wasteAreaPure * 100) / 100,
    wasteLossArea: 0,
    leftoverPieces,
  }
}

// ---------------------------------------------------------------------------
// Peringkat kandidat ukuran kertas
// ---------------------------------------------------------------------------

export interface RankCandidateInput {
  paperId: string
  paperName: string
  suplier: string | null
  grammage: number
  paperWidth: number
  paperHeight: number
  pricePerRim: number
}

/**
 * Uji seluruh kandidat ukuran kertas & susun peringkat:
 * 1. Harus bisa memproduksi potongan (piecesPerSheet > 0).
 * 2. Total biaya termurah (lembar dibutuhkan × harga/lembar).
 * 3. Lembar paling sedikit.
 * 4. Efisiensi luas tertinggi.
 * 5. Sisa persegi panjang terbesar (paling mudah dipakai ulang).
 */
export function rankPaperCandidates(
  candidates: RankCandidateInput[],
  input: OptimizeInput,
  opts: { customerName?: string; optimizationMode?: 'fast' | 'maximal' } = {}
): CandidateResult[] {
  const cw = input.cutWidth
  const ch = input.cutHeight
  const setelan = Math.max(0, Math.round(input.setelanKertas || 0))
  const totalQty = Math.max(0, Math.round(input.quantity)) + setelan
  const mode = opts.optimizationMode === 'fast' ? 'fast' : 'maximal'

  const results: CandidateResult[] = []
  for (const c of candidates) {
    const pricePerSheet = Math.round((c.pricePerRim || 0) / 500)
    if (!(c.paperWidth > 0) || !(c.paperHeight > 0)) continue
    const optimized = optimizeOnePaper({
      paperWidth: c.paperWidth,
      paperHeight: c.paperHeight,
      cutWidth: cw,
      cutHeight: ch,
      quantity: totalQty,
      pricePerSheet,
      optimizationMode: mode,
      customerName: opts.customerName || '',
      paperMaterial: c.paperName,
      grammage: c.grammage,
    })
    if (!optimized || optimized.totalPieces <= 0) continue
    results.push({
      paperId: c.paperId,
      paperName: c.paperName,
      suplier: c.suplier,
      grammage: c.grammage,
      paperWidth: c.paperWidth,
      paperHeight: c.paperHeight,
      pricePerRim: c.pricePerRim,
      pricePerSheet,
      piecesPerSheet: optimized.totalPieces,
      sheetsNeeded: optimized.sheetsNeeded,
      leftoverPieces: optimized.leftoverPieces || 0,
      totalPrice: optimized.totalPrice,
      efficiency: optimized.efficiency || 0,
      wasteSummary: {
        reusableArea: optimized.wasteReusableArea || 0,
        smallArea: optimized.wasteSmallArea || 0,
        wasteArea: optimized.wasteWasteArea || 0,
        lossArea: 0,
        totalWasteArea: optimized.totalWasteArea || 0,
      },
      strategy: optimized.strategy,
      result: optimized,
    })
  }

  results.sort((a, b) => {
    if (a.totalPrice !== b.totalPrice) return a.totalPrice - b.totalPrice
    if (a.sheetsNeeded !== b.sheetsNeeded) return a.sheetsNeeded - b.sheetsNeeded
    if (a.efficiency !== b.efficiency) return b.efficiency - a.efficiency
    const aMax = a.result.wasteAreas?.length ? Math.max(...a.result.wasteAreas.map(w => w.area)) : 0
    const bMax = b.result.wasteAreas?.length ? Math.max(...b.result.wasteAreas.map(w => w.area)) : 0
    return bMax - aMax
  })
  return results
}
