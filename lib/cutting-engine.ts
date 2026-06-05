// Pure TypeScript calculation engine for paper cutting optimization
// No React dependencies - safe for server-side or Web Worker usage

export interface Customer {
  id: string
  name: string
  address: string
  phone: string
  email: string
}

export interface Paper {
  id: string
  name: string
  grammage: number
  width: number
  height: number
  pricePerRim: number
  createdAt: string
  updatedAt: string
}

export interface Scenario {
  strategy: string
  type: string
  cutPosition?: number
  cutPositionY?: number
  blocks: Block[]
  total: number
  steps: string[]
}

export interface Block {
  name: string
  x: number
  y: number
  width: number
  height: number
  horizontal: number
  vertical: number
  pieces: number
  pieceWidth: number
  pieceHeight: number
  rotated: boolean
  usedWidth: number
  usedHeight: number
  wasteWidth: number
  wasteHeight: number
}

export interface CuttingResult {
  totalPieces: number
  quantity: number
  sheetsNeeded: number
  totalPrice: number
  pricePerSheet: number
  cutPosition?: number
  cutPositionY?: number
  blocks: Block[]
  paperWidth: number
  paperHeight: number
  cutWidth: number
  cutHeight: number
  customerName: string
  paperMaterial: string
  grammage: number
  scenarioType: string
  totalWasteArea: number
  efficiency: number
  steps: string[]
  strategy: string
}

// Helper: create a Block from calculation results
function makeBlock(
  name: string, x: number, y: number, containerW: number, containerH: number,
  result: { pieces: number; horizontal: number; vertical: number; rotated: boolean },
  cw: number, ch: number
): Block {
  const pw = result.rotated ? ch : cw
  const ph = result.rotated ? cw : ch
  const usedW = result.horizontal * pw
  const usedH = result.vertical * ph
  return {
    name, x, y,
    width: usedW,
    height: usedH,
    horizontal: result.horizontal,
    vertical: result.vertical,
    pieces: result.pieces,
    pieceWidth: pw,
    pieceHeight: ph,
    rotated: result.rotated,
    usedWidth: usedW,
    usedHeight: usedH,
    wasteWidth: containerW - usedW,
    wasteHeight: containerH - usedH,
  }
}

// Calculate pieces in a rectangle with optional rotation
export function calculatePiecesInRect(
  rectWidth: number,
  rectHeight: number,
  pieceWidth: number,
  pieceHeight: number
) {
  // Normal orientation
  const hNormal = Math.floor(rectWidth / pieceWidth)
  const vNormal = Math.floor(rectHeight / pieceHeight)
  const totalNormal = hNormal * vNormal

  // Rotated orientation
  const hRotated = Math.floor(rectWidth / pieceHeight)
  const vRotated = Math.floor(rectHeight / pieceWidth)
  const totalRotated = hRotated * vRotated

  if (totalRotated > totalNormal) {
    return { pieces: totalRotated, horizontal: hRotated, vertical: vRotated, rotated: true }
  }
  return { pieces: totalNormal, horizontal: hNormal, vertical: vNormal, rotated: false }
}

// Normal grid layout (with best rotation)
export function normalGridLayout(pw: number, ph: number, cw: number, ch: number): Scenario {
  const { pieces, horizontal, vertical, rotated } = calculatePiecesInRect(pw, ph, cw, ch)

  return {
    strategy: 'Grid Normal',
    type: 'normal',
    blocks: [makeBlock('Blok A', 0, 0, pw, ph, { pieces, horizontal, vertical, rotated }, cw, ch)],
    total: pieces,
    steps: [`Langkah 1: Potong ${horizontal}×${vertical} grid ${rotated ? '(rotasi 90°)' : ''}`]
  }
}

