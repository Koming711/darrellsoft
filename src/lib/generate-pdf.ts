/**
 * Generate PDF using jsPDF directly
 * and share it via WhatsApp.
 *
 * PDF layout matches the browser preview / print output exactly.
 */

import type { jsPDF } from 'jspdf'
import type { CuttingResult } from '@/lib/cutting-engine'
import type { InvoiceData, PurchaseOrderData, SuratJalanData } from '@/lib/types'
import { formatRupiah, formatTanggal } from '@/lib/format'
import { terbilang } from '@/lib/terbilang'

// ============================================================
// Shared helpers
// ============================================================

function rp(amount: number): string {
  if (isNaN(amount)) return 'Rp0'
  return 'Rp' + Math.round(amount).toLocaleString('id-ID')
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return '-'
  try {
    const date = new Date(dateStr + 'T00:00:00')
    const bulan = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ]
    return `${date.getDate()} ${bulan[date.getMonth()]} ${date.getFullYear()}`
  } catch {
    return dateStr
  }
}

/** Format date short: 01 Jan 25 */
function fmtDateShort(dateStr: string): string {
  if (!dateStr) return '-'
  try {
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' })
  } catch {
    return dateStr
  }
}

/** Try to add a base64 logo image to the PDF. Returns true if successful. */
function tryAddLogoImage(pdf: jsPDF, logoDataUrl: string | undefined, x: number, y: number, size: number): boolean {
  if (!logoDataUrl) return false
  try {
    // Detect format from data URL
    const pngMatch = logoDataUrl.match(/^data:image\/png;base64,/)
    const jpegMatch = logoDataUrl.match(/^data:image\/jpeg;base64,/)
    const jpgMatch = logoDataUrl.match(/^data:image\/jpg;base64,/)
    const webpMatch = logoDataUrl.match(/^data:image\/webp;base64,/)

    let format: string | null = null
    if (pngMatch) format = 'PNG'
    else if (jpegMatch || jpgMatch) format = 'JPEG'
    else if (webpMatch) format = 'PNG' // jsPDF may handle webp as PNG

    if (!format) return false

    pdf.addImage(logoDataUrl, format, x, y, size, size)
    return true
  } catch {
    return false
  }
}

/** Draw a standard document header (logo + company info + title). Returns new Y. */
function drawDocHeader(
  pdf: jsPDF,
  opts: {
    pageW: number; m: number; y: number
    company: InvoiceData['company']
    title: string
    subtitle?: string
    jatuhTempo?: string  // optional due date display in header
  }
): number {
  const { pageW, m, y, company, title, subtitle, jatuhTempo } = opts

  const logoSize = 12
  const logoX = m
  const logoY = y

  // Logo — try base64 image first, fallback to bordered box with 2-char initials (matches print)
  const logoAdded = tryAddLogoImage(pdf, company.logo, logoX, logoY, logoSize)

  if (!logoAdded) {
    // Matches print: black border, transparent bg, black text, 2-char initials
    const companyInitials = (company.nama || 'C').split(/\s+/).map(w => w.charAt(0)).join('').toUpperCase().slice(0, 2)
    pdf.setDrawColor(0, 0, 0)
    pdf.setLineWidth(0.8)
    pdf.roundedRect(logoX, logoY, logoSize, logoSize, 1.2, 1.2, 'S') // stroke only
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(0, 0, 0)
    pdf.text(companyInitials, logoX + logoSize / 2, logoY + logoSize / 2 + 1.5, { align: 'center' })
  }

  const infoX = m + 15

  // Company name — matches print: 12pt bold black
  pdf.setTextColor(0, 0, 0)
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.text(company.nama || '', infoX, y + 4)

  // Address — matches print: all text black (CSS forces #000 in print)
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(0, 0, 0)
  let nextY = y + 8.5
  if (company.alamat) {
    pdf.text(company.alamat, infoX, nextY)
    nextY += 3.5
  }

  // Telepon & Email
  const contactLine = [company.telepon, company.email].filter(Boolean).join('    ')
  if (contactLine) {
    pdf.text(contactLine, infoX, nextY)
    nextY += 3.5
  }

  // Bank info — matches print: inline on same line, 9pt
  let bankY = nextY
  if (company.bankName || company.bankName2) {
    pdf.setFontSize(6.5)
    pdf.setTextColor(0, 0, 0)
    const bankParts: string[] = []
    if (company.bankName) {
      bankParts.push(`${company.bankName} ${company.bankAccount} a.n. ${company.bankHolder}`)
    }
    if (company.bankName2) {
      bankParts.push(`${company.bankName2} ${company.bankAccount2} a.n. ${company.bankHolder2}`)
    }
    pdf.text(bankParts.join('   '), infoX, bankY)
    bankY += 3.5
  }

  // Title (right side) — matches print: 12pt bold black
  const rightX = pageW - m
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text(title, rightX, y + 5, { align: 'right' })

  if (subtitle) {
    pdf.setFontSize(6.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(0, 0, 0) // print forces black
    pdf.text(subtitle, rightX, y + 9.5, { align: 'right' })
  }

  // Jatuh Tempo — matches print: shown in header area (right side, below title), black text
  if (jatuhTempo) {
    const jtY = subtitle ? y + 14 : y + 10
    pdf.setFontSize(6.5)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(0, 0, 0) // print forces black
    pdf.text(`Jatuh Tempo: ${fmtDateShort(jatuhTempo)}`, rightX, jtY, { align: 'right' })
  }

  return Math.max(bankY, y + 20) + 2
}

/** Draw the 2px black divider line. Returns new Y. */
function drawDivider(pdf: jsPDF, m: number, pageW: number, y: number): number {
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.6)
  pdf.line(m, y, pageW - m, y)
  return y + 4
}

