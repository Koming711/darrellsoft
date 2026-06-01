/**
 * Generate PDF using jsPDF directly (no html2canvas dependency)
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

  // Logo — try base64 image first, fallback to initial letter in black box
  const logoAdded = tryAddLogoImage(pdf, company.logo, logoX, logoY, logoSize)

  if (!logoAdded) {
    const companyInitial = (company.nama || 'C').charAt(0).toUpperCase()
    pdf.setFillColor(0, 0, 0)
    pdf.roundedRect(logoX, logoY, logoSize, logoSize, 1.2, 1.2, 'F')
    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(255, 255, 255)
    pdf.text(companyInitial, logoX + 6, logoY + 7.5, { align: 'center' })
  }

  const infoX = m + 15

  // Company name
  pdf.setTextColor(0, 0, 0)
  pdf.setFontSize(13)
  pdf.setFont('helvetica', 'bold')
  pdf.text(company.nama || '', infoX, y + 4)

  // Address
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(97, 97, 97)
  let nextY = y + 8.5
  if (company.alamat) {
    pdf.text(company.alamat, infoX, nextY)
    nextY += 4
  }

  // Telepon & Email
  const contactLine = [company.telepon, company.email].filter(Boolean).join('    ')
  if (contactLine) {
    pdf.text(contactLine, infoX, nextY)
    nextY += 4
  }

  // Bank info
  let bankY = nextY
  if (company.bankName) {
    pdf.setFontSize(7.5)
    pdf.setTextColor(97, 97, 97)
    const bank1 = `${company.bankName} ${company.bankAccount} a.n. ${company.bankHolder}`
    pdf.text(bank1, infoX, bankY)
    bankY += 3.5
  }
  if (company.bankName2) {
    pdf.setFontSize(7.5)
    pdf.setTextColor(97, 97, 97)
    const bank2 = `${company.bankName2} ${company.bankAccount2} a.n. ${company.bankHolder2}`
    pdf.text(bank2, infoX, bankY)
    bankY += 3.5
  }

  // Title (right side)
  const rightX = pageW - m
  pdf.setFontSize(14)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text(title, rightX, y + 5, { align: 'right' })

  if (subtitle) {
    pdf.setFontSize(7.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(97, 97, 97)
    pdf.text(subtitle, rightX, y + 9.5, { align: 'right' })
  }

  // Jatuh Tempo — matches preview: shown in header area (right side, below subtitle)
  if (jatuhTempo) {
    const jtY = subtitle ? y + 14 : y + 10
    pdf.setFontSize(7.5)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(180, 83, 9) // amber-700
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

  // Left — recipient
  pdf.setFontSize(7.5)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(97, 97, 97)
  pdf.text(label, m, y)

  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  let recipientY = y + 5
  pdf.text(recipient.nama || '-', m, recipientY)

  // jenisBarang — for Purchase Order (matches preview)
  if (recipient.jenisBarang) {
    recipientY += 3.5
    pdf.setFontSize(7.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(97, 97, 97)
    pdf.text(recipient.jenisBarang, m, recipientY)
  }

  if (recipient.kontak) {
    recipientY += 3.5
    pdf.setFontSize(7.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(97, 97, 97)
    pdf.text(recipient.kontak, m, recipientY)
  }
  if (recipient.alamat) {
    recipientY += 3.5
    pdf.setFontSize(7.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(97, 97, 97)
    pdf.text(recipient.alamat, m, recipientY)
  }

  // Right — doc details
  const rightX = pageW - m
  pdf.setFontSize(7.5)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(97, 97, 97)
  pdf.text(docLabel, rightX, y, { align: 'right' })

  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text(docNumber, rightX, y + 4, { align: 'right' })

  pdf.setFontSize(7.5)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(97, 97, 97)
  pdf.text(dateLabel, rightX, y + 8.5, { align: 'right' })

  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(0, 0, 0)
  pdf.text(dateValue, rightX, y + 12.5, { align: 'right' })

  // Referensi — matches preview: "Ref." label + value
  if (referensi) {
    pdf.setFontSize(7.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(97, 97, 97)
    pdf.text('Ref.', rightX, y + 16.5, { align: 'right' })

    pdf.setFontSize(9)
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

  pdf.setFontSize(7.5)
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
      pdf.setFontSize(7.5)
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
      pdf.setFontSize(7.5)
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

  pdf.setFontSize(7.5)
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
      pdf.setFontSize(7.5)
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

/** Draw totals block (Subtotal, PPN, Total). Returns new Y. */
function drawTotals(
  pdf: jsPDF,
  opts: {
    m: number; pageW: number; y: number
    subtotal: number; ppnPercent: number; ppnAmount: number; total: number
  }
): number {
  const { m, pageW, y, subtotal, ppnPercent, ppnAmount, total } = opts
  const rightX = pageW - m
  const totalsW = 58
  const labelX = rightX - totalsW

  // Subtotal
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(97, 97, 97)
  pdf.text('Subtotal', labelX, y)
  pdf.text(rp(subtotal), rightX, y, { align: 'right' })
  let curY = y + 4.5

  // PPN
  if (ppnPercent > 0) {
    pdf.text(`PPN (${ppnPercent}%)`, labelX, curY)
    pdf.text(rp(ppnAmount), rightX, curY, { align: 'right' })
    curY += 4.5
  }

  // Total line
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.5)
  pdf.line(labelX - 2, curY, rightX, curY)
  curY += 3.5

  pdf.setFontSize(9.5)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text('TOTAL', labelX, curY)
  pdf.setFontSize(10)
  pdf.text(rp(total), rightX, curY, { align: 'right' })

  return curY + 5
}

