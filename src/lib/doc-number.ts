import { db } from '@/lib/db'

/**
 * Generate the next sequential document number.
 * Uses MAX(existing numbers) + 1 so that deleted numbers are never reused.
 * Includes retry logic for race condition protection (unique constraint).
 * 
 * Format by prefix:
 *   PK: {prefix}/{MM}/{YY}/{NNNN} e.g. PK/05/26/0001
 *   HC: {prefix}/{MM}/{YY}/{NNNN} e.g. HC/05/26/0001
 *   Others: {prefix}-{YYYYMM}-{NNNN} e.g. INV-202501-0001
 */

const SLASH_FORMAT_PREFIXES = ['PK', 'HC']

function buildDatePrefix(prefix: string, year: number, month: string): string {
  if (SLASH_FORMAT_PREFIXES.includes(prefix)) {
    const yy = String(year).slice(-2)
    return `${prefix}/${month}/${yy}`
  }
  return `${prefix}-${year}${month}`
}

function parseLastSeq(number: string, prefix: string): number {
  if (SLASH_FORMAT_PREFIXES.includes(prefix)) {
    // Format: PREFIX/MM/YY/NNNN — last segment is the sequence
    const parts = number.split('/')
    const lastNum = parseInt(parts[parts.length - 1], 10)
    return isNaN(lastNum) ? 0 : lastNum
  }
  // Format: PREFIX-YYYYMM-NNNN — last segment after '-' is the sequence
  const parts = number.split('-')
  const lastNum = parseInt(parts[parts.length - 1], 10)
  return isNaN(lastNum) ? 0 : lastNum
}

function buildDocNumber(datePrefix: string, seq: number, prefix: string): string {
  if (SLASH_FORMAT_PREFIXES.includes(prefix)) {
    return `${datePrefix}/${String(seq).padStart(4, '0')}`
  }
  return `${datePrefix}-${String(seq).padStart(4, '0')}`
}

export async function generateDocNumber(
  model: 'invoice' | 'suratJalan' | 'purchaseOrder' | 'riwayatCetakan' | 'riwayatPotongKertas',
  numberField: 'invoiceNumber' | 'suratJalanNumber' | 'poNumber' | 'nomorUrut',
  prefix: 'INV' | 'SJ' | 'PO' | 'HC' | 'PK',
  dataFilter: Record<string, any>,
  maxRetries = 3
): Promise<string> {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const datePrefix = buildDatePrefix(prefix, year, month)

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Find the document with the highest number for this prefix
    const lastDoc = await (db[model] as any).findFirst({
      where: {
        ...dataFilter,
        [numberField]: { startsWith: datePrefix },
      },
      orderBy: { [numberField]: 'desc' },
    })

    let nextNum = 1
    if (lastDoc) {
      const existingNumber: string = lastDoc[numberField]
      const lastSeq = parseLastSeq(existingNumber, prefix)
      if (lastSeq > 0) {
        nextNum = lastSeq + 1
      }
    }

    const docNumber = buildDocNumber(datePrefix, nextNum, prefix)

    // Verify this number doesn't already exist (protect against race condition)
    const existing = await (db[model] as any).findUnique({
      where: { [numberField]: docNumber },
    })

    if (!existing) {
      return docNumber
    }

    // Number already taken (race condition) — retry
    console.warn(`[doc-number] Collision on ${docNumber}, retrying (attempt ${attempt + 1}/${maxRetries})`)
  }

  // Fallback: use timestamp-based suffix to guarantee uniqueness
  const fallbackNum = Date.now().toString().slice(-6)
  const now2 = new Date()
  const y2 = now2.getFullYear()
  const m2 = String(now2.getMonth() + 1).padStart(2, '0')
  const fallbackPrefix = buildDatePrefix(prefix, y2, m2)
  return buildDocNumber(fallbackPrefix, parseInt(fallbackNum), prefix)
}