/** Draw recipient info (left) + doc details (right). Returns new Y. */
function drawRecipientBlock(
  pdf: jsPDF,
  opts: {
    m: number; pageW: number; y: number
    label: string      // e.g. "Kepada Yth :"
    recipient: { nama: string; kontak: string; alamat: string; jenisBarang?: string }
    docLabel: string    // e.g. "No. Invoice"
    docNumber: string
    dateLabel: string   // e.g. "Tanggal"
    dateValue: string
    referensi?: string  // optional Ref. field
  }
): number {
  const { m, pageW, y, label, recipient, docLabel, docNumber, dateLabel, dateValue, referensi } = opts

  // Left — recipient (print forces all text black)
  pdf.setFontSize(6.5)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text(label, m, y)

  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  let recipientY = y + 5
  pdf.text(recipient.nama || '-', m, recipientY)

  // jenisBarang — for Purchase Order (matches preview)
  if (recipient.jenisBarang) {
    recipientY += 3.5
    pdf.setFontSize(6.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(0, 0, 0)
    pdf.text(recipient.jenisBarang, m, recipientY)
  }

  if (recipient.kontak) {
    recipientY += 3.5
    pdf.setFontSize(6.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(0, 0, 0)
    pdf.text(recipient.kontak, m, recipientY)
  }
  if (recipient.alamat) {
    recipientY += 3.5
    pdf.setFontSize(6.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(0, 0, 0)
    pdf.text(recipient.alamat, m, recipientY)
  }

  // Right — doc details (print forces black)
  const rightX = pageW - m
  pdf.setFontSize(6.5)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(0, 0, 0)
  pdf.text(docLabel, rightX, y, { align: 'right' })

  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text(docNumber, rightX, y + 4, { align: 'right' })

  pdf.setFontSize(6.5)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(0, 0, 0)
  pdf.text(dateLabel, rightX, y + 8.5, { align: 'right' })

  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(0, 0, 0)
  pdf.text(dateValue, rightX, y + 12.5, { align: 'right' })

  // Referensi — matches preview: "Ref." label + value
  if (referensi) {
    pdf.setFontSize(6.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(0, 0, 0)
    pdf.text('Ref.', rightX, y + 16.5, { align: 'right' })

    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(0, 0, 0)
    pdf.text(referensi, rightX, y + 20, { align: 'right' })
  }

  // Calculate block height based on content
  const refExtra = referensi ? 8 : 0
  return y + 17 + refExtra
}

/** Draw items table with prices — matches preview with border-top/bottom header, no zebra, no outer border. Returns new Y. */
function drawItemsTableWithPrice(
  pdf: jsPDF,
  opts: {
    m: number; cw: number; y: number
    items: { deskripsi: string; qty: number; harga: number }[]
    maxRows: number
  }
): number {
  const { m, cw, y, items, maxRows } = opts
  const tableTop = y

  // Column widths — adjusted for A5
  const colQty = 14
  const colPrice = 24
  const colTotal = 30
  const colDesc = cw - colQty - colPrice - colTotal
  const minRowH = 6.5
  const lineH = 3.2
  const cellPad = 1.5

  // Pre-calculate each row's height based on description length
  const rows = [...items]
  while (rows.length < maxRows) {
    rows.push({ deskripsi: '', qty: 0, harga: 0 })
  }

  const rowHeights: number[] = rows.map((item, i) => {
    if (i >= items.length || !item.deskripsi) return minRowH
    const descLines = pdf.splitTextToSize(item.deskripsi, colDesc - cellPad * 2)
    const neededH = Math.max(minRowH, 3 + descLines.length * lineH)
    return neededH
  })

  // Header — matches preview: border top/bottom, black text on white bg
  const headerH = minRowH
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.6)
  pdf.line(m, y, m + cw, y) // top border
  pdf.line(m, y + headerH, m + cw, y + headerH) // bottom border

  pdf.setFontSize(6.5)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text('Qty', m + colQty - cellPad, y + headerH - 2, { align: 'right' })
  pdf.text('Nama Barang', m + colQty + cellPad, y + headerH - 2)
  pdf.text('Harga Satuan', m + colQty + colDesc + colPrice - cellPad, y + headerH - 2, { align: 'right' })
  pdf.text('Jumlah', m + cw - cellPad, y + headerH - 2, { align: 'right' })

  let curY = y + headerH

  // Draw rows — no zebra striping, all white bg (matches preview)
  rows.forEach((item, i) => {
    const hasData = i < items.length
    const rowH = rowHeights[i]

    // No background fill — matches preview (white bg, no zebra)

    if (hasData) {
      pdf.setTextColor(0, 0, 0)
      pdf.setFontSize(6.5)
      pdf.setFont('helvetica', 'normal')

      const textY = curY + 4

      // Qty — right aligned
      pdf.text(String(item.qty), m + colQty - cellPad, textY, { align: 'right' })

      // Description — multi-line support, left aligned
      const descLines = pdf.splitTextToSize(item.deskripsi || '', colDesc - cellPad * 2)
      pdf.text(descLines[0] || '', m + colQty + cellPad, textY)
      if (descLines.length > 1) {
        for (let li = 1; li < descLines.length; li++) {
          pdf.text(descLines[li], m + colQty + cellPad, textY + li * lineH)
        }
      }

      // Harga satuan — right aligned
      pdf.setFontSize(6.5)
      pdf.setFont('helvetica', 'normal')
      pdf.text(rp(item.harga), m + colQty + colDesc + colPrice - cellPad, textY, { align: 'right' })

      // Jumlah — right aligned, bold
      pdf.setFont('helvetica', 'bold')
      pdf.text(rp(item.qty * item.harga), m + cw - cellPad, textY, { align: 'right' })
    }
    curY += rowH
  })

  // No outer border — matches preview (no border around table)

  return curY + 3
}

/** Draw items table WITHOUT prices (for Surat Jalan) — matches preview. Returns new Y. */
function drawItemsTableNoPrice(
  pdf: jsPDF,
  opts: {
    m: number; cw: number; y: number
    items: { deskripsi: string; qty: number }[]
    maxRows: number
  }
): number {
  const { m, cw, y, items, maxRows } = opts
  const tableTop = y

  const colQty = 14
  const colDesc = cw - colQty
  const minRowH = 6.5
  const lineH = 3.2
  const cellPad = 1.5

  // Pre-calculate each row's height based on description length
  const rows = [...items]
  while (rows.length < maxRows) {
    rows.push({ deskripsi: '', qty: 0 })
  }

  const rowHeights: number[] = rows.map((item, i) => {
    if (i >= items.length || !item.deskripsi) return minRowH
    const descLines = pdf.splitTextToSize(item.deskripsi, colDesc - cellPad * 2)
    const neededH = Math.max(minRowH, 3 + descLines.length * lineH)
    return neededH
  })

  // Header — matches preview: border top/bottom, black text on white bg
  const headerH = minRowH
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.6)
  pdf.line(m, y, m + cw, y) // top border
  pdf.line(m, y + headerH, m + cw, y + headerH) // bottom border

  pdf.setFontSize(6.5)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text('Qty', m + colQty - cellPad, y + headerH - 2, { align: 'right' })
  pdf.text('Nama Barang', m + colQty + cellPad, y + headerH - 2)

  let curY = y + headerH

  rows.forEach((item, i) => {
    const hasData = i < items.length
    const rowH = rowHeights[i]

    // No background fill — matches preview (white bg, no zebra)

    if (hasData) {
      pdf.setTextColor(0, 0, 0)
      pdf.setFontSize(6.5)
      pdf.setFont('helvetica', 'normal')

      const textY = curY + 4
      pdf.text(String(item.qty), m + colQty - cellPad, textY, { align: 'right' })

      const descLines = pdf.splitTextToSize(item.deskripsi || '', colDesc - cellPad * 2)
      pdf.text(descLines[0] || '', m + colQty + cellPad, textY)
      if (descLines.length > 1) {
        for (let li = 1; li < descLines.length; li++) {
          pdf.text(descLines[li], m + colQty + cellPad, textY + li * lineH)
        }
      }
    }
    curY += rowH
  })

  // No outer border — matches preview

  return curY + 3
}

/** Draw totals block (Subtotal, PPN, Total, DP, Sisa). Returns new Y. */
function drawTotals(
  pdf: jsPDF,
  opts: {
    m: number; pageW: number; y: number
    subtotal: number; ppnPercent: number; ppnAmount: number; total: number
    dp?: number  // down payment amount (calculated from percentage)
    dpPercent?: number  // down payment percentage
  }
): number {
  const { m, pageW, y, subtotal, ppnPercent, ppnAmount, total, dp = 0, dpPercent = 0 } = opts
  const rightX = pageW - m
  const totalsW = 58
  const labelX = rightX - totalsW
  const sisa = total - dp

  // Subtotal — print forces black
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(0, 0, 0)
  pdf.text('Subtotal', labelX, y)
  pdf.text(rp(subtotal), rightX, y, { align: 'right' })
  let curY = y + 4.5

  // PPN
  if (ppnPercent > 0) {
    pdf.text(`PPN (${ppnPercent}%)`, labelX, curY)
    pdf.text(rp(ppnAmount), rightX, curY, { align: 'right' })
    curY += 4.5
  }

  // Total line — matches print: 2px solid #000 border, then TOTAL + amount
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.5)
  pdf.line(labelX - 2, curY, rightX, curY)
  curY += 3.5

  pdf.setFontSize(8.5)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text('TOTAL', labelX, curY)
  pdf.setFontSize(9)
  pdf.text(rp(total), rightX, curY, { align: 'right' })
  curY += 5

  // DP (%) + Sisa Pembayaran — matches print exactly
  if (dp > 0) {
    // DP line
    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(0, 0, 0)
    pdf.text(`DP (${dpPercent}%)`, labelX, curY)
    pdf.text(rp(dp), rightX, curY, { align: 'right' })
    curY += 4.5

    // Sisa Pembayaran line — matches print: 1px solid #000 border, bold
    pdf.setDrawColor(0, 0, 0)
    pdf.setLineWidth(0.3)
    pdf.line(labelX - 2, curY, rightX, curY)
    curY += 3.5

    pdf.setFontSize(8.5)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(0, 0, 0)
    pdf.text('SISA PEMBAYARAN', labelX, curY)
    pdf.setFontSize(9)
    pdf.text(rp(sisa), rightX, curY, { align: 'right' })
    curY += 5
  }

  return curY
}

/** Draw terbilang line. Returns new Y. */
function drawTerbilang(pdf: jsPDF, m: number, y: number, amount: number): number {
  pdf.setFontSize(6)
  pdf.setFont('helvetica', 'italic')
  pdf.setTextColor(0, 0, 0) // print forces black
  pdf.text(`Terbilang: ${terbilang(amount)} rupiah`, m, y)
  return y + 5
}

/** Draw catatan box. Returns new Y. */
function drawCatatan(pdf: jsPDF, m: number, cw: number, y: number, catatan: string): number {
  if (!catatan) return y

  // Split by explicit newlines first (whitespace-pre-wrap behavior)
  const paragraphs = catatan.split('\n')
  const allLines: string[] = []
  for (const para of paragraphs) {
    if (para === '') {
      allLines.push('')
    } else {
      const lines = pdf.splitTextToSize(para, cw - 4)
      allLines.push(...lines)
    }
  }

  const boxH = Math.max(10, 5 + allLines.length * 3.5 + 2)

  pdf.setFillColor(245, 245, 245)
  pdf.roundedRect(m, y, cw, boxH, 1, 1, 'F')

  pdf.setFontSize(6.5)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text('Catatan:', m + 2, y + 4)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6.5)
  pdf.text(allLines, m + 2, y + 7.5)

  return y + boxH + 3
}

