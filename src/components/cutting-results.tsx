'use client'

import { useMemo } from 'react'
import type { CuttingResult, Block } from '@/lib/cutting-engine'
import { computeWasteAreas, type WasteArea } from '@/lib/cutting-optimizer'

// ============================================================================
// CuttingDiagram — gambar pola potong + seluruh area sisa (geometri aktual)
// ============================================================================
// Warna (permintaan spec):
//   Hijau          → area potongan yang digunakan
//   Biru           → sisa yang masih berpotensi digunakan kembali
//   Oranye         → sisa kecil (belum tentu dapat digunakan)
//   Abu-abu        → limbah
//   Merah putus2   → jalur pemotongan (garis kontras)
// Fitur:
//   • Nomor potongan berurutan lintas blok + ukuran lebar×tinggi tiap potongan
//     (tampil bila ruang cukup; potongan kecil cukup nomor — ukuran lengkap
//     ada di legenda blok/tabel di bawah gambar)
//   • Penanda rotasi 90° pada blok yang diputar
//   • Label setiap area sisa: "Sisa A — 14 × 86 cm" (bila muat; bila tidak,
//     hanya kode "A" + ukuran lengkap di tabel detail sisa)
//   • Highlight dua arah dgn tabel sisa (selectedWasteId / onSelectWaste)
//   • Kompatibel data lama: bila results.wasteAreas tidak ada, sisa dihitung
//     ulang secara geometri dari blok.
//   • textScale: pembesaran tulisan di dalam gambar (default 1). Font naik
//     maksimal textScale× lipat dan menyusut otomatis (shrink-to-fit) bila
//     ruang area tidak cukup, sehingga teks tidak perlu tumpang tindih.
//   • Ukuran teks akhir dikurangi 2pt (permintaan) dengan batas bawah = ukuran
//     pada textScale 1, sehingga halaman lain tidak ikut berubah.
//   • Warna tulisan dibedakan arah: label sisa horizontal = navy,
//     label sisa vertikal (diputar 90°) = ungu.
// ============================================================================

const SCALE = 5.94

function normalizeWasteAreas(results: CuttingResult): WasteArea[] {
  if (Array.isArray(results.wasteAreas) && results.wasteAreas.length > 0) return results.wasteAreas
  try {
    return computeWasteAreas(results.paperWidth, results.paperHeight, results.blocks || [], results.cutWidth, results.cutHeight)
  } catch {
    return []
  }
}

