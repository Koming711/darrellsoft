/**
 * Generate PDF using jsPDF directly (no html2canvas dependency)
 * and share it via WhatsApp.
 */

import type { CuttingResult } from '@/lib/cutting-engine'
import type { InvoiceData, PurchaseOrderData, SuratJalanData } from '@/lib/types'
import { formatRupiah, formatTanggal } from '@/lib/format'
import { terbilang } from '@/lib/terbilang'

// ============================================================
// Shared helpers
// ============================================================

function formatRupiahLocal(amount: number): string {
  if (isNaN(amount)) return 'Rp0'
  return 'Rp' + Math.round(amount).toLocaleString('id-ID')
}

function formatTanggalLocal(dateStr: string): string {
  if (!dateStr) return '-'
  try {
    const date = new Date(dateStr + 'T00:00:00')
    const bulan = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ]
    const hari = date.getDate()
    const bln = bulan[date.getMonth()]
    const tahun = date.getFullYear()
    return `${hari} ${bln} ${tahun}`
  } catch {
    return dateStr
  }
}

// ============================================================
// Potong Kertas PDF (already working)
// ============================================================

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

    pdf.setFillColor(248, 250, 252)
    pdf.setDrawColor(226, 232, 240)
    pdf.roundedRect(cx, cy, colW, cellH, 1.5, 1.5, 'FD')

    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(item.color[0], item.color[1], item.color[2])
    pdf.text(item.label, cx + 2.5, cy + 4.5)

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

  const maxDiagramW = contentW
  const maxDiagramH = 70
  const scale = Math.min(maxDiagramW / r.paperWidth, maxDiagramH / r.paperHeight)
  const diagramW = r.paperWidth * scale
  const diagramH = r.paperHeight * scale
  const diagramX = margin + (contentW - diagramW) / 2

  pdf.setDrawColor(148, 163, 184)
  pdf.setLineWidth(0.3)
  pdf.setFillColor(241, 245, 249)
  pdf.rect(diagramX, y, diagramW, diagramH, 'FD')

  const blockColors: [number, number, number][] = [
    [147, 197, 253], [110, 231, 183], [252, 211, 77], [252, 165, 165], [196, 181, 253],
  ]
  const blockBorderColors: [number, number, number][] = [
    [59, 130, 246], [16, 185, 129], [245, 158, 11], [239, 68, 68], [139, 92, 246],
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

        pdf.setFillColor(fillC[0], fillC[1], fillC[2])
        pdf.setDrawColor(borderC[0], borderC[1], borderC[2])
        pdf.setLineWidth(0.2)
        pdf.rect(px, py, pw, ph, 'FD')

        const centerX = px + pw / 2
        const centerY = py + ph / 2

        if (pw > 4 && ph > 4) {
          pdf.setFontSize(Math.min(7, Math.min(pw, ph) / 2.5))
          pdf.setFont('helvetica', 'normal')
          pdf.setTextColor(71, 85, 105)
          pdf.text(String(num), centerX, centerY + 0.5, { align: 'center' })
        }
        num++
      }
    }

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

  pdf.setDrawColor(148, 163, 184)
  pdf.setLineWidth(0.5)
  pdf.rect(diagramX, y, diagramW, diagramH, 'S')
  y += diagramH + 5

  // ========== STEPS & BLOCKS ==========
  checkPage(20)
  const halfW = (contentW - 4) / 2
  const stepsX = margin
  const blocksX = margin + halfW + 4

  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(51, 65, 85)
  pdf.text('Cara Potong:', stepsX, y)
  pdf.text('Detail per Blok:', blocksX, y)
  y += 4

  const stepsStartY = y

  r.steps.forEach((step, idx) => {
    checkPage(8)
    pdf.setFillColor(37, 99, 235)
    pdf.circle(stepsX + 3, y + 1, 2.5, 'F')
    pdf.setFontSize(6)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(255, 255, 255)
    pdf.text(String(idx + 1), stepsX + 3, y + 1.5, { align: 'center' })

    pdf.setFontSize(7.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(71, 85, 105)
    const stepLines = pdf.splitTextToSize(step, halfW - 10)
    pdf.text(stepLines, stepsX + 8, y + 1.5)
    y += Math.max(5, stepLines.length * 3.5)
  })

  let by2 = stepsStartY
  r.blocks.forEach((block, idx) => {
    checkPage(12)
    const c = blockBorderColors[idx % 5]
    const cFill = blockColors[idx % 5]

    pdf.setFillColor(cFill[0], cFill[1], cFill[2])
    pdf.setDrawColor(c[0], c[1], c[2])
    pdf.setLineWidth(0.2)
    pdf.roundedRect(blocksX, by2, halfW, 12, 1, 1, 'FD')

    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(c[0], c[1], c[2])
    pdf.text(block.name, blocksX + 2.5, by2 + 4)

    pdf.setFontSize(6)
    pdf.text(`${block.pieces} pcs`, blocksX + halfW - 2.5, by2 + 4, { align: 'right' })

    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(c[0], c[1], c[2])
    const detailText = `Ukuran: ${block.width.toFixed(1)}\u00D7${block.height.toFixed(1)}  Layout: ${block.horizontal}\u00D7${block.vertical}${block.rotated ? ' (90\u00B0)' : ''}`
    pdf.text(detailText, blocksX + 2.5, by2 + 9)

    by2 += 14
  })

  // ========== FOOTER ==========
  const pageH = pdf.internal.pageSize.getHeight()
  pdf.setFontSize(6)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(148, 163, 184)
  pdf.text('www.darrellsoft.com', pageW / 2, pageH - 4, { align: 'center' })

  pdf.setTextColor(0, 0, 0)
  return pdf.output('blob')
}