/** Draw cara bayar row — matches print with icon-like styling. Returns new Y. */
function drawCaraBayar(
  pdf: jsPDF,
  opts: {
    m: number; cw: number; y: number
    caraPembayaran: string
    tanggalGiro?: string
  }
): number {
  const { m, cw, y, caraPembayaran, tanggalGiro } = opts
  if (!caraPembayaran) return y

  const methodLabel = caraPembayaran === 'cash' ? 'Cash' : caraPembayaran === 'transfer' ? 'Transfer' : 'Giro'

  // Small icon indicator (filled circle, like the preview's SVG icon)
  pdf.setFillColor(5, 150, 105) // emerald-600
  pdf.circle(m + 1.5, y + 2, 1.2, 'F')

  // Print forces all text black
  pdf.setFontSize(6.5)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(0, 0, 0)
  pdf.text('Cara Bayar:', m + 4, y + 3)

  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text(methodLabel.toUpperCase(), m + 24, y + 3)

  if (caraPembayaran === 'giro' && tanggalGiro) {
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(0, 0, 0)
    pdf.text(`(Tgl: ${fmtDateShort(tanggalGiro)})`, m + 36, y + 3)
  }

  return y + 6
}

/** Draw 2-column signatures. Returns new Y. */
function drawSignatures2Col(
  pdf: jsPDF,
  opts: {
    m: number; cw: number; y: number
    leftLabel: string; rightLabel: string
    gap?: number  // mm between label and line (default 20)
  }
): number {
  const { m, cw, y, leftLabel, rightLabel, gap = 20 } = opts
  const sigGap = 12
  const sigW = (cw - sigGap) / 2
  const sigL = m
  const sigR = m + sigW + sigGap

  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text(leftLabel, sigL + sigW / 2, y, { align: 'center' })
  pdf.text(rightLabel, sigR + sigW / 2, y, { align: 'center' })

  const lineY = y + gap
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.3)
  pdf.line(sigL + sigW * 0.15, lineY, sigL + sigW * 0.85, lineY)
  pdf.line(sigR + sigW * 0.15, lineY, sigR + sigW * 0.85, lineY)

  return lineY + 3
}

/** Draw 3-column signatures. Returns new Y. */
function drawSignatures3Col(
  pdf: jsPDF,
  opts: {
    m: number; cw: number; y: number
    labels: [string, string, string]
    gap?: number
  }
): number {
  const { m, cw, y, labels, gap = 20 } = opts
  const colGap = 6
  const colW = (cw - colGap * 2) / 3

  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)

  labels.forEach((label, i) => {
    const cx = m + i * (colW + colGap) + colW / 2
    pdf.text(label, cx, y, { align: 'center' })
  })

  const lineY = y + gap
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.3)
  labels.forEach((_, i) => {
    const cx = m + i * (colW + colGap)
    pdf.line(cx + colW * 0.15, lineY, cx + colW * 0.85, lineY)
  })

  return lineY + 3
}

