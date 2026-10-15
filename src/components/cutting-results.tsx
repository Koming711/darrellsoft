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
}: {
  results: CuttingResult
  maxHeight?: string
  selectedWasteId?: string | null
  onSelectWaste?: (id: string | null) => void
  showLegend?: boolean
}) {
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
          // label muat bila area cukup besar; sisa sempit → label diputar
          const horizontalLabel = rw >= 66 && rh >= 22
          const verticalLabel = !horizontalLabel && rh >= 66 && rw >= 22
          const showFull = horizontalLabel || verticalLabel
          const sizeText = `${w.width} × ${w.height} cm`
          const label = `${code} · ${sizeText}`
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
                  fontSize={rw > 150 ? 11 : 9} fontWeight="600" fill="#1e3a5f" style={{ pointerEvents: 'none' }}>
                  {label}
                </text>
              )}
              {showFull && verticalLabel && (
                <text x={rx + rw / 2} y={ry + rh / 2} textAnchor="middle" dominantBaseline="middle"
                  fontSize={rh > 150 ? 11 : 9} fontWeight="600" fill="#1e3a5f"
                  transform={`rotate(-90 ${rx + rw / 2} ${ry + rh / 2})`} style={{ pointerEvents: 'none' }}>
                  {label}
                </text>
              )}
              {!showFull && rw >= 13 && rh >= 13 && (
                <text x={rx + rw / 2} y={ry + rh / 2} textAnchor="middle" dominantBaseline="middle"
                  fontSize="10" fontWeight="700" fill={w.status === 'reusable' ? '#1d4ed8' : w.status === 'small' ? '#c2410c' : '#64748b'}
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
                elements.push(
                  <g key={`p-${blockIdx}-${i}-${j}`}>
                    <rect
                      x={px + 0.8} y={py + 0.8} width={pieceW - 1.6} height={pieceH - 1.6}
                      fill={`url(#${gId})`} stroke={sColor} strokeWidth="1.4" rx="1"
                    />
                    {canShowNum && (
                      <text x={px + pieceW / 2} y={py + pieceH / 2 - (canShowSize ? 6 : 0)}
                        textAnchor="middle" dominantBaseline="middle"
                        fontSize={Math.min(15, Math.max(8, Math.min(pieceW, pieceH) / 3.4))}
                        fontWeight="700" fill="#166534">
                        {num}
                      </text>
                    )}
                    {canShowSize && (
                      <text x={px + pieceW / 2} y={py + pieceH / 2 + 11}
                        textAnchor="middle" dominantBaseline="middle"
                        fontSize="8.5" fontWeight="500" fill="#15803d">
                        {block.pieceWidth} × {block.pieceHeight}
                      </text>
                    )}
                    {canShowRot && (
                      <text x={px + pieceW - 9} y={py + 9} textAnchor="middle" dominantBaseline="middle"
                        fontSize="9" fontWeight="700" fill="#b45309">
                        ⟳
                      </text>
                    )}
                  </g>
                )
              }
            }

            // Tag rotasi di sudut blok (untuk blok dgn potongan kecil)
            if (block.rotated && pieceW < 40) {
              elements.push(
                <g key={`rot-${blockIdx}`}>
                  <rect x={blockX + 2} y={blockY + 2} width={30} height={14} rx="3" fill="#f59e0b" opacity="0.92" />
                  <text x={blockX + 17} y={blockY + 9.5} textAnchor="middle" dominantBaseline="middle"
                    fontSize="9" fontWeight="700" fill="#fff">90°</text>
                </g>
              )
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