/** Draw terbilang line. Returns new Y. */
function drawTerbilang(pdf: jsPDF, m: number, y: number, total: number): number {
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'italic')
  pdf.setTextColor(97, 97, 97)
  pdf.text(`Terbilang: ${terbilang(total)} rupiah`, m, y)
  return y + 5
}

/** Draw catatan box. Returns new Y. */
function drawCatatan(pdf: jsPDF, m: number, cw: number, y: number, catatan: string): number {
  if (!catatan) return y

  const noteLines = pdf.splitTextToSize(catatan, cw - 4)
  const boxH = Math.max(10, 5 + noteLines.length * 3.5 + 2)

  pdf.setFillColor(245, 245, 245)
  pdf.roundedRect(m, y, cw, boxH, 1, 1, 'F')

  pdf.setFontSize(7.5)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text('Catatan:', m + 2, y + 4)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  pdf.text(noteLines, m + 2, y + 7.5)

  return y + boxH + 3
}

/** Draw cara bayar row — matches preview with icon-like styling. Returns new Y. */
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

  pdf.setFontSize(7.5)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(97, 97, 97)
  pdf.text('Cara Bayar:', m + 4, y + 3)

  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text(methodLabel.toUpperCase(), m + 24, y + 3)

  if (caraPembayaran === 'giro' && tanggalGiro) {
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(120, 120, 120)
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

  pdf.setFontSize(9)
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

  pdf.setFontSize(8)
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

/** Draw footer text — matches preview font size. */
function drawFooter(pdf: jsPDF, pageW: number, pageH: number) {
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'italic')
  pdf.setTextColor(120, 120, 120)
  pdf.text('Barang yang sudah dibeli tidak bisa ditukar/dikembalikan.', pageW / 2, pageH - 4, { align: 'center' })
  pdf.setFontSize(6)
  pdf.text('www.darrellsoft.com', pageW / 2, pageH - 1.5, { align: 'center' })
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
  const m = 10
  const cw = pageW - m * 2
  let y = m

  const subtotal = data.items.reduce((sum, item) => sum + item.qty * item.harga, 0)
  const ppnAmount = subtotal * (data.ppn / 100)
  const total = subtotal + ppnAmount

  // ---- HEADER (with Jatuh Tempo in header area, matching preview) ----
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

  // ---- CARA BAYAR ROW (matches preview: separate row below client info) ----
  y = drawCaraBayar(pdf, {
    m, cw, y,
    caraPembayaran: data.caraPembayaran,
    tanggalGiro: data.tanggalGiro,
  })

  // ---- ITEMS TABLE ----
  y = drawItemsTableWithPrice(pdf, { m, cw, y, items: data.items, maxRows: 8 })

  // ---- TOTALS ----
  y = drawTotals(pdf, { m, pageW, y, subtotal, ppnPercent: data.ppn, ppnAmount, total })

  // ---- TERBILANG ----
  y = drawTerbilang(pdf, m, y, total)

  // ---- CATATAN ----
  y = drawCatatan(pdf, m, cw, y, data.catatan)

  // ---- SIGNATURES (2 col — Diterima Oleh / Hormat Kami, matching preview) ----
  y += 3
  y = drawSignatures2Col(pdf, {
    m, cw, y,
    leftLabel: 'Diterima Oleh',
    rightLabel: 'Hormat Kami',
    gap: 22,
  })

  // ---- FOOTER ----
  drawFooter(pdf, pageW, pageH)

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
  const m = 10
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
  drawFooter(pdf, pageW, pageH)

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
  const m = 10
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
  pdf.setFontSize(9)
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
  drawFooter(pdf, pageW, pageH)

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