/** Draw footer text — matches print (no www.darrellsoft.com, only disclaimer). */
function drawFooter(pdf: jsPDF, pageW: number, pageH: number, m: number = 12) {
  pdf.setFontSize(6)
  pdf.setFont('helvetica', 'italic')
  pdf.setTextColor(0, 0, 0) // print forces black
  pdf.text('Barang yang sudah dibeli tidak bisa ditukar/dikembalikan.', pageW / 2, pageH - m + 4, { align: 'center' })
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

  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const margin = 8
  const contentW = pageW - margin * 2
  let y = margin

  const checkPage = (needed: number) => {
    const pageH = pdf.internal.pageSize.getHeight()
    if (y + needed > pageH - margin) { pdf.addPage(); y = margin }
  }

  // ========== HEADER ==========
  pdf.setFontSize(16)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Potong Kertas', pageW / 2, y + 5, { align: 'center' })
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(100, 116, 139)
  const infoDate = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  pdf.text(`${customerName || '-'} · ${paperName || 'Custom'} · ${infoDate}`, pageW / 2, y + 10, { align: 'center' })
  y += 14

  pdf.setDrawColor(226, 232, 240); pdf.setLineWidth(0.5)
  pdf.line(margin, y, pageW - margin, y); y += 4

  // ========== INFO GRID ==========
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
  const cellH = 14; const cols = 3
  gridItems.forEach((item, idx) => {
    const col = idx % cols; const row = Math.floor(idx / cols)
    const cx = margin + col * (colW + 2); const cy = y + row * (cellH + 2)
    pdf.setFillColor(248, 250, 252); pdf.setDrawColor(226, 232, 240)
    pdf.roundedRect(cx, cy, colW, cellH, 1.5, 1.5, 'FD')
    pdf.setFontSize(7); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(item.color[0], item.color[1], item.color[2])
    pdf.text(item.label, cx + 2.5, cy + 4.5)
    pdf.setFontSize(12); pdf.setFont('helvetica', 'bold')
    pdf.text(item.value, cx + 2.5, cy + 10.5)
  })
  y += Math.ceil(gridItems.length / cols) * (cellH + 2) + 3

  // ========== STRATEGY ==========
  checkPage(10)
  pdf.setFillColor(238, 242, 255); pdf.setDrawColor(199, 210, 254)
  pdf.roundedRect(margin, y, contentW, 8, 1.5, 1.5, 'FD')
  pdf.setFontSize(7.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(55, 48, 163)
  pdf.text('Strategi Optimasi: ', pageW / 2 - 20, y + 5)
  pdf.text(r.strategy, pageW / 2 + 10, y + 5); y += 12

  // ========== CUTTING DIAGRAM ==========
  checkPage(60)
  pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(30, 41, 59)
  pdf.text('Diagram Potongan:', margin, y); y += 3
  const maxDiagramW = contentW; const maxDiagramH = 70
  const scale = Math.min(maxDiagramW / r.paperWidth, maxDiagramH / r.paperHeight)
  const diagramW = r.paperWidth * scale; const diagramH = r.paperHeight * scale
  const diagramX = margin + (contentW - diagramW) / 2
  pdf.setDrawColor(148, 163, 184); pdf.setLineWidth(0.3); pdf.setFillColor(241, 245, 249)
  pdf.rect(diagramX, y, diagramW, diagramH, 'FD')

  const blockColors: [number, number, number][] = [[147, 197, 253], [110, 231, 183], [252, 211, 77], [252, 165, 165], [196, 181, 253]]
  const blockBorderColors: [number, number, number][] = [[59, 130, 246], [16, 185, 129], [245, 158, 11], [239, 68, 68], [139, 92, 246]]

  r.blocks.forEach((block, bi) => {
    const bx = diagramX + block.x * scale; const by = y + block.y * scale
    const pieceW = block.pieceWidth * scale; const pieceH = block.pieceHeight * scale
    const fillC = blockColors[bi % 5]; const borderC = blockBorderColors[bi % 5]
    let num = 1
    for (let i = 0; i < block.horizontal; i++) {
      for (let j = 0; j < block.vertical; j++) {
        const px = bx + i * pieceW; const py = by + j * pieceH; const pw = pieceW - 0.3; const ph = pieceH - 0.3
        pdf.setFillColor(fillC[0], fillC[1], fillC[2]); pdf.setDrawColor(borderC[0], borderC[1], borderC[2]); pdf.setLineWidth(0.2)
        pdf.rect(px, py, pw, ph, 'FD')
        if (pw > 4 && ph > 4) {
          pdf.setFontSize(Math.min(7, Math.min(pw, ph) / 2.5)); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(71, 85, 105)
          pdf.text(String(num), px + pw / 2, py + ph / 2 + 0.5, { align: 'center' })
        }
        num++
      }
    }
    if (bi === 0 && r.cutPosition !== undefined) { pdf.setDrawColor(248, 113, 113); pdf.setLineWidth(0.5); pdf.line(diagramX + r.cutPosition * scale, y, diagramX + r.cutPosition * scale, y + diagramH) }
    if (bi === 0 && r.cutPositionY !== undefined) { pdf.setDrawColor(248, 113, 113); pdf.setLineWidth(0.5); pdf.line(diagramX, y + r.cutPositionY * scale, diagramX + diagramW, y + r.cutPositionY * scale) }
    if (block.wasteWidth > 0.01) { pdf.setFillColor(241, 245, 249); pdf.setDrawColor(203, 213, 225); pdf.setLineWidth(0.1); pdf.setLineDashPattern([1, 0.5], 0); pdf.rect(bx + block.usedWidth * scale, by, block.wasteWidth * scale, block.usedHeight * scale, 'FD'); pdf.setLineDashPattern([], 0) }
    if (block.wasteHeight > 0.01) { pdf.setFillColor(241, 245, 249); pdf.setDrawColor(203, 213, 225); pdf.setLineWidth(0.1); pdf.setLineDashPattern([1, 0.5], 0); pdf.rect(bx, by + block.usedHeight * scale, block.usedWidth * scale, block.wasteHeight * scale, 'FD'); pdf.setLineDashPattern([], 0) }
  })
  pdf.setDrawColor(148, 163, 184); pdf.setLineWidth(0.5); pdf.rect(diagramX, y, diagramW, diagramH, 'S')
  y += diagramH + 5

  // ========== STEPS & BLOCKS ==========
  checkPage(20)
  const halfW = (contentW - 4) / 2; const stepsX = margin; const blocksX = margin + halfW + 4
  pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(51, 65, 85)
  pdf.text('Cara Potong:', stepsX, y); pdf.text('Detail per Blok:', blocksX, y); y += 4
  const stepsStartY = y
  r.steps.forEach((step, idx) => {
    checkPage(8)
    pdf.setFillColor(37, 99, 235); pdf.circle(stepsX + 3, y + 1, 2.5, 'F')
    pdf.setFontSize(6); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(255, 255, 255)
    pdf.text(String(idx + 1), stepsX + 3, y + 1.5, { align: 'center' })
    pdf.setFontSize(7.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(71, 85, 105)
    const stepLines = pdf.splitTextToSize(step, halfW - 10)
    pdf.text(stepLines, stepsX + 8, y + 1.5); y += Math.max(5, stepLines.length * 3.5)
  })
  let by2 = stepsStartY
  r.blocks.forEach((block, idx) => {
    checkPage(12); const c = blockBorderColors[idx % 5]; const cFill = blockColors[idx % 5]
    pdf.setFillColor(cFill[0], cFill[1], cFill[2]); pdf.setDrawColor(c[0], c[1], c[2]); pdf.setLineWidth(0.2)
    pdf.roundedRect(blocksX, by2, halfW, 12, 1, 1, 'FD')
    pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(c[0], c[1], c[2])
    pdf.text(block.name, blocksX + 2.5, by2 + 4)
    pdf.setFontSize(6); pdf.text(`${block.pieces} pcs`, blocksX + halfW - 2.5, by2 + 4, { align: 'right' })
    pdf.setFontSize(7); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(c[0], c[1], c[2])
    pdf.text(`Ukuran: ${block.width.toFixed(1)}\u00D7${block.height.toFixed(1)}  Layout: ${block.horizontal}\u00D7${block.vertical}${block.rotated ? ' (90\u00B0)' : ''}`, blocksX + 2.5, by2 + 9)
    by2 += 14
  })

  // Footer
  const pageH = pdf.internal.pageSize.getHeight()
  pdf.setFontSize(6); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(148, 163, 184)
  pdf.text('www.darrellsoft.com', pageW / 2, pageH - 1.5, { align: 'center' })
  pdf.setTextColor(0, 0, 0)
  return pdf.output('blob')
}

// ============================================================
// Invoice PDF — matches InvoicePreview exactly
// ============================================================

export async function generateInvoicePdf(data: InvoiceData): Promise<Blob> {
  const { jsPDF } = await import('jspdf')

  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a5' })
  const pageW = pdf.internal.pageSize.getWidth()  // 148
  const pageH = pdf.internal.pageSize.getHeight() // 210
  const m = 12
  const cw = pageW - m * 2
  let y = m

  const subtotal = data.items.reduce((sum, item) => sum + item.qty * item.harga, 0)
  const ppnAmount = subtotal * (data.ppn / 100)
  const total = subtotal + ppnAmount
  const dpPercent = data.dp || 0
  // Priority: data.dpAmount (saved) > data.originalTotal * dpPercent > total * dpPercent
  const originalTotalForDp = data.originalTotal !== undefined ? data.originalTotal : total
  const dpAmount = data.dpAmount !== undefined ? data.dpAmount : originalTotalForDp * (dpPercent / 100)
  const sisa = total - dpAmount

  // ---- HEADER (with Jatuh Tempo in header area, matching print) ----
  y = drawDocHeader(pdf, {
    pageW, m, y, company: data.company, title: 'INVOICE',
    jatuhTempo: data.tanggalJatuhTempo || undefined,
  })

  // ---- DIVIDER ----
  y = drawDivider(pdf, m, pageW, y)

  // ---- CLIENT INFO + DOC DETAILS (with Ref.) ----
  y = drawRecipientBlock(pdf, {
    m, pageW, y,
    label: 'Kepada Yth :',
    recipient: data.client,
    docLabel: 'No. Invoice',
    docNumber: data.nomor,
    dateLabel: 'Tanggal',
    dateValue: fmtDate(data.tanggal),
    referensi: data.referensi || undefined,
  })

  // ---- CARA BAYAR ROW (matches print: separate row below client info) ----
  y = drawCaraBayar(pdf, {
    m, cw, y,
    caraPembayaran: data.caraPembayaran,
    tanggalGiro: data.tanggalGiro,
  })

  // ---- ITEMS TABLE ----
  y = drawItemsTableWithPrice(pdf, { m, cw, y, items: data.items, maxRows: 8 })

  // ---- TOTALS (with DP and Sisa Pembayaran) ----
  y = drawTotals(pdf, { m, pageW, y, subtotal, ppnPercent: data.ppn, ppnAmount, total, dp: dpAmount, dpPercent })

  // ---- TERBILANG (use sisa when DP > 0, matches print) ----
  y = drawTerbilang(pdf, m, y, dpPercent > 0 ? sisa : total)

  // ---- CATATAN ----
  y = drawCatatan(pdf, m, cw, y, data.catatan)

  // ---- SIGNATURES (2 col — Diterima Oleh / Hormat Kami, matching print) ----
  y += 3
  y = drawSignatures2Col(pdf, {
    m, cw, y,
    leftLabel: 'Diterima Oleh',
    rightLabel: 'Hormat Kami',
    gap: 22,
  })

  // ---- FOOTER ----
  drawFooter(pdf, pageW, pageH, m)

  pdf.setTextColor(0, 0, 0)
  return pdf.output('blob')
}

// ============================================================
// Purchase Order PDF — matches PurchaseOrderPreview exactly
// ============================================================

export async function generatePurchaseOrderPdf(data: PurchaseOrderData): Promise<Blob> {
  const { jsPDF } = await import('jspdf')

  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a5' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const m = 12
  const cw = pageW - m * 2
  let y = m

  const subtotal = data.items.reduce((sum, item) => sum + item.qty * item.harga, 0)
  const ppnAmount = subtotal * (data.ppn / 100)
  const total = subtotal + ppnAmount

  // ---- HEADER (with Jatuh Tempo) ----
  y = drawDocHeader(pdf, {
    pageW, m, y, company: data.company, title: 'PURCHASE ORDER', subtitle: 'Pesanan Pembelian',
    jatuhTempo: data.tanggalJatuhTempo || undefined,
  })

  // ---- DIVIDER ----
  y = drawDivider(pdf, m, pageW, y)

  // ---- PEMASOK INFO + DOC DETAILS (with jenisBarang + Ref.) ----
  y = drawRecipientBlock(pdf, {
    m, pageW, y,
    label: 'KEPADA YTH :',
    recipient: {
      nama: data.pemasok.nama,
      jenisBarang: data.pemasok.jenisBarang,
      kontak: data.pemasok.kontak,
      alamat: data.pemasok.alamat,
    },
    docLabel: 'No. PO',
    docNumber: data.nomor,
    dateLabel: 'Tanggal',
    dateValue: fmtDate(data.tanggal),
    referensi: data.referensi || undefined,
  })

  // ---- ITEMS TABLE ----
  y = drawItemsTableWithPrice(pdf, { m, cw, y, items: data.items, maxRows: 10 })

  // ---- TOTALS ----
  y = drawTotals(pdf, { m, pageW, y, subtotal, ppnPercent: data.ppn, ppnAmount, total })

  // ---- TERBILANG ----
  y = drawTerbilang(pdf, m, y, total)

  // ---- CATATAN ----
  y = drawCatatan(pdf, m, cw, y, data.catatan)

  // ---- SIGNATURES (3 col — Toko / Diketahui / Disetujui Oleh, matching preview order) ----
  y += 3
  y = drawSignatures3Col(pdf, {
    m, cw, y,
    labels: ['Toko', 'Diketahui', 'Disetujui Oleh'],
    gap: 22,
  })

  // ---- FOOTER ----
  drawFooter(pdf, pageW, pageH, m)

  pdf.setTextColor(0, 0, 0)
  return pdf.output('blob')
}

// ============================================================
// Surat Jalan PDF — matches SuratJalanPreview exactly
// ============================================================

export async function generateSuratJalanPdf(data: SuratJalanData): Promise<Blob> {
  const { jsPDF } = await import('jspdf')

  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a5' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const m = 12
  const cw = pageW - m * 2
  let y = m

  // ---- HEADER ----
  y = drawDocHeader(pdf, { pageW, m, y, company: data.company, title: 'SURAT JALAN', subtitle: 'Pengiriman Barang' })

  // ---- DIVIDER ----
  y = drawDivider(pdf, m, pageW, y)

  // ---- PENERIMA INFO + DOC DETAILS (with Ref.) ----
  // Label "Kepada Yth :" — matches preview
  y = drawRecipientBlock(pdf, {
    m, pageW, y,
    label: 'Kepada Yth :',
    recipient: data.penerima,
    docLabel: 'No. Surat Jalan',
    docNumber: data.nomor,
    dateLabel: 'Tanggal',
    dateValue: fmtDate(data.tanggal),
    referensi: data.referensi || undefined,
  })

  // ---- VEHICLE INFO ----
  // Matches preview: flex gap-6, label + value
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(97, 97, 97)
  pdf.text('No. Kendaraan', m, y)
  pdf.text('Pengemudi', m + 55, y)
  y += 4
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text(data.noKendaraan || '-', m, y)
  pdf.text(data.pengemudi || '-', m + 55, y)
  y += 7

  // ---- ITEMS TABLE (no prices) ----
  y = drawItemsTableNoPrice(pdf, { m, cw, y, items: data.items, maxRows: 10 })

  // ---- CATATAN ----
  y = drawCatatan(pdf, m, cw, y, data.catatan)

  // ---- SIGNATURES (2 col — Penerima / Pengirim, matching preview order) ----
  y += 3
  y = drawSignatures2Col(pdf, {
    m, cw, y,
    leftLabel: 'Penerima',
    rightLabel: 'Pengirim',
    gap: 35,  // matches marginBottom: '3.5rem' in preview
  })

  // ---- FOOTER ----
  drawFooter(pdf, pageW, pageH, m)

  pdf.setTextColor(0, 0, 0)
  return pdf.output('blob')
}

// ============================================================
// Share via WhatsApp
// ============================================================

export async function sharePdfViaWhatsApp(
  blob: Blob,
  fileName: string,
  documentLabel: string,
  waWindowRef?: React.MutableRefObject<Window | null>
): Promise<void> {
  if (!blob || !(blob instanceof Blob)) {
    throw new Error('Invalid blob: PDF generation may have failed')
  }

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

  // ===== MOBILE: Share PDF file directly to WhatsApp via Web Share API =====
  if (isMobile && navigator.share && navigator.canShare) {
    const file = new File([blob], fileName, { type: 'application/pdf' })
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          text: `Dokumen ${documentLabel} - www.darrellsoft.com`,
        })
        return
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return
        // Fall through to download + open WhatsApp
      }
    }
  }

  // ===== DESKTOP / FALLBACK: Download PDF + open WhatsApp app =====
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 5000)

  await new Promise(resolve => setTimeout(resolve, 500))

  const msg = `Dokumen ${documentLabel} dalam format PDF sudah diunduh. Silakan lampirkan file PDF tersebut.`
  const encoded = encodeURIComponent(msg)

  const { openWhatsApp } = await import('@/lib/whatsapp-business')
  openWhatsApp(encoded, waWindowRef ? { waWindowRef } : undefined)
}

