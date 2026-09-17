import { formatIDR, formatDate, formatNum, normalizePhone } from './format'
import { STATUS_LABEL, type Invoice } from './types'

/** Susun pesan WhatsApp untuk invoice (sadar-tipe: REGULER / DP / PELUNASAN) */
export function buildInvoiceWaMessage(inv: Invoice): string {
  if (inv.type === 'PELUNASAN' && inv.parent) {
    return buildSettlementWaMessage(inv)
  }

  const lines: string[] = []
  lines.push(`*INVOICE ${inv.number}*`)
  lines.push(`Tanggal: ${formatDate(inv.date)}`)
  if (inv.dueDate) lines.push(`Jatuh Tempo: ${formatDate(inv.dueDate)}`)
  lines.push('')
  lines.push(`Kepada Yth.`)
  lines.push(`*${inv.customer.name}*`)
  lines.push('')
  lines.push('Rincian:')
  inv.items.forEach((it, i) => {
    lines.push(
      `${i + 1}. ${it.description} — ${formatNum(it.qty)} ${it.unit} x ${formatIDR(it.price)} = *${formatIDR(it.lineTotal)}*`
    )
  })
  lines.push('')
  lines.push(`Subtotal: ${formatIDR(inv.subtotal)}`)
  if (inv.discount > 0) lines.push(`Diskon: -${formatIDR(inv.discount)}`)
  if (inv.taxRate > 0) lines.push(`Pajak (${formatNum(inv.taxRate)}%): ${formatIDR(inv.taxAmount)}`)
  lines.push(`*TOTAL: ${formatIDR(inv.total)}*`)
  if (inv.type === 'DP') {
    lines.push(`DP Dibayar: ${formatIDR(inv.dpAmount)}`)
    lines.push(`Sisa Tagihan: ${formatIDR(inv.sisa)}`)
  }
  lines.push('')
  lines.push(`Status: *${STATUS_LABEL[inv.status]}*`)
  if (inv.status === 'BELUM_BAYAR' && inv.dueDate) {
    lines.push('Mohon lakukan pembayaran sebelum jatuh tempo ya 🙏')
  }
  if (inv.notes) {
    lines.push('')
    lines.push(`Catatan: ${inv.notes}`)
  }
  lines.push('')
  lines.push('Terima kasih telah menjadi pelanggan kami 🙏')
  return lines.join('\n')
}

/** Pesan WhatsApp khusus invoice pelunasan (merujuk invoice DP induk) */
function buildSettlementWaMessage(inv: Invoice): string {
  const p = inv.parent
  if (!p) return buildInvoiceWaMessage({ ...inv, type: 'REGULER' })
  const lines: string[] = []
  lines.push(`*INVOICE PELUNASAN ${inv.number}*`)
  lines.push(`Tanggal: ${formatDate(inv.date)}`)
  if (inv.dueDate) lines.push(`Jatuh Tempo: ${formatDate(inv.dueDate)}`)
  lines.push('')
  lines.push(`Kepada Yth.`)
  lines.push(`*${inv.customer.name}*`)
  lines.push('')
  lines.push(`Pelunasan untuk Invoice DP *${p.number}*`)
  lines.push(`Total Pesanan: ${formatIDR(p.total)}`)
  lines.push(`Total DP: ${formatIDR(p.dpAmount)}`)
  lines.push(`Pelunasan: *${formatIDR(inv.paidAmount)}*`)
  lines.push(`Sisa Tagihan: ${formatIDR(inv.sisa)}`)
  lines.push('')
  lines.push(`Status: *${STATUS_LABEL[inv.status]}*`)
  if (inv.status === 'BELUM_BAYAR' && inv.dueDate) {
    lines.push('Mohon lakukan pembayaran sebelum jatuh tempo ya 🙏')
  }
  if (inv.notes) {
    lines.push('')
    lines.push(`Catatan: ${inv.notes}`)
  }
  lines.push('')
  lines.push('Terima kasih telah menjadi pelanggan kami 🙏')
  return lines.join('\n')
}

/** Bangun link wa.me. Jika nomor tidak valid, kembalikan link tanpa tujuan (pilih kontak manual). */
export function buildWaLink(inv: Invoice): { url: string; hasPhone: boolean; message: string } {
  const message = buildInvoiceWaMessage(inv)
  const phone = normalizePhone(inv.customer.phone)
  if (phone) {
    return { url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`, hasPhone: true, message }
  }
  return { url: `https://wa.me/?text=${encodeURIComponent(message)}`, hasPhone: false, message }
}

/** Bangun link mailto untuk berbagi invoice via email.
 * Body = versi teks polos dari pesan WhatsApp (tanpa markdown *bold*).
 * hasEmail = false berarti pelanggan belum punya email — link tetap bisa dibuka tanpa penerima. */
export function buildEmailLink(inv: Invoice): {
  url: string
  hasEmail: boolean
  subject: string
  body: string
} {
  let subject = `Invoice ${inv.number}`
  if (inv.status === 'LUNAS' || inv.sisa <= 0) {
    subject += ' - Lunas'
  } else if (inv.status === 'BELUM_BAYAR') {
    subject += ' - Sisa Tagihan'
  }
  const body = buildInvoiceWaMessage(inv).replace(/\*/g, '')
  // InvoiceCustomer tidak mendeklarasikan email — baca secara defensif
  const email = (inv.customer as Invoice['customer'] & { email?: string | null }).email ?? null
  const url = `mailto:${encodeURIComponent(email ?? '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  return { url, hasEmail: Boolean(email), subject, body }
}
