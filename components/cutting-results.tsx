'use client'

import type { CuttingResult, Block } from '@/lib/cutting-engine'

// Shared cutting diagram component - supports 1-4+ blocks
function CuttingDiagram({ results, maxHeight }: { results: CuttingResult; maxHeight?: string }) {
  const scale = 5.94
  const pw = results.paperWidth
  const ph = results.paperHeight

  const gradientIds = [
    'cutGrad1', 'cutGrad2', 'cutGrad3', 'cutGrad4', 'cutGrad5',
  ]
  const strokeColors = ['#93c5fd', '#6ee7b7', '#fcd34d', '#fca5a5', '#c4b5fd']

  return (
    <svg
      viewBox={`0 0 ${pw * scale} ${ph * scale}`}
      className="w-full border border-slate-200 bg-gradient-to-br from-white to-slate-50 shadow-lg"
      style={{ maxHeight: maxHeight || '55vh', maxWidth: '100%', height: 'auto' }}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="cutGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#dbeafe" /><stop offset="100%" stopColor="#bfdbfe" />
        </linearGradient>
        <linearGradient id="cutGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#d1fae5" /><stop offset="100%" stopColor="#a7f3d0" />
        </linearGradient>
        <linearGradient id="cutGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef3c7" /><stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
        <linearGradient id="cutGrad4" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fecaca" /><stop offset="100%" stopColor="#fca5a5" />
        </linearGradient>
        <linearGradient id="cutGrad5" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e9d5ff" /><stop offset="100%" stopColor="#d8b4fe" />
        </linearGradient>
        <pattern id="cutGrid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
        </pattern>
        <filter id="cutShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#94a3b8" floodOpacity="0.2" />
        </filter>
      </defs>

      {/* Background grid */}
      <rect x="0" y="0" width={pw * scale} height={ph * scale} fill="url(#cutGrid)" />
      {/* Paper border */}
      <rect x="0" y="0" width={pw * scale} height={ph * scale} fill="none" stroke="#94a3b8" strokeWidth="4" rx="2" />

      {/* Cut lines - dashed red */}
      {results.blocks.length > 1 && results.cutPosition !== undefined && (
        <line x1={results.cutPosition * scale} y1="0" x2={results.cutPosition * scale} y2={ph * scale}
          stroke="#f87171" strokeWidth="2.5" strokeDasharray="8,4" opacity="0.8" />
      )}
      {results.blocks.length > 1 && results.cutPositionY !== undefined && (
        <line x1="0" y1={results.cutPositionY * scale} x2={pw * scale} y2={results.cutPositionY * scale}
          stroke="#f87171" strokeWidth="2.5" strokeDasharray="8,4" opacity="0.8" />
      )}

      {/* Waste areas - per block, within section boundaries */}
      {results.blocks.map((block: Block, blockIdx: number) => {
        const wasteRects: React.JSX.Element[] = []

        // Right waste: within the block's section (not extending to paper edge)
        if (block.wasteWidth > 0.01) {
          wasteRects.push(
            <rect key={`wr-${blockIdx}`}
              x={(block.x + block.usedWidth) * scale}
              y={block.y * scale}
              width={block.wasteWidth * scale}
              height={block.usedHeight * scale}
              fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3,2" opacity="0.5" rx="1" />
          )
          // Bottom-right corner waste
          if (block.wasteHeight > 0.01) {
            wasteRects.push(
              <rect key={`wbr-${blockIdx}`}
                x={(block.x + block.usedWidth) * scale}
                y={(block.y + block.usedHeight) * scale}
                width={block.wasteWidth * scale}
                height={block.wasteHeight * scale}
                fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3,2" opacity="0.5" rx="1" />
            )
          }
        }

        // Bottom waste: below the block's used area, within section
        if (block.wasteHeight > 0.01) {
          wasteRects.push(
            <rect key={`wb-${blockIdx}`}
              x={block.x * scale}
              y={(block.y + block.usedHeight) * scale}
              width={block.usedWidth * scale}
              height={block.wasteHeight * scale}
              fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3,2" opacity="0.5" rx="1" />
          )
        }

        return wasteRects
      })}

      {/* Piece blocks with gradients */}
      {results.blocks.map((block: Block, blockIdx: number) => {
        const blockX = block.x * scale
        const blockY = block.y * scale
        const pieceW = block.pieceWidth * scale
        const pieceH = block.pieceHeight * scale
        const gId = gradientIds[blockIdx % gradientIds.length]
        const sColor = strokeColors[blockIdx % strokeColors.length]

        let pieceNumber = 1
        const pieces: React.JSX.Element[] = []
        for (let i = 0; i < block.horizontal; i++) {
          for (let j = 0; j < block.vertical; j++) {
            pieces.push(
              <g key={`p-${blockIdx}-${i}-${j}`}>
                <rect
                  x={blockX + i * pieceW + 1}
                  y={blockY + j * pieceH + 1}
                  width={pieceW - 3}
                  height={pieceH - 3}
                  fill={`url(#${gId})`}
                  stroke={sColor}
                  strokeWidth="1.5"
                  filter="url(#cutShadow)"
                />
                <circle
                  cx={blockX + i * pieceW + pieceW / 2}
                  cy={blockY + j * pieceH + pieceH / 2}
                  r={Math.min(pieceW, pieceH) / 4}
                  fill="white"
                  opacity="0.9"
                />
                <text
                  x={blockX + i * pieceW + pieceW / 2}
                  y={blockY + j * pieceH + pieceH / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="14"
                  fontWeight="500"
                  fill="#64748b"
                >
                  {pieceNumber++}
                </text>
              </g>
            )
          }
        }

        return <g key={`block-${blockIdx}`}>{pieces}</g>
      })}
    </svg>
  )
}

// Export for reuse in page.tsx preview
export { CuttingDiagram }