/** Download a PDF blob */
export function downloadPdf(blob: Blob, fileName: string): void {
  if (!blob || !(blob instanceof Blob)) { throw new Error('Invalid blob for download') }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = fileName; a.style.display = 'none'
  document.body.appendChild(a); a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 5000)
}

// ============================================================
// Generate JPG from PDF (hasil cetak) — A5 size
// ============================================================

/**
 * Generate a JPG image from a PDF blob at A5 resolution.
 * Renders the first page of the PDF to a canvas using pdfjs-dist,
 * then converts to JPG. This produces an image that matches
 * the print/cetak output exactly.
 *
 * A5 = 148mm × 210mm. At 2×150 DPI → ~1750 × 2480 px.
 */
export async function generateJpgFromPdf(pdfBlob: Blob): Promise<Blob> {
  const pdfjsLib = await import('pdfjs-dist')

  // Use the worker file copied to /public/pdf.worker.min.mjs
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const arrayBuffer = await pdfBlob.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
  const page = await pdf.getPage(1)

  // A5 at 2×150 DPI for high quality
  const A5_W_MM = 148
  const A5_H_MM = 210
  const DPI = 150
  const SCALE = 2
  const targetW = Math.round(A5_W_MM * DPI * SCALE / 25.4) // ~1750px
  const targetH = Math.round(A5_H_MM * DPI * SCALE / 25.4) // ~2480px

  // Calculate scale to fit A5 target size
  const viewport = page.getViewport({ scale: 1 })
  const scaleToTarget = Math.min(targetW / viewport.width, targetH / viewport.height)
  const scaledViewport = page.getViewport({ scale: scaleToTarget })

  // Create canvas and render
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(scaledViewport.width)
  canvas.height = Math.round(scaledViewport.height)
  const ctx = canvas.getContext('2d')!

  // Fill white background first
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  await page.render({
    canvasContext: ctx,
    viewport: scaledViewport,
  }).promise

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Failed to generate JPG from PDF'))
      },
      'image/jpeg',
      0.92
    )
  })
}

