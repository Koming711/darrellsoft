/**
 * Generate PDF using jsPDF directly (no html2canvas dependency)
 * and share it via WhatsApp.
 */

import type { CuttingResult } from '@/lib/cutting-engine'

/**
 * Generate Potong Kertas PDF using jsPDF directly
 * This creates a vector-quality PDF without needing html2canvas
 */
export async function generatePotongKertasPdf(data: {
  results: CuttingResult
  customerName: string
  paperName: string
  jumlahPesanan: string
  berapaMata: string
  setelanKertas: string
  printName: string
}): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const { results, customerName, paperName, jumlahPesanan, berapaMata, setelanKertas, printName } = data
  const r = results

  const pdf = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4',
  })

  const pageW = pdf.internal.pageSize.getWidth()
  const margin = 8
  const contentW = pageW - margin * 2
  let y = margin

  // Helper: add new page if needed
  const checkPage = (needed: number) => {
    const pageH = pdf.internal.pageSize.getHeight()
    if (y + needed > pageH - margin) {
      pdf.addPage()
      y = margin
    }
  }

  // ========== HEADER ==========
  pdf.setFontSize(16)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Potong Kertas', pageW / 2, y + 5, { align: 'center' })

  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(100, 116, 139)
  const infoDate = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  const headerSub = `${customerName || '-'} · ${paperName || 'Custom'} · ${infoDate}`
  pdf.text(headerSub, pageW / 2, y + 10, { align: 'center' })
  y += 14

  // Separator line
  pdf.setDrawColor(226, 232, 240)
  pdf.setLineWidth(0.5)
  pdf.line(margin, y, pageW - margin, y)
  y += 4

  // ========== INFO GRID (3 columns) ==========
  const gridItems = [
    { label: 'Jumlah Pesanan', value: jumlahPesanan || '-', color: [2, 132, 199] as [number, number, number] },
    { label: 'Cetak Berapa Mata', value: berapaMata || '-', color: [124, 58, 237] as [number, number, number] },
    { label: 'Jumlah Cetakan', value: `${r.quantity} lembar`, color: [37, 99, 235] as [number, number, number] },
    { label: 'Insit Kertas', value: setelanKertas || '0', color: [217, 119, 6] as [number, number, number] },
    { label: 'Potongan / Lembar', value: `${r.totalPieces} lembar`, color: [124, 58, 237] as [number, number, number] },
    { label: 'Lembar Kertas', value: `${r.sheetsNeeded} lembar`, color: [5, 150, 105] as [number, number, number] },
    { label: 'Total Harga Kertas', value: `Rp ${Math.round(r.totalPrice).toLocaleString('id-ID')}`, color: [234, 88, 12] as [number, number, number] },
    { label: 'Harga / Lembar', value: `Rp ${Math.round(r.pricePerSheet || 0).toLocaleString('id-ID')}`, color: [225, 29, 72] as [number, number, number] },
    { label: 'Efisiensi Bahan', value: `${Math.round(r.efficiency * 10) / 10}%`, color: [13, 148, 136] as [number, number, number] },
  ]

  const colW = (contentW - 4 * 2) / 3
  const cellH = 14
  const cols = 3

  gridItems.forEach((item, idx) => {
    const col = idx % cols
    const row = Math.floor(idx / cols)
    const cx = margin + col * (colW + 2)
    const cy = y + row * (cellH + 2)

    // Cell background
    pdf.setFillColor(248, 250, 252)
    pdf.setDrawColor(226, 232, 240)
    pdf.roundedRect(cx, cy, colW, cellH, 1.5, 1.5, 'FD')

    // Label
    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(item.color[0], item.color[1], item.color[2])
    pdf.text(item.label, cx + 2.5, cy + 4.5)

    // Value
    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(item.color[0], item.color[1], item.color[2])
    pdf.text(item.value, cx + 2.5, cy + 10.5)
  })

  y += Math.ceil(gridItems.length / cols) * (cellH + 2) + 3

  // ========== STRATEGY ==========
  checkPage(10)
  pdf.setFillColor(238, 242, 255)
  pdf.setDrawColor(199, 210, 254)
  pdf.roundedRect(margin, y, contentW, 8, 1.5, 1.5, 'FD')
  pdf.setFontSize(7.5)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(55, 48, 163)
  pdf.text('Strategi Optimasi: ', pageW / 2 - 20, y + 5)
  pdf.setFont('helvetica', 'bold')
  pdf.text(r.strategy, pageW / 2 + 10, y + 5)
  y += 12

  // ========== CUTTING DIAGRAM ==========
  checkPage(60)
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(30, 41, 59)
  pdf.text('Diagram Potongan:', margin, y)
  y += 3

  // Draw diagram using jsPDF shapes
  const maxDiagramW = contentW
  const maxDiagramH = 70
  const scale = Math.min(maxDiagramW / r.paperWidth, maxDiagramH / r.paperHeight)
  const diagramW = r.paperWidth * scale
  const diagramH = r.paperHeight * scale
  const diagramX = margin + (contentW - diagramW) / 2

  // Paper border
  pdf.setDrawColor(148, 163, 184)
  pdf.setLineWidth(0.3)
  pdf.setFillColor(241, 245, 249)
  pdf.rect(diagramX, y, diagramW, diagramH, 'FD')

  // Block colors for pieces
  const blockColors: [number, number, number][] = [
    [147, 197, 253], // blue
    [110, 231, 183], // green
    [252, 211, 77],  // yellow
    [252, 165, 165], // red
    [196, 181, 253], // purple
  ]

  const blockBorderColors: [number, number, number][] = [
    [59, 130, 246],
    [16, 185, 129],
    [245, 158, 11],
    [239, 68, 68],
    [139, 92, 246],
  ]

  r.blocks.forEach((block, bi) => {
    const bx = diagramX + block.x * scale
    const by = y + block.y * scale
    const pieceW = block.pieceWidth * scale
    const pieceH = block.pieceHeight * scale
    const fillC = blockColors[bi % 5]
    const borderC = blockBorderColors[bi % 5]

    let num = 1
    for (let i = 0; i < block.horizontal; i++) {
      for (let j = 0; j < block.vertical; j++) {
        const px = bx + i * pieceW
        const py = by + j * pieceH
        const pw = pieceW - 0.3
        const ph = pieceH - 0.3

        // Piece background
        pdf.setFillColor(fillC[0], fillC[1], fillC[2])
        pdf.setDrawColor(borderC[0], borderC[1], borderC[2])
        pdf.setLineWidth(0.2)
        pdf.rect(px, py, pw, ph, 'FD')

        // Number in circle
        const centerX = px + pw / 2
        const centerY = py + ph / 2
        const cr = Math.min(pw, ph) / 4

        // Only draw number text if piece is big enough
        if (pw > 4 && ph > 4) {
          pdf.setFontSize(Math.min(7, Math.min(pw, ph) / 2.5))
          pdf.setFont('helvetica', 'normal')
          pdf.setTextColor(71, 85, 105)
          pdf.text(String(num), centerX, centerY + 0.5, { align: 'center' })
        }
        num++
      }
    }

    // Cut position lines
    if (bi === 0 && r.cutPosition !== undefined) {
      pdf.setDrawColor(248, 113, 113)
      pdf.setLineWidth(0.5)
      const cutX = diagramX + r.cutPosition * scale
      pdf.line(cutX, y, cutX, y + diagramH)
    }
    if (bi === 0 && r.cutPositionY !== undefined) {
      pdf.setDrawColor(248, 113, 113)
      pdf.setLineWidth(0.5)
      const cutY2 = y + r.cutPositionY * scale
      pdf.line(diagramX, cutY2, diagramX + diagramW, cutY2)
    }

    // Waste areas
    if (block.wasteWidth > 0.01) {
      const wx = bx + block.usedWidth * scale
      const ww = block.wasteWidth * scale
      const wh = block.usedHeight * scale
      pdf.setFillColor(241, 245, 249)
      pdf.setDrawColor(203, 213, 225)
      pdf.setLineWidth(0.1)
      pdf.setLineDashPattern([1, 0.5], 0)
      pdf.rect(wx, by, ww, wh, 'FD')
      pdf.setLineDashPattern([], 0)
    }
    if (block.wasteHeight > 0.01) {
      const wy = by + block.usedHeight * scale
      const ww2 = block.usedWidth * scale
      const wh2 = block.wasteHeight * scale
      pdf.setFillColor(241, 245, 249)
      pdf.setDrawColor(203, 213, 225)
      pdf.setLineWidth(0.1)
      pdf.setLineDashPattern([1, 0.5], 0)
      pdf.rect(bx, wy, ww2, wh2, 'FD')
      pdf.setLineDashPattern([], 0)
    }
  })

  // Outer border
  pdf.setDrawColor(148, 163, 184)
  pdf.setLineWidth(0.5)
  pdf.rect(diagramX, y, diagramW, diagramH, 'S')

  y += diagramH + 5

  // ========== STEPS & BLOCKS (side by side) ==========
  checkPage(20)

  // Steps column
  const halfW = (contentW - 4) / 2
  const stepsX = margin
  const blocksX = margin + halfW + 4

  // Steps header
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(51, 65, 85)
  pdf.text('Cara Potong:', stepsX, y)
  pdf.text('Detail per Blok:', blocksX, y)
  y += 4

  const stepsStartY = y

  // Draw steps
  r.steps.forEach((step, idx) => {
    checkPage(8)
    // Step number circle
    pdf.setFillColor(37, 99, 235)
    pdf.circle(stepsX + 3, y + 1, 2.5, 'F')
    pdf.setFontSize(6)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(255, 255, 255)
    pdf.text(String(idx + 1), stepsX + 3, y + 1.5, { align: 'center' })

    // Step text
    pdf.setFontSize(7.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(71, 85, 105)
    const stepLines = pdf.splitTextToSize(step, halfW - 10)
    pdf.text(stepLines, stepsX + 8, y + 1.5)
    y += Math.max(5, stepLines.length * 3.5)
  })

  // Draw blocks in right column
  let by2 = stepsStartY
  r.blocks.forEach((block, idx) => {
    checkPage(12)
    const c = blockBorderColors[idx % 5]
    const cFill = blockColors[idx % 5]

    // Block card
    pdf.setFillColor(cFill[0], cFill[1], cFill[2])
    pdf.setDrawColor(c[0], c[1], c[2])
    pdf.setLineWidth(0.2)
    pdf.roundedRect(blocksX, by2, halfW, 12, 1, 1, 'FD')

    // Block name
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(c[0], c[1], c[2])
    pdf.text(block.name, blocksX + 2.5, by2 + 4)

    // Pieces badge
    pdf.setFontSize(6)
    pdf.text(`${block.pieces} pcs`, blocksX + halfW - 2.5, by2 + 4, { align: 'right' })

    // Details
    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(c[0], c[1], c[2])
    const detailText = `Ukuran: ${block.width.toFixed(1)}×${block.height.toFixed(1)}  Layout: ${block.horizontal}×${block.vertical}${block.rotated ? ' (90°)' : ''}`
    pdf.text(detailText, blocksX + 2.5, by2 + 9)

    by2 += 14
  })

  // ========== FOOTER ==========
  const pageH = pdf.internal.pageSize.getHeight()
  pdf.setFontSize(6)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(148, 163, 184)
  pdf.text('www.darrellsoft.com', pageW / 2, pageH - 4, { align: 'center' })

  // Reset text color
  pdf.setTextColor(0, 0, 0)

  const blob = pdf.output('blob')
  return blob
}