// Guillotine cutting - single cut
export function guillotineSingleCut(
  pw: number,
  ph: number,
  cw: number,
  ch: number,
  optimizationMode: 'fast' | 'maximal'
): Scenario[] {
  const scenarios: Scenario[] = []
  const step = optimizationMode === 'fast' ? 2 : 0.5
  // FIX: Use Math.min(cw, ch) because calculatePiecesInRect already tries both orientations
  const minSize = Math.min(cw, ch)

  // Vertical cuts
  for (let x = minSize; x <= pw - minSize; x += step) {
    const leftWidth = x
    const rightWidth = pw - x

    const leftResult = calculatePiecesInRect(leftWidth, ph, cw, ch)
    const rightResult = calculatePiecesInRect(rightWidth, ph, cw, ch)

    const total = leftResult.pieces + rightResult.pieces

    if (total > 0) {
      scenarios.push({
        strategy: `Guillotine Vertikal (potong di ${x.toFixed(1)}cm)`,
        type: 'block-cut',
        cutPosition: x,
        cutPositionY: undefined,
        blocks: [
          ...(leftResult.pieces > 0 ? [makeBlock('Blok A', 0, 0, leftWidth, ph, leftResult, cw, ch)] : []),
          ...(rightResult.pieces > 0 ? [makeBlock('Blok B', x, 0, rightWidth, ph, rightResult, cw, ch)] : []),
        ],
        total,
        steps: [
          `Langkah 1: Potong vertikal pada posisi ${x.toFixed(1)}cm dari kiri`,
          `Langkah 2: Bagian kiri (${leftWidth.toFixed(1)}×${ph}cm) → ${leftResult.pieces} potongan ${leftResult.rotated ? '(rotasi 90°)' : ''}`,
          `Langkah 3: Bagian kanan (${rightWidth.toFixed(1)}×${ph}cm) → ${rightResult.pieces} potongan ${rightResult.rotated ? '(rotasi 90°)' : ''}`
        ]
      })
    }
  }

  // Horizontal cuts
  for (let y = minSize; y <= ph - minSize; y += step) {
    const bottomHeight = y
    const topHeight = ph - y

    const bottomResult = calculatePiecesInRect(pw, bottomHeight, cw, ch)
    const topResult = calculatePiecesInRect(pw, topHeight, cw, ch)

    const total = bottomResult.pieces + topResult.pieces

    if (total > 0) {
      scenarios.push({
        strategy: `Guillotine Horizontal (potong di ${y.toFixed(1)}cm)`,
        type: 'block-cut',
        cutPosition: undefined,
        cutPositionY: y,
        blocks: [
          ...(bottomResult.pieces > 0 ? [makeBlock('Blok A', 0, 0, pw, bottomHeight, bottomResult, cw, ch)] : []),
          ...(topResult.pieces > 0 ? [makeBlock('Blok B', 0, y, pw, topHeight, topResult, cw, ch)] : []),
        ],
        total,
        steps: [
          `Langkah 1: Potong horizontal pada posisi ${y.toFixed(1)}cm dari bawah`,
          `Langkah 2: Bagian bawah (${pw}×${bottomHeight.toFixed(1)}cm) → ${bottomResult.pieces} potongan ${bottomResult.rotated ? '(rotasi 90°)' : ''}`,
          `Langkah 3: Bagian atas (${pw}×${topHeight.toFixed(1)}cm) → ${topResult.pieces} potongan ${topResult.rotated ? '(rotasi 90°)' : ''}`
        ]
      })
    }
  }

  return scenarios
}