// ============================================================
// Generate JPG from preview DOM element (A5 size) — fallback
// ============================================================

/**
 * Capture a preview DOM element as a JPG image at A5 resolution.
 * Uses html-to-image (SVG foreignObject).
 *
 * A5 = 148mm × 210mm. At 150 DPI → 874 × 1240 px. We use 2x for quality.
 */
export async function generateJpgFromElement(element: HTMLElement): Promise<Blob> {
  const { toCanvas } = await import('html-to-image')

  // A5 dimensions in pixels at print DPI
  const A5_W_MM = 148
  const A5_H_MM = 210
  const PRINT_DPI = 96
  const a5WidthPx = Math.round(A5_W_MM * PRINT_DPI / 25.4)   // ~559px
  const a5HeightPx = Math.round(A5_H_MM * PRINT_DPI / 25.4)  // ~793px
  const marginPx = Math.round(12 * PRINT_DPI / 25.4)          // ~45px

  // Find the a5-preview-container parent (exists in editor, not in riwayat overlay)
  const previewContainer = element.closest('.a5-preview-container') as HTMLElement | null
  const previewScaler = element.closest('.a5-preview-scaler') as HTMLElement | null

  if (previewContainer) {
    // ===== CASE 1: Element is inside .a5-preview-container (editor mode) =====
    // Work on the actual element in the DOM for perfect style computation
    const origStyle = element.getAttribute('style') || ''
    const origClass = element.className
    const origContainerStyle = previewContainer.getAttribute('style') || ''
    const origScalerStyle = previewScaler?.getAttribute('style') || ''
    const origContainerClass = previewContainer.className
    const origScalerClass = previewScaler?.className || ''

    try {
      element.classList.add('print-mode')
      element.style.cssText = `
        box-shadow: none !important;
        border: none !important;
        border-radius: 0 !important;
        margin: 0 !important;
        background-color: #fff !important;
        width: 100% !important;
        overflow: hidden !important;
        padding: ${marginPx}px !important;
        box-sizing: border-box !important;
      `

      previewContainer.classList.add('print-mode')
      previewContainer.style.cssText = `
        position: fixed !important;
        left: 0 !important;
        top: 0 !important;
        width: ${a5WidthPx}px !important;
        height: ${a5HeightPx}px !important;
        max-width: ${a5WidthPx}px !important;
        max-height: ${a5HeightPx}px !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        overflow: hidden !important;
        background: white !important;
        z-index: 99999 !important;
      `

      if (previewScaler) {
        previewScaler.classList.add('print-mode')
        previewScaler.style.cssText = `
          width: 100% !important;
          height: 100% !important;
          overflow: hidden !important;
          transform: none !important;
          font-size: 10pt !important;
        `
      }

      await new Promise(resolve => setTimeout(resolve, 200))

      const CAPTURE_SCALE = 2
      const canvas = await toCanvas(previewContainer, {
        width: a5WidthPx,
        height: a5HeightPx,
        canvasWidth: a5WidthPx * CAPTURE_SCALE,
        canvasHeight: a5HeightPx * CAPTURE_SCALE,
        backgroundColor: '#ffffff',
        pixelRatio: 1,
      })

      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => { if (blob) resolve(blob); else reject(new Error('Failed to generate JPG')) },
          'image/jpeg', 0.92
        )
      })
    } finally {
      element.setAttribute('style', origStyle)
      element.className = origClass
      previewContainer.setAttribute('style', origContainerStyle)
      previewContainer.className = origContainerClass
      if (previewScaler) {
        previewScaler.setAttribute('style', origScalerStyle)
        previewScaler.className = origScalerClass
      }
    }
  } else {
    // ===== CASE 2: No .a5-preview-container (riwayat overlay) =====
    // Work on the actual element in the DOM for perfect style computation.
    // The element is inside a scaled container in the riwayat overlay.
    // We temporarily restructure it to A5 size, capture, then restore.

    // Find the scale transform parent (the div with transform: scale(...))
    const scaleParent = element.parentElement
    const centeringParent = scaleParent?.parentElement

    // Save original styles
    const origElementStyle = element.getAttribute('style') || ''
    const origElementClass = element.className
    const origScaleParentStyle = scaleParent?.getAttribute('style') || ''
    const origScaleParentClass = scaleParent?.className || ''
    const origCenteringParentStyle = centeringParent?.getAttribute('style') || ''
    const origCenteringParentClass = centeringParent?.className || ''

    try {
      // Apply print-mode to the element
      element.classList.add('print-mode')
      element.style.cssText = `
        box-shadow: none !important;
        border: none !important;
        border-radius: 0 !important;
        margin: 0 !important;
        background-color: #fff !important;
        width: 100% !important;
        overflow: hidden !important;
        padding: ${marginPx}px !important;
        box-sizing: border-box !important;
      `

      // Set scale parent to A5 size, remove transform
      if (scaleParent) {
        scaleParent.classList.add('print-mode')
        scaleParent.style.cssText = `
          position: fixed !important;
          left: 0 !important;
          top: 0 !important;
          width: ${a5WidthPx}px !important;
          height: ${a5HeightPx}px !important;
          max-width: ${a5WidthPx}px !important;
          max-height: ${a5HeightPx}px !important;
          border: none !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          overflow: hidden !important;
          background: white !important;
          z-index: 99999 !important;
          transform: none !important;
          font-size: 10pt !important;
        `
      }

      // Make centering parent not interfere
      if (centeringParent) {
        centeringParent.style.cssText = `
          position: static !important;
          padding: 0 !important;
          margin: 0 !important;
        `
      }

      await new Promise(resolve => setTimeout(resolve, 200))

      const CAPTURE_SCALE = 2
      const captureTarget = scaleParent || element
      const canvas = await toCanvas(captureTarget, {
        width: a5WidthPx,
        height: a5HeightPx,
        canvasWidth: a5WidthPx * CAPTURE_SCALE,
        canvasHeight: a5HeightPx * CAPTURE_SCALE,
        backgroundColor: '#ffffff',
        pixelRatio: 1,
      })

      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => { if (blob) resolve(blob); else reject(new Error('Failed to generate JPG')) },
          'image/jpeg', 0.92
        )
      })
    } finally {
      element.setAttribute('style', origElementStyle)
      element.className = origElementClass
      if (scaleParent) {
        scaleParent.setAttribute('style', origScaleParentStyle)
        scaleParent.className = origScaleParentClass
      }
      if (centeringParent) {
        centeringParent.setAttribute('style', origCenteringParentStyle)
        centeringParent.className = origCenteringParentClass
      }
    }
  }
}

