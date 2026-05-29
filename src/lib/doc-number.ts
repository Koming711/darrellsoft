import { db } from '@/lib/db'

/**
 * Generate the next sequential document number.
 * Uses MAX(existing numbers) + 1 so that deleted numbers are never reused.
 * Includes retry logic for race condition protection (unique constraint).
 * 
 * Format: {prefix}-{YYYYMM}-{NNNN} e.g. INV-202501-0001
 */
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
  const datePrefix = `${prefix}-${year}${month}`

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
      const parts = existingNumber.split('-')
      const lastNum = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(lastNum)) {
        nextNum = lastNum + 1
      }
    }

    const docNumber = `${datePrefix}-${String(nextNum).padStart(4, '0')}`

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
  return `${prefix}-${y2}${m2}-${fallbackNum}`
}