// Two-stage guillotine cutting (FIXED: now actually uses both dimensions)
export function twoStageGuillotine(
  pw: number,
  ph: number,
  cw: number,
  ch: number,
  optimizationMode: 'fast' | 'maximal'
): Scenario[] {
  const scenarios: Scenario[] = []
  const step = optimizationMode === 'fast' ? 5 : 1
  const minSize = Math.min(cw, ch)

  // V→H: First cut vertical, then horizontal on one or both sections
  for (let x = minSize; x <= pw - minSize; x += step) {
    const leftW = x
    const rightW = pw - x

    for (let y = minSize; y <= ph - minSize; y += step) {
      // Split left section horizontally: bottom-left + top-left
      const blResult = calculatePiecesInRect(leftW, y, cw, ch)
      const tlResult = calculatePiecesInRect(leftW, ph - y, cw, ch)
      // Split right section horizontally: bottom-right + top-right
      const brResult = calculatePiecesInRect(rightW, y, cw, ch)
      const trResult = calculatePiecesInRect(rightW, ph - y, cw, ch)

      // Option A: Cut left vertically, then both halves horizontally (4 blocks)
      const totalA = blResult.pieces + tlResult.pieces + brResult.pieces + trResult.pieces
      if (totalA > 0) {
        const blocks: Block[] = []
        if (blResult.pieces > 0) blocks.push(makeBlock('Blok A', 0, 0, leftW, y, blResult, cw, ch))
        if (tlResult.pieces > 0) blocks.push(makeBlock('Blok B', 0, y, leftW, ph - y, tlResult, cw, ch))
        if (brResult.pieces > 0) blocks.push(makeBlock('Blok C', x, 0, rightW, y, brResult, cw, ch))
        if (trResult.pieces > 0) blocks.push(makeBlock('Blok D', x, y, rightW, ph - y, trResult, cw, ch))
        scenarios.push({
          strategy: `2-Stage V-H (${x.toFixed(1)}cm, ${y.toFixed(1)}cm)`,
          type: 'block-cut',
          cutPosition: x,
          cutPositionY: y,
          blocks,
          total: totalA,
          steps: [
            `Langkah 1: Potong vertikal pada posisi ${x.toFixed(1)}cm`,
            `Langkah 2: Potong horizontal pada posisi ${y.toFixed(1)}cm`,
            ...blocks.map(b => `→ ${b.name}: ${b.pieces} potongan ${b.rotated ? '(rotasi 90°)' : ''}`)
          ]
        })
      }

      // Option B: Cut vertical first, then ONLY horizontal on left side (3 blocks)
      const rightFull = calculatePiecesInRect(rightW, ph, cw, ch)
      const totalB = blResult.pieces + tlResult.pieces + rightFull.pieces
      if (totalB > 0 && totalB !== totalA) {
        const blocks: Block[] = []
        if (blResult.pieces > 0) blocks.push(makeBlock('Blok A', 0, 0, leftW, y, blResult, cw, ch))
        if (tlResult.pieces > 0) blocks.push(makeBlock('Blok B', 0, y, leftW, ph - y, tlResult, cw, ch))
        if (rightFull.pieces > 0) blocks.push(makeBlock('Blok C', x, 0, rightW, ph, rightFull, cw, ch))
        scenarios.push({
          strategy: `2-Stage V-H 3-Block (${x.toFixed(1)}cm, ${y.toFixed(1)}cm)`,
          type: 'block-cut',
          cutPosition: x,
          cutPositionY: y,
          blocks,
          total: totalB,
          steps: [
            `Langkah 1: Potong vertikal pada posisi ${x.toFixed(1)}cm`,
            `Langkah 2: Potong bagian kiri horizontal pada posisi ${y.toFixed(1)}cm`,
            ...blocks.map(b => `→ ${b.name}: ${b.pieces} potongan ${b.rotated ? '(rotasi 90°)' : ''}`)
          ]
        })
      }

      // Option C: Cut vertical first, then ONLY horizontal on right side (3 blocks)
      const leftFull = calculatePiecesInRect(leftW, ph, cw, ch)
      const totalC = leftFull.pieces + brResult.pieces + trResult.pieces
      if (totalC > 0 && totalC !== totalA) {
        const blocks: Block[] = []
        if (leftFull.pieces > 0) blocks.push(makeBlock('Blok A', 0, 0, leftW, ph, leftFull, cw, ch))
        if (brResult.pieces > 0) blocks.push(makeBlock('Blok B', x, 0, rightW, y, brResult, cw, ch))
        if (trResult.pieces > 0) blocks.push(makeBlock('Blok C', x, y, rightW, ph - y, trResult, cw, ch))
        scenarios.push({
          strategy: `2-Stage V-H 3-Block Alt (${x.toFixed(1)}cm, ${y.toFixed(1)}cm)`,
          type: 'block-cut',
          cutPosition: x,
          cutPositionY: y,
          blocks,
          total: totalC,
          steps: [
            `Langkah 1: Potong vertikal pada posisi ${x.toFixed(1)}cm`,
            `Langkah 2: Potong bagian kanan horizontal pada posisi ${y.toFixed(1)}cm`,
            ...blocks.map(b => `→ ${b.name}: ${b.pieces} potongan ${b.rotated ? '(rotasi 90°)' : ''}`)
          ]
        })
      }
    }
  }

  return scenarios
}