// ============================================================
// Invoice PDF (programmatic — no html2canvas)
// ============================================================

export async function generateInvoicePdf(data: InvoiceData): Promise<Blob> {
  const { jsPDF } = await import('jspdf')

  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a5' })
  const pageW = pdf.internal.pageSize.getWidth() // 148mm
  const pageH = pdf.internal.pageSize.getHeight() // 210mm
  const m = 8 // margin
  const cw = pageW - m * 2 // content width
  let y = m

  const subtotal = data.items.reduce((sum, item) => sum + item.qty * item.harga, 0)
  const ppnAmount = subtotal * (data.ppn / 100)
  const total = subtotal + ppnAmount
  const companyInitial = (data.company.nama || 'C').charAt(0).toUpperCase()

  // ---- HEADER ----
  // Logo box
  pdf.setFillColor(0, 0, 0)
  pdf.roundedRect(m, y, 10, 10, 1, 1, 'F')
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255, 255, 255)
  pdf.text(companyInitial, m + 5, y + 6.5, { align: 'center' })

  // Company info
  pdf.setTextColor(0, 0, 0)
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.text(data.company.nama || 'Nama Perusahaan', m + 13, y + 3)

  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(97, 97, 97)
  pdf.text(data.company.alamat || '', m + 13, y + 7)
  const contactLine = [data.company.telepon, data.company.email].filter(Boolean).join('  ')
  pdf.text(contactLine, m + 13, y + 10.5)

  // Bank info
  let bankY = y + 13.5
  if (data.company.bankName) {
    pdf.setFontSize(6)
    pdf.setTextColor(120, 120, 120)
    pdf.text(`${data.company.bankName} ${data.company.bankAccount} a.n. ${data.company.bankHolder}`, m + 13, bankY)
    bankY += 3
  }
  if (data.company.bankName2) {
    pdf.setFontSize(6)
    pdf.setTextColor(120, 120, 120)
    pdf.text(`${data.company.bankName2} ${data.company.bankAccount2} a.n. ${data.company.bankHolder2}`, m + 13, bankY)
    bankY += 3
  }

  // INVOICE title (right)
  pdf.setFontSize(12)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text('INVOICE', pageW - m, y + 4, { align: 'right' })

  y = Math.max(bankY, y + 16) + 2

  // ---- DIVIDER ----
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.6)
  pdf.line(m, y, pageW - m, y)
  y += 4

  // ---- CLIENT INFO (left) + DOC DETAILS (right) ----
  pdf.setFontSize(6)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(97, 97, 97)
  pdf.text('KEPADA YTH :', m, y)

  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text(data.client.nama || '-', m, y + 4)

  if (data.client.kontak) {
    pdf.setFontSize(6.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(97, 97, 97)
    pdf.text(data.client.kontak, m, y + 7.5)
  }
  if (data.client.alamat) {
    pdf.setFontSize(6.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(97, 97, 97)
    pdf.text(data.client.alamat, m, y + 10.5)
  }

  // Right side: doc details
  const rightX = pageW - m
  pdf.setFontSize(6)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(97, 97, 97)
  pdf.text('No. Invoice', rightX, y, { align: 'right' })
  pdf.setFontSize(7.5)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text(data.nomor || '', rightX, y + 3.5, { align: 'right' })

  pdf.setFontSize(6)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(97, 97, 97)
  pdf.text('Tanggal', rightX, y + 7, { align: 'right' })
  pdf.setFontSize(7.5)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(0, 0, 0)
  pdf.text(formatTanggalLocal(data.tanggal), rightX, y + 10.5, { align: 'right' })

  y += 15

  // ---- ITEMS TABLE ----
  const tableTop = y
  const colQty = 14
  const colDesc = cw - colQty - 30 - 30
  const colPrice = 30
  const colTotal = 30
  const rowH = 5.5

  // Table header
  pdf.setFillColor(0, 0, 0)
  pdf.rect(m, y, cw, rowH, 'F')
  pdf.setFontSize(6.5)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255, 255, 255)
  pdf.text('Qty', m + colQty - 1.5, y + 3.8, { align: 'right' })
  pdf.text('Nama Barang', m + colQty + 1.5, y + 3.8)
  pdf.text('Harga Satuan', m + colQty + colDesc + colPrice - 1.5, y + 3.8, { align: 'right' })
  pdf.text('Jumlah', m + cw - 1.5, y + 3.8, { align: 'right' })
  y += rowH

  // Pad items to at least 8 rows
  const MAX_ROWS = 8
  const rows = [...data.items]
  while (rows.length < MAX_ROWS) {
    rows.push({ id: `empty-${rows.length}`, deskripsi: '', qty: 0, satuan: '', harga: 0 })
  }

  rows.forEach((item, i) => {
    const hasData = i < data.items.length
    const bgColor = i % 2 === 1 ? [245, 245, 245] : [255, 255, 255]
    pdf.setFillColor(bgColor[0], bgColor[1], bgColor[2])
    pdf.rect(m, y, cw, rowH, 'F')

    if (hasData) {
      pdf.setTextColor(0, 0, 0)
      pdf.setFontSize(6.5)
      pdf.setFont('helvetica', 'normal')
      pdf.text(String(item.qty), m + colQty - 1.5, y + 3.8, { align: 'right' })

      // Multi-line description: split by newlines, then fit
      const descLines = item.deskripsi.split('\n')
      pdf.text(descLines[0] || '', m + colQty + 1.5, y + 3.8)

      pdf.text(formatRupiahLocal(item.harga), m + colQty + colDesc + colPrice - 1.5, y + 3.8, { align: 'right' })
      pdf.setFont('helvetica', 'bold')
      pdf.text(formatRupiahLocal(item.qty * item.harga), m + cw - 1.5, y + 3.8, { align: 'right' })
    }
    y += rowH
  })

  // Table border
  pdf.setDrawColor(180, 180, 180)
  pdf.setLineWidth(0.2)
  pdf.rect(m, tableTop, cw, y - tableTop)

  y += 3

  // ---- TOTALS ----
  const totalsX = pageW - m - 50
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(97, 97, 97)
  pdf.text('Subtotal', totalsX, y)
  pdf.text(formatRupiahLocal(subtotal), pageW - m - 1.5, y, { align: 'right' })
  y += 4

  if (data.ppn > 0) {
    pdf.text(`PPN (${data.ppn}%)`, totalsX, y)
    pdf.text(formatRupiahLocal(ppnAmount), pageW - m - 1.5, y, { align: 'right' })
    y += 4
  }

  // Total line
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.5)
  pdf.line(totalsX - 2, y, pageW - m, y)
  y += 3
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text('TOTAL', totalsX, y)
  pdf.setFontSize(9)
  pdf.text(formatRupiahLocal(total), pageW - m - 1.5, y, { align: 'right' })
  y += 5

  // ---- TERBILANG ----
  pdf.setFontSize(6.5)
  pdf.setFont('helvetica', 'italic')
  pdf.setTextColor(97, 97, 97)
  const terbilangText = `Terbilang: ${terbilang(total)} rupiah`
  pdf.text(terbilangText, m, y)
  y += 5

  // ---- CATATAN ----
  if (data.catatan) {
    pdf.setFillColor(245, 245, 245)
    pdf.roundedRect(m, y, cw, 10, 1, 1, 'F')
    pdf.setFontSize(6.5)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(0, 0, 0)
    pdf.text('Catatan:', m + 2, y + 3.5)
    pdf.setFont('helvetica', 'normal')
    const noteLines = pdf.splitTextToSize(data.catatan, cw - 4)
    pdf.text(noteLines, m + 2, y + 7)
    y += 12
  }

  // ---- SIGNATURES ----
  y += 3
  const sigW = (cw - 10) / 2
  const sigL = m
  const sigR = m + sigW + 10

  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text('Diterima Oleh', sigL + sigW / 2, y, { align: 'center' })
  pdf.text('Hormat Kami', sigR + sigW / 2, y, { align: 'center' })

  y += 18
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.3)
  pdf.line(sigL + sigW * 0.15, y, sigL + sigW * 0.85, y)
  pdf.line(sigR + sigW * 0.15, y, sigR + sigW * 0.85, y)

  // ---- FOOTER ----
  y += 8
  pdf.setFontSize(5.5)
  pdf.setFont('helvetica', 'italic')
  pdf.setTextColor(120, 120, 120)
  pdf.text('Barang yang sudah dibeli tidak bisa ditukar/dikembalikan.', pageW / 2, y, { align: 'center' })

  y += 4
  pdf.setFontSize(5)
  pdf.text('www.darrellsoft.com', pageW / 2, pageH - 4, { align: 'center' })

  pdf.setTextColor(0, 0, 0)
  return pdf.output('blob')
}