/**
 * Generate PDF from a DOM element using html2canvas + jsPDF
 */
export async function generatePdfFromElement(
  element: HTMLElement,
  options?: {
    format?: 'a4' | 'a5';
    landscape?: boolean;
  }
): Promise<Blob> {
  const format = options?.format || 'a4';
  const landscape = options?.landscape || false;

  const { jsPDF } = await import('jspdf');
  const html2canvas = (await import('html2canvas')).default;

  // Clone the element to avoid modifying the original
  const clone = element.cloneNode(true) as HTMLElement;

  // Create a wrapper div with fixed dimensions for rendering
  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-9999px';
  wrapper.style.top = '0';
  wrapper.style.background = '#ffffff';
  wrapper.style.zIndex = '-1';

  // Reset transforms and set a fixed width for consistent rendering
  clone.style.transform = 'none';
  clone.style.transformOrigin = 'top left';
  clone.style.width = format === 'a5' ? '148mm' : '210mm';
  clone.style.overflow = 'visible';

  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  try {
    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    const pdf = new jsPDF({
      orientation: landscape ? 'l' : 'p',
      unit: 'mm',
      format: format,
    });

    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();

    const margin = 3;
    const cw = pdfW - margin * 2;
    const ih = (canvas.height * cw) / canvas.width;
    const maxH = pdfH - margin * 2;

    let fw = cw;
    let fh = ih;
    if (fh > maxH) {
      fw = (maxH * cw) / ih;
      fh = maxH;
    }

    pdf.addImage(imgData, 'JPEG', margin + (cw - fw) / 2, margin, fw, fh);

    const blob = pdf.output('blob');
    if (!(blob instanceof Blob)) {
      throw new Error('jsPDF output did not return a valid Blob');
    }
    return blob;
  } finally {
    document.body.removeChild(wrapper);
  }
}