// Hybrid layout - grid + rotated pieces in waste
export function hybridLayout(pw: number, ph: number, cw: number, ch: number): Scenario[] {
  const scenarios: Scenario[] = []

  // Normal grid first
  const normalResult = normalGridLayout(pw, ph, cw, ch)
  const mainBlock = normalResult.blocks[0]

  // Check if there's waste area that can fit rotated pieces
  const wasteWidth = pw - mainBlock.usedWidth
  const wasteHeight = ph - mainBlock.usedHeight

  if (wasteWidth > 0 || wasteHeight > 0) {
    // Try to fit rotated pieces in waste areas
    if (wasteWidth >= Math.min(cw, ch)) {
      const rotatedInWaste = calculatePiecesInRect(wasteWidth, ph, cw, ch)
      if (rotatedInWaste.pieces > 0 && rotatedInWaste.rotated !== mainBlock.rotated) {
        scenarios.push({
          strategy: 'Hybrid (Grid + Sisa Rotasi)',
          type: 'block-cut',
          cutPosition: mainBlock.usedWidth,
          cutPositionY: undefined,
          blocks: [
            mainBlock,
            makeBlock('Blok B', mainBlock.usedWidth, 0, wasteWidth, ph, rotatedInWaste, cw, ch)
          ],
          total: mainBlock.pieces + rotatedInWaste.pieces,
          steps: [
            `Langkah 1: Potong grid normal ${mainBlock.horizontal}×${mainBlock.vertical}`,
            `Langkah 2: Gunakan sisa (${wasteWidth.toFixed(1)}×${ph}cm) untuk ${rotatedInWaste.pieces} potongan rotasi`
          ]
        })
      }
    }

    if (wasteHeight >= Math.min(cw, ch)) {
      const rotatedInWaste = calculatePiecesInRect(pw, wasteHeight, cw, ch)
      if (rotatedInWaste.pieces > 0 && rotatedInWaste.rotated !== mainBlock.rotated) {
        scenarios.push({
          strategy: 'Hybrid (Grid + Sisa Rotasi Vertikal)',
          type: 'block-cut',
          cutPosition: undefined,
          cutPositionY: mainBlock.usedHeight,
          blocks: [
            mainBlock,
            makeBlock('Blok B', 0, mainBlock.usedHeight, pw, wasteHeight, rotatedInWaste, cw, ch)
          ],
          total: mainBlock.pieces + rotatedInWaste.pieces,
          steps: [
            `Langkah 1: Potong grid normal ${mainBlock.horizontal}×${mainBlock.vertical}`,
            `Langkah 2: Gunakan sisa (${pw}×${wasteHeight.toFixed(1)}cm) untuk ${rotatedInWaste.pieces} potongan rotasi`
          ]
        })
      }
    }
  }

  return scenarios
}