// ============================================================
// Purchase Order PDF (programmatic — no html2canvas)
// ============================================================

export async function generatePurchaseOrderPdf(data: PurchaseOrderData): Promise<Blob> {
  const { jsPDF } = await import('jspdf')

  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a5' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const m = 8
  const cw = pageW - m * 2
  let y = m

  const subtotal = data.items.reduce((sum, item) => sum + item.qty * item.harga, 0)
  const ppnAmount = subtotal * (data.ppn / 100)
  const total = subtotal + ppnAmount
  const companyInitial = (data.company.nama || 'C').charAt(0).toUpperCase()

  // ---- HEADER ----
  pdf.setFillColor(0, 0, 0)
  pdf.roundedRect(m, y, 10, 10, 1, 1, 'F')
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255, 255, 255)
  pdf.text(companyInitial, m + 5, y + 6.5, { align: 'center' })

  pdf.setTextColor(0, 0, 0)
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.text(data.company.nama || 'Nama Perusahaan', m + 13, y + 3)

  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(97, 97, 97)
  pdf.text(data.company.alamat || '', m + 13, y + 7)
  const contactLine = [data.company.telepon, data.company.email].filter(Boolean).join('  ')
  pdf.text(contactLine, m + 13, y + 10.5)

  let bankY = y + 13.5
  if (data.company.bankName) {
    pdf.setFontSize(6)
    pdf.setTextColor(120, 120, 120)
    pdf.text(`${data.company.bankName} ${data.company.bankAccount} a.n. ${data.company.bankHolder}`, m + 13, bankY)
    bankY += 3
  }
  if (data.company.bankName2) {
    pdf.setFontSize(6)
    pdf.setTextColor(120, 120, 120)
    pdf.text(`${data.company.bankName2} ${data.company.bankAccount2} a.n. ${data.company.bankHolder2}`, m + 13, bankY)
    bankY += 3
  }

  // PO title
  pdf.setFontSize(12)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text('PURCHASE ORDER', pageW - m, y + 4, { align: 'right' })
  pdf.setFontSize(6)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(97, 97, 97)
  pdf.text('Pesanan Pembelian', pageW - m, y + 8, { align: 'right' })

  y = Math.max(bankY, y + 16) + 2

  // ---- DIVIDER ----
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.6)
  pdf.line(m, y, pageW - m, y)
  y += 4

  // ---- PEMASOK INFO (left) + DOC DETAILS (right) ----
  pdf.setFontSize(6)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(97, 97, 97)
  pdf.text('KEPADA YTH :', m, y)

  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text(data.pemasok.nama || '-', m, y + 4)

  if (data.pemasok.kontak) {
    pdf.setFontSize(6.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(97, 97, 97)
    pdf.text(data.pemasok.kontak, m, y + 7.5)
  }
  if (data.pemasok.alamat) {
    pdf.setFontSize(6.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(97, 97, 97)
    pdf.text(data.pemasok.alamat, m, y + 10.5)
  }

  const rightX = pageW - m
  pdf.setFontSize(6)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(97, 97, 97)
  pdf.text('No. PO', rightX, y, { align: 'right' })
  pdf.setFontSize(7.5)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text(data.nomor || '', rightX, y + 3.5, { align: 'right' })

  pdf.setFontSize(6)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(97, 97, 97)
  pdf.text('Tanggal', rightX, y + 7, { align: 'right' })
  pdf.setFontSize(7.5)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(0, 0, 0)
  pdf.text(formatTanggalLocal(data.tanggal), rightX, y + 10.5, { align: 'right' })

  y += 15

  // ---- ITEMS TABLE ----
  const tableTop = y
  const colQty = 14
  const colDesc = cw - colQty - 30 - 30
  const colPrice = 30
  const colTotal = 30
  const rowH = 5.5

  pdf.setFillColor(0, 0, 0)
  pdf.rect(m, y, cw, rowH, 'F')
  pdf.setFontSize(6.5)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255, 255, 255)
  pdf.text('Qty', m + colQty - 1.5, y + 3.8, { align: 'right' })
  pdf.text('Nama Barang', m + colQty + 1.5, y + 3.8)
  pdf.text('Harga Satuan', m + colQty + colDesc + colPrice - 1.5, y + 3.8, { align: 'right' })
  pdf.text('Jumlah', m + cw - 1.5, y + 3.8, { align: 'right' })
  y += rowH

  const MAX_ROWS = 10
  const rows = [...data.items]
  while (rows.length < MAX_ROWS) {
    rows.push({ id: `empty-${rows.length}`, deskripsi: '', qty: 0, satuan: '', harga: 0 })
  }

  rows.forEach((item, i) => {
    const hasData = i < data.items.length
    const bgColor = i % 2 === 1 ? [245, 245, 245] : [255, 255, 255]
    pdf.setFillColor(bgColor[0], bgColor[1], bgColor[2])
    pdf.rect(m, y, cw, rowH, 'F')

    if (hasData) {
      pdf.setTextColor(0, 0, 0)
      pdf.setFontSize(6.5)
      pdf.setFont('helvetica', 'normal')
      pdf.text(String(item.qty), m + colQty - 1.5, y + 3.8, { align: 'right' })

      const descLines = item.deskripsi.split('\n')
      pdf.text(descLines[0] || '', m + colQty + 1.5, y + 3.8)

      pdf.text(formatRupiahLocal(item.harga), m + colQty + colDesc + colPrice - 1.5, y + 3.8, { align: 'right' })
      pdf.setFont('helvetica', 'bold')
      pdf.text(formatRupiahLocal(item.qty * item.harga), m + cw - 1.5, y + 3.8, { align: 'right' })
    }
    y += rowH
  })

  pdf.setDrawColor(180, 180, 180)
  pdf.setLineWidth(0.2)
  pdf.rect(m, tableTop, cw, y - tableTop)
  y += 3

  // ---- TOTALS ----
  const totalsX = pageW - m - 50
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(97, 97, 97)
  pdf.text('Subtotal', totalsX, y)
  pdf.text(formatRupiahLocal(subtotal), pageW - m - 1.5, y, { align: 'right' })
  y += 4

  if (data.ppn > 0) {
    pdf.text(`PPN (${data.ppn}%)`, totalsX, y)
    pdf.text(formatRupiahLocal(ppnAmount), pageW - m - 1.5, y, { align: 'right' })
    y += 4
  }

  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.5)
  pdf.line(totalsX - 2, y, pageW - m, y)
  y += 3
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text('TOTAL', totalsX, y)
  pdf.setFontSize(9)
  pdf.text(formatRupiahLocal(total), pageW - m - 1.5, y, { align: 'right' })
  y += 5

  // ---- TERBILANG ----
  pdf.setFontSize(6.5)
  pdf.setFont('helvetica', 'italic')
  pdf.setTextColor(97, 97, 97)
  pdf.text(`Terbilang: ${terbilang(total)} rupiah`, m, y)
  y += 5

  // ---- CATATAN ----
  if (data.catatan) {
    pdf.setFillColor(245, 245, 245)
    pdf.roundedRect(m, y, cw, 10, 1, 1, 'F')
    pdf.setFontSize(6.5)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(0, 0, 0)
    pdf.text('Catatan:', m + 2, y + 3.5)
    pdf.setFont('helvetica', 'normal')
    const noteLines = pdf.splitTextToSize(data.catatan, cw - 4)
    pdf.text(noteLines, m + 2, y + 7)
    y += 12
  }

  // ---- SIGNATURES (3 columns) ----
  y += 3
  const sigW3 = (cw - 6) / 3
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text('Disetujui Oleh', m + sigW3 / 2, y, { align: 'center' })
  pdf.text('Diketahui', m + sigW3 + 3 + sigW3 / 2, y, { align: 'center' })
  pdf.text('Toko', m + (sigW3 + 3) * 2 + sigW3 / 2, y, { align: 'center' })

  y += 18
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.3)
  pdf.line(m + sigW3 * 0.15, y, m + sigW3 * 0.85, y)
  pdf.line(m + sigW3 + 3 + sigW3 * 0.15, y, m + sigW3 + 3 + sigW3 * 0.85, y)
  pdf.line(m + (sigW3 + 3) * 2 + sigW3 * 0.15, y, m + (sigW3 + 3) * 2 + sigW3 * 0.85, y)

  // ---- FOOTER ----
  y += 8
  pdf.setFontSize(5.5)
  pdf.setFont('helvetica', 'italic')
  pdf.setTextColor(120, 120, 120)
  pdf.text('Barang yang sudah dibeli tidak bisa ditukar/dikembalikan.', pageW / 2, y, { align: 'center' })

  pdf.setFontSize(5)
  pdf.text('www.darrellsoft.com', pageW / 2, pageH - 4, { align: 'center' })

  pdf.setTextColor(0, 0, 0)
  return pdf.output('blob')
}

