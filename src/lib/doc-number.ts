import { db } from '@/lib/db'

/**
 * Generate the next sequential document number.
 * Uses MAX(existing numbers) + 1 so that deleted numbers are never reused.
 * Includes retry logic for race condition protection (unique constraint).
 * 
 * Format by prefix:
 *   PK: {prefix}/{MM}/{YY}/{NNNN} e.g. PK/05/26/0001
 *        Shared between riwayatPotongKertas AND riwayatCetakan (same counter)
 *   Others: {prefix}-{YYYYMM}-{NNNN} e.g. INV-202501-0001
 */

const SLASH_FORMAT_PREFIXES = ['PK']

function buildDatePrefix(prefix: string, year: number, month: string): string {
  if (SLASH_FORMAT_PREFIXES.includes(prefix)) {
    const yy = String(year).slice(-2)
    return `${prefix}/${month}/${yy}`
  }
  return `${prefix}-${year}${month}`
}

function parseLastSeq(number: string, prefix: string): number {
  if (SLASH_FORMAT_PREFIXES.includes(prefix)) {
    const parts = number.split('/')
    const lastNum = parseInt(parts[parts.length - 1], 10)
    return isNaN(lastNum) ? 0 : lastNum
  }
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

/**
 * Find the max sequence across both riwayatPotongKertas and riwayatCetakan
 * for the shared PK counter.
 */
async function findSharedMaxSeq(datePrefix: string, dataFilter: Record<string, any>): Promise<number> {
  let maxSeq = 0

  // Check riwayatPotongKertas
  const lastPK = await db.riwayatPotongKertas.findFirst({
    where: { ...dataFilter, nomorUrut: { startsWith: datePrefix } },
    orderBy: { nomorUrut: 'desc' },
  })
  if (lastPK) {
    const seq = parseLastSeq(lastPK.nomorUrut, 'PK')
    if (seq > maxSeq) maxSeq = seq
  }

  // Check riwayatCetakan
  const lastHC = await db.riwayatCetakan.findFirst({
    where: { ...dataFilter, nomorUrut: { startsWith: datePrefix } },
    orderBy: { nomorUrut: 'desc' },
  })
  if (lastHC) {
    const seq = parseLastSeq(lastHC.nomorUrut, 'PK')
    if (seq > maxSeq) maxSeq = seq
  }

  return maxSeq
}

/**
 * Verify a doc number doesn't exist in either table (for shared PK counter)
 */
async function verifySharedUnique(docNumber: string): Promise<boolean> {
  const inPK = await db.riwayatPotongKertas.findUnique({ where: { nomorUrut: docNumber } })
  if (inPK) return false
  const inHC = await db.riwayatCetakan.findUnique({ where: { nomorUrut: docNumber } })
  if (inHC) return false
  return true
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

  // Shared PK counter: check both tables
  if (prefix === 'PK') {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const maxSeq = await findSharedMaxSeq(datePrefix, dataFilter)
      const nextNum = maxSeq + 1
      const docNumber = buildDocNumber(datePrefix, nextNum, prefix)

      const isUnique = await verifySharedUnique(docNumber)
      if (isUnique) return docNumber

      console.warn(`[doc-number] Collision on ${docNumber}, retrying (attempt ${attempt + 1}/${maxRetries})`)
    }

    // Fallback
    const fallbackNum = Date.now().toString().slice(-6)
    const now2 = new Date()
    const fallbackPrefix = buildDatePrefix(prefix, now2.getFullYear(), String(now2.getMonth() + 1).padStart(2, '0'))
    return buildDocNumber(fallbackPrefix, parseInt(fallbackNum), prefix)
  }

  // Non-shared counter (INV, SJ, PO, HC)
  for (let attempt = 0; attempt < maxRetries; attempt++) {
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

    const existing = await (db[model] as any).findUnique({
      where: { [numberField]: docNumber },
    })

    if (!existing) return docNumber

    console.warn(`[doc-number] Collision on ${docNumber}, retrying (attempt ${attempt + 1}/${maxRetries})`)
  }

  // Fallback
  const fallbackNum = Date.now().toString().slice(-6)
  const now2 = new Date()
  const y2 = now2.getFullYear()
  const m2 = String(now2.getMonth() + 1).padStart(2, '0')
  const fallbackPrefix = buildDatePrefix(prefix, y2, m2)
  return buildDocNumber(fallbackPrefix, parseInt(fallbackNum), prefix)
}