// NEW: Belah 2 - Split paper in half first, then cut each half into pieces
// This is a common printing industry technique
export function splitInHalf(pw: number, ph: number, cw: number, ch: number): Scenario[] {
  const scenarios: Scenario[] = []

  // --- Belah 2 Vertikal: Split width in half ---
  const halfW = pw / 2
  if (halfW >= Math.min(cw, ch)) {
    const leftResult = calculatePiecesInRect(halfW, ph, cw, ch)
    const rightResult = calculatePiecesInRect(halfW, ph, cw, ch)
    const total = leftResult.pieces + rightResult.pieces

    if (total > 0) {
      const blocks: Block[] = []
      if (leftResult.pieces > 0) blocks.push(makeBlock('Blok A', 0, 0, halfW, ph, leftResult, cw, ch))
      if (rightResult.pieces > 0) blocks.push(makeBlock('Blok B', halfW, 0, halfW, ph, rightResult, cw, ch))

      scenarios.push({
        strategy: 'Belah 2 Vertikal',
        type: 'split-half',
        cutPosition: halfW,
        cutPositionY: undefined,
        blocks,
        total,
        steps: [
          `Langkah 1: Belah kertas menjadi 2 bagian sama besar vertikal (masing-masing ${halfW.toFixed(1)}×${ph}cm)`,
          `Langkah 2: Setiap bagian dipotong ${leftResult.horizontal}×${leftResult.vertical} = ${leftResult.pieces} potongan ${leftResult.rotated ? '(rotasi 90°)' : ''}`,
          `Langkah 3: Total = ${total} potongan per lembar`
        ]
      })
    }
  }

  // --- Belah 2 Horizontal: Split height in half ---
  const halfH = ph / 2
  if (halfH >= Math.min(cw, ch)) {
    const bottomResult = calculatePiecesInRect(pw, halfH, cw, ch)
    const topResult = calculatePiecesInRect(pw, halfH, cw, ch)
    const total = bottomResult.pieces + topResult.pieces

    if (total > 0) {
      const blocks: Block[] = []
      if (bottomResult.pieces > 0) blocks.push(makeBlock('Blok A', 0, 0, pw, halfH, bottomResult, cw, ch))
      if (topResult.pieces > 0) blocks.push(makeBlock('Blok B', 0, halfH, pw, halfH, topResult, cw, ch))

      scenarios.push({
        strategy: 'Belah 2 Horizontal',
        type: 'split-half',
        cutPosition: undefined,
        cutPositionY: halfH,
        blocks,
        total,
        steps: [
          `Langkah 1: Belah kertas menjadi 2 bagian sama besar horizontal (masing-masing ${pw}×${halfH.toFixed(1)}cm)`,
          `Langkah 2: Setiap bagian dipotong ${bottomResult.horizontal}×${bottomResult.vertical} = ${bottomResult.pieces} potongan ${bottomResult.rotated ? '(rotasi 90°)' : ''}`,
          `Langkah 3: Total = ${total} potongan per lembar`
        ]
      })
    }
  }

  // --- Belah 2 Vertikal dengan rotasi berbeda per bagian ---
  // Left half: try normal; Right half: try forced rotation (and vice versa)
  if (halfW >= Math.min(cw, ch)) {
    // Left normal, right rotated
    const leftNormal = calculatePiecesInRect(halfW, ph, cw, ch)
    // Force rotated for right half
    const rightForcedNormal = Math.floor(halfW / cw) * Math.floor(ph / ch)
    const rightForcedRotated = Math.floor(halfW / ch) * Math.floor(ph / cw)
    const rightResult = rightForcedNormal >= rightForcedRotated
      ? { pieces: rightForcedNormal, horizontal: Math.floor(halfW / cw), vertical: Math.floor(ph / ch), rotated: false }
      : { pieces: rightForcedRotated, horizontal: Math.floor(halfW / ch), vertical: Math.floor(ph / cw), rotated: true }
    
    if (leftNormal.pieces > 0 && rightResult.pieces > 0) {
      const total = leftNormal.pieces + rightResult.pieces
      // Only add if different from the symmetric case
      if (leftNormal.pieces !== rightResult.pieces || leftNormal.rotated !== rightResult.rotated) {
        const blocks: Block[] = []
        blocks.push(makeBlock('Blok A', 0, 0, halfW, ph, leftNormal, cw, ch))
        blocks.push(makeBlock('Blok B', halfW, 0, halfW, ph, rightResult, cw, ch))
        scenarios.push({
          strategy: 'Belah 2 Vertikal (Campuran Rotasi)',
          type: 'split-half',
          cutPosition: halfW,
          cutPositionY: undefined,
          blocks,
          total,
          steps: [
            `Langkah 1: Belah kertas menjadi 2 bagian vertikal (masing-masing ${halfW.toFixed(1)}×${ph}cm)`,
            `Langkah 2: Bagian kiri: ${leftNormal.horizontal}×${leftNormal.vertical} = ${leftNormal.pieces} potongan ${leftNormal.rotated ? '(rotasi 90°)' : ''}`,
            `Langkah 3: Bagian kanan: ${rightResult.horizontal}×${rightResult.vertical} = ${rightResult.pieces} potongan ${rightResult.rotated ? '(rotasi 90°)' : ''}`,
            `Langkah 4: Total = ${total} potongan per lembar`
          ]
        })
      }
    }
  }

  if (halfH >= Math.min(cw, ch)) {
    const topNormal = calculatePiecesInRect(pw, halfH, cw, ch)
    const bottomForcedNormal = Math.floor(pw / cw) * Math.floor(halfH / ch)
    const bottomForcedRotated = Math.floor(pw / ch) * Math.floor(halfH / cw)
    const bottomResult = bottomForcedNormal >= bottomForcedRotated
      ? { pieces: bottomForcedNormal, horizontal: Math.floor(pw / cw), vertical: Math.floor(halfH / ch), rotated: false }
      : { pieces: bottomForcedRotated, horizontal: Math.floor(pw / ch), vertical: Math.floor(halfH / cw), rotated: true }

    if (topNormal.pieces > 0 && bottomResult.pieces > 0) {
      const total = topNormal.pieces + bottomResult.pieces
      if (topNormal.pieces !== bottomResult.pieces || topNormal.rotated !== bottomResult.rotated) {
        const blocks: Block[] = []
        blocks.push(makeBlock('Blok A', 0, 0, pw, halfH, topNormal, cw, ch))
        blocks.push(makeBlock('Blok B', 0, halfH, pw, halfH, bottomResult, cw, ch))
        scenarios.push({
          strategy: 'Belah 2 Horizontal (Campuran Rotasi)',
          type: 'split-half',
          cutPosition: undefined,
          cutPositionY: halfH,
          blocks,
          total,
          steps: [
            `Langkah 1: Belah kertas menjadi 2 bagian horizontal (masing-masing ${pw}×${halfH.toFixed(1)}cm)`,
            `Langkah 2: Bagian bawah: ${topNormal.horizontal}×${topNormal.vertical} = ${topNormal.pieces} potongan ${topNormal.rotated ? '(rotasi 90°)' : ''}`,
            `Langkah 3: Bagian atas: ${bottomResult.horizontal}×${bottomResult.vertical} = ${bottomResult.pieces} potongan ${bottomResult.rotated ? '(rotasi 90°)' : ''}`,
            `Langkah 4: Total = ${total} potongan per lembar`
          ]
        })
      }
    }
  }

  return scenarios
}