function CuttingDiagram({
  results,
  maxHeight,
  selectedWasteId,
  onSelectWaste,
  showLegend = true,
  textScale = 1,
}: {
  results: CuttingResult
  maxHeight?: string
  selectedWasteId?: string | null
  onSelectWaste?: (id: string | null) => void
  showLegend?: boolean
  textScale?: number
}) {
  const TS = textScale
  // Perkiraan lebar teks SVG (rata2 glyph ±0.62em) utk cek "muat" tanpa overflow
  const estW = (s: string, fs: number) => s.length * fs * 0.62
  // Teks −2pt dari ukuran hasil textScale, batas bawah = ukuran textScale 1 (floor)
  const PT_SHRINK = 2
  const shrinkFont = (fs: number, floor: number) => Math.max(Math.min(fs, floor), fs - PT_SHRINK)
  const pw = results.paperWidth
  const ph = results.paperHeight
  const wasteAreas = useMemo(() => normalizeWasteAreas(results), [results])
  const sheets = results.sheetsNeeded || 1

  const fillColors = ['#dcfce7', '#d1fae5', '#ecfccb', '#d9f99d']
  const strokeColors = ['#16a34a', '#059669', '#65a30d', '#4d7c0f']

  const clickable = typeof onSelectWaste === 'function'

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${pw * SCALE} ${ph * SCALE}`}
        className="w-full border border-slate-300 bg-white shadow-sm rounded"
        style={{ maxHeight: maxHeight || '55vh', maxWidth: '100%', height: 'auto' }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="pkPieceA" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#dcfce7" /><stop offset="100%" stopColor="#86efac" />
          </linearGradient>
          <linearGradient id="pkPieceB" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d1fae5" /><stop offset="100%" stopColor="#6ee7b7" />
          </linearGradient>
          <linearGradient id="pkReuse" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#dbeafe" /><stop offset="100%" stopColor="#93c5fd" />
          </linearGradient>
          <linearGradient id="pkSmall" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffedd5" /><stop offset="100%" stopColor="#fdba74" />
          </linearGradient>
          <linearGradient id="pkWaste" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f8fafc" /><stop offset="100%" stopColor="#e2e8f0" />
          </linearGradient>
          <pattern id="pkGrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#eef2f6" strokeWidth="0.5" />
          </pattern>
        </defs>

        {/* Kertas bahan + grid halus */}
        <rect x="0" y="0" width={pw * SCALE} height={ph * SCALE} fill="url(#pkGrid)" />

        {/* ===== Area sisa (digambar dulu, di bawah potongan) ===== */}
        {wasteAreas.map((w) => {
          const rx = w.x * SCALE
          const ry = w.y * SCALE
          const rw = w.width * SCALE
          const rh = w.height * SCALE
          const fill = w.status === 'reusable' ? 'url(#pkReuse)' : w.status === 'small' ? 'url(#pkSmall)' : 'url(#pkWaste)'
          const stroke = w.status === 'reusable' ? '#3b82f6' : w.status === 'small' ? '#f97316' : '#94a3b8'
          const isSelected = !!selectedWasteId && selectedWasteId === w.id
          const dimmed = !!selectedWasteId && !isSelected
          const code = w.label.replace('Sisa ', '')
          const sizeText = `${w.width} × ${w.height} cm`
          const label = `${code} · ${sizeText}`
          // Label lengkap: font maks textScale× lipat, menyusut otomatis agar muat
          const baseFull = Math.max(rw, rh) > 150 ? 11 : 9
          const fsFull = shrinkFont(Math.min(baseFull * TS, Math.max(baseFull, (rw - 8) / (label.length * 0.62))), baseFull)
          const fsVert = shrinkFont(Math.min(baseFull * TS, Math.max(baseFull, (rh - 8) / (label.length * 0.62))), baseFull)
          // label muat bila area cukup besar; sisa sempit → label diputar
          const horizontalLabel = estW(label, fsFull) <= rw - 8 && fsFull * 1.25 + 4 <= rh
          const verticalLabel = !horizontalLabel && estW(label, fsVert) <= rh - 8 && fsVert * 1.25 + 4 <= rw
          const showFull = horizontalLabel || verticalLabel
          // Kode pendek (mis. "A") bila label lengkap tidak muat
          const fsCode = shrinkFont(Math.min(10 * TS, Math.max(10, (rw - 6) / (Math.max(code.length, 1) * 0.62))), 10)
          const showCode = !showFull && fsCode >= 10 && fsCode + 4 <= rh && rw >= 13
          return (
            <g
              key={w.id}
              onClick={clickable ? (e) => { e.stopPropagation(); onSelectWaste!(isSelected ? null : w.id) } : undefined}
              style={clickable ? { cursor: 'pointer' } : undefined}
              opacity={dimmed ? 0.45 : 1}
            >
              <rect
                x={rx} y={ry} width={rw} height={rh}
                fill={fill}
                stroke={isSelected ? '#1d4ed8' : stroke}
                strokeWidth={isSelected ? 4 : 1.6}
                strokeDasharray={w.status === 'waste' ? '5,3' : undefined}
                rx="1.5"
              />
              {showFull && horizontalLabel && (
                <text x={rx + rw / 2} y={ry + rh / 2} textAnchor="middle" dominantBaseline="middle"
                  fontSize={fsFull} fontWeight="600" fill="#1e3a5f" style={{ pointerEvents: 'none' }}>
                  {label}
                </text>
              )}
              {showFull && verticalLabel && (
                <text x={rx + rw / 2} y={ry + rh / 2} textAnchor="middle" dominantBaseline="middle"
                  fontSize={fsVert} fontWeight="600" fill="#7e22ce"
                  transform={`rotate(-90 ${rx + rw / 2} ${ry + rh / 2})`} style={{ pointerEvents: 'none' }}>
                  {label}
                </text>
              )}
              {showCode && (
                <text x={rx + rw / 2} y={ry + rh / 2} textAnchor="middle" dominantBaseline="middle"
                  fontSize={fsCode} fontWeight="700" fill={w.status === 'reusable' ? '#1d4ed8' : w.status === 'small' ? '#c2410c' : '#64748b'}
                  style={{ pointerEvents: 'none' }}>
                  {code}
                </text>
              )}
            </g>
          )
        })}

        {/* ===== Garis pemotongan utama antar blok (merah putus-putus) ===== */}
        {results.blocks.length > 1 && results.cutPosition !== undefined && (
          <line x1={results.cutPosition * SCALE} y1="0" x2={results.cutPosition * SCALE} y2={ph * SCALE}
            stroke="#ef4444" strokeWidth="2.5" strokeDasharray="8,4" opacity="0.85" />
        )}
        {results.blocks.length > 1 && results.cutPositionY !== undefined && (
          <line x1="0" y1={results.cutPositionY * SCALE} x2={pw * SCALE} y2={results.cutPositionY * SCALE}
            stroke="#ef4444" strokeWidth="2.5" strokeDasharray="8,4" opacity="0.85" />
        )}

        {/* ===== Potongan (hijau) — nomor & ukuran, berurutan lintas blok ===== */}
        {(() => {
          let pieceNumber = 1
          const elements: React.JSX.Element[] = []
          const blocks = (results.blocks || []).filter((b: Block) => b.pieces > 0)
          blocks.forEach((block: Block, blockIdx: number) => {
            const blockX = block.x * SCALE
            const blockY = block.y * SCALE
            const pieceW = block.pieceWidth * SCALE
            const pieceH = block.pieceHeight * SCALE
            const gId = blockIdx % 2 === 0 ? 'pkPieceA' : 'pkPieceB'
            const sColor = strokeColors[blockIdx % strokeColors.length]

            for (let i = 0; i < block.horizontal; i++) {
              for (let j = 0; j < block.vertical; j++) {
                const px = blockX + i * pieceW
                const py = blockY + j * pieceH
                const num = pieceNumber++
                const canShowSize = pieceW >= 62 && pieceH >= 36
                const canShowNum = pieceW >= 16 && pieceH >= 16
                const canShowRot = block.rotated && pieceW >= 40 && pieceH >= 34
                // Nomor potongan: maks textScale× lipat, menyusut bila potongan kecil
                const numStr = String(num)
                const maxNumFs = Math.min(15, Math.max(8, Math.min(pieceW, pieceH) / 3.4)) * TS
                const fitNumFs = Math.min((pieceW - 5) / (numStr.length * 0.66), (pieceH - 5) / 1.15)
                const numFs = shrinkFont(Math.min(maxNumFs, Math.max(8, fitNumFs)), maxNumFs / TS)
                // Ukuran potongan: maks textScale× lipat, menyesuaikan lebar potongan
                const sizeStr = `${block.pieceWidth} × ${block.pieceHeight}`
                const sizeFs = shrinkFont(Math.min(8.5 * TS, Math.max(8.5, (pieceW - 6) / (sizeStr.length * 0.62))), 8.5)
                const rotFs = shrinkFont(9 * TS, 9)
                elements.push(
                  <g key={`p-${blockIdx}-${i}-${j}`}>
                    <rect
                      x={px + 0.8} y={py + 0.8} width={pieceW - 1.6} height={pieceH - 1.6}
                      fill={`url(#${gId})`} stroke={sColor} strokeWidth="1.4" rx="1"
                    />
                    {canShowNum && (
                      <text x={px + pieceW / 2} y={py + pieceH / 2 - (canShowSize ? 0.4 * numFs : 0)}
                        textAnchor="middle" dominantBaseline="middle"
                        fontSize={numFs}
                        fontWeight="700" fill="#166534">
                        {num}
                      </text>
                    )}
                    {canShowSize && (
                      <text x={px + pieceW / 2} y={py + pieceH / 2 + 0.73 * numFs}
                        textAnchor="middle" dominantBaseline="middle"
                        fontSize={sizeFs} fontWeight="500" fill="#15803d">
                        {sizeStr}
                      </text>
                    )}
                    {canShowRot && (
                      <text x={px + pieceW - rotFs} y={py + rotFs} textAnchor="middle" dominantBaseline="middle"
                        fontSize={rotFs} fontWeight="700" fill="#b45309">
                        ⟳
                      </text>
                    )}
                  </g>
                )
              }
            }

            // Tag rotasi di sudut blok (untuk blok dgn potongan kecil)
            if (block.rotated && pieceW < 40) {
              // Ukuran tag menyesuaikan lebar potongan agar tidak meluber
              const tagFs = shrinkFont(Math.min(9 * TS, (pieceW - 4) / 2.2), 9)
              if (tagFs >= 8) {
                const tagW = Math.min(tagFs * 3.4, pieceW - 4)
                const tagH = tagFs * 1.6
                elements.push(
                  <g key={`rot-${blockIdx}`}>
                    <rect x={blockX + 2} y={blockY + 2} width={tagW} height={tagH} rx={tagFs * 0.33} fill="#f59e0b" opacity="0.92" />
                    <text x={blockX + 2 + tagW / 2} y={blockY + 2 + tagH / 2} textAnchor="middle" dominantBaseline="middle"
                      fontSize={tagFs} fontWeight="700" fill="#fff">90°</text>
                  </g>
                )
              }
            }
          })
          return elements
        })()}

        {/* Batas luar lembar kertas */}
        <rect x="0" y="0" width={pw * SCALE} height={ph * SCALE} fill="none" stroke="#334155" strokeWidth="3" rx="1" />
      </svg>

      {/* Caption multi-lembar */}
      {sheets > 1 && (
        <p className="text-[10px] text-slate-500 mt-1 text-center">
          Pola untuk 1 lembar · diulang <span className="font-semibold">{sheets.toLocaleString('id-ID')}</span> lembar
          {results.totalPieces > 0 && <> · total {(results.totalPieces * sheets).toLocaleString('id-ID')} potongan</>}
        </p>
      )}

      {/* Legenda warna */}
      {showLegend && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-600">
            <span className="w-3 h-3 rounded-sm border border-green-600" style={{ background: 'linear-gradient(135deg,#dcfce7,#86efac)' }} /> Potongan
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-600">
            <span className="w-3 h-3 rounded-sm border border-blue-400" style={{ background: 'linear-gradient(135deg,#dbeafe,#93c5fd)' }} /> Sisa — dapat digunakan kembali
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-600">
            <span className="w-3 h-3 rounded-sm border border-orange-400" style={{ background: 'linear-gradient(135deg,#ffedd5,#fdba74)' }} /> Sisa kecil
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-600">
            <span className="w-3 h-3 rounded-sm border border-slate-400 bg-slate-100" /> Limbah
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-600">
            <span className="inline-block w-4 border-t-2 border-dashed border-red-500" /> Garis potong
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-600">
            <span className="text-amber-600 font-bold">⟳</span> diputar 90°
          </span>
        </div>
      )}
    </div>
  )
}

// Export for reuse in page.tsx preview
export { CuttingDiagram }