// ============================================================
// Generate PDF from DOM element (matches print output exactly)
// ============================================================

/**
 * Generate a PDF by capturing the actual DOM element as an image.
 * Temporarily applies `.print-mode` CSS and A5 dimensions to the element
 * so it renders identically to the browser's print output, then captures
 * it and embeds in a jsPDF A5 document.
 *
 * This approach works on the actual element in the DOM (not a clone)
 * when inside .a5-preview-container, ensuring perfect style computation.
 * Falls back to off-screen clone approach for standalone elements.
 */
export async function generatePdfFromElement(element: HTMLElement): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const { toCanvas } = await import('html-to-image')

  // A5 dimensions in pixels at print DPI
  const A5_W_MM = 148
  const A5_H_MM = 210
  const PRINT_DPI = 96
  const a5WidthPx = Math.round(A5_W_MM * PRINT_DPI / 25.4)   // ~559px
  const a5HeightPx = Math.round(A5_H_MM * PRINT_DPI / 25.4)  // ~793px
  const marginPx = Math.round(12 * PRINT_DPI / 25.4)          // ~45px

  // Find the a5-preview-container parent (exists in editor, not in riwayat overlay)
  const previewContainer = element.closest('.a5-preview-container') as HTMLElement | null
  const previewScaler = element.closest('.a5-preview-scaler') as HTMLElement | null

  let canvas: HTMLCanvasElement

  if (previewContainer) {
    // ===== CASE 1: Element is inside .a5-preview-container (editor mode) =====
    const origStyle = element.getAttribute('style') || ''
    const origClass = element.className
    const origContainerStyle = previewContainer.getAttribute('style') || ''
    const origScalerStyle = previewScaler?.getAttribute('style') || ''
    const origContainerClass = previewContainer.className
    const origScalerClass = previewScaler?.className || ''

    try {
      element.classList.add('print-mode')
      element.style.cssText = `
        box-shadow: none !important;
        border: none !important;
        border-radius: 0 !important;
        margin: 0 !important;
        background-color: #fff !important;
        width: 100% !important;
        overflow: hidden !important;
        padding: ${marginPx}px !important;
        box-sizing: border-box !important;
      `

      previewContainer.classList.add('print-mode')
      previewContainer.style.cssText = `
        position: fixed !important;
        left: 0 !important;
        top: 0 !important;
        width: ${a5WidthPx}px !important;
        height: ${a5HeightPx}px !important;
        max-width: ${a5WidthPx}px !important;
        max-height: ${a5HeightPx}px !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        overflow: hidden !important;
        background: white !important;
        z-index: 99999 !important;
      `

      if (previewScaler) {
        previewScaler.classList.add('print-mode')
        previewScaler.style.cssText = `
          width: 100% !important;
          height: 100% !important;
          overflow: hidden !important;
          transform: none !important;
          font-size: 10pt !important;
        `
      }

      await new Promise(resolve => setTimeout(resolve, 200))

      const CAPTURE_SCALE = 2
      canvas = await toCanvas(previewContainer, {
        width: a5WidthPx,
        height: a5HeightPx,
        canvasWidth: a5WidthPx * CAPTURE_SCALE,
        canvasHeight: a5HeightPx * CAPTURE_SCALE,
        backgroundColor: '#ffffff',
        pixelRatio: 1,
      })
    } finally {
      element.setAttribute('style', origStyle)
      element.className = origClass
      previewContainer.setAttribute('style', origContainerStyle)
      previewContainer.className = origContainerClass
      if (previewScaler) {
        previewScaler.setAttribute('style', origScalerStyle)
        previewScaler.className = origScalerClass
      }
    }
  } else {
    // ===== CASE 2: No .a5-preview-container (riwayat overlay) =====
    // Work on the actual element in the DOM for perfect style computation.
    const scaleParent = element.parentElement
    const centeringParent = scaleParent?.parentElement

    // Save original styles
    const origElementStyle = element.getAttribute('style') || ''
    const origElementClass = element.className
    const origScaleParentStyle = scaleParent?.getAttribute('style') || ''
    const origScaleParentClass = scaleParent?.className || ''
    const origCenteringParentStyle = centeringParent?.getAttribute('style') || ''
    const origCenteringParentClass = centeringParent?.className || ''

    try {
      // Apply print-mode to the element
      element.classList.add('print-mode')
      element.style.cssText = `
        box-shadow: none !important;
        border: none !important;
        border-radius: 0 !important;
        margin: 0 !important;
        background-color: #fff !important;
        width: 100% !important;
        overflow: hidden !important;
        padding: ${marginPx}px !important;
        box-sizing: border-box !important;
      `

      // Set scale parent to A5 size, remove transform
      if (scaleParent) {
        scaleParent.classList.add('print-mode')
        scaleParent.style.cssText = `
          position: fixed !important;
          left: 0 !important;
          top: 0 !important;
          width: ${a5WidthPx}px !important;
          height: ${a5HeightPx}px !important;
          max-width: ${a5WidthPx}px !important;
          max-height: ${a5HeightPx}px !important;
          border: none !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          overflow: hidden !important;
          background: white !important;
          z-index: 99999 !important;
          transform: none !important;
          font-size: 10pt !important;
        `
      }

      // Make centering parent not interfere
      if (centeringParent) {
        centeringParent.style.cssText = `
          position: static !important;
          padding: 0 !important;
          margin: 0 !important;
        `
      }

      await new Promise(resolve => setTimeout(resolve, 200))

      const CAPTURE_SCALE = 2
      const captureTarget = scaleParent || element
      canvas = await toCanvas(captureTarget, {
        width: a5WidthPx,
        height: a5HeightPx,
        canvasWidth: a5WidthPx * CAPTURE_SCALE,
        canvasHeight: a5HeightPx * CAPTURE_SCALE,
        backgroundColor: '#ffffff',
        pixelRatio: 1,
      })
    } finally {
      element.setAttribute('style', origElementStyle)
      element.className = origElementClass
      if (scaleParent) {
        scaleParent.setAttribute('style', origScaleParentStyle)
        scaleParent.className = origScaleParentClass
      }
      if (centeringParent) {
        centeringParent.setAttribute('style', origCenteringParentStyle)
        centeringParent.className = origCenteringParentClass
      }
    }
  }

  // Create A5 PDF and embed image
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a5' })
  const pageW = pdf.internal.pageSize.getWidth()  // 148
  const pageH = pdf.internal.pageSize.getHeight() // 210

  const imgData = canvas.toDataURL('image/jpeg', 0.92)
  pdf.addImage(imgData, 'JPEG', 0, 0, pageW, pageH)

  return pdf.output('blob')
}