// NEW: Belah 4 - Split paper into 4 quadrants (2×2), then cut each quadrant
export function splitInFour(pw: number, ph: number, cw: number, ch: number): Scenario[] {
  const scenarios: Scenario[] = []

  const halfW = pw / 2
  const halfH = ph / 2

  if (halfW < Math.min(cw, ch) || halfH < Math.min(cw, ch)) return scenarios

  // Each quadrant: halfW × halfH
  const qResult = calculatePiecesInRect(halfW, halfH, cw, ch)
  const total = qResult.pieces * 4

  if (total > 0) {
    scenarios.push({
      strategy: 'Belah 4 (2×2)',
      type: 'split-four',
      cutPosition: halfW,
      cutPositionY: halfH,
      blocks: [
        makeBlock('Blok A', 0, 0, halfW, halfH, qResult, cw, ch),
        makeBlock('Blok B', halfW, 0, halfW, halfH, qResult, cw, ch),
        makeBlock('Blok C', 0, halfH, halfW, halfH, qResult, cw, ch),
        makeBlock('Blok D', halfW, halfH, halfW, halfH, qResult, cw, ch),
      ],
      total,
      steps: [
        `Langkah 1: Belah kertas jadi 2 bagian vertikal (masing-masing ${halfW.toFixed(1)}×${ph}cm)`,
        `Langkah 2: Masing-masing bagian dibelah horizontal jadi 2 (masing-masing ${halfW.toFixed(1)}×${halfH.toFixed(1)}cm)`,
        `Langkah 3: Setiap kuadran dipotong ${qResult.horizontal}×${qResult.vertical} = ${qResult.pieces} potongan ${qResult.rotated ? '(rotasi 90°)' : ''}`,
        `Langkah 4: Total = 4 × ${qResult.pieces} = ${total} potongan per lembar`
      ]
    })
  }

  // Belah 4 dengan rotasi berbeda per baris
  // Bottom row: normal, Top row: try different orientation
  const bottomQ = calculatePiecesInRect(halfW, halfH, cw, ch)
  const topQNormal = Math.floor(halfW / cw) * Math.floor(halfH / ch)
  const topQRotated = Math.floor(halfW / ch) * Math.floor(halfH / cw)
  const topQ = topQNormal >= topQRotated
    ? { pieces: topQNormal, horizontal: Math.floor(halfW / cw), vertical: Math.floor(halfH / ch), rotated: false }
    : { pieces: topQRotated, horizontal: Math.floor(halfW / ch), vertical: Math.floor(halfH / cw), rotated: true }

  if (bottomQ.pieces > 0 && topQ.pieces > 0) {
    const totalMixed = (bottomQ.pieces + topQ.pieces) * 2
    if (totalMixed > total && bottomQ.rotated !== topQ.rotated) {
      scenarios.push({
        strategy: 'Belah 4 (2×2 Campuran Rotasi)',
        type: 'split-four',
        cutPosition: halfW,
        cutPositionY: halfH,
        blocks: [
          makeBlock('Blok A', 0, 0, halfW, halfH, bottomQ, cw, ch),
          makeBlock('Blok B', halfW, 0, halfW, halfH, bottomQ, cw, ch),
          makeBlock('Blok C', 0, halfH, halfW, halfH, topQ, cw, ch),
          makeBlock('Blok D', halfW, halfH, halfW, halfH, topQ, cw, ch),
        ],
        total: totalMixed,
        steps: [
          `Langkah 1: Belah kertas jadi 2 bagian vertikal (masing-masing ${halfW.toFixed(1)}×${ph}cm)`,
          `Langkah 2: Belah horizontal jadi 4 kuadran (masing-masing ${halfW.toFixed(1)}×${halfH.toFixed(1)}cm)`,
          `Langkah 3: Baris bawah: ${bottomQ.pieces} potongan ${bottomQ.rotated ? '(rotasi 90°)' : ''} per kuadran`,
          `Langkah 4: Baris atas: ${topQ.pieces} potongan ${topQ.rotated ? '(rotasi 90°)' : ''} per kuadran`,
          `Langkah 5: Total = ${(bottomQ.pieces + topQ.pieces) * 2} potongan per lembar`
        ]
      })
    }
  }

  return scenarios
}