// ============================================================
// Surat Jalan PDF (programmatic — no html2canvas)
// ============================================================

export async function generateSuratJalanPdf(data: SuratJalanData): Promise<Blob> {
  const { jsPDF } = await import('jspdf')

  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a5' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const m = 8
  const cw = pageW - m * 2
  let y = m

  const companyInitial = (data.company.nama || 'C').charAt(0).toUpperCase()

  // ---- HEADER ----
  pdf.setFillColor(0, 0, 0)
  pdf.roundedRect(m, y, 10, 10, 1, 1, 'F')
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255, 255, 255)
  pdf.text(companyInitial, m + 5, y + 6.5, { align: 'center' })

  pdf.setTextColor(0, 0, 0)
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.text(data.company.nama || 'Nama Perusahaan', m + 13, y + 3)

  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(97, 97, 97)
  pdf.text(data.company.alamat || '', m + 13, y + 7)
  const contactLine = [data.company.telepon, data.company.email].filter(Boolean).join('  ')
  pdf.text(contactLine, m + 13, y + 10.5)

  let bankY = y + 13.5
  if (data.company.bankName) {
    pdf.setFontSize(6)
    pdf.setTextColor(120, 120, 120)
    pdf.text(`${data.company.bankName} ${data.company.bankAccount} a.n. ${data.company.bankHolder}`, m + 13, bankY)
    bankY += 3
  }
  if (data.company.bankName2) {
    pdf.setFontSize(6)
    pdf.setTextColor(120, 120, 120)
    pdf.text(`${data.company.bankName2} ${data.company.bankAccount2} a.n. ${data.company.bankHolder2}`, m + 13, bankY)
    bankY += 3
  }

  // SJ title
  pdf.setFontSize(12)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text('SURAT JALAN', pageW - m, y + 4, { align: 'right' })
  pdf.setFontSize(6)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(97, 97, 97)
  pdf.text('Pengiriman Barang', pageW - m, y + 8, { align: 'right' })

  y = Math.max(bankY, y + 16) + 2

  // ---- DIVIDER ----
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.6)
  pdf.line(m, y, pageW - m, y)
  y += 4

  // ---- PENERIMA INFO (left) + DOC DETAILS (right) ----
  pdf.setFontSize(6)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(97, 97, 97)
  pdf.text('DITERIMA OLEH', m, y)

  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text(data.penerima.nama || '-', m, y + 4)

  if (data.penerima.kontak) {
    pdf.setFontSize(6.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(97, 97, 97)
    pdf.text(data.penerima.kontak, m, y + 7.5)
  }
  if (data.penerima.alamat) {
    pdf.setFontSize(6.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(97, 97, 97)
    pdf.text(data.penerima.alamat, m, y + 10.5)
  }

  const rightX = pageW - m
  pdf.setFontSize(6)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(97, 97, 97)
  pdf.text('No. Surat Jalan', rightX, y, { align: 'right' })
  pdf.setFontSize(7.5)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text(data.nomor || '', rightX, y + 3.5, { align: 'right' })

  pdf.setFontSize(6)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(97, 97, 97)
  pdf.text('Tanggal', rightX, y + 7, { align: 'right' })
  pdf.setFontSize(7.5)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(0, 0, 0)
  pdf.text(formatTanggalLocal(data.tanggal), rightX, y + 10.5, { align: 'right' })

  y += 15

  // ---- VEHICLE INFO ----
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(97, 97, 97)
  pdf.text('No. Kendaraan', m, y)
  pdf.text('Pengemudi', m + 50, y)
  y += 3.5
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text(data.noKendaraan || '-', m, y)
  pdf.text(data.pengemudi || '-', m + 50, y)
  y += 6

  // ---- ITEMS TABLE (no prices) ----
  const tableTop = y
  const colQty = 14
  const colDesc = cw - colQty
  const rowH = 5.5

  pdf.setFillColor(0, 0, 0)
  pdf.rect(m, y, cw, rowH, 'F')
  pdf.setFontSize(6.5)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255, 255, 255)
  pdf.text('Qty', m + colQty - 1.5, y + 3.8, { align: 'right' })
  pdf.text('Nama Barang', m + colQty + 1.5, y + 3.8)
  y += rowH

  const MAX_ROWS = 10
  const rows = [...data.items]
  while (rows.length < MAX_ROWS) {
    rows.push({ id: `empty-${rows.length}`, deskripsi: '', qty: 0, satuan: '', harga: 0 })
  }

  rows.forEach((item, i) => {
    const hasData = i < data.items.length
    const bgColor = i % 2 === 1 ? [245, 245, 245] : [255, 255, 255]
    pdf.setFillColor(bgColor[0], bgColor[1], bgColor[2])
    pdf.rect(m, y, cw, rowH, 'F')

    if (hasData) {
      pdf.setTextColor(0, 0, 0)
      pdf.setFontSize(6.5)
      pdf.setFont('helvetica', 'normal')
      pdf.text(String(item.qty), m + colQty - 1.5, y + 3.8, { align: 'right' })

      const descLines = item.deskripsi.split('\n')
      pdf.text(descLines[0] || '', m + colQty + 1.5, y + 3.8)
    }
    y += rowH
  })

  pdf.setDrawColor(180, 180, 180)
  pdf.setLineWidth(0.2)
  pdf.rect(m, tableTop, cw, y - tableTop)
  y += 3

  // ---- CATATAN ----
  if (data.catatan) {
    pdf.setFillColor(245, 245, 245)
    pdf.roundedRect(m, y, cw, 10, 1, 1, 'F')
    pdf.setFontSize(6.5)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(0, 0, 0)
    pdf.text('Catatan:', m + 2, y + 3.5)
    pdf.setFont('helvetica', 'normal')
    const noteLines = pdf.splitTextToSize(data.catatan, cw - 4)
    pdf.text(noteLines, m + 2, y + 7)
    y += 12
  }

  // ---- SIGNATURES (2 columns with more space) ----
  y += 5
  const sigW2 = (cw - 10) / 2
  const sigL = m
  const sigR = m + sigW2 + 10

  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text('Pengirim', sigL + sigW2 / 2, y, { align: 'center' })
  pdf.text('Penerima', sigR + sigW2 / 2, y, { align: 'center' })

  y += 25
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.3)
  pdf.line(sigL + sigW2 * 0.15, y, sigL + sigW2 * 0.85, y)
  pdf.line(sigR + sigW2 * 0.15, y, sigR + sigW2 * 0.85, y)

  // ---- FOOTER ----
  y += 8
  pdf.setFontSize(5.5)
  pdf.setFont('helvetica', 'italic')
  pdf.setTextColor(120, 120, 120)
  pdf.text('Barang yang sudah dibeli tidak bisa ditukar/dikembalikan.', pageW / 2, y, { align: 'center' })

  pdf.setFontSize(5)
  pdf.text('www.darrellsoft.com', pageW / 2, pageH - 4, { align: 'center' })

  pdf.setTextColor(0, 0, 0)
  return pdf.output('blob')
}

// ============================================================
// Share via WhatsApp
// ============================================================

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
  if (!blob || !(blob instanceof Blob)) {
    throw new Error('Invalid blob: PDF generation may have failed')
  }

  const file = new File([blob], fileName, { type: 'application/pdf' })
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

  // ===== MOBILE: Share PDF file directly via Web Share API =====
  if (isMobile && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        text: `Dokumen ${documentLabel} - www.darrellsoft.com`,
      })
      return
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      // Share failed, fall through to fallback
    }
  }

  // ===== DESKTOP (or mobile fallback): Download PDF + open WhatsApp =====
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 5000)

  await new Promise(resolve => setTimeout(resolve, 500))

  const msg = `Dokumen ${documentLabel} dalam format PDF sudah diunduh. Silakan lampirkan file PDF tersebut.`
  const encoded = encodeURIComponent(msg)

  const { openWhatsApp } = await import('@/lib/whatsapp-business')
  openWhatsApp(encoded, waWindowRef ? { waWindowRef } : undefined)
}

/**
 * Download a PDF blob
 */
export function downloadPdf(blob: Blob, fileName: string): void {
  if (!blob || !(blob instanceof Blob)) {
    throw new Error('Invalid blob for download')
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 5000)
}