/**
 * Share a PDF blob via WhatsApp.
 * - Mobile: uses Web Share API to share PDF file directly to WhatsApp Business
 * - Desktop: downloads the PDF, then opens WhatsApp Desktop / WhatsApp Web
 */
export async function sharePdfViaWhatsApp(
  blob: Blob,
  fileName: string,
  documentLabel: string,
  waWindowRef?: React.MutableRefObject<Window | null>
): Promise<void> {
  // Validate blob
  if (!blob || !(blob instanceof Blob)) {
    throw new Error('Invalid blob: PDF generation may have failed');
  }

  const file = new File([blob], fileName, { type: 'application/pdf' });
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // ===== MOBILE: Share PDF file directly via Web Share API =====
  if (isMobile && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        text: `Dokumen ${documentLabel} - www.darrellsoft.com`,
      });
      return; // Successfully shared
    } catch (err: unknown) {
      // User cancelled share sheet
      if (err instanceof Error && err.name === 'AbortError') return;
      // Share failed, fall through to fallback
    }
  }

  // ===== DESKTOP (or mobile fallback): Download PDF + open WhatsApp =====
  // Step 1: Download PDF file
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 5000);

  // Step 2: Open WhatsApp directly
  // Small delay so download starts first
  await new Promise(resolve => setTimeout(resolve, 500));

  const msg = `Dokumen ${documentLabel} dalam format PDF sudah diunduh. Silakan lampirkan file PDF tersebut.`;
  const encoded = encodeURIComponent(msg);

  const { openWhatsApp } = await import('@/lib/whatsapp-business');
  openWhatsApp(encoded, waWindowRef ? { waWindowRef } : undefined);
}

/**
 * Download a PDF blob
 */
export function downloadPdf(blob: Blob, fileName: string): void {
  if (!blob || !(blob instanceof Blob)) {
    throw new Error('Invalid blob for download');
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 5000);
}