export interface CalculateCutsParams {
  paperWidth: number
  paperHeight: number
  cutWidth: number
  cutHeight: number
  quantity: number
  pricePerSheet: number
  optimizationMode: 'fast' | 'maximal'
  customerName: string
  paperMaterial: string
  grammage: number
}

// Main calculation function - standalone, no React dependencies
export function calculateCuts(params: CalculateCutsParams): CuttingResult {
  const { paperWidth: pw, paperHeight: ph, cutWidth: cw, cutHeight: ch, quantity: qty, pricePerSheet: price, optimizationMode, customerName, paperMaterial, grammage } = params

  const scenarios: Scenario[] = []

  // 1. Normal grid layout (always try)
  scenarios.push(normalGridLayout(pw, ph, cw, ch))

  // 2. Belah 2 - Split in half first (always try - fast and common technique)
  scenarios.push(...splitInHalf(pw, ph, cw, ch))

  // 3. Belah 4 - Split into 4 quadrants (always try)
  scenarios.push(...splitInFour(pw, ph, cw, ch))

  // 4. Guillotine single cut
  if (optimizationMode === 'maximal') {
    scenarios.push(...guillotineSingleCut(pw, ph, cw, ch, optimizationMode))
  } else {
    const fastScenarios = guillotineSingleCut(pw, ph, cw, ch, optimizationMode)
    scenarios.push(...fastScenarios.slice(0, Math.min(20, fastScenarios.length)))
  }

  // 5. Hybrid layout (always try - can improve results significantly)
  scenarios.push(...hybridLayout(pw, ph, cw, ch))

  // 6. Two-stage guillotine (expensive - only in maximal mode, or limited in fast mode)
  if (optimizationMode === 'maximal') {
    scenarios.push(...twoStageGuillotine(pw, ph, cw, ch, optimizationMode))
  } else {
    const fastScenarios = twoStageGuillotine(pw, ph, cw, ch, optimizationMode)
    scenarios.push(...fastScenarios.slice(0, Math.min(15, fastScenarios.length)))
  }

  // Find best scenario (prioritize: 1. max pieces, 2. min waste)
  let bestScenario = scenarios[0]
  for (const scenario of scenarios) {
    if (scenario.total > bestScenario.total) {
      bestScenario = scenario
    } else if (scenario.total === bestScenario.total) {
      // Calculate waste for tie-breaking
      const currentWaste = scenario.blocks.reduce((sum, b) =>
        sum + (b.wasteWidth * b.height + b.width * b.wasteHeight - b.wasteWidth * b.wasteHeight), 0)
      const bestWaste = bestScenario.blocks.reduce((sum, b) =>
        sum + (b.wasteWidth * b.height + b.width * b.wasteHeight - b.wasteWidth * b.wasteHeight), 0)

      if (currentWaste < bestWaste) {
        bestScenario = scenario
      }
    }
  }

  // Calculate total waste and efficiency
  const totalUsedArea = bestScenario.blocks.reduce((sum, b) =>
    sum + (b.usedWidth * b.usedHeight), 0)
  const totalPaperArea = pw * ph
  const totalWasteArea = totalPaperArea - totalUsedArea
  const efficiency = ((totalUsedArea / totalPaperArea) * 100)

  // Calculate sheets needed and price
  const sheetsNeeded = qty > 0 ? Math.ceil(qty / bestScenario.total) : 1
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
    totalWasteArea,
    efficiency,
    steps: bestScenario.steps,
    strategy: bestScenario.strategy
  }
}