/**
 * Share a JPG image via WhatsApp.
 * On mobile: uses Web Share API to share directly to WhatsApp.
 * On desktop: downloads the JPG and opens WhatsApp with a message.
 */
export async function shareJpgViaWhatsApp(
  blob: Blob,
  fileName: string,
  documentLabel: string,
  waWindowRef?: React.MutableRefObject<Window | null>
): Promise<void> {
  if (!blob || !(blob instanceof Blob)) {
    throw new Error('Invalid blob: JPG generation may have failed')
  }

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

  // ===== MOBILE: Share JPG file directly to WhatsApp via Web Share API =====
  if (isMobile && navigator.share && navigator.canShare) {
    const file = new File([blob], fileName, { type: 'image/jpeg' })
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          text: `${documentLabel} - www.darrellsoft.com`,
        })
        return
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return
        // Fall through to download + open WhatsApp
      }
    }
  }

  // ===== DESKTOP / FALLBACK: Download JPG + open WhatsApp app =====
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 5000)

  await new Promise(resolve => setTimeout(resolve, 500))

  const msg = `Dokumen ${documentLabel} dalam format gambar sudah diunduh. Silakan lampirkan file gambar tersebut.`
  const encoded = encodeURIComponent(msg)

  const { openWhatsApp } = await import('@/lib/whatsapp-business')
  openWhatsApp(encoded, waWindowRef ? { waWindowRef } : undefined)
}
